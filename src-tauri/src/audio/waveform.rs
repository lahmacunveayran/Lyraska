//! Görseller için ham dalga biçimi (MilkDrop sahnesi, Butterchurn): çalan sesin 44,1 kHz'e
//! indirilmiş sol/sağ kopyası.
//!
//! ```text
//! çözme ─► rubato (aygıt hızı) ─┬─► halka tampon (rtrb) ─► ses çıkışı (gerçek zamanlı)
//!                               └─► Decimator (44,1 kHz) ─► WaveformTap (4 sn, önceden ayrılmış)
//!                                                               ▲
//!                                     komut iş parçacığı: duyulan ana kadarki son 1024 örnek
//! ```
//!
//! **Neden çözme iş parçacığında, aygıt hızına çevrildikten sonra?** Halka tampona giden örnekler
//! tek, kesintisiz bir akıştır: hızı sabittir (aygıtın hızı) ve her karenin akıştaki yeri, ses
//! çıkışının "duyulan" sayacıyla (`SharedState::output_heard`) aynı sayıdır. Boşluksuz geçişte
//! şarkılar bu akışta art arda gelir; sarmada ve şarkı açılınca yeni oturum (yeni akış, yeni
//! dokunuş) kurulur. Dönüştürmeden önce ise bir örneğin akıştaki yeri belli değildir (rubato'nun
//! gecikmesi, şarkıdan şarkıya değişen hız). Ses çıkışının gerçek zamanlı geri çağrısına hiç
//! dokunulmaz: dokunuşu çözme iş parçacığı yazar, komut iş parçacığı okur.
//!
//! **Seyreltme:** aygıt hızı 44,1 kHz'in iki katı ya da daha fazlaysa (88,2/96/176,4/192 kHz) önce
//! [1, 2, 1]/4 süzgeçle ikiye bölünür (Nyquist'te sıfır; yeni Nyquist'te −6 dB), sonra kalan oran
//! (1–2 arası, ya da 44,1 kHz'ten yavaş aygıtta yukarı) doğrusal ara değerle 44,1 kHz'e getirilir.
//! 48 kHz'te katlanabilecek bölge yalnızca 22,05–24 kHz'tir (müzikte enerjisi yok denecek kadar
//! az); 96 kHz'te 24 kHz üstü ikiye bölmede en az ~10 dB, Nyquist'e yaklaştıkça çok daha fazla
//! bastırılır. Görsel için yeterli: Butterchurn bu örneklerden kendi FFT'siyle bas/orta/tiz
//! seviyesi çıkarır, duyulmayan bölgeden gelen birkaç dB'lik katlanma görüntüyü değiştirmez.
//! Süzgeçler simetrik olduğundan gecikme yoktur: `j`. çıkış örneği akışın tam `j · hız / 44100`.
//! karesindedir.
//!
//! **Kilit:** dokunuş kısa bir `Mutex` ile korunur. İki taraf da gerçek zamanlı değildir; yazar
//! bir çözme diliminin (birkaç bin örnek) kopyasını, okuyucu 2 × 1024 örneği kilit altında
//! kopyalar (mikrosaniyeler). Çözme iş parçacığı halka tamponda 2 sn önden gittiği için bu kısa
//! bekleme sese hiçbir zaman yansımaz; seyreltme kilidin dışında yapılır.

use std::sync::Mutex;

use super::Sample;

/// Butterchurn'ün varsaydığı örnekleme hızı (AudioContext yokken).
pub const WAVEFORM_RATE: u32 = 44_100;
/// Kanal başına örnek sayısı (WebAudio `fftSize = 1024`).
pub const WINDOW: usize = 1024;
/// Komutun döndürdüğü bayt sayısı: karışım, sol, sağ (her biri [`WINDOW`]).
pub const WAVEFORM_BYTES: usize = 3 * WINDOW;
/// Dokunuşun tuttuğu süre (saniye). Okunan pencere duyulan andan ses gecikmesi ayarı (en çok
/// 0,4 sn) + 1024 örnek kadar geride, yazılan uç ise halka tampon (2 sn) + aygıt arabelleği
/// (~0,1 sn) kadar ileride olabilir: toplam ~2,6 sn. 4 sn bunu payla karşılar
/// (`player::tests::dalga_dokunusu_yeterince_uzun`).
pub const TAP_SECONDS: usize = 4;
/// Dokunuşun kare sayısı (44,1 kHz'te).
pub const TAP_FRAMES: usize = TAP_SECONDS * WAVEFORM_RATE as usize;
/// En fazla bu kadar ikiye bölme (768 kHz → 48 kHz için 4 yeter).
const MAX_HALVINGS: u32 = 8;

