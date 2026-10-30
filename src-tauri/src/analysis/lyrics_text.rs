//! Sözleri sese hizalamadan önce yapıştırılan düz metni hazırlar (`docs/arastirma/soz-hizalama/`).
//!
//! Sitelerden kopyalanan sözler söylenmeyen işaretler taşır ve tekrarları kısaltır. Bağımsız denetim
//! gerçek Türkçe şarkıda "[Nakarat]" ile kısaltılmış sözün satırların yalnızca %43,5'ini doğru yere
//! oturttuğunu, bu hazırlıkla %83,9'a çıktığını ölçtü. Yapılanlar:
//!
//! - bölüm başlıkları ("[Nakarat]", "Verse 1", "Chorus:") atılır; köşeli ya da normal parantezle
//!   yazılmamış ya da yalnızca "anahtar + sayı/iki nokta" olmayan satır başlık sayılmaz ("Ara beni"
//!   söylenen bir satırdır);
//! - ikinci kez gelen boş "[Nakarat]" ilk nakaratın satırlarıyla doldurulur;
//! - satır sonundaki "(x2)", "x2", "2x" satırı tekrarlar; tek başına bir satırdaki işaret önceki
//!   paragrafı tekrarlar;
//! - rakamlar okunduğu gibi yazıya çevrilir (Türkçe ve İngilizce, 0–9999; "7'de" → "yedi'de");
//! - küçük harfe çevirme Türkçe kurala uyar (I → ı, İ → i).

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
    /// Ekranda görünecek metin (tekrar işareti atılmış).
    pub text: String,
    /// Söylenen kelimeler: küçük harf, yalnızca harf ve kelime içi kesme işareti, rakamlar yazıyla.
    pub words: Vec<String>,
    /// Yapıştırılan metindeki satırın sırası (0'dan); kopyada kopyalanan satırın sırası.
    pub source: usize,
    /// Satır metinde yazılı değil, tekrar ya da nakarat olarak eklendi.
    pub copy: bool,
}

/// Başlık sayılan bölüm adları (küçük harf). Nakarat türleri ayrıca işaretlenir.
const CHORUS_HEADERS: &[&str] = &[
    "nakarat",
    "chorus",
    "refrain",
    "ritornell",
    "coro",
    "estribillo",
    "hook",
];
const OTHER_HEADERS: &[&str] = &[
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
];

/// En uzun tekrar: "(x9)"; daha büyüğü yazım hatası sayılır ve satır bir kez söylenir.
const MAX_REPEAT: usize = 9;

/// Metnin dilini kestirir: Türkçeye özgü harf (ğ, ı, ş, İ) varsa Türkçe, harflerin hepsi ASCII ise
/// İngilizce, değilse başka.
pub fn detect_language(text: &str) -> Language {
    if text
        .chars()
        .any(|c| matches!(c, 'ğ' | 'Ğ' | 'ı' | 'İ' | 'ş' | 'Ş'))
    {
        Language::Turkish
    } else if text
        .chars()
        .filter(|c| c.is_alphabetic())
        .all(|c| c.is_ascii())
    {
        Language::English
    } else {
        Language::Other
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
        text.to_lowercase()
    }
}

/// Satırın bölüm başlığı türü: `Some(true)` nakarat, `Some(false)` başka bölüm, `None` başlık değil.
/// Türkçe sözde de başlık İngilizce olabilir ("[Intro]": Türkçe kuralla "ıntro" olurdu), bu yüzden
/// iki küçük harf kuralı da denenir.
fn header_kind(line: &str, language: Language) -> Option<bool> {
    header_kind_with(line, language).or_else(|| header_kind_with(line, Language::English))
}

fn header_kind_with(line: &str, language: Language) -> Option<bool> {
    let trimmed = line.trim();
    let (inner, bracketed) = strip_brackets(trimmed);
    let lower = lowercase(inner, language);
    let lower = lower.trim().trim_end_matches(':').trim();
    let mut words = lower.split_whitespace();
    let first = words.next()?.trim_end_matches(':');
    let rest: Vec<&str> = words.collect();
    // "Nakarat öncesi", "Pre chorus": iki kelimelik adlar ilk kelimeden tanınır.
    let chorus = CHORUS_HEADERS.contains(&first);
    let other =
        OTHER_HEADERS.contains(&first) || (first == "pre" && rest.first() == Some(&"chorus"));
    if !chorus && !other {
        return None;
    }
    // Ayraçsız başlık yalnızca "anahtar", "anahtar 2", "anahtar:" ya da "Nakarat x2" olabilir;
    // "Ara beni" gibi söylenen satırlar başlık sayılmaz.
    let plain = rest.iter().all(|w| {
        w.trim_end_matches(':').chars().all(|c| c.is_ascii_digit()) || repeat_count(w).is_some()
    });
    let ends_colon = trimmed.ends_with(':');
    if bracketed || plain || ends_colon {
        if bracketed && rest.len() > 4 {
            return None;
        }
        Some(chorus && !(first == "pre" || lower.contains("öncesi") || lower.contains("sonrası")))
    } else {
        None
    }
}

