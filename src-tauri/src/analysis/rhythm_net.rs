//! Ritim modelinin çalıştırılması: Beat This small0 (Foscarin, Schlüter, Widmer, ISMIR 2024; kod ve
//! ağırlıklar MIT) `tract` ile. Giriş ve çıkışın saf hesabı [`super::rhythm_model`]'de; burada model
//! dosyası açılır, parçalar çalıştırılır ve şarkının vuruş ve ölçü başı zamanları çıkar.
//!
//! - **Model dosyası** kurulum dosyasıyla gelir (CI ağırlıkları indirip SHA-256 ile denetler ve
//!   `ritim-modeli/onnx_cevir.py` ile ONNX'e çevirir; depoya girmez). Dosya güvenilmez sayılır: bilinen
//!   özetle ([`MODEL_SHA256`]) aynı değilse açılmaz; bir kez okunur, aynı baytlar hem özetlenir hem açılır.
//! - **Şekil:** 1500 karelik (30 sn) parça için plan açılışta bir kez kurulur. Bir parçadan kısa şarkının
//!   tek parçası kendi uzunluğunda çalışır (Beat This de öyle yapar); onun planı o an kurulur.
//! - **İş parçacıkları:** parçalar kısa ömürlü iş parçacıklarında çalışır (tract'ın AVX çekirdekleri
//!   `vzeroupper` yapmadan döner, aynı iş parçacığındaki sonraki kayan nokta işi yavaşlar; `lyrics_model`).

use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use sha2::{Digest, Sha256};
use tract_onnx::prelude::*;

use super::rhythm_model::{self, MelFrame, CHUNK_FRAMES, N_MELS};

/// Kurulum dosyasındaki model dosyasının adı (Tauri kaynağı) ve bilinen özeti.
pub const MODEL_FILE: &str = "ritim-modeli.onnx";
pub const MODEL_SHA256: &str = "b63d4fddc2e1289f4f3689110bf75d5cb892eb88e93ee20853a825c14e5b49f7";
/// Model dosyasının en büyük boyu (gerçeği 9 491 762 bayt).
const MAX_MODEL_BYTES: u64 = 64 << 20;
/// En uzun şarkı (sn): söz modeliyle aynı sınır; daha uzunu modelle analiz edilmez.
pub const MAX_SECS: usize = 20 * 60;

