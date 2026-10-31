//! Kütüphanenin arka plan analizi: henüz analiz edilmemiş (ya da dosyası değişmiş)
//! şarkılar tek tek analiz edilip önbelleğe yazılır. Analizin bir parçası eskimişse
//! (sürümü artmış) yalnızca o parça yenilenir ([`spectrogram::refresh_paced`]); yalnızca
//! ritmi eskimiş şarkılar (çözülmeden, milisaniyelerde yenilenir) önce gelir.
//!
//! Öncelik sırası: **çalan şarkı**, **sıradaki şarkı**, **geri kalan kütüphane**.
//! Çalan ve sıradaki şarkıyı oynatıcı kendisi, tam hızla analiz eder (sıradaki,
//! çalanınki bitince başlar). Bu iş parçacığı yalnızca geri kalanlara bakar ve
//! düşük önceliklidir: oynatıcının analizi sürerken hiç çalışmaz, kendi işinde de
//! zamanının yarısında bekler; böylece işlemcinin en fazla bir çekirdeğinin
//! yarısını kullanır ve ses ya da görüntü hiç etkilenmez.
//!
//! **Çökme döngüsü koruması** ([`CrashGuard`]): sürüm derlemesi panikte kapanır
//! (`panic = "abort"`). Analizi programı kapatan bir dosya kütüphanede kalsaydı, program her
//! açılışta aynı dosyaya gelip yeniden kapanırdı. Analiz edilen dosya diske yazılır; program o
//! dosyanın analizinde iki kez kapanırsa dosya atlanır (dosya değişince yeniden denenir). Kütüphane
//! taraması da (etiket okuma) aynı korumayı kendi izleriyle kullanır (`tarama-…`).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use super::cache::{AnalysisCache, FileStamp};
use super::spectrogram::{self, Spectrogram};
use crate::audio::decode::Decoder;
use crate::diagnostics;

/// Bekleyen şarkı yokken veritabanına bu aralıkla yeniden bakılır (yeni tarama vb.).
const IDLE_POLL: Duration = Duration::from_secs(15);
/// Oynatıcının analizi sürerken bu aralıkla yeniden bakılır.
const FOREGROUND_POLL: Duration = Duration::from_millis(100);
/// Çalışılan her sürenin bu katı kadar beklenir (1,0: zamanın yarısı iş, yarısı bekleme).
const REST_PER_WORK: f64 = 1.0;
/// Beklemeler bu kadar iş biriktikçe yapılır (çok kısa uykular işletim sistemini yorar).
const PACE_SLICE: Duration = Duration::from_millis(20);
/// Veritabanından bir seferde alınan şarkı sayısı.
const BATCH: usize = 16;
/// Bir dosya, analizinde program bu kadar kez kapandıysa atlanır. Bir kez yetmez: kullanıcı
/// programı Görev Yöneticisi'nden kapatmış ya da elektrik kesilmiş olabilir.
const CRASH_STRIKES: u32 = 2;

/// Programı kapatan dosyaların diskteki izi (bkz. modül belgesi). Arka plan analizi ve kütüphane
/// taraması kullanır; ikisinin izleri ayrı adlarla tutulur (`analiz-…`, `tarama-…`). Paralel
/// işçiler kendi "yuvalarına" yazar: her işçinin o an okuduğu dosya ayrı bir izde durur.
#[derive(Debug, Clone)]
pub struct CrashGuard {
    dir: Option<PathBuf>,
    name: &'static str,
}

impl CrashGuard {
    /// Arka plan analizinin koruması. `dir`: kütüphanenin klasörü (izler `analiz-suruyor.txt` ve
    /// `analiz-atla.txt`).
    pub fn new(dir: PathBuf) -> Self {
        Self::named(dir, "analiz")
    }

    /// `name` önadıyla izler (`<name>-suruyor[-N].txt`, `<name>-atla.txt`).
    pub fn named(dir: PathBuf, name: &'static str) -> Self {
        // İzler eşitlemesiz ve tek yazmayla yazılır (her dosyada); klasör baştan hazır olsun.
        let _ = std::fs::create_dir_all(&dir);
        Self {
            dir: Some(dir),
            name,
        }
    }

    /// İz tutulmaz (testler, klasörü olmayan önbellek).
    pub fn disabled() -> Self {
        Self {
            dir: None,
            name: "analiz",
        }
    }