/// Satırı saran tek bir ayraç çiftini atar: `("iç", true)`; ayraç yoksa `(satır, false)`.
fn strip_brackets(line: &str) -> (&str, bool) {
    for (open, close) in [('[', ']'), ('(', ')'), ('{', '}')] {
        if let Some(inner) = line.strip_prefix(open).and_then(|s| s.strip_suffix(close)) {
            if !inner.contains(open) && !inner.contains(close) {
                return (inner, true);
            }
        }
    }
    (line, false)
}

/// "x2", "2x", "×2", "(x2)", "[2x]" → 2. Başka bir şeyse `None`.
fn repeat_count(token: &str) -> Option<usize> {
    let (inner, _) = strip_brackets(token.trim());
    let lower = inner.trim().to_lowercase();
    let digits = lower
        .strip_prefix('x')
        .or_else(|| lower.strip_prefix('×'))
        .or_else(|| lower.strip_suffix('x'))
        .or_else(|| lower.strip_suffix('×'))?
        .trim();
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let n: usize = digits.parse().ok()?;
    (2..=MAX_REPEAT).contains(&n).then_some(n)
}

/// Satırın sonundaki tekrar işaretini ayırır: `("metin", 2)`.
fn split_repeat(line: &str) -> (&str, usize) {
    let trimmed = line.trim_end();
    // Ayraçlı işaret boşluklu olabilir: "(x 2)".
    for (open, close) in [('(', ')'), ('[', ']')] {
        if trimmed.ends_with(close) {
            if let Some(at) = trimmed.rfind(open) {
                if let Some(n) = repeat_count(&trimmed[at..].replace(' ', "")) {
                    return (trimmed[..at].trim_end(), n);
                }
            }
        }
    }
    match trimmed.rsplit_once(char::is_whitespace) {
        Some((head, last)) => match repeat_count(last) {
            Some(n) => (head.trim_end(), n),
            None => (trimmed, 1),
        },
        None => (trimmed, 1),
    }
}

const TR_ONES: [&str; 10] = [
    "", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz",
];
const TR_TENS: [&str; 10] = [
    "", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan",
];

/// Türkçe sayı okuma (0–9999): 1990 → "bin dokuz yüz doksan".
fn turkish_number(mut n: u32) -> Vec<&'static str> {
    if n == 0 {
        return vec!["sıfır"];
    }
    let mut out = Vec::new();
    if n >= 1000 {
        let k = (n / 1000) as usize;
        if k > 1 {
            out.push(TR_ONES[k]);
        }
        out.push("bin");
        n %= 1000;
    }
    if n >= 100 {
        let h = (n / 100) as usize;
        if h > 1 {
            out.push(TR_ONES[h]);
        }
        out.push("yüz");
        n %= 100;
    }
    if n >= 10 {
        out.push(TR_TENS[(n / 10) as usize]);
        n %= 10;
    }
    if n > 0 {
        out.push(TR_ONES[n as usize]);
    }
    out
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

/// İngilizce sayı okuma (0–9999): 365 → "three hundred sixty five".
fn english_number(mut n: u32) -> Vec<&'static str> {
    if n < 20 {
        return vec![EN_SMALL[n as usize]];
    }
    let mut out = Vec::new();
    if n >= 1000 {
        out.push(EN_SMALL[(n / 1000) as usize]);
        out.push("thousand");
        n %= 1000;
    }
    if n >= 100 {
        out.push(EN_SMALL[(n / 100) as usize]);
        out.push("hundred");
        n %= 100;
    }
    if n >= 20 {
        out.push(EN_TENS[(n / 10) as usize]);
        n %= 10;
    }
    if n > 0 {
        out.push(EN_SMALL[n as usize]);
    }
    out
}

