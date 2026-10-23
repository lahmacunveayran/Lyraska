//! MilkDrop 2 gölgelendiricileri (HLSL) → Butterchurn 3.0'ın `warp`/`comp` biçimi (GLSL ES 3.00).
//!
//! Üç adım:
//!
//! 1. **Hazırlık** ([`prepare`]): `.milk`'teki metin MilkDrop'un sarmalamasıyla tam bir HLSL
//!    programına çevrilir: örnekleyiciler (`sampler_main`, `sampler_blur1` …), değişkenler (`q1`,
//!    `time`, `texsize` …), MilkDrop makroları (`GetBlur1`, `GetPixel`, `lum`, `tex2d` …) eklenir;
//!    `shader_body { … }` gövdesi `float4 lyraska_main(float2 uv : TEXCOORD0) : COLOR0` işlevi
//!    olur. Jordan Berg'in `milkdrop-preset-utils` (0.2.1, MIT) paketindeki `prepareShader`'dan
//!    uyarlanmıştır (`docs/LISANSLAR.md`); `sampler_state` blokları ve kullanıcının
//!    örnekleyici bildirimleri Lyraska'da ayrıca düzeltilir.
//! 2. **Çeviri** ([`translate`]): projectM'in hlslparser'ı (MIT; `src-tauri/vendor/hlslparser`)
//!    WebAssembly'ye derlenmiştir (`src-tauri/hlsl/hlslparser.wasm`, `hlsl/build.sh`) ve `wasmi`
//!    ile **kum havuzunda** çalışır: her çeviri yeni bir örnekte, en çok [`FUEL`] adım ve
//!    [`MAX_MEMORY_BYTES`] bellekle. Çeviricideki bir hata ya da sonsuz döngü yalnızca bu
//!    gölgelendiricinin çevrilememesi olur; program çökmez, donmaz. Dosya, saat, ağ yoktur
//!    (WASI işlevleri "desteklenmiyor" döner).
//! 3. **Butterchurn biçimi** ([`finish`]): çıktının başlığı Butterchurn'ün kendi çerçevesine
//!    uydurulur (`processUnOptimizedShader`'ın yaptığı iş; Lyraska'da satır satır ve ad listesiyle):
//!    Butterchurn'ün zaten tanımladığı uniform'lar atılır (ör. `q1`, onun için `_qa.x` makrosudur),
//!    kullanıcının örnekleyicileri `uniform sampler2D` olur. Butterchurn `rad`, `ang`, `uv_orig`
//!    ve `hue_shader`'ı `main()` içinde yerel değişken olarak tanımlar; işlev bunları göremez, bu
//!    yüzden aynı adlı genel değişkenlere `lyraska_inputs(…)` ile kopyalanır. Sonuç
//!    `<başlık> shader_body { lyraska_inputs(…); ret = lyraska_main(uv).rgb; }` biçimindedir.
//!
//! Güvenlik: girdi en çok [`MAX_SOURCE_BYTES`], çıktı en çok [`MAX_OUTPUT_BYTES`]; çıktı yalnızca
//! GLSL'in kullandığı karakterlerden oluşur (tırnak, ters bölü, `#`, `$`, ters tırnak yok) ve
//! arayüze yalnızca metin olarak gider: Butterchurn onu ekran kartına derletir (WebGL kum havuzu).
//! JavaScript olarak hiçbir yerde çalışmaz. Gölgelendiricinin ürettiği görüntü yine parlaklık
//! freninden geçer (`flashGuard.ts`).
//!
//! Sonuçlar bellekte saklanır (aynı metin bir daha çevrilmez); en çok [`CACHE_ENTRIES`].

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use wasmi::{
    Caller, Config, Engine, Extern, Linker, Module, Store, StoreLimits, StoreLimitsBuilder,
    TrapCode,
};

/// Derlenmiş çevirici (`src-tauri/hlsl/build.sh`; CI yeniden derleyip aynı olduğunu denetler).
static TRANSLATOR_WASM: &[u8] = include_bytes!("../../hlsl/hlslparser.wasm");

/// Bir gölgelendiricinin (`warp_N` ya da `comp_N` satırlarının toplamı) en büyük boyutu. Gerçek
/// presetlerde birkaç KB'tır.
pub const MAX_SOURCE_BYTES: usize = 64 * 1024;
/// Çevirinin en büyük boyutu (bayt).
pub const MAX_OUTPUT_BYTES: usize = 512 * 1024;
/// Çeviricinin en çok kullanabileceği bellek.
pub const MAX_MEMORY_BYTES: usize = 64 * 1024 * 1024;
/// Bir çevirinin en çok adımı ("yakıt"; kabaca bir WebAssembly komutu bir adım). Gerçek
/// gölgelendiriciler 10–60 milyon adımda çevrilir; sınır bunun ~20 katı ve bir iki saniyede
/// dolar: sonsuz döngüye giren çeviri programı dondurmaz.
pub const FUEL: u64 = 1_000_000_000;
/// Bellekte saklanan en fazla çeviri.
const CACHE_ENTRIES: usize = 256;
/// Hata iletisinin en büyük uzunluğu (karakter).
const MAX_MESSAGE_CHARS: usize = 200;
/// Çeviricinin giriş noktası (`shim.cpp` ile aynı).
const ENTRY: &str = "lyraska_main";

