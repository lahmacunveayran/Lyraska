//! Sözleri sese oturtmak için modelin emisyonları (`docs/arastirma/soz-hizalama/`): şarkının sesi her
//! 20 ms'lik karede hangi harfin söylendiğine dair log-olasılıklara çevrilir; yerleşim `lyrics_align`.
//!
//! Model Omnilingual ASR CTC 300M v2 (Meta, Apache-2.0; sherpa-onnx int8 dönüşümü). Programla gelmez:
//! kullanıcı "Söz paketi"ni ekler, dosyalar veri klasöründe durur. Paket güvenilmez girdi sayılır:
//! model dosyası ve simge listesi bilinen dosyalarla (SHA-256) aynı değilse açılmaz; model dosyası bir
//! kez okunur, aynı baytlar hem özetlenir hem açılır.
//!
//! - **Çalıştırıcı:** `tract` (saf Rust, ek DLL yok). Model dosyası değiştirilmez; giriş şekli kodda
//!   sabitlenir. Pencereler `window_threads()` kısa ömürlü iş parçacığında çalışır: tract'ın AVX
//!   çekirdekleri dönüşte `vzeroupper` yapmadığı için aynı iş parçacığındaki sonraki kayan nokta işi
//!   Intel işlemcide ~19 kat yavaşlıyordu (bağımsız inceleme; yerleşim 0,8 → 15 sn).
//! - **Tamsayı çarpımları ondalıklı çalışır** (`dequantize_matmuls`, açılışta, yalnızca bellekte): tract'ın
//!   AVX2 int8 çekirdeği VNNI'siz işlemcide (çoğu ev bilgisayarı) saniyede ~1,2 milyar işlem yaptı
//!   (Ryzen 7 7435HS, Windows; 240 sn ses 3709 sn); f32 çekirdeği ~99 milyar (aynı ses 91 sn, 4 iş
//!   parçacığı). Bedeli bellek: ağırlıklar 366 MB yerine 1,2 GB, açılışta en çok ~2,6 GB.
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
use tract_onnx::pb;
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
/// Aynı anda çalışan pencere: mantıksal çekirdeklerin yarısı (müzik ve görseller için yarısı boş kalır),
/// en az 1, en çok 4. Ölçüm (240 sn ses, 8 çekirdek / 16 iş parçacığı): 1 → 278 sn, 2 → 161, 3 → 119,
/// 4 → 91, 6 → 73 sn; 4'ün üstünde kazanç azalır, bellek artar (2,8 → 3,6 GB).
pub fn window_threads() -> usize {
    std::thread::available_parallelism().map_or(1, |n| (n.get() / 2).clamp(1, 4))
}
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

/// ONNX tensörünün değerleri f32 olarak; yalnızca dosyanın içindeki uint8, int8 ve float veri (başka tür
/// ya da dış dosyadaki veri `None`: çarpım olduğu gibi kalır). Öğe sayısı boyutlarla uyuşmalı.
fn tensor_f32(t: &pb::TensorProto) -> Option<Vec<f32>> {
    use pb::tensor_proto::DataType;
    if !t.external_data.is_empty() || t.dims.iter().any(|&d| d < 0) {
        return None;
    }
    let raw = !t.raw_data.is_empty();
    let values: Vec<f32> = match DataType::try_from(t.data_type).ok()? {
        DataType::Uint8 if raw => t.raw_data.iter().map(|&b| f32::from(b)).collect(),
        DataType::Uint8 => t
            .int32_data
            .iter()
            .map(|&v| u8::try_from(v).ok().map(f32::from))
            .collect::<Option<_>>()?,
        DataType::Int8 if raw => t
            .raw_data
            .iter()
            .map(|&b| f32::from(i8::from_le_bytes([b])))
            .collect(),
        DataType::Int8 => t
            .int32_data
            .iter()
            .map(|&v| i8::try_from(v).ok().map(f32::from))
            .collect::<Option<_>>()?,
        DataType::Float if raw && !t.raw_data.len().is_multiple_of(4) => return None,
        DataType::Float if raw => t
            .raw_data
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect(),
        DataType::Float => t.float_data.clone(),
        _ => return None,
    };
    let count = t
        .dims
        .iter()
        .try_fold(1usize, |n, &d| n.checked_mul(usize::try_from(d).ok()?))?;
    (values.len() == count).then_some(values)
}

