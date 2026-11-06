//! Kaynak ayrıştırmanın ölçümü: alanın standart ölçütleri (ölçü aleti; programın kendisi
//! kullanmaz, ayrıştırma yöntemleri bununla karşılaştırılır).
//!
//! - **SI-SDR** (ölçekten bağımsız SDR): Le Roux, Wisdom, Erdogan, Hershey, "SDR – half-baked or
//!   well done?", ICASSP 2019. Tahmin, asıl sesin en iyi ölçeklenmiş kopyasına göre ölçülür.
//! - **BSS Eval v4** görüntü ölçütleri, SDR, ISR, SIR, SAR: Vincent, Gribonval, Févotte,
//!   "Performance measurement in blind audio source separation", IEEE TASLP 2006; v4: Stöter,
//!   Liutkus, Ito, "The 2018 Signal Separation Evaluation Campaign", LVA/ICA 2018. SiSEC ve
//!   MUSDB18 sonuçlarının ölçütü budur. Tanım `museval` 0.4.1'deki (MIT) `bss_eval(...,
//!   compute_permutation=False, framewise_filters=False, bsseval_sources_version=False)` ile adım
//!   adım aynı: bozulma süzgeçleri (0..L−1 gecikme, en küçük kareler) bütün şarkı üzerinde bir kez
//!   bulunur, ölçütler pencere pencere hesaplanır. Testlerdeki başvuru değerleri museval'in
//!   kendisiyle hesaplandı.
//!
//! Sesler kaynak × kanal × örnek biçimindedir. Tahminler asıl sesin uzunluğuna kesilir ya da sonu
//! sıfırla doldurulur (museval `evaluate`, `padding=True`).

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

/// Kaynak × kanal × örnek.
pub type Sources = [Vec<Vec<f64>>];

/// Pencere, adım ve süzgeç uzunluğu (örnek).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BssConfig {
    pub window: usize,
    pub hop: usize,
    pub filters_len: usize,
}

impl BssConfig {
    /// museval `evaluate`'in ve SiSEC 2018'in değerleri: 1 sn pencere, örtüşmesiz, 512 gecikme
    /// (44,1 kHz'te).
    pub const MUSEVAL: Self = Self {
        window: 44_100,
        hop: 44_100,
        filters_len: 512,
    };
}

/// Bir kaynağın pencere başına ölçütleri (dB). Asıl seslerden ya da tahminlerden biri o pencerede
/// sessizse dördü de NaN; payda sıfırsa +∞.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct BssScores {
    pub sdr: Vec<f64>,
    pub isr: Vec<f64>,
    pub sir: Vec<f64>,
    pub sar: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SeparationEvalError {
    #[error("ses yok")]
    Empty,
    #[error("kaynak ya da kanal sayıları uyuşmuyor")]
    Shape,
    #[error("pencere ya da süzgeç uzunluğu sıfır")]
    Config,
}

/// SI-SDR (dB). Asıl ses sessizse NaN, tahmin asıl sesin tam ölçekli kopyasıysa +∞.
pub fn si_sdr(estimate: &[f64], reference: &[f64]) -> f64 {
    let n = estimate.len().min(reference.len());
    let (estimate, reference) = (&estimate[..n], &reference[..n]);
    let energy: f64 = reference.iter().map(|r| r * r).sum();
    if energy == 0.0 {
        return f64::NAN;
    }
    let alpha = dot(estimate, reference) / energy;
    let target = alpha * alpha * energy;
    let noise: f64 = estimate
        .iter()
        .zip(reference)
        .map(|(e, r)| (e - alpha * r).powi(2))
        .sum();
    safe_db(target, noise)
}

/// NaN olmayanların ortancası (SiSEC: şarkı başına pencere ölçütlerinin ortancası).
pub fn median_ignoring_nan(values: &[f64]) -> Option<f64> {
    let mut v: Vec<f64> = values.iter().copied().filter(|x| !x.is_nan()).collect();
    if v.is_empty() {
        return None;
    }
    v.sort_by(f64::total_cmp);
    let mid = v.len() / 2;
    Some(if v.len() % 2 == 1 {
        v[mid]
    } else {
        (v[mid - 1] + v[mid]) / 2.0
    })
}

