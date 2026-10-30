//! Sözleri sese oturtmak için modelin emisyonları (`docs/arastirma/soz-hizalama/`): şarkının sesi her
//! 20 ms'lik karede hangi harfin söylendiğine dair log-olasılıklara çevrilir; yerleşim `lyrics_align`.
//!
//! Model Omnilingual ASR CTC 300M v2 (Meta, Apache-2.0; sherpa-onnx int8 dönüşümü). Programla gelmez:
//! kullanıcı "Söz paketi"ni ekler, dosyalar veri klasöründe durur. Paket güvenilmez girdi sayılır:
//! model dosyası ve simge listesi bilinen dosyalarla (SHA-256) aynı değilse açılmaz; model dosyası bir
//! kez okunur, aynı baytlar hem özetlenir hem açılır.
//!
//! - **Çalıştırıcı:** `tract` (saf Rust, ek DLL yok). Model dosyası değiştirilmez; giriş şekli kodda
//!   sabitlenir. Pencereler `THREADS` kısa ömürlü iş parçacığında çalışır: tract'ın AVX çekirdekleri
//!   dönüşte `vzeroupper` yapmadığı için aynı iş parçacığındaki sonraki kayan nokta işi Intel
//!   işlemcide ~19 kat yavaşlıyordu (bağımsız inceleme; yerleşim 0,8 → 15 sn).
//! - **Pencere:** `WINDOW_SECS` sn pencere, `HOP_SECS` sn adım (araştırmanın uçtan uca ölçtüğü ayar;
//!   10 sn pencere geliştirme setinde satırların %94,2 → %92,3'ü ve güven ölçüsünü bozdu). Her pencere
//!   kendi ortalaması ve sapmasıyla ölçeklenir, karelerin pencere kenarından uzak olanı alınır.
//! - **Kare geometrisi:** modelin karesi 400 örneklik alıcı alan, 320 örnek adım: pencerenin j. karesinin
//!   merkezi 320·j + 200 (araştırmanın Python sürümü (j + 0,5)·320,64 sayıyordu: ikinci yarıda 20 ms geç).
//! - **Sütunlar:** blank, kelime ayırıcısı, kesme işareti ve Latin, Yunan, Kiril küçük harfler (410);
//!   log-olasılık bütün sözlük (10 288 simge) üzerinden. Emisyonlar sözden bağımsızdır.
//! - **Sınırlar:** ses en çok `MAX_SECS` sn; sonlu olmayan örnek sessizlik sayılır.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use sha2::{Digest, Sha256};
use tract_onnx::prelude::*;

use super::lyrics_align::{Emissions, Vocabulary};
use crate::audio::decode::Decoder;
use crate::audio::resample::Converter;

/// Modelin beklediği örnekleme hızı.
pub const SAMPLE_RATE: u32 = 16_000;
/// Karenin adımı (20 ms) ve alıcı alanı (örnek).
pub const FRAME_SAMPLES: usize = 320;
const RECEPTIVE_SAMPLES: usize = 400;
/// Pencere ve adım (sn).
pub const WINDOW_SECS: usize = 30;
pub const HOP_SECS: usize = 20;
const WINDOW_SAMPLES: usize = WINDOW_SECS * SAMPLE_RATE as usize;
const HOP_SAMPLES: usize = HOP_SECS * SAMPLE_RATE as usize;
/// Bir penceredeki kare sayısı (480 000 örnek → 1499).
const WINDOW_FRAMES: usize = (WINDOW_SAMPLES - RECEPTIVE_SAMPLES) / FRAME_SAMPLES + 1;
/// Aynı anda çalışan pencere.
pub const THREADS: usize = 2;
/// En uzun ses (sn): daha uzunu çözülmeden reddedilir (1 saatlik kayıtta saatlerce boşa hesap olmasın).
pub const MAX_SECS: usize = 20 * 60;
/// En kısa ses (örnek, 0,1 sn).
const MIN_SAMPLES: usize = 1600;