/// Dinamik nicemlenmiş çarpımları ondalıklı çarpıma çevirir (model dosyası değişmez; yalnızca bellekteki
/// tanım). onnxruntime'ın `quantize_dynamic` kalıbı:
/// `x → DynamicQuantizeLinear → (x_q, s_x, z_x)`, `MatMulInteger(x_q, W_q, z_x, z_w) → Cast(float) →
/// Mul(·, s_x·s_w)`. Bu, `y = (x_q − z_x)·s_x · (W_q − z_w)·s_w` demektir; yerine `y = x · W` konur,
/// `W = (W_q − z_w)·s_w` (ağırlığın tam değeri; nicemlemenin tanımı). Fark yalnızca girdinin
/// nicemlenmemesidir: `|x − (x_q − z_x)·s_x| ≤ s_x/2` olduğundan her çıktıda `|Δy_j| ≤ (s_x/2)·Σ_k |W_kj|`
/// (testi `eski_yolla_fark_nicemleme_sinirinda`). Ölçek ve sıfır noktası tensör başına (0 boyutlu skaler)
/// olmalı; kalıba tam uymayan çarpım olduğu gibi kalır. Kullanılmayan düğüm ve ağırlıklar atılır (grafik
/// girdileri ve çıktıları korunur); alt grafikli (If, Loop) modele dokunulmaz. Çevrilen çarpım sayısı döner.
fn dequantize_matmuls(model: &mut pb::ModelProto) -> usize {
    let Some(graph) = model.graph.as_mut() else {
        return 0;
    };
    // Alt grafik üst düzeydeki değerleri okuyabilir; tüketicileri burada sayılmaz (bağımsız inceleme).
    if graph
        .node
        .iter()
        .flat_map(|n| &n.attribute)
        .any(|a| a.g.is_some() || !a.graphs.is_empty())
    {
        return 0;
    }
    struct Rewrite {
        matmul: usize,
        input: String,
        weight: String,
        output: String,
        drop: [usize; 2],
    }
    // Anahtar ağırlık, sıfır noktası ve ölçek: aynı W_q başka ölçekle de kullanılabilir (bağımsız inceleme).
    struct Weight {
        name: String,
        dims: Vec<i64>,
        values: Vec<f32>,
    }
    let mut weights: HashMap<(String, u32, u32), Weight> = HashMap::new();
    let mut rewrites = Vec::new();
    {
        let mut consts: HashMap<&str, &pb::TensorProto> = graph
            .initializer
            .iter()
            .map(|t| (t.name.as_str(), t))
            .collect();
        for node in graph.node.iter().filter(|n| n.op_type == "Constant") {
            let value = node.attribute.iter().find(|a| a.name == "value");
            if let (Some(out), Some(t)) = (node.output.first(), value.and_then(|a| a.t.as_ref())) {
                consts.insert(out.as_str(), t);
            }
        }
        let mut producer: HashMap<&str, usize> = HashMap::new();
        let mut consumers: HashMap<&str, Vec<usize>> = HashMap::new();
        for (i, node) in graph.node.iter().enumerate() {
            for out in &node.output {
                producer.insert(out.as_str(), i);
            }
            for input in &node.input {
                consumers.entry(input.as_str()).or_default().push(i);
            }
        }
        let outputs: std::collections::HashSet<&str> =
            graph.output.iter().map(|o| o.name.as_str()).collect();
        // Tek tüketicisi olan, grafiğin çıktısı olmayan ara değerin tüketicisi.
        let only_consumer = |name: &str| match consumers.get(name).map(Vec::as_slice) {
            Some(&[i]) if !outputs.contains(name) => Some(i),
            _ => None,
        };
        // Yalnızca 0 boyutlu tensör: [1, 1, 1] gibi tek öğeli ölçek çıktının şeklini değiştirirdi.
        let scalar = |name: &str| match consts.get(name) {
            Some(t) if t.dims.is_empty() => tensor_f32(t).and_then(|v| v.first().copied()),
            _ => None,
        };
        let standard = |n: &pb::NodeProto| n.domain.is_empty() || n.domain == "ai.onnx";
        for (i, node) in graph.node.iter().enumerate() {
            if node.op_type != "MatMulInteger" || !standard(node) || node.input.len() != 4 {
                continue;
            }
            let (x_q, w_q, z_x, z_w) = (
                &node.input[0],
                &node.input[1],
                &node.input[2],
                &node.input[3],
            );
            let Some(quant) = producer.get(x_q.as_str()).map(|&p| &graph.node[p]) else {
                continue;
            };
            if quant.op_type != "DynamicQuantizeLinear"
                || !standard(quant)
                || quant.input.len() != 1
                || quant.output.len() != 3
                || quant.output[0] != *x_q
                || quant.output[2] != *z_x
            {
                continue;
            }
            let Some(cast) = node.output.first().and_then(|o| only_consumer(o)) else {
                continue;
            };
            let to_float = graph.node[cast]
                .attribute
                .iter()
                .any(|a| a.name == "to" && a.i == pb::tensor_proto::DataType::Float as i64);
            if graph.node[cast].op_type != "Cast" || !standard(&graph.node[cast]) || !to_float {
                continue;
            }
            let Some(mul) = graph.node[cast]
                .output
                .first()
                .and_then(|o| only_consumer(o))
            else {
                continue;
            };
            let mul_node = &graph.node[mul];
            if mul_node.op_type != "Mul" || !standard(mul_node) || mul_node.input.len() != 2 {
                continue;
            }
            let (Some(cast_out), Some(output)) =
                (graph.node[cast].output.first(), mul_node.output.first())
            else {
                continue;
            };
            let Some(scales) = mul_node.input.iter().find(|n| *n != cast_out) else {
                continue;
            };
            // Ölçek çarpımı s_x·s_w: girdinin ölçeği ile ağırlığın skaler ölçeği.
            let Some(scale_node) = producer.get(scales.as_str()).map(|&p| &graph.node[p]) else {
                continue;
            };
            let s_x = &quant.output[1];
            let w_scale = match scale_node.input.as_slice() {
                [a, b] if a == s_x => b,
                [a, b] if b == s_x => a,
                _ => continue,
            };
            if scale_node.op_type != "Mul" || !standard(scale_node) {
                continue;
            }
            let (Some(s_w), Some(z)) = (scalar(w_scale), scalar(z_w)) else {
                continue;
            };
            let key = (w_q.clone(), z.to_bits(), s_w.to_bits());
            if !weights.contains_key(&key) {
                let Some(t) = consts.get(w_q.as_str()) else {
                    continue;
                };
                let (Some(q), 2) = (tensor_f32(t), t.dims.len()) else {
                    continue;
                };
                let w: Vec<f32> = q.iter().map(|&v| (v - z) * s_w).collect();
                if w.iter().any(|v| !v.is_finite()) {
                    continue;
                }
                let name = format!("{w_q}::lyraska_f32_{}", weights.len());
                let dims = t.dims.clone();
                weights.insert(
                    key.clone(),
                    Weight {
                        name,
                        dims,
                        values: w,
                    },
                );
            }
            rewrites.push(Rewrite {
                matmul: i,
                input: quant.input[0].clone(),
                weight: weights[&key].name.clone(),
                output: output.clone(),
                drop: [cast, mul],
            });
        }
    }
    let mut dropped = vec![false; graph.node.len()];
    for r in &rewrites {
        let node = &mut graph.node[r.matmul];
        node.op_type = "MatMul".into();
        node.input = vec![r.input.clone(), r.weight.clone()];
        node.output = vec![r.output.clone()];
        node.attribute.clear();
        for &d in &r.drop {
            dropped[d] = true;
        }
    }
    let mut keep = dropped.iter().map(|&d| !d);
    graph.node.retain(|_| keep.next().unwrap_or(true));
    graph
        .initializer
        .extend(weights.into_values().map(|w| pb::TensorProto {
            name: w.name,
            dims: w.dims,
            data_type: pb::tensor_proto::DataType::Float as i32,
            float_data: w.values,
            ..Default::default()
        }));
    // Artık kullanılmayan düğümler (DynamicQuantizeLinear, ölçek çarpımı) ve ağırlıklar (W_q).
    if !rewrites.is_empty() {
        loop {
            let used: std::collections::HashSet<String> = graph
                .node
                .iter()
                .flat_map(|n| n.input.iter().cloned())
                .chain(graph.output.iter().map(|o| o.name.clone()))
                // Eski biçimde (IR 3) ağırlıklar grafik girdisi olarak da listelenir.
                .chain(graph.input.iter().map(|i| i.name.clone()))
                .collect();
            let before = graph.node.len();
            graph
                .node
                .retain(|n| n.output.iter().any(|o| used.contains(o)));
            if graph.node.len() == before {
                graph.initializer.retain(|t| used.contains(&t.name));
                break;
            }
        }
    }
    rewrites.len()
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
    dequantized: usize,
}

impl LyricsModel {
    /// Söz paketinin klasöründen açar; iki dosyanın özeti verilenlerle aynı olmalı.
    pub fn open(dir: &Path, model_sha256: &str, tokens_sha256: &str) -> Result<Self, ModelError> {
        Self::open_with(dir, model_sha256, tokens_sha256, true)
    }

    /// `dequantize` yalnızca testte kapatılır (eski tamsayı yoluyla karşılaştırma).
    fn open_with(
        dir: &Path,
        model_sha256: &str,
        tokens_sha256: &str,
        dequantize: bool,
    ) -> Result<Self, ModelError> {
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
        let onnx = tract_onnx::onnx()
            .with_ignore_output_shapes(true)
            .with_ignore_value_info(true);
        let mut proto = onnx.proto_model_for_read(&mut model.as_slice())?;
        drop(model);
        let dequantized = if dequantize {
            dequantize_matmuls(&mut proto)
        } else {
            0
        };
        let inference = onnx.model_for_proto_model(&proto)?;
        // tract ağırlıkları kopyaladı: tanım iyileştirmeden önce bırakılır (ölçüm: en yüksek bellek 2,58 →
        // 2,51 GB).
        drop(proto);
        let plan = inference
            .with_input_fact(0, f32::fact([1, WINDOW_SAMPLES]).into())?
            .into_optimized()?
            .into_runnable()?;
        Ok(Self {
            plan,
            ids,
            vocab,
            dequantized,
        })
    }

