//! MilkDrop `.milk` dosyasını Butterchurn 3.0'ın preset JSON biçimine çevirir.
//!
//! `.milk` INI benzeri bir metindir: `[preset00]` bölümünde `anahtar=değer` satırları.
//!
//! | Satır                                          | Butterchurn'de                          |
//! | ---------------------------------------------- | --------------------------------------- |
//! | `zoom=1.02`, `fDecay=0.98`, `nWaveMode=3` …     | `baseVals` (adı küçük harfe, eşlenerek) |
//! | `per_frame_init_N=…`                           | `init_eqs_eel`                          |
//! | `per_frame_N=…`                                | `frame_eqs_eel`                         |
//! | `per_pixel_N=…`                                | `pixel_eqs_eel`                         |
//! | `wavecode_K_ad=…`                              | `waves[K].baseVals`                     |
//! | `wave_K_init N`, `wave_K_per_frame N`, `wave_K_per_point N` | `waves[K]` denklemleri     |
//! | `shapecode_K_ad=…`                             | `shapes[K].baseVals`                    |
//! | `shape_K_init N`, `shape_K_per_frame N`        | `shapes[K]` denklemleri                 |
//! | `warp_N=…`, `comp_N=…` (HLSL gölgelendirici)    | `warp`, `comp` (GLSL ES 3.00, `shader.rs`) |
//!
//! Denklemler (EEL) **olduğu gibi** metin olarak geçer; arayüzde Butterchurn onları
//! WebAssembly'ye derler (`onlyUseWASM`): hiçbir yerde JavaScript olarak çalıştırılmaz.
//! MilkDrop 2 gölgelendiricileri (HLSL) kum havuzundaki çeviriciyle GLSL'e çevrilir (`shader.rs`).
//! Çevrilemeyen gölgelendirici atılır: Butterchurn onun yerine varsayılanıyla çizer, görsel
//! "sade hâliyle" çalar (`simplified`) ve nedeni `shader_error`'da bildirilir.
//!
//! Anahtar eşlemesi ve varsayılanlar Jordan Berg'in `milkdrop-preset-utils` (0.2.1, MIT) paketinden
//! uyarlanmıştır (`docs/LISANSLAR.md`). Farklar: satırlar konumlarına göre değil anahtarlarına göre
//! sınıflanır (MilkDrop da ayarları anahtarla okur); aynı anahtar iki kez varsa MilkDrop gibi ilki
//! geçerlidir; denklem satırları numara sırasıyla birleştirilir; sayılar sonlu olmalıdır.
//!
//! Kötü niyetli ya da bozuk dosyaya karşı: boyut ve satır sınırı, sonlu sayı, ayar sayısı sınırı,
//! denetim karakterleri temizlenir; programı dondurabilecek döngüler sınırlanır ya da görsel
//! reddedilir (`eel.rs`). Ayrıştırıcı hiçbir girdide panik yapmaz (testler).

use std::collections::BTreeMap;

use serde::Serialize;

use super::eel::{self, LoopError, LoopPolicy};
use super::shader::{self, ShaderKind};

/// Okunan dosyanın en büyük boyutu (bayt). Gerçek presetler çoğunlukla 30 KB'ın altındadır.
pub const MAX_FILE_BYTES: u64 = 512 * 1024;
/// Çözülmüş metnin en büyük boyutu (bayt): eski Windows kodlamasında bir bayt UTF-8'de en çok üç
/// bayt olur. Dosyanın kendi sınırı [`MAX_FILE_BYTES`] (`load` baytlarda denetler).
pub const MAX_TEXT_BYTES: usize = 3 * MAX_FILE_BYTES as usize;
/// Dosyadaki en fazla satır.
pub const MAX_LINES: usize = 20_000;
/// Bir `baseVals` tablosundaki en fazla ayar (MilkDrop'ta ~100 ayar var).
const MAX_BASE_VALUES: usize = 256;
/// Özel şekil ve dalga sayısı (MilkDrop 2: dörder). Butterchurn dördünün de olmasını bekler.
pub const SHAPES: usize = 4;
pub const WAVES: usize = 4;
/// Denklem satırının en büyük numarası (`per_frame_N`'deki N).
const MAX_LINE_NUMBER: u32 = 100_000;

/// Butterchurn 3.0 preset biçimi. Alan adları Butterchurn'ün beklediği gibidir (`init_eqs_eel`,
/// `baseVals`); bu yüzden programın diğer veri yapılarındaki gibi `camelCase` çevrilmez.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct ButterchurnPreset {
    /// MilkDrop sürümü: 2 (`MILKDROP_PRESET_VERSION` ≥ 200) ya da 1. EEL derlemesini etkiler
    /// (MilkDrop 1'de `rand` tamsayı döndürür).
    pub version: u8,
    #[serde(rename = "baseVals")]
    pub base_vals: BTreeMap<String, f64>,
    /// Her zaman dört şekil.
    pub shapes: Vec<ButterchurnShape>,
    /// Her zaman dört dalga.
    pub waves: Vec<ButterchurnWave>,
    pub init_eqs_eel: String,
    pub frame_eqs_eel: String,
    pub pixel_eqs_eel: String,
    /// Bükme ve birleştirme gölgelendiricileri: Butterchurn'ün GLSL biçiminde (`shader.rs`);
    /// yoksa ya da çevrilemediyse boş (Butterchurn varsayılanı).
    pub warp: String,
    pub comp: String,
}