/// Söz paketindeki dosyalar ve bilinen özetleri (`docs/arastirma/soz-hizalama/model-sha256.txt`).
pub const MODEL_FILE: &str = "model.int8.onnx";
pub const TOKENS_FILE: &str = "tokens.txt";
pub const MODEL_SHA256: &str = "e3042b2f3b3ef0af2211bf99d2b4bf94a21f5ac0e9898827e7dd6d003a860e91";
pub const TOKENS_SHA256: &str = "7d99997ef207ff14c2cfe825f2aa037528ea250113cc3c6392bfe49326884ba6";
/// Paket dosyalarının en büyük boyu (gerçekleri 365 841 453 ve 90 630 bayt).
const MAX_MODEL_BYTES: u64 = 512 << 20;
const MAX_TOKENS_BYTES: u64 = 1 << 20;
/// Simge kimliğinin üst sınırı (gerçek sözlük 10 288 simge).
const MAX_TOKEN_ID: usize = 1 << 20;

#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("söz paketi okunamadı: {0}")]
    Io(#[from] std::io::Error),
    #[error("söz paketinin model dosyası bilinen dosya değil (bozuk ya da başka bir model)")]
    WrongModel,
    #[error("söz paketinin simge listesi bilinen liste değil ya da bozuk")]
    BadTokens,
    #[error("model çalıştırılamadı: {0}")]
    Run(String),
    #[error("şarkı çözülemedi: {0}")]
    Decode(String),
    #[error("şarkı sözleri oturtmak için çok kısa")]
    TooShort,
    #[error("şarkı sözleri oturtmak için çok uzun (en çok {} dk)", MAX_SECS / 60)]
    TooLong,
    #[error("iptal edildi")]
    Cancelled,
}

impl From<TractError> for ModelError {
    fn from(e: TractError) -> Self {
        Self::Run(e.to_string())
    }
}

/// Sonlu olmayan örnek (bozuk dosya) sessizlik sayılır: tek bir NaN bütün pencereyi bozmasın.
fn finite(v: f32) -> f32 {
    if v.is_finite() {
        v
    } else {
        0.0
    }
}

/// Şarkıyı modelin girişine çevirir: kanalların ortalaması, 16 kHz (`resample` ile), f32. `cancel`
/// her çözülen dilimde denetlenir; `MAX_SECS`'ten uzun şarkı çözülmeden reddedilir.
pub fn decode_mono(path: &Path, cancel: &AtomicBool) -> Result<Vec<f32>, ModelError> {
    let decode = |e: crate::audio::AudioError| ModelError::Decode(e.to_string());
    let mut decoder = Decoder::open(path).map_err(decode)?;
    if decoder
        .info()
        .duration_secs
        .is_some_and(|d| d > MAX_SECS as f64)
    {
        return Err(ModelError::TooLong);
    }
    let channels = decoder.info().channels.max(1);
    let rate = decoder.info().sample_rate;
    let mut converter = Converter::new(rate, 1, SAMPLE_RATE, 1).map_err(decode)?;
    let limit = MAX_SECS * SAMPLE_RATE as usize;
    let mut mono = Vec::new();
    let mut out = Vec::new();
    while let Some(chunk) = decoder.next_chunk().map_err(decode)? {
        if cancel.load(Ordering::Relaxed) {
            return Err(ModelError::Cancelled);
        }
        mono.clear();
        mono.extend(
            chunk
                .chunks_exact(channels)
                .map(|frame| frame.iter().sum::<f64>() / channels as f64),
        );
        let converted = converter.process(&mono).map_err(decode)?;
        out.extend(converted.iter().map(|&v| finite(v as f32)));
        // Süresini bildirmeyen dosya: sınır çözerken de denetlenir.
        if out.len() > limit {
            return Err(ModelError::TooLong);
        }
    }
    let rest = converter.finish().map_err(decode)?;
    out.extend(rest.iter().map(|&v| finite(v as f32)));
    Ok(out)
}

fn hex(digest: &[u8]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Dosyanın SHA-256'sı (onaltılık).
pub fn file_sha256(path: &Path) -> Result<String, ModelError> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex(&hasher.finalize()))
}

