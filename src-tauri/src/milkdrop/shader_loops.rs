//! Çevrilen gölgelendiricideki (GLSL) döngülerin denetimi: ekran kartına yalnızca her pikselde
//! sınırlı sayıda tur atan gölgelendirici gider.
//!
//! Gölgelendirici her pikselde çalışır (1080p'de iki milyon kez, her karede). Piksel başına 10⁸
//! turluk bir döngü ya da `while (true)` ekran kartını saniyelerce meşgul eder; Windows bunu donma
//! sayıp sürücüyü sıfırlar (TDR): ekran bir an kararır, bütün WebGL bağlamları kaybolur.
//!
//! **Neden çeviriden sonra**: çevirinin çıktısında önişlemci açılmıştır (`#define N 100000000`
//! sınırı sayıya dönüşür, makroyla gizlenmiş `for` görünür), yorumlar atılmıştır ve yazım tek
//! biçimlidir (`for (int i = int( 0 ); (i < 16); (i++)) {`). HLSL metninde aynı denetim makroları,
//! yorumları ve yazım çeşitlerini ayrıca çözmek zorunda kalırdı. Ekran kartına giden metin tam olarak
//! denetlenen metindir.
//!
//! Kural (MilkDrop 2'nin derlendiği DirectX 9 `ps_3_0` profilinde döngü sayacı en çok 255'tir; gerçek
//! presetlerdeki döngüler bulanıklaştırma çekirdeği gibi küçük, sabit sınırlı döngülerdir):
//!
//! - Yalnızca `for`; `while` ve `do` yok.
//! - Başlık `for (int|float i = SABİT; i OP SABİT; ADIM)`: OP `<`, `<=`, `>`, `>=`; ADIM `i++`, `++i`,
//!   `i--`, `--i`, `i += SABİT`, `i -= SABİT`. SABİT bir sayı (`int(…)`, `float(…)`, eksi işareti ve
//!   parantezle) ya da ilk değeri sayı olan ve hiçbir yerde değiştirilmeyen genel değişkendir
//!   (`static const int N = 8;` çeviride böyle olur). Tur sayısı döngü benzetilerek bulunur:
//!   tamsayıda kesin, kayan noktada ekran kartının 32 bit aritmetiğiyle (`f32`; adım değeri
//!   değiştirmiyorsa sonsuz sayılır) ve 64 bitle; en çok [`MAX_TRIPS`].
//! - Döngü değişkeni gövdede değiştirilmez (atama, `++`/`--`, `out`/`inout` parametreli işleve
//!   verilmez).
//! - İç içe en çok [`MAX_DEPTH`] döngü (çağrılan işlevlerin döngüleri dahil), gölgelendiricide en çok
//!   [`MAX_LOOPS`] döngü ve piksel başına en çok [`MAX_WORK`] döngü turu (iç içe olanlar çarpılarak,
//!   çağrılan işlevlerinkiler dahil): 1080p'de kare başına en çok ~2 milyar tur; zayıf bir ekran
//!   kartında bile saniyenin altında (TDR sınırı 2 sn). Döngüsüz ama üstel büyüyen çağrı ağaçları
//!   için piksel başına en çok [`MAX_CALLS`] işlev çağrısı (aynı adlı tanımlardan en pahalısı
//!   sayılır: fazla tahmin, güvenli taraf).
//!
//! Kuralı geçmeyen gölgelendirici atılır (görsel "sade hâliyle" çalar).

use std::collections::{HashMap, HashSet};

/// Bir döngünün en çok tur sayısı.
pub const MAX_TRIPS: u32 = 256;
/// İç içe en çok döngü (çağrılan işlevlerdekiler dahil).
pub const MAX_DEPTH: u32 = 2;
/// Bir gölgelendiricideki en çok döngü.
pub const MAX_LOOPS: usize = 8;
/// Piksel başına en çok döngü turu (iç içe olanlar çarpılır, çağrılan işlevlerdekiler dahil).
pub const MAX_WORK: u64 = 1024;
/// Piksel başına en çok işlev çağrısı (döngüde olanlar tur sayısıyla çarpılır).
pub const MAX_CALLS: u64 = 16_384;