/// Gölgelendiricinin türü: Butterchurn ikisini ayrı çerçevelere yerleştirir.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ShaderKind {
    /// Bükme (`warp_N`): bir önceki kareyi bükerek yeni kareyi üretir.
    Warp,
    /// Birleştirme (`comp_N`): ekrana çıkan son görüntü.
    Comp,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ShaderError {
    #[error("gölgelendirici çok uzun (en fazla {} KB)", MAX_SOURCE_BYTES / 1024)]
    TooLarge,
    #[error("gölgelendiricide shader_body bloğu yok")]
    NoBody,
    #[error("gölgelendirici çevrilemedi: {0}")]
    Rejected(String),
    #[error("gölgelendiricinin çevirisi çok uzun sürdü")]
    OutOfFuel,
    #[error("gölgelendirici çevirici durdu ({0})")]
    Trapped(String),
    #[error("gölgelendiricinin çevirisi beklenmedik ({0})")]
    BadOutput(&'static str),
    #[error("gölgelendirici çevirici başlatılamadı ({0})")]
    Engine(String),
}

/// Bellekteki çeviriler: (tür, `.milk`'teki metin) → sonuç (hatalar da saklanır).
type CacheKey = (ShaderKind, String);
type Converted = Result<String, ShaderError>;

/// `.milk`'teki bir gölgelendiriciyi Butterchurn biçimine çevirir (önce bellekteki sonuçlara
/// bakılır). Hiçbir girdide panik yapmaz.
pub fn convert(source: &str, kind: ShaderKind) -> Result<String, ShaderError> {
    static CACHE: Mutex<Option<HashMap<CacheKey, Converted>>> = Mutex::new(None);
    let key = (kind, source.to_owned());
    if let Ok(mut cache) = CACHE.lock() {
        if let Some(hit) = cache.get_or_insert_with(HashMap::new).get(&key) {
            return hit.clone();
        }
    }
    let result = convert_uncached(source, kind);
    // Başlatma hatası kalıcı değildir (ör. bellek yetmedi): saklanmaz.
    if !matches!(result, Err(ShaderError::Engine(_))) {
        if let Ok(mut cache) = CACHE.lock() {
            let cache = cache.get_or_insert_with(HashMap::new);
            if cache.len() >= CACHE_ENTRIES {
                cache.clear();
            }
            cache.insert(key, result.clone());
        }
    }
    result
}

fn convert_uncached(source: &str, kind: ShaderKind) -> Result<String, ShaderError> {
    if source.len() > MAX_SOURCE_BYTES {
        return Err(ShaderError::TooLarge);
    }
    let hlsl = prepare(source)?;
    let glsl = translate(&hlsl, FUEL)?;
    finish(&glsl, kind)
}

// ---------------------------------------------------------------------------------------------
// 1. Hazırlık

/// Butterchurn'ün (ve MilkDrop'un) her gölgelendiriciye verdiği örnekleyiciler.
const BUILTIN_SAMPLERS: [&str; 15] = [
    "sampler_main",
    "sampler_fw_main",
    "sampler_pw_main",
    "sampler_fc_main",
    "sampler_pc_main",
    "sampler_noise_lq",
    "sampler_noise_lq_lite",
    "sampler_noise_mq",
    "sampler_noise_hq",
    "sampler_pw_noise_lq",
    "sampler_noisevol_lq",
    "sampler_noisevol_hq",
    "sampler_blur1",
    "sampler_blur2",
    "sampler_blur3",
];

/// Kullanıcının metninden önce gelen MilkDrop tanımları (`milkdrop-preset-utils`'in
/// `prepareShader` şablonu; MIT). Değişkenler HLSL'de bildirilir ki çevirici türlerini bilsin;
/// GLSL çıktısında Butterchurn'ün kendi uniform'ları kullanılır ([`finish`]).
const PREAMBLE: &str = "#define M_PI 3.14159265359
#define M_PI_2 6.28318530718
#define M_INV_PI_2 0.159154943091895

uniform sampler2D sampler_main;
uniform sampler2D sampler_fw_main;
uniform sampler2D sampler_pw_main;
uniform sampler2D sampler_fc_main;
uniform sampler2D sampler_pc_main;
uniform sampler2D sampler_noise_lq;
uniform sampler2D sampler_noise_lq_lite;
uniform sampler2D sampler_noise_mq;
uniform sampler2D sampler_noise_hq;
uniform sampler3D sampler_noisevol_lq;
uniform sampler3D sampler_noisevol_hq;
uniform sampler2D sampler_pw_noise_lq;
uniform sampler2D sampler_blur1;
uniform sampler2D sampler_blur2;
uniform sampler2D sampler_blur3;

float4 texsize_noise_lq;
float4 texsize_noise_mq;
float4 texsize_noise_hq;
float4 texsize_noise_lq_lite;
float4 texsize_noisevol_lq;
float4 texsize_noisevol_hq;

float4 _qa;
float4 _qb;
float4 _qc;
float4 _qd;
float4 _qe;
float4 _qf;
float4 _qg;
float4 _qh;
float q1; float q2; float q3; float q4; float q5; float q6; float q7; float q8;
float q9; float q10; float q11; float q12; float q13; float q14; float q15; float q16;
float q17; float q18; float q19; float q20; float q21; float q22; float q23; float q24;
float q25; float q26; float q27; float q28; float q29; float q30; float q31; float q32;

float blur1_min;
float blur1_max;
float blur2_min;
float blur2_max;
float blur3_min;
float blur3_max;
float scale1;
float scale2;
float scale3;
float bias1;
float bias2;
float bias3;

float4 slow_roam_cos;
float4 roam_cos;
float4 slow_roam_sin;
float4 roam_sin;

float3 hue_shader;
float time;
float4 rand_preset;
float4 rand_frame;
float progress;
float frame;
float fps;
float decay;
float bass;
float mid;
float treb;
float vol;
float bass_att;
float mid_att;
float treb_att;
float vol_att;
float4 texsize;
float4 aspect;
float rad;
float ang;
float2 uv_orig;

#define GetMain(uv) (tex2D(sampler_main,uv).xyz)
#define GetPixel(uv) (tex2D(sampler_main,uv).xyz)
#define GetBlur1(uv) (tex2D(sampler_blur1,uv).xyz*scale1 + bias1)
#define GetBlur2(uv) (tex2D(sampler_blur2,uv).xyz*scale2 + bias2)
#define GetBlur3(uv) (tex2D(sampler_blur3,uv).xyz*scale3 + bias3)
#define lyraska_lum(x) (dot(x,float3(0.32,0.49,0.29)))
#define tex2d tex2D
#define tex3d tex3D
";

/// `.milk`'teki gölgelendiriciyi çevirinin beklediği tam HLSL programına çevirir.
fn prepare(source: &str) -> Result<String, ShaderError> {
    let source = rename_macro_calls(&strip_sampler_states(source));
    let aliases = define_aliases(&source);
    let (head, body) = split_body(&source)?;
    let head = fix_sampler_declarations(head, &aliases);
    Ok(format!(
        "{PREAMBLE}\n{head}\n\nfloat4 {ENTRY}(float2 uv : TEXCOORD0) : COLOR0\n{{\n\
         float3 ret = 0;\n{body}\nreturn float4(ret, 1.0);\n}}\n"
    ))
}

/// Presetlerde aynı adla değişken de olan MilkDrop işlev makroları (`float lum = lum(renk);`).
const FUNCTION_MACROS: [&str; 1] = ["lum"];

/// `lum(` → `lyraska_lum(`. projectM'in önişlemcisi makro adını arkasında `(` olmasa da açar;
/// MilkDrop'ta (gerçek C önişlemcisi) `float lum = lum(renk);` geçerlidir. Makro Lyraska adıyla
/// tanımlanır, yalnızca çağrılar yeniden adlandırılır: aynı adlı değişkene dokunulmaz.
/// (`GetPixel` gibi ötekiler kendi adıyla kalır: presetler `#define MyGet GetPixel` diye takma ad
/// verir.)
fn rename_macro_calls(source: &str) -> String {
    let bytes = source.as_bytes();
    let mut out = String::with_capacity(source.len() + 64);
    let mut copied = 0;
    let mut i = 0;
    while i < bytes.len() {
        if !is_ident_start(bytes[i]) || (i > 0 && is_ident(bytes[i - 1])) {
            i += 1;
            continue;
        }
        let end = ident_end(bytes, i);
        let word = &source[i..end];
        let next = skip_space(bytes, end);
        if bytes.get(next) == Some(&b'(') && FUNCTION_MACROS.contains(&word) {
            out.push_str(&source[copied..i]);
            out.push_str("lyraska_");
            copied = i;
        }
        i = end;
    }
    out.push_str(&source[copied..]);
    out
}

/// `#define ad başka_ad` biçimindeki takma adlar (ikisi de tek kelime; sondaki yorum atılır).
fn define_aliases(source: &str) -> HashMap<&str, &str> {
    let mut aliases = HashMap::new();
    for line in source.lines() {
        let Some(rest) = line.trim_start().strip_prefix("#define") else {
            continue;
        };
        let rest = rest.split("//").next().unwrap_or("");
        let mut words = rest.split_whitespace();
        let simple =
            |s: &str| s.bytes().next().is_some_and(is_ident_start) && s.bytes().all(is_ident);
        if let (Some(name), Some(value), None) = (words.next(), words.next(), words.next()) {
            if simple(name) && simple(value) {
                aliases.insert(name, value);
            }
        }
    }
    aliases
}

/// `shader_body`'den önceki kısım (kullanıcının işlevleri, bildirimleri) ve gövde (ilk `{` ile
/// son `}` arası; Butterchurn'ün `getShaderParts`'ı gibi). MilkDrop da `shader_body` arar: yoksa
/// gölgelendirici geçersizdir (çeviriciye hiç gitmez).
fn split_body(source: &str) -> Result<(&str, &str), ShaderError> {
    let at = source.find("shader_body").ok_or(ShaderError::NoBody)?;
    let after = &source[at..];
    let (Some(open), Some(close)) = (after.find('{'), after.rfind('}')) else {
        return Err(ShaderError::NoBody);
    };
    if close < open {
        return Err(ShaderError::NoBody);
    }
    Ok((&source[..at], &after[open + 1..close]))
}

/// `sampler2D sampler_x = sampler_state { … };` → `sampler2D sampler_x;`. Doku sarma ayarları
/// GLSL'de gölgelendiricide değil dokudadır (Butterchurn kendi ayarını kullanır).
fn strip_sampler_states(source: &str) -> String {
    let mut text = source.to_owned();
    let mut from = 0;
    while let Some(found) = text[from..].find("sampler_state").map(|i| i + from) {
        let eq = text[..found].rfind('=');
        let close = text[found..].find('}').map(|i| i + found);
        let semicolon = close.and_then(|c| text[c..].find(';').map(|i| i + c));
        match (eq, semicolon) {
            (Some(eq), Some(semicolon)) => {
                text.replace_range(eq..semicolon, "");
                from = eq;
            }
            _ => break,
        }
    }
    text
}

/// Kullanıcının örnekleyici bildirimleri: `sampler sampler_x;` (MilkDrop'un kısa yazımı) →
/// `sampler2D sampler_x;`; programın zaten tanımladıkları (`sampler_main` …) silinir. Bildirilen ad
/// bir takma adsa (`#define sampler_resim sampler_bulut`) gerçek ad bildirilir: projectM'in
/// önişlemcisi takma adı parantezle açar, `sampler2D (sampler_bulut);` ayrıştırılamaz.
fn fix_sampler_declarations(head: &str, aliases: &HashMap<&str, &str>) -> String {
    let bytes = head.as_bytes();
    let mut out = String::with_capacity(head.len());
    let mut copied = 0;
    let mut i = 0;
    while i < bytes.len() {
        if !is_ident_start(bytes[i]) || (i > 0 && is_ident(bytes[i - 1])) {
            i += 1;
            continue;
        }
        let word_end = ident_end(bytes, i);
        let word = &head[i..word_end];
        let kind = match word {
            "sampler" | "sampler2D" => Some("sampler2D"),
            "sampler3D" => Some("sampler3D"),
            _ => None,
        };
        let declaration = kind.and_then(|kind| {
            let name_start = skip_space(bytes, word_end);
            if name_start == word_end || !bytes.get(name_start).is_some_and(|b| is_ident_start(*b))
            {
                return None;
            }
            let name_end = ident_end(bytes, name_start);
            let semicolon = skip_space(bytes, name_end);
            (bytes.get(semicolon) == Some(&b';'))
                .then(|| (kind, &head[name_start..name_end], semicolon + 1))
        });
        match declaration {
            Some((kind, name, end)) => {
                // Önündeki `uniform` da bildirime dahildir.
                let start = uniform_before(head, i);
                out.push_str(&head[copied..start]);
                let mut name = name;
                for _ in 0..8 {
                    match aliases.get(name) {
                        Some(real) => name = real,
                        None => break,
                    }
                }
                let lower = name.to_ascii_lowercase();
                if !BUILTIN_SAMPLERS.contains(&lower.as_str()) {
                    out.push_str(kind);
                    out.push(' ');
                    out.push_str(name);
                    out.push(';');
                }
                copied = end;
                i = end;
            }
            None => i = word_end,
        }
    }
    out.push_str(&head[copied..]);
    out
}

/// `i`'deki kelimenin hemen önünde (boşlukla) `uniform` varsa onun başı; yoksa `i`.
fn uniform_before(text: &str, i: usize) -> usize {
    let before = text[..i].trim_end_matches([' ', '\t', '\r', '\n']);
    match before.strip_suffix("uniform") {
        Some(rest) if !rest.as_bytes().last().is_some_and(|b| is_ident(*b)) => rest.len(),
        _ => i,
    }
}

fn is_ident_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_'
}