    /// Yuvanın "sürüyor" izi: 0 eski adıyla (`<name>-suruyor.txt`), diğerleri numaralı.
    fn current(&self, slot: usize) -> Option<PathBuf> {
        let file = if slot == 0 {
            format!("{}-suruyor.txt", self.name)
        } else {
            format!("{}-suruyor-{slot}.txt", self.name)
        };
        Some(self.dir.as_ref()?.join(file))
    }

    /// Açılışta: önceki oturum bir dosyada kapandıysa o dosyanın sayacı artar. Döner: atlanacak
    /// dosyalar (sayacı sınıra ulaşanlar, yol + damga).
    pub fn recover(&self) -> HashSet<(PathBuf, FileStamp)> {
        let Some(dir) = self.dir.as_ref() else {
            return HashSet::new();
        };
        let skip_file = dir.join(format!("{}-atla.txt", self.name));
        let mut strikes = read_strikes(&skip_file);
        let prefix = format!("{}-suruyor", self.name);
        let traces: Vec<PathBuf> = std::fs::read_dir(dir)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.path())
                    .filter(|path| {
                        path.file_name()
                            .and_then(|n| n.to_str())
                            .is_some_and(|n| n.starts_with(&prefix) && n.ends_with(".txt"))
                    })
                    .collect()
            })
            .unwrap_or_default();
        for trace in &traces {
            let Some(crashed) = std::fs::read_to_string(trace)
                .ok()
                .and_then(|text| parse_entry(text.trim()))
            else {
                let _ = std::fs::remove_file(trace);
                continue;
            };
            let count = strikes.entry(crashed.clone()).or_insert(0);
            *count += 1;
            diagnostics::error(&format!(
                "Önceki açılışta program şu dosyada kapandı ({}, {}. kez): {}{}",
                self.name,
                count,
                crashed.0.display(),
                if *count >= CRASH_STRIKES {
                    "; bu dosya artık atlanacak (dosya değişirse yeniden denenir)"
                } else {
                    ""
                }
            ));
            let _ = std::fs::remove_file(trace);
        }
        if !traces.is_empty() {
            let text: String = strikes
                .iter()
                .map(|((path, stamp), n)| {
                    format!(
                        "{n}\t{}\t{}\t{}\n",
                        stamp.size,
                        stamp.modified,
                        path.display()
                    )
                })
                .collect();
            let _ = crate::atomic_file::write(&skip_file, text.as_bytes());
        }
        strikes
            .into_iter()
            .filter(|(_, n)| *n >= CRASH_STRIKES)
            .map(|(entry, _)| entry)
            .collect()
    }

    /// Yuvadaki işçi bu dosyayı okumaya başlıyor. Diske eşitleme (`sync_all`) yapılmaz: korunan
    /// durum programın kapanmasıdır, işletim sistemininki değil; yazılan iz kaybolmaz.
    pub fn begin_slot(&self, slot: usize, path: &Path, stamp: FileStamp) {
        if let Some(current) = self.current(slot) {
            let line = format!("{}\t{}\t{}", stamp.size, stamp.modified, path.display());
            let _ = std::fs::write(&current, line.as_bytes());
        }
    }

    /// Yuvadaki işçi dosyayı bitirdi (başarılı ya da değil): program bu dosyada kapanmadı.
    pub fn end_slot(&self, slot: usize) {
        if let Some(current) = self.current(slot) {
            let _ = std::fs::remove_file(current);
        }
    }

    /// Dosyanın analizi başlıyor.
    fn begin(&self, path: &Path, stamp: FileStamp) {
        self.begin_slot(0, path, stamp);
    }

    /// Analiz bitti (başarılı ya da değil): program bu dosyada kapanmadı.
    fn end(&self) {
        self.end_slot(0);
    }
}

fn parse_entry(line: &str) -> Option<(PathBuf, FileStamp)> {
    let mut parts = line.splitn(3, '\t');
    let size = parts.next()?.parse().ok()?;
    let modified = parts.next()?.parse().ok()?;
    let path = PathBuf::from(parts.next()?);
    Some((path, FileStamp { size, modified }))
}

fn read_strikes(path: &Path) -> std::collections::HashMap<(PathBuf, FileStamp), u32> {
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            let (count, rest) = line.split_once('\t')?;
            Some((parse_entry(rest)?, count.parse().ok()?))
        })
        .collect()
}

/// Oynatıcının o an süren analizlerinin sayacı. Analiz iş parçacığı başlarken
/// artırır, biterken (bu nesne düşünce) azaltır.
pub struct ForegroundGuard(Arc<AtomicUsize>);