    /// Ondalıklı çarpıma çevrilen tamsayı çarpımı sayısı (`dequantize_matmuls`; gerçek modelde 146).
    pub fn dequantized_matmuls(&self) -> usize {
        self.dequantized
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
        let threads = window_threads();
        for (group, batch) in starts.chunks(threads).enumerate() {
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
                let k = group * threads + i;
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

    /// onnxruntime'ın dinamik nicemlemesiyle üretilmiş iki katmanlı deneme modeli
    /// (`tests/data/soz-modeli/nicemli_uret.py`): x(16) → W1 → Relu → W2 → y(8).
    fn quantized_proto() -> pb::ModelProto {
        let bytes = std::fs::read(test_dir().join("nicemli.onnx")).expect("deneme modeli");
        tract_onnx::onnx()
            .proto_model_for_read(&mut bytes.as_slice())
            .expect("okunur")
    }

    const ROWS: usize = 5;

    fn run_proto(proto: &pb::ModelProto, x: &[f32]) -> Vec<f32> {
        let plan = tract_onnx::onnx()
            .with_ignore_output_shapes(true)
            .with_ignore_value_info(true)
            .model_for_proto_model(proto)
            .and_then(|m| m.with_input_fact(0, f32::fact([ROWS, 16]).into()))
            .and_then(|m| m.into_optimized())
            .and_then(|m| m.into_runnable())
            .expect("model kurulur");
        let input: Tensor = tract_ndarray::Array2::from_shape_vec((ROWS, 16), x.to_vec())
            .expect("şekil")
            .into();
        let out = plan.run(tvec!(input.into())).expect("çalışır");
        out[0]
            .to_plain_array_view::<f32>()
            .expect("f32")
            .iter()
            .copied()
            .collect()
    }

    /// Girdi: tohumlu, işaretli, bir satırda büyük bir değer (girdi ölçeği büyüsün, nicemleme hatası
    /// görünür olsun).
    fn quantized_input() -> Vec<f32> {
        let mut state = 12345u32;
        let mut x: Vec<f32> = (0..ROWS * 16)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                (state >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0
            })
            .collect();
        x[3] = 4.0;
        x
    }

    /// Ağırlığın tanımdan elle hesaplanmış değeri (kodun okuyucusundan bağımsız): W = (W_q − z)·s;
    /// W_q ham uint8, z `int32_data`, s `float_data` (onnxruntime'ın yazdığı biçim).
    fn manual_weight(proto: &pb::ModelProto, name: &str) -> (Vec<f64>, usize, usize) {
        let graph = proto.graph.as_ref().expect("grafik");
        let get = |n: String| {
            graph
                .initializer
                .iter()
                .find(|t| t.name == n)
                .unwrap_or_else(|| panic!("{n} yok"))
        };
        let q = get(format!("{name}_quantized"));
        let z = f64::from(get(format!("{name}_zero_point")).int32_data[0]);
        let s = f64::from(get(format!("{name}_scale")).float_data[0]);
        let w = q.raw_data.iter().map(|&b| (f64::from(b) - z) * s).collect();
        (w, q.dims[0] as usize, q.dims[1] as usize)
    }

    /// `x · W` (f64) ve her çıktının `Σ_k |x_k·W_kj|` toplamı (yuvarlama payı için).
    fn matmul(x: &[f64], w: &[f64], k: usize, n: usize) -> (Vec<f64>, Vec<f64>) {
        let rows = x.len() / k;
        let mut y = vec![0.0; rows * n];
        let mut abs = vec![0.0; rows * n];
        for r in 0..rows {
            for j in 0..n {
                for i in 0..k {
                    let p = x[r * k + i] * w[i * n + j];
                    y[r * n + j] += p;
                    abs[r * n + j] += p.abs();
                }
            }
        }
        (y, abs)
    }

    #[test]
    fn nicemli_carpimlar_ondalikli_carpima_cevrilir() {
        let mut proto = quantized_proto();
        assert_eq!(dequantize_matmuls(&mut proto), 2);
        let graph = proto.graph.as_ref().expect("grafik");
        let ops: Vec<&str> = graph.node.iter().map(|n| n.op_type.as_str()).collect();
        assert_eq!(ops, ["MatMul", "Relu", "MatMul"]);
        // Tamsayı ağırlıklar bellekte kalmaz; yalnızca iki ondalıklı ağırlık.
        let inits: Vec<(i32, &[i64])> = graph
            .initializer
            .iter()
            .map(|t| (t.data_type, t.dims.as_slice()))
            .collect();
        assert_eq!(inits.len(), 2);
        assert!(inits
            .iter()
            .all(|&(ty, _)| ty == pb::tensor_proto::DataType::Float as i32));
    }

    #[test]
    fn cevrilen_model_elle_hesapla_ayni() {
        let original = quantized_proto();
        let mut proto = original.clone();
        dequantize_matmuls(&mut proto);
        let x = quantized_input();
        let got = run_proto(&proto, &x);
        let (w1, k1, n1) = manual_weight(&original, "W1");
        let (w2, k2, n2) = manual_weight(&original, "W2");
        let x64: Vec<f64> = x.iter().map(|&v| f64::from(v)).collect();
        let (h, h_abs) = matmul(&x64, &w1, k1, n1);
        let r: Vec<f64> = h.iter().map(|&v| v.max(0.0)).collect();
        let (y, y_abs) = matmul(&r, &w2, k2, n2);
        assert_eq!(got.len(), y.len());
        // f32 yuvarlaması: her çarpım ve toplama ≤ 2⁻²⁴ göreli; k ≤ 16 terimde ~k·2⁻²⁴·Σ|terim|.
        let h_err = h_abs.iter().copied().fold(0.0, f64::max) * 16.0 * 2f64.powi(-23);
        let w2_abs: f64 = w2.iter().map(|v| v.abs()).fold(0.0, f64::max) * k2 as f64;
        for (j, (&g, &e)) in got.iter().zip(&y).enumerate() {
            let bound = y_abs[j] * 16.0 * 2f64.powi(-23) + h_err * w2_abs + 1e-6;
            assert!(
                (f64::from(g) - e).abs() <= bound,
                "çıktı {j}: {g} ≠ {e} (sınır {bound})"
            );
        }
    }

    #[test]
    fn eski_yolla_fark_nicemleme_sinirinda() {
        // Eski yol girdiyi nicemler: |x − x̂| ≤ s_x/2, s_x = (max(x, 0) − min(x, 0))/255 (ONNX
        // DynamicQuantizeLinear). Birinci katmanda |Δh_j| ≤ (s_x/2)·Σ_k |W1_kj|; Relu 1-Lipschitz;
        // ikinci katmanda |Δy_m| ≤ Σ_j (|Δh_j| + s_r/2)·|W2_jm|, s_r ≤ (max r + max |Δh|)/255.
        let original = quantized_proto();
        let mut proto = original.clone();
        dequantize_matmuls(&mut proto);
        let x = quantized_input();
        let old = run_proto(&original, &x);
        let new = run_proto(&proto, &x);
        let (w1, k1, n1) = manual_weight(&original, "W1");
        let (w2, k2, n2) = manual_weight(&original, "W2");
        let x64: Vec<f64> = x.iter().map(|&v| f64::from(v)).collect();
        let range = |v: &[f64]| {
            v.iter().fold(0f64, |a, &b| a.max(b)) - v.iter().fold(0f64, |a, &b| a.min(b))
        };
        let s_x = range(&x64) / 255.0;
        let col_abs = |w: &[f64], k: usize, n: usize, j: usize| {
            (0..k).map(|i| w[i * n + j].abs()).sum::<f64>()
        };
        let dh: Vec<f64> = (0..n1)
            .map(|j| s_x / 2.0 * col_abs(&w1, k1, n1, j))
            .collect();
        let (h, _) = matmul(&x64, &w1, k1, n1);
        let max_r = h.iter().fold(0f64, |a, &b| a.max(b));
        let max_dh = dh.iter().copied().fold(0.0, f64::max);
        let s_r = (max_r + max_dh) / 255.0;
        let mut largest = 0f64;
        for (idx, (&o, &n)) in old.iter().zip(&new).enumerate() {
            let m = idx % n2;
            let bound: f64 = (0..k2)
                .map(|j| (dh[j] + s_r / 2.0) * w2[j * n2 + m].abs())
                .sum::<f64>()
                + 1e-4;
            let diff = (f64::from(o) - f64::from(n)).abs();
            largest = largest.max(diff / bound);
            assert!(diff <= bound, "çıktı {idx}: fark {diff} > sınır {bound}");
        }
        // Sınır boş değil: eski yol gerçekten farklı hesaplıyor (nicemleme hatası görünür).
        assert!(largest > 0.01, "fark sınırın %{:.1}'i", largest * 100.0);
    }

    #[test]
    fn kaliba_uymayan_carpim_dokunulmaz() {
        // Birinci çarpımın Cast'i float'a değil int64'e: kalıp bozuk, o çarpım olduğu gibi kalır;
        // ikincisi çevrilir.
        let mut proto = quantized_proto();
        let graph = proto.graph.as_mut().expect("grafik");
        let cast = graph
            .node
            .iter_mut()
            .find(|n| n.op_type == "Cast")
            .expect("cast");
        cast.attribute[0].i = pb::tensor_proto::DataType::Int64 as i64;
        let before = graph.node[..5].to_vec();
        assert_eq!(dequantize_matmuls(&mut proto), 1);
        let graph = proto.graph.as_ref().expect("grafik");
        assert_eq!(&graph.node[..5], before.as_slice());
        // Ölçek bir sabit değil de girdi olunca da (skaler değil) dokunulmaz.
        let mut proto = quantized_proto();
        let graph = proto.graph.as_mut().expect("grafik");
        graph.initializer.retain(|t| t.name != "W2_scale");
        assert_eq!(dequantize_matmuls(&mut proto), 1);
    }

    /// Gerçek "Söz paketi"nde iki yolun aynı sonucu verdiği (eski tamsayı yolu bir pencerede dakikalar
    /// sürer; elle çalıştırılır). `LYRASKA_SOZ_PAKETI` paket klasörü, `LYRASKA_SOZ_SESI` ses,
    /// `LYRASKA_SOZ_METNI` sözü (satır satır). Ölçülen: kare başına en olası harfin uyuşması, satır
    /// başlangıçlarının farkı.
    #[test]
    #[ignore = "gerçek söz paketi ve ses gerekir; elle: LYRASKA_SOZ_PAKETI, LYRASKA_SOZ_SESI, LYRASKA_SOZ_METNI"]
    fn gercek_modelde_iki_yol_ayni_sonucu_verir() {
        let env = |k: &str| std::env::var(k).unwrap_or_else(|_| panic!("{k} gerekli"));
        let dir = PathBuf::from(env("LYRASKA_SOZ_PAKETI"));
        let cancel = AtomicBool::new(false);
        let audio = decode_mono(Path::new(&env("LYRASKA_SOZ_SESI")), &cancel).expect("ses");
        let text = std::fs::read_to_string(env("LYRASKA_SOZ_METNI")).expect("söz");
        let words: Vec<Vec<String>> = super::super::lyrics_text::prepare(&text)
            .into_iter()
            .map(|l| l.words)
            .collect();
        let run = |dequantize: bool| {
            let model = LyricsModel::open_with(&dir, MODEL_SHA256, TOKENS_SHA256, dequantize)
                .expect("paket açılır");
            let t = std::time::Instant::now();
            let em = model.emissions(&audio, &cancel).expect("emisyon");
            let secs = t.elapsed().as_secs_f64();
            let aligned = super::super::lyrics_align::align(&em, model.vocabulary(), &words)
                .expect("yerleşim");
            (model.dequantized_matmuls(), em, aligned, secs)
        };
        let (n_new, new, new_al, new_secs) = run(true);
        let (n_old, old, old_al, old_secs) = run(false);
        assert_eq!((n_new, n_old), (146, 0));
        assert_eq!((new.frames, new.columns), (old.frames, old.columns));
        let c = new.columns;
        let argmax = |row: &[f32]| {
            row.iter()
                .enumerate()
                .max_by(|a, b| a.1.total_cmp(b.1))
                .map(|(i, _)| i)
        };
        let mut same = 0usize;
        let mut same_speech = (0usize, 0usize);
        let mut max_diff = 0f32;
        for f in 0..new.frames {
            let (a, b) = (
                &new.log_probs[f * c..(f + 1) * c],
                &old.log_probs[f * c..(f + 1) * c],
            );
            let (ma, mb) = (argmax(a), argmax(b));
            same += usize::from(ma == mb);
            // Konuşma kareleri: eski yolun en olası simgesi blank değil.
            if mb != Some(0) {
                same_speech.0 += usize::from(ma == mb);
                same_speech.1 += 1;
            }
            for (x, y) in a.iter().zip(b) {
                max_diff = max_diff.max((x - y).abs());
            }
        }
        let agree = same as f64 / new.frames as f64;
        let agree_speech = same_speech.0 as f64 / same_speech.1.max(1) as f64;
        let starts: Vec<f64> = new_al
            .lines
            .iter()
            .zip(&old_al.lines)
            .map(|(a, b)| (a.start - b.start).abs())
            .collect();
        let worst = starts.iter().copied().fold(0.0, f64::max);
        println!(
            "kare {}: en olası harf uyuşması %{:.2} (konuşma karelerinde %{:.2}, {} kare); log-olasılık en büyük fark {max_diff:.3}; satır başı farkları {starts:.3?} sn (en çok {worst:.3}); hüküm yeni {:?}, eski {:?}; süre yeni {new_secs:.1} sn, eski {old_secs:.1} sn",
            new.frames,
            agree * 100.0,
            agree_speech * 100.0,
            same_speech.1,
            new_al.verdict,
            old_al.verdict,
        );
        // Ölçüt: araştırmada tract (int8) ile onnxruntime (int8) arası uyuşma %99,4 (int8'in kendi
        // oynaklığı); satır başları bir kare (20 ms) içinde.
        assert!(agree >= 0.98, "uyuşma %{:.2}", agree * 100.0);
        assert!(worst <= 0.02 + 1e-9, "satır başı farkı {worst:.3} sn");
    }

    #[test]
    fn tensor_degerleri_bicimlerden_okunur() {
        use pb::tensor_proto::DataType;
        let t = |data_type: DataType, dims: Vec<i64>| pb::TensorProto {
            data_type: data_type as i32,
            dims,
            ..Default::default()
        };
        let mut u8_raw = t(DataType::Uint8, vec![3]);
        u8_raw.raw_data = vec![0, 128, 255];
        assert_eq!(tensor_f32(&u8_raw), Some(vec![0.0, 128.0, 255.0]));
        let mut i8_raw = t(DataType::Int8, vec![2]);
        i8_raw.raw_data = vec![0x80, 0x7f];
        assert_eq!(tensor_f32(&i8_raw), Some(vec![-128.0, 127.0]));
        let mut f_raw = t(DataType::Float, vec![1]);
        f_raw.raw_data = 0.25f32.to_le_bytes().to_vec();
        assert_eq!(tensor_f32(&f_raw), Some(vec![0.25]));
        // Boyutla uyuşmayan, aralık dışı, eksik bayt, dış dosya ya da başka tür okunmaz.
        let mut short = t(DataType::Uint8, vec![4]);
        short.raw_data = vec![1, 2];
        assert_eq!(tensor_f32(&short), None);
        let mut big = t(DataType::Uint8, vec![1]);
        big.int32_data = vec![256];
        assert_eq!(tensor_f32(&big), None);
        let mut odd = t(DataType::Float, vec![1]);
        odd.raw_data = vec![0, 0, 0, 0, 0];
        assert_eq!(tensor_f32(&odd), None);
        let mut external = t(DataType::Uint8, vec![1]);
        external.raw_data = vec![1];
        external.external_data = vec![pb::StringStringEntryProto::default()];
        assert_eq!(tensor_f32(&external), None);
        let mut other = t(DataType::Int64, vec![1]);
        other.raw_data = vec![0; 8];
        assert_eq!(tensor_f32(&other), None);
        let mut negative = t(DataType::Uint8, vec![-1]);
        negative.raw_data = vec![1];
        assert_eq!(tensor_f32(&negative), None);
    }
}

/// Bağımsız inceleme: `dequantize_matmuls` için kendi karşı örnek üreteci (deneme modelinin
/// betiğinden bağımsız). Rastgele küçük nicemli grafikler kurulur; çevrilen, tract'ın tamsayı yolu ve
/// tanımdan elle hesap karşılaştırılır; kalıba uymayanların dokunulmadan kaldığı sınanır.
#[cfg(test)]
mod dequantize_counterexamples {
    use super::*;
    use pb::attribute_proto::AttributeType;
    use pb::tensor_proto::DataType;

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn below(&mut self, n: u64) -> u64 {
            self.next() % n
        }
        fn coin(&mut self) -> bool {
            self.next() & 1 == 1
        }
        fn unit(&mut self) -> f64 {
            (self.next() >> 11) as f64 / (1u64 << 53) as f64
        }
    }

