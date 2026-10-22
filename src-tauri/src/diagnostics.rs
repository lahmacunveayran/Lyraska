//! Yerel hata ve çökme günlüğü.
//!
//! Program uygulama veri klasöründe `logs/lyraska.log` dosyasına yazar: açılış
//! bilgisi (sürüm, derleme kodu, Windows sürümü), kullanıcıya gösterilen hatalar, ses
//! motorunun hataları ve çökmeler (panic: mesaj, yer, adresli yığın izi). Dosya hiçbir
//! yere gönderilmez; kullanıcı "Hata günlüğü" düğmesiyle açıp hata kaydına ekler.
//!
//! Günlük Tauri'den **önce** açılır (`lib.rs`): pencere ya da WebView2 açılamazsa Tauri panikler,
//! o çökme de yazılır. Açılış tamamlanmadan gelen bir çökmede Windows'ta kullanıcıya bir uyarı
//! kutusu gösterilir (konsolsuz programda başka hiçbir iz kalmazdı).
//!
//! Yığın izi, sürüm derlemesinde (semboller ayrı `.pdb`'de) adreslerle yazılır; açılış satırındaki
//! başvuru adresi (`run` fonksiyonunun bellekteki yeri) ile adresler `.pdb`'deki yerlere çevrilir.
//!
//! Dosya 1 MB'ı geçince `lyraska.1.log` adıyla saklanır ve yenisi başlar
//! (en fazla ~2 MB yer kaplar).
//!
//! Ses çıkış iş parçacığının gerçek zamanlı döngüsünden **çağrılmaz** (dosya
//! erişimi ve kilit içerir).

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Dosya bu boyutu geçince eskisi yedeklenir.
const MAX_LOG_BYTES: u64 = 1024 * 1024;
const LOG_NAME: &str = "lyraska.log";
const OLD_LOG_NAME: &str = "lyraska.1.log";

struct Log {
    path: PathBuf,
    file: File,
}

static LOG: Mutex<Option<Log>> = Mutex::new(None);
/// Açılış tamamlandı mı (pencere açıldı, kurulum bitti)? Öncesindeki çökme kullanıcıya gösterilir.
static STARTED: AtomicBool = AtomicBool::new(false);

/// Günlüğü açar, açılış satırını yazar ve çökme yakalayıcıyı kurar.
pub fn init(dir: &Path) {
    let path = dir.join(LOG_NAME);
    if let Err(error) = open(&path) {
        eprintln!("Hata günlüğü açılamadı ({}): {error}", path.display());
        return;
    }
    info(&format!(
        "Lyraska {} · derleme {} başladı · {} · {} · başvuru adresi run={:p}",
        env!("CARGO_PKG_VERSION"),
        env!("LYRASKA_BUILD_COMMIT"),
        os_version(),
        std::env::consts::ARCH,
        crate::run as fn(),
    ));
    install_panic_hook();
}

/// Açılış tamamlandı: bundan sonraki çökmeler yalnızca günlüğe yazılır.
pub fn mark_started() {
    STARTED.store(true, Ordering::Release);
}

/// İşletim sistemi ve sürümü (Windows'ta ör. "Microsoft Windows [Version 10.0.22631.4602]").
fn os_version() -> String {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: konsol penceresi bir an bile görünmesin.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let output = std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        if let Ok(output) = output {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            if !text.is_empty() {
                return text;
            }
        }
    }
    std::env::consts::OS.to_owned()
}

/// Günlük dosyasının yolu (açılamadıysa `None`).
pub fn log_path() -> Option<PathBuf> {
    LOG.lock().ok()?.as_ref().map(|log| log.path.clone())
}

pub fn info(message: &str) {
    write("BİLGİ", message);
}

pub fn error(message: &str) {
    write("HATA", message);
}

fn open(path: &Path) -> std::io::Result<()> {
    let log = Log::open(path)?;
    if let Ok(mut current) = LOG.lock() {
        *current = Some(log);
    }
    Ok(())
}

impl Log {
    /// Dosyayı açar (yoksa oluşturur); sınırı aşmışsa önce yedekler.
    fn open(path: &Path) -> std::io::Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        rotate_if_large(path);
        let file = OpenOptions::new().create(true).append(true).open(path)?;
        Ok(Self {
            path: path.to_path_buf(),
            file,
        })
    }

    /// Satırı yazar. Uzun süre açık kalan programda da dosya sınırı aşılmasın diye
    /// gerekirse önce yedekler; yedekleme olmazsa (ör. eski yedek kilitli) aynı
    /// dosyaya yazmayı sürdürür: günlük yüzünden program asla çökmez.
    fn write_line(&mut self, line: &str) {
        if self.file.metadata().is_ok_and(|m| m.len() > MAX_LOG_BYTES) {
            if let Ok(fresh) = Self::open(&self.path) {
                *self = fresh;
            }
        }
        let _ = self.file.write_all(line.as_bytes());
        let _ = self.file.flush();
    }
}

fn rotate_if_large(path: &Path) {
    let large = std::fs::metadata(path).is_ok_and(|m| m.len() > MAX_LOG_BYTES);
    if large {
        let _ = std::fs::rename(path, path.with_file_name(OLD_LOG_NAME));
    }
}

