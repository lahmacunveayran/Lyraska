//! Sözleri sese hizalamadan önce yapıştırılan düz metni hazırlar (`docs/arastirma/soz-hizalama/`).
//!
//! Sitelerden kopyalanan sözler söylenmeyen işaretler taşır ve tekrarları kısaltır. Bağımsız denetim
//! gerçek Türkçe şarkıda "[Nakarat]" ile kısaltılmış sözün satırların yalnızca %43,5'ini doğru yere
//! oturttuğunu, bu hazırlıkla %83,9'a çıktığını ölçtü. Kurallar:
//!
//! - **Başlık** söylenmez: köşeli ayraçlı her satır ("[Verse 1: Kendrick Lamar & SZA]",
//!   "[Instrumental]"); ayraçsız ya da normal parantezli satır yalnızca "bölüm adı + numara / tekrar"
//!   biçimindeyse ("Nakarat:", "1. Kıta", "Kıta I", "Ref:", "(Repeat Chorus)", "Nakarat tekrar") ya da
//!   iki noktadan önceki kısmı öyleyse ("Verse 2: Sanatçı"). "Ara beni" ve "(Ara beni)" söylenir.
//!   Künye satırları ("Söz-Müzik: …") da atılır.
//! - **Nakarat:** içi dolu nakarat başlığının paragrafı adıyla saklanır (nakarat/chorus/refrain bir
//!   aile, hook ayrı; numara da ad: "Nakarat 2"). Ardından söz gelmeyen nakarat başlığı ("[Nakarat]"
//!   sonra boş satır, "...", "(x2)" ya da başka başlık) ve "tekrar" içeren başlık saklananla dolar.
//! - **Tekrar:** satır başı ya da sonundaki "(x2)", "x2", "2x", "×2", "(2 kez)", "(3 kere)" satırı
//!   tekrarlar (ayraçsız işarette x küçük olmalı: "BMW X5" tekrar değildir). Tek başına bir satırdaki
//!   işaret ("(x2)", "Tekrar") paragrafta son işaretten beri gelen satırları, boş satırdan sonra
//!   önceki paragrafı tekrarlar. Başlıktaki sayı ("[Chorus x2]") bütün paragrafı tekrarlar.
//! - **Rakamlar** okunduğu gibi (Türkçe ve İngilizce): "7'de" → "yedi'de", "3." → "üçüncü",
//!   "21:30" → "yirmi bir otuz", "1.000" → "bin", "3,5" → "üç virgül beş", "%100" → "yüzde yüz",
//!   İngilizcede yıl "1984" → "nineteen eighty four". Başka dilde rakam atılır.
//! - **Harfler:** ayrışık yazılmış Türkçe harfler birleştirilir (s + çengel → ş, I + nokta → İ),
//!   küçük harf Türkçe kurala uyar (I → ı, İ → i); kelimede harf ve kelime içi kesme işareti kalır.
//! - **Sınır:** çıktı en çok `MAX_LINES` satırdır (üst üste tekrar işaretleri büyüyemez).

/// Sözün dili: rakamların nasıl okunacağı ve büyük I'nın nasıl küçüleceği.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    Turkish,
    English,
    Other,
}

/// Hizalanacak bir satır.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlignLine {
    /// Ekranda görünecek metin (tekrar işareti ve satırı saran parantez atılmış).
    pub text: String,
    /// Söylenen kelimeler: küçük harf, yalnızca harf ve kelime içi kesme işareti, rakamlar yazıyla.
    pub words: Vec<String>,
    /// Ekrandaki her kelimenin (`text`'in boşlukla ayrılan parçaları) kaç söylenen kelimeye açıldığı:
    /// "Twenty-one" 2, "21:30" 3, "—" 0. Toplamı `words.len()`.
    pub spans: Vec<usize>,
    /// Yapıştırılan metindeki satırın sırası (0'dan); kopyada kopyalanan satırın sırası.
    pub source: usize,
    /// Satır metinde yazılı değil, tekrar ya da nakarat olarak eklendi.
    pub copy: bool,
}

/// En büyük tekrar sayısı; daha büyüğü yazım hatası sayılır.
const MAX_REPEAT: usize = 9;
/// Çıktının en çok satırı (en uzun şarkılar birkaç yüz satırdır).
pub const MAX_LINES: usize = 4000;

/// Nakarat ailesi: saklama ve doldurmada aynı ad sayılır.
const CHORUS_NAMES: &[&str] = &[
    "nakarat",
    "chorus",
    "refrain",
    "refren",
    "ref",
    "ritornell",
    "coro",
    "estribillo",
];
/// Başka bölüm adları.
const OTHER_NAMES: &[&str] = &[
    "hook",
    "verse",
    "kıta",
    "kita",
    "bridge",
    "köprü",
    "intro",
    "outro",
    "giriş",
    "çıkış",
    "ara",
    "pre-chorus",
    "prechorus",
    "post-chorus",
    "solo",
    "instrumental",
    "enstrümantal",
    "couplet",
    "strophe",
    "interlude",
    "break",
];
/// Bölüm adının ardından gelebilen sözcükler ("Nakarat tekrar", "Pre chorus", "Nakarat öncesi").
const HEADER_EXTRA: &[&str] = &["tekrar", "repeat", "again", "öncesi", "sonrası", "chorus"];
/// "Tekrar" anlamına gelen sözcükler (başlıkta: saklanan nakaratı çağırır; tek başına: x2).
const RECALL_WORDS: &[&str] = &["tekrar", "repeat", "again"];
/// Künye satırının iki noktadan önceki kısmı.
const CREDITS: &[&str] = &[
    "söz",
    "sözler",
    "müzik",
    "söz-müzik",
    "söz müzik",
    "söz ve müzik",
    "beste",
    "düzenleme",
    "aranje",
    "lyrics",
    "music",
    "written by",
    "lyrics by",
    "music by",
    "produced by",
    "composer",
];

