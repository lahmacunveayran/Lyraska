//! Taşma koruması: ileriye bakan gerçek tepe sınırlayıcı (true-peak lookahead limiter).
//!
//! Bugünün yüksek seviyede basılmış kayıtlarında (özellikle MP3'te) örnekler tam
//! ölçeği (±1,0) aşabilir; ekolayzer ve bas yükseltmesi de aşırtır. Bunları sert
//! kırpmak yüksek yerlerde cızırtı yapar. Sınırlayıcı yalnızca aşan tepelerde devreye
//! girer: tepe gelmeden önce kazancı yumuşakça düşürür, sonra yavaşça geri bırakır.
//! Tepeler sınırın altındayken ses bit bit aynen geçer (yalnızca ~1,5 ms gecikir).
//!
//! Sınır **−1 dBTP** (gerçek tepe), EBU R128'in önerdiği tavan. Dijital örneklerin
//! hepsi 1,0'ın altında olsa da DAC'ın yeniden oluşturduğu dalga iki örneğin arasında
//! daha yükseğe çıkabilir (fs/4'te +3 dB'ye kadar). Bu yüzden kazanç örneklerin
//! kendisine değil, **örnekler arası tepeye** göre hesaplanır: her kanal 8× sık
//! örneklenir (ITU-R BS.1770'teki gibi çok fazlı pencereli sinc, faz başına 16 katsayı;
//! 96 kHz'te 4×, 192 kHz'te 2×), tepe ara noktalarla birlikte bulunur. Ölçülen kaçırma
//! payı fs/4 sinüste 0,04 dB, sert kırpılmış 9 kHz'te 0,06 dB (BS.1770'in 4× / 12
//! katsayılı süzgeci sırasıyla 0,17 ve 0,16 dB kaçırır); testler 0,1 dB tolerans tanır.
//!
//! Yöntem: istenen kazançların kayan penceredeki en küçüğü, hızlı iniş / yavaş
//! dönüş, ardından bakış uzunluğunda kayan ortalama. Bu üçlü, tepe çıkışa
//! ulaştığında kazancın yeterince düşmüş olmasını garanti eder. Ara değerleyici
//! tepeyi `TAPS / 2` kare geç bildirdiği için ses o kadar fazla geciktirilir; toplam
//! gecikme yine ~1,5 ms'dir.
//!
//! Bit-perfect kipte sınırlayıcı atlanır ([`Limiter::with_bypass`]): ses işlenmez,
//! yalnızca aynı gecikmeyle geçer.
//!
//! Gerçek zamanlı ses iş parçacığında çalışır: bütün bellek `new` içinde ayrılır.

use std::f64::consts::PI;

use super::Sample;

/// Sınır: −1 dBTP (gerçek tepe). Yalnızca bunu aşan tepeler sınırlanır; altındaki ses
/// bit bit aynen geçer. (Eskiden örnek tepesi için 0 dBFS idi: örnekler arası tepe
/// +3 dBTP'ye kadar çıkabiliyordu.)
pub const CEILING_DBTP: f64 = -1.0;
/// Sınırın doğrusal karşılığı: 10^(−1/20).
pub const CEILING: Sample = 0.891_250_938_133_745_6;
/// Toplam gecikme süresi (bakış + ara değerleyici).
const LATENCY_SECONDS: f64 = 0.0015;
/// Kazancın geri dönüş süresi (zaman sabiti).
const RELEASE_SECONDS: f64 = 0.08;
/// Ara değerleyicinin faz başına katsayı sayısı ve en çok faz sayısı (8× sık örnekleme).
const TAPS: usize = 16;
const MAX_PHASES: usize = 8;
/// Ara değerleyicinin gecikmesi (kare): ara noktalar bu kadar kare öncesine düşer.
const INTERP_DELAY: usize = TAPS / 2;