/// Aygıt hızındaki akışı 44,1 kHz sol/sağ örneklere indirir (çözme iş parçacığında).
#[derive(Debug)]
pub struct Decimator {
    /// Aygıtın hızı (Hz).
    rate: u64,
    halvings: Vec<Halving>,
    /// Doğrusal ara değer aşaması: `j`. çıkışın aşama girişindeki yeri `j · rate / denominator`.
    denominator: u64,
    /// Ara değer aşamasına gelen örnek sayısı.
    received: u64,
    /// Ara değer aşamasına gelen son örnek.
    previous: [f64; 2],
    /// Sıradaki çıkış örneğinin sırası.
    next_out: u64,
}

/// [1, 2, 1]/4 süzgeçle ikiye bölme: `m`. çıkış girişin `2m`. örneğinin üstüne ortalanır.
#[derive(Debug, Default, Clone, Copy)]
struct Halving {
    count: u64,
    /// `x[n−2]` ve `x[n−1]` (başlangıçtan önce sessizlik).
    older: [f64; 2],
    old: [f64; 2],
}

impl Halving {
    fn push(&mut self, x: [f64; 2]) -> Option<[f64; 2]> {
        let out = (self.count % 2 == 1).then(|| {
            [
                (self.older[0] + 2.0 * self.old[0] + x[0]) * 0.25,
                (self.older[1] + 2.0 * self.old[1] + x[1]) * 0.25,
            ]
        });
        self.older = self.old;
        self.old = x;
        self.count += 1;
        out
    }
}

impl Decimator {
    /// `rate`: aygıtın (halka tampona giden akışın) hızı.
    pub fn new(rate: u32) -> Self {
        let rate = u64::from(rate.max(1));
        let target = u64::from(WAVEFORM_RATE);
        let mut count = 0;
        while count < MAX_HALVINGS && rate >= target << (count + 1) {
            count += 1;
        }
        Self {
            rate,
            halvings: vec![Halving::default(); count as usize],
            denominator: target << count,
            received: 0,
            previous: [0.0; 2],
            next_out: 0,
        }
    }

    /// Bir dilim aygıt karesini (`channels` kanal, iç içe) seyreltir; çıkış `out`'a yazılır
    /// (önce boşaltılır). Sol = 1. kanal, sağ = 2. kanal (tek kanalda ikisi de aynı).
    pub fn process(&mut self, interleaved: &[Sample], channels: usize, out: &mut Vec<[f32; 2]>) {
        out.clear();
        for frame in interleaved.chunks_exact(channels.max(1)) {
            let left = frame[0];
            let right = frame.get(1).copied().unwrap_or(left);
            self.push([left, right], out);
        }
    }

    /// Akış bitti: süzgeçlerde bekleyen son örnekler sessizlikle tamamlanıp verilir.
    pub fn finish(&mut self, out: &mut Vec<[f32; 2]>) {
        out.clear();
        let tail = (2usize << self.halvings.len()) + 1;
        for _ in 0..tail {
            self.push([0.0; 2], out);
        }
    }

    fn push(&mut self, frame: [f64; 2], out: &mut Vec<[f32; 2]>) {
        let mut value = frame;
        for stage in &mut self.halvings {
            match stage.push(value) {
                Some(v) => value = v,
                None => return,
            }
        }
        self.interpolate(value, out);
    }

    /// Doğrusal ara değer: `y[c]` gelince `y[c−1]..y[c]` arasına düşen çıkışlar verilir.
    fn interpolate(&mut self, y: [f64; 2], out: &mut Vec<[f32; 2]>) {
        let c = self.received;
        loop {
            let position = self.next_out * self.rate;
            let index = position / self.denominator;
            let remainder = position % self.denominator;
            let value = if index == c && remainder == 0 {
                y
            } else if index < c {
                // Daha öncekiler zaten verildi: burada her zaman `index == c − 1`.
                let t = remainder as f64 / self.denominator as f64;
                [
                    self.previous[0] + t * (y[0] - self.previous[0]),
                    self.previous[1] + t * (y[1] - self.previous[1]),
                ]
            } else {
                break;
            };
            out.push([value[0] as f32, value[1] as f32]);
            self.next_out += 1;
        }
        self.previous = y;
        self.received += 1;
    }
}