/// Ayrışık yazılmış harfleri birleştirir; görünmez boşluk ve satır ayırıcılarını düzeltir.
fn compose(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        let mark = match c {
            '\u{307}' | '\u{327}' | '\u{308}' | '\u{306}' | '\u{302}' => Some(c),
            _ => None,
        };
        match mark {
            Some(mark) => {
                let base = out.pop();
                let joined = base.and_then(|b| match (b, mark) {
                    ('I', '\u{307}') => Some('İ'),
                    ('i', '\u{307}') => Some('i'),
                    ('s', '\u{327}') => Some('ş'),
                    ('S', '\u{327}') => Some('Ş'),
                    ('c', '\u{327}') => Some('ç'),
                    ('C', '\u{327}') => Some('Ç'),
                    ('o', '\u{308}') => Some('ö'),
                    ('O', '\u{308}') => Some('Ö'),
                    ('u', '\u{308}') => Some('ü'),
                    ('U', '\u{308}') => Some('Ü'),
                    ('a', '\u{308}') => Some('ä'),
                    ('g', '\u{306}') => Some('ğ'),
                    ('G', '\u{306}') => Some('Ğ'),
                    ('a', '\u{302}') => Some('â'),
                    ('i' | 'ı', '\u{302}') => Some('î'),
                    ('u', '\u{302}') => Some('û'),
                    _ => None,
                });
                match (joined, base) {
                    (Some(j), _) => out.push(j),
                    (None, Some(b)) => out.push(b), // tanınmayan işaret atılır
                    (None, None) => {}
                }
            }
            None => match c {
                '\u{feff}' | '\u{200d}' | '\u{2060}' => {}
                '\u{200b}' | '\u{a0}' | '\u{2009}' | '\u{202f}' | '\t' => out.push(' '),
                '\u{2028}' | '\u{2029}' => out.push('\n'),
                _ => out.push(c),
            },
        }
    }
    out
}

/// Sık Türkçe sözcükler (yalnızca ASCII harfli Türkçe sözü tanımak için).
const TURKISH_WORDS: &[&str] = &[
    "ve", "bir", "bu", "ben", "sen", "bana", "sana", "beni", "seni", "gel", "git", "kez", "kere",
    "nakarat", "gibi", "ama", "yok", "var", "ne", "de", "da", "mi", "mu", "ile", "her", "hep",
    "gece", "yine", "daha", "kal", "olur", "neden", "sevda", "canim", "askim", "yar", "dur",
];

/// Metnin dilini kestirir. Türkçe: ğ, ı, ş, İ; ya da ç, ö, ü olup başka dillere özgü harf
/// (ä, ß, é, à, ñ…) olmaması; ya da ASCII metinde sık Türkçe sözcükler. Harflerin hepsi ASCII ise
/// İngilizce, değilse başka.
pub fn detect_language(text: &str) -> Language {
    let text = compose(text);
    if text
        .chars()
        .any(|c| matches!(c, 'ğ' | 'Ğ' | 'ı' | 'İ' | 'ş' | 'Ş'))
    {
        return Language::Turkish;
    }
    let letters: Vec<char> = text.chars().filter(|c| c.is_alphabetic()).collect();
    let foreign = letters.iter().any(|c| {
        !c.is_ascii() && !matches!(c, 'ç' | 'Ç' | 'ö' | 'Ö' | 'ü' | 'Ü' | 'â' | 'î' | 'û')
    });
    if !foreign && letters.iter().any(|c| !c.is_ascii()) {
        return Language::Turkish;
    }
    if foreign {
        return Language::Other;
    }
    let lower = text.to_lowercase();
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_alphabetic())
        .filter(|w| !w.is_empty())
        .collect();
    let hits = words.iter().filter(|w| TURKISH_WORDS.contains(w)).count();
    if hits >= 2 && hits * 8 >= words.len() {
        Language::Turkish
    } else {
        Language::English
    }
}

/// Dile göre küçük harf (Türkçede I → ı, İ → i).
pub fn lowercase(text: &str, language: Language) -> String {
    if language == Language::Turkish {
        text.chars()
            .map(|c| match c {
                'I' => "ı".to_string(),
                'İ' => "i".to_string(),
                _ => c.to_lowercase().collect(),
            })
            .collect()
    } else {
        text.chars()
            .map(|c| match c {
                'İ' => "i".to_string(),
                _ => c.to_lowercase().collect(),
            })
            .collect()
    }
}

/// Satırı saran tek bir ayraç çiftini atar: `("iç", Some('['))`.
fn strip_brackets(line: &str) -> (&str, Option<char>) {
    for (open, close) in [('[', ']'), ('(', ')'), ('{', '}')] {
        if let Some(inner) = line.strip_prefix(open).and_then(|s| s.strip_suffix(close)) {
            if !inner.contains(open) && !inner.contains(close) {
                return (inner.trim(), Some(open));
            }
        }
    }
    (line, None)
}

/// Başlık denetiminden önce satırın çevresindeki süs işaretleri ("*Nakarat*", "Nakarat...").
fn strip_decoration(line: &str) -> &str {
    line.trim_matches(|c: char| {
        c.is_whitespace() || matches!(c, '*' | '_' | '~' | '.' | '…' | '-' | '–' | '—' | '=' | '#')
    })
}

/// Tekrar işareti: "x2", "2x", "×2", "x 2" (`strict` iken x küçük olmalı), "2 kez", "3 kere",
/// "2 defa", "2 times". Ayraçlı biçimler de ("(x2)", "[2x]", "{x2}", "(2 kez)").
fn repeat_count(token: &str, strict: bool) -> Option<usize> {
    let (inner, bracket) = strip_brackets(token.trim());
    let strict = strict && bracket.is_none();
    let inner = inner.trim().trim_end_matches(':').trim();
    let lower = inner.to_lowercase();
    let mut parts = lower.split_whitespace();
    let n = match (parts.next(), parts.next(), parts.next()) {
        (Some(a), Some(b), None) if ["kez", "kere", "defa", "times"].contains(&b) => a.parse().ok(),
        (Some(a), Some(b), None) if a == "x" || a == "×" => b.parse().ok(),
        (Some(a), None, None) => {
            // Ayraçsız işarette büyük X model adıdır ("BMW X5").
            if strict && (inner.starts_with('X') || inner.ends_with('X')) {
                return None;
            }
            let digits = a
                .strip_prefix('x')
                .or_else(|| a.strip_prefix('×'))
                .or_else(|| a.strip_suffix('x'))
                .or_else(|| a.strip_suffix('×'))?;
            if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
                return None;
            }
            digits.parse().ok()
        }
        _ => None,
    }?;
    (2..=MAX_REPEAT).contains(&n).then_some(n)
}