/// Dosyayı en çok `limit` bayt okur; daha büyüğü bozuk paket sayılır.
fn read_limited(path: &Path, limit: u64, too_big: ModelError) -> Result<Vec<u8>, ModelError> {
    if std::fs::metadata(path)?.len() > limit {
        return Err(too_big);
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(limit + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(too_big);
    }
    Ok(bytes)
}

/// Saklanan sütun: kelime ayırıcısı, kesme işareti ya da Latin/Yunan/Kiril küçük harf.
fn kept_letter(c: char) -> bool {
    let code = c as u32;
    let script = code < 0x250 || (0x370..0x500).contains(&code) || (0x1E00..0x1F00).contains(&code);
    c == '\'' || (script && c.is_alphabetic() && !c.is_uppercase())
}

/// Simge listesi (`tokens.txt`: "simge kimlik" satırları; kelime ayırıcısının adı boştur) →
/// saklanan simgelerin kimlikleri (sütun sırası) ve harf → sütun sözlüğü. Blank 0. simgedir ("<s>";
/// araştırmanın ölçtüğü düzen).
fn parse_tokens(text: &str) -> Result<(Vec<usize>, Vocabulary), ModelError> {
    let mut space = None;
    let mut letters: Vec<(char, usize)> = Vec::new();
    for line in text.lines() {
        let Some((name, id)) = line.rsplit_once(' ') else {
            continue;
        };
        let id: usize = id.trim().parse().map_err(|_| ModelError::BadTokens)?;
        if id > MAX_TOKEN_ID {
            return Err(ModelError::BadTokens);
        }
        let name = name.trim_end_matches(' ');
        let mut chars = name.chars();
        match (chars.next(), chars.next()) {
            (None, _) => space = Some(id),
            (Some(c), None) if kept_letter(c) => letters.push((c, id)),
            _ => {}
        }
    }
    let Some(space) = space else {
        return Err(ModelError::BadTokens);
    };
    if letters.is_empty() {
        return Err(ModelError::BadTokens);
    }
    letters.sort_by_key(|&(_, id)| id);
    let mut ids = vec![0, space];
    let mut map = HashMap::new();
    for (c, id) in letters {
        map.insert(c, ids.len());
        ids.push(id);
    }
    Ok((
        ids,
        Vocabulary {
            blank: 0,
            space: Some(1),
            letters: map,
        },
    ))
}

/// Yüklenmiş model.
pub struct LyricsModel {
    plan: std::sync::Arc<TypedRunnableModel>,
    /// Saklanan simgelerin kimlikleri; emisyonun k. sütunu `ids[k]` simgesi.
    ids: Vec<usize>,
    vocab: Vocabulary,
}

impl LyricsModel {
    /// Söz paketinin klasöründen açar; iki dosyanın özeti verilenlerle aynı olmalı.
    pub fn open(dir: &Path, model_sha256: &str, tokens_sha256: &str) -> Result<Self, ModelError> {
        let tokens = read_limited(
            &dir.join(TOKENS_FILE),
            MAX_TOKENS_BYTES,
            ModelError::BadTokens,
        )?;
        if hex(&Sha256::digest(&tokens)) != tokens_sha256 {
            return Err(ModelError::BadTokens);
        }
        let text = String::from_utf8(tokens).map_err(|_| ModelError::BadTokens)?;
        let (ids, vocab) = parse_tokens(&text)?;
        let model = read_limited(
            &dir.join(MODEL_FILE),
            MAX_MODEL_BYTES,
            ModelError::WrongModel,
        )?;
        if hex(&Sha256::digest(&model)) != model_sha256 {
            return Err(ModelError::WrongModel);
        }
        let plan = tract_onnx::onnx()
            .with_ignore_output_shapes(true)
            .with_ignore_value_info(true)
            .model_for_read(&mut model.as_slice())?
            .with_input_fact(0, f32::fact([1, WINDOW_SAMPLES]).into())?
            .into_optimized()?
            .into_runnable()?;
        Ok(Self { plan, ids, vocab })
    }

    pub fn vocabulary(&self) -> &Vocabulary {
        &self.vocab
    }

    /// Bir pencerenin karelerinin log-olasılıkları (saklanan sütunlar), satır satır, `WINDOW_FRAMES`
    /// kare.
    fn run_window(&self, samples: &[f32]) -> Result<Vec<f32>, ModelError> {
        let n = samples.len().max(1) as f64;
        let mean = samples.iter().map(|&v| f64::from(v)).sum::<f64>() / n;
        let var = samples
            .iter()
            .map(|&v| (f64::from(v) - mean).powi(2))
            .sum::<f64>()
            / n;
        let scale = 1.0 / (var + 1e-5).sqrt();
        // Pencere kısa kalırsa (şarkının sonu ya da kısa şarkı) sessizlikle tamamlanır: şekil sabit.
        let mut input = vec![0f32; WINDOW_SAMPLES];
        for (out, &v) in input.iter_mut().zip(samples) {
            *out = ((f64::from(v) - mean) * scale) as f32;
        }
        let tensor: Tensor = tract_ndarray::Array2::from_shape_vec((1, WINDOW_SAMPLES), input)
            .map_err(|e| ModelError::Run(e.to_string()))?
            .into();
        let outputs = self.plan.run(tvec!(tensor.into()))?;
        let logits = outputs
            .first()
            .ok_or_else(|| ModelError::Run("çıktı yok".into()))?
            .to_plain_array_view::<f32>()?;
        let shape = logits.shape().to_vec();
        let max_id = self.ids.iter().copied().max().unwrap_or(0);
        if shape.len() != 3 || shape[0] != 1 || shape[1] != WINDOW_FRAMES || shape[2] <= max_id {
            return Err(ModelError::Run(format!(
                "beklenmeyen çıktı şekli {shape:?}"
            )));
        }
        let tokens = shape[2];
        let flat = logits
            .as_slice()
            .ok_or_else(|| ModelError::Run("çıktı bitişik değil".into()))?;
        let mut out = Vec::with_capacity(WINDOW_FRAMES * self.ids.len());
        for row in flat.chunks_exact(tokens) {
            let max = row.iter().copied().fold(f32::NEG_INFINITY, f32::max);
            let sum: f64 = row.iter().map(|&v| f64::from(v - max).exp()).sum();
            let log_z = f64::from(max) + sum.ln();
            out.extend(
                self.ids
                    .iter()
                    .map(|&id| (f64::from(row[id]) - log_z) as f32),
            );
        }
        Ok(out)
    }

    /// Şarkının emisyonları. `audio`: 16 kHz mono. `cancel` her pencere grubundan önce denetlenir.
    pub fn emissions(&self, audio: &[f32], cancel: &AtomicBool) -> Result<Emissions, ModelError> {
        if audio.len() < MIN_SAMPLES {
            return Err(ModelError::TooShort);
        }
        if audio.len() > MAX_SECS * SAMPLE_RATE as usize {
            return Err(ModelError::TooLong);
        }
        let audio: Vec<f32> = audio.iter().copied().map(finite).collect();
        let columns = self.ids.len();
        let total = audio.len().div_ceil(FRAME_SAMPLES);
        let mut log_probs = vec![0f32; total * columns];
        let mut filled = vec![false; total];
        let margin = (WINDOW_SAMPLES - HOP_SAMPLES) / 2;
        let mut starts: Vec<usize> = (0..=audio.len().saturating_sub(WINDOW_SAMPLES))
            .step_by(HOP_SAMPLES)
            .collect();
        if starts
            .last()
            .is_some_and(|&s| s + WINDOW_SAMPLES < audio.len())
        {
            starts.push(audio.len() - WINDOW_SAMPLES);
        }
        for (group, batch) in starts.chunks(THREADS).enumerate() {
            if cancel.load(Ordering::Relaxed) {
                return Err(ModelError::Cancelled);
            }
            // Her pencere kendi kısa ömürlü iş parçacığında (bkz. modül açıklaması: AVX durumu).
            let results: Vec<Result<Vec<f32>, ModelError>> = std::thread::scope(|scope| {
                let handles: Vec<_> = batch
                    .iter()
                    .map(|&start| {
                        let end = (start + WINDOW_SAMPLES).min(audio.len());
                        let window = &audio[start..end];
                        scope.spawn(move || self.run_window(window))
                    })
                    .collect();
                handles
                    .into_iter()
                    .map(|h| {
                        h.join()
                            .unwrap_or_else(|_| Err(ModelError::Run("pencere çöktü".into())))
                    })
                    .collect()
            });
            for (i, (result, &start)) in results.into_iter().zip(batch).enumerate() {
                let window = result?;
                let k = group * THREADS + i;
                let end = (start + WINDOW_SAMPLES).min(audio.len());
                // Kenar payı ilk ve son pencerede yok.
                let low = if k == 0 { 0 } else { margin };
                let high = if end >= audio.len() {
                    end - start
                } else {
                    WINDOW_SAMPLES - margin
                };
                for (j, row) in window.chunks_exact(columns).enumerate() {
                    let center = FRAME_SAMPLES * j + RECEPTIVE_SAMPLES / 2;
                    if center < low || center > high {
                        continue;
                    }
                    let g = (start + center) / FRAME_SAMPLES;
                    if g < total && !filled[g] {
                        log_probs[g * columns..(g + 1) * columns].copy_from_slice(row);
                        filled[g] = true;
                    }
                }
            }
        }
        // Boş kalan kare (pencerenin ucundaki son yarım kare ya da sınır yuvarlaması): önceki dolu
        // kare; baştakiler ilk dolu kare.
        let Some(first) = filled.iter().position(|&f| f) else {
            return Err(ModelError::TooShort);
        };
        let mut last_filled = first;
        for (g, &done) in filled.iter().enumerate() {
            if done {
                last_filled = g;
            } else {
                let source = if g < first { first } else { last_filled };
                let (a, b) = (source * columns, g * columns);
                log_probs.copy_within(a..a + columns, b);
            }
        }
        Ok(Emissions {
            frames: total,
            columns,
            log_probs,
            frame_secs: FRAME_SAMPLES as f64 / f64::from(SAMPLE_RATE),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// Projenin küçük deneme modeli (`tests/data/soz-modeli/uret.py`): gerçek modelin kare geometrisi
    /// (alıcı alan 400, adım 320); 'a' logiti alıcı alanın toplamı ×0,1, 'b' ×−0,1.
    fn test_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/soz-modeli")
    }

    fn shas(dir: &Path) -> (String, String) {
        (
            file_sha256(&dir.join(MODEL_FILE)).expect("özet"),
            file_sha256(&dir.join(TOKENS_FILE)).expect("özet"),
        )
    }

    fn open_test_model() -> LyricsModel {
        let dir = test_dir();
        let (model, tokens) = shas(&dir);
        LyricsModel::open(&dir, &model, &tokens).expect("model açılır")
    }

    /// 37 karelik bloklar (pencere sınırlarıyla hizasız): çift blok +0,5 ('a'), tek blok −0,5 ('b').
    fn audio(frames: usize) -> Vec<f32> {
        (0..frames * FRAME_SAMPLES)
            .map(|i| {
                if (i / FRAME_SAMPLES / 37).is_multiple_of(2) {
                    0.5
                } else {
                    -0.5
                }
            })
            .collect()
    }

    fn expected(frames: usize) -> Vec<char> {
        (0..frames)
            .map(|g: usize| if (g / 37).is_multiple_of(2) { 'a' } else { 'b' })
            .collect()
    }

    fn argmax_letters(model: &LyricsModel, em: &Emissions) -> Vec<char> {
        let a = model.vocabulary().letters[&'a'];
        let b = model.vocabulary().letters[&'b'];
        (0..em.frames)
            .map(|t| {
                let row = &em.log_probs[t * em.columns..(t + 1) * em.columns];
                if row[a] > row[b] {
                    'a'
                } else {
                    'b'
                }
            })
            .collect()
    }

    #[test]
    fn pencereler_birlesince_her_kare_dogru_yerde() {
        // 80 sn: dört pencere (0, 20, 40, 50 sn), iki grup; gerçek geometride kare kaymaz (bağımsız
        // incelemenin karşı örneği: eski eşleme pencerelerin ikinci yarısında 17 kareyi kaydırıyordu).
        let model = open_test_model();
        let frames = 4000;
        let em = model
            .emissions(&audio(frames), &AtomicBool::new(false))
            .expect("emisyon");
        assert_eq!(em.frames, frames);
        assert_eq!(em.frame_secs, 0.02);
        let got = argmax_letters(&model, &em);
        let wrong: Vec<usize> = (0..frames)
            .filter(|&g| got[g] != expected(frames)[g])
            .collect();
        assert!(wrong.is_empty(), "{} kare yanlış: {wrong:?}", wrong.len());
        // Satırlar log-olasılık: bütün sözlük üzerinden normalize (saklanan sütunların toplamı ≤ 1).
        for t in 0..em.frames {
            let row = &em.log_probs[t * em.columns..(t + 1) * em.columns];
            let total: f64 = row.iter().map(|&v| f64::from(v).exp()).sum();
            assert!(total <= 1.0 + 1e-4 && row.iter().all(|v| v.is_finite()));
        }
    }

    #[test]
    fn pencereden_kisa_ses_ve_sessizlik() {
        let model = open_test_model();
        let em = model
            .emissions(&audio(150), &AtomicBool::new(false))
            .expect("emisyon");
        assert_eq!(em.frames, 150);
        assert_eq!(argmax_letters(&model, &em), expected(150));
        // Bütünüyle sessiz ses de çalışır (sapma 0: ölçek sınırlı).
        let silent = model
            .emissions(&vec![0.0; 3200], &AtomicBool::new(false))
            .expect("emisyon");
        assert!(silent.log_probs.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn cok_kisa_ve_cok_uzun_ses() {
        let model = open_test_model();
        let no = AtomicBool::new(false);
        assert!(matches!(
            model.emissions(&[0.1; 100], &no),
            Err(ModelError::TooShort)
        ));
        let long = vec![0f32; MAX_SECS * SAMPLE_RATE as usize + 1];
        assert!(matches!(
            model.emissions(&long, &no),
            Err(ModelError::TooLong)
        ));
    }

    #[test]
    fn nan_ornek_emisyonu_bozmaz() {
        // Bağımsız incelemenin karşı örneği: tek bir NaN bütün pencereyi bozuyordu.
        let model = open_test_model();
        let mut samples = audio(4000);
        samples[100_000] = f32::NAN;
        samples[200_000] = f32::INFINITY;
        let em = model
            .emissions(&samples, &AtomicBool::new(false))
            .expect("emisyon");
        assert!(em.log_probs.iter().all(|v| v.is_finite()));
        assert_eq!(argmax_letters(&model, &em), expected(4000));
    }

    #[test]
    fn model_cagiran_is_parcacigini_yavaslatmaz() {
        // Bağımsız incelemenin karşı örneği: tract'ın AVX çekirdekleri `vzeroupper` yapmadan döner;
        // aynı iş parçacığındaki sonraki kayan nokta işi Intel'de ~19 kat yavaşlıyordu (AMD'de ceza
        // yok, test orada yanlış alarm vermez).
        fn work() -> f64 {
            let t = std::time::Instant::now();
            let mut x = 0.0f64;
            for i in 0..3_000_000 {
                x = (x + (f64::from(i) * -1e-6).exp().ln_1p()) * 0.5;
            }
            std::hint::black_box(x);
            t.elapsed().as_secs_f64()
        }
        let model = open_test_model();
        let before = work().min(work());
        model
            .emissions(&audio(1165), &AtomicBool::new(false))
            .expect("emisyon");
        let after = work().min(work());
        assert!(after < 5.0 * before, "{before:.3} → {after:.3} sn");
    }

    #[test]
    fn sarki_16_khz_monoya_cozulur() {
        // Projenin sentetik sesi (44,1 kHz stereo): süre korunur, 16 kHz.
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/uc-uc-ton.flac");
        let info = Decoder::open(&path).expect("açılır").info().clone();
        let samples = decode_mono(&path, &AtomicBool::new(false)).expect("çözülür");
        let secs = samples.len() as f64 / f64::from(SAMPLE_RATE);
        let expected = info.duration_secs.expect("süre");
        assert!((secs - expected).abs() < 0.01, "{secs} != {expected}");
        assert!(samples.iter().all(|v| v.is_finite()) && samples.iter().any(|v| v.abs() > 0.01));
        assert!(matches!(
            decode_mono(&path, &AtomicBool::new(true)),
            Err(ModelError::Cancelled)
        ));
    }

    #[test]
    fn iptal_edilir() {
        let model = open_test_model();
        assert!(matches!(
            model.emissions(&audio(1000), &AtomicBool::new(true)),
            Err(ModelError::Cancelled)
        ));
    }

    #[test]
    fn bilinmeyen_paket_acilmaz() {
        let dir = test_dir();
        let (model, tokens) = shas(&dir);
        assert!(matches!(
            LyricsModel::open(&dir, MODEL_SHA256, &tokens),
            Err(ModelError::WrongModel)
        ));
        assert!(matches!(
            LyricsModel::open(&dir, &model, TOKENS_SHA256),
            Err(ModelError::BadTokens)
        ));
        assert!(matches!(
            LyricsModel::open(&dir.join("yok"), &model, &tokens),
            Err(ModelError::Io(_))
        ));
        // Bağımsız incelemenin karşı örneği: harfleri karıştırılmış simge listesi (model aynı).
        let copy = std::env::temp_dir().join(format!("lyraska-soz-paketi-{}", std::process::id()));
        std::fs::create_dir_all(&copy).expect("klasör");
        std::fs::copy(dir.join(MODEL_FILE), copy.join(MODEL_FILE)).expect("kopya");
        std::fs::write(
            copy.join(TOKENS_FILE),
            "<s> 0\n<pad> 1\n</s> 2\n<unk> 3\n  4\nb 5\na 6\nR 7\n",
        )
        .expect("yaz");
        assert!(matches!(
            LyricsModel::open(&copy, &model, &tokens),
            Err(ModelError::BadTokens)
        ));
        let _ = std::fs::remove_dir_all(&copy);
    }

    #[test]
    fn simge_listesi() {
        let (ids, vocab) =
            parse_tokens("<s> 0\n<pad> 1\n  4\na 5\nR 6\nş 7\nж 8\n窝 9\nab 10\n' 11\n")
                .expect("liste");
        // blank, ayırıcı, sonra kimlik sırasıyla saklanan harfler (büyük harf, CJK, çok harfli yok).
        assert_eq!(ids, [0, 4, 5, 7, 8, 11]);
        assert_eq!(vocab.blank, 0);
        assert_eq!(vocab.space, Some(1));
        assert_eq!(vocab.letters[&'a'], 2);
        assert_eq!(vocab.letters[&'ş'], 3);
        assert_eq!(vocab.letters[&'ж'], 4);
        assert_eq!(vocab.letters[&'\''], 5);
        assert!(!vocab.letters.contains_key(&'R') && !vocab.letters.contains_key(&'窝'));
        assert!(matches!(
            parse_tokens("a 1\nb 2\n"),
            Err(ModelError::BadTokens)
        ));
        assert!(matches!(
            parse_tokens("  4\na x\n"),
            Err(ModelError::BadTokens)
        ));
        // Bağımsız incelemenin karşı örneği: çok büyük kimlik taşmaz, reddedilir.
        assert!(matches!(
            parse_tokens("<s> 0\n  4\na 18446744073709551615\n"),
            Err(ModelError::BadTokens)
        ));
    }
}