#[derive(Debug, thiserror::Error)]
pub enum RhythmNetError {
    #[error("ritim modeli okunamadı: {0}")]
    Io(#[from] std::io::Error),
    #[error("ritim modeli bilinen dosya değil (bozuk ya da başka bir model)")]
    WrongModel,
    #[error("ritim modeli çalıştırılamadı: {0}")]
    Run(String),
    #[error("şarkı ritim modeli için çok uzun (en çok {} dk)", MAX_SECS / 60)]
    TooLong,
    #[error("iptal edildi")]
    Cancelled,
}

impl From<TractError> for RhythmNetError {
    fn from(e: TractError) -> Self {
        Self::Run(e.to_string())
    }
}

/// Modelin bir şarkıdaki sonucu: vuruş ve ölçü başı zamanları (sn) ve kare kare logitler.
#[derive(Debug, Clone, PartialEq)]
pub struct RhythmNetOutput {
    pub beats: Vec<f64>,
    pub downbeats: Vec<f64>,
    pub beat_logits: Vec<f32>,
    pub downbeat_logits: Vec<f32>,
}

type Plan = TypedRunnableModel;
/// Bir parçanın (ya da şarkının) logitleri: vuruş, ölçü başı.
type Logits = (Vec<f32>, Vec<f32>);

/// Açılmış ritim modeli.
pub struct RhythmNet {
    /// Açılışta yüklenen (şekli serbest) model: kısa parçaların planı bundan kurulur.
    model: InferenceModel,
    /// 1500 karelik parçanın planı.
    full: std::sync::Arc<Plan>,
}

fn hex(digest: &[u8]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn plan_for(model: &InferenceModel, frames: usize) -> Result<std::sync::Arc<Plan>, RhythmNetError> {
    Ok(model
        .clone()
        .with_input_fact(0, f32::fact([1, frames, N_MELS]).into())?
        .into_optimized()?
        .into_runnable()?)
}

impl RhythmNet {
    /// Model dosyasını açar; özeti `sha256` ile aynı olmalı.
    pub fn open(path: &Path, sha256: &str) -> Result<Self, RhythmNetError> {
        if std::fs::metadata(path)?.len() > MAX_MODEL_BYTES {
            return Err(RhythmNetError::WrongModel);
        }
        let mut bytes = Vec::new();
        std::fs::File::open(path)?
            .take(MAX_MODEL_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_MODEL_BYTES || hex(&Sha256::digest(&bytes)) != sha256 {
            return Err(RhythmNetError::WrongModel);
        }
        let model = tract_onnx::onnx()
            .with_ignore_output_shapes(true)
            .with_ignore_value_info(true)
            .model_for_read(&mut bytes.as_slice())?;
        drop(bytes);
        let full = plan_for(&model, CHUNK_FRAMES)?;
        Ok(Self { model, full })
    }

    /// Bir parçanın logitleri (vuruş, ölçü başı), parçanın uzunluğunda.
    fn run_chunk(&self, input: &[MelFrame]) -> Result<Logits, RhythmNetError> {
        let frames = input.len();
        let plan = if frames == CHUNK_FRAMES {
            self.full.clone()
        } else {
            plan_for(&self.model, frames)?
        };
        let flat: Vec<f32> = input
            .iter()
            .flat_map(|f| f.iter().map(|&v| if v.is_finite() { v } else { 0.0 }))
            .collect();
        let tensor: Tensor = tract_ndarray::Array3::from_shape_vec((1, frames, N_MELS), flat)
            .map_err(|e| RhythmNetError::Run(e.to_string()))?
            .into();
        let outputs = plan.run(tvec!(tensor.into()))?;
        let read = |i: usize| -> Result<Vec<f32>, RhythmNetError> {
            let view = outputs
                .get(i)
                .ok_or_else(|| RhythmNetError::Run("çıktı eksik".into()))?
                .to_plain_array_view::<f32>()?;
            if view.shape() != [1, frames] {
                return Err(RhythmNetError::Run(format!(
                    "beklenmeyen çıktı şekli {:?}",
                    view.shape()
                )));
            }
            Ok(view.iter().copied().collect())
        };
        Ok((read(0)?, read(1)?))
    }

    /// Log-mel spektrumunun kare kare logitleri (vuruş, ölçü başı): parçalara bölünür, `threads`
    /// parça aynı anda çalışır, kenarlar atılarak birleştirilir (Beat This `split_predict_aggregate`).
    /// `cancel` her parça grubundan önce denetlenir.
    pub fn logits(
        &self,
        spect: &[MelFrame],
        threads: usize,
        cancel: &AtomicBool,
    ) -> Result<Logits, RhythmNetError> {
        let frames = spect.len();
        let starts = rhythm_model::chunk_starts(frames);
        let mut beat_chunks = Vec::with_capacity(starts.len());
        let mut downbeat_chunks = Vec::with_capacity(starts.len());
        for batch in starts.chunks(threads.max(1)) {
            if cancel.load(Ordering::Relaxed) {
                return Err(RhythmNetError::Cancelled);
            }
            let results: Vec<Result<Logits, RhythmNetError>> = std::thread::scope(|scope| {
                let handles: Vec<_> = batch
                    .iter()
                    .map(|&start| {
                        scope
                            .spawn(move || self.run_chunk(&rhythm_model::chunk_input(spect, start)))
                    })
                    .collect();
                handles
                    .into_iter()
                    .map(|h| {
                        h.join()
                            .unwrap_or_else(|_| Err(RhythmNetError::Run("parça çöktü".into())))
                    })
                    .collect()
            });
            for (result, &start) in results.into_iter().zip(batch) {
                let (beat, downbeat) = result?;
                beat_chunks.push((start, beat));
                downbeat_chunks.push((start, downbeat));
            }
        }
        Ok((
            rhythm_model::aggregate(frames, &beat_chunks),
            rhythm_model::aggregate(frames, &downbeat_chunks),
        ))
    }

    /// 22 050 Hz mono sesin vuruşları ve ölçü başları (Beat This `minimal` son işlemi).
    pub fn analyze(
        &self,
        samples: &[f32],
        threads: usize,
        cancel: &AtomicBool,
    ) -> Result<RhythmNetOutput, RhythmNetError> {
        if samples.len() > MAX_SECS * rhythm_model::SAMPLE_RATE as usize {
            return Err(RhythmNetError::TooLong);
        }
        let spect = rhythm_model::log_mel(samples);
        if cancel.load(Ordering::Relaxed) {
            return Err(RhythmNetError::Cancelled);
        }
        let (beat_logits, downbeat_logits) = self.logits(&spect, threads, cancel)?;
        let (beats, downbeats) = rhythm_model::pick(&beat_logits, &downbeat_logits);
        Ok(RhythmNetOutput {
            beats,
            downbeats,
            beat_logits,
            downbeat_logits,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// `tests/data/ritim-modeli/uret.py`'nin modeli: beat[t] = s[t−1] + 8·s[t] + s[t+1] − 5 (band 0),
    /// downbeat aynı biçimde band 1'den; zamanda sıfır dolgulu.
    const TEST_SHA256: &str = "e0273ad98a3d4ce7c1ae92b4f2b05f3ef8c5af395c5cfb5f3e55a4288e14e4d6";

    fn test_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/ritim-modeli/deneme.onnx")
    }

    fn open_test() -> RhythmNet {
        RhythmNet::open(&test_path(), TEST_SHA256).expect("deneme modeli açılır")
    }

    /// Modelin elle hesabı (bağımsız): evrişim, şarkının kenarında sıfır dolgu.
    fn expected(spect: &[MelFrame], band: usize) -> Vec<f32> {
        let at = |t: isize| -> f32 {
            if t < 0 || t >= spect.len() as isize {
                0.0
            } else {
                spect[t as usize][band]
            }
        };
        (0..spect.len() as isize)
            .map(|t| at(t - 1) + 8.0 * at(t) + at(t + 1) - 5.0)
            .collect()
    }

    /// Her kareye farklı değer: kare `t`'de band 0 = sin, band 1 = cos (parçanın yanlış yere
    /// yazılması ya da kenarın atılmaması farklı değer verir).
    fn varied(frames: usize) -> Vec<MelFrame> {
        (0..frames)
            .map(|t| {
                let mut f = [0.0f32; N_MELS];
                f[0] = (t as f32 * 0.37).sin();
                f[1] = (t as f32 * 0.21).cos();
                f[2] = 9.0;
                f
            })
            .collect()
    }

    fn assert_close(got: &[f32], want: &[f32]) {
        assert_eq!(got.len(), want.len());
        for (t, (g, w)) in got.iter().zip(want).enumerate() {
            assert!((g - w).abs() < 1e-4, "kare {t}: {g} ≠ {w}");
        }
    }

    #[test]
    fn parcalar_birlesince_her_kare_dogru_yerde() {
        let net = open_test();
        // 1 parça kısa (kendi uzunluğunda), tam 1500, birkaç parça, son parça çok örtüşen.
        for frames in [7, 437, 1488, 1500, 1501, 3000, 4471] {
            let spect = varied(frames);
            for threads in [1, 3] {
                let (b, d) = net
                    .logits(&spect, threads, &AtomicBool::new(false))
                    .expect("çalışır");
                assert_close(&b, &expected(&spect, 0));
                assert_close(&d, &expected(&spect, 1));
            }
        }
    }

    #[test]
    fn ses_vuruslara_cevrilir() {
        let net = open_test();
        // Band 0'ı yükselten tıklar log-mel'den geçip vuruş olur: her 0,5 sn'de bir kısa tık, 6 sn.
        let sr = rhythm_model::SAMPLE_RATE as usize;
        let mut samples = vec![0f32; 6 * sr];
        for k in 0..12 {
            let at = k * sr / 2 + 2000;
            for n in 0..64 {
                samples[at + n] = if n % 2 == 0 { 0.9 } else { -0.9 };
            }
        }
        let out = net
            .analyze(&samples, 2, &AtomicBool::new(false))
            .expect("çalışır");
        assert_eq!(out.beat_logits.len(), 1 + samples.len() / 441);
        // Deneme modeli band 0'dan beat, band 1'den downbeat verir; tık bütün bantları doldurur.
        assert_eq!(out.beats.len(), 12, "{:?}", out.beats);
        for (k, b) in out.beats.iter().enumerate() {
            let t = (k * sr / 2 + 2032) as f64 / sr as f64;
            assert!((b - t).abs() <= 0.021, "vuruş {k}: {b} ≠ {t}");
        }
        assert_eq!(out.downbeats, out.beats);
    }

    #[test]
    fn bilinmeyen_model_acilmaz() {
        assert!(matches!(
            RhythmNet::open(&test_path(), MODEL_SHA256),
            Err(RhythmNetError::WrongModel)
        ));
        let missing = test_path().with_file_name("yok.onnx");
        assert!(matches!(
            RhythmNet::open(&missing, TEST_SHA256),
            Err(RhythmNetError::Io(_))
        ));
    }

    #[test]
    fn iptal_ve_uzun_ses() {
        let net = open_test();
        assert!(matches!(
            net.logits(&varied(3000), 1, &AtomicBool::new(true)),
            Err(RhythmNetError::Cancelled)
        ));
        let long = vec![0f32; MAX_SECS * rhythm_model::SAMPLE_RATE as usize + 1];
        assert!(matches!(
            net.analyze(&long, 1, &AtomicBool::new(false)),
            Err(RhythmNetError::TooLong)
        ));
    }

    #[test]
    fn bos_ve_cok_kisa_ses() {
        let net = open_test();
        let out = net
            .analyze(&[0.0; 100], 1, &AtomicBool::new(false))
            .expect("çalışır");
        assert!(out.beats.is_empty() && out.beat_logits.is_empty());
    }

    /// Gerçek modelde tract'ın sonucu onnxruntime'ınkiyle aynı (elle; model ve referans dosyası
    /// `ritim-modeli/onnx_cevir.py` ve `docs/arastirma/ritim-olcum/`). `LYRASKA_RITIM_MODELI` model dosyası.
    #[test]
    #[ignore = "gerçek ritim modeli gerekir; elle: LYRASKA_RITIM_MODELI"]
    fn gercek_model_acilir_ve_calisir() {
        let path = PathBuf::from(std::env::var("LYRASKA_RITIM_MODELI").expect("model yolu"));
        let net = RhythmNet::open(&path, MODEL_SHA256).expect("açılır");
        let sr = rhythm_model::SAMPLE_RATE as usize;
        // 120 BPM tık izi, 40 sn (iki parça): vuruşlar 0,5 sn arayla bulunmalı.
        let mut samples = vec![0f32; 40 * sr];
        for k in 0..80 {
            let at = k * sr / 2;
            for n in 0..400 {
                samples[at + n] += 0.8 * (-(n as f32) / 60.0).exp() * ((n as f32) * 0.9).sin();
            }
        }
        let t = std::time::Instant::now();
        let out = net
            .analyze(&samples, 2, &AtomicBool::new(false))
            .expect("çalışır");
        println!(
            "{:.2} sn; {} vuruş, {} ölçü başı; ilk vuruşlar {:?}",
            t.elapsed().as_secs_f64(),
            out.beats.len(),
            out.downbeats.len(),
            &out.beats[..out.beats.len().min(6)]
        );
        let inside: Vec<f64> = out
            .beats
            .iter()
            .copied()
            .filter(|b| (1.0..39.0).contains(b))
            .collect();
        assert!(inside.len() >= 70, "{} vuruş", inside.len());
        for w in inside.windows(2) {
            assert!((w[1] - w[0] - 0.5).abs() < 0.03, "aralık {}", w[1] - w[0]);
        }
    }
}