/// Kuralı geçmeyen döngünün nedeni (Türkçe; hata iletisine girer).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoopError {
    /// `while` ya da `do`.
    While,
    /// Başlık izin verilen biçimde değil ya da sınır sabit değil.
    Unbounded,
    /// [`MAX_TRIPS`]'ten fazla tur (ya da hiç bitmiyor).
    TooLong,
    /// Döngü değişkeni gövdede değişiyor.
    Modified,
    /// [`MAX_DEPTH`]'ten derin.
    Nested,
    /// [`MAX_LOOPS`]'tan fazla döngü.
    TooMany,
    /// Piksel başına [`MAX_WORK`]'ten fazla tur, [`MAX_CALLS`]'tan fazla çağrı ya da kendini
    /// çağıran işlev.
    TooMuchWork,
}

impl LoopError {
    pub fn reason(self) -> &'static str {
        match self {
            LoopError::While => "while/do döngüsü",
            LoopError::Unbounded => "sınırı sabit olmayan döngü",
            LoopError::TooLong => "256 turdan uzun döngü",
            LoopError::Modified => "gövdede değişen döngü sayacı",
            LoopError::Nested => "ikiden derin iç içe döngü",
            LoopError::TooMany => "sekizden fazla döngü",
            LoopError::TooMuchWork => "piksel başına çok fazla döngü turu",
        }
    }
}

/// Çevrilen gölgelendiriciyi (başlık ve işlevler) denetler. `inputs`: genel değişkenlerin ilk
/// değerlerini kuran işlevin adı (orada yapılan atamalar "değiştirme" sayılmaz).
pub fn check(glsl: &str, inputs: &str) -> Result<(), LoopError> {
    let tokens = tokenize(glsl);
    for (i, token) in tokens.iter().enumerate() {
        if matches!(*token, "while" | "do") && !is_member(&tokens, i) {
            return Err(LoopError::While);
        }
    }
    let loops = tokens
        .iter()
        .enumerate()
        .filter(|(i, t)| **t == "for" && !is_member(&tokens, *i))
        .count();
    if loops > MAX_LOOPS {
        return Err(LoopError::TooMany);
    }
    let functions = functions(&tokens);
    let out_params: HashSet<&str> = functions
        .iter()
        .filter(|f| f.has_out_params)
        .map(|f| f.name)
        .collect();
    let program = Program {
        tokens: &tokens,
        constants: constants(&tokens, &functions, inputs),
        functions,
        out_params,
    };
    let mut analysis = Analysis::default();
    for index in 0..program.functions.len() {
        let cost = program.function_cost(index, &mut analysis)?;
        if cost.depth > MAX_DEPTH {
            return Err(LoopError::Nested);
        }
        if cost.work > MAX_WORK || cost.calls > MAX_CALLS {
            return Err(LoopError::TooMuchWork);
        }
    }
    Ok(())
}

/// GLSL metnini sözcüklere böler: adlar, sayılar, iki/üç karakterli işleçler, tek karakterler.
fn tokenize(text: &str) -> Vec<&str> {
    const OPERATORS: [&str; 19] = [
        "<<=", ">>=", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<=", ">=", "==",
        "!=", "&&", "||", "^^",
    ];
    let bytes = text.as_bytes();
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        let start = i;
        if b.is_ascii_alphabetic() || b == b'_' {
            while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                i += 1;
            }
        } else if b.is_ascii_digit()
            || (b == b'.' && bytes.get(i + 1).is_some_and(u8::is_ascii_digit))
        {
            while i < bytes.len() {
                let c = bytes[i];
                let exponent_sign = (c == b'+' || c == b'-')
                    && i > start
                    && matches!(bytes[i - 1], b'e' | b'E')
                    && !text[start..i].starts_with("0x");
                if c.is_ascii_alphanumeric() || c == b'.' || exponent_sign {
                    i += 1;
                } else {
                    break;
                }
            }
        } else if let Some(op) = OPERATORS.iter().find(|op| text[i..].starts_with(**op)) {
            i += op.len();
        } else {
            // Yalnızca ASCII gelir (`validate` denetler); yine de karakter sınırında bölünür.
            i += text[i..].chars().next().map_or(1, char::len_utf8);
        }
        tokens.push(&text[start..i]);
    }
    tokens
}