/// Tek başına bir satırdaki tekrar işareti ("(x2)", "x3", "(2 kez)", "Tekrar", "(Repeat)").
fn standalone_repeat(line: &str) -> Option<usize> {
    if let Some(n) = repeat_count(line, false) {
        return Some(n);
    }
    let (inner, _) = strip_brackets(strip_decoration(line));
    let lower = inner.to_lowercase();
    let mut words = lower.split_whitespace();
    match (words.next(), words.next(), words.next()) {
        (Some(w), None, None) if RECALL_WORDS.contains(&w) => Some(2),
        (Some(w), Some(t), None) if RECALL_WORDS.contains(&w) => repeat_count(t, false),
        _ => None,
    }
}

/// Satırın başındaki ya da sonundaki tekrar işaretini ayırır: `("metin", 2)`.
fn split_repeat(line: &str) -> (&str, usize) {
    let trimmed = line.trim();
    // Sonda ayraçlı işaret ("(x 2)", "(2 kez)").
    for (open, close) in [('(', ')'), ('[', ']'), ('{', '}')] {
        if trimmed.ends_with(close) {
            if let Some(at) = trimmed.rfind(open) {
                if at > 0 {
                    if let Some(n) = repeat_count(&trimmed[at..], true) {
                        return (trimmed[..at].trim_end(), n);
                    }
                }
            }
        }
    }
    // Sonda ayraçsız ("Hey hey x3").
    if let Some((head, last)) = trimmed.rsplit_once(char::is_whitespace) {
        if let Some(n) = repeat_count(last, true) {
            return (head.trim_end(), n);
        }
    }
    // Başta ("x2 Seni seviyorum", "2x: Gel", "(x2) Gel").
    if let Some((first, rest)) = trimmed.split_once(char::is_whitespace) {
        if let Some(n) = repeat_count(first, true) {
            return (rest.trim_start(), n);
        }
    }
    (trimmed, 1)
}

/// Roma rakamı mı (I–XX, küçük harfle).
fn is_roman(word: &str) -> bool {
    !word.is_empty() && word.len() <= 5 && word.chars().all(|c| matches!(c, 'i' | 'v' | 'x'))
}

/// Numara: "1", "2.", "1:" ya da Roma rakamı.
fn is_number_word(word: &str) -> bool {
    let w = word.trim_end_matches(['.', ':', ')']);
    (!w.is_empty() && w.chars().all(|c| c.is_ascii_digit())) || is_roman(w)
}

/// Başlık bilgisi.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Header {
    /// Nakarat ise saklama adı ("nakarat", "nakarat 2", "hook"); başka bölümse `None`.
    name: Option<String>,
    /// Başlıktaki tekrar sayısı ("[Chorus x2]").
    times: usize,
    /// "tekrar" içerir: saklanan nakaratı çağırır.
    recall: bool,
}

/// Bölüm adı + numara / tekrar sözcükleri: başlıksa bilgisi. `loose` iken (köşeli ayraç ya da iki
/// noktadan önceki kısım) adın ardındaki her şey kabul edilir.
fn parse_header_words(words: &[&str], loose: bool) -> Option<Header> {
    let mut name: Option<&str> = None;
    let mut chorus = false;
    let mut number: Option<String> = None;
    let mut times = 1;
    let mut recall = false;
    let mut extra = false;
    for (i, raw) in words.iter().enumerate() {
        let w = raw.trim_matches(|c: char| matches!(c, ':' | ',' | '.' | '-' | '&'));
        if w.is_empty() {
            continue;
        }
        if name.is_none() {
            if CHORUS_NAMES.contains(&w) || OTHER_NAMES.contains(&w) {
                chorus = CHORUS_NAMES.contains(&w);
                name = Some(if chorus { "nakarat" } else { w });
                continue;
            }
            if (w == "r" || w == "ref") && raw.ends_with(':') {
                name = Some("nakarat");
                chorus = true;
                continue;
            }
            if RECALL_WORDS.contains(&w) {
                recall = true;
                continue;
            }
            if w == "pre" || w == "post" {
                extra = true;
                continue;
            }
            if i == 0 && is_number_word(raw) {
                number = Some(raw.trim_end_matches(['.', ':', ')']).to_string());
                continue;
            }
            return None;
        }
        if RECALL_WORDS.contains(&w) {
            recall = true;
        } else if HEADER_EXTRA.contains(&w) {
            extra = true;
        } else if let Some(n) = repeat_count(raw, false) {
            times = n;
        } else if is_number_word(raw) && number.is_none() {
            number = Some(raw.trim_end_matches(['.', ':', ')']).to_string());
        } else if !loose {
            return None;
        } else {
            break;
        }
    }
    let name = name?;
    // "Nakarat öncesi" ya da "Pre chorus" nakaratın kendisi değildir.
    let chorus = chorus && !extra;
    let chorus = chorus || (name == "hook");
    Some(Header {
        name: chorus.then(|| match &number {
            Some(n) => format!("{name} {n}"),
            None => name.to_string(),
        }),
        times,
        recall,
    })
}

/// Satır türü.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Kind {
    Blank,
    Header(Header),
    Repeat(usize),
    /// Söylenmeyen satır: künye ya da söylenen sözcüğü olmayan satır ("...").
    Skip,
    Lyric {
        text: String,
        words: Vec<String>,
        spans: Vec<usize>,
        times: usize,
    },
}

/// Satırın başlık olup olmadığı; iki küçük harf kuralı da denenir ("[Intro]" Türkçe kuralla
/// "ıntro" olurdu).
fn header_of(line: &str, language: Language) -> Option<Header> {
    header_with(line, language).or_else(|| header_with(line, Language::English))
}

fn header_with(line: &str, language: Language) -> Option<Header> {
    let core = strip_decoration(line);
    let (inner, bracket) = strip_brackets(core);
    let lower = lowercase(inner, language);
    if bracket == Some('[') && standalone_repeat(core).is_none() {
        // Köşeli ayraçlı satır söylenmez (Genius geleneği): ad tanınmasa da başlıktır.
        let words: Vec<&str> = lower.split_whitespace().collect();
        return Some(parse_header_words(&words, true).unwrap_or(Header {
            name: None,
            times: 1,
            recall: false,
        }));
    }
    // "1." tek başına: numaralı kıta.
    let bare = line.trim().trim_end_matches('.');
    if line.trim().ends_with('.')
        && !bare.is_empty()
        && bare.len() <= 2
        && bare.chars().all(|c| c.is_ascii_digit())
    {
        return Some(Header {
            name: None,
            times: 1,
            recall: false,
        });
    }
    if let Some((head, _)) = lower.split_once(':') {
        let words: Vec<&str> = head.split_whitespace().collect();
        if let Some(h) = parse_header_words(&words, true).filter(|_| !words.is_empty()) {
            // İki noktadan önceki kısmın tamamı başlık biçiminde olmalı ("Ara beni, sor beni:" değil).
            if parse_header_words(&words, false).is_some() {
                return Some(h);
            }
        }
        if words.len() == 1 && matches!(words[0], "r" | "ref") {
            return Some(Header {
                name: Some("nakarat".into()),
                times: 1,
                recall: false,
            });
        }
    }
    let words: Vec<&str> = lower.split_whitespace().collect();
    parse_header_words(&words, false)
}