/// Komut iş parçacığına verilen pencere: 1024 ardışık 44,1 kHz örnek.
#[derive(Debug, Clone)]
pub struct Window {
    /// İlk örneğin sırası (akışın başından; eksi: akış başlamadan önce, sessizlik).
    pub first: i64,
    /// Akışın (aygıtın) hızı.
    pub rate: u32,
    pub left: [f32; WINDOW],
    pub right: [f32; WINDOW],
}

impl Window {
    /// Akışın `frame`. karesinde ya da sonrasında duran ilk çıkış örneğinin sırası.
    pub fn index_at_frame(&self, frame: u64) -> i64 {
        let rate = u64::from(self.rate.max(1));
        let scaled = frame.saturating_mul(u64::from(WAVEFORM_RATE));
        i64::try_from(scaled.div_ceil(rate)).unwrap_or(i64::MAX)
    }
}

/// Önceden ayrılmış halka: son [`TAP_FRAMES`] çıkış örneği.
#[derive(Default)]
struct Ring {
    left: Vec<f32>,
    right: Vec<f32>,
    /// Akışın başından beri yazılan örnek sayısı.
    written: u64,
    /// Akışın (aygıtın) hızı; 0: akış başlamadı.
    rate: u32,
}

impl std::fmt::Debug for Ring {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Ring")
            .field("capacity", &self.left.len())
            .field("written", &self.written)
            .field("rate", &self.rate)
            .finish()
    }
}

/// Çözme iş parçacığının yazdığı, komut iş parçacığının okuduğu dalga biçimi dokunuşu.
/// Bir oturuma (tek bir akışa) aittir: sarmada ve şarkı açılınca oturumla birlikte yenilenir,
/// eski konumun örnekleri yeni oturumda hiçbir zaman görünmez.
#[derive(Debug, Default)]
pub struct WaveformTap {
    ring: Mutex<Ring>,
}

impl WaveformTap {
    /// [`TAP_FRAMES`] örneklik halkayı ayırır (oturum kurulurken, bir kez).
    pub fn new() -> Self {
        Self {
            ring: Mutex::new(Ring {
                left: vec![0.0; TAP_FRAMES],
                right: vec![0.0; TAP_FRAMES],
                written: 0,
                rate: 0,
            }),
        }
    }

    /// Akış `rate` hızında baştan başlıyor (çözme iş parçacığı, ilk yazmadan önce).
    pub fn start(&self, rate: u32) {
        if let Ok(mut ring) = self.ring.lock() {
            ring.rate = rate.max(1);
            ring.written = 0;
        }
    }

    /// Seyreltilmiş örnekleri akışın sonuna ekler. Halka ayrılmamışsa (kör test) hiçbir şey yapmaz.
    pub fn write(&self, frames: &[[f32; 2]]) {
        let Ok(mut ring) = self.ring.lock() else {
            return;
        };
        let capacity = ring.left.len() as u64;
        if capacity == 0 {
            return;
        }
        let mut at = (ring.written % capacity) as usize;
        for &[left, right] in frames {
            ring.left[at] = left;
            ring.right[at] = right;
            at += 1;
            if at == ring.left.len() {
                at = 0;
            }
        }
        ring.written += frames.len() as u64;
    }

