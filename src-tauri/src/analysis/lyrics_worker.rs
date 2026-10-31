//! Sözleri zamanlama işinin arka plan iş parçacığı ([`lyrics_job::align_track`]).
//!
//! İstek iki yerden gelir: kullanıcı zamansız söz kaydedince ve zamansız söz gösterilirken henüz
//! zamanlanmamışsa ([`LyricsWorker::show`]). Kuyrukta şarkı başına bir istek durur (son metin);
//! en son istenen önce yapılır (kullanıcının baktığı şarkı). İş bitince `on_done` çağrılır: arayüz
//! sözleri yeniden ister ve otomatik zamanlıyı alır.
//!
//! - **Düşük öncelik:** oynatıcının analizi sürerken iş başlamaz; model kendi iş parçacıklarıyla
//!   çalışır (çekirdeklerin yarısı, en çok 4; `lyrics_model`).
//! - **Model yalnızca gerekince:** kuyruk [`IDLE_RELEASE`] boyunca boş kalınca model bırakılır
//!   (~2,5 GB bellek). Açılamayan paket bu oturumda yeniden denenmez ([`ModelSlot`]).
//! - **Başarısızlık hatırlanır:** aynı dosya ve aynı metin için başarısız iş (çözülemeyen şarkı,
//!   kelimesiz söz…) bu oturumda yinelenmez; söz her gösterildiğinde model yeniden çalışmasın.
//! - **Çökme döngüsü koruması** ([`CrashGuard`], `soz-…` izleri): programı iki kez kapatan şarkı
//!   (ör. bellek yetmedi) atlanır; dosya değişince yeniden denenir.
//! - **Kapanış:** [`LyricsWorker::stop`] süren işi iptal eder (model pencereleri arasında).

use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use super::background::CrashGuard;
use super::cache::{AnalysisCache, FileStamp};
use super::lyrics_job::{align_track, text_sha256, with_auto, JobError, ModelSlot};
use super::lyrics_model::ModelError;
use crate::audio::lyrics::{Lyrics, LyricsText};
use crate::diagnostics;

/// Kuyruk bu kadar boş kalınca model bırakılır.
pub const IDLE_RELEASE: Duration = Duration::from_secs(60);
/// Oynatıcının analizi sürerken bu aralıkla yeniden bakılır.
const FOREGROUND_POLL: Duration = Duration::from_millis(100);
/// "Söz paketi"nin büyük veri klasöründeki yeri.
pub const PACKAGE_DIR: &str = "soz-paketi";

#[derive(Debug, Clone, PartialEq, Eq)]
struct Request {
    path: PathBuf,
    text: String,
}

/// Bekleyen istekler: şarkı başına bir tane, en son istenen önde.
#[derive(Debug, Default)]
struct Queue {
    pending: VecDeque<Request>,
}

impl Queue {
    fn push(&mut self, request: Request) {
        self.pending.retain(|r| r.path != request.path);
        self.pending.push_front(request);
    }

    fn pop(&mut self) -> Option<Request> {
        self.pending.pop_front()
    }
}

/// Bir işin bu oturumda yinelenmeyecek anahtarı: dosya, damgası ve metnin özeti.
type Key = (PathBuf, FileStamp, String);

struct Shared {
    stop: AtomicBool,
    queue: Mutex<Queue>,
    signal: Condvar,
    /// Başarısız işler (bkz. modül belgesi).
    failed: Mutex<HashSet<Key>>,
    /// Programı kapatan şarkılar (yol + damga; önceki açılışlardan).
    crashed: HashSet<(PathBuf, FileStamp)>,
    /// Biten iş sayısı (başarılı ya da değil; testler ve günlük için).
    finished: AtomicUsize,
    /// Model şu an bellekte mi (yuva iş parçacığında; testler için).
    loaded: AtomicBool,
}