/// `i`'deki sözcük bir üyenin adı mı (`a.do` gibi; anahtar sözcük değil).
fn is_member(tokens: &[&str], i: usize) -> bool {
    i > 0 && tokens[i - 1] == "."
}

fn is_name(token: &str) -> bool {
    token
        .bytes()
        .next()
        .is_some_and(|b| b.is_ascii_alphabetic() || b == b'_')
}

/// `open`'daki açılan parantezin (`(`, `{`, `[`) kapandığı yer.
fn matching(tokens: &[&str], open: usize) -> Option<usize> {
    let (up, down) = match tokens.get(open).copied()? {
        "(" => ("(", ")"),
        "{" => ("{", "}"),
        "[" => ("[", "]"),
        _ => return None,
    };
    let mut depth = 0usize;
    for (i, token) in tokens.iter().enumerate().skip(open) {
        if *token == up {
            depth += 1;
        } else if *token == down {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
    }
    None
}

/// Genel düzeydeki bir işlev tanımı.
struct Function<'a> {
    name: &'a str,
    /// Gövdenin `{` ve `}` sözcükleri.
    open: usize,
    close: usize,
    has_out_params: bool,
}

/// Genel düzeydeki işlev tanımları: `TÜR AD ( … ) {`.
fn functions<'a>(tokens: &[&'a str]) -> Vec<Function<'a>> {
    let mut found = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        match tokens[i] {
            "{" => {
                // Genel düzeyde işlev olmayan blok (ör. yapı tanımı): atlanır.
                i = matching(tokens, i).map_or(tokens.len(), |end| end + 1);
            }
            "(" if i >= 2 && is_name(tokens[i - 1]) && is_name(tokens[i - 2]) => {
                let Some(params_end) = matching(tokens, i) else {
                    break;
                };
                if tokens.get(params_end + 1) == Some(&"{") {
                    let Some(close) = matching(tokens, params_end + 1) else {
                        break;
                    };
                    found.push(Function {
                        name: tokens[i - 1],
                        open: params_end + 1,
                        close,
                        has_out_params: tokens[i..params_end]
                            .iter()
                            .any(|t| matches!(*t, "out" | "inout")),
                    });
                    i = close + 1;
                } else {
                    i = params_end + 1;
                }
            }
            _ => i += 1,
        }
    }
    found
}

/// İlk değeri sayı olan ve `inputs` işlevinin dışında hiçbir yerde değiştirilmeyen, hiçbir yerde
/// yeniden bildirilmeyen genel değişkenler (çeviride `static const` böyle olur).
fn constants<'a>(
    tokens: &[&'a str],
    functions: &[Function<'a>],
    inputs: &str,
) -> HashMap<&'a str, f64> {
    let mut values = HashMap::new();
    let Some(init) = functions.iter().find(|f| f.name == inputs) else {
        return values;
    };
    // `ad = DEĞER ;` satırları.
    let body = &tokens[init.open + 1..init.close];
    for statement in body.split(|t| *t == ";") {
        if let [name, "=", value @ ..] = statement {
            if let Some(v) = constant(value, &HashMap::new()) {
                values.insert(*name, v);
            }
        }
    }
    let outs: HashSet<&str> = functions
        .iter()
        .filter(|f| f.has_out_params)
        .map(|f| f.name)
        .collect();
    values.retain(|name, _| {
        let mut declarations = 0;
        for (i, token) in tokens.iter().enumerate() {
            if token != name || is_member(tokens, i) {
                continue;
            }
            if i > 0 && is_name(tokens[i - 1]) && !is_keyword_before_value(tokens[i - 1]) {
                declarations += 1;
            }
            let in_inputs = i > init.open && i < init.close;
            if !in_inputs && is_written(tokens, i, &outs) {
                return false;
            }
        }
        // Bildirim yalnızca bir kez (genel değişken); işlevde aynı adla yerel değişken ya da
        // parametre yok.
        declarations == 1
    });
    values
}

/// Bir adın önünde durup onu bildirim yapmayan sözcükler (`return n`, `else n`).
fn is_keyword_before_value(token: &str) -> bool {
    matches!(token, "return" | "else" | "case")
}

