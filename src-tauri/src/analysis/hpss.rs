//! Vurmalı/ezgisel ayrıştırma (HPSS, Fitzgerald 2010, "Harmonic/percussive separation using median
//! filtering", DAFx-10): kaynak ayrıştırmanın modelsiz, lisans sorunsuz yolu (sahibinin kararı, 6 Kasım
//! 2026: önce bu, sonra isteğe bağlı Spleeter paketi; `docs/arastirma/kaynak-ayristirma/RAPOR.md`).
//!
//! Spektrogramın genliği her frekans kutusunda **zamanda** ortanca süzgeçten geçirilince uzayan
//! (ezgisel: bas, melodi) kısım kalır; her karede **frekansta** geçirilince kısa ve geniş
//! bantlı (vurmalı: davul) kısım kalır. Maskeler üç parçalıdır (HRPS, Driedger–Müller–Disch 2014,
//! "Extending harmonic-percussive separation of audio signals", ISMIR; ayrım payı `MARGIN`): bir kutu
//! ezgiselse `H > β·P`, vurmalıysa `P ≥ β·H`, ikisi de değilse **kalan**dır. Kalan, ikisine de açıkça
//! benzemeyen sesi ayırır; böylece ezgisel ve vurmalı kısımlar daha temiz kalır. **Ölçüldü (6 Kasım):**
//! bu çözünürlükte gerçekçi vibratolu şarkı sesi (±%3–5, 8–12 harmonik) %98'den çoğuyla ezgiseldir;
//! kalan vokal işareti değildir. Vokal için iki aşamalı ayrıştırma (Tachibana–Ono–Sagayama) ayrı adım.
//! Vurmalı kısım üç banda bölünür: bas davul, trampet ve orta vurmalılar, zil (hi-hat). Her kare için
//! yalnızca türetilmiş enerjiler tutulur; ayrılmış ses hiç üretilmez, saklanmaz.
//!
//! Akışlıdır: analiz FFT'sinin her karesi [`Hpss::push`] ile verilir; zaman süzgeci ortadaki kareyi
//! görmek için `TIME_HALF` kare ileriye bakar, sonuç o kadar gecikmeli döner; şarkı sonunda
//! [`Hpss::finish`] kalanları verir. Bellek sabittir (pencere kadar kare).

use std::collections::VecDeque;

/// Zaman süzgecinin yarı genişliği (kare): ±8 kare, 60 kare/sn'de ~0,28 sn'lik pencere.
const TIME_HALF: usize = 8;
/// Frekans süzgecinin yarı genişliği (kutu): ±8 kutu, 2048'lik FFT'de ~±170 Hz.
const FREQ_HALF: usize = 8;
/// Bakılan en yüksek frekans: zilin (hi-hat) enerjisi 12 kHz'e kadar; üstü işi büyütür.
const MAX_HZ: f64 = 12_000.0;
/// Üç parçalı maskenin ayrım payı β (Driedger–Müller–Disch 2014; β = 1 düz ikili HPSS'tir, büyüdükçe
/// kalana daha çok ses düşer).
const MARGIN: f64 = 2.0;
/// Vurmalı bantlar: bas davul, trampet ve orta vurmalılar, zil.
const KICK_HZ: (f64, f64) = (30.0, 150.0);
const SNARE_HZ: (f64, f64) = (150.0, 5_000.0);
const HIHAT_HZ: (f64, f64) = (5_000.0, MAX_HZ);
/// Ezgisel bas bandı (bas gitar, 808, sub bas).
const BASS_LOW_HZ: f64 = 40.0;
const BASS_HIGH_HZ: f64 = 250.0;

/// Bir analiz karesinin ayrıştırma sonucu (enerjiler, genliğin karesi toplamı; mutlak ölçek
/// FFT'ninkidir, görseller oranlarına ya da zarflarına bakar).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct HpssFrame {
    /// Vurmalı kısmın enerjisi (bütün bant).
    pub percussive: f64,
    /// Ezgisel kısmın enerjisi (bütün bant).
    pub harmonic: f64,
    /// Ezgisel kısmın bas bandındaki enerjisi.
    pub harmonic_bass: f64,
    /// Kalanın enerjisi (bütün bant): ne ezgisel ne vurmalı.
    pub residual: f64,
    /// Vurmalı kısmın bantları: bas davul, trampet ve orta vurmalılar, zil.
    pub kick: f64,
    pub snare: f64,
    pub hihat: f64,
}

