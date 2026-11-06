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
//! kendisine değil, **örnekler arası tepeye** göre hesaplanır: her kanal her örnekleme
//! hızında 8× sık örneklenir (ITU-R BS.1770'teki gibi çok fazlı pencereli sinc, faz başına
//! 48 katsayı; 32 kHz'in altında 16), tepe ara noktalarla birlikte bulunur. Sert kırpılmış tizde (örnekler tam
//! 1,0; 0,1–0,45 fs, 44,1–192 kHz) çıkışın gerçek tepesi en çok −0,92 dBTP; testler 0,1 dB
//! tolerans tanır. (Eski 16 katsayılı süzgeç Nyquist'e yakın tizi eksik okuyordu: aynı
//! sinyallerde +0,9 ile +1,1 dBTP.)
//!
//! Yöntem: istenen kazançların kayan penceredeki en küçüğü, hızlı iniş / yavaş
//! dönüş, ardından bakış uzunluğunda kayan ortalama. Bu üçlü, tepe çıkışa
//! ulaştığında kazancın yeterince düşmüş olmasını garanti eder. Ara değerleyici
//! tepeyi katsayı sayısının yarısı kadar kare geç bildirdiği için ses o kadar fazla geciktirilir; toplam
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
/// Ara değerleyicinin faz sayısı (her hızda 8× sık örnekleme) ve faz başına katsayı sayısı.
/// Aygıt hızlarında (`LONG_TAPS_FROM_RATE` ve üstü) 48 katsayı: 16 katsayı Nyquist'e yakın
/// tizde tepeyi 2 dB'ye kadar eksik okuyordu. 48 katsayıyla gecikme 1,5 ms'de kalır ve 48
/// kHz'te bakış payı 1 ms'yi korur. Daha düşük hızlarda 1,5 ms 48 katsayıya yetmez (bakış
/// payı kalmaz); orada 16 katsayı.
const PHASES: usize = 8;
const LONG_TAPS: usize = 48;
const TAPS: usize = 16;
const LONG_TAPS_FROM_RATE: u32 = 32_000;
/// Kısa ara değerleyicinin gecikmesi (kare): ara noktalar bu kadar kare öncesine düşer.
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
    /// Faz başına katsayı sayısı (`TAPS` ya da `LONG_TAPS`) ve ara değerleyicinin gecikmesi.
    taps: usize,
    interp_delay: usize,
    /// Her kanalın son `taps` örneği (ara değerleme için), dairesel; `head` yazılacak yer.
    /// Her örnek iki kez yazılır (`head` ve `head + taps`): son `taps` örnek her zaman
    /// `head + 1`'den başlayan düz bir dilimdir (eskiden yeniye), çarpım vektörleşir.
    history: Vec<[Sample; 2 * LONG_TAPS]>,
    head: usize,
    /// Çok fazlı sinc: `phases[p][j]` p. ara noktanın j. katsayısı (j = 0 en eski örnek);
    /// ilk `taps` katsayı kullanılır.
    phases: [[Sample; LONG_TAPS]; PHASES],
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
        let (taps, interp_delay) = if sample_rate >= LONG_TAPS_FROM_RATE {
            (LONG_TAPS, LONG_TAPS / 2)
        } else {
            (TAPS, INTERP_DELAY)
        };
        let delay = ((LATENCY_SECONDS * rate).round() as usize).max(interp_delay + 1);
        let lookahead = delay - interp_delay;
        let release = 1.0 - (-1.0 / (RELEASE_SECONDS * rate)).exp();
        let (phases, max_gain) = interpolator(taps);
        Self {
            channels,
            delay,
            lookahead,
            line: vec![0.0; delay * channels],
            line_pos: 0,
            taps,
            interp_delay,
            history: vec![[0.0; 2 * LONG_TAPS]; channels],
            head: 0,
            phases,
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

    /// Kareyi geçmişe yazar; `interp_delay` kare önceki örneğin ve onu izleyen ara
    /// noktaların en büyük mutlak değerini (bütün kanallarda) verir.
    #[inline]
    fn true_peak(&mut self, frame: &[Sample]) -> Sample {
        let mut peak: Sample = 0.0;
        let head = self.head;
        let taps = self.taps;
        for (history, &x) in self.history.iter_mut().zip(frame) {
            history[head] = x;
            history[head + taps] = x;
            let window = &history[head + 1..head + 1 + taps];
            // Ara noktalar `interp_delay` ile `interp_delay - 1` kare öncesinin arasına
            // düşer; o aralığın sol ucu olan örnek de tepeye dahil edilir.
            peak = peak.max(window[taps - 1 - self.interp_delay].abs());
            // Ara değerler penceredeki en büyük örneğin `max_gain` katını aşamaz: sınırın
            // (ya da bulunan tepenin) altında kalacak pencereler hesaplanmaz.
            let window_max = window.iter().fold(0.0, |m: Sample, v| m.max(v.abs()));
            if window_max * self.max_gain <= CEILING.max(peak) {
                continue;
            }
            for phase in &self.phases {
                let sum: Sample = phase[..taps].iter().zip(window).map(|(c, v)| c * v).sum();
                peak = peak.max(sum.abs());
            }
        }
        self.head = (head + 1) % taps;
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

/// `taps` katsayılı ara değerleyici: fazlar ve en büyük mutlak katsayı toplamı. Katsayılar `loudness.rs`'teki
/// gerçek tepe ölçerle aynı biçimde kurulur (Blackman pencereli sinc, her faz birim kazançlı);
/// ondan daha sık ve daha uzun.
fn interpolator(taps: usize) -> ([[Sample; LONG_TAPS]; PHASES], Sample) {
    let factor = PHASES;
    let len = factor * taps;
    let center = (len as f64 - 1.0) / 2.0;
    let mut phases = [[0.0; LONG_TAPS]; PHASES];
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
    for phase in phases.iter_mut() {
        let sum: f64 = phase[..taps].iter().sum();
        if sum.abs() > 1e-12 {
            for c in phase.iter_mut() {
                *c /= sum;
            }
        }
    }
    let max_gain = phases
        .iter()
        .map(|p| p[..taps].iter().map(|c| c.abs()).sum::<f64>())
        .fold(0.0, f64::max);
    // Katsayılar en yeni örnekten başlayarak kuruldu; geçmiş dilimi eskiden yeniye gider.
    for phase in phases.iter_mut() {
        phase[..taps].reverse();
    }
    (phases, max_gain)
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

    /// `ornekler_arasi_tepe_tavani_asmaz` testinin yüksek hızdaki eşi. Bu test yazıldığında
    /// 192 kHz'te ara değerleyici yalnızca 2× sık örnekliyordu (16 katsayı); aşağıdaki sınır o
    /// ızgara için çıkarıldı. Artık her hızda 8× / 48 katsayı: ızgara daha sık, sınır yine üst
    /// sınırdır (Nyquist'e yakın tizi `her_hizda_kirpilmis_tiz_tavani_asmaz` sınar). 2× ızgarada
    /// iki ara noktadan biri bozulursa (ör. pencere yanlış hesaplanırsa) tepe kaçıyordu. Girdi fs/8'de (24 kHz, örnek başına 45°) 1,4 genlikli sinüs;
    /// sinüsün gerçek tepesi genliğidir (ITU-R BS.1770-4 Ek 2), yani +2,9 dBTP. Sinüsün ızgaraya
    /// göre konumu bir örnek aralığında 16 adımda taranır: kaçırma bu konuma bağlıdır.
    ///
    /// Beklenen sınır el hesabıdır. Ara değerleyici örneğin kendisine ve ¼, ¾ örnek sonrasına
    /// bakar (`interpolator`: merkez (32 − 1)/2, ara noktalar n − 7,75 ve n − 7,25; örnek
    /// n − 8'de). Tepe hiçbir noktaya ¼ örnekten uzak düşmez, 45°/örnekte en çok 11,25°: okuma
    /// en kötü cos(11,25°), 0,168 dB düşük (ölçülen: −0,832 dBTP, tepe iki örneğin tam ortasında,
    /// konum 8). Tavan bu kadar aşılabilir; üstüne 0,02 dB pay
    /// (ara değerleyicinin geçirme bandı ve ölçerin 8× ızgarası, 1 − cos(π/64) ≈ 0,01 dB). Bir
    /// ara nokta kaybolursa boşluk ¾ örneğe çıkar, tepe 0,375 örnek uzağa düşebilir: cos(16,9°),
    /// 0,38 dB.
    ///
    /// Not: 2× ızgaranın bu sınırı modül belgesindeki 0,1 dB'den (44,1/48 kHz'te ölçülmüş)
    /// büyüktür; 192 kHz'te 20 kHz'te de 0,12 dB'ye çıkar.
    ///
    /// Ölçer `true_peak_8x` (64 katsayılı, sınırlayıcınınkinden bağımsız bir sinc); önce her
    /// konumda girdinin tepesini 1,4 okuduğu doğrulanır.
    #[test]
    fn yuksek_hizda_ornekler_arasi_tepe_tavani_asmaz() {
        let rate = 192_000u32;
        let per_sample = 2.0 * PI * 24_000.0 / f64::from(rate);
        let grid_miss = -dbtp((per_sample / 4.0).cos());
        assert!((grid_miss - 0.168).abs() < 0.001, "{grid_miss}");
        let settle = rate as usize / 4;
        let len = rate as usize / 2;
        let mut worst = (f64::NEG_INFINITY, 0);
        for k in 0..16 {
            let phase = per_sample * f64::from(k) / 16.0;
            let input: Vec<Sample> = (0..len)
                .map(|i| 1.4 * (per_sample * i as f64 + phase).sin())
                .collect();
            let measured = dbtp(true_peak_8x(&input[..4800]));
            assert!(
                (measured - dbtp(1.4)).abs() < 0.02,
                "ölçer sinüsün tepesini {measured:.3} dBTP okuyor (konum {k})"
            );
            let mut limiter = Limiter::new(1, rate);
            let out = run(&mut limiter, &input, 1);
            let peak = dbtp(true_peak_8x(&out[settle..]));
            if peak > worst.0 {
                worst = (peak, k);
            }
        }
        assert!(
            worst.0 <= CEILING_DBTP + grid_miss + 0.02,
            "gerçek tepe {:.3} dBTP > {CEILING_DBTP} + {grid_miss:.3} dBTP (konum {})",
            worst.0,
            worst.1
        );
    }

    #[test]
    fn kirpilmis_yuksek_frekans_tavani_asmaz() {
        // Sert sınırlanmış 9 kHz: örnekler tam 1,0 ama gerçek tepe +2,54 dBTP (9/44,1 = 10/49:
        // 49 örnekte bir tekrar eden dizinin ideal, bant sınırlı ara değeri).
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
    fn her_hizda_kirpilmis_tiz_tavani_asmaz() {
        // Sert sınırlanmış tizler (örnekler tam 1,0) her örnekleme hızında, Nyquist'in
        // %90'ına kadar: −1 dBTP tavanı (EBU R128) aşılmamalı; tolerans öteki testlerdeki
        // gibi 0,1 dB. Kısa ara değerleyici yüksek frekansta tepeyi eksik okursa düşer.
        let mut worst = (f64::NEG_INFINITY, 0, 0.0);
        for rate in [44_100u32, 48_000, 88_200, 96_000, 176_400, 192_000] {
            let fs = f64::from(rate);
            let len = rate as usize / 2;
            for fraction in [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45] {
                let w = 2.0 * PI * fraction;
                // Ölçer bu frekansta kırpılmamış sinüsün tepesini doğru okumalı.
                let clean: Vec<Sample> = (0..4800)
                    .map(|i| 1.4 * (w * i as f64 + 0.3).sin())
                    .collect();
                let measured = dbtp(true_peak_8x(&clean));
                assert!(
                    (measured - dbtp(1.4)).abs() < 0.05,
                    "ölçer {fraction}·fs sinüsü {measured:.3} dBTP okuyor"
                );
                let input: Vec<Sample> = (0..len)
                    .map(|i| (1.6 * (w * i as f64 + 0.3).sin()).clamp(-1.0, 1.0))
                    .collect();
                let mut limiter = Limiter::new(1, rate);
                let out = run(&mut limiter, &input, 1);
                let peak = dbtp(true_peak_8x(&out[len / 2..]));
                if peak > worst.0 {
                    worst = (peak, rate, fraction * fs);
                }
            }
        }
        assert!(
            worst.0 <= CEILING_DBTP + 0.1,
            "gerçek tepe {:.3} dBTP ({} Hz'te {:.0} Hz)",
            worst.0,
            worst.1,
            worst.2
        );
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