/// `i`'deki ad orada değiştiriliyor mu: atamanın sol yanı, `++`/`--`, ya da `out`/`inout`
/// parametreli bir işleve doğrudan verilmiş.
fn is_written(tokens: &[&str], i: usize, out_functions: &HashSet<&str>) -> bool {
    const ASSIGN: [&str; 13] = [
        "=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "|=", "^=", "++", "--",
    ];
    // Ardından gelen üye/dizi erişimi atlanır (`v.x = …`, `a[i] = …`).
    let mut next = i + 1;
    loop {
        match tokens.get(next).copied() {
            Some(".") => next += 2,
            Some("[") => match matching(tokens, next) {
                Some(end) => next = end + 1,
                None => return true,
            },
            _ => break,
        }
    }
    if tokens.get(next).is_some_and(|t| ASSIGN.contains(t)) {
        return true;
    }
    if i > 0 && matches!(tokens[i - 1], "++" | "--") {
        return true;
    }
    // İşlev argümanı: `f(…, ad, …)` ve f'nin out/inout parametresi var.
    if i > 0 && matches!(tokens[i - 1], "(" | ",") && matches!(tokens.get(next), Some(&")" | &","))
    {
        if let Some(callee) = enclosing_call(tokens, i) {
            return out_functions.contains(callee);
        }
    }
    false
}

/// `i` bir işlev çağrısının argümanıysa işlevin adı.
fn enclosing_call<'a>(tokens: &[&'a str], i: usize) -> Option<&'a str> {
    let mut depth = 0usize;
    for j in (0..i).rev() {
        match tokens[j] {
            ")" | "]" => depth += 1,
            "(" | "[" if depth > 0 => depth -= 1,
            "(" => return j.checked_sub(1).map(|k| tokens[k]).filter(|t| is_name(t)),
            "[" | "{" | "}" | ";" => return None,
            _ => {}
        }
    }
    None
}

/// Sabit ifade: sayı, `int(…)`/`float(…)`, eksi işareti, parantez ya da bilinen sabit.
fn constant(tokens: &[&str], constants: &HashMap<&str, f64>) -> Option<f64> {
    match tokens {
        [] => None,
        [single] => {
            if let Some(v) = constants.get(single) {
                return Some(*v);
            }
            let text = single.trim_end_matches(['u', 'U', 'f', 'F']);
            let v: f64 = text.parse().ok()?;
            v.is_finite().then_some(v)
        }
        ["-", rest @ ..] => constant(rest, constants).map(|v| -v),
        ["(", .., ")"] if matching(tokens, 0) == Some(tokens.len() - 1) => {
            constant(&tokens[1..tokens.len() - 1], constants)
        }
        [cast @ ("int" | "float" | "uint"), "(", .., ")"]
            if matching(tokens, 1) == Some(tokens.len() - 1) =>
        {
            let v = constant(&tokens[2..tokens.len() - 1], constants)?;
            Some(if *cast == "float" { v } else { v.trunc() })
        }
        _ => None,
    }
}

/// Değişken ifadesi: ad, parantezli ad ya da tür dönüşümündeki ad (`float (i)`).
fn variable<'a>(tokens: &[&'a str]) -> Option<&'a str> {
    match tokens {
        [name] if is_name(name) => Some(name),
        ["(", .., ")"] if matching(tokens, 0) == Some(tokens.len() - 1) => {
            variable(&tokens[1..tokens.len() - 1])
        }
        ["int" | "float" | "uint", "(", .., ")"]
            if matching(tokens, 1) == Some(tokens.len() - 1) =>
        {
            variable(&tokens[2..tokens.len() - 1])
        }
        _ => None,
    }
}

/// Dıştaki gereksiz parantezler atılır.
fn strip_parens<'a, 'b>(mut tokens: &'b [&'a str]) -> &'b [&'a str] {
    while tokens.first() == Some(&"(") && matching(tokens, 0) == Some(tokens.len() - 1) {
        tokens = &tokens[1..tokens.len() - 1];
    }
    tokens
}

#[derive(Clone, Copy)]
enum Comparison {
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
}

impl Comparison {
    fn holds(self, a: f64, b: f64) -> bool {
        match self {
            Comparison::Less => a < b,
            Comparison::LessEqual => a <= b,
            Comparison::Greater => a > b,
            Comparison::GreaterEqual => a >= b,
        }
    }