/// Bir frekans kutusunun hangi bantlara düştüğü (kutu başına bir kez hesaplanır).
#[derive(Clone, Copy, Default)]
struct BinBands {
    bass: bool,
    kick: bool,
    snare: bool,
    hihat: bool,
}

/// Akışlı vurmalı/ezgisel ayrıştırıcı.
pub struct Hpss {
    /// Kullanılan kutu sayısı (0 Hz'den `MAX_HZ`'e).
    bins: usize,
    /// Her kutunun bantları.
    bands: Vec<BinBands>,
    /// Son `2·TIME_HALF + 1` karenin genlikleri; ortadaki ayrıştırılır.
    window: VecDeque<Vec<f64>>,
    /// Daha önce verilmiş kare sayısı (ilk karelerin önü sıfırla doldurulur).
    pushed: usize,
    /// Tekrar ayrılmasın diye yardımcı tamponlar.
    column: Vec<f64>,
    row: Vec<f64>,
}

impl Hpss {
    /// `fft_size` noktalı FFT'nin genliklerini (kutu başına, 0 Hz'den başlayarak) alacak ayrıştırıcı.
    pub fn new(sample_rate: u32, fft_size: usize) -> Self {
        let bin_hz = f64::from(sample_rate.max(1)) / fft_size.max(2) as f64;
        let nyquist_bins = fft_size / 2 + 1;
        let bins = ((MAX_HZ / bin_hz).ceil() as usize + 1).clamp(1, nyquist_bins);
        let within = |hz: f64, (low, high): (f64, f64)| hz >= low && hz < high;
        let bands = (0..bins)
            .map(|bin| {
                let hz = bin as f64 * bin_hz;
                BinBands {
                    bass: within(hz, (BASS_LOW_HZ, BASS_HIGH_HZ)),
                    kick: within(hz, KICK_HZ),
                    snare: within(hz, SNARE_HZ),
                    hihat: hz >= HIHAT_HZ.0,
                }
            })
            .collect();
        Self {
            bins,
            bands,
            window: VecDeque::with_capacity(2 * TIME_HALF + 1),
            pushed: 0,
            column: Vec::with_capacity(2 * TIME_HALF + 1),
            row: Vec::with_capacity(2 * FREQ_HALF + 1),
        }
    }

    /// Ayrıştırıcının gecikmesi (kare): [`Self::push`]'un döndürdüğü sonuç bu kadar önceki karenindir.
    pub const fn delay_frames() -> usize {
        TIME_HALF
    }

    /// Bir karenin genliklerini verir (fazla kutular yok sayılır, eksikler sıfır sayılır). İlk
    /// `TIME_HALF` kareden sonra her çağrı `TIME_HALF` kare önceki karenin sonucunu döndürür.
    pub fn push(&mut self, magnitudes: &[f64]) -> Option<HpssFrame> {
        if self.pushed == 0 {
            // Şarkının başından önce sessizlik: ilk kareler de ortada ayrıştırılabilsin.
            for _ in 0..TIME_HALF {
                self.window.push_back(vec![0.0; self.bins]);
            }
        }
        let mut frame = vec![0.0; self.bins];
        for (dst, &src) in frame.iter_mut().zip(magnitudes) {
            *dst = src.abs();
        }
        self.window.push_back(frame);
        self.pushed += 1;
        if self.window.len() <= 2 * TIME_HALF {
            return None;
        }
        let result = self.separate_center();
        self.window.pop_front();
        Some(result)
    }

    /// Şarkı bitti: henüz döndürülmemiş son kareleri (sonrası sessizlik sayılarak) verir.
    pub fn finish(&mut self) -> Vec<HpssFrame> {
        let mut rest = Vec::new();
        if self.pushed == 0 {
            return rest;
        }
        let pending = self.pushed.min(TIME_HALF);
        for _ in 0..pending {
            self.window.push_back(vec![0.0; self.bins]);
            if self.window.len() > 2 * TIME_HALF {
                rest.push(self.separate_center());
                self.window.pop_front();
            }
        }
        rest
    }