fn is_ident(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn ident_end(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && is_ident(bytes[i]) {
        i += 1;
    }
    i
}

fn skip_space(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    i
}

// ---------------------------------------------------------------------------------------------
// 2. Çeviri (WebAssembly kum havuzu)

/// Bir çevirinin kendi deposu: yalnızca bellek sınırı.
struct Sandbox {
    limits: StoreLimits,
}

struct Translator {
    engine: Engine,
    module: Module,
    linker: Linker<Sandbox>,
}

/// WASI hata kodları (wasi_snapshot_preview1).
const WASI_EBADF: i32 = 8;
const WASI_EFAULT: i32 = 21;

fn translator() -> Result<&'static Translator, ShaderError> {
    static TRANSLATOR: OnceLock<Result<Translator, String>> = OnceLock::new();
    TRANSLATOR
        .get_or_init(build_translator)
        .as_ref()
        .map_err(|e| ShaderError::Engine(e.clone()))
}

fn build_translator() -> Result<Translator, String> {
    let mut config = Config::default();
    config.consume_fuel(true);
    let engine = Engine::new(&config);
    let module = Module::new(&engine, TRANSLATOR_WASM).map_err(|e| e.to_string())?;
    let mut linker = Linker::<Sandbox>::new(&engine);
    // C kitaplığının açılışta ve hata iletisi yazarken çağırdığı WASI işlevleri: ortam boş,
    // dosya yok (yazma, kapatma, konumlama "geçersiz dosya" döner), çıkış tuzaktır.
    let wasi = "wasi_snapshot_preview1";
    let link = |e: wasmi::errors::LinkerError| e.to_string();
    linker
        .func_wrap(
            wasi,
            "environ_sizes_get",
            |mut caller: Caller<'_, Sandbox>, count: i32, size: i32| -> i32 {
                if write_zero(&mut caller, count) && write_zero(&mut caller, size) {
                    0
                } else {
                    WASI_EFAULT
                }
            },
        )
        .map_err(link)?;
    linker
        .func_wrap(wasi, "environ_get", |_: i32, _: i32| -> i32 { 0 })
        .map_err(link)?;
    linker
        .func_wrap(wasi, "fd_prestat_get", |_: i32, _: i32| -> i32 {
            WASI_EBADF
        })
        .map_err(link)?;
    linker
        .func_wrap(
            wasi,
            "fd_prestat_dir_name",
            |_: i32, _: i32, _: i32| -> i32 { WASI_EBADF },
        )
        .map_err(link)?;
    linker
        .func_wrap(wasi, "fd_close", |_: i32| -> i32 { WASI_EBADF })
        .map_err(link)?;
    linker
        .func_wrap(wasi, "fd_seek", |_: i32, _: i64, _: i32, _: i32| -> i32 {
            WASI_EBADF
        })
        .map_err(link)?;
    linker
        .func_wrap(wasi, "fd_write", |_: i32, _: i32, _: i32, _: i32| -> i32 {
            WASI_EBADF
        })
        .map_err(link)?;
    linker
        .func_wrap(wasi, "proc_exit", |code: i32| -> Result<(), wasmi::Error> {
            Err(wasmi::Error::i32_exit(code))
        })
        .map_err(link)?;
    Ok(Translator {
        engine,
        module,
        linker,
    })
}