    /// `b OP a` ↔ `a OP' b`.
    fn flipped(self) -> Self {
        match self {
            Comparison::Less => Comparison::Greater,
            Comparison::LessEqual => Comparison::GreaterEqual,
            Comparison::Greater => Comparison::Less,
            Comparison::GreaterEqual => Comparison::LessEqual,
        }
    }
}

/// Bir döngünün başlığından çıkan bilgiler.
struct Header<'a> {
    variable: &'a str,
    float: bool,
    start: f64,
    comparison: Comparison,
    bound: f64,
    step: f64,
}

impl Header<'_> {
    /// Tur sayısı (benzetimle); [`MAX_TRIPS`]'i aşarsa ya da bitmezse `None`.
    fn trips(&self) -> Option<u32> {
        if self.float {
            // Ekran kartının 32 bit kayan noktası: adım değeri değiştirmiyorsa döngü bitmez.
            let wide = simulate(self.start, self.step, |v| {
                self.comparison.holds(v, self.bound)
            })?;
            let start = self.start as f32;
            let step = self.step as f32;
            let bound = self.bound as f32;
            let mut v = start;
            let mut trips = 0u32;
            while self.comparison.holds(f64::from(v), f64::from(bound)) {
                trips += 1;
                let next = v + step;
                if trips > MAX_TRIPS || next == v || !next.is_finite() {
                    return None;
                }
                v = next;
            }
            Some(wide.max(trips))
        } else {
            if self.start.fract() != 0.0 || self.step.fract() != 0.0 {
                return None;
            }
            simulate(self.start, self.step, |v| {
                self.comparison.holds(v, self.bound)
            })
        }
    }
}

/// Tamsayı (ya da 64 bit) benzetim: `v = start; while cond(v) { v += step }`.
fn simulate(start: f64, step: f64, cond: impl Fn(f64) -> bool) -> Option<u32> {
    let limit = f64::from(i32::MAX);
    let mut v = start;
    let mut trips = 0u32;
    while cond(v) {
        trips += 1;
        v += step;
        if trips > MAX_TRIPS || v.abs() > limit || step == 0.0 {
            return None;
        }
    }
    Some(trips)
}

/// `for ( … )` başlığını okur (parantezlerin içi).
fn header<'a>(inside: &[&'a str], constants: &HashMap<&str, f64>) -> Result<Header<'a>, LoopError> {
    let parts: Vec<&[&str]> = split_top(inside, ";");
    let [init, cond, step] = parts.as_slice() else {
        return Err(LoopError::Unbounded);
    };
    let (float, name, start) = match strip_parens(init) {
        [ty @ ("int" | "float"), name, "=", value @ ..] if is_name(name) => {
            (*ty == "float", *name, constant(value, constants))
        }
        _ => return Err(LoopError::Unbounded),
    };
    let start = start.ok_or(LoopError::Unbounded)?;
    let cond = strip_parens(cond);
    let at = cond
        .iter()
        .enumerate()
        .filter(|(_, t)| matches!(**t, "<" | "<=" | ">" | ">="))
        .map(|(i, _)| i)
        .collect::<Vec<_>>();
    let [at] = at.as_slice() else {
        return Err(LoopError::Unbounded);
    };
    let comparison = match cond[*at] {
        "<" => Comparison::Less,
        "<=" => Comparison::LessEqual,
        ">" => Comparison::Greater,
        _ => Comparison::GreaterEqual,
    };
    let (left, right) = (&cond[..*at], &cond[*at + 1..]);
    let (comparison, bound) = if variable(left) == Some(name) {
        (comparison, constant(right, constants))
    } else if variable(right) == Some(name) {
        (comparison.flipped(), constant(left, constants))
    } else {
        return Err(LoopError::Unbounded);
    };
    let bound = bound.ok_or(LoopError::Unbounded)?;
    let step = match strip_parens(step) {
        [v, "++"] | ["++", v] if *v == name => 1.0,
        [v, "--"] | ["--", v] if *v == name => -1.0,
        [v, "+=", value @ ..] if *v == name => {
            constant(value, constants).ok_or(LoopError::Unbounded)?
        }
        [v, "-=", value @ ..] if *v == name => {
            -constant(value, constants).ok_or(LoopError::Unbounded)?
        }
        _ => return Err(LoopError::Unbounded),
    };
    Ok(Header {
        variable: name,
        float,
        start,
        comparison,
        bound,
        step,
    })
}