    /// Penceredeki ortadaki kareyi ayrıştırır.
    fn separate_center(&mut self) -> HpssFrame {
        let center = TIME_HALF;
        let mut out = HpssFrame::default();
        for bin in 0..self.bins {
            // Ezgisel: bu kutunun zamandaki ortancası.
            self.column.clear();
            self.column
                .extend(self.window.iter().map(|frame| frame[bin]));
            let harmonic = median(&mut self.column);
            // Vurmalı: ortadaki karenin frekanstaki ortancası.
            let frame = &self.window[center];
            // Pencere hep aynı genişlikte: kenarlarda eksik kutular sıfır sayılır (yoksa en alt
            // kutularda pencere kısalır, güçlü bir bas sinüsünün tepesi ortancayı ele geçirir).
            let from = bin.saturating_sub(FREQ_HALF);
            let to = (bin + FREQ_HALF + 1).min(self.bins);
            self.row.clear();
            self.row.extend_from_slice(&frame[from..to]);
            self.row.resize(2 * FREQ_HALF + 1, 0.0);
            let percussive = median(&mut self.row);
            let power = frame[bin] * frame[bin];
            if power <= 0.0 {
                continue;
            }
            // Üç parçalı ikili maske (β payı): ezgisel, vurmalı ya da kalan.
            let bands = self.bands[bin];
            if harmonic > MARGIN * percussive {
                out.harmonic += power;
                if bands.bass {
                    out.harmonic_bass += power;
                }
            } else if percussive >= MARGIN * harmonic {
                out.percussive += power;
                if bands.kick {
                    out.kick += power;
                }
                if bands.snare {
                    out.snare += power;
                }
                if bands.hihat {
                    out.hihat += power;
                }
            } else {
                out.residual += power;
            }
        }
        out
    }
}