/// Çeviricinin belleğine 4 bayt sıfır yazar (WASI "ortam boş").
fn write_zero(caller: &mut Caller<'_, Sandbox>, offset: i32) -> bool {
    let Some(memory) = caller.get_export("memory").and_then(Extern::into_memory) else {
        return false;
    };
    memory
        .write(&mut *caller, offset as u32 as usize, &[0; 4])
        .is_ok()
}

/// Hazırlanmış HLSL'i çeviriciden geçirir: başarıda GLSL ES 3.00 metni.
fn translate(hlsl: &str, fuel: u64) -> Result<String, ShaderError> {
    let translator = translator()?;
    let mut store = Store::new(
        &translator.engine,
        Sandbox {
            limits: StoreLimitsBuilder::new()
                .memory_size(MAX_MEMORY_BYTES)
                .instances(1)
                .memories(1)
                .tables(1)
                .trap_on_grow_failure(true)
                .build(),
        },
    );
    store.limiter(|sandbox| &mut sandbox.limits);
    store.set_fuel(fuel).map_err(trapped)?;
    let instance = translator
        .linker
        .instantiate_and_start(&mut store, &translator.module)
        .map_err(trapped)?;
    let memory = instance
        .get_memory(&store, "memory")
        .ok_or(ShaderError::Engine("bellek yok".into()))?;
    let func = |name: &str| ShaderError::Engine(format!("{name} yok"));
    let initialize = instance
        .get_typed_func::<(), ()>(&store, "_initialize")
        .map_err(|_| func("_initialize"))?;
    let alloc = instance
        .get_typed_func::<u32, u32>(&store, "lyraska_alloc")
        .map_err(|_| func("lyraska_alloc"))?;
    let convert = instance
        .get_typed_func::<(u32, u32), i32>(&store, "lyraska_convert")
        .map_err(|_| func("lyraska_convert"))?;
    let output = instance
        .get_typed_func::<(), u32>(&store, "lyraska_output")
        .map_err(|_| func("lyraska_output"))?;
    let output_len = instance
        .get_typed_func::<(), u32>(&store, "lyraska_output_len")
        .map_err(|_| func("lyraska_output_len"))?;

    initialize.call(&mut store, ()).map_err(trapped)?;
    let length = u32::try_from(hlsl.len()).map_err(|_| ShaderError::TooLarge)?;
    let input = alloc.call(&mut store, length).map_err(trapped)?;
    if input == 0 {
        return Err(ShaderError::Trapped("bellek yetmedi".into()));
    }
    memory
        .write(&mut store, input as usize, hlsl.as_bytes())
        .map_err(|_| ShaderError::Trapped("bellek dışı".into()))?;
    let status = convert.call(&mut store, (input, length)).map_err(trapped)?;
    #[cfg(test)]
    {
        let used = fuel - store.get_fuel().unwrap_or(0);
        tests::FUEL_USED.set(used);
        tests::FUEL_MAX.set(tests::FUEL_MAX.get().max(used));
    }
    let at = output.call(&mut store, ()).map_err(trapped)? as usize;
    let len = output_len.call(&mut store, ()).map_err(trapped)? as usize;
    if len > MAX_OUTPUT_BYTES {
        return Err(ShaderError::BadOutput("çok uzun"));
    }
    let mut bytes = vec![0; len];
    memory
        .read(&store, at, &mut bytes)
        .map_err(|_| ShaderError::BadOutput("bellek dışı"))?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    if status == 0 {
        Ok(text)
    } else {
        Err(ShaderError::Rejected(clean_message(&text)))
    }
}

/// Çeviricinin hata iletisi: tek satır, yazdırılabilir karakterler, kısa.
fn clean_message(text: &str) -> String {
    let mut message: String = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(MAX_MESSAGE_CHARS)
        .collect();
    message = message.trim().to_owned();
    if message.is_empty() {
        "bilinmeyen hata".into()
    } else {
        message
    }
}