/// Sözleri zamanlama iş parçacığı. Program kapanırken [`LyricsWorker::stop`] çağrılır.
pub struct LyricsWorker {
    shared: Arc<Shared>,
    cache: Arc<AnalysisCache>,
    model_sha256: String,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl LyricsWorker {
    /// `foreground`: oynatıcının süren analiz sayısı. `on_done`: bir şarkının sözü zamanlandı.
    pub fn start(
        cache: Arc<AnalysisCache>,
        slot: ModelSlot,
        foreground: Arc<AtomicUsize>,
        guard: CrashGuard,
        on_done: impl Fn(&Path) + Send + 'static,
    ) -> Self {
        Self::start_with(cache, slot, foreground, guard, IDLE_RELEASE, on_done)
    }

    fn start_with(
        cache: Arc<AnalysisCache>,
        slot: ModelSlot,
        foreground: Arc<AtomicUsize>,
        guard: CrashGuard,
        idle_release: Duration,
        on_done: impl Fn(&Path) + Send + 'static,
    ) -> Self {
        let shared = Arc::new(Shared {
            stop: AtomicBool::new(false),
            queue: Mutex::new(Queue::default()),
            signal: Condvar::new(),
            failed: Mutex::new(HashSet::new()),
            crashed: guard.recover(),
            finished: AtomicUsize::new(0),
            loaded: AtomicBool::new(false),
        });
        let model_sha256 = slot.model_sha256().to_owned();
        let worker = Arc::clone(&shared);
        let job_cache = Arc::clone(&cache);
        let thread = std::thread::Builder::new()
            .name("lyraska-soz-zamanlama".to_owned())
            .spawn(move || {
                let mut slot = slot;
                run(
                    &job_cache,
                    &mut slot,
                    &foreground,
                    &worker,
                    &guard,
                    idle_release,
                    &on_done,
                );
            })
            .map_err(|e| diagnostics::error(&format!("Söz zamanlama başlatılamadı: {e}")))
            .ok();
        Self {
            shared,
            cache,
            model_sha256,
            thread: Mutex::new(thread),
        }
    }

    /// Şarkının `text` sözünü zamanlama isteği. Bu oturumda aynı dosya ve metinle başarısız olduysa
    /// ya da şarkı programı kapattıysa yok sayılır.
    pub fn request(&self, path: &Path, text: &str) {
        if let Some(stamp) = FileStamp::of(path) {
            if self.shared.crashed.contains(&(path.to_path_buf(), stamp)) {
                return;
            }
            let key = (path.to_path_buf(), stamp, text_sha256(text));
            if self.shared.failed.lock().is_ok_and(|f| f.contains(&key)) {
                return;
            }
        }
        if let Ok(mut queue) = self.shared.queue.lock() {
            queue.push(Request {
                path: path.to_path_buf(),
                text: text.to_owned(),
            });
            self.shared.signal.notify_all();
        }
    }

    /// Ekranda gösterilecek sözler: zamansızsa otomatik zamanlısı (varsa); yoksa zamanlama istenir
    /// ve sözler olduğu gibi döner. `text`: sözlerin ham metni (`audio::lyrics::text_for_track`);
    /// yalnızca söz zamansızsa okunur.
    pub fn show(
        &self,
        path: &Path,
        lyrics: Option<Lyrics>,
        text: impl FnOnce() -> Option<LyricsText>,
    ) -> Option<Lyrics> {
        let lyrics = lyrics?;
        if lyrics.synced {
            return Some(lyrics);
        }
        let Some(text) = text() else {
            return Some(lyrics);
        };
        let shown = with_auto(&self.cache, path, lyrics, &text.text, &self.model_sha256);
        if !shown.synced {
            self.request(path, &text.text);
        }
        Some(shown)
    }

    /// Biten iş sayısı (başarılı ya da değil).
    pub fn finished(&self) -> usize {
        self.shared.finished.load(Ordering::Acquire)
    }

    /// Model şu an bellekte mi?
    pub fn model_loaded(&self) -> bool {
        self.shared.loaded.load(Ordering::Acquire)
    }

    /// Durdurur, süren işi iptal eder ve iş parçacığının bitmesini bekler.
    pub fn stop(&self) {
        self.shared.stop.store(true, Ordering::Release);
        if let Ok(_queue) = self.shared.queue.lock() {
            self.shared.signal.notify_all();
        }
        let thread = self.thread.lock().ok().and_then(|mut t| t.take());
        if let Some(thread) = thread {
            let _ = thread.join();
        }
    }
}

impl Drop for LyricsWorker {
    fn drop(&mut self) {
        self.stop();
    }
}

fn run(
    cache: &AnalysisCache,
    slot: &mut ModelSlot,
    foreground: &AtomicUsize,
    shared: &Shared,
    guard: &CrashGuard,
    idle_release: Duration,
    on_done: &dyn Fn(&Path),
) {
    while let Some(request) = next(shared, slot, idle_release) {
        while foreground.load(Ordering::Acquire) > 0 && !shared.stop.load(Ordering::Acquire) {
            std::thread::sleep(FOREGROUND_POLL);
        }
        if shared.stop.load(Ordering::Acquire) {
            return;
        }
        let Some(stamp) = FileStamp::of(&request.path) else {
            shared.finished.fetch_add(1, Ordering::AcqRel);
            continue;
        };
        guard.begin_slot(0, &request.path, stamp);
        let outcome = align_track(cache, &request.path, &request.text, slot, &shared.stop);
        guard.end_slot(0);
        shared.loaded.store(slot.is_loaded(), Ordering::Release);
        match outcome {
            Ok(_) => on_done(&request.path),
            // Kapanış, ya da dosya iş sürerken değişti (sonraki gösterimde yeniden istenir).
            Err(JobError::Model(ModelError::Cancelled) | JobError::FileChanged) => {}
            // Paket yok: gösterimde yeniden istenir, yuva açmayı boşuna denemez.
            Err(JobError::Model(ModelError::Unavailable)) => {}
            Err(e) => {
                diagnostics::error(&format!(
                    "Sözler zamanlanamadı ({}): {e}",
                    request.path.display()
                ));
                if let Ok(mut failed) = shared.failed.lock() {
                    failed.insert((request.path, stamp, text_sha256(&request.text)));
                }
            }
        }
        shared.finished.fetch_add(1, Ordering::AcqRel);
    }
}

/// Sıradaki istek; yoksa bekler. Model açıkken kuyruk `idle_release` boyunca boş kalırsa modeli
/// bırakır. Program kapanıyorsa `None`.
fn next(shared: &Shared, slot: &mut ModelSlot, idle_release: Duration) -> Option<Request> {
    let mut queue = shared.queue.lock().ok()?;
    loop {
        if shared.stop.load(Ordering::Acquire) {
            return None;
        }
        if let Some(request) = queue.pop() {
            return Some(request);
        }
        if slot.is_loaded() {
            let (guard, timeout) = shared
                .signal
                .wait_timeout_while(queue, idle_release, |q| {
                    q.pending.is_empty() && !shared.stop.load(Ordering::Acquire)
                })
                .ok()?;
            queue = guard;
            if timeout.timed_out() {
                slot.release();
                shared.loaded.store(false, Ordering::Release);
            }
        } else {
            queue = shared
                .signal
                .wait_while(queue, |q| {
                    q.pending.is_empty() && !shared.stop.load(Ordering::Acquire)
                })
                .ok()?;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::lyrics_model::{
        file_sha256, FRAME_SAMPLES, MODEL_FILE, SAMPLE_RATE, TOKENS_FILE,
    };
    use crate::audio::lyrics::{parse, LyricsSource};
    use crate::audio::test_util::{temp_path, write_wav};
    use std::sync::mpsc;
    use std::time::Instant;

    const LYRICS: &str = "ab ab\nab ab";

    fn slot() -> ModelSlot {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/soz-modeli");
        let model = file_sha256(&dir.join(MODEL_FILE)).unwrap();
        let tokens = file_sha256(&dir.join(TOKENS_FILE)).unwrap();
        ModelSlot::new(dir, &model, &tokens)
    }

    /// Deneme modeli: artı blok 'a', eksi blok 'b' (37 kare).
    fn song(name: &str, blocks: usize) -> PathBuf {
        const BLOCK: usize = 37;
        let path = temp_path(name).with_extension("wav");
        write_wav(
            &path,
            SAMPLE_RATE,
            1,
            blocks * BLOCK * FRAME_SAMPLES,
            |i, _| {
                if (i / FRAME_SAMPLES / BLOCK).is_multiple_of(2) {
                    0.5
                } else {
                    -0.5
                }
            },
        );
        path
    }

    struct Fixture {
        worker: LyricsWorker,
        done: mpsc::Receiver<PathBuf>,
        foreground: Arc<AtomicUsize>,
    }

    fn start(guard: CrashGuard, idle_release: Duration) -> Fixture {
        let (sender, done) = mpsc::channel();
        let foreground = Arc::new(AtomicUsize::new(0));
        let worker = LyricsWorker::start_with(
            Arc::new(AnalysisCache::open_in_memory().unwrap()),
            slot(),
            Arc::clone(&foreground),
            guard,
            idle_release,
            move |path| {
                let _ = sender.send(path.to_path_buf());
            },
        );
        Fixture {
            worker,
            done,
            foreground,
        }
    }

    fn wait_until(mut condition: impl FnMut() -> bool, seconds: u64) -> bool {
        let deadline = Instant::now() + Duration::from_secs(seconds);
        while Instant::now() < deadline {
            if condition() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        condition()
    }

    fn plain(text: &str) -> Option<Lyrics> {
        Some(parse(text, LyricsSource::User, None))
    }

    fn raw(text: &str) -> impl FnOnce() -> Option<LyricsText> + '_ {
        move || {
            Some(LyricsText {
                source: LyricsSource::User,
                text: text.to_owned(),
            })
        }
    }

    #[test]
    fn zamansiz_soz_gosterilince_zamanlanir_sonra_zamanli_gosterilir() {
        let f = start(CrashGuard::disabled(), IDLE_RELEASE);
        let path = song("soz-isci-goster", 8);
        let first = f.worker.show(&path, plain(LYRICS), raw(LYRICS)).unwrap();
        assert!(!first.synced, "ilk gösterimde henüz zamanlanmadı");
        let done = f.done.recv_timeout(Duration::from_secs(60)).unwrap();
        assert_eq!(done, path);
        let shown = f.worker.show(&path, plain(LYRICS), raw(LYRICS)).unwrap();
        assert!(shown.synced && shown.auto.is_some());
        assert_eq!(shown.source, LyricsSource::User);
        // Zamanlanmış söz yeniden istenmez.
        assert_eq!(f.worker.finished(), 1);
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(f.worker.finished(), 1);
    }

    #[test]
    fn zamanli_soz_ve_soz_yoklugu_is_istemez() {
        let f = start(CrashGuard::disabled(), IDLE_RELEASE);
        let path = song("soz-isci-zamanli", 4);
        let timed = "[00:01.00]ab ab\n[00:02.00]ab ab";
        let mut asked = false;
        let shown = f.worker.show(&path, plain(timed), || {
            asked = true;
            None
        });
        assert!(shown.unwrap().synced);
        assert!(!asked, "zamanlı sözde ham metin okunmaz");
        assert!(f.worker.show(&path, None, raw(LYRICS)).is_none());
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(f.worker.finished(), 0);
    }

    #[test]
    fn basarisiz_is_ayni_metinle_yinelenmez_metin_degisince_denenir() {
        let f = start(CrashGuard::disabled(), IDLE_RELEASE);
        let path = song("soz-isci-basarisiz", 4);
        // Kelimesiz söz: hizalanacak bir şey yok.
        f.worker.request(&path, "♪ ♪");
        assert!(wait_until(|| f.worker.finished() == 1, 30));
        f.worker.request(&path, "♪ ♪");
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(f.worker.finished(), 1, "aynı metin yeniden denenmez");
        f.worker.request(&path, LYRICS);
        assert_eq!(f.done.recv_timeout(Duration::from_secs(60)).unwrap(), path);
    }

    #[test]
    fn kuyrukta_sarki_basina_son_metin_durur_son_istenen_once() {
        let mut queue = Queue::default();
        let request = |path: &str, text: &str| Request {
            path: PathBuf::from(path),
            text: text.to_owned(),
        };
        queue.push(request("a", "1"));
        queue.push(request("b", "1"));
        queue.push(request("a", "2"));
        assert_eq!(queue.pop(), Some(request("a", "2")));
        assert_eq!(queue.pop(), Some(request("b", "1")));
        assert_eq!(queue.pop(), None);
    }

    #[test]
    fn oynaticinin_analizi_surerken_is_baslamaz() {
        let f = start(CrashGuard::disabled(), IDLE_RELEASE);
        let path = song("soz-isci-oncelik", 8);
        f.foreground.store(1, Ordering::Release);
        f.worker.request(&path, LYRICS);
        assert!(f.done.recv_timeout(Duration::from_millis(500)).is_err());
        assert_eq!(f.worker.finished(), 0);
        f.foreground.store(0, Ordering::Release);
        assert_eq!(f.done.recv_timeout(Duration::from_secs(60)).unwrap(), path);
    }

    #[test]
    fn bosta_model_birakilir_durdurunca_hemen_biter() {
        let f = start(CrashGuard::disabled(), Duration::from_millis(50));
        let path = song("soz-isci-birak", 8);
        f.worker.request(&path, LYRICS);
        f.done.recv_timeout(Duration::from_secs(60)).unwrap();
        assert!(
            wait_until(|| !f.worker.model_loaded(), 10),
            "model bırakılmadı"
        );
        // Model bırakılınca iş parçacığı süresiz bekler; durdurma onu hemen uyandırır.
        let started = Instant::now();
        f.worker.stop();
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn programi_iki_kez_kapatan_sarki_atlanir() {
        let dir = temp_path("soz-isci-cokme");
        let path = song("soz-isci-cokme-sarki", 8);
        let stamp = FileStamp::of(&path).unwrap();
        // Önceki iki açılış bu şarkının zamanlamasında kapandı.
        for _ in 0..2 {
            let guard = CrashGuard::named(dir.clone(), "soz");
            guard.recover();
            guard.begin_slot(0, &path, stamp);
        }
        let f = start(CrashGuard::named(dir.clone(), "soz"), IDLE_RELEASE);
        f.worker.request(&path, LYRICS);
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(f.worker.finished(), 0);
        // Başka şarkı zamanlanır.
        let other = song("soz-isci-cokme-baska", 8);
        f.worker.request(&other, LYRICS);
        assert_eq!(f.done.recv_timeout(Duration::from_secs(60)).unwrap(), other);
    }
}