/// Künye satırı mı ("Söz-Müzik: Sezen Aksu", "Written by: …").
fn is_credit(line: &str, language: Language) -> bool {
    let lower = lowercase(line, language);
    lower
        .split_once(':')
        .is_some_and(|(head, _)| CREDITS.contains(&head.trim().trim_start_matches('(')))
}

fn classify(line: &str, language: Language) -> Kind {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Kind::Blank;
    }
    if let Some(header) = header_of(trimmed, language) {
        return Kind::Header(header);
    }
    if let Some(n) = standalone_repeat(trimmed) {
        return Kind::Repeat(n);
    }
    if is_credit(trimmed, language) {
        return Kind::Skip;
    }
    let (body, times) = split_repeat(trimmed);
    let (body, _) = strip_brackets(body);
    let mut words = Vec::new();
    let mut spans = Vec::new();
    // Küçük harfe çevirmek boşluk eklemez ya da silmez: parçalar `body`'ninkilerle aynı sırada.
    for word in lowercase(body, language).split_whitespace() {
        let before = words.len();
        spoken_words(word, language, &mut words);
        spans.push(words.len() - before);
    }
    if words.is_empty() {
        return Kind::Skip;
    }
    Kind::Lyric {
        text: body.trim().to_string(),
        words,
        spans,
        times,
    }
}

// ---------------------------------------------------------------------------------------------
// Sayı okuma

const TR_ONES: [&str; 10] = [
    "", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz",
];
const TR_TENS: [&str; 10] = [
    "", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan",
];

/// Türkçe sayı okuma (0–999 999 999): 1990 → "bin dokuz yüz doksan".
fn turkish_number(n: u64, out: &mut Vec<String>) {
    if n == 0 {
        out.push("sıfır".into());
        return;
    }
    let mut n = n;
    for (scale, word) in [(1_000_000u64, "milyon"), (1_000, "bin")] {
        if n >= scale {
            let k = n / scale;
            if !(k == 1 && scale == 1_000) {
                turkish_number(k, out);
            }
            out.push(word.into());
            n %= scale;
        }
    }
    if n >= 100 {
        let h = (n / 100) as usize;
        if h > 1 {
            out.push(TR_ONES[h].into());
        }
        out.push("yüz".into());
        n %= 100;
    }
    if n >= 10 {
        out.push(TR_TENS[(n / 10) as usize].into());
        n %= 10;
    }
    if n > 0 {
        out.push(TR_ONES[n as usize].into());
    }
}

/// Türkçe sıra sayısının son sözcüğü: "üç" → "üçüncü".
fn turkish_ordinal(word: &str) -> String {
    match word {
        "bir" => "birinci".into(),
        "iki" => "ikinci".into(),
        "üç" => "üçüncü".into(),
        "dört" => "dördüncü".into(),
        "beş" => "beşinci".into(),
        "altı" => "altıncı".into(),
        "yedi" => "yedinci".into(),
        "sekiz" => "sekizinci".into(),
        "dokuz" => "dokuzuncu".into(),
        "on" => "onuncu".into(),
        "yirmi" => "yirminci".into(),
        "otuz" => "otuzuncu".into(),
        "kırk" => "kırkıncı".into(),
        "elli" => "ellinci".into(),
        "altmış" => "altmışıncı".into(),
        "yetmiş" => "yetmişinci".into(),
        "seksen" => "sekseninci".into(),
        "doksan" => "doksanıncı".into(),
        "yüz" => "yüzüncü".into(),
        "bin" => "bininci".into(),
        "milyon" => "milyonuncu".into(),
        "sıfır" => "sıfırıncı".into(),
        other => other.into(),
    }
}

const EN_SMALL: [&str; 20] = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
];
const EN_TENS: [&str; 10] = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

/// İngilizce sayı okuma (0–999 999 999): 365 → "three hundred sixty five".
fn english_number(n: u64, out: &mut Vec<String>) {
    if n < 20 {
        out.push(EN_SMALL[n as usize].into());
        return;
    }
    let mut n = n;
    for (scale, word) in [
        (1_000_000u64, "million"),
        (1_000, "thousand"),
        (100, "hundred"),
    ] {
        if n >= scale {
            english_number(n / scale, out);
            out.push(word.into());
            n %= scale;
        }
    }
    if n >= 20 {
        out.push(EN_TENS[(n / 10) as usize].into());
        n %= 10;
        if n > 0 {
            out.push(EN_SMALL[n as usize].into());
        }
    } else if n > 0 {
        out.push(EN_SMALL[n as usize].into());
    }
}

/// İngilizce yıl: 1984 → "nineteen eighty four", 1905 → "nineteen oh five", 1900 → "nineteen
/// hundred"; 2000–2009 tam sayı gibi ("two thousand five").
fn english_year(n: u64, out: &mut Vec<String>) -> bool {
    if !(1100..=1999).contains(&n) && !(2010..=2099).contains(&n) {
        return false;
    }
    english_number(n / 100, out);
    match n % 100 {
        0 => out.push("hundred".into()),
        r if r < 10 => {
            out.push("oh".into());
            english_number(r, out);
        }
        r => english_number(r, out),
    }
    true
}

/// İngilizce sıra sayısının son sözcüğü: "three" → "third".
fn english_ordinal(word: &str) -> String {
    match word {
        "one" => "first".into(),
        "two" => "second".into(),
        "three" => "third".into(),
        "five" => "fifth".into(),
        "eight" => "eighth".into(),
        "nine" => "ninth".into(),
        "twelve" => "twelfth".into(),
        w if w.ends_with('y') => format!("{}ieth", &w[..w.len() - 1]),
        w => format!("{w}th"),
    }
}