/// Özel şekil.
#[derive(Debug, Clone, PartialEq, Default, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct ButterchurnShape {
    #[serde(rename = "baseVals")]
    pub base_vals: BTreeMap<String, f64>,
    pub init_eqs_eel: String,
    pub frame_eqs_eel: String,
}

/// Özel dalga.
#[derive(Debug, Clone, PartialEq, Default, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct ButterchurnWave {
    #[serde(rename = "baseVals")]
    pub base_vals: BTreeMap<String, f64>,
    pub init_eqs_eel: String,
    pub frame_eqs_eel: String,
    pub point_eqs_eel: String,
}

/// Ayrıştırmanın sonucu.
#[derive(Debug, Clone, PartialEq)]
pub struct Parsed {
    pub preset: ButterchurnPreset,
    /// Dosyada gölgelendirici (HLSL) vardı ama çevrilemedi ve atıldı: görsel sade hâliyle çalar.
    pub simplified: bool,
    /// Çevrilemeyen gölgelendiricinin nedeni (ör. "bükme gölgelendiricisi çevrilemedi: …").
    pub shader_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ParseError {
    #[error("dosya çok büyük (en fazla {} KB)", MAX_FILE_BYTES / 1024)]
    TooLarge,
    #[error("dosyada çok fazla satır var (en fazla {MAX_LINES})")]
    TooManyLines,
    #[error("MilkDrop görseli değil: tanınan hiçbir ayar ya da denklem yok")]
    NotAPreset,
    #[error(
        "Bu görsel iç içe ya da piksel başına döngü içeriyor; programı dondurabileceği için açılmıyor."
    )]
    UnsafeLoop,
    #[error("Bu görsel çok fazla döngü içeriyor; programı dondurabileceği için açılmıyor.")]
    TooManyLoops,
}