fn trapped(error: wasmi::Error) -> ShaderError {
    match error.as_trap_code() {
        Some(TrapCode::OutOfFuel) => ShaderError::OutOfFuel,
        Some(TrapCode::GrowthOperationLimited) => ShaderError::Trapped("bellek yetmedi".into()),
        Some(code) => ShaderError::Trapped(format!("{code:?}")),
        None if error.i32_exit_status().is_some() => {
            ShaderError::Trapped("çevirici kendini kapattı".into())
        }
        None => ShaderError::Trapped(clean_message(&error.to_string())),
    }
}

// ---------------------------------------------------------------------------------------------
// 3. Butterchurn biçimi

/// Butterchurn'ün iki çerçevesinin de tanımladığı uniform'lar (`warp.js`, `comp.js`) ve `q1`…`q32`
/// makroları: çevirinin başlığından atılır.
const PROVIDED: [&str; 51] = [
    "time",
    "resolution",
    "aspect",
    "texsize",
    "texsize_noise_lq",
    "texsize_noise_mq",
    "texsize_noise_hq",
    "texsize_noise_lq_lite",
    "texsize_noisevol_lq",
    "texsize_noisevol_hq",
    "bass",
    "mid",
    "treb",
    "vol",
    "bass_att",
    "mid_att",
    "treb_att",
    "vol_att",
    "frame",
    "fps",
    "_qa",
    "_qb",
    "_qc",
    "_qd",
    "_qe",
    "_qf",
    "_qg",
    "_qh",
    "slow_roam_cos",
    "roam_cos",
    "slow_roam_sin",
    "roam_sin",
    "blur1_min",
    "blur1_max",
    "blur2_min",
    "blur2_max",
    "blur3_min",
    "blur3_max",
    "scale1",
    "scale2",
    "scale3",
    "bias1",
    "bias2",
    "bias3",
    "rand_frame",
    "rand_preset",
    // Lyraska'nın kendi genel değişkenleri ([`inputs_block`]) ya da Butterchurn'ün yerel/giriş
    // değişkenleri: çevirinin bildirimi atılır, yerine Lyraska'nınki gelir.
    "rad",
    "ang",
    "uv_orig",
    "hue_shader",
    "progress",
];

/// Butterchurn kullanıcı örnekleyicisini bulamazsa (Lyraska görsel dosyası yüklemez) 128×128'lik
/// bulut dokusunu bağlar (`ImageTextures.getTexture`); `texsize_x` ona göre verilir.
const USER_TEXSIZE: &str = "vec4(128.0, 128.0, 0.0078125, 0.0078125)";

/// Çevirinin başlığından atılan bildirim: Butterchurn'ün ya da Lyraska'nın tanımladığı ad.
/// `decay` bükme çerçevesinde Butterchurn'ün uniform'udur, birleştirmede Lyraska sabit verir.
fn is_dropped(name: &str) -> bool {
    PROVIDED.contains(&name)
        || BUILTIN_SAMPLERS.contains(&name)
        || name == "decay"
        || (name.len() <= 3
            && name
                .strip_prefix('q')
                .and_then(|n| n.parse::<u8>().ok())
                .is_some_and(|n| (1..=32).contains(&n)))
}