/// Rakam öbeğini okur. `digits` yalnızca ASCII rakam.
fn read_integer(digits: &str, language: Language, year: bool, out: &mut Vec<String>) {
    // Baştaki sıfır ("007") ve çok uzun sayı tek tek okunur.
    if (digits.len() > 1 && digits.starts_with('0')) || digits.len() > 9 {
        for d in digits.chars() {
            read_integer(&d.to_string(), language, false, out);
        }
        return;
    }
    let Ok(n) = digits.parse::<u64>() else {
        return;
    };
    match language {
        Language::Turkish => turkish_number(n, out),
        _ => {
            if !(year && english_year(n, out)) {
                english_number(n, out);
            }
        }
    }
}

/// Bir kelimedeki sayıyı okur: rakam öbekleri ayraçlarıyla ("21:30", "1.000", "3,5"), önündeki
/// "%" ve arkasındaki ek ("'de", "lar", "st").
fn read_number(token: &str, language: Language, out: &mut Vec<String>) {
    let chars: Vec<char> = token.chars().collect();
    let Some(first_digit) = chars.iter().position(|c| c.is_ascii_digit()) else {
        out.push(token.to_string());
        return;
    };
    // Rakam öbeği: rakamlar ve aralarındaki . , : (ardından rakam geliyorsa).
    let mut end = first_digit;
    while end < chars.len() {
        let c = chars[end];
        if c.is_ascii_digit()
            || (matches!(c, '.' | ',' | ':')
                && chars.get(end + 1).is_some_and(|d| d.is_ascii_digit()))
        {
            end += 1;
        } else {
            break;
        }
    }
    let prefix: String = chars[..first_digit].iter().collect();
    let numeral: String = chars[first_digit..end].iter().collect();
    let rest: String = chars[end..].iter().collect();
    let percent = prefix.ends_with('%') || rest.starts_with('%');
    let prefix = prefix.trim_end_matches('%');
    let rest = rest.trim_start_matches('%');
    if !prefix.is_empty() {
        out.push(prefix.to_string());
    }
    if percent && language == Language::Turkish {
        out.push("yüzde".into());
    }
    let start = out.len();
    let groups: Vec<&str> = numeral.split(['.', ',', ':']).collect();
    let seps: Vec<char> = numeral
        .chars()
        .filter(|c| matches!(c, '.' | ',' | ':'))
        .collect();
    let thousands = match language {
        Language::Turkish => '.',
        _ => ',',
    };
    if groups.len() > 1
        && seps.iter().all(|&s| s == thousands)
        && groups[1..].iter().all(|g| g.len() == 3)
    {
        read_integer(&groups.concat(), language, false, out);
    } else if groups.len() == 2 && seps[0] == ':' {
        read_integer(groups[0], language, false, out);
        if groups[1] != "00" {
            if groups[1].starts_with('0') && language == Language::Turkish {
                out.push("sıfır".into());
                read_integer(&groups[1][1..], language, false, out);
            } else {
                read_integer(groups[1], language, false, out);
            }
        }
    } else {
        for (i, group) in groups.iter().enumerate() {
            if i > 0 {
                match (seps[i - 1], language) {
                    (',', Language::Turkish) => out.push("virgül".into()),
                    ('.', Language::English) => out.push("point".into()),
                    _ => {}
                }
            }
            read_integer(group, language, groups.len() == 1 && group.len() == 4, out);
        }
    }
    if percent && language == Language::English {
        out.push("percent".into());
    }
    // Sıra sayısı: Türkçede sondaki nokta ("3."), İngilizcede st/nd/rd/th.
    let lower_rest = rest.to_lowercase();
    if out.len() > start {
        let last = out.len() - 1;
        if language == Language::Turkish && rest == "." {
            out[last] = turkish_ordinal(&out[last]);
            return;
        }
        if language == Language::English && ["st", "nd", "rd", "th"].contains(&lower_rest.as_str())
        {
            out[last] = english_ordinal(&out[last]);
            return;
        }
        // Ek son sözcüğe yapışır ("yedi'de", "doksanlar").
        let suffix = rest.trim_end_matches(['.', ',', '!', '?', ';', ':']);
        if !suffix.is_empty() {
            out[last].push_str(suffix);
        }
    }
}

/// Kelimeyi söylenen biçime çevirir. Kelime içindeki tire ve eğik çizgi kelimeyi böler.
fn spoken_words(word: &str, language: Language, out: &mut Vec<String>) {
    for part in word.split(['-', '–', '—', '/']) {
        let mut pieces = Vec::new();
        if part.chars().any(|c| c.is_ascii_digit()) {
            if language == Language::Other {
                pieces.push(part.chars().filter(|c| !c.is_ascii_digit()).collect());
            } else {
                read_number(part, language, &mut pieces);
            }
        } else {
            pieces.push(part.to_string());
        }
        for piece in pieces {
            let clean = clean_word(&piece);
            if !clean.is_empty() {
                out.push(clean);
            }
        }
    }
}

/// Harf ve kelime içindeki kesme işareti (' ’) kalır; baştaki ve sondaki kesme işareti atılır.
fn clean_word(word: &str) -> String {
    let kept: String = word
        .chars()
        .filter(|c| c.is_alphabetic() || matches!(c, '\'' | '’'))
        .map(|c| if c == '’' { '\'' } else { c })
        .collect();
    kept.trim_matches('\'').to_string()
}

// ---------------------------------------------------------------------------------------------
// Satırları kurma

/// Yapıştırılan düz metni hizalanacak satırlara çevirir; dil kendiliğinden kestirilir.
pub fn prepare(text: &str) -> Vec<AlignLine> {
    prepare_as(text, detect_language(text))
}

