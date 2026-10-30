//! Sözleri sese oturtmak için modelin emisyonları (`docs/arastirma/soz-hizalama/`): şarkının sesi her
//! 20 ms'lik karede hangi harfin söylendiğine dair log-olasılıklara çevrilir; yerleşim `lyrics_align`.
//!
//! Model Omnilingual ASR CTC 300M v2 (Meta, Apache-2.0; sherpa-onnx int8 dönüşümü). Programla gelmez:
//! kullanıcı "Söz paketi"ni ekler, dosyalar veri klasöründe durur. Model dosyası güvenilmez girdi
//! sayılır: SHA-256'sı bilinen dosyayla aynı değilse açılmaz.
//!
//! - **Çalıştırıcı:** `tract` (saf Rust, ek DLL yok), tek iş parçacığı. Model dosyası değiştirilmez;
//!   giriş şekli kodda sabitlenir (`WINDOW_SAMPLES`).
//! - **Pencere:** ses `WINDOW_SECS` sn'lik pencerelerle (`HOP_SECS` adım) modele verilir; her pencere
//!   kendi ortalaması ve sapmasıyla ölçeklenir, karelerin pencerenin kenarından uzak olanı alınır
//!   (birinci ekibin ve denetimin yöntemi). Pencereler arasında iptal denetlenir.
//! - **Sütunlar:** blank, kelime ayırıcısı, kesme işareti ve Latin, Yunan, Kiril harfleri (~410);
//!   log-olasılık bütün sözlük (10 288 simge) üzerinden hesaplanır, yalnızca bu sütunlar saklanır.
//!   Böylece emisyonlar sözden bağımsızdır: söz düzeltilince model yeniden çalışmaz.

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
/// Bir karenin örnek sayısı (20 ms).
pub const FRAME_SAMPLES: usize = 320;
/// Pencere ve adım (sn).
pub const WINDOW_SECS: usize = 10;
pub const HOP_SECS: usize = 6;
const WINDOW_SAMPLES: usize = WINDOW_SECS * SAMPLE_RATE as usize;
const HOP_SAMPLES: usize = HOP_SECS * SAMPLE_RATE as usize;

/// Söz paketindeki dosyalar.
pub const MODEL_FILE: &str = "model.int8.onnx";
pub const TOKENS_FILE: &str = "tokens.txt";
/// Ölçülen model dosyasının SHA-256'sı (`docs/arastirma/soz-hizalama/model-sha256.txt`).
pub const MODEL_SHA256: &str = "e3042b2f3b3ef0af2211bf99d2b4bf94a21f5ac0e9898827e7dd6d003a860e91";

#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("söz paketi okunamadı: {0}")]
    Io(#[from] std::io::Error),
    #[error("söz paketinin model dosyası bilinen dosya değil (bozuk ya da başka bir model)")]
    WrongModel,
    #[error("söz paketinin simge listesi bozuk")]
    BadTokens,
    #[error("model çalıştırılamadı: {0}")]
    Run(String),
    #[error("iptal edildi")]
    Cancelled,
}

impl From<TractError> for ModelError {
    fn from(e: TractError) -> Self {
        Self::Run(e.to_string())
    }
}