    fn node(op: &str, inputs: &[&str], outputs: &[&str]) -> pb::NodeProto {
        pb::NodeProto {
            op_type: op.into(),
            input: inputs.iter().map(|s| s.to_string()).collect(),
            output: outputs.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    fn cast(input: &str, output: &str, to: DataType) -> pb::NodeProto {
        let mut n = node("Cast", &[input], &[output]);
        n.attribute.push(pb::AttributeProto {
            name: "to".into(),
            r#type: AttributeType::Int as i32,
            i: to as i64,
            ..Default::default()
        });
        n
    }

    fn constant(output: &str, t: pb::TensorProto) -> pb::NodeProto {
        let mut n = node("Constant", &[], &[output]);
        n.attribute.push(pb::AttributeProto {
            name: "value".into(),
            r#type: AttributeType::Tensor as i32,
            t: Some(t),
            ..Default::default()
        });
        n
    }

    fn int_tensor(
        name: &str,
        dims: &[i64],
        vals: &[i32],
        signed: bool,
        raw: bool,
    ) -> pb::TensorProto {
        let ty = if signed {
            DataType::Int8
        } else {
            DataType::Uint8
        };
        let mut t = pb::TensorProto {
            name: name.into(),
            dims: dims.to_vec(),
            data_type: ty as i32,
            ..Default::default()
        };
        if raw {
            t.raw_data = vals.iter().map(|&v| v as u8).collect();
        } else {
            t.int32_data = vals.to_vec();
        }
        t
    }

    fn f32_tensor(name: &str, dims: &[i64], vals: &[f32], raw: bool) -> pb::TensorProto {
        let mut t = pb::TensorProto {
            name: name.into(),
            dims: dims.to_vec(),
            data_type: DataType::Float as i32,
            ..Default::default()
        };
        if raw {
            t.raw_data = vals.iter().flat_map(|v| v.to_le_bytes()).collect();
        } else {
            t.float_data = vals.to_vec();
        }
        t
    }

    fn value_info(name: &str, ty: DataType) -> pb::ValueInfoProto {
        pb::ValueInfoProto {
            name: name.into(),
            r#type: Some(pb::TypeProto {
                value: Some(pb::type_proto::Value::TensorType(pb::type_proto::Tensor {
                    elem_type: ty as i32,
                    shape: None,
                })),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    #[derive(Clone)]
    struct Case {
        nodes: Vec<pb::NodeProto>,
        inits: Vec<pb::TensorProto>,
        inputs: Vec<(String, DataType)>,
        outputs: Vec<(String, DataType)>,
    }

    impl Case {
        fn new() -> Self {
            Self {
                nodes: vec![node("DynamicQuantizeLinear", &["x"], &["xq", "sx", "zx"])],
                inits: vec![],
                inputs: vec![("x".into(), DataType::Float)],
                outputs: vec![],
            }
        }

        fn model(&self) -> pb::ModelProto {
            let vis = |v: &[(String, DataType)]| {
                v.iter().map(|(n, t)| value_info(n, *t)).collect::<Vec<_>>()
            };
            pb::ModelProto {
                ir_version: 8,
                opset_import: vec![pb::OperatorSetIdProto {
                    domain: String::new(),
                    version: 13,
                }],
                graph: Some(pb::GraphProto {
                    name: "karsi-ornek".into(),
                    node: self.nodes.clone(),
                    initializer: self.inits.clone(),
                    input: vis(&self.inputs),
                    output: vis(&self.outputs),
                    ..Default::default()
                }),
                ..Default::default()
            }
        }

        fn node_mut(&mut self, output: &str) -> &mut pb::NodeProto {
            self.nodes
                .iter_mut()
                .find(|n| n.output.iter().any(|o| o == output))
                .expect("düğüm")
        }

        /// Ağırlık ya da sabit (initializer ya da Constant düğümü): yerine yenisini koyar.
        fn replace_tensor(&mut self, name: &str, mut t: pb::TensorProto) {
            t.name = name.into();
            if let Some(i) = self.inits.iter_mut().find(|i| i.name == name) {
                *i = t;
            } else {
                *self.node_mut(name) = constant(name, t);
            }
        }

        fn remove_tensor(&mut self, name: &str) {
            self.inits.retain(|i| i.name != name);
            self.nodes
                .retain(|n| !(n.op_type == "Constant" && n.output.iter().any(|o| o == name)));
        }
    }

    #[derive(Clone)]
    struct Weight {
        q: Vec<i32>,
        z: i32,
        s: f32,
        signed: bool,
        k: usize,
        n: usize,
    }

    impl Weight {
        fn random(rng: &mut Rng, k: usize, n: usize, signed: bool) -> Self {
            let q = (0..k * n)
                .map(|_| {
                    if signed {
                        rng.below(256) as i32 - 128
                    } else {
                        rng.below(256) as i32
                    }
                })
                .collect();
            let z = if signed {
                if rng.coin() {
                    0
                } else {
                    rng.below(21) as i32 - 10
                }
            } else {
                rng.below(57) as i32 + 100
            };
            let s = (0.001 + 0.05 * rng.unit()) as f32;
            Self {
                q,
                z,
                s,
                signed,
                k,
                n,
            }
        }

        /// Tanım: W = (W_q − z_w)·s_w (f64).
        fn real(&self) -> Vec<f64> {
            self.q
                .iter()
                .map(|&q| f64::from(q - self.z) * f64::from(self.s))
                .collect()
        }
    }

    #[derive(Clone, Copy)]
    struct Opts {
        raw_w: bool,
        raw_z: bool,
        raw_s: bool,
        const_w: bool,
        const_zs: bool,
        swap_mul: bool,
        swap_scale: bool,
    }

    impl Opts {
        fn random(rng: &mut Rng) -> Self {
            Self {
                raw_w: rng.coin(),
                raw_z: rng.coin(),
                raw_s: rng.coin(),
                const_w: rng.coin(),
                const_zs: rng.coin(),
                swap_mul: rng.coin(),
                swap_scale: rng.coin(),
            }
        }
    }

    /// Kalıba uyan bir dal: `p_y = Mul(Cast(MatMulInteger(xq, Wq, zx, zw)), Mul(sx, sw))`.
    /// `shared_wq` verilirse ağırlık tensörü yeniden yazılmaz, o ad kullanılır.
    fn add_branch(c: &mut Case, p: &str, w: &Weight, o: Opts, shared_wq: Option<&str>) {
        let own_wq = format!("{p}_Wq");
        let wq = shared_wq.unwrap_or(&own_wq).to_string();
        let (zw, sw) = (format!("{p}_zw"), format!("{p}_sw"));
        let (acc, accf, sxw, y) = (
            format!("{p}_acc"),
            format!("{p}_accf"),
            format!("{p}_sxw"),
            format!("{p}_y"),
        );
        if shared_wq.is_none() {
            let t = int_tensor(&wq, &[w.k as i64, w.n as i64], &w.q, w.signed, o.raw_w);
            if o.const_w {
                c.nodes.push(constant(&wq, t));
            } else {
                c.inits.push(t);
            }
        }
        let zt = int_tensor(&zw, &[], &[w.z], w.signed, o.raw_z);
        let st = f32_tensor(&sw, &[], &[w.s], o.raw_s);
        if o.const_zs {
            c.nodes.push(constant(&zw, zt));
            c.nodes.push(constant(&sw, st));
        } else {
            c.inits.push(zt);
            c.inits.push(st);
        }
        c.nodes
            .push(node("MatMulInteger", &["xq", &wq, "zx", &zw], &[&acc]));
        c.nodes.push(cast(&acc, &accf, DataType::Float));
        if o.swap_scale {
            c.nodes.push(node("Mul", &[&sw, "sx"], &[&sxw]));
        } else {
            c.nodes.push(node("Mul", &["sx", &sw], &[&sxw]));
        }
        if o.swap_mul {
            c.nodes.push(node("Mul", &[&sxw, &accf], &[&y]));
        } else {
            c.nodes.push(node("Mul", &[&accf, &sxw], &[&y]));
        }
        c.outputs.push((y, DataType::Float));
    }

    type Output = (Vec<usize>, Vec<f32>);

    fn run(model: &pb::ModelProto, x: &[f32], rows: usize, k: usize) -> TractResult<Vec<Output>> {
        let plan = tract_onnx::onnx()
            .with_ignore_output_shapes(true)
            .with_ignore_value_info(true)
            .model_for_proto_model(model)?
            .with_input_fact(0, f32::fact([rows, k]).into())?
            .into_optimized()?
            .into_runnable()?;
        let input: Tensor = tract_ndarray::Array2::from_shape_vec((rows, k), x.to_vec())?.into();
        let out = plan.run(tvec!(input.into()))?;
        out.iter()
            .map(|t| {
                let f = t.cast_to::<f32>()?;
                Ok((
                    t.shape().to_vec(),
                    f.to_plain_array_view::<f32>()?.iter().copied().collect(),
                ))
            })
            .collect()
    }

    fn random_x(rng: &mut Rng, rows: usize, k: usize) -> Vec<f32> {
        let scale = 0.1 + 4.0 * rng.unit();
        let positive = rng.below(4) == 0;
        let mut x: Vec<f32> = (0..rows * k)
            .map(|_| {
                let v = (rng.unit() * 2.0 - 1.0) * scale;
                (if positive { v.abs() } else { v }) as f32
            })
            .collect();
        if rng.coin() {
            let i = rng.below(x.len() as u64) as usize;
            x[i] *= 5.0;
        }
        x
    }

    /// Çevrilen = x·W (elle, f64; f32 yuvarlaması payıyla); eski yolla fark ≤ (s_x/2)·Σ_k |W_kj|.
    fn check_branch(label: &str, x: &[f32], w: &Weight, old: &Output, new: &Output) {
        assert_eq!(old.0, new.0, "{label}: çıktı şekli");
        let (k, n) = (w.k, w.n);
        let rows = x.len() / k;
        let real = w.real();
        let x64: Vec<f64> = x.iter().map(|&v| f64::from(v)).collect();
        let lo = x64.iter().fold(0f64, |a, &b| a.min(b));
        let hi = x64.iter().fold(0f64, |a, &b| a.max(b));
        let s_x = (hi - lo) / 255.0;
        for r in 0..rows {
            for j in 0..n {
                let (mut exact, mut abs, mut col) = (0.0, 0.0, 0.0);
                for i in 0..k {
                    let p = x64[r * k + i] * real[i * n + j];
                    exact += p;
                    abs += p.abs();
                    col += real[i * n + j].abs();
                }
                let round = abs * (k as f64 + 2.0) * 2f64.powi(-23) + 1e-6;
                let got = f64::from(new.1[r * n + j]);
                assert!(
                    (got - exact).abs() <= round,
                    "{label} [{r},{j}]: çevrilen {got} ≠ elle {exact} (pay {round})"
                );
                let was = f64::from(old.1[r * n + j]);
                let bound = s_x / 2.0 * col * 1.001 + 2.0 * round;
                assert!(
                    (was - got).abs() <= bound,
                    "{label} [{r},{j}]: eski {was}, yeni {got}, sınır {bound}"
                );
            }
        }
    }

    #[test]
    fn rastgele_kaliba_uyan_carpimlar_dogru_cevrilir() {
        let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
        for case_no in 0..200 {
            let k = 1 + rng.below(24) as usize;
            let rows = 1 + rng.below(5) as usize;
            let mut c = Case::new();
            let branches = 1 + rng.below(3) as usize;
            let mut weights = vec![];
            for b in 0..branches {
                let n = 1 + rng.below(10) as usize;
                let signed = rng.coin();
                let w = Weight::random(&mut rng, k, n, signed);
                let o = Opts::random(&mut rng);
                add_branch(&mut c, &format!("b{b}"), &w, o, None);
                weights.push(w);
            }
            // s_x ve x_q başka yerde de kullanılabilir.
            if rng.coin() {
                c.nodes.push(node("Identity", &["sx"], &["sx_out"]));
                c.outputs.push(("sx_out".into(), DataType::Float));
            }
            if rng.coin() {
                c.nodes.push(cast("xq", "xq_f", DataType::Float));
                c.outputs.push(("xq_f".into(), DataType::Float));
            }
            let original = c.model();
            let mut conv = original.clone();
            assert_eq!(dequantize_matmuls(&mut conv), branches, "örnek {case_no}");
            let graph = conv.graph.as_ref().expect("grafik");
            assert!(graph.node.iter().all(|n| n.op_type != "MatMulInteger"));
            let x = random_x(&mut rng, rows, k);
            let old = run(&original, &x, rows, k).expect("eski yol çalışır");
            let new = run(&conv, &x, rows, k).expect("çevrilen çalışır");
            assert_eq!(old.len(), new.len());
            for (b, w) in weights.iter().enumerate() {
                check_branch(&format!("örnek {case_no} dal {b}"), &x, w, &old[b], &new[b]);
            }
            for e in branches..old.len() {
                assert_eq!(old[e], new[e], "örnek {case_no}: ek çıktı {e} aynı kalmalı");
            }
        }
    }

    #[test]
    fn ayni_agirlik_ayni_olcekle_paylasilinca_dogru() {
        let mut rng = Rng(77);
        let k = 7;
        let w = Weight::random(&mut rng, k, 5, false);
        let mut c = Case::new();
        let o = Opts::random(&mut rng);
        add_branch(&mut c, "b0", &w, o, None);
        add_branch(&mut c, "b1", &w, o, Some("b0_Wq"));
        let original = c.model();
        let mut conv = original.clone();
        assert_eq!(dequantize_matmuls(&mut conv), 2);
        let x = random_x(&mut rng, 3, k);
        let old = run(&original, &x, 3, k).expect("eski");
        let new = run(&conv, &x, 3, k).expect("yeni");
        check_branch("b0", &x, &w, &old[0], &new[0]);
        check_branch("b1", &x, &w, &old[1], &new[1]);
    }

    /// Kalıbı bozan değişiklikler: hiçbiri çevrilmemeli ve model olduğu gibi kalmalı.
    #[test]
    fn kaliba_uymayanlar_dokunulmadan_kalir() {
        type Mutation = fn(&mut Case, &Weight);
        let mutations: Vec<(&str, Mutation)> = vec![
            ("kanal başına ölçek", |c, w| {
                let v: Vec<f32> = (0..w.n).map(|j| w.s * (1.0 + j as f32)).collect();
                c.replace_tensor("b0_sw", f32_tensor("", &[w.n as i64], &v, false));
            }),
            ("kanal başına sıfır noktası", |c, w| {
                let v: Vec<i32> = (0..w.n as i32).map(|j| w.z + j).collect();
                c.replace_tensor("b0_zw", int_tensor("", &[w.n as i64], &v, w.signed, true));
            }),
            ("Cast çıktısının başka tüketicisi", |c, _| {
                c.nodes.push(node("Identity", &["b0_accf"], &["extra"]));
                c.outputs.push(("extra".into(), DataType::Float));
            }),
            ("tamsayı toplam grafik çıktısı", |c, _| {
                c.outputs.push(("b0_acc".into(), DataType::Int32));
            }),
            ("Cast çıktısı grafik çıktısı", |c, _| {
                c.outputs.push(("b0_accf".into(), DataType::Float));
            }),
            ("Cast double'a", |c, _| {
                c.node_mut("b0_accf").attribute[0].i = DataType::Double as i64;
            }),
            ("Mul'un diğer girdisi yalnızca s_w", |c, _| {
                for i in &mut c.node_mut("b0_y").input {
                    if i == "b0_sxw" {
                        *i = "b0_sw".into();
                    }
                }
            }),
            ("ölçek başka girdinin s_x'i", |c, _| {
                c.inits.push(f32_tensor("two", &[], &[2.0], false));
                c.nodes.insert(1, node("Mul", &["x", "two"], &["x2"]));
                c.nodes.insert(
                    2,
                    node("DynamicQuantizeLinear", &["x2"], &["xq2", "sx2", "zx2"]),
                );
                for i in &mut c.node_mut("b0_sxw").input {
                    if i == "sx" {
                        *i = "sx2".into();
                    }
                }
            }),
            ("z_x sabit", |c, _| {
                c.inits.push(int_tensor("zx_c", &[], &[128], false, true));
                c.node_mut("b0_acc").input[2] = "zx_c".into();
            }),
            ("z_x başka nicemleyiciden", |c, _| {
                c.nodes.insert(
                    1,
                    node("DynamicQuantizeLinear", &["x"], &["xq2", "sx2", "zx2"]),
                );
                c.node_mut("b0_acc").input[2] = "zx2".into();
            }),
            ("MatMulInteger başka alanda", |c, _| {
                c.node_mut("b0_acc").domain = "com.example".into();
            }),
            ("DynamicQuantizeLinear başka alanda", |c, _| {
                c.node_mut("xq").domain = "com.example".into();
            }),
            ("ölçek çarpımı başka alanda", |c, _| {
                c.node_mut("b0_sxw").domain = "com.example".into();
            }),
            ("ağırlık grafik girdisi", |c, _| {
                c.remove_tensor("b0_Wq");
                c.inputs.push(("b0_Wq".into(), DataType::Uint8));
            }),
            ("ölçek çarpımı Add", |c, _| {
                c.node_mut("b0_sxw").op_type = "Add".into();
            }),
            ("son düğüm Add", |c, _| {
                c.node_mut("b0_y").op_type = "Add".into();
            }),
            ("z_w verilmemiş", |c, _| {
                c.node_mut("b0_acc").input[3] = String::new();
            }),
            ("ağırlık üç boyutlu", |c, w| {
                let t = int_tensor("", &[1, w.k as i64, w.n as i64], &w.q, w.signed, true);
                c.replace_tensor("b0_Wq", t);
            }),
            ("Mul(accf, accf)", |c, _| {
                c.node_mut("b0_y").input = vec!["b0_accf".into(), "b0_accf".into()];
            }),
            ("ölçek Mul(sx, sx)", |c, _| {
                c.node_mut("b0_sxw").input = vec!["sx".into(), "sx".into()];
            }),
            ("sonsuz ölçek", |c, _| {
                c.replace_tensor("b0_sw", f32_tensor("", &[], &[f32::INFINITY], false));
            }),
            ("eksik ağırlık baytı", |c, w| {
                let mut t = int_tensor("", &[w.k as i64, w.n as i64], &w.q, w.signed, true);
                t.raw_data.pop();
                c.replace_tensor("b0_Wq", t);
            }),
        ];
        let mut rng = Rng(0xdead_beef_1234_5678);
        for round in 0..20 {
            for (name, mutate) in &mutations {
                let k = 1 + rng.below(12) as usize;
                let n = 2 + rng.below(8) as usize;
                let signed = rng.coin();
                let w = Weight::random(&mut rng, k, n, signed);
                let mut c = Case::new();
                let o = Opts::random(&mut rng);
                add_branch(&mut c, "b0", &w, o, None);
                mutate(&mut c, &w);
                let original = c.model();
                let mut conv = original.clone();
                assert_eq!(dequantize_matmuls(&mut conv), 0, "{name} (tur {round})");
                assert!(conv == original, "{name} (tur {round}): model değişti");
            }
        }
    }

    /// Aynı W_q iki çarpımda farklı z_w ve s_w ile: her biri kendi ölçeğiyle çözülmeli.
    #[test]
    fn ayni_agirlik_farkli_olcekle_paylasilinca_dogru() {
        let mut rng = Rng(4242);
        let k = 6;
        let w0 = Weight::random(&mut rng, k, 4, false);
        let mut w1 = w0.clone();
        w1.z = w0.z + 7;
        w1.s = w0.s * 3.0;
        let mut c = Case::new();
        let o = Opts::random(&mut rng);
        add_branch(&mut c, "b0", &w0, o, None);
        add_branch(&mut c, "b1", &w1, o, Some("b0_Wq"));
        let original = c.model();
        let mut conv = original.clone();
        dequantize_matmuls(&mut conv);
        let x = random_x(&mut rng, 2, k);
        let old = run(&original, &x, 2, k).expect("eski");
        let new = run(&conv, &x, 2, k).expect("yeni");
        check_branch("b0", &x, &w0, &old[0], &new[0]);
        check_branch("b1", &x, &w1, &old[1], &new[1]);
    }

    /// s_w skaler değil de [1, 1, 1] (tek öğeli): eski yolda çıktı yayılımla üç boyutlu olur.
    #[test]
    fn tek_ogeli_olcegin_sekli_korunur() {
        let mut rng = Rng(99);
        let k = 5;
        let w = Weight::random(&mut rng, k, 3, true);
        let mut c = Case::new();
        let o = Opts::random(&mut rng);
        add_branch(&mut c, "b0", &w, o, None);
        c.replace_tensor("b0_sw", f32_tensor("", &[1, 1, 1], &[w.s], false));
        let original = c.model();
        let mut conv = original.clone();
        dequantize_matmuls(&mut conv);
        let x = random_x(&mut rng, 2, k);
        let old = run(&original, &x, 2, k).expect("eski");
        let new = run(&conv, &x, 2, k).expect("yeni");
        assert_eq!(old[0].0, new[0].0, "çıktı şekli");
    }

    /// onnxruntime'ın `quantize_dynamic` çıktısı (inceleme betiği `tests/data/soz-modeli/inceleme_ort_uret.py`; kanal başına/tensör
    /// başına, int8/uint8, üç boyutlu girdi, paylaşılan ağırlık, başka işlemde de kullanılan ağırlık).
    /// Elle: `LYRASKA_ORT_ORNEKLERI` = betiğin çıktı klasörü.
    #[test]
    #[ignore = "elle: LYRASKA_ORT_ORNEKLERI"]
    fn onnxruntime_uretimi_modeller() {
        let dir = std::path::PathBuf::from(std::env::var("LYRASKA_ORT_ORNEKLERI").expect("klasör"));
        let text = std::fs::read_to_string(dir.join("cases.json")).expect("cases.json");
        let cases: serde_json::Value = serde_json::from_str(&text).expect("json");
        let floats = |v: &serde_json::Value| -> Vec<f64> {
            v.as_array()
                .expect("dizi")
                .iter()
                .map(|f| f.as_f64().expect("sayı"))
                .collect()
        };
        for case in cases.as_array().expect("dizi") {
            let file = case["file"].as_str().expect("ad");
            let bytes = std::fs::read(dir.join(file)).expect("model");
            let original = tract_onnx::onnx()
                .proto_model_for_read(&mut bytes.as_slice())
                .expect("okunur");
            let mut conv = original.clone();
            let count = dequantize_matmuls(&mut conv);
            if let Some(e) = case["expect"].as_u64() {
                assert_eq!(count as u64, e, "{file}");
            }
            let shape: Vec<usize> = case["x_shape"]
                .as_array()
                .expect("şekil")
                .iter()
                .map(|d| d.as_u64().expect("boyut") as usize)
                .collect();
            let x: Vec<f32> = floats(&case["x"]).iter().map(|&v| v as f32).collect();
            let runp = |m: &pb::ModelProto| -> Vec<Output> {
                let plan = tract_onnx::onnx()
                    .with_ignore_output_shapes(true)
                    .with_ignore_value_info(true)
                    .model_for_proto_model(m)
                    .and_then(|m| m.with_input_fact(0, f32::fact(shape.clone()).into()))
                    .and_then(|m| m.into_optimized())
                    .and_then(|m| m.into_runnable())
                    .expect("kurulur");
                let input = Tensor::from_shape(&shape, &x).expect("girdi");
                plan.run(tvec!(input.into()))
                    .expect("çalışır")
                    .iter()
                    .map(|t| {
                        let f = t.cast_to::<f32>().expect("f32");
                        (
                            t.shape().to_vec(),
                            f.to_plain_array_view::<f32>()
                                .expect("dilim")
                                .iter()
                                .copied()
                                .collect(),
                        )
                    })
                    .collect()
            };
            let old = runp(&original);
            let new = runp(&conv);
            let mut worst_old_ort = 0f64;
            let mut worst_new_manual = 0f64;
            for (o, ((a, b), want)) in old
                .iter()
                .zip(&new)
                .zip(case["outputs"].as_array().expect("çıktılar"))
                .enumerate()
            {
                assert_eq!(a.0, b.0, "{file} çıktı {o}: şekil");
                let ort = floats(&want["ort"]);
                let manual = floats(&want["manual"]);
                let abs = floats(&want["abs"]);
                for i in 0..ort.len() {
                    let scale = abs[i].max(1e-3);
                    // tract'ın tamsayı yolu onnxruntime'ınkiyle aynı hesap (yuvarlama payı).
                    let d_old = (f64::from(a.1[i]) - ort[i]).abs() / scale;
                    worst_old_ort = worst_old_ort.max(d_old);
                    if count == 0 {
                        assert_eq!(a.1[i].to_bits(), b.1[i].to_bits(), "{file}: dokunulmayan");
                    } else {
                        let d = (f64::from(b.1[i]) - manual[i]).abs() / scale;
                        worst_new_manual = worst_new_manual.max(d);
                        assert!(
                            d < 1e-5,
                            "{file} çıktı {o}[{i}]: yeni {} elle {}",
                            b.1[i],
                            manual[i]
                        );
                    }
                }
            }
            println!(
                "{file}: çevrilen {count}; eski−ORT en çok {worst_old_ort:.2e}, yeni−elle en çok {worst_new_manual:.2e} (göreli)"
            );
        }
    }

    /// Diğer düğümlerde alan (domain) denetleniyor; Cast'te de denetlenmeli.
    #[test]
    fn baska_alandaki_cast_dokunulmaz() {
        let mut rng = Rng(8);
        let w = Weight::random(&mut rng, 4, 3, false);
        let mut c = Case::new();
        add_branch(&mut c, "b0", &w, Opts::random(&mut rng), None);
        c.node_mut("b0_accf").domain = "com.example".into();
        let original = c.model();
        let mut conv = original.clone();
        assert_eq!(dequantize_matmuls(&mut conv), 0);
        assert!(conv == original);
    }

    /// Çıktısı olmayan Mul (bozuk dosya): kütüphane kodu paniklememeli.
    #[test]
    fn ciktisiz_mul_paniklemez() {
        let mut rng = Rng(5);
        let w = Weight::random(&mut rng, 4, 3, false);
        let mut c = Case::new();
        add_branch(&mut c, "b0", &w, Opts::random(&mut rng), None);
        c.node_mut("b0_y").output.clear();
        let mut model = c.model();
        let result = std::panic::catch_unwind(move || dequantize_matmuls(&mut model));
        assert!(result.is_ok(), "dequantize_matmuls panikledi");
    }

    /// IR 3 biçimi: ağırlık hem initializer hem grafik girdisi. tract onu sabit sayar; çevrilince
    /// silinen initializer'ın girdisi boşta kalmamalı.
    #[test]
    fn girdi_listesindeki_agirlik_bozulmaz() {
        let mut rng = Rng(11);
        let k = 4;
        let w = Weight::random(&mut rng, k, 3, false);
        let mut c = Case::new();
        let mut o = Opts::random(&mut rng);
        o.const_w = false;
        add_branch(&mut c, "b0", &w, o, None);
        c.inputs.push(("b0_Wq".into(), DataType::Uint8));
        let original = c.model();
        let mut conv = original.clone();
        dequantize_matmuls(&mut conv);
        let x = random_x(&mut rng, 2, k);
        let old = run(&original, &x, 2, k).expect("eski");
        let new = run(&conv, &x, 2, k).expect("çevrilen model çalışmalı");
        check_branch("b0", &x, &w, &old[0], &new[0]);
    }

    fn if_node(cond: &str, then_value: &str, else_value: &str, output: &str) -> pb::NodeProto {
        let branch = |name: &str, value: &str| pb::AttributeProto {
            name: name.into(),
            r#type: AttributeType::Graph as i32,
            g: Some(pb::GraphProto {
                name: name.into(),
                node: vec![node("Identity", &[value], &[&format!("{name}_out")])],
                output: vec![value_info(&format!("{name}_out"), DataType::Float)],
                ..Default::default()
            }),
            ..Default::default()
        };
        let mut n = node("If", &[cond], &[output]);
        n.attribute = vec![
            branch("then_branch", then_value),
            branch("else_branch", else_value),
        ];
        n
    }

    /// Alt grafik (If) dış değeri kullanıyor: (a) Cast çıktısı, (b) yalnızca alt grafikte kullanılan
    /// bir initializer. Çevrilen model kurulabilmeli ve aynı sonucu vermeli.
    #[test]
    fn alt_grafigin_kullandigi_degerler_silinmez() {
        for variant in ["initializer", "cast"] {
            let mut rng = Rng(21);
            let k = 4;
            let w = Weight::random(&mut rng, k, 3, false);
            let mut c = Case::new();
            add_branch(&mut c, "b0", &w, Opts::random(&mut rng), None);
            let mut cond = int_tensor("cond", &[], &[1], false, true);
            cond.data_type = DataType::Bool as i32;
            c.inits.push(cond);
            let value = if variant == "cast" {
                "b0_accf"
            } else {
                c.inits.push(f32_tensor("only_sub", &[1], &[0.5], false));
                "only_sub"
            };
            c.nodes.push(if_node("cond", value, value, "if_out"));
            c.outputs.push(("if_out".into(), DataType::Float));
            let original = c.model();
            let mut conv = original.clone();
            dequantize_matmuls(&mut conv);
            let x = random_x(&mut rng, 2, k);
            let old = run(&original, &x, 2, k).expect("eski");
            let new = run(&conv, &x, 2, k)
                .unwrap_or_else(|e| panic!("{variant}: çevrilen model kurulamadı: {e:?}"));
            assert_eq!(old[1], new[1], "{variant}");
        }
    }
}
