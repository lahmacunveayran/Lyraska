//! MilkDrop denklemlerindeki (EEL) döngülerin denetimi: arayüze yalnızca programı
//! donduramayacak denklemler gider.
//!
//! Denklemler arayüzde, WebView'in ana iş parçacığında WebAssembly olarak çalışır (Butterchurn,
//! eel-wasm). eel-wasm `while`'ı 1 048 576 turla sınırlar ama `loop(n, …)`'ı sınırlamaz (n 2³¹'e
//! kadar); iç içe döngüler çarpılır. Bir görsel böylece programı dondurabilir. Kural:
//!
//! - Karede bir kez ya da açılışta çalışan denklemler ([`LoopPolicy::Capped`]: `per_frame_init`,
//!   `per_frame`, dalga `init`/`per_frame`, şekil `init`): döngüye izin var ama **iç içe** döngüye
//!   yok; her `loop(A, B)` metin olarak `loop(min(1048576, A), B)` olur (MilkDrop'un kendi sınırı).
//! - Karede çok kez çalışanlar ([`LoopPolicy::Forbidden`]: `per_pixel`, dalga `per_point`, şekil
//!   `per_frame` — her şekil örneği için): hiç döngü yok.
//! - Bir görselde en çok [`MAX_LOOPS`] döngü.
//!
//! Metin eel-wasm'ın kendisi gibi okunur: önce yorumlar (`//`, `\\\\` iki ters bölü, `/* */`) ve satır sonları
//! atılır (eel-wasm'ın ön işlemesinin aynısı; satır yorumundaki `/*` blok yorumu başlatır), sonra
//! adlar eel-wasm'ın sözcük kuralıyla (`[a-zA-Z_][a-zA-Z0-9._]*`, büyük/küçük harf farksız)
//! bulunur: `myloop(` ya da `x.loop(` döngü değildir. Eklenen metin yorum ya da satır sonu
//! içermediği için eel-wasm'ın göreceği koda aynen geçer.

/// MilkDrop'un kendi döngü sınırı (eel-wasm'ın `while` sınırı da bu).
pub const MAX_LOOP_COUNT: u32 = 1_048_576;
/// Bir görseldeki en fazla döngü (`loop` ve `while`, bütün denklemlerde).
pub const MAX_LOOPS: usize = 8;

/// Denklemin ne sıklıkla çalıştığına göre döngü kuralı.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoopPolicy {
    /// Karede bir ya da açılışta bir kez çalışır: döngüye izin var, iç içe döngüye yok.
    Capped,
    /// Karede çok kez çalışır (piksel, nokta, şekil örneği başına): döngü yasak.
    Forbidden,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoopError {
    Nested,
    Forbidden,
    TooMany,
}

/// Bir `loop`/`while` çağrısı (eel-wasm'ın göreceği koddaki sıralarıyla).
struct Call {
    is_loop: bool,
    open: usize,
    /// Kapanış parantezi; kapanmamışsa kodun sonu.
    close: usize,
    /// Çağrının ilk argümanını bitiren virgül.
    comma: Option<usize>,
}

/// Döngüleri denetler ve `loop` sayılarını sınırlar. Yeni metni ve döngü sayısını döndürür.
pub fn guard_loops(code: &str, policy: LoopPolicy) -> Result<(String, usize), LoopError> {
    let effective = effective_code(code);
    let calls = loop_calls(&effective);
    if calls.is_empty() {
        return Ok((code.to_owned(), 0));
    }
    if policy == LoopPolicy::Forbidden {
        return Err(LoopError::Forbidden);
    }
    if calls.len() > MAX_LOOPS {
        return Err(LoopError::TooMany);
    }
    for outer in &calls {
        if calls
            .iter()
            .any(|inner| inner.open > outer.open && inner.open < outer.close)
        {
            return Err(LoopError::Nested);
        }
    }
    // Eklemeler: `(`'dan hemen sonra "min(1048576, ", ilk virgülden hemen önce ")".
    let cap = format!("min({MAX_LOOP_COUNT}, ");
    let mut inserts: Vec<(usize, &str)> = Vec::new();
    for call in calls.iter().filter(|c| c.is_loop) {
        // Tek argümanlı `loop(…)` eel-wasm'da derlenmez (argüman sayısı hatası): dokunulmaz.
        let (Some(open), Some(comma)) = (
            effective.get(call.open),
            call.comma.and_then(|c| effective.get(c)),
        ) else {
            continue;
        };
        inserts.push((open.1 + 1, cap.as_str()));
        inserts.push((comma.1, ")"));
    }
    inserts.sort_by_key(|(at, _)| *at);
    let mut out = String::with_capacity(code.len() + inserts.len() * 16);
    let mut last = 0;
    for (at, text) in inserts {
        out.push_str(code.get(last..at).unwrap_or_default());
        out.push_str(text);
        last = at;
    }
    out.push_str(code.get(last..).unwrap_or_default());
    Ok((out, calls.len()))
}