impl ForegroundGuard {
    pub fn new(counter: &Arc<AtomicUsize>) -> Self {
        counter.fetch_add(1, Ordering::AcqRel);
        Self(Arc::clone(counter))
    }
}

impl Drop for ForegroundGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

struct Shared {
    stop: AtomicBool,
    /// Uyandırma işareti (yeni şarkılar eklendi).
    wake: Mutex<bool>,
    signal: Condvar,
    /// Bu oturumda arka planda analiz edilen şarkı sayısı.
    analyzed: AtomicUsize,
}

/// Arka plan analizi. Program kapanırken [`BackgroundAnalysis::stop`] çağrılır.
pub struct BackgroundAnalysis {
    shared: Arc<Shared>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl BackgroundAnalysis {
    /// Arka plan analizini başlatır. `foreground`: oynatıcının süren analiz sayısı.
    pub fn start(
        cache: Arc<AnalysisCache>,
        foreground: Arc<AtomicUsize>,
        guard: CrashGuard,
    ) -> Self {
        let shared = Arc::new(Shared {
            stop: AtomicBool::new(false),
            wake: Mutex::new(false),
            signal: Condvar::new(),
            analyzed: AtomicUsize::new(0),
        });
        let worker = Arc::clone(&shared);
        let thread = std::thread::Builder::new()
            .name("lyraska-arka-plan-analiz".to_owned())
            .spawn(move || run(&cache, &foreground, &worker, &guard))
            .map_err(|e| diagnostics::error(&format!("Arka plan analizi başlatılamadı: {e}")))
            .ok();
        Self {
            shared,
            thread: Mutex::new(thread),
        }
    }

    /// Yeni şarkılar eklendiğinde beklemeden bakması için uyandırır.
    pub fn wake(&self) {
        if let Ok(mut wake) = self.shared.wake.lock() {
            *wake = true;
            self.shared.signal.notify_all();
        }
    }

    /// Bu oturumda arka planda analiz edilen şarkı sayısı.
    pub fn analyzed(&self) -> usize {
        self.shared.analyzed.load(Ordering::Acquire)
    }

    /// Durdurur ve iş parçacığının bitmesini bekler (süren analiz yarıda kesilir).
    pub fn stop(&self) {
        self.shared.stop.store(true, Ordering::Release);
        self.wake();
        let thread = self.thread.lock().ok().and_then(|mut t| t.take());
        if let Some(thread) = thread {
            let _ = thread.join();
        }
    }
}

impl Drop for BackgroundAnalysis {
    fn drop(&mut self) {
        self.stop();
    }
}

fn run(cache: &AnalysisCache, foreground: &AtomicUsize, shared: &Shared, guard: &CrashGuard) {
    // Bu tarama kaydıyla (yol + kütüphanedeki damga) bir daha denenmeyecek şarkılar:
    // açılamayanlar ve taramadan sonra diskte değişenler. Değişen şarkının analizi
    // diskteki damgayla kaydedilir (oynatıcı onu kullanır); ama kütüphane kaydı
    // yeniden taranana kadar "bekliyor" görünür ve yoksa tekrar tekrar analiz edilirdi.
    // Önceki açılışlarda programı kapatan dosyalar da baştan atlanır.
    let mut skip: HashSet<(PathBuf, FileStamp)> = guard.recover();
    while !shared.stop.load(Ordering::Acquire) {
        let batch: Vec<(PathBuf, FileStamp)> =
            match cache.pending_library_tracks(BATCH + skip.len()) {
                Ok(tracks) => tracks.into_iter().filter(|t| !skip.contains(t)).collect(),
                Err(e) => {
                    diagnostics::error(&e.to_string());
                    Vec::new()
                }
            };
        if batch.is_empty() {
            idle(shared);
            continue;
        }
        for (path, library_stamp) in batch.into_iter().take(BATCH) {
            if shared.stop.load(Ordering::Acquire) {
                return;
            }
            wait_for_foreground(foreground, shared);
            guard.begin(&path, library_stamp);
            let outcome = analyze_one(&path, cache, foreground, shared);
            guard.end();
            match outcome {
                Outcome::Stored(stamp) => {
                    shared.analyzed.fetch_add(1, Ordering::AcqRel);
                    if stamp != library_stamp {
                        skip.insert((path, library_stamp));
                    }
                }
                Outcome::Failed => {
                    skip.insert((path, library_stamp));
                }
                Outcome::Interrupted => {}
            }
        }
    }
}

/// Bekleyen iş yokken uyandırılana ya da `IDLE_POLL` dolana kadar bekler.
fn idle(shared: &Shared) {
    let Ok(wake) = shared.wake.lock() else {
        return;
    };
    let wake = shared.signal.wait_timeout_while(wake, IDLE_POLL, |w| {
        !*w && !shared.stop.load(Ordering::Acquire)
    });
    if let Ok((mut wake, _)) = wake {
        *wake = false;
    }
}

fn wait_for_foreground(foreground: &AtomicUsize, shared: &Shared) {
    while foreground.load(Ordering::Acquire) > 0 && !shared.stop.load(Ordering::Acquire) {
        std::thread::sleep(FOREGROUND_POLL);
    }
}

enum Outcome {
    /// Analiz bu damgayla (dosyanın analiz edilen hâli) kaydedildi.
    Stored(FileStamp),
    Failed,
    /// Program kapanıyor; şarkı sonra yeniden denenir.
    Interrupted,
}

fn analyze_one(
    path: &Path,
    cache: &AnalysisCache,
    foreground: &AtomicUsize,
    shared: &Shared,
) -> Outcome {
    let Some(stamp) = FileStamp::of(path) else {
        return Outcome::Failed;
    };
    let target = Spectrogram::new();
    let mut pacer = Pacer::new();
    let mut pace = || {
        if shared.stop.load(Ordering::Acquire) {
            target.cancel();
            return;
        }
        pacer.pace(foreground, shared);
    };
    let cached = match cache.load(path, stamp) {
        Ok(cached) => cached,
        Err(e) => {
            diagnostics::error(&e.to_string());
            None
        }
    };
    match cached {
        // Yalnızca eskimiş parçalar: ritim karelerden (çözmeden), ses yüksekliği ve bas
        // tepeleri FFT'siz tek çözmeyle.
        Some(cached) => {
            let mut open = || Decoder::open(path).ok();
            spectrogram::refresh_paced(cached, &mut open, &target, &mut pace);
        }
        None => {
            let Ok(decoder) = Decoder::open(path) else {
                return Outcome::Failed;
            };
            spectrogram::analyze_paced(decoder, &target, &mut pace);
        }
    }
    let Some(saved) = target.saved() else {
        return if shared.stop.load(Ordering::Acquire) {
            Outcome::Interrupted
        } else {
            Outcome::Failed
        };
    };
    // Analiz sürerken dosya değiştiyse sonuç eskidir; bir sonraki turda yeniden denenir.
    if FileStamp::of(path) != Some(stamp) {
        return Outcome::Interrupted;
    }
    match cache.store(path, stamp, &saved) {
        Ok(()) => Outcome::Stored(stamp),
        Err(e) => {
            diagnostics::error(&e.to_string());
            Outcome::Failed
        }
    }
}

/// İş ve bekleme sürelerini dengeler; oynatıcının analizi başlarsa onu bekler.
struct Pacer {
    since: Instant,
    worked: Duration,
}

impl Pacer {
    fn new() -> Self {
        Self {
            since: Instant::now(),
            worked: Duration::ZERO,
        }
    }