/// Pencerelerin sınırları (museval `Framing`): pencere sesten kısaysa
/// ⌊(n − pencere + adım) / adım⌋ pencere, yoksa tek pencere.
pub fn frames(length: usize, window: usize, hop: usize) -> Vec<(usize, usize)> {
    let count = if window < length {
        (length - window + hop) / hop
    } else {
        1
    };
    (0..count)
        .map(|t| (t * hop, (t * hop + window).min(length)))
        .collect()
}

/// BSS Eval v4 görüntü ölçütleri, kaynak başına (kaynak sırası asıl seslerinki; eşleme aranmaz).
pub fn bss_eval_v4(
    references: &Sources,
    estimates: &Sources,
    config: BssConfig,
) -> Result<Vec<BssScores>, SeparationEvalError> {
    let nsrc = references.len();
    let nchan = references.first().map_or(0, Vec::len);
    let n = references
        .first()
        .and_then(|s| s.first())
        .map_or(0, Vec::len);
    if nsrc == 0 || nchan == 0 || n == 0 {
        return Err(SeparationEvalError::Empty);
    }
    if config.window == 0 || config.hop == 0 || config.filters_len == 0 {
        return Err(SeparationEvalError::Config);
    }
    let shape_ok = |s: &Sources| s.len() == nsrc && s.iter().all(|src| src.len() == nchan);
    if !shape_ok(references)
        || !shape_ok(estimates)
        || references.iter().flatten().any(|c| c.len() != n)
    {
        return Err(SeparationEvalError::Shape);
    }
    // Tahminler asıl sesin uzunluğuna.
    let estimates: Vec<Vec<Vec<f64>>> = estimates
        .iter()
        .map(|src| {
            src.iter()
                .map(|c| {
                    let mut c = c.clone();
                    c.resize(n, 0.0);
                    c
                })
                .collect()
        })
        .collect();

    let l = config.filters_len;
    let mut fft = Fft::new();
    // Bütün şarkı üzerinde bozulma süzgeçleri.
    let nfft = (n + l - 1).next_power_of_two();
    let ref_spectra: Vec<Vec<Complex<f64>>> = references
        .iter()
        .flatten()
        .map(|x| fft.forward(x, nfft))
        .collect();
    let gram = gram_matrix(&ref_spectra, nfft, l, &mut fft);
    let size = nsrc * nchan * l;
    let all = Lu::factor(regularized(&gram, size), size);
    // Kaynak j'nin kendi gecikmelerinin Gram'ı: büyük matrisin j bloğu.
    let block = nchan * l;
    let mut filters_all = Vec::with_capacity(nsrc);
    let mut filters_own = Vec::with_capacity(nsrc);
    for (j, est) in estimates.iter().enumerate() {
        let est_spectra: Vec<Vec<Complex<f64>>> =
            est.iter().map(|x| fft.forward(x, nfft)).collect();
        let d = cross_correlations(&ref_spectra, &est_spectra, l, &mut fft);
        filters_all.push(all.solve(&d, nchan));
        let own_gram = sub_block(&gram, size, j * block, block);
        let own = Lu::factor(regularized(&own_gram, block), block);
        let own_d: Vec<f64> = d[j * block * nchan..(j + 1) * block * nchan].to_vec();
        filters_own.push(own.solve(&own_d, nchan));
    }

    let mut scores = vec![BssScores::default(); nsrc];
    for (start, stop) in frames(n, config.window, config.hop) {
        let silent = |s: &[Vec<Vec<f64>>]| {
            s.iter()
                .any(|src| (start..stop).all(|i| src.iter().map(|c| c[i]).sum::<f64>() == 0.0))
        };
        if silent(references) || silent(&estimates) {
            for s in &mut scores {
                for v in [&mut s.sdr, &mut s.isr, &mut s.sir, &mut s.sar] {
                    v.push(f64::NAN);
                }
            }
            continue;
        }
        let wl = stop - start;
        let out_len = wl + l - 1;
        let wfft = out_len.next_power_of_two();
        let win_spectra: Vec<Vec<Complex<f64>>> = references
            .iter()
            .flatten()
            .map(|x| fft.forward(&x[start..stop], wfft))
            .collect();
        for j in 0..nsrc {
            let shape = ProjectionShape {
                nchan,
                l,
                wfft,
                out_len,
            };
            let proj_all = project(&win_spectra, &filters_all[j], &shape, &mut fft);
            let own = &win_spectra[j * nchan..(j + 1) * nchan];
            let proj_own = project(own, &filters_own[j], &shape, &mut fft);
            let (mut e_true, mut e_spat, mut e_interf, mut e_artif) = (0.0, 0.0, 0.0, 0.0);
            let (mut e_total, mut e_true_spat, mut e_sie) = (0.0, 0.0, 0.0);
            for c in 0..nchan {
                for i in 0..out_len {
                    let s_true = if i < wl {
                        references[j][c][start + i]
                    } else {
                        0.0
                    };
                    let est = if i < wl {
                        estimates[j][c][start + i]
                    } else {
                        0.0
                    };
                    let spat = proj_own[c][i] - s_true;
                    let interf = proj_all[c][i] - proj_own[c][i];
                    let artif = est - proj_all[c][i];
                    e_true += s_true * s_true;
                    e_spat += spat * spat;
                    e_interf += interf * interf;
                    e_artif += artif * artif;
                    e_total += (spat + interf + artif).powi(2);
                    e_true_spat += (s_true + spat).powi(2);
                    e_sie += (s_true + spat + interf).powi(2);
                }
            }
            let s = &mut scores[j];
            s.sdr.push(safe_db(e_true, e_total));
            s.isr.push(safe_db(e_true, e_spat));
            s.sir.push(safe_db(e_true_spat, e_interf));
            s.sar.push(safe_db(e_sie, e_artif));
        }
    }
    Ok(scores)
}