fn write(level: &str, message: &str) {
    let Ok(mut guard) = LOG.lock() else {
        return;
    };
    let Some(log) = guard.as_mut() else {
        return;
    };
    log.write_line(&format!(
        "{} [{level}] {}\n",
        timestamp(),
        message.trim_end()
    ));
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_owned())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "bilinmeyen".to_owned());
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_default();
        let thread = std::thread::current();
        let backtrace = std::backtrace::Backtrace::force_capture();
        // `{:#}`: sembol yoksa da adresler yazılır (`{}` yalnızca "<unknown>" yazar).
        write(
            "ÇÖKME",
            &format!(
                "iş parçacığı \"{}\": {message} ({location})\n{backtrace:#}",
                thread.name().unwrap_or("adsız")
            ),
        );
        if !STARTED.load(Ordering::Acquire) {
            startup_failure_dialog(&message);
        }
        previous(info);
    }));
}

/// Açılışta çöken programın kullanıcıya tek izi: neden ve günlüğün yeri (Windows uyarı kutusu).
fn startup_failure_dialog(message: &str) {
    let log = log_path()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "(günlük açılamadı)".to_owned());
    let text = format!(
        "Lyraska açılamadı.\n\n{message}\n\nAyrıntılar hata günlüğünde:\n{log}\n\n\
         Hata kaydı açarken bu dosyayı ekleyin. Microsoft Edge WebView2 kurulu değilse ya da \
         bozulduysa Lyraska'yı yeniden kurmak onu da kurar."
    );
    notice_dialog(&text, true);
}

/// Pencere olmadan kullanıcıya ileti kutusu (Windows): açılışta çökme ya da ikinci kopya.
/// Windows'un kendi PowerShell'i ileti kutusunu gösterir; metin komut satırına değil ortam
/// değişkenine konur (içindeki tırnak ya da işaretler komut olarak yorumlanamaz). `unsafe` ve
/// ek bağımlılık gerekmez; tek bedeli kutunun bir saniye kadar geç açılması. Kutu kapanana kadar
/// beklenir.
pub fn notice_dialog(text: &str, error: bool) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let script = "Add-Type -AssemblyName System.Windows.Forms; \
            [void][System.Windows.Forms.MessageBox]::Show($env:LYRASKA_NOTICE, 'Lyraska', 'OK', \
            $env:LYRASKA_NOTICE_ICON)";
        // Tam yol: PATH'e ve programın kendi klasöründeki aynı adlı bir dosyaya güvenilmez.
        let system_root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
        let powershell = std::path::Path::new(&system_root)
            .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
        let _ = std::process::Command::new(powershell)
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("LYRASKA_NOTICE", text)
            .env(
                "LYRASKA_NOTICE_ICON",
                if error { "Error" } else { "Information" },
            )
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = error;
        eprintln!("{text}");
    }
}

/// "2026-10-08 06:45:12 UTC" (saat dilimi kütüphanesi kullanmadan).
pub fn timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format_utc(secs)
}

fn format_utc(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rest = secs % 86_400;
    // Howard Hinnant'ın "civil_from_days" algoritması.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tarih_bicimi() {
        assert_eq!(format_utc(0), "1970-01-01 00:00:00 UTC");
        assert_eq!(format_utc(1_791_441_912), "2026-10-08 06:45:12 UTC");
        assert_eq!(format_utc(951_782_400), "2000-02-29 00:00:00 UTC");
    }

    #[test]
    fn gunluk_yazar_buyuyunce_yedekler_ve_cokmeyi_kaydeder() {
        // Günlük tek bir genel nesne: bu test hepsini sırayla dener.
        let dir = crate::audio::test_util::temp_path("gunluk").with_extension("");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(LOG_NAME);
        // Büyük eski dosya açılışta yedeklenir.
        std::fs::write(&path, vec![b'x'; MAX_LOG_BYTES as usize + 10]).unwrap();
        init(&dir);
        assert!(dir.join(OLD_LOG_NAME).exists());
        assert_eq!(log_path().unwrap(), path);

        error("Şarkı açılamadı: deneme.mp3");
        let result = std::panic::catch_unwind(|| panic!("deneme çökmesi"));
        assert!(result.is_err());
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("[BİLGİ] Lyraska"), "{text}");
        assert!(
            text.contains("[HATA] Şarkı açılamadı: deneme.mp3"),
            "{text}"
        );
        assert!(
            text.contains("[ÇÖKME]") && text.contains("deneme çökmesi"),
            "{text}"
        );
        assert!(text.contains("diagnostics.rs"), "çökmenin yeri yazılır");
        let _ = std::panic::take_hook();

        // Yedekleme olmuyorsa (ör. eski yedek kilitli) program çökmemeli, yazmayı
        // sürdürmeli. Burada yedeğin yerinde boş olmayan bir klasör var.
        std::fs::remove_file(dir.join(OLD_LOG_NAME)).unwrap();
        std::fs::create_dir_all(dir.join(OLD_LOG_NAME).join("kilitli")).unwrap();
        let big = "x".repeat(MAX_LOG_BYTES as usize);
        info(&big);
        info("yedeklenemese de yazılır");
        // Günlük süreç genelinde tek: paralel testler (göç, oynatıcı) araya ya da ardına satır
        // yazabilir (CI'da yazdılar). Bu yüzden son satıra değil, satırın büyük bloktan sonra
        // aynı dosyada olmasına bakılır; ardından gelen bir satır da bunu bozmaz.
        error("paralel bir testin satırı");
        let text = std::fs::read_to_string(&path).unwrap();
        let block = text.find(&big).expect("büyük blok aynı dosyada kalır");
        let line = text.find("yedeklenemese de yazılır\n");
        let tail: Vec<&str> = text.lines().rev().take(3).collect();
        assert!(
            line.is_some_and(|at| at > block),
            "yedek alınamayınca da aynı dosyaya yazılmaya devam eder: {tail:?}"
        );
    }
}