/// Dili bilinen sözü hazırlar (bkz. modül açıklaması).
pub fn prepare_as(text: &str, language: Language) -> Vec<AlignLine> {
    let text = compose(text);
    let kinds: Vec<Kind> = text.lines().map(|l| classify(l, language)).collect();
    let mut builder = Builder::default();
    for (index, kind) in kinds.iter().enumerate() {
        match kind {
            Kind::Blank => builder.end_paragraph(),
            Kind::Header(header) => {
                builder.end_paragraph();
                let next = kinds[index + 1..].first();
                let placeholder = header.recall
                    || matches!(
                        next,
                        None | Some(Kind::Blank | Kind::Header(_) | Kind::Skip | Kind::Repeat(_))
                    );
                let stored = header.name.as_ref().and_then(|n| builder.chorus(n));
                match (placeholder, stored) {
                    (true, Some(lines)) => {
                        for _ in 0..header.times {
                            builder.extend_copies(&lines);
                        }
                    }
                    (true, None) => {}
                    (false, _) => builder.open_section(header),
                }
            }
            Kind::Repeat(n) => builder.repeat(*n),
            Kind::Skip => {}
            Kind::Lyric {
                text,
                words,
                spans,
                times,
            } => {
                let line = AlignLine {
                    text: text.clone(),
                    words: words.clone(),
                    spans: spans.clone(),
                    source: index,
                    copy: false,
                };
                for t in 0..*times {
                    builder.push(AlignLine {
                        copy: t > 0,
                        ..line.clone()
                    });
                }
            }
        }
    }
    builder.end_paragraph();
    builder.out
}

/// Açık bölüm (içi dolu başlıktan sonraki paragraf).
struct Section {
    start: usize,
    times: usize,
    name: Option<String>,
}

#[derive(Default)]
struct Builder {
    out: Vec<AlignLine>,
    /// Saklanan nakaratlar (ad, satırlar).
    choruses: Vec<(String, Vec<AlignLine>)>,
    section: Option<Section>,
    /// Bu paragrafın başı ve son tek başına tekrar işaretinden sonraki ilk satır.
    paragraph_start: usize,
    mark: usize,
    /// Bir önceki paragraf (boş satırdan sonraki tek başına işaret için).
    previous: (usize, usize),
}

impl Builder {
    fn push(&mut self, line: AlignLine) {
        if self.out.len() < MAX_LINES {
            self.out.push(line);
        }
    }

    fn extend_copies(&mut self, lines: &[AlignLine]) {
        for line in lines {
            self.push(AlignLine {
                copy: true,
                ..line.clone()
            });
        }
    }

    /// Ada göre saklanan nakarat: önce tam ad, sonra numarasız ad, sonra aynı ailenin ilki.
    fn chorus(&self, name: &str) -> Option<Vec<AlignLine>> {
        let family = name.split_whitespace().next().unwrap_or(name);
        self.choruses
            .iter()
            .find(|(n, _)| n == name)
            .or_else(|| self.choruses.iter().find(|(n, _)| n == family))
            .or_else(|| {
                self.choruses
                    .iter()
                    .find(|(n, _)| n.split_whitespace().next() == Some(family))
            })
            .map(|(_, lines)| lines.clone())
    }

    fn open_section(&mut self, header: &Header) {
        self.section = Some(Section {
            start: self.out.len(),
            times: header.times,
            name: header.name.clone(),
        });
    }

    fn repeat(&mut self, n: usize) {
        let (from, to) = if self.out.len() > self.mark {
            (self.mark, self.out.len())
        } else if self.out.len() == self.paragraph_start {
            self.previous
        } else {
            (self.out.len(), self.out.len())
        };
        let block: Vec<AlignLine> = self.out[from..to].to_vec();
        for _ in 1..n {
            self.extend_copies(&block);
        }
        self.mark = self.out.len();
    }