/// 10·log10(pay / payda); payda sıfırsa +∞ (museval `_safe_db`).
fn safe_db(num: f64, den: f64) -> f64 {
    if den == 0.0 {
        return f64::INFINITY;
    }
    10.0 * (num / den).log10()
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// Gram + ε·I (museval: `G + eps * eye`, ε = makine epsilonu).
fn regularized(gram: &[f64], size: usize) -> Vec<f64> {
    let mut a = gram.to_vec();
    for i in 0..size {
        a[i * size + i] += f64::EPSILON;
    }
    a
}

fn sub_block(a: &[f64], size: usize, offset: usize, block: usize) -> Vec<f64> {
    let mut out = Vec::with_capacity(block * block);
    for r in 0..block {
        let row = (offset + r) * size + offset;
        out.extend_from_slice(&a[row..row + block]);
    }
    out
}

struct Fft {
    planner: FftPlanner<f64>,
}

impl Fft {
    fn new() -> Self {
        Self {
            planner: FftPlanner::new(),
        }
    }

    fn forward(&mut self, x: &[f64], nfft: usize) -> Vec<Complex<f64>> {
        let mut buf: Vec<Complex<f64>> = x.iter().map(|&v| Complex::new(v, 0.0)).collect();
        buf.resize(nfft, Complex::new(0.0, 0.0));
        self.planner.plan_fft_forward(nfft).process(&mut buf);
        buf
    }

    /// Ters dönüşümün gerçek kısmı, 1/nfft ölçekli.
    fn inverse_real(&mut self, mut buf: Vec<Complex<f64>>) -> Vec<f64> {
        let nfft = buf.len();
        self.planner.plan_fft_inverse(nfft).process(&mut buf);
        let scale = 1.0 / nfft as f64;
        buf.iter().map(|c| c.re * scale).collect()
    }
}

/// r[d] = Σ_m a[m]·b[m + d] (−L < d < L); `nfft` dizinlerinde (negatif d sondan).
fn correlation(a: &[Complex<f64>], b: &[Complex<f64>], fft: &mut Fft) -> Vec<f64> {
    fft.inverse_real(b.iter().zip(a).map(|(y, x)| y * x.conj()).collect())
}

/// Gecikmeli asıl seslerin Gram matrisi: G[(u,p),(v,q)] = ⟨x_u(· − p), x_v(· − q)⟩ = r_uv[p − q];
/// u = kaynak·kanal sırası, p, q = 0..L−1.
fn gram_matrix(spectra: &[Vec<Complex<f64>>], nfft: usize, l: usize, fft: &mut Fft) -> Vec<f64> {
    let k = spectra.len();
    let size = k * l;
    let mut g = vec![0.0; size * size];
    for u in 0..k {
        for v in u..k {
            let r = correlation(&spectra[u], &spectra[v], fft);
            let at = |d: isize| r[d.rem_euclid(nfft as isize) as usize];
            for p in 0..l {
                for q in 0..l {
                    let value = at(p as isize - q as isize);
                    g[(u * l + p) * size + v * l + q] = value;
                    g[(v * l + q) * size + u * l + p] = value;
                }
            }
        }
    }
    g
}

/// D[(u,k), c] = ⟨x_u(· − k), tahmin_c⟩ = Σ_m x_u[m]·tahmin_c[m + k]; satır düzeni (u, k), sütun c.
fn cross_correlations(
    refs: &[Vec<Complex<f64>>],
    est: &[Vec<Complex<f64>>],
    l: usize,
    fft: &mut Fft,
) -> Vec<f64> {
    let nchan = est.len();
    let mut d = vec![0.0; refs.len() * l * nchan];
    for (u, r) in refs.iter().enumerate() {
        for (c, e) in est.iter().enumerate() {
            let corr = correlation(r, e, fft);
            for k in 0..l {
                d[(u * l + k) * nchan + c] = corr[k];
            }
        }
    }
    d
}

/// İzdüşümün boyutları: kanal sayısı, süzgeç uzunluğu, FFT boyu ve çıkış uzunluğu.
#[derive(Clone, Copy)]
struct ProjectionShape {
    nchan: usize,
    l: usize,
    wfft: usize,
    out_len: usize,
}

/// Süzgeçlerle izdüşüm: çıkış_c[i] = Σ_u Σ_k C[(u,k), c]·x_u[i − k], i < `out_len`; `spectra`
/// kaynak·kanal sırasıyla gecikmesi alınan asıl sesler.
fn project(
    spectra: &[Vec<Complex<f64>>],
    filters: &[f64],
    shape: &ProjectionShape,
    fft: &mut Fft,
) -> Vec<Vec<f64>> {
    let ProjectionShape {
        nchan,
        l,
        wfft,
        out_len,
    } = *shape;
    (0..nchan)
        .map(|c| {
            let mut acc = vec![Complex::new(0.0, 0.0); wfft];
            for (u, x) in spectra.iter().enumerate() {
                let taps: Vec<f64> = (0..l).map(|k| filters[(u * l + k) * nchan + c]).collect();
                let h = fft.forward(&taps, wfft);
                for ((a, xs), hs) in acc.iter_mut().zip(x).zip(&h) {
                    *a += xs * hs;
                }
            }
            let mut y = fft.inverse_real(acc);
            y.truncate(out_len);
            y
        })
        .collect()
}

/// Kısmi sıralı LU ayrıştırması (numpy `linalg.solve` gibi).
struct Lu {
    a: Vec<f64>,
    pivots: Vec<usize>,
    size: usize,
}

impl Lu {
    fn factor(mut a: Vec<f64>, size: usize) -> Self {
        let mut pivots = Vec::with_capacity(size);
        for k in 0..size {
            let mut best = k;
            for r in k + 1..size {
                if a[r * size + k].abs() > a[best * size + k].abs() {
                    best = r;
                }
            }
            pivots.push(best);
            if best != k {
                for c in 0..size {
                    a.swap(k * size + c, best * size + c);
                }
            }
            let pivot = a[k * size + k];
            if pivot == 0.0 {
                continue;
            }
            for r in k + 1..size {
                let factor = a[r * size + k] / pivot;
                a[r * size + k] = factor;
                if factor != 0.0 {
                    for c in k + 1..size {
                        a[r * size + c] -= factor * a[k * size + c];
                    }
                }
            }
        }
        Self { a, pivots, size }
    }

    /// A·X = B; B satır düzeninde `size × nrhs`.
    fn solve(&self, b: &[f64], nrhs: usize) -> Vec<f64> {
        let n = self.size;
        let mut x = b.to_vec();
        for (k, &p) in self.pivots.iter().enumerate() {
            if p != k {
                for c in 0..nrhs {
                    x.swap(k * nrhs + c, p * nrhs + c);
                }
            }
        }
        for r in 0..n {
            for k in 0..r {
                let f = self.a[r * n + k];
                if f != 0.0 {
                    for c in 0..nrhs {
                        x[r * nrhs + c] -= f * x[k * nrhs + c];
                    }
                }
            }
        }
        for r in (0..n).rev() {
            for k in r + 1..n {
                let f = self.a[r * n + k];
                if f != 0.0 {
                    for c in 0..nrhs {
                        x[r * nrhs + c] -= f * x[k * nrhs + c];
                    }
                }
            }
            let pivot = self.a[r * n + r];
            for c in 0..nrhs {
                x[r * nrhs + c] /= pivot;
            }
        }
        x
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Python ile aynı tamsayı üreteci (PCG'nin LCG adımı): museval başvuru betiği bit bit aynı
    /// sinyali üretir.
    fn noise(seed: u64, n: usize) -> Vec<f64> {
        let mut s = seed;
        (0..n)
            .map(|_| {
                s = s
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                (s >> 11) as f64 / (1u64 << 53) as f64 - 0.5
            })
            .collect()
    }

    fn delay(x: &[f64], d: usize) -> Vec<f64> {
        let mut y = vec![0.0; x.len()];
        y[d..].copy_from_slice(&x[..x.len() - d]);
        y
    }

    /// İki kaynak, iki kanal, 6000 örnek: s0 gürültü, s1 sinüs. Tahmin 0: süzülmüş s0 (0,8·s0 +
    /// 0,3·s0 iki örnek gecikmeli) + 0,1·s1 sızıntı + 0,05 yapay gürültü; tahmin 1: 0,9·s1 + öbür
    /// kanaldaki s0'dan 0,2 + 0,02 gürültü.
    /// Kaynak × kanal × örnek, sahipli.
    type Owned = Vec<Vec<Vec<f64>>>;

    fn museval_case() -> (Owned, Owned) {
        let n = 6000;
        let s0: Vec<Vec<f64>> = (0..2).map(|c| noise(1 + c, n)).collect();
        let s1: Vec<Vec<f64>> = (0..2)
            .map(|c| {
                (0..n)
                    .map(|i| (2.0 * std::f64::consts::PI * 0.0371 * i as f64 + c as f64).sin())
                    .collect()
            })
            .collect();
        let e0: Vec<Vec<f64>> = (0..2)
            .map(|c| {
                let late = delay(&s0[c], 2);
                let art = noise(10 + c as u64, n);
                (0..n)
                    .map(|i| 0.8 * s0[c][i] + 0.3 * late[i] + 0.1 * s1[c][i] + 0.05 * art[i])
                    .collect()
            })
            .collect();
        let e1: Vec<Vec<f64>> = (0..2)
            .map(|c| {
                let art = noise(20 + c as u64, n);
                (0..n)
                    .map(|i| 0.9 * s1[c][i] + 0.2 * s0[1 - c][i] + 0.02 * art[i])
                    .collect()
            })
            .collect();
        (vec![s0, s1], vec![e0, e1])
    }

    fn assert_close(got: &[f64], want: &[f64], what: &str) {
        assert_eq!(got.len(), want.len(), "{what}");
        for (g, w) in got.iter().zip(want) {
            assert!((g - w).abs() < 1e-6, "{what}: {g} ≠ {w}");
        }
    }

    #[test]
    fn bss_eval_v4_museval_ile_ayni() {
        // Başvuru: museval 0.4.1 `metrics.bss_eval(refs, ests, window=2000, hop=2000,
        // filters_len=16, framewise_filters=False, bsseval_sources_version=False,
        // compute_permutation=False)`; aynı sinyaller Python'da aynı üreteçle üretildi.
        let (refs, ests) = museval_case();
        let config = BssConfig {
            window: 2000,
            hop: 2000,
            filters_len: 16,
        };
        let scores = bss_eval_v4(&refs, &ests, config).unwrap();
        let want = [
            (
                [7.160550554172351, 7.103831179554745, 7.164573158585763],
                [8.862990230438628, 8.766607478781287, 8.923828610233073],
                [10.784407987129725, 10.718960619344628, 10.857145890917755],
                [24.446028169701776, 23.777060659882146, 24.442868310925867],
            ),
            (
                [17.785091125615253, 17.726519251042, 17.62112211865281],
                [19.843646479506237, 19.815914683406934, 19.837132724297337],
                [20.893478748591875, 20.785962137406948, 20.795332534291767],
                [40.849690155342884, 40.831049358170446, 40.734899385984775],
            ),
        ];
        for (j, (sdr, isr, sir, sar)) in want.iter().enumerate() {
            assert_close(&scores[j].sdr, sdr, &format!("SDR {j}"));
            assert_close(&scores[j].isr, isr, &format!("ISR {j}"));
            assert_close(&scores[j].sir, sir, &format!("SIR {j}"));
            assert_close(&scores[j].sar, sar, &format!("SAR {j}"));
        }
    }

    #[test]
    fn si_sdr_tanimdaki_gibi() {
        // s = sin, gürültü = aynı frekansta cos/10: tam periyotlarda ⟨s, n⟩ = 0, ‖n‖² = ‖s‖²/100,
        // SI-SDR = 10·log10(100) = 20 dB. Ölçekten bağımsız: 3·tahmin de 20 dB. Tam kopya +∞,
        // sessiz asıl ses NaN.
        let n = 4000;
        let w = 2.0 * std::f64::consts::PI / 400.0;
        let s: Vec<f64> = (0..n).map(|i| (w * i as f64).sin()).collect();
        let est: Vec<f64> = (0..n).map(|i| s[i] + 0.1 * (w * i as f64).cos()).collect();
        assert!(
            (si_sdr(&est, &s) - 20.0).abs() < 1e-9,
            "{}",
            si_sdr(&est, &s)
        );
        let scaled: Vec<f64> = est.iter().map(|v| 3.0 * v).collect();
        assert!((si_sdr(&scaled, &s) - 20.0).abs() < 1e-9);
        assert_eq!(si_sdr(&s, &s), f64::INFINITY);
        assert!(si_sdr(&s, &vec![0.0; n]).is_nan());
    }

    #[test]
    fn sdr_olcek_hatasini_ceza_sayar_sir_tek_kaynakta_sonsuz() {
        // BSS Eval v4 görüntü SDR'si ölçekten bağımsız değildir: 0,5·s için hata ‖0,5·s‖², SDR =
        // 10·log10(1 / 0,25) = 6,0206 dB; izdüşüm 0 gecikmede s'yi tam açıklar, ISR de 6,0206.
        // Tek kaynakta girişim yok (SIR = +∞); yapay hata yalnızca ε düzeltmesinden (SAR çok büyük).
        let s: Vec<f64> = noise(5, 3000);
        let refs = vec![vec![s.clone()]];
        let ests = vec![vec![s.iter().map(|v| 0.5 * v).collect::<Vec<f64>>()]];
        let config = BssConfig {
            window: 1000,
            hop: 1000,
            filters_len: 8,
        };
        let scores = bss_eval_v4(&refs, &ests, config).unwrap();
        let want = 10.0 * 4f64.log10();
        for t in 0..3 {
            assert!(
                (scores[0].sdr[t] - want).abs() < 1e-9,
                "{}",
                scores[0].sdr[t]
            );
            assert!(
                (scores[0].isr[t] - want).abs() < 1e-6,
                "{}",
                scores[0].isr[t]
            );
            assert_eq!(scores[0].sir[t], f64::INFINITY);
            assert!(scores[0].sar[t] > 100.0, "{}", scores[0].sar[t]);
        }
    }

    #[test]
    fn sessiz_pencere_nan_ve_ortanca_onu_atlar() {
        // İkinci pencerede ikinci kaynak sessiz: o pencerede bütün kaynakların ölçütleri NaN
        // (museval `_any_source_silent`). Ortanca NaN'ları atlar.
        let n = 3000;
        let a = noise(7, n);
        let mut b = noise(8, n);
        b[1000..2000].iter_mut().for_each(|v| *v = 0.0);
        let refs = vec![vec![a.clone()], vec![b.clone()]];
        let mix: Vec<f64> = a.iter().zip(&b).map(|(x, y)| x + 0.1 * y).collect();
        let ests = vec![vec![mix], vec![b.clone()]];
        let config = BssConfig {
            window: 1000,
            hop: 1000,
            filters_len: 4,
        };
        let scores = bss_eval_v4(&refs, &ests, config).unwrap();
        for s in &scores {
            assert!(s.sdr[1].is_nan() && s.sir[1].is_nan() && s.sar[1].is_nan());
            assert!(!s.sdr[0].is_nan() && !s.sdr[2].is_nan());
        }
        // Sessiz olmayan pencerelerin değerleri museval 0.4.1 ile aynı (aynı sinyaller, aynı ayar).
        assert_close(
            &[scores[0].sdr[0], scores[0].sdr[2]],
            &[20.0097392, 19.96350422],
            "SDR",
        );
        assert_close(
            &[scores[0].sir[0], scores[0].sir[2]],
            &[20.02369312, 19.9830948],
            "SIR",
        );
        assert_eq!(median_ignoring_nan(&[3.0, f64::NAN, 1.0, 2.0]), Some(2.0));
        assert_eq!(
            median_ignoring_nan(&[4.0, 1.0, f64::NAN, 2.0, 3.0]),
            Some(2.5)
        );
        assert_eq!(median_ignoring_nan(&[f64::NAN]), None);
    }

    #[test]
    fn pencereler_museval_framing_gibi() {
        // ⌊(n − pencere + adım) / adım⌋: n = 10, pencere 4, adım 3 → 3 pencere; son örnekler (9)
        // pencereye girmez. Pencere sesten uzunsa tek pencere.
        assert_eq!(frames(10, 4, 3), vec![(0, 4), (3, 7), (6, 10)]);
        assert_eq!(frames(11, 4, 3), vec![(0, 4), (3, 7), (6, 10)]);
        assert_eq!(frames(5, 8, 8), vec![(0, 5)]);
        assert_eq!(frames(16, 8, 8), vec![(0, 8), (8, 16)]);
    }

    #[test]
    fn bicim_hatalari_anlasilir() {
        let ok = vec![vec![vec![1.0, 2.0]]];
        let c = BssConfig {
            window: 2,
            hop: 2,
            filters_len: 1,
        };
        assert_eq!(bss_eval_v4(&[], &[], c), Err(SeparationEvalError::Empty));
        let two = vec![vec![vec![1.0, 2.0]], vec![vec![3.0, 4.0]]];
        assert_eq!(bss_eval_v4(&ok, &two, c), Err(SeparationEvalError::Shape));
        let zero = BssConfig { hop: 0, ..c };
        assert_eq!(
            bss_eval_v4(&ok, &ok, zero),
            Err(SeparationEvalError::Config)
        );
        // Tahmin kısa ise sonu sıfırla doldurulur, uzunsa kesilir.
        let long = vec![vec![vec![1.0, 2.0, 9.0]]];
        assert_eq!(
            bss_eval_v4(&ok, &long, c).unwrap()[0].sdr,
            vec![f64::INFINITY]
        );
    }
}