pub struct Limiter {
    channels: usize,
    /// Toplam gecikme (kare) = bakış + ara değerleyici gecikmesi.
    delay: usize,
    /// Bakış uzunluğu (kare): kazanç penceresi.
    lookahead: usize,
    /// Gecikme hattı (kare × kanal), dairesel.
    line: Vec<Sample>,
    line_pos: usize,
    /// Her kanalın son `TAPS` örneği (ara değerleme için), dairesel; `head` yazılacak yer.
    history: Vec<[Sample; TAPS]>,
    head: usize,
    /// Çok fazlı sinc: `phases[p][t]` p. ara noktanın t. katsayısı (t = 0 en yeni örnek).
    phases: [[Sample; TAPS]; MAX_PHASES],
    factor: usize,
    /// Bir fazın mutlak katsayı toplamı (en büyüğü): ara değer bunu aşamaz.
    max_gain: Sample,
    /// Kayan en küçük için son `lookahead + 1` istenen kazanç, dairesel.
    wanted: Vec<Sample>,
    wanted_pos: usize,
    /// Kayan ortalama için son `lookahead` yumuşatılmış kazanç ve toplamları.
    smoothed: Vec<Sample>,
    smoothed_pos: usize,
    smoothed_sum: Sample,
    /// Geri dönüş katsayısı ve son yumuşatılmış kazanç.
    release: Sample,
    held: Sample,
    /// En son uygulanan kazanç (tanılama ve testler için).
    gain: Sample,
    /// Bit-perfect: ses yalnızca gecikir, kazanç hep 1.
    bypass: bool,
}

impl Limiter {
    pub fn new(channels: usize, sample_rate: u32) -> Self {
        let channels = channels.max(1);
        let rate = f64::from(sample_rate);
        let delay = ((LATENCY_SECONDS * rate).round() as usize).max(INTERP_DELAY + 1);
        let lookahead = delay - INTERP_DELAY;
        let release = 1.0 - (-1.0 / (RELEASE_SECONDS * rate)).exp();
        let (phases, factor, max_gain) = interpolator(rate);
        Self {
            channels,
            delay,
            lookahead,
            line: vec![0.0; delay * channels],
            line_pos: 0,
            history: vec![[0.0; TAPS]; channels],
            head: 0,
            phases,
            factor,
            max_gain,
            wanted: vec![1.0; lookahead + 1],
            wanted_pos: 0,
            smoothed: vec![1.0; lookahead],
            smoothed_pos: 0,
            smoothed_sum: lookahead as Sample,
            release,
            held: 1.0,
            gain: 1.0,
            bypass: false,
        }
    }

    /// Bit-perfect kip: sınırlama yapılmaz, ses aynı gecikmeyle aynen geçer.
    pub fn with_bypass(mut self, bypass: bool) -> Self {
        self.bypass = bypass;
        self
    }

    /// Gecikme (kare).
    pub fn latency_frames(&self) -> usize {
        self.delay
    }

    /// Son uygulanan kazanç (1 = dokunulmadı).
    pub fn gain(&self) -> Sample {
        self.gain
    }

    /// Bir kareyi yerinde işler: `frame` girişi alır, gecikmiş ve sınırlanmış çıkışı verir.
    pub fn process_frame(&mut self, frame: &mut [Sample]) {
        let gain = if self.bypass {
            1.0
        } else {
            let peak = self.true_peak(frame);
            self.next_gain(peak)
        };
        self.gain = gain;

        // Gecikme hattı: çıkışa `delay` kare önceki örnek gider.
        let base = self.line_pos * self.channels;
        for (channel, sample) in frame.iter_mut().enumerate().take(self.channels) {
            let delayed = self.line[base + channel];
            self.line[base + channel] = *sample;
            *sample = if gain == 1.0 { delayed } else { delayed * gain };
        }
        self.line_pos = (self.line_pos + 1) % self.delay;
    }

    /// Kareyi geçmişe yazar; `INTERP_DELAY` kare önceki örneğin ve onu izleyen ara
    /// noktaların en büyük mutlak değerini (bütün kanallarda) verir.
    #[inline]
    fn true_peak(&mut self, frame: &[Sample]) -> Sample {
        let mut peak: Sample = 0.0;
        let head = self.head;
        for (history, &x) in self.history.iter_mut().zip(frame) {
            history[head] = x;
            // Ara noktalar `INTERP_DELAY` ile `INTERP_DELAY - 1` kare öncesinin arasına
            // düşer; o aralığın sol ucu olan örnek de tepeye dahil edilir.
            peak = peak.max(history[(head + TAPS - INTERP_DELAY) % TAPS].abs());
            // Ara değerler penceredeki en büyük örneğin `max_gain` katını aşamaz: sınırın
            // (ya da bulunan tepenin) altında kalacak pencereler hesaplanmaz.
            let window_max = history.iter().fold(0.0, |m: Sample, v| m.max(v.abs()));
            if window_max * self.max_gain <= CEILING.max(peak) {
                continue;
            }
            for phase in self.phases.iter().take(self.factor) {
                let mut sum = 0.0;
                for (t, &c) in phase.iter().enumerate() {
                    sum += c * history[(head + TAPS - t) % TAPS];
                }
                peak = peak.max(sum.abs());
            }
        }
        self.head = (head + 1) % TAPS;
        peak
    }