    fn end_paragraph(&mut self) {
        if let Some(section) = self.section.take() {
            let body: Vec<AlignLine> = self.out[section.start.min(self.out.len())..].to_vec();
            if let Some(name) = section.name {
                if !body.is_empty() && !self.choruses.iter().any(|(n, _)| *n == name) {
                    self.choruses.push((name, body.clone()));
                }
            }
            for _ in 1..section.times {
                self.extend_copies(&body);
            }
        }
        if self.out.len() > self.paragraph_start {
            self.previous = (self.paragraph_start, self.out.len());
        }
        self.paragraph_start = self.out.len();
        self.mark = self.out.len();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(lines: &[AlignLine]) -> Vec<&str> {
        lines.iter().map(|l| l.text.as_str()).collect()
    }

    #[test]
    fn basliklar_atilir_soylenen_ara_kalir() {
        let lines = prepare(
            "[Verse 1]\nAra beni gece yarısı\nVerse 2\nNakarat:\nSen gidince\n(Intro)\nGİRİŞ\nBridge:\nköprü bu\n[INTRO]\n[KITA 3]",
        );
        assert_eq!(
            texts(&lines),
            ["Ara beni gece yarısı", "Sen gidince", "köprü bu"]
        );
    }

    #[test]
    fn ikinci_bos_nakarat_ilk_nakaratla_dolar() {
        let text =
            "[Nakarat]\nSeni seviyorum\nGitme kal\n\n[Kıta 2]\nYollar uzun\n\n[Nakarat]\n\nSon söz";
        let lines = prepare(text);
        assert_eq!(
            texts(&lines),
            [
                "Seni seviyorum",
                "Gitme kal",
                "Yollar uzun",
                "Seni seviyorum",
                "Gitme kal",
                "Son söz"
            ]
        );
        assert!(!lines[0].copy && lines[3].copy && lines[4].copy && !lines[5].copy);
        // Kopyanın kaynağı ilk nakaratın satırı.
        assert_eq!(lines[3].source, lines[0].source);
    }

    #[test]
    fn nakarat_sonda_ve_tekrar_sayisiyla() {
        let text = "Chorus\nla la\n\nVerse\nbir şey\n\n[Chorus x2]";
        assert_eq!(
            texts(&prepare(text)),
            ["la la", "bir şey", "la la", "la la"]
        );
    }

    #[test]
    fn dolu_ikinci_nakarat_kopyalanmaz() {
        // İkinci nakaratın satırları yazılmışsa olduğu gibi kullanılır (iki kez sayılmaz).
        let text = "[Nakarat]\nbir\n\n[Nakarat]\niki";
        assert_eq!(texts(&prepare(text)), ["bir", "iki"]);
    }

    #[test]
    fn satir_sonu_tekrar_isaretleri() {
        let lines = prepare("Gel gel (x2)\nHey hey x3\nOh oh [2x]\nYo (x 2)\nTek x\nSayı x12");
        assert_eq!(
            texts(&lines),
            [
                "Gel gel",
                "Gel gel",
                "Hey hey",
                "Hey hey",
                "Hey hey",
                "Oh oh",
                "Oh oh",
                "Yo",
                "Yo",
                "Tek x",
                "Sayı x12"
            ]
        );
        assert!(!lines[0].copy && lines[1].copy);
    }

    #[test]
    fn tek_basina_tekrar_onceki_paragrafi_tekrarlar() {
        let lines = prepare("bir\niki\n(x2)\n\nüç");
        assert_eq!(texts(&lines), ["bir", "iki", "bir", "iki", "üç"]);
    }

    #[test]
    fn rakamlar_yaziya_turkce_ve_ingilizce() {
        let tr = prepare("7'de buluşalım, 1990 yazı\n100 kere 21 gün 0 ışık");
        assert_eq!(
            tr[0].words,
            [
                "yedi'de",
                "buluşalım",
                "bin",
                "dokuz",
                "yüz",
                "doksan",
                "yazı"
            ]
        );
        assert_eq!(
            tr[1].words,
            ["yüz", "kere", "yirmi", "bir", "gün", "sıfır", "ışık"]
        );
        let en = prepare("99 problems and 2 hearts in 1984");
        assert_eq!(
            en[0].words,
            [
                "ninety", "nine", "problems", "and", "two", "hearts", "in", "nineteen", "eighty",
                "four"
            ]
        );
        // Uzun sayı da okunur; on basamaktan uzunu ve baştaki sıfırlı sayı rakam rakam.
        assert_eq!(
            prepare("123456 kez ğ")[0].words,
            ["yüz", "yirmi", "üç", "bin", "dört", "yüz", "elli", "altı", "kez", "ğ"]
        );
        assert_eq!(prepare("007 ğ")[0].words, ["sıfır", "sıfır", "yedi", "ğ"]);
        assert_eq!(prepare("%100 ğ")[0].words, ["yüzde", "yüz", "ğ"]);
        assert_eq!(
            prepare("90'lar 2. ğ")[0].words,
            ["doksan'lar", "ikinci", "ğ"]
        );
        assert_eq!(
            prepare("the 3rd 1st 20th")[0].words,
            ["the", "third", "first", "twentieth"]
        );
    }

    #[test]
    fn turkce_kucuk_harf_ve_noktalama() {
        let lines = prepare("IŞIK İstanbul'da, “güzel”—gece!");
        assert_eq!(lines[0].words, ["ışık", "istanbul'da", "güzel", "gece"]);
        assert_eq!(lines[0].text, "IŞIK İstanbul'da, “güzel”—gece!");
        // İngilizce sözde I, i olur.
        assert_eq!(prepare("I KNOW IT")[0].words, ["i", "know", "it"]);
    }

    #[test]
    fn dil_kestirimi() {
        assert_eq!(detect_language("Gözlerin ışığı"), Language::Turkish);
        assert_eq!(detect_language("Hold me close"), Language::English);
        assert_eq!(detect_language("Je t'aime à la folie"), Language::Other);
        // Başka dilde rakam yazıya çevrilmez.
        assert_eq!(prepare("à 2 heures")[0].words, ["à", "heures"]);
    }

    #[test]
    fn parantezli_geri_vokal_soylenir() {
        let lines = prepare("Sen (sen) gitme\n(oh oh oh)\n[Instrumental]");
        assert_eq!(texts(&lines), ["Sen (sen) gitme", "oh oh oh"]);
        assert_eq!(lines[0].words, ["sen", "sen", "gitme"]);
    }

    #[test]
    fn bos_ve_yalniz_isaret_metni() {
        assert!(prepare("").is_empty());
        assert!(prepare("\n\n[Nakarat]\n\n...\n").is_empty());
        assert!(prepare("x2").is_empty());
    }

    // Bağımsız incelemenin karşı örnekleri (önce eski kodda düştüler).

    // B1 (kritik): üst üste tek başına işaret üstel büyür.
    #[test]
    fn ust_uste_tek_basina_tekrar_ustel_buyumez() {
        let text = format!("la la\n{}", "(x9)\n".repeat(6));
        assert!(
            prepare(&text).len() <= 9 * 6,
            "satır: {}",
            prepare(&text).len()
        );
    }

    // B2 (önemli): aynı paragrafta ikinci "(x2)" yalnızca kendinden önceki işaretten sonrasını tekrarlar.
    #[test]
    fn paragraf_icinde_iki_tekrar_isareti() {
        assert_eq!(
            texts(&prepare("a\nb\n(x2)\nc\nd\n(x2)")),
            ["a", "b", "a", "b", "c", "d", "c", "d"]
        );
    }

    // B3 (önemli): nakarat kopyası ilk nakaratın tekrarlarını da taşır.
    #[test]
    fn nakarat_kopyasi_tekrarlari_tasir() {
        let t = "[Nakarat]\nGel gel (x2)\nGitme ışık\n\n[Kıta]\nyo\n\n[Nakarat]";
        assert_eq!(
            texts(&prepare(t)),
            [
                "Gel gel",
                "Gel gel",
                "Gitme ışık",
                "yo",
                "Gel gel",
                "Gel gel",
                "Gitme ışık"
            ]
        );
        let t = "[Nakarat]\nla ışık\n(x2)\n\n[Kıta]\nyo\n\n[Nakarat]";
        assert_eq!(
            texts(&prepare(t)),
            ["la ışık", "la ışık", "yo", "la ışık", "la ışık"]
        );
    }

    // B4 (önemli): içi dolu "[Chorus x2]" paragrafı iki kez söylenir.
    #[test]
    fn dolu_baslikta_tekrar_sayisi() {
        assert_eq!(
            texts(&prepare("[Chorus x2]\nla la\nhey\n\n[Verse 2]\nyo")),
            ["la la", "hey", "la la", "hey", "yo"]
        );
    }

    // B5 (önemli): yer tutucunun ardından gelen "..." ya da "(x2)" yer tutucuyu bozmaz.
    #[test]
    fn yer_tutucu_ardinda_uc_nokta_ya_da_tekrar() {
        let base = "[Nakarat]\nla ışık\n\n[Kıta]\nyo\n\n";
        assert_eq!(
            texts(&prepare(&format!("{base}[Nakarat]\n..."))),
            ["la ışık", "yo", "la ışık"]
        );
        assert_eq!(
            texts(&prepare(&format!("{base}[Nakarat]\n(x2)"))),
            ["la ışık", "yo", "la ışık", "la ışık"]
        );
        assert_eq!(
            texts(&prepare(&format!("{base}Nakarat..."))),
            ["la ışık", "yo", "la ışık"]
        );
        assert_eq!(
            texts(&prepare(&format!("{base}*Nakarat*"))),
            ["la ışık", "yo", "la ışık"]
        );
    }

    // B6 (önemli): boş satırdan sonraki tek başına işaret önceki paragrafı tekrarlar (modül belgesi böyle diyor).
    #[test]
    fn bos_satirdan_sonra_tek_basina_tekrar() {
        assert_eq!(
            texts(&prepare("bir\niki\n\n(x2)")),
            ["bir", "iki", "bir", "iki"]
        );
    }

    // B7 (önemli): Genius'un uzun katkı listeli başlıkları atılır.
    #[test]
    fn genius_uzun_baslik() {
        assert_eq!(
            texts(&prepare("[Verse 1: Kendrick Lamar & SZA]\nyeah")),
            ["yeah"]
        );
        assert_eq!(
            texts(&prepare(
                "[Intro: Travis Scott, Kendrick Lamar & Future]\nyeah"
            )),
            ["yeah"]
        );
    }

    // B8 (önemli): parantezli geri vokal ve iki noktayla biten söz satırı atılmaz.
    #[test]
    fn anahtar_kelimeyle_baslayan_soylenen_satir() {
        assert_eq!(
            texts(&prepare("(Ara beni)\n(Giriş yap kalbime)\nışık")),
            ["Ara beni", "Giriş yap kalbime", "ışık"]
        );
        assert_eq!(
            texts(&prepare("Ara beni, sor beni, bul beni:\nışık")),
            ["Ara beni, sor beni, bul beni:", "ışık"]
        );
    }

    // B9 (önemli): birden çok rakam öbeği olan sayı sessizce silinmez.
    #[test]
    fn saat_ondalik_binlik_silinmez() {
        assert_eq!(
            prepare("Saat 21:00'de ışık")[0].words,
            ["saat", "yirmi", "bir'de", "ışık"]
        );
        assert_eq!(
            prepare("21:05 ışık")[0].words,
            ["yirmi", "bir", "sıfır", "beş", "ışık"]
        );
        assert!(prepare("3,5 ışık")[0].words.len() > 1);
        assert_eq!(prepare("1.000 ışık")[0].words, ["bin", "ışık"]);
    }

    // B10 (önemli): İngilizce yıllar söylendiği gibi.
    #[test]
    fn ingilizce_yillar() {
        assert_eq!(
            prepare("In 1984")[0].words,
            ["in", "nineteen", "eighty", "four"]
        );
    }

    // B11 (önemli): ayrışık yazılmış Türkçe harfler (NFD) kaybolmaz.
    #[test]
    fn ayrisik_turkce_harfler() {
        assert_eq!(
            prepare("I\u{307}stanbul s\u{327}arkı go\u{308}nu\u{308}l")[0].words,
            ["istanbul", "şarkı", "gönül"]
        );
    }

    // B12 (önemli): ğ/ı/ş/İ içermeyen Türkçe söz İngilizce okunmaz.
    #[test]
    fn dil_kestirimi_kisa_turkce() {
        assert_eq!(
            prepare("Gel gel (2 kez)\n3. kez geldin")[2].words[0],
            "üçüncü"
        );
        assert_ne!(detect_language("Gönül 2 gözüm"), Language::Other);
    }

    // B13 (önemli): Türkçe tekrar biçimleri ve satır başı "x2".
    #[test]
    fn turkce_tekrar_bicimleri() {
        assert_eq!(
            texts(&prepare("Gel gel ışık (2 kez)")),
            ["Gel gel ışık", "Gel gel ışık"]
        );
        assert_eq!(texts(&prepare("Git git ışık (3 kere)")).len(), 3);
        assert_eq!(
            texts(&prepare("x2 Seni seviyorum ışık")),
            ["Seni seviyorum ışık", "Seni seviyorum ışık"]
        );
    }

    // B14 (önemli): yaygın başlık biçimleri.
    #[test]
    fn yaygin_basliklar() {
        for h in [
            "1. Kıta",
            "Ref:",
            "R:",
            "Refren:",
            "(Repeat Chorus)",
            "Nakarat tekrar",
            "Söz-Müzik: Sezen Aksu",
            "\u{FEFF}[Nakarat]",
            "1.",
            "Kıta I",
        ] {
            assert_eq!(texts(&prepare(&format!("{h}\nışık"))), ["ışık"], "{h}");
        }
    }

    // B15 (küçük): farklı adlı nakarat yer tutucusu kendi adının satırlarıyla dolar.
    #[test]
    fn hook_ve_chorus_ayri() {
        let t = "[Chorus]\nA line\n\n[Hook]\nB line\n\n[Verse]\nyo\n\n[Hook]";
        assert_eq!(texts(&prepare(t)), ["A line", "B line", "yo", "B line"]);
    }

    // B16 (küçük): satır sonundaki model adı tekrar sayılmaz.
    #[test]
    fn buyuk_x_model_adi() {
        assert_eq!(texts(&prepare("Bindim BMW X5")), ["Bindim BMW X5"]);
    }

    #[test]
    fn koseli_tekrar_ve_tekrar_sozcugu_tek_basina() {
        assert_eq!(texts(&prepare("bir ışık\n[x2]")), ["bir ışık", "bir ışık"]);
        assert_eq!(
            texts(&prepare("bir ışık\nTekrar")),
            ["bir ışık", "bir ışık"]
        );
    }

    #[test]
    fn nakarat_oncesi_nakarat_sayilmaz() {
        let t = "[Pre-Chorus]\nön ışık\n\n[Nakarat]\nasıl\n\n[Nakarat]";
        assert_eq!(texts(&prepare(t)), ["ön ışık", "asıl", "asıl"]);
        let t = "Nakarat öncesi:\nön ışık\n\nNakarat:\nasıl\n\n[Nakarat]";
        assert_eq!(texts(&prepare(t)), ["ön ışık", "asıl", "asıl"]);
    }

    #[test]
    fn ic_ice_tekrar_sinirda_kalir() {
        // Her satır ×9, paragraf ×9, bölüm ×9: sınır aşılmaz.
        let para = "la ışık (x9)\n".repeat(50) + "(x9)\n";
        let text = format!("[Chorus x9]\n{para}\n") + &"[Chorus x9]\n\n".repeat(200);
        let lines = prepare(&text);
        assert_eq!(lines.len(), MAX_LINES);
    }
}