    /// Akışın `heard`. karesinden `offset_secs` ötedeki ana kadar (o an dahil) son [`WINDOW`]
    /// örnek. Henüz yazılmamış, akıştan önceki ya da halkadan çıkmış örnekler sessizliktir (0).
    /// Akış başlamadıysa `None`.
    pub fn read(&self, heard: u64, offset_secs: f64) -> Option<Window> {
        let ring = self.ring.lock().ok()?;
        if ring.rate == 0 || ring.left.is_empty() {
            return None;
        }
        let rate = u64::from(ring.rate);
        let target = u64::from(WAVEFORM_RATE);
        let scaled = heard.saturating_mul(target);
        let at = (scaled / rate) as f64
            + (scaled % rate) as f64 / rate as f64
            + offset_secs * f64::from(WAVEFORM_RATE);
        if !at.is_finite() {
            return None;
        }
        let last = at.floor() as i64;
        let first = last - (WINDOW as i64 - 1);
        let capacity = ring.left.len() as u64;
        let mut window = Window {
            first,
            rate: ring.rate,
            left: [0.0; WINDOW],
            right: [0.0; WINDOW],
        };
        for k in 0..WINDOW {
            let Ok(index) = u64::try_from(first + k as i64) else {
                continue;
            };
            if index >= ring.written || ring.written - index > capacity {
                continue;
            }
            let slot = (index % capacity) as usize;
            window.left[k] = ring.left[slot];
            window.right[k] = ring.right[slot];
        }
        Some(window)
    }
}

/// Örneği WebAudio'nun `getByteTimeDomainData` biçimine çevirir: ⌊128 · (1 + x)⌋, 0..255'e
/// kırpılmış (128 = sessizlik).
pub fn to_byte(x: f64) -> u8 {
    if !x.is_finite() {
        return 128;
    }
    ((1.0 + x) * 128.0).floor().clamp(0.0, 255.0) as u8
}

/// Pencereyi Butterchurn'ün beklediği 3 × 1024 bayta çevirir: karışım (sol + sağ)/2, sol, sağ.
/// `gains`: (ilk örneğin sırası, doğrusal kazanç) çiftleri, sıraya göre artan; her örneğe
/// kendinden önce başlayan son kazanç uygulanır (boşluksuz geçişte şarkı başına eşitleme).
pub fn to_bytes(window: &Window, gains: &[(i64, f64)]) -> Vec<u8> {
    let mut bytes = vec![128u8; WAVEFORM_BYTES];
    let mut span = 0;
    for k in 0..WINDOW {
        let index = window.first + k as i64;
        while span + 1 < gains.len() && gains[span + 1].0 <= index {
            span += 1;
        }
        let gain = gains
            .get(span)
            .filter(|(start, _)| *start <= index)
            .map_or(1.0, |&(_, gain)| gain);
        let left = f64::from(window.left[k]) * gain;
        let right = f64::from(window.right[k]) * gain;
        bytes[k] = to_byte((left + right) * 0.5);
        bytes[WINDOW + k] = to_byte(left);
        bytes[2 * WINDOW + k] = to_byte(right);
    }
    bytes
}