    /// İstenen kazancı pencereden geçirip uygulanacak kazancı verir.
    #[inline]
    fn next_gain(&mut self, peak: Sample) -> Sample {
        let wanted = if peak > CEILING { CEILING / peak } else { 1.0 };

        // Kayan en küçük (pencere küçük: ~70 değer; düz tarama yeterince hızlı).
        self.wanted[self.wanted_pos] = wanted;
        self.wanted_pos = (self.wanted_pos + 1) % self.wanted.len();
        let minimum = self.wanted.iter().fold(1.0, |m: Sample, &g| m.min(g));

        // Hızlı iniş, yavaş dönüş.
        self.held = if minimum < self.held {
            minimum
        } else {
            self.held + (minimum - self.held) * self.release
        };

        // Kayan ortalama: kazanç eğrisini yumuşatır (ani kazanç değişimi bozulma yapar).
        self.smoothed_sum += self.held - self.smoothed[self.smoothed_pos];
        self.smoothed[self.smoothed_pos] = self.held;
        self.smoothed_pos = (self.smoothed_pos + 1) % self.smoothed.len();
        let gain = self.smoothed_sum / self.lookahead as Sample;
        // Kayan nokta birikimi: tam 1'e çok yakınsa 1 say (sese hiç dokunulmasın).
        if gain > 1.0 - 1e-12 {
            1.0
        } else {
            gain
        }
    }

    /// Belleği sıfırlar (sarma ya da yeni şarkı).
    pub fn reset(&mut self) {
        self.line.fill(0.0);
        for history in &mut self.history {
            history.fill(0.0);
        }
        self.wanted.fill(1.0);
        self.smoothed.fill(1.0);
        self.smoothed_sum = self.lookahead as Sample;
        self.held = 1.0;
        self.gain = 1.0;
    }
}