/// eel-wasm'ın ön işlemesinin aynısı: yorumlar ve satır sonları atılır. Her karakter özgün
/// metindeki bayt yeriyle.
fn effective_code(code: &str) -> Vec<(char, usize)> {
    let chars: Vec<(usize, char)> = code.char_indices().collect();
    let mut out = Vec::with_capacity(chars.len());
    let (mut line_comment, mut block_comment) = (false, false);
    let next = |i: usize| chars.get(i + 1).map(|(_, c)| *c);
    let mut i = 0;
    while let Some(&(at, c)) = chars.get(i) {
        if c == '\n' {
            line_comment = false;
        } else if c == '\r' && next(i) == Some('\n') {
            i += 1;
            line_comment = false;
        } else if block_comment && c == '*' && next(i) == Some('/') {
            block_comment = false;
            i += 1;
        } else if (c == '\\' && next(i) == Some('\\')) || (c == '/' && next(i) == Some('/')) {
            line_comment = true;
            i += 1;
        } else if c == '/' && next(i) == Some('*') {
            block_comment = true;
            i += 1;
        } else if !line_comment && !block_comment {
            out.push((c, at));
        }
        i += 1;
    }
    out
}

/// Koddaki `loop(`/`while(` çağrıları (adlar eel-wasm'ın sözcük kuralıyla).
fn loop_calls(code: &[(char, usize)]) -> Vec<Call> {
    let mut calls = Vec::new();
    let mut i = 0;
    while let Some(&(c, _)) = code.get(i) {
        if !(c.is_ascii_alphabetic() || c == '_') {
            i += 1;
            continue;
        }
        let start = i;
        while code
            .get(i)
            .is_some_and(|(c, _)| c.is_ascii_alphanumeric() || *c == '_' || *c == '.')
        {
            i += 1;
        }
        let word: String = code[start..i]
            .iter()
            .map(|(c, _)| c.to_ascii_lowercase())
            .collect();
        if word != "loop" && word != "while" {
            continue;
        }
        let mut open = i;
        while code.get(open).is_some_and(|(c, _)| c.is_whitespace()) {
            open += 1;
        }
        if code.get(open).map(|(c, _)| *c) != Some('(') {
            continue;
        }
        let mut depth = 0usize;
        let mut close = code.len();
        let mut comma = None;
        for (k, (c, _)) in code.iter().enumerate().skip(open) {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        close = k;
                        break;
                    }
                }
                ',' if depth == 1 && comma.is_none() => comma = Some(k),
                _ => {}
            }
        }
        calls.push(Call {
            is_loop: word == "loop",
            open,
            close,
            comma,
        });
    }
    calls
}

#[cfg(test)]
mod tests {
    use super::*;

    fn capped(code: &str) -> Result<String, LoopError> {
        guard_loops(code, LoopPolicy::Capped).map(|(text, _)| text)
    }

    #[test]
    fn loop_sayisi_milkdrop_siniriyla_kirpilir() {
        assert_eq!(
            capped("loop(2000000000, q1 = q1 + 1);").unwrap(),
            "loop(min(1048576, 2000000000), q1 = q1 + 1);"
        );
        // İlk argümandaki iç virgüller (başka çağrılar) sayılmaz.
        assert_eq!(
            capped("x = 1;\nloop (max(a, b) * 3, y = y + sin(x, 1));").unwrap(),
            "x = 1;\nloop (min(1048576, max(a, b) * 3), y = y + sin(x, 1));"
        );
        // EEL büyük/küçük harf ayırmaz.
        assert_eq!(
            capped("LOOP(n, a=1)").unwrap(),
            "LOOP(min(1048576, n), a=1)"
        );
        assert_eq!(capped("Loop\t(n,a)").unwrap(), "Loop\t(min(1048576, n),a)");
        // Art arda (iç içe olmayan) döngüler ayrı ayrı kırpılır.
        assert_eq!(
            guard_loops("loop(5, a=1); loop(6, b=2); while(c)", LoopPolicy::Capped).unwrap(),
            (
                "loop(min(1048576, 5), a=1); loop(min(1048576, 6), b=2); while(c)".to_owned(),
                3
            )
        );
    }