/// Şarkıyı modelin girişine çevirir: kanalların ortalaması, 16 kHz (`resample` ile), f32.
/// `cancel` her çözülen dilimde denetlenir.
pub fn decode_mono(path: &Path, cancel: &AtomicBool) -> Result<Vec<f32>, ModelError> {
    let mut decoder = Decoder::open(path).map_err(|e| ModelError::Run(e.to_string()))?;
    let channels = decoder.info().channels.max(1);
    let rate = decoder.info().sample_rate;
    let mut converter =
        Converter::new(rate, 1, SAMPLE_RATE, 1).map_err(|e| ModelError::Run(e.to_string()))?;
    let mut mono = Vec::new();
    let mut out = Vec::new();
    while let Some(chunk) = decoder
        .next_chunk()
        .map_err(|e| ModelError::Run(e.to_string()))?
    {
        if cancel.load(Ordering::Relaxed) {
            return Err(ModelError::Cancelled);
        }
        mono.clear();
        mono.extend(
            chunk
                .chunks_exact(channels)
                .map(|frame| frame.iter().sum::<f64>() / channels as f64),
        );
        let converted = converter
            .process(&mono)
            .map_err(|e| ModelError::Run(e.to_string()))?;
        out.extend(converted.iter().map(|&v| v as f32));
    }
    let rest = converter
        .finish()
        .map_err(|e| ModelError::Run(e.to_string()))?;
    out.extend(rest.iter().map(|&v| v as f32));
    Ok(out)
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
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// Saklanan sütun: kelime ayırıcısı, kesme işareti ya da Latin/Yunan/Kiril küçük harf.
fn kept_letter(c: char) -> bool {
    let code = c as u32;
    let script = code < 0x250 || (0x370..0x500).contains(&code) || (0x1E00..0x1F00).contains(&code);
    c == '\'' || (script && c.is_alphabetic() && !c.is_uppercase())
}

/// Simge listesi (`tokens.txt`: "simge kimlik" satırları; kelime ayırıcısının adı boştur) →
/// saklanan simgelerin kimlikleri (sütun sırası) ve harf → sütun sözlüğü.
fn parse_tokens(text: &str) -> Result<(Vec<usize>, Vocabulary), ModelError> {
    let mut space = None;
    let mut letters: Vec<(char, usize)> = Vec::new();
    let mut count = 0;
    for line in text.lines() {
        let Some((name, id)) = line.rsplit_once(' ') else {
            continue;
        };
        let id: usize = id.trim().parse().map_err(|_| ModelError::BadTokens)?;
        count = count.max(id + 1);
        let name = name.trim_end_matches(' ');
        let mut chars = name.chars();
        match (chars.next(), chars.next()) {
            (None, _) => space = Some(id),
            (Some(c), None) if kept_letter(c) => letters.push((c, id)),
            _ => {}
        }
    }
    // Blank 0. simge ("<s>"; birinci ekibin ve denetimin ölçtüğü düzen).
    let Some(space) = space else {
        return Err(ModelError::BadTokens);
    };
    if letters.is_empty() || count < 2 {
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
    /// Söz paketinin klasöründen açar; model dosyasının özeti `expected_sha256` olmalı.
    pub fn open(dir: &Path, expected_sha256: &str) -> Result<Self, ModelError> {
        let model_path = dir.join(MODEL_FILE);
        if file_sha256(&model_path)? != expected_sha256 {
            return Err(ModelError::WrongModel);
        }
        let (ids, vocab) = parse_tokens(&std::fs::read_to_string(dir.join(TOKENS_FILE))?)?;
        let plan = tract_onnx::onnx()
            .with_ignore_output_shapes(true)
            .with_ignore_value_info(true)
            .model_for_path(&model_path)?
            .with_input_fact(0, f32::fact([1, WINDOW_SAMPLES]).into())?
            .into_optimized()?
            .into_runnable()?;
        Ok(Self { plan, ids, vocab })
    }

    pub fn vocabulary(&self) -> &Vocabulary {
        &self.vocab
    }

    /// Bir pencerenin karelerinin log-olasılıkları (saklanan sütunlar), satır satır.
    fn run_window(&self, samples: &[f32]) -> Result<(usize, Vec<f32>), ModelError> {
        let n = samples.len() as f64;
        let mean = samples.iter().map(|&v| f64::from(v)).sum::<f64>() / n;
        let var = samples
            .iter()
            .map(|&v| (f64::from(v) - mean).powi(2))
            .sum::<f64>()
            / n;
        let scale = 1.0 / (var + 1e-5).sqrt();
        // Pencere kısa kalırsa (şarkının sonu) sessizlikle tamamlanır: giriş şekli sabit.
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
        if shape.len() != 3
            || shape[0] != 1
            || shape[2] <= self.ids.iter().copied().max().unwrap_or(0)
        {
            return Err(ModelError::Run(format!(
                "beklenmeyen çıktı şekli {shape:?}"
            )));
        }
        let (frames, tokens) = (shape[1], shape[2]);
        let flat = logits
            .as_slice()
            .ok_or_else(|| ModelError::Run("çıktı bitişik değil".into()))?;
        let mut out = Vec::with_capacity(frames * self.ids.len());
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
        Ok((frames, out))
    }

    /// Şarkının emisyonları. `audio`: 16 kHz mono. `cancel` her pencereden önce denetlenir.
    pub fn emissions(&self, audio: &[f32], cancel: &AtomicBool) -> Result<Emissions, ModelError> {
        let columns = self.ids.len();
        let total = audio.len().div_ceil(FRAME_SAMPLES).max(1);
        let mut log_probs = vec![0f32; total * columns];
        let mut filled = vec![false; total];
        let margin = (WINDOW_SAMPLES - HOP_SAMPLES) as f64 / 2.0;
        let mut starts: Vec<usize> = (0..=audio.len().saturating_sub(WINDOW_SAMPLES))
            .step_by(HOP_SAMPLES)
            .collect();
        if starts
            .last()
            .is_some_and(|&s| s + WINDOW_SAMPLES < audio.len())
        {
            starts.push(audio.len() - WINDOW_SAMPLES);
        }
        for (k, &start) in starts.iter().enumerate() {
            if cancel.load(Ordering::Relaxed) {
                return Err(ModelError::Cancelled);
            }
            let end = (start + WINDOW_SAMPLES).min(audio.len());
            let (frames, window) = self.run_window(&audio[start..end])?;
            if frames == 0 {
                continue;
            }
            // Karenin pencere içindeki orta noktası; kenar payı ilk ve son pencerede yok.
            let step = WINDOW_SAMPLES as f64 / frames as f64;
            let low = if k == 0 { 0.0 } else { margin };
            let high = if end >= audio.len() {
                (end - start) as f64
            } else {
                WINDOW_SAMPLES as f64 - margin
            };
            for (j, row) in window.chunks_exact(columns).enumerate() {
                let center = (j as f64 + 0.5) * step;
                if center < low || center > high {
                    continue;
                }
                let g = ((start as f64 + center) / FRAME_SAMPLES as f64) as usize;
                if g < total && !filled[g] {
                    log_probs[g * columns..(g + 1) * columns].copy_from_slice(row);
                    filled[g] = true;
                }
            }
        }
        // Boş kalan kare (pencere sınırındaki yuvarlama): en yakın dolu kare.
        let any = filled.iter().position(|&f| f);
        if let Some(first) = any {
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
        } else {
            return Err(ModelError::Run("hiç kare üretilmedi".into()));
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

    /// Projenin küçük deneme modeli (`tests/data/soz-modeli/uret.py`): 'a' logiti karenin toplamı
    /// ×0,1, 'b' ×−0,1.
    fn test_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/soz-modeli")
    }

    fn open_test_model() -> LyricsModel {
        let dir = test_dir();
        let sha = file_sha256(&dir.join(MODEL_FILE)).expect("özet");
        LyricsModel::open(&dir, &sha).expect("model açılır")
    }

    /// 37 karelik bloklar (pencere sınırlarıyla hizasız): çift blok +0,5 ('a'), tek blok −0,5 ('b').
    fn audio(frames: usize) -> Vec<f32> {
        (0..frames * FRAME_SAMPLES)
            .map(|i| {
                if (i / FRAME_SAMPLES / 37) % 2 == 0 {
                    0.5
                } else {
                    -0.5
                }
            })
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
        let model = open_test_model();
        // 23,3 sn: üç tam pencere + kısa son; her karenin harfi kendi bloğunun.
        let frames = 1165;
        let em = model
            .emissions(&audio(frames), &AtomicBool::new(false))
            .expect("emisyon");
        assert_eq!(em.frames, frames);
        assert_eq!(em.frame_secs, 0.02);
        let expected: Vec<char> = (0..frames)
            .map(|g| if (g / 37) % 2 == 0 { 'a' } else { 'b' })
            .collect();
        assert_eq!(argmax_letters(&model, &em), expected);
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
        let expected: Vec<char> = (0..150)
            .map(|g| if (g / 37) % 2 == 0 { 'a' } else { 'b' })
            .collect();
        assert_eq!(argmax_letters(&model, &em), expected);
        // Bütünüyle sessiz ses de çalışır (sapma 0: ölçek sınırlı).
        let silent = model
            .emissions(&vec![0.0; 3200], &AtomicBool::new(false))
            .expect("emisyon");
        assert!(silent.log_probs.iter().all(|v| v.is_finite()));
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
    fn bilinmeyen_model_acilmaz() {
        assert!(matches!(
            LyricsModel::open(&test_dir(), MODEL_SHA256),
            Err(ModelError::WrongModel)
        ));
        let missing = test_dir().join("yok");
        assert!(matches!(
            LyricsModel::open(&missing, MODEL_SHA256),
            Err(ModelError::Io(_))
        ));
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
    }
}