    fn pace(&mut self, foreground: &AtomicUsize, shared: &Shared) {
        self.worked += self.since.elapsed();
        if foreground.load(Ordering::Acquire) > 0 {
            wait_for_foreground(foreground, shared);
            self.worked = Duration::ZERO;
        } else if self.worked >= PACE_SLICE {
            std::thread::sleep(self.worked.mul_f64(REST_PER_WORK));
            self.worked = Duration::ZERO;
        }
        self.since = Instant::now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::temp_path;
    use crate::library::LibraryService;

    fn wait_until(mut condition: impl FnMut() -> bool, seconds: u64) -> bool {
        let deadline = Instant::now() + Duration::from_secs(seconds);
        while Instant::now() < deadline {
            if condition() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        condition()
    }

    /// Test verisindeki şarkıları içeren, taranmış bir kütüphane ve aynı dosyada önbellek.
    fn library_with_songs() -> (LibraryService, Arc<AnalysisCache>, Vec<PathBuf>) {
        let dir = temp_path("arka-plan-muzik");
        std::fs::create_dir_all(&dir).unwrap();
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data");
        let mut songs = Vec::new();
        for ext in ["mp3", "flac", "ogg"] {
            let name = format!("uc-uc-ton.{ext}");
            std::fs::copy(data.join(&name), dir.join(&name)).unwrap();
            songs.push(dir.join(name));
        }
        // Çözülemeyen dosya: sonsuza dek yeniden denenmemeli.
        std::fs::write(dir.join("bozuk.mp3"), b"ses degil").unwrap();
        let db = dir.join("library.sqlite3");
        let service = LibraryService::open(&db).unwrap();
        service.add_folder(&dir).unwrap();
        assert!(wait_until(|| !service.is_scanning(), 10));
        let cache = Arc::new(AnalysisCache::open(&db).unwrap());
        (service, cache, songs)
    }

    #[test]
    fn kutuphane_arka_planda_analiz_edilip_onbellege_yazilir() {
        let (service, cache, songs) = library_with_songs();
        assert_eq!(service.status().unwrap().analyzed, 0);
        let foreground = Arc::new(AtomicUsize::new(0));
        let background =
            BackgroundAnalysis::start(Arc::clone(&cache), foreground, CrashGuard::disabled());
        assert!(wait_until(|| background.analyzed() == songs.len(), 30));
        for song in &songs {
            let saved = cache.load(song, FileStamp::of(song).unwrap()).unwrap();
            assert!(
                saved.is_some_and(|s| s.saved.frames() > 100 && !s.stale.any()),
                "{song:?} önbellekte yok"
            );
        }
        // Bozuk dosya bekleyenlerde kalır ama yeniden denenmez; analiz sayısı artmaz.
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(background.analyzed(), songs.len());
        assert_eq!(service.status().unwrap().analyzed, songs.len());
        background.stop();
    }

    #[test]
    fn tonsuz_eski_kayitlarda_yalnizca_ton_hesaplanir() {
        let (service, cache, songs) = library_with_songs();
        let foreground = Arc::new(AtomicUsize::new(0));
        let background = BackgroundAnalysis::start(
            Arc::clone(&cache),
            Arc::clone(&foreground),
            CrashGuard::disabled(),
        );
        assert!(wait_until(|| background.analyzed() == songs.len(), 30));
        background.stop();
        let before: Vec<_> = songs
            .iter()
            .map(|s| cache.load(s, FileStamp::of(s).unwrap()).unwrap().unwrap())
            .collect();
        assert!(before.iter().all(|c| c.saved.key.is_some()));

        // Ton parçası eklenmeden önceki sürümün kayıtları (göç 7'den sonraki hâli).
        cache
            .lock_for_test()
            .execute(
                "UPDATE analyses SET key_version = 0, chroma = NULL, musical_key = NULL,
                     camelot = NULL",
                [],
            )
            .unwrap();
        assert_eq!(service.status().unwrap().analyzed, 0);
        let background =
            BackgroundAnalysis::start(Arc::clone(&cache), foreground, CrashGuard::disabled());
        assert!(wait_until(|| background.analyzed() == songs.len(), 30));
        for (song, old) in songs.iter().zip(&before) {
            let now = cache
                .load(song, FileStamp::of(song).unwrap())
                .unwrap()
                .unwrap();
            assert!(!now.stale.any(), "{song:?} yenilendi");
            // Kareler ve diğer parçalar dokunulmadan kaldı; ton aynı hesaplandı.
            assert_eq!(now.saved, old.saved, "{song:?}");
        }
        assert_eq!(service.status().unwrap().analyzed, songs.len());
        background.stop();
    }

    #[test]
    fn ritim_hesabi_degisince_yalnizca_ritim_yenilenir() {
        let (service, cache, songs) = library_with_songs();
        let foreground = Arc::new(AtomicUsize::new(0));
        let background = BackgroundAnalysis::start(
            Arc::clone(&cache),
            Arc::clone(&foreground),
            CrashGuard::disabled(),
        );
        assert!(wait_until(|| background.analyzed() == songs.len(), 30));
        background.stop();
        let before: Vec<_> = songs
            .iter()
            .map(|s| cache.load(s, FileStamp::of(s).unwrap()).unwrap().unwrap())
            .collect();

        // Yeni sürümde ritim hesabı değişti (ör. drop güveni eklendi): kayıtlar "ritmi eski".
        cache
            .lock_for_test()
            .execute(
                "UPDATE analyses SET rhythm_version = rhythm_version - 1",
                [],
            )
            .unwrap();
        assert_eq!(service.status().unwrap().analyzed, 0);
        let background =
            BackgroundAnalysis::start(Arc::clone(&cache), foreground, CrashGuard::disabled());
        assert!(wait_until(|| background.analyzed() == songs.len(), 30));
        for (song, old) in songs.iter().zip(&before) {
            let now = cache
                .load(song, FileStamp::of(song).unwrap())
                .unwrap()
                .unwrap();
            assert!(!now.stale.any(), "{song:?} yenilendi");
            // Kareler, ses yüksekliği ve bas tepeleri dokunulmadan kaldı; ritim aynı hesaplandı.
            assert_eq!(now.saved, old.saved, "{song:?}");
        }
        assert_eq!(service.status().unwrap().analyzed, songs.len());
        background.stop();
    }

    #[test]
    fn taramadan_sonra_degisen_dosya_dongude_yeniden_analiz_edilmez() {
        let (_service, cache, songs) = library_with_songs();
        // Program açıkken şarkının etiketi başka bir programla düzenlendi: diskteki
        // damga kütüphanenin (son taramanın) damgasından farklı.
        let file = std::fs::File::options()
            .write(true)
            .open(&songs[0])
            .unwrap();
        file.set_modified(std::time::UNIX_EPOCH + Duration::from_secs(1_000_000))
            .unwrap();
        drop(file);

        let foreground = Arc::new(AtomicUsize::new(0));
        let background =
            BackgroundAnalysis::start(Arc::clone(&cache), foreground, CrashGuard::disabled());
        assert!(wait_until(|| background.analyzed() >= songs.len(), 30));
        std::thread::sleep(Duration::from_millis(600));
        assert_eq!(
            background.analyzed(),
            songs.len(),
            "aynı şarkı döngüde yeniden analiz edildi"
        );
        // Oynatıcı açınca diskteki damgayla önbellekten bulunur (iş boşa gitmez).
        let stamp = FileStamp::of(&songs[0]).unwrap();
        assert!(cache.load(&songs[0], stamp).unwrap().is_some());
        background.stop();
    }

    #[test]
    fn calan_sarkinin_analizi_surerken_beklenir() {
        let (_service, cache, songs) = library_with_songs();
        let foreground = Arc::new(AtomicUsize::new(0));
        let busy = ForegroundGuard::new(&foreground);
        let background = BackgroundAnalysis::start(
            Arc::clone(&cache),
            Arc::clone(&foreground),
            CrashGuard::disabled(),
        );
        std::thread::sleep(Duration::from_millis(400));
        assert_eq!(
            background.analyzed(),
            0,
            "oynatıcı analiz ederken arka plan bekler"
        );
        drop(busy);
        assert!(wait_until(|| background.analyzed() == songs.len(), 30));
        assert_eq!(foreground.load(Ordering::Acquire), 0);
    }

    #[test]
    fn durdurunca_hemen_biter() {
        let (_service, cache, _songs) = library_with_songs();
        let foreground = Arc::new(AtomicUsize::new(1)); // hep meşgul: iş parçacığı bekliyor
        let background = BackgroundAnalysis::start(cache, foreground, CrashGuard::disabled());
        std::thread::sleep(Duration::from_millis(50));
        let started = Instant::now();
        background.stop();
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn programi_iki_kez_kapatan_dosya_atlanir_degisince_yeniden_denenir() {
        let dir = temp_path("cokme-izi");
        let guard = CrashGuard::new(dir.clone());
        let stamp = FileStamp {
            size: 10,
            modified: 20,
        };
        let path = PathBuf::from("C:\\Müzik\\bozuk.wav");

        // 1. açılış: analiz sürerken program kapandı (iz kaldı).
        guard.begin(&path, stamp);
        assert!(
            guard.recover().is_empty(),
            "bir kez yetmez (elle kapatma olabilir)"
        );
        // 2. açılış: yine aynı dosyada kapandı.
        guard.begin(&path, stamp);
        let skip = guard.recover();
        assert!(skip.contains(&(path.clone(), stamp)));
        // Sonraki açılışlarda da atlanır; iz yokken sayaç artmaz.
        assert_eq!(guard.recover(), skip);
        // Dosya değişti (başka damga): yeniden denenir.
        assert!(!skip.contains(&(
            path.clone(),
            FileStamp {
                size: 11,
                modified: 20
            }
        )));

        // Düzgün biten analiz iz bırakmaz.
        let other = PathBuf::from("C:\\Müzik\\iyi.flac");
        guard.begin(&other, stamp);
        guard.end();
        assert!(!guard.recover().iter().any(|(p, _)| p == &other));
    }
}