/// Parantez derinliği 0'daki ayırıcıyla böler.
fn split_top<'a, 'b>(tokens: &'b [&'a str], separator: &str) -> Vec<&'b [&'a str]> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut from = 0;
    for (i, token) in tokens.iter().enumerate() {
        match *token {
            "(" | "[" | "{" => depth += 1,
            ")" | "]" | "}" => depth -= 1,
            t if t == separator && depth == 0 => {
                parts.push(&tokens[from..i]);
                from = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&tokens[from..]);
    parts
}

/// Bir bölgenin (işlev ya da döngü gövdesi) maliyeti.
#[derive(Debug, Clone, Copy, Default)]
struct Cost {
    /// En derin iç içe döngü.
    depth: u32,
    /// Döngü turları (iç içe olanlar çarpılır), doyumlu.
    work: u64,
    /// İşlev çağrıları (döngüdekiler tur sayısıyla çarpılır), doyumlu.
    calls: u64,
}

#[derive(Default)]
struct Analysis {
    /// İşlev tanımlarının (sırasıyla) maliyeti.
    done: HashMap<usize, Cost>,
    visiting: HashSet<usize>,
}

struct Program<'a, 't> {
    tokens: &'t [&'a str],
    functions: Vec<Function<'a>>,
    out_params: HashSet<&'a str>,
    constants: HashMap<&'a str, f64>,
}

impl Program<'_, '_> {
    /// `at`'taki `ad(` çağrısının gidebileceği tanımlar. GLSL'de işlev kullanılmadan önce
    /// bildirilir: önce tamamlanmış tanımlar (aynı adlı başka türden tanımlar da; ör. `vec2 mult0`
    /// `float mult0`'ı çağırır); yoksa (yalnızca ön bildirim varsa) çağrıyı içermeyen bütün tanımlar.
    fn callees(&self, name: &str, at: usize) -> Vec<usize> {
        let named = || {
            self.functions
                .iter()
                .enumerate()
                .filter(move |(_, f)| f.name == name)
        };
        let before: Vec<usize> = named()
            .filter(|(_, f)| f.close < at)
            .map(|(i, _)| i)
            .collect();
        if !before.is_empty() {
            return before;
        }
        named()
            .filter(|(_, f)| !(f.open < at && at < f.close))
            .map(|(i, _)| i)
            .collect()
    }

    /// Bir işlev tanımının maliyeti.
    fn function_cost(&self, index: usize, analysis: &mut Analysis) -> Result<Cost, LoopError> {
        if let Some(cost) = analysis.done.get(&index) {
            return Ok(*cost);
        }
        let Some(function) = self.functions.get(index) else {
            return Ok(Cost::default());
        };
        if !analysis.visiting.insert(index) {
            // Kendini (dolaylı) çağıran işlev: GLSL'de yasak, burada da.
            return Err(LoopError::TooMuchWork);
        }
        let cost = self.region_cost(function.open + 1, function.close, analysis)?;
        analysis.visiting.remove(&index);
        analysis.done.insert(index, cost);
        Ok(cost)
    }