/// Örnekleme hızına göre ara değerleyici: fazlar, faz sayısı ve en büyük mutlak katsayı
/// toplamı. Katsayılar `loudness.rs`'teki gerçek tepe ölçerle aynı biçimde kurulur (Blackman
/// pencereli sinc, her faz birim kazançlı); faz sayısı iki, katsayı sayısı iki kat.
fn interpolator(sample_rate: f64) -> ([[Sample; TAPS]; MAX_PHASES], usize, Sample) {
    let factor = if sample_rate < 96_000.0 {
        8
    } else if sample_rate < 192_000.0 {
        4
    } else {
        2
    };
    let len = factor * TAPS;
    let center = (len as f64 - 1.0) / 2.0;
    let mut phases = [[0.0; TAPS]; MAX_PHASES];
    for n in 0..len {
        let x = (n as f64 - center) / factor as f64;
        let sinc = if x.abs() < 1e-12 {
            1.0
        } else {
            (PI * x).sin() / (PI * x)
        };
        // Blackman penceresi: kısa süzgeçte geçirme bandı düz kalır.
        let w = 0.42 - 0.5 * (2.0 * PI * n as f64 / (len as f64 - 1.0)).cos()
            + 0.08 * (4.0 * PI * n as f64 / (len as f64 - 1.0)).cos();
        phases[n % factor][n / factor] = sinc * w;
    }
    // Her faz tek başına birim kazançlı olsun (düz sinyal aynen kalsın).
    for phase in phases.iter_mut().take(factor) {
        let sum: f64 = phase.iter().sum();
        if sum.abs() > 1e-12 {
            for c in phase.iter_mut() {
                *c /= sum;
            }
        }
    }
    let max_gain = phases
        .iter()
        .take(factor)
        .map(|p| p.iter().map(|c| c.abs()).sum::<f64>())
        .fold(0.0, f64::max);
    (phases, factor, max_gain)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(limiter: &mut Limiter, input: &[Sample], channels: usize) -> Vec<Sample> {
        let mut out = input.to_vec();
        for frame in out.chunks_exact_mut(channels) {
            limiter.process_frame(frame);
        }
        out
    }

    /// Tek kanallı sinyalin gerçek tepesi: 8× sık örnekleme, 64 katsayılı pencereli sinc
    /// (sınırlayıcının kendi ara değerleyicisinden çok daha ince).
    fn true_peak_8x(signal: &[Sample]) -> Sample {
        const OVERSAMPLE: usize = 8;
        const HALF: isize = 32;
        let mut peak: f64 = 0.0;
        // Kenarlar atlanır: yarım pencere tepeyi yanlış okur.
        for n in HALF as usize..signal.len() - HALF as usize {
            for p in 0..OVERSAMPLE {
                let frac = p as f64 / OVERSAMPLE as f64;
                let mut sum = 0.0;
                for k in -HALF..HALF {
                    let index = (n as isize + k) as usize;
                    let x = k as f64 - frac;
                    let sinc = if x.abs() < 1e-12 {
                        1.0
                    } else {
                        (PI * x).sin() / (PI * x)
                    };
                    let window = 0.5 + 0.5 * (PI * x / HALF as f64).cos();
                    sum += signal[index] * sinc * window;
                }
                peak = peak.max(sum.abs());
            }
        }
        peak
    }

    fn dbtp(x: Sample) -> f64 {
        20.0 * x.log10()
    }

    #[test]
    fn sinirin_altinda_ses_aynen_gecer() {
        let rate = 48_000;
        let mut limiter = Limiter::new(2, rate);
        let d = limiter.latency_frames();
        let input: Vec<Sample> = (0..20_000)
            .map(|i| 0.85 * (2.0 * PI * 440.0 * (i / 2) as f64 / f64::from(rate)).sin())
            .collect();
        let out = run(&mut limiter, &input, 2);
        assert_eq!(
            &out[d * 2..],
            &input[..input.len() - d * 2],
            "bit bit aynı, yalnızca gecikmeli"
        );
        assert_eq!(limiter.gain(), 1.0);
    }

    #[test]
    fn tavana_kadar_ses_aynen_gecer() {
        // Gerçek tepesi −1 dBTP'yi aşmayan ses değişmemeli (ekolayzer kapalıyken ses bit
        // bit aynı geçsin): tavana yakın sinüs ve sessizlikte tam tavanda darbeler.
        let rate = 44_100;
        let mut limiter = Limiter::new(1, rate);
        let d = limiter.latency_frames();
        let mut input: Vec<Sample> = (0..20_000)
            .map(|i| {
                // 9 000. kareden sonra yumuşakça söner (ani kesilme örnekler arasında taşar).
                let fade = (1.0 - (i as f64 - 9000.0) / 1000.0).clamp(0.0, 1.0);
                0.88 * fade * (2.0 * PI * 1000.0 * i as f64 / f64::from(rate)).sin()
            })
            .collect();
        input[15_000] = CEILING;
        input[19_000] = -CEILING;
        let out = run(&mut limiter, &input, 1);
        assert_eq!(&out[d..], &input[..input.len() - d]);
        assert_eq!(limiter.gain(), 1.0);
    }

    #[test]
    fn gecikme_yaklasik_1_5_ms() {
        assert_eq!(Limiter::new(2, 48_000).latency_frames(), 72);
        assert_eq!(Limiter::new(2, 44_100).latency_frames(), 66);
        assert!(Limiter::new(2, 48_000).lookahead >= 48, "bakış en az 1 ms");
        // Çok düşük hızlarda en az ara değerleyici gecikmesi + 1 kare bakış.
        assert_eq!(Limiter::new(1, 1000).latency_frames(), INTERP_DELAY + 1);
    }

    #[test]
    fn ornekler_arasi_tepe_tavani_asmaz() {
        // fs/4'te 45° kaydırılmış sinüs: örnekler ±0,99 ama gerçek tepe 1,4 (+2,9 dBTP).
        // Eski (örnek tepesine bakan) sınırlayıcı buna hiç dokunmuyordu.
        let rate = 48_000;
        let mut limiter = Limiter::new(2, rate);
        let mut input = Vec::new();
        for i in 0..rate as usize {
            let x = 1.4 * (PI / 2.0 * i as f64 + PI / 4.0).sin();
            input.push(x);
            input.push(-x);
        }
        let out = run(&mut limiter, &input, 2);
        let sample_peak = out.iter().fold(0.0f64, |m, &x| m.max(x.abs()));
        assert!(sample_peak < 0.75, "örnek tepesi {sample_peak}");
        let left: Vec<Sample> = out
            .iter()
            .step_by(2)
            .skip(rate as usize / 4)
            .copied()
            .collect();
        let peak = dbtp(true_peak_8x(&left));
        assert!(
            peak <= CEILING_DBTP + 0.1,
            "gerçek tepe {peak:.2} dBTP > {CEILING_DBTP} dBTP"
        );
    }

    #[test]
    fn kirpilmis_yuksek_frekans_tavani_asmaz() {
        // Sert sınırlanmış 9 kHz: örnekler tam 1,0 ama gerçek tepe +1,7 dBTP.
        let rate = 44_100;
        let mut limiter = Limiter::new(1, rate);
        let input: Vec<Sample> = (0..rate as usize)
            .map(|i| {
                let x = 1.6 * (2.0 * PI * 9000.0 * i as f64 / f64::from(rate)).sin();
                x.clamp(-1.0, 1.0)
            })
            .collect();
        assert!(
            dbtp(true_peak_8x(&input[1000..3000])) > 1.0,
            "giriş gerçekten taşıyor"
        );
        let out = run(&mut limiter, &input, 1);
        let peak = dbtp(true_peak_8x(&out[rate as usize / 4..]));
        assert!(peak <= CEILING_DBTP + 0.1, "gerçek tepe {peak:.2} dBTP");
    }

    #[test]
    fn tasan_tepeler_siniri_hic_asmaz() {
        let rate = 44_100;
        let mut limiter = Limiter::new(2, rate);
        // Yüksek basılmış kayıt: +3 dB'ye kadar taşan sinüs, ani darbeler ve kare dalga.
        let mut input = Vec::new();
        for i in 0..rate as usize {
            let t = i as f64 / f64::from(rate);
            let mut x = 1.4 * (2.0 * PI * 100.0 * t).sin() * (2.0 * PI * 0.7 * t).sin().abs();
            if i % 5000 == 0 {
                x = 1.9;
            }
            if (20_000..21_000).contains(&i) {
                x = if (i / 50) % 2 == 0 { 1.3 } else { -1.3 };
            }
            input.push(x);
            input.push(-x * 0.8);
        }
        let out = run(&mut limiter, &input, 2);
        let worst = out.iter().fold(0.0f64, |m, &x| m.max(x.abs()));
        assert!(worst <= CEILING + 1e-9, "en yüksek {worst}");
    }

    #[test]
    fn kazanc_yavasca_geri_doner_ve_ani_degismez() {
        let rate = 48_000;
        let mut limiter = Limiter::new(1, rate);
        // Kısa bir taşma, sonra sessizliğe yakın sabit ses.
        let mut input = vec![0.5; rate as usize];
        input[1000] = 2.0;
        let mut gains = Vec::new();
        for x in input.iter_mut() {
            let mut frame = [*x];
            limiter.process_frame(&mut frame);
            gains.push(limiter.gain());
        }
        let lowest = gains.iter().cloned().fold(1.0, f64::min);
        assert!(lowest < CEILING / 2.0 + 1e-6, "{lowest}");
        // Kazanç adımları küçük (tıkırtı yok).
        let biggest_step = gains
            .windows(2)
            .map(|w| (w[1] - w[0]).abs())
            .fold(0.0, f64::max);
        assert!(biggest_step < 0.02, "{biggest_step}");
        // 0,5 saniye sonra neredeyse tam kazanç.
        assert!(gains[rate as usize / 2 + 1000] > 0.99);
        limiter.reset();
        assert_eq!(limiter.gain(), 1.0);
    }

    #[test]
    fn bit_perfect_kipte_ses_aynen_gecer() {
        // Tam ölçekli, örnekler arası tepesi yüksek gürültü bile dokunulmadan (yalnızca
        // gecikmeyle) geçer.
        let rate = 48_000;
        let mut limiter = Limiter::new(2, rate).with_bypass(true);
        let d = limiter.latency_frames();
        let input: Vec<Sample> = (0..4000)
            .map(|i| f64::from(((i * 7919) % 65_536 - 32_768) as i16) / 32_768.0)
            .collect();
        let out = run(&mut limiter, &input, 2);
        assert_eq!(&out[d * 2..], &input[..input.len() - d * 2]);
        assert_eq!(limiter.gain(), 1.0);
    }
}