/// `q1`…`q32` → (`_qa`…`_qh`, `x`…`w`): Butterchurn'ün uniform'larındaki yerleri.
fn q_slots() -> impl Iterator<Item = (usize, (&'static str, char))> {
    const VECTORS: [&str; 8] = ["_qa", "_qb", "_qc", "_qd", "_qe", "_qf", "_qg", "_qh"];
    (1..=32).map(|n| (n, (VECTORS[(n - 1) / 4], ['x', 'y', 'z', 'w'][(n - 1) % 4])))
}

/// Gölgelendiricinin işlevlerinin gördüğü genel değişkenler (çevirinin önüne gelir):
/// - Butterchurn'ün `main()` içinde yerel tanımladıkları (`rad`, `ang`, birleştirmede `uv_orig` ve
///   `hue_shader`): `lyraska_inputs(…)` her pikselde kopyalar.
/// - `q1`…`q32`: Butterchurn'de uniform'a (`_qa.x` …) açılan makrolardır; MilkDrop presetleri
///   gölgelendiricide onlara yazabildiği için makro kaldırılır, yerine her pikselde uniform'dan
///   kopyalanan değişken gelir (okuyan için fark yok).
/// - Butterchurn'ün vermediği `progress` (ve birleştirmede `decay`): sabit.
fn globals_block(kind: ShaderKind) -> String {
    let mut block = String::from("float rad;\nfloat ang;\nfloat progress = 0.0;\n");
    block.push_str(match kind {
        ShaderKind::Warp => "vec3 hue_shader = vec3(1.0);\n",
        ShaderKind::Comp => "vec2 uv_orig;\nvec3 hue_shader;\nfloat decay = 0.98;\n",
    });
    for (n, _) in q_slots() {
        block.push_str(&format!("#undef q{n}\nfloat q{n};\n"));
    }
    block
}

/// Çevirinin çıktısını (`#version 300 es` … `void main() { … }`) Butterchurn'ün `warp`/`comp`
/// biçimine getirir ve denetler.
fn finish(glsl: &str, kind: ShaderKind) -> Result<String, ShaderError> {
    let main_at = glsl
        .find("\nvoid main() {")
        .ok_or(ShaderError::BadOutput("main() yok"))?;
    let (header, tail) = glsl.split_at(main_at);
    let lines: Vec<&str> = tail.trim().lines().map(str::trim).collect();
    let call = format!("vec4 result = {ENTRY}(uv);");
    let n = lines.len();
    if n < 6
        || lines[0] != "void main() {"
        || lines[1] != "vec2 uv;"
        || lines[2] != "uv = frag_TEXCOORD0;"
        || lines[n - 3] != call
        || lines[n - 2] != "rast_FragData[0] = result;"
        || lines[n - 1] != "}"
    {
        return Err(ShaderError::BadOutput("main() biçimi"));
    }
    // Çevirici genel değişkenlerin ilk değerlerini main()'in başına yazar (`k = float(2);`).
    let initializers = &lines[3..n - 3];

    let mut out = String::with_capacity(glsl.len() + 2048);
    for line in header.lines() {
        let trimmed = line.trim_end();
        if trimmed.starts_with("#version")
            || trimmed.starts_with("precision ")
            || trimmed == "in vec2 frag_TEXCOORD0;"
            || trimmed == "out vec4 rast_FragData[1];"
        {
            continue;
        }
        match declaration(trimmed) {
            Some((_, name)) if is_dropped(name) => continue,
            Some((ty @ ("sampler2D" | "sampler3D"), name)) => {
                out.push_str(&format!("uniform {ty} {name};\n"));
            }
            Some(("vec4", name)) if name.starts_with("texsize_") => {
                out.push_str(&format!("vec4 {name} = {USER_TEXSIZE};\n"));
            }
            _ => {
                out.push_str(trimmed);
                out.push('\n');
            }
        }
    }
    let (params, assign, args) = match kind {
        ShaderKind::Warp => ("float r, float a", "rad = r; ang = a;", "rad, ang"),
        ShaderKind::Comp => (
            "float r, float a, vec2 o, vec3 h",
            "rad = r; ang = a; uv_orig = o; hue_shader = h;",
            "rad, ang, uv_orig, hue_shader",
        ),
    };
    out.push_str(&format!("void lyraska_inputs({params}) {{\n    {assign}\n"));
    for (n, (vector, field)) in q_slots() {
        out.push_str(&format!("    q{n} = {vector}.{field};\n"));
    }
    for line in initializers {
        out.push_str("    ");
        out.push_str(&array_initializer(line).unwrap_or_else(|| (*line).to_owned()));
        out.push('\n');
    }
    out.push_str("}\n");
    // Yalnızca çevirinin kendisi denetlenir; önüne Lyraska'nın kendi (sabit) satırları gelir.
    validate(&out)?;
    out.insert_str(0, &globals_block(kind));
    out.push_str(&format!(
        "shader_body {{\nlyraska_inputs({args});\nret = {ENTRY}(uv).rgb;\n}}\n"
    ));
    if out.len() > MAX_OUTPUT_BYTES {
        return Err(ShaderError::BadOutput("çok uzun"));
    }
    Ok(out)
}

/// Çeviricinin dizi ilk değeri hatası: `float a[2] = {1, 2};` için `a[2] = float[]( … );` yazar
/// (sınır dışı öğeye atama, derlenmez). Doğrusu `a = float[2]( … );`.
fn array_initializer(line: &str) -> Option<String> {
    let (target, value) = line.split_once(" = ")?;
    let (name, size) = target.strip_suffix(']')?.split_once('[')?;
    let simple = |s: &str| !s.is_empty() && s.bytes().all(is_ident);
    if !simple(name) || size.is_empty() || !size.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let (ty, args) = value.split_once("[](")?;
    simple(ty).then(|| format!("{name} = {ty}[{size}]({args}"))
}

/// Başlık satırı bir genel bildirim mi: `[uniform ]tür ad;` → (tür, ad).
fn declaration(line: &str) -> Option<(&str, &str)> {
    let rest = line.strip_prefix("uniform ").unwrap_or(line);
    let rest = rest.strip_suffix(';')?;
    let (ty, name) = rest.split_once(' ')?;
    let simple = |s: &str| !s.is_empty() && s.bytes().all(is_ident);
    (simple(ty) && simple(name)).then_some((ty, name))
}

/// Butterchurn'e gidecek başlık yalnızca GLSL karakterleri taşır; `shader_body` adı geçmez
/// (Butterchurn metni bu adın ilk geçtiği yerden böler) ve çevirici "bilinmeyen ifade" yazmamıştır.
fn validate(header: &str) -> Result<(), ShaderError> {
    let allowed = |c: char| {
        c.is_ascii_alphanumeric()
            || c == '\n'
            || c == ' '
            || "_+-*/%=<>!&|^~?:;,.()[]{}".contains(c)
    };
    if !header.chars().all(allowed) {
        return Err(ShaderError::BadOutput("beklenmeyen karakter"));
    }
    if header.contains("shader_body") {
        return Err(ShaderError::BadOutput("shader_body adı"));
    }
    if header.contains("unknown expression") {
        return Err(ShaderError::BadOutput("bilinmeyen ifade"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    thread_local! {
        /// Son çevirinin harcadığı yakıt (yalnızca testlerde ölçülür).
        pub(super) static FUEL_USED: Cell<u64> = const { Cell::new(0) };
        /// Bu iş parçacığındaki çevirilerin en çok harcadığı.
        pub(super) static FUEL_MAX: Cell<u64> = const { Cell::new(0) };
    }

    #[test]
    fn yakit_siniri_gercek_golgelendiricilerin_cok_ustunde() {
        // Bu gölgelendiriciler gerçek presetlerin ortalamasından büyüktür; sınırın en az onda
        // birini bile kullanmamalılar (yavaş bilgisayarda da hızlı ve yanlışlıkla kesilmesin).
        for (source, kind) in [(WARP, ShaderKind::Warp), (COMP, ShaderKind::Comp)] {
            let started = std::time::Instant::now();
            translate(&prepare(source).unwrap(), FUEL).unwrap();
            let used = FUEL_USED.get();
            eprintln!("{kind:?}: {used} yakıt, {:?}", started.elapsed());
            assert!(used > 0 && used < FUEL / 10, "{kind:?}: {used}");
        }
    }

    /// Yerel ölçüm (CI'da çalışmaz; depoya preset girmez): bir preset klasöründe kaç
    /// gölgelendiricinin çevrildiği. Çevrilenler `LYRASKA_MILK_OUT` klasörüne Butterchurn JSON'u
    /// olarak yazılır (tarayıcıda derleme denemesi için).
    ///   LYRASKA_MILK_CORPUS=/yol cargo test --lib korpus -- --ignored --nocapture
    #[test]
    #[ignore = "yerel ölçüm: LYRASKA_MILK_CORPUS gerekir"]
    fn korpus_olcumu() {
        let Ok(corpus) = std::env::var("LYRASKA_MILK_CORPUS") else {
            return;
        };
        let out = std::env::var("LYRASKA_MILK_OUT").ok();
        let (mut presets, mut shaders, mut converted) = (0, 0, 0);
        let mut reasons: HashMap<String, (usize, String)> = HashMap::new();
        let started = std::time::Instant::now();
        for entry in walkdir::WalkDir::new(&corpus).into_iter().flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("milk") {
                continue;
            }
            let Ok(bytes) = std::fs::read(path) else {
                continue;
            };
            let text = crate::audio::lyrics::decode_text(&bytes);
            let Ok(parsed) = super::super::parse::parse(&text) else {
                continue;
            };
            presets += 1;
            for glsl in [&parsed.preset.warp, &parsed.preset.comp] {
                if !glsl.is_empty() {
                    shaders += 1;
                    converted += 1;
                }
            }
            if let Some(error) = &parsed.shader_error {
                for part in error.split("; ") {
                    shaders += 1;
                    let key: String = part.chars().take(70).collect();
                    let slot = reasons
                        .entry(key)
                        .or_insert((0, path.display().to_string()));
                    slot.0 += 1;
                }
            }
            if let Some(out) = &out {
                if !parsed.preset.warp.is_empty() || !parsed.preset.comp.is_empty() {
                    let name = format!("{presets:05}.json");
                    let json = serde_json::json!({
                        "path": path.display().to_string(),
                        "warp": parsed.preset.warp,
                        "comp": parsed.preset.comp,
                    });
                    std::fs::write(std::path::Path::new(out).join(name), json.to_string()).unwrap();
                }
            }
        }
        let mut reasons: Vec<_> = reasons.into_iter().collect();
        reasons.sort_by_key(|(_, (count, _))| std::cmp::Reverse(*count));
        eprintln!(
            "{presets} preset, {shaders} gölgelendirici, {converted} çevrildi, en çok {} \
             yakıt, {:?}",
            FUEL_MAX.get(),
            started.elapsed()
        );
        for (reason, (count, example)) in reasons.iter().take(25) {
            eprintln!("{count:6}  {reason}  ({example})");
        }
    }

    /// Testlerin özgün (Lyraska için yazılmış) MilkDrop 2 tarzı gölgelendiricileri.
    const WARP: &str = "sampler sampler_pw_noise_lq;
float4 texsize_noise_lq;
float3 swirl(float2 p, float t) { return float3(sin(p.x*6 + t), cos(p.y*5 - t), 0.5); }
shader_body
{
    float2 d = uv - 0.5;
    float2 w = uv + 0.004*float2(sin(time + d.y*8), cos(time*0.7 + d.x*8))*(1 + q1);
    ret = tex2D(sampler_main, w).xyz * 0.96;
    ret += 0.03*GetBlur1(uv) + 0.01*swirl(uv_orig, time);
    ret += (tex2D(sampler_noise_lq, uv*texsize.xy*texsize_noise_lq.zw).xyz - 0.5)*0.004;
    ret *= 1 - 0.1*rad;
    ret = saturate(ret);
}";

    const COMP: &str = "sampler sampler_lyraska_desen;
float4 texsize_lyraska_desen;
shader_body
{
    float3 base = GetPixel(uv) + 0.2*GetBlur2(uv);
    float l = lum(base);
    float3 tint = float3(0.6 + 0.4*sin(ang + time), 0.5 + 0.5*q2, 0.8);
    ret = lerp(base, tint*l, 0.5) * hue_shader;
    ret += tex2D(sampler_lyraska_desen, uv*texsize_lyraska_desen.zw*64).xyz*0.05;
    ret += (rand_frame.x - 0.5)*0.002 + rand_preset.y*0.001;
    ret *= (uv_orig.y > 0.5) ? 1.0 : 0.98;
}";

    #[test]
    fn bukme_golgelendiricisi_butterchurn_bicimine_cevrilir() {
        let out = convert_uncached(WARP, ShaderKind::Warp).unwrap();
        let (header, body) = out.split_once("shader_body").unwrap();
        assert_eq!(
            body.trim(),
            "{\nlyraska_inputs(rad, ang);\nret = lyraska_main(uv).rgb;\n}"
        );
        // Butterchurn'ün tanımladıkları başlıkta yeniden bildirilmez; `q1` bir kez (Lyraska'nın).
        for provided in [
            "float time;",
            "vec4 texsize;",
            "uniform sampler2D sampler_main;",
        ] {
            assert!(header.lines().all(|line| line != provided), "{provided}");
        }
        assert_eq!(header.lines().filter(|l| *l == "float q1;").count(), 1);
        assert!(!header.contains("sampler_pw_noise_lq;"), "{header}");
        assert!(header.contains("float rad;\nfloat ang;\n"));
        assert!(header.contains("vec4 lyraska_main(vec2 uv)"));
        assert!(header.contains("vec3 swirl(vec2 p, float t)"));
        assert!(
            header.contains("texture(sampler_blur1"),
            "GetBlur1 açıldı: {header}"
        );
        assert!(header.contains("scale1") && header.contains("bias1"));
        assert!(header.contains("clamp("), "saturate → clamp");
        // Önişlemci satırı yalnızca Lyraska'nın q makrolarını kaldırması; q'ya yazılabilir.
        let directives: Vec<_> = header.lines().filter(|l| l.contains('#')).collect();
        assert_eq!(directives.len(), 32);
        assert!(directives.iter().all(|l| l.starts_with("#undef q")));
        assert!(header.contains("float q32;\n") && header.contains("    q32 = _qh.w;\n"));
    }

    #[test]
    fn birlestirme_golgelendiricisi_kullanici_dokusunu_ve_girdileri_tasir() {
        let out = convert_uncached(COMP, ShaderKind::Comp).unwrap();
        assert!(
            out.contains("uniform sampler2D sampler_lyraska_desen;\n"),
            "{out}"
        );
        assert!(out.contains(&format!("vec4 texsize_lyraska_desen = {USER_TEXSIZE};")));
        assert!(out.contains("vec2 uv_orig;\nvec3 hue_shader;"));
        assert!(out.contains("lyraska_inputs(rad, ang, uv_orig, hue_shader);"));
        assert!(out.contains("mix("), "lerp → mix");
        assert!(out.contains("texture(sampler_blur2"));
        assert!(!out.contains("lum("), "lum makrosu açıldı");
        assert!(out.contains("rand_frame") && out.contains("rand_preset"));
    }

    #[test]
    fn genel_degiskenlerin_ilk_degerleri_girdilerle_kurulur() {
        let source = "static const float k = 2.0;\nfloat3 renk = float3(0.1, 0.2, 0.3);\n\
                      float dizi[2] = {0.5, 0.25};\n\
                      shader_body { ret = renk * k * dizi[1]; }";
        let out = convert_uncached(source, ShaderKind::Warp).unwrap();
        let inputs = out.split("void lyraska_inputs").nth(1).unwrap();
        assert!(inputs.contains("k = float( float(2) );"), "{out}");
        assert!(inputs.contains("renk = vec3("), "{out}");
        assert!(
            inputs.contains("dizi = float[2]( float(0.5), float(0.25) );"),
            "{out}"
        );
        assert_eq!(array_initializer("k = float( float(2) );"), None);
        assert_eq!(array_initializer("a[i] = float[]( x );"), None);
        assert!(out.contains("\nfloat k;\n") && out.contains("\nvec3 renk;\n"));
    }

    #[test]
    fn sampler_state_bloklari_ve_hazir_ornekleyiciler_temizlenir() {
        let head = "uniform sampler2D sampler_main;\nsampler sampler_bulut = sampler_state { \
                    AddressU = Wrap; Filter = Linear; };\nsampler3D sampler_hacim;\n\
                    float f(sampler2D s, float2 p) { return tex2D(s, p).x; }\n";
        let fixed = fix_sampler_declarations(&strip_sampler_states(head), &HashMap::new());
        assert_eq!(
            fixed,
            "\nsampler2D sampler_bulut;\nsampler3D sampler_hacim;\n\
             float f(sampler2D s, float2 p) { return tex2D(s, p).x; }\n"
        );
        assert_eq!(
            strip_sampler_states("a = sampler_state"),
            "a = sampler_state"
        );
    }

    #[test]
    fn islev_makrosu_ayni_adli_degiskeni_bozmaz() {
        assert_eq!(
            rename_macro_calls("float lum = lum (c) + GetBlur1(uv).x; mylum(uv); lum2(x);"),
            "float lum = lyraska_lum (c) + GetBlur1(uv).x; mylum(uv); lum2(x);"
        );
        // Takma adlı örnekleyici ve takma adlı makro.
        let source = "#define sampler_resim sampler_bulut // yorum\nsampler2D sampler_resim;\n\
                      #define MyGet GetPixel\n\
                      shader_body { ret = MyGet(uv) + tex2D(sampler_resim, uv).xyz; }";
        let out = convert_uncached(source, ShaderKind::Warp).unwrap();
        assert!(out.contains("uniform sampler2D sampler_bulut;"), "{out}");
        assert!(!out.contains("sampler_resim"), "{out}");
        let source = "shader_body { float3 c = GetPixel(uv); float lum = lum(c); ret = lum; }";
        let out = convert_uncached(source, ShaderKind::Comp).unwrap();
        assert!(out.contains("float lum = float( dot("), "{out}");
    }

    #[test]
    fn govde_butterchurn_gibi_bolunur() {
        assert_eq!(
            split_body("float f;\nshader_body { a { b } }\n"),
            Ok(("float f;\n", " a { b } "))
        );
        assert_eq!(split_body("ret = 1;"), Err(ShaderError::NoBody));
        assert_eq!(split_body("shader_body"), Err(ShaderError::NoBody));
        assert_eq!(split_body("shader_body } {"), Err(ShaderError::NoBody));
    }

    #[test]
    fn bozuk_hlsl_hata_iletisiyle_reddedilir() {
        for bad in [
            "shader_body { ret = tanimsiz(uv); }",
            "shader_body { ret = ; }",
            "shader_body { float3 x = ; }",
            "shader_body { } } } float4",
            "shader_body { \u{0}\u{1}ş🎉 }",
        ] {
            match convert_uncached(bad, ShaderKind::Comp) {
                Err(ShaderError::Rejected(message)) => {
                    assert!(!message.is_empty() && message.chars().count() <= MAX_MESSAGE_CHARS);
                    assert!(!message.chars().any(char::is_control));
                }
                other => panic!("{bad:?}: {other:?}"),
            }
        }
    }

    #[test]
    fn sonsuz_makro_yakit_bitince_durur() {
        // projectM'in önişlemcisi kendini çağıran bu makroda sonsuza dek döner: yakıt keser.
        let started = std::time::Instant::now();
        let error = convert_uncached(
            "#define A A + B\nshader_body { ret = A; }",
            ShaderKind::Warp,
        );
        assert_eq!(error, Err(ShaderError::OutOfFuel));
        assert!(started.elapsed().as_secs() < 30, "{:?}", started.elapsed());
        // Az yakıtla gerçek bir gölgelendirici de yarıda kesilir (panik yok, tuzak yok).
        let hlsl = prepare(WARP).unwrap();
        assert_eq!(translate(&hlsl, 10_000), Err(ShaderError::OutOfFuel));
    }

    #[test]
    fn buyuk_girdi_reddedilir() {
        let big = format!(
            "shader_body {{ {} }}",
            "ret = 1;".repeat(MAX_SOURCE_BYTES / 4)
        );
        assert_eq!(convert(&big, ShaderKind::Warp), Err(ShaderError::TooLarge));
    }

    #[test]
    fn bellek_siniri_tuzakla_durur() {
        // Çok derin iç içe ifade: çeviricinin yığını ya da belleği taşar; program değil yalnızca
        // çeviri durur.
        let deep = format!(
            "shader_body {{ ret = {}1{}; }}",
            "(".repeat(20_000),
            ")".repeat(20_000)
        );
        let error = convert_uncached(&deep, ShaderKind::Warp).unwrap_err();
        assert!(
            matches!(
                error,
                ShaderError::Trapped(_) | ShaderError::OutOfFuel | ShaderError::Rejected(_)
            ),
            "{error:?}"
        );
    }

    #[test]
    fn sonuclar_bellekte_saklanir() {
        let first = convert(COMP, ShaderKind::Comp).unwrap();
        let started = std::time::Instant::now();
        let again = convert(COMP, ShaderKind::Comp).unwrap();
        assert_eq!(first, again);
        assert!(started.elapsed().as_millis() < 5);
    }

    #[test]
    fn cikti_denetimi_yabanci_karakteri_ve_bicimi_reddeder() {
        assert!(validate("vec4 a;\n").is_ok());
        for bad in [
            "a = \"x\";",
            "#define x",
            "a`",
            "a\\\n",
            "x = $y;",
            "shader_body",
            "f( <unknown expression> )",
        ] {
            assert!(validate(bad).is_err(), "{bad}");
        }
        assert_eq!(
            finish("#version 300 es\nvoid f() {}\n", ShaderKind::Warp),
            Err(ShaderError::BadOutput("main() yok"))
        );
        assert_eq!(
            finish("x\nvoid main() {\n}\n", ShaderKind::Warp),
            Err(ShaderError::BadOutput("main() biçimi"))
        );
    }

    #[test]
    fn bildirim_satiri_taninir() {
        assert_eq!(declaration("float q1;"), Some(("float", "q1")));
        assert_eq!(
            declaration("uniform sampler2D sampler_x;"),
            Some(("sampler2D", "sampler_x"))
        );
        assert_eq!(declaration("float arr[2];"), None);
        assert_eq!(declaration("vec4 f(vec2 uv) {"), None);
        assert!(is_dropped("q32") && is_dropped("q1") && is_dropped("decay"));
        assert!(!is_dropped("q33") && !is_dropped("q1x") && !is_dropped("q01x"));
    }
}