/// Kelimeyi söylenen biçime çevirir: rakamlar yazıyla, harf ve kelime içi kesme işareti dışında
/// her şey atılır. Kelime içindeki tire ve eğik çizgi kelimeyi böler.
fn spoken_words(word: &str, language: Language, out: &mut Vec<String>) {
    for part in word.split(['-', '–', '—', '/']) {
        let digits: Vec<(usize, char)> = part
            .char_indices()
            .filter(|(_, c)| c.is_ascii_digit())
            .collect();
        let number = match (digits.first(), digits.last()) {
            (Some(&(start, _)), Some(&(end, _)))
                if digits.len() <= 4
                    && part[start..=end].chars().all(|c| c.is_ascii_digit())
                    && language != Language::Other =>
            {
                part[start..=end]
                    .parse::<u32>()
                    .ok()
                    .map(|n| (start, end, n))
            }
            _ => None,
        };
        let mut pieces: Vec<String> = match number {
            Some((start, end, n)) => {
                let spelled = if language == Language::Turkish {
                    turkish_number(n)
                } else {
                    english_number(n)
                };
                let mut pieces: Vec<String> = spelled.iter().map(|s| s.to_string()).collect();
                if let Some(first) = pieces.first_mut() {
                    first.insert_str(0, &part[..start]);
                }
                if let Some(last) = pieces.last_mut() {
                    last.push_str(&part[end + 1..]);
                }
                pieces
            }
            None => vec![part.to_string()],
        };
        for piece in pieces.drain(..) {
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

/// Yapıştırılan düz metni hizalanacak satırlara çevirir (bkz. modül açıklaması).
pub fn prepare(text: &str) -> Vec<AlignLine> {
    let language = detect_language(text);
    let lines: Vec<&str> = text.lines().collect();
    let mut out: Vec<AlignLine> = Vec::new();
    // İlk nakaratın satırları (ilk nakarat başlığından sonraki paragraf).
    let mut chorus: Option<Vec<AlignLine>> = None;
    let mut capturing_chorus = false;
    let mut capture: Vec<AlignLine> = Vec::new();
    // İçinde bulunulan paragrafın `out` içindeki başlangıcı (tek başına "x2" için).
    let mut paragraph_start = 0;

    let finish_capture = |capturing: &mut bool,
                          capture: &mut Vec<AlignLine>,
                          chorus: &mut Option<Vec<AlignLine>>| {
        if *capturing && chorus.is_none() && !capture.is_empty() {
            *chorus = Some(std::mem::take(capture));
        }
        *capturing = false;
        capture.clear();
    };

    for (index, raw) in lines.iter().enumerate() {
        let line = raw.trim();
        if line.is_empty() {
            finish_capture(&mut capturing_chorus, &mut capture, &mut chorus);
            paragraph_start = out.len();
            continue;
        }
        if let Some(is_chorus) = header_kind(line, language) {
            finish_capture(&mut capturing_chorus, &mut capture, &mut chorus);
            paragraph_start = out.len();
            if is_chorus {
                let next = lines[index + 1..].iter().map(|l| l.trim()).next();
                let placeholder =
                    next.is_none_or(|n| n.is_empty() || header_kind(n, language).is_some());
                match (&chorus, placeholder) {
                    (Some(lines), true) => {
                        let times = line
                            .split_whitespace()
                            .filter_map(|w| repeat_count(w.trim_matches(['[', ']', '(', ')'])))
                            .next()
                            .unwrap_or(1);
                        for _ in 0..times {
                            out.extend(lines.iter().map(|l| AlignLine {
                                copy: true,
                                ..l.clone()
                            }));
                        }
                    }
                    _ => capturing_chorus = true,
                }
            }
            continue;
        }
        // Tek başına tekrar işareti: önceki paragrafı (bu paragraf boşsa bir öncekini) tekrarlar.
        if let Some(n) = repeat_count(line) {
            let block: Vec<AlignLine> = out[paragraph_start..]
                .iter()
                .map(|l| AlignLine {
                    copy: true,
                    ..l.clone()
                })
                .collect();
            for _ in 1..n {
                out.extend(block.iter().cloned());
            }
            continue;
        }
        let (body, times) = split_repeat(line);
        let (body, _) = strip_brackets(body);
        let mut words = Vec::new();
        for word in lowercase(body, language).split_whitespace() {
            spoken_words(word, language, &mut words);
        }
        if words.is_empty() {
            continue;
        }
        let aligned = AlignLine {
            text: body.trim().to_string(),
            words,
            source: index,
            copy: false,
        };
        if capturing_chorus {
            capture.push(aligned.clone());
        }
        for repeat in 0..times {
            out.push(AlignLine {
                copy: repeat > 0,
                ..aligned.clone()
            });
        }
    }
    out
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
                "ninety", "nine", "problems", "and", "two", "hearts", "in", "one", "thousand",
                "nine", "hundred", "eighty", "four"
            ]
        );
        // Beş ve daha uzun basamak okunmaz (yalnızca harfler kalır).
        assert_eq!(prepare("123456 kez ğ")[0].words, ["kez", "ğ"]);
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
}
