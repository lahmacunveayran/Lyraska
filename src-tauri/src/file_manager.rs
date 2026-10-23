//! Dosya gezginini açan işletim sistemi kodu ("Hata günlüğü", "İşaret klasörü" düğmeleri).
//! Komut katmanı ince kalsın diye ayrı (`commands.rs` yalnızca çağırır).

/// Windows'un kendi programının tam yolu (`%SystemRoot%\…`). Göreli ad önce programın kendi
/// klasöründe aranır: oradaki aynı adlı bir dosya ya da PATH'teki başka bir program çalışmasın.
#[cfg(windows)]
pub fn system_program(relative: &str) -> std::path::PathBuf {
    let root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
    std::path::Path::new(&root).join(relative)
}

/// Klasörü dosya gezgininde açar.
#[cfg(windows)]
pub fn open_folder(dir: &std::path::Path) -> std::io::Result<()> {
    std::process::Command::new(system_program("explorer.exe"))
        .arg(dir)
        .spawn()
        .map(|_| ())
}

#[cfg(not(windows))]
pub fn open_folder(dir: &std::path::Path) -> std::io::Result<()> {
    std::process::Command::new("xdg-open")
        .arg(dir)
        .spawn()
        .map(|_| ())
}

/// Dosyayı dosya gezgininde seçili gösterir (Linux'ta klasörünü açar).
#[cfg(windows)]
pub fn reveal(path: &std::path::Path) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    // Olduğu gibi verilir: `arg` boşluklu yolu bütünüyle tırnaklardı.
    std::process::Command::new(system_program("explorer.exe"))
        .raw_arg(select_argument(path))
        .spawn()
        .map(|_| ())
}

/// `explorer /select,"<dosya>"`: klasörü açar ve dosyayı seçili gösterir. Tırnak
/// yalnızca yolun çevresinde olmalı. Explorer bütünüyle tırnaklı `"/select,C:\…"`
/// biçimini anlamaz ve dosyayı seçmek yerine Belgeler'i açar. Kullanıcı adında
/// boşluk varsa ("C:\Users\Ali Veli\…") olan buydu. Windows yollarında `"` olmaz.
#[cfg(any(windows, test))]
fn select_argument(path: &std::path::Path) -> std::ffi::OsString {
    let mut argument = std::ffi::OsString::from("/select,\"");
    argument.push(path);
    argument.push("\"");
    argument
}

#[cfg(not(windows))]
pub fn reveal(path: &std::path::Path) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or(path);
    std::process::Command::new("xdg-open")
        .arg(dir)
        .spawn()
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gezginde_secme_yolu_bosluklu_kullanici_adinda_da_dogru() {
        let path = std::path::Path::new(r"C:\Users\Ali Veli\AppData\logs\lyraska.log");
        assert_eq!(
            select_argument(path),
            r#"/select,"C:\Users\Ali Veli\AppData\logs\lyraska.log""#
        );
    }
}