/// Denklem türleri (ana preset).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum MainCode {
    Init,
    Frame,
    Pixel,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum WaveCode {
    Init,
    Frame,
    Point,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum ShapeCode {
    Init,
    Frame,
}

/// Bir satırın anahtarının anlamı.
#[derive(Debug, PartialEq)]
enum Key<'a> {
    Base(&'a str),
    Main(MainCode, u32),
    Shader(ShaderKind, u32),
    WaveValue(usize, &'a str),
    Wave(usize, WaveCode, u32),
    ShapeValue(usize, &'a str),
    Shape(usize, ShapeCode, u32),
    /// Tanınmayan (ör. 4. ve sonraki dalga) ya da dosya başlığı: atlanır.
    Ignored,
}

/// Bir kod bölümünün satırları: (numara, dosyadaki sıra, metin).
#[derive(Default)]
struct CodeLines(Vec<(u32, usize, String)>);

impl CodeLines {
    fn push(&mut self, number: u32, order: usize, text: &str) {
        self.0.push((number, order, clean_code(text)));
    }

    /// Numara sırasıyla birleştirir; aynı numaradan ilki geçerlidir (MilkDrop gibi).
    fn join(mut self) -> String {
        self.0.sort_by_key(|(number, order, _)| (*number, *order));
        self.0.dedup_by_key(|(number, _, _)| *number);
        self.0
            .into_iter()
            .map(|(_, _, text)| text)
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// Bir `baseVals` tablosu: ilk değer geçerlidir, en fazla [`MAX_BASE_VALUES`] ayar.
#[derive(Default)]
struct Values(BTreeMap<String, f64>);

impl Values {
    fn insert(&mut self, raw_name: &str, raw_value: &str) {
        let Some(value) = parse_number(raw_value) else {
            return;
        };
        let name = raw_name.trim().to_ascii_lowercase();
        if name.is_empty() || name.len() > 64 || self.0.len() >= MAX_BASE_VALUES {
            return;
        }
        let name = var_name(&name).map_or(name, str::to_owned);
        self.0.entry(name).or_insert(value);
    }
}

/// `.milk` metnini ayrıştırır. Hiçbir girdide panik yapmaz.
pub fn parse(text: &str) -> Result<Parsed, ParseError> {
    if text.len() > MAX_TEXT_BYTES {
        return Err(ParseError::TooLarge);
    }
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() > MAX_LINES {
        return Err(ParseError::TooManyLines);
    }
    let version = preset_version(&lines);
    let body = preset_body(&lines);

    let mut base = Values::default();
    let mut main: [CodeLines; 3] = Default::default();
    let mut wave_values: [Values; WAVES] = Default::default();
    let mut wave_code: [[CodeLines; 3]; WAVES] = Default::default();
    let mut shape_values: [Values; SHAPES] = Default::default();
    let mut shape_code: [[CodeLines; 2]; SHAPES] = Default::default();
    let mut warp = CodeLines::default();
    let mut comp = CodeLines::default();
    let mut recognized = false;

    for (order, line) in body.iter().enumerate() {
        let Some((raw_key, value)) = line.split_once('=') else {
            continue;
        };
        let key = raw_key.trim().to_ascii_lowercase();
        match classify(&key) {
            Key::Base(name) => {
                let before = base.0.len();
                base.insert(name, value);
                recognized |= base.0.len() > before;
            }
            Key::Main(kind, number) => {
                main[kind as usize].push(number, order, value);
                recognized = true;
            }
            Key::Shader(kind, number) => {
                // `warp_1=`\`shader_body`: her satır bir ters tırnakla başlar.
                let lines = match kind {
                    ShaderKind::Warp => &mut warp,
                    ShaderKind::Comp => &mut comp,
                };
                lines.push(number, order, value.trim_start_matches('`'));
                recognized = true;
            }
            Key::WaveValue(k, name) => {
                wave_values[k].insert(name, value);
                recognized = true;
            }
            Key::Wave(k, kind, number) => {
                wave_code[k][kind as usize].push(number, order, value);
                recognized = true;
            }
            Key::ShapeValue(k, name) => {
                shape_values[k].insert(name, value);
                recognized = true;
            }
            Key::Shape(k, kind, number) => {
                shape_code[k][kind as usize].push(number, order, value);
                recognized = true;
            }
            Key::Ignored => {}
        }
    }
    if !recognized {
        return Err(ParseError::NotAPreset);
    }

    // Döngü denetimi (`eel.rs`): denklemin ne sıklıkla çalıştığına göre.
    let mut loops = 0usize;
    let mut guarded = |code: CodeLines, policy: LoopPolicy| -> Result<String, ParseError> {
        let (text, count) =
            eel::guard_loops(&code.join(), policy).map_err(|error| match error {
                LoopError::TooMany => ParseError::TooManyLoops,
                LoopError::Nested | LoopError::Forbidden => ParseError::UnsafeLoop,
            })?;
        loops += count;
        if loops > eel::MAX_LOOPS {
            return Err(ParseError::TooManyLoops);
        }
        Ok(text)
    };
    let [init, frame, pixel] = main;
    let mut waves = Vec::with_capacity(WAVES);
    for (values, [init, frame, point]) in wave_values.into_iter().zip(wave_code) {
        waves.push(ButterchurnWave {
            base_vals: values.0,
            init_eqs_eel: guarded(init, LoopPolicy::Capped)?,
            frame_eqs_eel: guarded(frame, LoopPolicy::Capped)?,
            point_eqs_eel: guarded(point, LoopPolicy::Forbidden)?,
        });
    }
    let mut shapes = Vec::with_capacity(SHAPES);
    for (values, [init, frame]) in shape_values.into_iter().zip(shape_code) {
        shapes.push(ButterchurnShape {
            base_vals: values.0,
            init_eqs_eel: guarded(init, LoopPolicy::Capped)?,
            // Şekil denklemleri her örnek (en çok 1024) için ayrı çalışır.
            frame_eqs_eel: guarded(frame, LoopPolicy::Forbidden)?,
        });
    }
    let init_eqs_eel = guarded(init, LoopPolicy::Capped)?;
    let frame_eqs_eel = guarded(frame, LoopPolicy::Capped)?;
    let pixel_eqs_eel = guarded(pixel, LoopPolicy::Forbidden)?;

    // Gölgelendiriciler denklemler denetlendikten sonra çevrilir (reddedilecek görsel için boşuna
    // çeviri yapılmaz). Biri çevrilemezse yalnızca o atılır; öteki kalır.
    let mut errors = Vec::new();
    let mut shader = |lines: CodeLines, kind: ShaderKind| -> String {
        let source = lines.join();
        if source.trim().is_empty() {
            return String::new();
        }
        match shader::convert(&source, kind) {
            Ok(glsl) => glsl,
            Err(error) => {
                let name = match kind {
                    ShaderKind::Warp => "bükme",
                    ShaderKind::Comp => "birleştirme",
                };
                errors.push(format!("{name}: {error}"));
                String::new()
            }
        }
    };
    let warp = shader(warp, ShaderKind::Warp);
    let comp = shader(comp, ShaderKind::Comp);
    let preset = ButterchurnPreset {
        version,
        base_vals: base.0,
        shapes,
        waves,
        init_eqs_eel,
        frame_eqs_eel,
        pixel_eqs_eel,
        warp,
        comp,
    };
    let shader_error = (!errors.is_empty()).then(|| errors.join("; "));
    Ok(Parsed {
        preset,
        simplified: shader_error.is_some(),
        shader_error,
    })
}

/// `MILKDROP_PRESET_VERSION=201` (MilkDrop 2: 200 ve üstü) → 2; yoksa MilkDrop 1.
fn preset_version(lines: &[&str]) -> u8 {
    lines
        .iter()
        .take_while(|line| !is_section(line))
        .filter_map(|line| line.split_once('='))
        .find(|(key, _)| key.trim().eq_ignore_ascii_case("MILKDROP_PRESET_VERSION"))
        .and_then(|(_, value)| parse_number(value))
        .map_or(1, |v| if v >= 200.0 { 2 } else { 1 })
}

fn is_section(line: &str) -> bool {
    let line = line.trim();
    line.starts_with('[') && line.ends_with(']')
}

/// `[preset00]` bölümünün satırları (bir sonraki bölüme kadar). Bölüm başlığı yoksa (çok eski ya
/// da elle yazılmış dosya) bütün dosya.
fn preset_body<'a>(lines: &[&'a str]) -> Vec<&'a str> {
    match lines
        .iter()
        .position(|line| line.trim().eq_ignore_ascii_case("[preset00]"))
    {
        Some(start) => lines[start + 1..]
            .iter()
            .take_while(|line| !is_section(line))
            .copied()
            .collect(),
        None => lines.to_vec(),
    }
}

/// Anahtarı (küçük harf) sınıflar.
fn classify(key: &str) -> Key<'_> {
    if key.is_empty() || key == "milkdrop_preset_version" || key.starts_with("psversion") {
        return Key::Ignored;
    }
    if let Some(n) = numbered(key, "per_frame_init_") {
        return Key::Main(MainCode::Init, n);
    }
    if let Some(n) = numbered(key, "per_frame_") {
        return Key::Main(MainCode::Frame, n);
    }
    if let Some(n) = numbered(key, "per_pixel_") {
        return Key::Main(MainCode::Pixel, n);
    }
    if let Some(n) = numbered(key, "warp_") {
        return Key::Shader(ShaderKind::Warp, n);
    }
    if let Some(n) = numbered(key, "comp_") {
        return Key::Shader(ShaderKind::Comp, n);
    }
    if let Some(rest) = key.strip_prefix("wavecode_") {
        return match indexed(rest, WAVES) {
            Some((k, name)) if !name.is_empty() => Key::WaveValue(k, name),
            _ => Key::Ignored,
        };
    }
    if let Some(rest) = key.strip_prefix("shapecode_") {
        return match indexed(rest, SHAPES) {
            Some((k, name)) if !name.is_empty() => Key::ShapeValue(k, name),
            _ => Key::Ignored,
        };
    }
    if let Some(rest) = key.strip_prefix("wave_") {
        if let Some((k, part)) = indexed_digits(rest) {
            let kinds = [
                ("init", WaveCode::Init),
                ("per_frame", WaveCode::Frame),
                ("per_point", WaveCode::Point),
            ];
            for (prefix, kind) in kinds {
                if let Some(n) = line_number(part, prefix) {
                    return if k < WAVES {
                        Key::Wave(k, kind, n)
                    } else {
                        Key::Ignored
                    };
                }
            }
        }
    }
    if let Some(rest) = key.strip_prefix("shape_") {
        if let Some((k, part)) = indexed_digits(rest) {
            let kinds = [("init", ShapeCode::Init), ("per_frame", ShapeCode::Frame)];
            for (prefix, kind) in kinds {
                if let Some(n) = line_number(part, prefix) {
                    return if k < SHAPES {
                        Key::Shape(k, kind, n)
                    } else {
                        Key::Ignored
                    };
                }
            }
        }
    }
    Key::Base(key)
}

/// `önek` + rakamlar → numara (`per_frame_12` → 12).
fn numbered(key: &str, prefix: &str) -> Option<u32> {
    digits(key.strip_prefix(prefix)?)
}

/// `per_frame12` ya da `per_frame_12` → 12 (MilkDrop 2 dalga/şekil satırları alt çizgisiz yazar).
fn line_number(part: &str, prefix: &str) -> Option<u32> {
    let rest = part.strip_prefix(prefix)?;
    digits(rest.strip_prefix('_').unwrap_or(rest))
}

fn digits(text: &str) -> Option<u32> {
    if text.is_empty() || text.len() > 6 || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse().ok().filter(|n| *n <= MAX_LINE_NUMBER)
}

/// `0_enabled` → (0, "enabled"); `count`tan küçük değilse `None`.
fn indexed(rest: &str, count: usize) -> Option<(usize, &str)> {
    let (k, name) = indexed_digits(rest)?;
    (k < count).then_some((k, name))
}

/// `2_per_frame1` → (2, "per_frame1").
fn indexed_digits(rest: &str) -> Option<(usize, &str)> {
    let (k, name) = rest.split_once('_')?;
    if k.is_empty() || k.len() > 3 || !k.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some((k.parse().ok()?, name))
}

/// Denklem satırı: denetim karakterleri (sekme dışında) boşluğa çevrilir.
fn clean_code(text: &str) -> String {
    text.chars()
        .map(|c| if c.is_control() && c != '\t' { ' ' } else { c })
        .collect()
}

/// Sayı: JavaScript'in `parseFloat`'ı gibi baştaki sayıyı alır ("1.000000", "-0.5abc" → −0,5).
/// Ondalık ayırıcı olarak virgül de kabul edilir (Türkçe Windows'ta kaydedilmiş dosyalar).
/// Sonsuz ya da NaN reddedilir.
pub(crate) fn parse_number(text: &str) -> Option<f64> {
    let text = text.trim();
    let bytes = text.as_bytes();
    let mut end = 0;
    let mut out = String::with_capacity(bytes.len().min(32));
    if let Some(&sign @ (b'+' | b'-')) = bytes.first() {
        out.push(sign as char);
        end = 1;
    }
    let mut mantissa_digits = 0;
    while end < bytes.len() && bytes[end].is_ascii_digit() {
        out.push(bytes[end] as char);
        end += 1;
        mantissa_digits += 1;
    }
    if end < bytes.len() && (bytes[end] == b'.' || bytes[end] == b',') {
        let start = end + 1;
        let mut after = start;
        while after < bytes.len() && bytes[after].is_ascii_digit() {
            after += 1;
        }
        if after > start || mantissa_digits > 0 {
            out.push('.');
            out.push_str(&text[start..after]);
            mantissa_digits += after - start;
            end = after;
        }
    }
    if mantissa_digits == 0 {
        return None;
    }
    if end < bytes.len() && (bytes[end] == b'e' || bytes[end] == b'E') {
        let mut exp = end + 1;
        if exp < bytes.len() && (bytes[exp] == b'+' || bytes[exp] == b'-') {
            exp += 1;
        }
        let digits_start = exp;
        while exp < bytes.len() && bytes[exp].is_ascii_digit() {
            exp += 1;
        }
        if exp > digits_start && exp - digits_start <= 4 {
            out.push_str(&text[end..exp]);
        }
    }
    out.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// MilkDrop'un dosyadaki ayar adları → Butterchurn'ün değişken adları (küçük harfle).
/// Tabloda olmayan adlar olduğu gibi (küçük harfle) geçer. Kaynak: `milkdrop-preset-utils`
/// `src/constants.js` (MIT).
fn var_name(name: &str) -> Option<&'static str> {
    Some(match name {
        "frating" => "rating",
        "fgammaadj" => "gammaadj",
        "fdecay" => "decay",
        "fvideoechozoom" => "echo_zoom",
        "fvideoechoalpha" => "echo_alpha",
        "nvideoechoorientation" => "echo_orient",
        "nwavemode" => "wave_mode",
        "badditivewaves" => "additivewave",
        "bwavedots" => "wave_dots",
        "bwavethick" => "wave_thick",
        "bmodwavealphabyvolume" => "modwavealphabyvolume",
        "bmaximizewavecolor" => "wave_brighten",
        "btexwrap" => "wrap",
        "bdarkencenter" => "darken_center",
        "bredbluestereo" => "red_blue",
        "bbrighten" => "brighten",
        "bdarken" => "darken",
        "bsolarize" => "solarize",
        "binvert" => "invert",
        "fwavealpha" => "wave_a",
        "fwavescale" => "wave_scale",
        "fwavesmoothing" => "wave_smoothing",
        "fwaveparam" => "wave_mystery",
        "fmodwavealphastart" => "modwavealphastart",
        "fmodwavealphaend" => "modwavealphaend",
        "fwarpanimspeed" => "warpanimspeed",
        "fwarpscale" => "warpscale",
        "fzoomexponent" => "zoomexp",
        "nmotionvectorsx" => "mv_x",
        "nmotionvectorsy" => "mv_y",
        "thick" => "thickoutline",
        "instances" | "num_instances" => "num_inst",
        "badditive" => "additive",
        "busedots" => "usedots",
        "bspectrum" => "spectrum",
        "bdrawthick" => "thick",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_ok(text: &str) -> Parsed {
        parse(text).unwrap()
    }

    #[test]
    fn sayilar_parsefloat_gibi_okunur() {
        assert_eq!(parse_number("1.000000"), Some(1.0));
        assert_eq!(parse_number(" -0.5abc"), Some(-0.5));
        assert_eq!(parse_number("+.25"), Some(0.25));
        assert_eq!(parse_number("3."), Some(3.0));
        assert_eq!(parse_number("1e3"), Some(1000.0));
        assert_eq!(parse_number("2.5E-2x"), Some(0.025));
        assert_eq!(parse_number("1e"), Some(1.0), "eksik üs atlanır");
        assert_eq!(parse_number("0,75"), Some(0.75), "virgüllü ondalık");
        for bad in [
            "", "abc", "-", ".", "inf", "NaN", "Infinity", "1e999", "-1e9999",
        ] {
            assert_eq!(parse_number(bad), None, "{bad:?}");
        }
        // Çok uzun üs kırpılır, panik yok.
        assert_eq!(parse_number("1e00000000001"), Some(1.0));
    }

    #[test]
    fn anahtarlar_siniflanir() {
        assert_eq!(classify("per_frame_init_3"), Key::Main(MainCode::Init, 3));
        assert_eq!(classify("per_frame_12"), Key::Main(MainCode::Frame, 12));
        assert_eq!(classify("per_pixel_1"), Key::Main(MainCode::Pixel, 1));
        assert_eq!(classify("warp_1"), Key::Shader(ShaderKind::Warp, 1));
        assert_eq!(classify("comp_20"), Key::Shader(ShaderKind::Comp, 20));
        assert_eq!(classify("warp"), Key::Base("warp"), "bükme miktarı ayardır");
        assert_eq!(
            classify("wavecode_2_bspectrum"),
            Key::WaveValue(2, "bspectrum")
        );
        assert_eq!(
            classify("wave_1_per_point7"),
            Key::Wave(1, WaveCode::Point, 7)
        );
        assert_eq!(
            classify("wave_1_per_point_7"),
            Key::Wave(1, WaveCode::Point, 7)
        );
        assert_eq!(classify("wave_0_init1"), Key::Wave(0, WaveCode::Init, 1));
        assert_eq!(
            classify("wave_3_per_frame2"),
            Key::Wave(3, WaveCode::Frame, 2)
        );
        assert_eq!(classify("shapecode_3_rad"), Key::ShapeValue(3, "rad"));
        assert_eq!(
            classify("shape_0_per_frame1"),
            Key::Shape(0, ShapeCode::Frame, 1)
        );
        assert_eq!(
            classify("shape_2_init_4"),
            Key::Shape(2, ShapeCode::Init, 4)
        );
        assert_eq!(classify("wave_x"), Key::Base("wave_x"));
        assert_eq!(classify("wave_r"), Key::Base("wave_r"));
        assert_eq!(
            classify("wavecode_4_enabled"),
            Key::Ignored,
            "beşinci dalga yok"
        );
        assert_eq!(classify("shape_7_per_frame1"), Key::Ignored);
        assert_eq!(classify("per_frame_"), Key::Base("per_frame_"));
        assert_eq!(classify("per_frame_x"), Key::Base("per_frame_x"));
        assert_eq!(
            classify("per_frame_9999999"),
            Key::Base("per_frame_9999999")
        );
        assert_eq!(classify("milkdrop_preset_version"), Key::Ignored);
    }

    /// MilkDrop 2 biçiminde, her bölüm türünü içeren özgün (Lyraska için yazılmış) bir preset.
    const FULL: &str = "MILKDROP_PRESET_VERSION=201\r\n\
PSVERSION=2\r\n\
[preset00]\r\n\
fRating=3.000000\r\n\
fDecay=0.950000\r\n\
nWaveMode=2\r\n\
zoom=1.010000\r\n\
fDecay=0.5\r\n\
nMotionVectorsX=12.000000\r\n\
wavecode_0_enabled=1\r\n\
wavecode_0_bSpectrum=1\r\n\
wavecode_0_bDrawThick=1\r\n\
wavecode_0_r=0.4\r\n\
wave_0_init1=t1 = 0;\r\n\
wave_0_per_frame1=t1 = t1 + 0.01;\r\n\
wave_0_per_point2=y = y + 0.1*sin(sample*6);\r\n\
wave_0_per_point1=x = sample;\r\n\
shapecode_1_enabled=1\r\n\
shapecode_1_sides=6\r\n\
shapecode_1_thickOutline=1\r\n\
shapecode_1_num_inst=3\r\n\
shape_1_init1=q1 = 0;\r\n\
shape_1_per_frame1=ang = time*0.2;\r\n\
per_frame_init_1=q8 = 1;\r\n\
per_frame_2=rot = rot + 0.01;\r\n\
per_frame_1=zoom = zoom + 0.01*bass;\r\n\
per_pixel_1=rot = rot + 0.02*rad;\r\n\
warp_1=`shader_body\r\n\
warp_2=`{ ret = tex2D(sampler_main, uv).xyz; }\r\n\
comp_1=`shader_body { ret = 1; }\r\n";

    #[test]
    fn her_bolum_turu_dogru_yere_gider() {
        let Parsed {
            preset,
            simplified,
            shader_error,
        } = parse_ok(FULL);
        assert_eq!(preset.version, 2);
        assert!(!simplified, "gölgelendiriciler çevrildi: {shader_error:?}");
        assert!(
            preset.warp.contains("texture(sampler_main, uv)"),
            "{}",
            preset.warp
        );
        assert!(preset.warp.ends_with("ret = lyraska_main(uv).rgb;\n}\n"));
        assert!(preset.comp.contains("shader_body {"), "{}", preset.comp);
        assert_eq!(preset.base_vals.get("rating"), Some(&3.0));
        assert_eq!(
            preset.base_vals.get("decay"),
            Some(&0.95),
            "ilk değer geçerli"
        );
        assert_eq!(preset.base_vals.get("wave_mode"), Some(&2.0));
        assert_eq!(preset.base_vals.get("zoom"), Some(&1.01));
        assert_eq!(preset.base_vals.get("mv_x"), Some(&12.0));
        assert!(!preset.base_vals.contains_key("psversion"));
        assert!(!preset.base_vals.contains_key("milkdrop_preset_version"));

        assert_eq!(preset.init_eqs_eel, "q8 = 1;");
        assert_eq!(
            preset.frame_eqs_eel, "zoom = zoom + 0.01*bass;\nrot = rot + 0.01;",
            "numara sırasıyla"
        );
        assert_eq!(preset.pixel_eqs_eel, "rot = rot + 0.02*rad;");

        assert_eq!(preset.waves.len(), WAVES);
        let wave = &preset.waves[0];
        assert_eq!(wave.base_vals.get("enabled"), Some(&1.0));
        assert_eq!(wave.base_vals.get("spectrum"), Some(&1.0));
        assert_eq!(wave.base_vals.get("thick"), Some(&1.0));
        assert_eq!(wave.base_vals.get("r"), Some(&0.4));
        assert_eq!(wave.init_eqs_eel, "t1 = 0;");
        assert_eq!(wave.frame_eqs_eel, "t1 = t1 + 0.01;");
        assert_eq!(
            wave.point_eqs_eel,
            "x = sample;\ny = y + 0.1*sin(sample*6);"
        );
        assert_eq!(preset.waves[1], ButterchurnWave::default());

        assert_eq!(preset.shapes.len(), SHAPES);
        let shape = &preset.shapes[1];
        assert_eq!(shape.base_vals.get("enabled"), Some(&1.0));
        assert_eq!(shape.base_vals.get("sides"), Some(&6.0));
        assert_eq!(shape.base_vals.get("thickoutline"), Some(&1.0));
        assert_eq!(shape.base_vals.get("num_inst"), Some(&3.0));
        assert_eq!(shape.init_eqs_eel, "q1 = 0;");
        assert_eq!(shape.frame_eqs_eel, "ang = time*0.2;");
        assert_eq!(preset.shapes[0], ButterchurnShape::default());
    }

    #[test]
    fn json_butterchurn_bicimindedir() {
        let json = serde_json::to_value(parse_ok(FULL).preset).unwrap();
        for key in [
            "version",
            "baseVals",
            "shapes",
            "waves",
            "init_eqs_eel",
            "frame_eqs_eel",
            "pixel_eqs_eel",
            "warp",
            "comp",
        ] {
            assert!(json.get(key).is_some(), "{key} eksik");
        }
        assert!(json["waves"][0].get("point_eqs_eel").is_some());
        assert!(json["shapes"][0].get("baseVals").is_some());
        assert!(json.get("initEqsEel").is_none());
    }

    #[test]
    fn milkdrop_1_eski_anahtarlari_okunur() {
        // MilkDrop 1.x: sürüm satırı yok, eski adlar (b…, f…, n…), gölgelendirici yok.
        let text = "[preset00]\n\
fRating=2.0\n\
fGammaAdj=1.5\n\
fVideoEchoZoom=1.2\n\
fVideoEchoAlpha=0.3\n\
nVideoEchoOrientation=1\n\
bAdditiveWaves=1\n\
bWaveDots=0\n\
bMaximizeWaveColor=1\n\
bTexWrap=0\n\
bDarkenCenter=1\n\
bMotionVectorsOn=0\n\
bRedBlueStereo=0\n\
bBrighten=0\n\
bDarken=1\n\
bSolarize=0\n\
bInvert=0\n\
fWaveAlpha=0.7\n\
fWaveScale=1.3\n\
fWaveSmoothing=0.6\n\
fWaveParam=-0.2\n\
fModWaveAlphaStart=0.5\n\
fModWaveAlphaEnd=1.0\n\
fWarpAnimSpeed=1.1\n\
fWarpScale=1.4\n\
fZoomExponent=1.2\n\
fShader=0.0\n\
nMotionVectorsY=8\n\
per_frame_1=wave_r = 0.5 + 0.5*sin(time);\n";
        let Parsed {
            preset, simplified, ..
        } = parse_ok(text);
        assert_eq!(preset.version, 1);
        assert!(!simplified);
        let expect = [
            ("rating", 2.0),
            ("gammaadj", 1.5),
            ("echo_zoom", 1.2),
            ("echo_alpha", 0.3),
            ("echo_orient", 1.0),
            ("additivewave", 1.0),
            ("wave_dots", 0.0),
            ("wave_brighten", 1.0),
            ("wrap", 0.0),
            ("darken_center", 1.0),
            ("bmotionvectorson", 0.0),
            ("red_blue", 0.0),
            ("brighten", 0.0),
            ("darken", 1.0),
            ("solarize", 0.0),
            ("invert", 0.0),
            ("wave_a", 0.7),
            ("wave_scale", 1.3),
            ("wave_smoothing", 0.6),
            ("wave_mystery", -0.2),
            ("modwavealphastart", 0.5),
            ("modwavealphaend", 1.0),
            ("warpanimspeed", 1.1),
            ("warpscale", 1.4),
            ("zoomexp", 1.2),
            ("fshader", 0.0),
            ("mv_y", 8.0),
        ];
        for (name, value) in expect {
            assert_eq!(preset.base_vals.get(name), Some(&value), "{name}");
        }
        assert_eq!(preset.frame_eqs_eel, "wave_r = 0.5 + 0.5*sin(time);");
    }

    #[test]
    fn surum_200_ve_ustu_milkdrop_2dir() {
        let body = "[preset00]\nzoom=1\n";
        assert_eq!(parse_ok(body).preset.version, 1);
        let v200 = format!("MILKDROP_PRESET_VERSION=200\n{body}");
        assert_eq!(parse_ok(&v200).preset.version, 2);
        let v100 = format!("MILKDROP_PRESET_VERSION=100\n{body}");
        assert_eq!(parse_ok(&v100).preset.version, 1);
    }

    #[test]
    fn baslik_yoksa_butun_dosya_okunur_sonraki_bolum_okunmaz() {
        let no_header = parse_ok("zoom=1.1\nper_frame_1=rot = 0.1;\n").preset;
        assert_eq!(no_header.base_vals.get("zoom"), Some(&1.1));
        assert_eq!(no_header.frame_eqs_eel, "rot = 0.1;");

        let two = parse_ok("[preset00]\nzoom=1.1\n[preset01]\nzoom=2\nper_frame_1=x=1;\n").preset;
        assert_eq!(two.base_vals.get("zoom"), Some(&1.1));
        assert_eq!(two.frame_eqs_eel, "");
    }

    #[test]
    fn sayi_olmayan_ve_sonsuz_degerler_atlanir() {
        let preset = parse_ok(
            "[preset00]\nzoom=abc\nrot=inf\ncx=NaN\ncy=0.4\nshapecode_0_ImageURL=resim.jpg\n\
             wavecode_0_r=1e999\n",
        )
        .preset;
        assert_eq!(preset.base_vals.len(), 1);
        assert_eq!(preset.base_vals.get("cy"), Some(&0.4));
        assert!(preset.shapes[0].base_vals.is_empty());
        assert!(preset.waves[0].base_vals.is_empty());
    }

    #[test]
    fn bos_ve_tanimsiz_metin_reddedilir() {
        assert_eq!(parse(""), Err(ParseError::NotAPreset));
        assert_eq!(parse("merhaba dünya\n"), Err(ParseError::NotAPreset));
        assert_eq!(parse("[preset00]\nzoom=xyz\n"), Err(ParseError::NotAPreset));
        assert_eq!(
            parse("MILKDROP_PRESET_VERSION=201\n[preset00]\n"),
            Err(ParseError::NotAPreset)
        );
    }

    #[test]
    fn sinirlar_asilinca_reddedilir() {
        // Sınır dosyanın baytlarındadır (`load`); çözülmüş metin eski kodlamadan en çok üç kat büyür.
        let big = "a".repeat(MAX_TEXT_BYTES + 1);
        assert_eq!(parse(&big), Err(ParseError::TooLarge));
        let many = "\n".repeat(MAX_LINES + 1);
        assert_eq!(parse(&many), Err(ParseError::TooManyLines));
        // Ayar sayısı sınırı: binlerce farklı ad yalnızca ilk 256'sı kadar yer tutar.
        let names: String = (0..5000).map(|i| format!("ayar{i}=1\n")).collect();
        let preset = parse_ok(&names).preset;
        assert_eq!(preset.base_vals.len(), MAX_BASE_VALUES);
    }

    #[test]
    fn donguler_denklemin_calisma_sikligina_gore_denetlenir() {
        // Karede (ya da açılışta) bir kez çalışanlar: döngü sayısı MilkDrop sınırına kırpılır.
        let preset = parse_ok(
            "per_frame_1=loop(2000000000, q1 = q1 + 1);\n\
             per_frame_init_1=while(a)\n\
             wave_0_init1=loop(5, b = 1);\n\
             wave_0_per_frame1=LOOP(n, b = 2);\n\
             shape_0_init1=loop(7, c = 1);\n",
        )
        .preset;
        assert_eq!(
            preset.frame_eqs_eel,
            "loop(min(1048576, 2000000000), q1 = q1 + 1);"
        );
        assert_eq!(preset.init_eqs_eel, "while(a)");
        assert_eq!(
            preset.waves[0].init_eqs_eel,
            "loop(min(1048576, 5), b = 1);"
        );
        assert_eq!(
            preset.waves[0].frame_eqs_eel,
            "LOOP(min(1048576, n), b = 2);"
        );
        assert_eq!(
            preset.shapes[0].init_eqs_eel,
            "loop(min(1048576, 7), c = 1);"
        );

        // Karede çok kez çalışanlar (piksel, dalga noktası, şekil örneği): döngü yasak.
        for text in [
            "per_pixel_1=loop(2, a = 1);",
            "wave_1_per_point1=while(x)",
            "shape_2_per_frame1=loop(3, a)",
            "shape_2_per_frame_1=a = 1;\nshape_2_per_frame_2=WHILE (b)",
        ] {
            assert_eq!(parse(text), Err(ParseError::UnsafeLoop), "{text}");
        }
        // İç içe döngü; satırlara bölünse de (eel-wasm satırları birleştirir).
        for text in [
            "per_frame_1=loop(9, loop(9, a));",
            "per_frame_1=loop(9,\nper_frame_2=while(a));",
            "wave_0_per_frame1=while(loop(2, a))",
        ] {
            assert_eq!(parse(text), Err(ParseError::UnsafeLoop), "{text}");
        }
        // Çok fazla döngü (bütün denklemlerde toplam).
        let many: String = (0..=super::super::eel::MAX_LOOPS)
            .map(|i| format!("per_frame_{}=loop(2, a = 1);\n", i + 1))
            .collect();
        assert_eq!(parse(&many), Err(ParseError::TooManyLoops));
        // Yorumdaki ya da başka addaki döngü sayılmaz.
        let fine = parse_ok("per_pixel_1=myloop(1, 2); // loop(1e9, a)\n").preset;
        assert_eq!(fine.pixel_eqs_eel, "myloop(1, 2); // loop(1e9, a)");
    }

    #[test]
    fn cevrilemeyen_golgelendirici_atilir_otekisi_kalir() {
        let text = "[preset00]\nzoom=1\n\
                    warp_1=`shader_body { ret = tanimsiz_islev(uv); }\n\
                    comp_1=`shader_body\ncomp_2=`{ ret = GetPixel(uv); }\n";
        let Parsed {
            preset,
            simplified,
            shader_error,
        } = parse_ok(text);
        assert!(simplified);
        assert_eq!(preset.warp, "", "çevrilemeyen bükme atıldı");
        assert!(
            preset.comp.contains("texture(sampler_main"),
            "{}",
            preset.comp
        );
        let error = shader_error.unwrap();
        assert!(
            error.starts_with("bükme: gölgelendirici çevrilemedi"),
            "{error}"
        );
        assert!(error.contains("tanimsiz_islev"), "{error}");

        // shader_body olmayan metin çeviriciye gitmez; boş satırlar gölgelendirici sayılmaz.
        let parsed = parse_ok("[preset00]\nzoom=1\nwarp_1=`ret = 1;\ncomp_1=`\ncomp_2=` \n");
        assert!(parsed.simplified);
        assert_eq!(parsed.preset.comp, "");
        assert_eq!(
            parsed.shader_error.as_deref(),
            Some("bükme: gölgelendiricide shader_body bloğu yok")
        );
    }

    #[test]
    fn denetim_karakterleri_temizlenir() {
        let preset = parse_ok("per_frame_1=a = 1;\u{0}\u{7}\tb = 2;\n").preset;
        assert_eq!(preset.frame_eqs_eel, "a = 1;  \tb = 2;");
    }

    #[test]
    fn bozuk_girdide_panik_yok() {
        // Rastgele kesilmiş, karışık satırlar: her biri ya ayrıştırılır ya da hatayla döner.
        let mut seed = 0x2545_f491_4f6c_dd1d_u64;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        let pieces = [
            "[preset00]",
            "=",
            "==",
            "per_frame_",
            "per_frame_1=",
            "wave_",
            "wave_9",
            "wave_0_",
            "wave_0_per_point",
            "shapecode_",
            "shapecode_0_",
            "_",
            "1",
            "e",
            "-",
            ".",
            ",",
            "\n",
            "\r\n",
            "[",
            "]",
            "ş",
            "\u{0}",
            "warp_1=`",
            "MILKDROP_PRESET_VERSION=",
            "9e9",
            "wavecode_0_",
            "shape_3_init",
        ];
        for _ in 0..2000 {
            let len = (next() % 40) as usize;
            let text: String = (0..len)
                .map(|_| pieces[(next() % pieces.len() as u64) as usize])
                .collect();
            let _ = parse(&text);
        }
        // Bayt düzeyinde: her char sınırında kesmek de güvenli.
        for end in 0..FULL.len() {
            if FULL.is_char_boundary(end) {
                let _ = parse(&FULL[..end]);
            }
        }
    }
}