/// Ortanca (çift sayıda değerde üstteki); dilimi sıralamadan seçer.
fn median(values: &mut [f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let middle = values.len() / 2;
    let (_, value, _) = values.select_nth_unstable_by(middle, f64::total_cmp);
    *value
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustfft::num_complex::Complex;
    use rustfft::FftPlanner;
    use std::f64::consts::PI;

    const RATE: u32 = 44_100;
    const FFT: usize = 2048;
    /// 60 kare/sn (analizin kare hızı).
    const HOP: usize = 735;

    /// Sinyali analizdeki gibi karelere böler (Hann, 2048 nokta, 60 kare/sn) ve ayrıştırır.
    fn separate(signal: &[f64]) -> Vec<HpssFrame> {
        let fft = FftPlanner::new().plan_fft_forward(FFT);
        let hann: Vec<f64> = (0..FFT)
            .map(|i| 0.5 - 0.5 * (2.0 * PI * i as f64 / FFT as f64).cos())
            .collect();
        let mut hpss = Hpss::new(RATE, FFT);
        let mut out = Vec::new();
        let mut start = 0;
        while start + FFT <= signal.len() {
            let mut buffer: Vec<Complex<f64>> = signal[start..start + FFT]
                .iter()
                .zip(&hann)
                .map(|(&x, &w)| Complex::new(x * w, 0.0))
                .collect();
            fft.process(&mut buffer);
            let magnitudes: Vec<f64> = buffer[..=FFT / 2].iter().map(|c| c.norm()).collect();
            out.extend(hpss.push(&magnitudes));
            start += HOP;
        }
        out.extend(hpss.finish());
        out
    }

    fn sine(hz: f64, seconds: f64) -> Vec<f64> {
        let n = (seconds * f64::from(RATE)) as usize;
        (0..n)
            .map(|i| 0.5 * (2.0 * PI * hz * i as f64 / f64::from(RATE)).sin())
            .collect()
    }

    /// Her `period` saniyede bir tek örneklik darbe (geniş bantlı, anlık: saf vurmalı).
    fn clicks(period: f64, seconds: f64) -> (Vec<f64>, Vec<usize>) {
        let n = (seconds * f64::from(RATE)) as usize;
        let mut signal = vec![0.0; n];
        let mut at = Vec::new();
        let mut t = 0.25;
        while t < seconds - 0.25 {
            let i = (t * f64::from(RATE)) as usize;
            signal[i] = 0.9;
            at.push(i);
            t += period;
        }
        (signal, at)
    }

    /// Örneğin, merkezi ona en yakın analiz karesi (pencere ortası `i · HOP + FFT / 2`).
    fn frame_of(sample: usize) -> usize {
        ((sample as f64 - (FFT / 2) as f64) / HOP as f64)
            .round()
            .max(0.0) as usize
    }

    #[test]
    fn her_kare_icin_bir_sonuc_gecikmesi_sabit() {
        let signal = sine(440.0, 2.0);
        let frames = 1 + (signal.len() - FFT) / HOP;
        assert_eq!(separate(&signal).len(), frames, "kare kaybı ya da fazlası");
        assert_eq!(Hpss::delay_frames(), 8);
        let mut hpss = Hpss::new(RATE, FFT);
        for _ in 0..8 {
            assert!(hpss.push(&[1.0; 1025]).is_none(), "ilk 8 kare gecikme");
        }
        assert!(hpss.push(&[1.0; 1025]).is_some());
        assert!(
            Hpss::new(RATE, FFT).finish().is_empty(),
            "boş girdi, boş sonuç"
        );
    }

    #[test]
    fn surekli_sinus_ezgiseldir() {
        // Yapım gereği: sabit sinüsün genliği zamanda sabit (ortanca = kendisi), frekansta tek
        // tepedir (komşu kutuların ortancası küçük) → enerjinin hemen hepsi ezgisel.
        let frames = separate(&sine(1000.0, 2.0));
        let steady = &frames[20..frames.len() - 20];
        let harmonic: f64 = steady.iter().map(|f| f.harmonic).sum();
        let percussive: f64 = steady.iter().map(|f| f.percussive).sum();
        assert!(harmonic > 0.0);
        assert!(
            percussive / (harmonic + percussive) < 0.01,
            "vurmalı pay {:.4}",
            percussive / (harmonic + percussive)
        );
    }

    #[test]
    fn darbe_vurmalidir_ve_yerinde_bulunur() {
        // Yapım gereği: darbe tek karede, bütün frekanslarda (zamanda ortanca 0) → vurmalı; tepeleri
        // darbelerin karelerinde (en çok bir kare sapma: pencere örtüşmesi).
        let (signal, at) = clicks(0.5, 3.0);
        let frames = separate(&signal);
        let harmonic: f64 = frames.iter().map(|f| f.harmonic).sum();
        let percussive: f64 = frames.iter().map(|f| f.percussive).sum();
        assert!(
            percussive / (harmonic + percussive) > 0.99,
            "vurmalı pay {:.4}",
            percussive / (harmonic + percussive)
        );
        for &sample in &at {
            let expected = frame_of(sample);
            let lo = expected.saturating_sub(3);
            let hi = (expected + 4).min(frames.len());
            let peak = (lo..hi)
                .max_by(|&a, &b| frames[a].percussive.total_cmp(&frames[b].percussive))
                .unwrap();
            assert!(
                peak.abs_diff(expected) <= 1,
                "darbe {sample}: tepe kare {peak}, beklenen {expected}"
            );
        }
    }

    #[test]
    fn karisimda_davul_ve_bas_ayri_ayri_izlenir() {
        // 80 Hz bas (sürekli) + darbeler: vurmalı enerji darbe karelerinde tepe yapar, aralarda
        // düşer; ezgisel bas enerjisi darbelerden etkilenmeden sabit kalır (en çok ±%10).
        let bass = sine(80.0, 3.0);
        let (clicks, at) = clicks(0.5, 3.0);
        let mix: Vec<f64> = bass.iter().zip(&clicks).map(|(a, b)| a + b).collect();
        let frames = separate(&mix);
        let alone = separate(&bass);
        let steady = 20..frames.len() - 20;
        let mean_bass =
            steady.clone().map(|i| alone[i].harmonic_bass).sum::<f64>() / steady.len() as f64;
        for i in steady.clone() {
            let ratio = frames[i].harmonic_bass / mean_bass;
            assert!((0.9..1.1).contains(&ratio), "kare {i}: bas {ratio:.3} kat");
        }
        let click_frames: Vec<usize> = at.iter().map(|&s| frame_of(s)).collect();
        let near_click =
            |i: usize, reach: usize| click_frames.iter().any(|&c| c.abs_diff(i) <= reach);
        // Darbelerden en az 4 kare uzaktaki karelerin en büyüğü; her darbenin ±1 karesindeki tepe.
        let off = steady
            .clone()
            .filter(|&i| !near_click(i, 3))
            .map(|i| frames[i].percussive)
            .fold(0.0, f64::max);
        let peak_min = click_frames
            .iter()
            .filter(|&&c| steady.contains(&c))
            .map(|&c| {
                (c - 1..=c + 1)
                    .map(|i| frames[i].percussive)
                    .fold(0.0, f64::max)
            })
            .fold(f64::INFINITY, f64::min);
        assert!(
            peak_min > 10.0 * off,
            "darbe tepesi {peak_min:.3e}, aralarda en çok {off:.3e}"
        );
    }

    #[test]
    fn bas_bandi_disindaki_ezgisel_ses_basa_sayilmaz() {
        // 2 kHz sinüs ezgiseldir ama bas bandının dışında: bas enerjisi ezgiselin %0,1'inden az.
        let frames = separate(&sine(2000.0, 2.0));
        let steady = &frames[20..frames.len() - 20];
        let bass: f64 = steady.iter().map(|f| f.harmonic_bass).sum();
        let harmonic: f64 = steady.iter().map(|f| f.harmonic).sum();
        assert!(bass / harmonic < 0.001, "bas payı {:.5}", bass / harmonic);
        // 100 Hz ise neredeyse tamamen bas.
        let frames = separate(&sine(100.0, 2.0));
        let steady = &frames[20..frames.len() - 20];
        let bass: f64 = steady.iter().map(|f| f.harmonic_bass).sum();
        let harmonic: f64 = steady.iter().map(|f| f.harmonic).sum();
        assert!(bass / harmonic > 0.99, "bas payı {:.5}", bass / harmonic);
    }

    /// Hepsinin toplamı (her bölüm ayrı ayrı).
    fn total(frames: &[HpssFrame], part: impl Fn(&HpssFrame) -> f64) -> f64 {
        frames.iter().map(part).sum()
    }

    /// Tohumlu, tekrarlanabilir beyaz gürültü.
    fn noise(n: usize, seed: u64) -> Vec<f64> {
        let mut state = seed;
        (0..n)
            .map(|_| {
                state = state
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                ((state >> 33) as f64 / f64::from(1u32 << 31)) - 1.0
            })
            .collect()
    }

    #[test]
    fn bas_davul_ve_zil_kendi_bantlarina_duser() {
        // Yapım gereği: bas davul = 60 Hz'lik, 40 ms'de sönen kısa ton (enerjisi 150 Hz altında);
        // zil = 30 ms'lik, 6 kHz üstüne süzülmüş gürültü (birinci dereceden fark süzgeci iki kez).
        let n = 3 * RATE as usize;
        let mut kick = vec![0.0; n];
        let mut hat = vec![0.0; n];
        let hiss = noise(n, 7);
        for beat in 0..5 {
            let at = RATE as usize / 4 + beat * RATE as usize / 2;
            for i in 0..(RATE as usize / 25) {
                let t = i as f64 / f64::from(RATE);
                kick[at + i] = 0.8 * (2.0 * PI * 60.0 * t).sin() * (-t / 0.04).exp();
            }
            let hat_at = at + RATE as usize / 4;
            for i in 2..(RATE as usize * 3 / 100) {
                // İki kez fark: alçak frekansları bastırır, enerji üst banda kayar.
                let d = hiss[hat_at + i] - 2.0 * hiss[hat_at + i - 1] + hiss[hat_at + i - 2];
                hat[hat_at + i] = 0.2 * d;
            }
        }
        let kicks = separate(&kick);
        assert!(
            total(&kicks, |f| f.kick) > 10.0 * total(&kicks, |f| f.hihat),
            "bas davul zile kaçtı"
        );
        assert!(total(&kicks, |f| f.kick) > 0.5 * total(&kicks, |f| f.percussive));
        let hats = separate(&hat);
        assert!(
            total(&hats, |f| f.hihat) > 10.0 * total(&hats, |f| f.kick),
            "zil bas davula kaçtı"
        );
        assert!(
            total(&hats, |f| f.percussive)
                > 0.5 * total(&hats, |f| f.percussive + f.harmonic + f.residual)
        );
    }

    #[test]
    fn uc_parcali_maske_tanimdaki_gibi() {
        // Driedger–Müller–Disch 2014'ün kuralı (β = 2), elle kurulmuş genliklerle: 17 karenin
        // hepsinde her kutu 1,0, yalnızca ortadaki karede bütün kutular `c`. Ortadaki karede zaman
        // ortancası H = 1,0 (17 değerin 16'sı 1,0), frekans ortancası P = c (kenarlarda sıfır dolgulu
        // pencere hariç). Kural: H > 2·P → ezgisel; P ≥ 2·H → vurmalı; ikisi de değil → kalan.
        let bins = 1025;
        for (c, expected) in [
            (0.4, "ezgisel"),
            // Sınır: H = 2·P tam (0,5·2 = 1,0 kayan noktada kesin); ezgisel için "büyük" gerekir.
            (0.5, "kalan"),
            (1.5, "kalan"),
            (1.9, "kalan"),
            (2.0, "vurmalı"),
            (3.0, "vurmalı"),
        ] {
            let mut hpss = Hpss::new(RATE, FFT);
            let mut out = Vec::new();
            for frame in 0..17 {
                let value = if frame == 8 { c } else { 1.0 };
                out.extend(hpss.push(&vec![value; bins]));
            }
            out.extend(hpss.finish());
            // İlk sonuç, sessiz önden dolgu yüzünden 0. kare; ortadaki kare 8. sonuç.
            let center = out[8];
            // Kenarlardaki FREQ_HALF kutu sıfır dolgu yüzünden P'si daha küçük: yalnızca iç kutular.
            let inner = (c * c) * (hpss.bins - 2 * FREQ_HALF) as f64;
            let (h, p, r) = (center.harmonic, center.percussive, center.residual);
            let got = match expected {
                "ezgisel" => h,
                "vurmalı" => p,
                _ => r,
            };
            assert!(
                got >= inner * 0.999,
                "c = {c}: {expected} enerjisi {got:.1}, iç kutular {inner:.1}"
            );
        }
    }

    #[test]
    fn bant_sinirlari_kutu_kutu_tanimdaki_gibi() {
        // 44,1 kHz, 2048 nokta: kutu genişliği 44 100 / 2048 = 21,533 Hz (elle hesap). Kutu k'nın
        // frekansı k·21,533: 1 → 21,5; 2 → 43,1; 6 → 129,2; 7 → 150,7; 232 → 4995,7; 233 → 5017,2;
        // 557 → 11 994,0; 558 → 12 015,5. Böylece kick (30–150 Hz) = 2..=6 (5 kutu), snare
        // (150–5000 Hz) = 7..=232 (226 kutu), zil (5 kHz – 12 kHz, son kutu dahil) = 233..=558
        // (326 kutu); kutu sayısı ⌈12 000 / 21,533⌉ + 1 = 559.
        // Yalnızca ortadaki karede her kutu 1,0, diğer kareler sessiz: H = 0, P = 1 (sıfır dolgulu
        // pencerede bile 17 değerin en az 9'u 1,0), yani her kutu vurmalı, gücü 1.
        let mut hpss = Hpss::new(RATE, FFT);
        assert_eq!(hpss.bins, 559);
        let mut out = Vec::new();
        for frame in 0..17 {
            let value = if frame == 8 { 1.0 } else { 0.0 };
            out.extend(hpss.push(&vec![value; 1025]));
        }
        out.extend(hpss.finish());
        let center = out[8];
        assert_eq!(center.percussive, 559.0);
        assert_eq!((center.harmonic, center.residual), (0.0, 0.0));
        assert_eq!(center.kick, 5.0, "kick bandı");
        assert_eq!(center.snare, 226.0, "snare bandı");
        assert_eq!(center.hihat, 326.0, "zil bandı");
    }

    #[test]
    fn ortanca_dogru() {
        assert_eq!(median(&mut []), 0.0);
        assert_eq!(median(&mut [3.0]), 3.0);
        assert_eq!(median(&mut [5.0, 1.0, 3.0]), 3.0);
        assert_eq!(median(&mut [4.0, 1.0, 3.0, 2.0]), 3.0);
    }
}