/// Duyulan ses yokken (duraklatıldı, şarkı bitti) verilen dalga: hepsi 128.
pub fn silence() -> Vec<u8> {
    vec![128u8; WAVEFORM_BYTES]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    /// `rate` hızında `f` Hz sinüsü (sol) ve kosinüsü (sağ), düzensiz dilimlerle seyreltir.
    fn decimate_tone(rate: u32, freq: f64, seconds: f64) -> Vec<[f32; 2]> {
        let frames = (f64::from(rate) * seconds) as usize;
        let input: Vec<Sample> = (0..frames)
            .flat_map(|n| {
                let phase = 2.0 * PI * freq * n as f64 / f64::from(rate);
                [0.5 * phase.sin(), 0.5 * phase.cos()]
            })
            .collect();
        let mut decimator = Decimator::new(rate);
        let mut all = Vec::new();
        let mut out = Vec::new();
        let mut at = 0;
        let sizes = [1usize, 7, 333, 1024, 4096, 2];
        let mut turn = 0;
        while at < frames {
            let n = sizes[turn % sizes.len()].min(frames - at);
            decimator.process(&input[at * 2..(at + n) * 2], 2, &mut out);
            all.extend_from_slice(&out);
            at += n;
            turn += 1;
        }
        all
    }

    #[test]
    fn seyreltici_sinusu_dogru_zamanda_ve_genlikte_verir() {
        // Her aygıt hızında j. çıkış örneği tam j / 44100. saniyedeki değer olmalı (gecikmesiz).
        for rate in [
            44_100, 48_000, 88_200, 96_000, 176_400, 192_000, 22_050, 8_000,
        ] {
            // 44,1 kHz'ten yavaş aygıtta doğrusal ara değer yalnızca alçak frekansta kesin.
            let freqs: &[f64] = if rate < WAVEFORM_RATE {
                &[100.0]
            } else {
                &[100.0, 1_000.0]
            };
            for &freq in freqs {
                let out = decimate_tone(rate, freq, 0.5);
                let expected_len = (0.5 * f64::from(WAVEFORM_RATE)) as usize;
                // Son giriş örneğinden sonraki ara değerler bir sonraki örneği bekler.
                let pending = 2 + (WAVEFORM_RATE / rate) as usize;
                assert!(
                    out.len().abs_diff(expected_len) <= pending,
                    "{rate} Hz: {} örnek",
                    out.len()
                );
                // Baştaki birkaç örnek süzgecin sessizlik başlangıcını görür; sonrası tam.
                let mut worst = 0.0f64;
                for (j, sample) in out.iter().enumerate().skip(8) {
                    let phase = 2.0 * PI * freq * j as f64 / f64::from(WAVEFORM_RATE);
                    worst = worst
                        .max((f64::from(sample[0]) - 0.5 * phase.sin()).abs())
                        .max((f64::from(sample[1]) - 0.5 * phase.cos()).abs());
                }
                assert!(worst < 3e-3, "{rate} Hz, {freq} Hz: en büyük hata {worst}");
            }
        }
    }

    #[test]
    fn seyreltici_dilim_boyundan_bagimsiz() {
        let rate = 96_000;
        let input: Vec<Sample> = (0..20_000)
            .flat_map(|n| [(n as f64 * 0.37).sin(), (n as f64 * 0.11).cos()])
            .collect();
        let mut whole = Decimator::new(rate);
        let mut expected = Vec::new();
        whole.process(&input, 2, &mut expected);
        let mut pieces = Decimator::new(rate);
        let mut got = Vec::new();
        let mut out = Vec::new();
        for chunk in input.chunks(2 * 113) {
            pieces.process(chunk, 2, &mut out);
            got.extend_from_slice(&out);
        }
        assert_eq!(got, expected);
    }

    #[test]
    fn seyreltici_nyquist_yakinini_bastirir() {
        // 96 kHz aygıtta 44 kHz'lik ses, örnekler yalnızca atlansa 100 Hz'e katlanırdı: ikiye
        // bölme süzgeci onu en az 30 dB bastırır.
        let out = decimate_tone(96_000, 44_000.0, 0.5);
        let peak = out
            .iter()
            .skip(8)
            .map(|s| f64::from(s[0].abs()))
            .fold(0.0, f64::max);
        assert!(20.0 * (peak / 0.5).log10() < -30.0, "tepe {peak}");
    }

    #[test]
    fn bitis_bekleyen_son_ornekleri_verir() {
        // 44,1 kHz'te 1000 kare → tam 1000 örnek; 96 kHz'te sonda kalanlar da gelir.
        for (rate, frames) in [(44_100u32, 1_000usize), (96_000, 2_177)] {
            let input = vec![0.25; frames * 2];
            let mut decimator = Decimator::new(rate);
            let mut out = Vec::new();
            decimator.process(&input, 2, &mut out);
            let mut count = out.len();
            decimator.finish(&mut out);
            count += out.len();
            let covered = (frames as u64 * u64::from(WAVEFORM_RATE)).div_ceil(u64::from(rate));
            assert!(count as u64 >= covered, "{rate}: {count} < {covered}");
        }
    }

    #[test]
    fn tek_kanal_iki_tarafa_da_yazilir_fazlasi_atlanir() {
        let mut decimator = Decimator::new(44_100);
        let mut out = Vec::new();
        decimator.process(&[0.5, -0.5], 1, &mut out);
        assert_eq!(out, vec![[0.5, 0.5], [-0.5, -0.5]]);
        // 3 kanal: sol ve sağ ilk iki kanal.
        decimator.process(&[0.1, 0.2, 0.9], 3, &mut out);
        assert_eq!(out, vec![[0.1, 0.2]]);
    }

    #[test]
    fn halka_pencereyi_dogru_yerden_okur_eskiyi_ve_yazilmamisi_sessiz_verir() {
        let tap = WaveformTap::new();
        assert!(tap.read(0, 0.0).is_none(), "akış başlamadan pencere yok");
        tap.start(44_100);
        let frames: Vec<[f32; 2]> = (0..TAP_FRAMES + 5_000)
            .map(|i| [i as f32, -(i as f32)])
            .collect();
        tap.write(&frames);
        // Pencere duyulan kareyle biter (o kare dahil).
        let heard = (TAP_FRAMES + 3_000) as u64;
        let window = tap.read(heard, 0.0).unwrap();
        assert_eq!(window.first, heard as i64 - 1_023);
        for k in 0..WINDOW {
            assert_eq!(window.left[k], (window.first + k as i64) as f32);
            assert_eq!(window.right[k], -window.left[k]);
        }
        // Yazılanın ötesi sessizlik.
        let end = (TAP_FRAMES + 5_000) as u64;
        let window = tap.read(end + 100, 0.0).unwrap();
        assert!(window.left[..WINDOW - 101].iter().all(|&v| v != 0.0));
        assert!(window.left[WINDOW - 101..].iter().all(|&v| v == 0.0));
        // Halkadan çıkmış (üzerine yazılmış) örnek eski değeriyle görünmez: sessizlik.
        let window = tap.read(5_500, 0.0).unwrap();
        let oldest = (end - TAP_FRAMES as u64) as i64;
        for k in 0..WINDOW {
            let index = window.first + k as i64;
            if index < oldest {
                assert_eq!(window.left[k], 0.0, "{index}");
            } else {
                assert_eq!(window.left[k], index as f32);
            }
        }
        // Akış başlamadan önce sessizlik; kaydırma saniye cinsinden.
        let window = tap.read(100, -0.5).unwrap();
        assert_eq!(window.first, 100 - 22_050 - 1_023);
        assert!(window.left.iter().all(|&v| v == 0.0));
        // Yeniden başlayan akış eskisini göstermez.
        tap.start(44_100);
        assert!(tap.read(2_000, 0.0).unwrap().left.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn pencere_aygit_hizinda_dogru_ana_denk_gelir() {
        let tap = WaveformTap::new();
        tap.start(48_000);
        tap.write(&vec![[0.0; 2]; 10_000]);
        // 48 kHz'te 9600. kare = 0,2 sn = 44,1 kHz'te 8820. örnek.
        let window = tap.read(9_600, 0.0).unwrap();
        assert_eq!(window.first + WINDOW as i64 - 1, 8_820);
        assert_eq!(window.index_at_frame(9_600), 8_820);
        assert_eq!(window.index_at_frame(9_601), 8_821);
    }

    #[test]
    fn bayt_bicimi_webaudio_ile_ayni() {
        assert_eq!(to_byte(0.0), 128);
        assert_eq!(to_byte(1.0), 255);
        assert_eq!(to_byte(-1.0), 0);
        assert_eq!(to_byte(0.5), 192);
        assert_eq!(to_byte(4.0), 255, "taşan kırpılır");
        assert_eq!(to_byte(-4.0), 0);
        assert_eq!(to_byte(f64::NAN), 128);
        assert_eq!(silence(), vec![128; WAVEFORM_BYTES]);
    }

    #[test]
    fn baytlar_karisim_sol_sag_sirasinda_ve_kazanc_sinirdan_itibaren() {
        let mut window = Window {
            first: 100,
            rate: 44_100,
            left: [0.25; WINDOW],
            right: [-0.25; WINDOW],
        };
        window.left[0] = 0.5;
        window.right[0] = 0.5;
        // İlk 500 örnek kazançsız, sonrası 2 kat.
        let bytes = to_bytes(&window, &[(0, 1.0), (600, 2.0)]);
        assert_eq!(bytes.len(), WAVEFORM_BYTES);
        assert_eq!(bytes[0], to_byte(0.5));
        assert_eq!(bytes[1], 128, "karışım (0,25 − 0,25)/2");
        assert_eq!(bytes[WINDOW], to_byte(0.5));
        assert_eq!(bytes[WINDOW + 499], to_byte(0.25));
        assert_eq!(bytes[WINDOW + 500], to_byte(0.5));
        assert_eq!(bytes[2 * WINDOW + 499], to_byte(-0.25));
        assert_eq!(bytes[2 * WINDOW + 500], to_byte(-0.5));
        // Kazanç listesi pencereden sonra başlıyorsa pencere kazançsız.
        let bytes = to_bytes(&window, &[(5_000, 4.0)]);
        assert_eq!(bytes[WINDOW + 1], to_byte(0.25));
    }
}