    #[test]
    fn yorum_ve_baska_adlar_dongu_sayilmaz() {
        for code in [
            "// loop(1e9, x = 1)\nmyloop(3, 4); x.loop(1, 2); loops = 1;",
            "/* loop(1e9, x)\n while(1) */ a = 1;",
            "a = 1; \\\\ loop(1e9, a)",
            "loopx(1, 2); while_(3); loop = 2; while = 3;",
        ] {
            assert_eq!(capped(code).unwrap(), code, "{code}");
            assert_eq!(
                guard_loops(code, LoopPolicy::Forbidden).unwrap(),
                (code.to_owned(), 0),
                "{code}"
            );
        }
    }

    #[test]
    fn satir_sonlari_eel_gibi_yok_sayilir() {
        // eel-wasm satır sonlarını atar: "loo\np(" bir `loop(` çağrısıdır.
        assert_eq!(
            capped("loo\np(9, a)").unwrap(),
            "loo\np(min(1048576, 9), a)"
        );
        // Satır yorumundaki `/*` blok yorumu başlatır (eel-wasm'ın ön işlemesi böyle).
        assert_eq!(
            capped("// a /* b\nloop(9, a) */ c = 1;").unwrap(),
            "// a /* b\nloop(9, a) */ c = 1;"
        );
    }

    #[test]
    fn ic_ice_dongu_reddedilir() {
        for code in [
            "loop(10, loop(10, a = a + 1))",
            "loop(10, while(a))",
            "while(loop(3, a))",
            "loop(while(a), 2)",
            "loop(10, exec2(a = 1, LOOP(3, b)))",
        ] {
            assert_eq!(capped(code), Err(LoopError::Nested), "{code}");
        }
    }

    #[test]
    fn coklu_calisan_denklemde_dongu_yasak() {
        for code in ["loop(2, a=1)", "while(a)", "x = 1; WHILE (x)"] {
            assert_eq!(
                guard_loops(code, LoopPolicy::Forbidden),
                Err(LoopError::Forbidden),
                "{code}"
            );
        }
        assert_eq!(
            guard_loops("a = sin(x);", LoopPolicy::Forbidden).unwrap(),
            ("a = sin(x);".to_owned(), 0)
        );
    }

    #[test]
    fn cok_fazla_dongu_reddedilir() {
        let many = "loop(2, a=1);".repeat(MAX_LOOPS + 1);
        assert_eq!(capped(&many), Err(LoopError::TooMany));
        let ok = "loop(2, a=1);".repeat(MAX_LOOPS);
        assert!(capped(&ok).is_ok());
    }

    #[test]
    fn bozuk_girdide_panik_yok() {
        let pieces = [
            "loop", "LOOP", "while", "(", ")", ",", "/", "*", "\\", "\n", "\r", " ", "a", "1", ".",
            "ş", "//", "/*", "*/",
        ];
        let mut seed = 0x9e37_79b9_7f4a_7c15_u64;
        for _ in 0..5000 {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            let len = (seed % 30) as usize;
            let mut s = seed;
            let code: String = (0..len)
                .map(|_| {
                    s = s.wrapping_mul(6364136223846793005).wrapping_add(1);
                    pieces[(s >> 33) as usize % pieces.len()]
                })
                .collect();
            let _ = guard_loops(&code, LoopPolicy::Capped);
            let _ = guard_loops(&code, LoopPolicy::Forbidden);
        }
        // Kapanmamış çağrılar.
        assert!(capped("loop(1e9, a").is_ok());
        assert_eq!(capped("loop(1e9, loop(").unwrap_err(), LoopError::Nested);
    }
}