    /// `[from, to)` sözcüklerinin maliyeti: içindeki döngüler ve çağrılar.
    fn region_cost(
        &self,
        from: usize,
        to: usize,
        analysis: &mut Analysis,
    ) -> Result<Cost, LoopError> {
        let tokens = self.tokens;
        let mut total = Cost::default();
        let mut i = from;
        while i < to {
            let token = tokens[i];
            if token == "for" && !is_member(tokens, i) {
                let open = i + 1;
                let close = matching(tokens, open)
                    .filter(|c| *c < to && tokens[open] == "(")
                    .ok_or(LoopError::Unbounded)?;
                // Çevirici gövdeyi hep süslü parantezle yazar; başkası reddedilir.
                let body_open = close + 1;
                let body_close = matching(tokens, body_open)
                    .filter(|c| *c < to && tokens[body_open] == "{")
                    .ok_or(LoopError::Unbounded)?;
                let header = header(&tokens[open + 1..close], &self.constants)?;
                let trips = header.trips().ok_or(LoopError::TooLong)?;
                for j in body_open + 1..body_close {
                    if tokens[j] == header.variable
                        && !is_member(tokens, j)
                        && is_written(tokens, j, &self.out_params)
                    {
                        return Err(LoopError::Modified);
                    }
                }
                let body = self.region_cost(body_open + 1, body_close, analysis)?;
                total.depth = total.depth.max(body.depth + 1);
                let trips = u64::from(trips);
                total.work = total
                    .work
                    .saturating_add(trips.saturating_mul(body.work.saturating_add(1)));
                total.calls = total.calls.saturating_add(trips.saturating_mul(body.calls));
                i = body_close + 1;
            } else if tokens.get(i + 1) == Some(&"(") && is_name(token) && !is_member(tokens, i) {
                let callees = self.callees(token, i);
                if !callees.is_empty() {
                    // Aynı adlı tanımlardan en pahalısı.
                    let mut callee = Cost::default();
                    for index in callees {
                        let cost = self.function_cost(index, analysis)?;
                        callee.depth = callee.depth.max(cost.depth);
                        callee.work = callee.work.max(cost.work);
                        callee.calls = callee.calls.max(cost.calls);
                    }
                    total.depth = total.depth.max(callee.depth);
                    total.work = total.work.saturating_add(callee.work);
                    total.calls = total.calls.saturating_add(callee.calls.saturating_add(1));
                }
                i += 1;
            } else {
                i += 1;
            }
            if total.depth > MAX_DEPTH {
                return Err(LoopError::Nested);
            }
            if total.work > MAX_WORK || total.calls > MAX_CALLS {
                return Err(LoopError::TooMuchWork);
            }
        }
        Ok(total)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn body(code: &str) -> String {
        format!("vec4 lyraska_main(vec2 uv) {{\n{code}\nreturn vec4(0);\n}}\n")
    }

    #[test]
    fn sozcukler_glsl_gibi_bolunur() {
        assert_eq!(
            tokenize("for (int i = int( 0 ); (i <= 1.5e-3); (i += 2)) {a.x++;}"),
            [
                "for", "(", "int", "i", "=", "int", "(", "0", ")", ";", "(", "i", "<=", "1.5e-3",
                ")", ";", "(", "i", "+=", "2", ")", ")", "{", "a", ".", "x", "++", ";", "}"
            ]
        );
    }

    #[test]
    fn tur_sayisi_benzetimle_bulunur() {
        let trips = |code: &str| {
            let text = tokenize(code);
            header(&text, &HashMap::new()).ok().and_then(|h| h.trips())
        };
        assert_eq!(trips("int i = int( 0 ); (i < 16); (i++)"), Some(16));
        assert_eq!(trips("int i = int( -2 ); (i <= 2); (++i)"), Some(5));
        assert_eq!(trips("int i = int( 10 ); (0 < i); (i -= 2)"), Some(5));
        assert_eq!(
            trips("float t = float( float(0) ); (t < float(1)); (t += float(0.125))"),
            Some(8)
        );
        assert_eq!(trips("int i = 0; i < 256; i++"), Some(256));
        assert_eq!(trips("int i = 0; i < 257; i++"), None);
        assert_eq!(trips("int i = 0; i < 8; i--"), None);
        assert_eq!(trips("int i = 0; i < 8; i += 0"), None);
        assert_eq!(trips("int i = 0; i < 8; i += 0.5"), None);
        // 32 bitte 16777216 + 1 = 16777216: ekran kartında bitmez.
        assert_eq!(trips("float t = 16777216; t < 16777300; t += 1"), None);
        assert_eq!(trips("int i = 0; i != 8; i++"), None);
        assert_eq!(trips("int i = 0; j < 8; i++"), None);
        assert_eq!(trips("int i = 0; i < 8; i *= 2"), None);
        assert_eq!(trips("i = 0; i < 8; i++"), None);
    }

    #[test]
    fn genel_sabit_sinir_olabilir_degisken_olamaz() {
        let program = |globals: &str, code: &str| {
            format!(
                "{globals}\n{}void lyraska_inputs(float r) {{\n    N = int( 8 );\n    M = float( float(4) );\n}}\n",
                body(code)
            )
        };
        let looped = "for (int i = int( 0 ); (float (i) < M); (i++)) { }";
        assert_eq!(
            check(&program("int N;\nfloat M;", looped), "lyraska_inputs"),
            Ok(())
        );
        // Gölgelendirici sınırı değiştiriyor ya da aynı adla yerel değişken var.
        let written = format!("(M = float(1000000));\n{looped}");
        assert_eq!(
            check(&program("int N;\nfloat M;", &written), "lyraska_inputs"),
            Err(LoopError::Unbounded)
        );
        let shadowed = format!("float M = float( 99999 );\n{looped}");
        assert_eq!(
            check(&program("int N;\nfloat M;", &shadowed), "lyraska_inputs"),
            Err(LoopError::Unbounded)
        );
        let passed = format!("g(M);\n{looped}");
        assert_eq!(
            check(
                &program("int N;\nfloat M;\nvoid g(inout float x) { }", &passed),
                "lyraska_inputs"
            ),
            Err(LoopError::Unbounded)
        );
    }

    #[test]
    fn sayac_govdede_degismez() {
        for (code, expected) in [
            (
                "for (int i = int( 0 ); (i < 4); (i++)) { (s += float(i)); }",
                Ok(()),
            ),
            (
                "for (int i = int( 0 ); (i < 4); (i++)) { (i = 0); }",
                Err(LoopError::Modified),
            ),
            (
                "for (int i = int( 0 ); (i < 4); (i++)) { (i--); }",
                Err(LoopError::Modified),
            ),
            (
                "for (int i = int( 0 ); (i < 4); (i++)) { a[i] = 1; b.x = float(i); }",
                Ok(()),
            ),
        ] {
            assert_eq!(check(&body(code), "yok"), expected, "{code}");
        }
    }

    #[test]
    fn while_do_ve_govdesiz_dongu_reddedilir() {
        assert_eq!(
            check(&body("while (true) { }"), "yok"),
            Err(LoopError::While)
        );
        assert_eq!(
            check(&body("do { } while (true);"), "yok"),
            Err(LoopError::While)
        );
        assert_eq!(
            check(&body("for (int i = 0; i < 4; i++) s += 1;"), "yok"),
            Err(LoopError::Unbounded)
        );
        // Üye adı anahtar sözcük sayılmaz.
        assert_eq!(check(&body("s.do = 1;"), "yok"), Ok(()));
    }

    #[test]
    fn is_cagrilarla_carpilir_ozyineleme_reddedilir() {
        let helper =
            "float f(float x) {\nfor (int i = int( 0 ); (i < 16); (i++)) { }\nreturn x;\n}\n";
        let calls = |n: usize| format!("{helper}{}", body(&"f(1.0);\n".repeat(n)));
        // Çağrı başına 16 tur: 64 çağrı = 1024 tur, 65 çağrı aşar.
        assert_eq!(check(&calls(64), "yok"), Ok(()));
        assert_eq!(check(&calls(65), "yok"), Err(LoopError::TooMuchWork));
        // Ön bildirimle karşılıklı çağrı (GLSL'de yasak; burada da reddedilir). Doğrudan kendini
        // çağıran işlev ekran kartında derlenmez (donma değil).
        let recursive = "float g(float x);\nfloat f(float x) { return g(x); }\n\
                         float g(float x) { return f(x); }\n";
        assert_eq!(check(recursive, "yok"), Err(LoopError::TooMuchWork));
        // Aynı adlı başka türden tanım (çevirinin `mult0` yardımcıları gibi) özyineleme değildir.
        let overloads =
            "float m(float x) { return x; }\nvec2 m(vec2 v) { return vec2(m(v.x), m(v.y)); }\n";
        assert_eq!(check(overloads, "yok"), Ok(()));
        // Döngüsüz ama üstel çağrı ağacı.
        let mut tree = String::from("float h0(float x) { return x; }\n");
        for level in 1..10 {
            let prev = level - 1;
            tree.push_str(&format!(
                "float h{level}(float x) {{ return h{prev}(h{prev}(h{prev}(x))); }}\n"
            ));
        }
        assert_eq!(check(&tree, "yok"), Err(LoopError::TooMuchWork));
    }
}
