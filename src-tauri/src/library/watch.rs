//! Klasör izleme: kütüphane klasörlerine sonradan eklenen, değişen, adı değişen ya da silinen
//! şarkıları kendiliğinden fark eder (ör. yt-dlp ile `D:\DLP`'ye indirilen şarkı).
//!
//! - Her klasör kaynağı alt klasörleriyle izlenir (Windows'ta `ReadDirectoryChangesW`; bütün bir
//!   sürücü, ör. `D:\`, de izlenebilir). Tek şarkı kaynakları izlenmez.
//! - Olaylar biriktirilir: son olaydan sonra [`Timing::quiet`] kadar sessizlik olunca (ya da ilk
//!   olaydan [`Timing::cap`] sonra, olaylar hiç kesilmese de) değişen kaynaklar **bir kez**
//!   yeniden taranır. Tarama zaten değişmeyen dosyaları atlar, silineni çıkarır; burada ayrı bir
//!   tarama yoktur.
//! - Ses dosyası olmayan yollar ucuzca elenir; ama içeri taşınan ya da kopyalanan bir klasör (içi
//!   şarkı dolu olabilir) ve şarkıları kütüphanede olan bir klasörün silinmesi taramayı başlatır.
//!   Taranmayan sistem klasörlerindeki ([`scan::is_skipped_dir_name`]) olaylar yok sayılır.
//! - İzlenemeyen klasör (ağ sürücüsü, izin, tutamaç sınırı) bir kez günlüğe yazılır; o klasör
//!   pencereye dönülünce taranır ([`super::service::LibraryService::on_window_focus`]).
//! - Bekleyen iş parçacığı olay gelene kadar uyur (yoklama döngüsü yok); kapanışta durur.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::event::{ModifyKind, RenameMode};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use super::{path_covers, scan, FolderRow, Library, LibraryError};
use crate::diagnostics;

/// Olayları biriktirme süreleri.
#[derive(Debug, Clone, Copy)]
pub struct Timing {
    /// Son olaydan sonra beklenen sessizlik (indirme, kopyalama bitsin).
    pub quiet: Duration,
    /// İlk olaydan sonra en fazla bekleme: olaylar kesilmese de bu sürede bir tarama yapılır.
    pub cap: Duration,
}

/// Programın kullandığı süreler.
pub const DEFAULT_TIMING: Timing = Timing {
    quiet: Duration::from_secs(2),
    cap: Duration::from_secs(10),
};

/// Değişen kaynakları biriktirir ve ne zaman taranacaklarına karar verir (saf; saati dışarıdan
/// alır, test edilebilir).
#[derive(Debug)]
pub struct Debouncer {
    timing: Timing,
    dirty: Vec<i64>,
    first: Option<Instant>,
    last: Option<Instant>,
}

impl Debouncer {
    pub fn new(timing: Timing) -> Self {
        Self {
            timing,
            dirty: Vec::new(),
            first: None,
            last: None,
        }
    }

    /// `source` kaynağında `now` anında değişiklik oldu.
    pub fn note(&mut self, source: i64, now: Instant) {
        if !self.dirty.contains(&source) {
            self.dirty.push(source);
        }
        self.first.get_or_insert(now);
        self.last = Some(now);
    }

    /// Bekleyen değişiklik varsa taramanın yapılacağı an.
    pub fn deadline(&self) -> Option<Instant> {
        let (first, last) = (self.first?, self.last?);
        Some((last + self.timing.quiet).min(first + self.timing.cap))
    }

    /// Vakti geldiyse taranacak kaynakları verir ve sıfırlanır.
    pub fn take_due(&mut self, now: Instant) -> Option<Vec<i64>> {
        if self.deadline()? > now {
            return None;
        }
        self.first = None;
        self.last = None;
        Some(std::mem::take(&mut self.dirty))
    }
}

/// Bir olayın kütüphaneyi ilgilendirip ilgilendirmediğine karar verirken gereken sorular
/// (disk ve kütüphane; testlerde sahtesi kullanılır).
pub trait Probe {
    fn is_dir(&self, path: &Path) -> bool;
    /// Kütüphanede bu klasörün altında şarkı var mı?
    fn has_tracks_under(&self, path: &Path) -> bool;
}

/// Gerçek disk ve kütüphane.
struct LiveProbe {
    library: Arc<Mutex<Library>>,
}

impl Probe for LiveProbe {
    fn is_dir(&self, path: &Path) -> bool {
        path.is_dir()
    }

    fn has_tracks_under(&self, path: &Path) -> bool {
        // Kilit yalnızca tek sorgu boyunca tutulur. Bilinemiyorsa taranır (kaçırmaktansa).
        self.library
            .lock()
            .map_or(true, |lib| lib.has_tracks_under(path).unwrap_or(true))
    }
}

/// `root` kaynağındaki `path` yolunda olan `kind` değişikliği yeniden taramayı gerektirir mi?
pub fn is_relevant(kind: &EventKind, path: &Path, root: &Path, probe: &impl Probe) -> bool {
    let audio = scan::is_audio(path);
    if in_skipped_dir(path, root, audio) {
        return false;
    }
    match kind {
        EventKind::Access(_) => false,
        // Yeni şarkı ya da içeri gelen klasör (içi şarkı dolu olabilir).
        EventKind::Create(_) | EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
            audio || probe.is_dir(path)
        }
        // Silinen ya da dışarı taşınan: artık diskte yok, kütüphaneye sorulur.
        EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
            audio || probe.has_tracks_under(path)
        }
        // Yönü belli olmayan ad değişikliği: iki ihtimale de bakılır.
        EventKind::Modify(ModifyKind::Name(_)) => {
            audio || probe.is_dir(path) || probe.has_tracks_under(path)
        }
        // İçerik değişti (etiket düzenlendi, indirme sürüyor): yalnızca şarkılar.
        EventKind::Modify(_) | EventKind::Any | EventKind::Other => audio,
    }
}

/// Yol taranmayan bir sistem klasörünün (geri dönüşüm kutusu, gizli klasör) içinde mi, ya da
/// kendisi öyle bir klasör mü? Gizli ad taşıyan şarkı dosyası (".x.mp3") taranır, elenmez.
fn in_skipped_dir(path: &Path, root: &Path, audio: bool) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    let names: Vec<&str> = relative
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect();
    let Some((last, parents)) = names.split_last() else {
        return false;
    };
    parents.iter().any(|name| scan::is_skipped_dir_name(name))
        || (!audio && scan::is_skipped_dir_name(last))
}

enum Message {
    Event(notify::Result<Event>),
    Stop,
}

/// İzlenen klasörler: kaynak kimliği ve kök yolu.
type Roots = Arc<Mutex<Vec<(i64, PathBuf)>>>;

#[derive(Default)]
struct State {
    /// İzleme başlatıldı mı (başlatılmadıysa eşitleme bir şey yapmaz; ör. testler).
    started: bool,
    /// `None`: başlatıldı ama işletim sistemi izleyicisi kurulamadı (hepsi izlenemiyor sayılır).
    watcher: Option<RecommendedWatcher>,
    /// İzlenemeyen kaynaklar: tek şarkılar ve izlenemeyen klasörler.
    unwatched: Vec<i64>,
    /// Günlüğe bir kez yazılan izleme hataları (her denemede yinelenmesin).
    logged: HashSet<PathBuf>,
}

/// Kütüphane klasörlerinin izleyicisi; [`super::LibraryService`] sahiplenir.
pub struct FolderWatcher {
    state: Mutex<State>,
    roots: Roots,
    stop: Mutex<Option<mpsc::Sender<Message>>>,
    /// Kaç kez tarama istendi (testler için).
    flushes: Arc<std::sync::atomic::AtomicUsize>,
}

impl Default for FolderWatcher {
    fn default() -> Self {
        Self {
            state: Mutex::new(State::default()),
            roots: Arc::new(Mutex::new(Vec::new())),
            stop: Mutex::new(None),
            flushes: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
        }
    }
}

impl FolderWatcher {
    /// İzlemeyi başlatır: işletim sistemi izleyicisini kurar ve olayları biriktiren iş
    /// parçacığını açar. Vakti gelen kaynaklar `on_due` ile taramaya gönderilir. Klasörler
    /// ardından [`Self::sync`] ile eklenir. İkinci çağrı bir şey yapmaz.
    pub fn start(
        &self,
        timing: Timing,
        library: Arc<Mutex<Library>>,
        on_due: impl Fn(Vec<i64>) + Send + 'static,
    ) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        if state.started {
            return;
        }
        state.started = true;
        let (tx, rx) = mpsc::channel();
        let events = tx.clone();
        match notify::recommended_watcher(move |event| {
            let _ = events.send(Message::Event(event));
        }) {
            Ok(watcher) => state.watcher = Some(watcher),
            Err(error) => {
                diagnostics::error(&format!(
                    "Klasör izleme başlatılamadı: {error}. Yeni şarkılar pencereye dönülünce taranır."
                ));
                return;
            }
        }
        let roots = Arc::clone(&self.roots);
        let flushes = Arc::clone(&self.flushes);
        let probe = LiveProbe { library };
        let spawned = std::thread::Builder::new()
            .name("lyraska-klasor-izleme".to_owned())
            .spawn(move || {
                run(&rx, timing, &roots, &probe, |due| {
                    flushes.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    on_due(due);
                });
            });
        match spawned {
            Ok(_) => {
                if let Ok(mut stop) = self.stop.lock() {
                    *stop = Some(tx);
                }
            }
            Err(error) => {
                diagnostics::error(&format!("Klasör izleme iş parçacığı açılamadı: {error}"));
                state.watcher = None;
            }
        }
    }

    /// İzlenen klasörleri kütüphanedeki kaynaklarla eşitler: yeniler izlenir, çıkarılanların
    /// izlemesi biter, önceden izlenemeyenler yeniden denenir. `folders` izleyici kilidi altında
    /// okunur: aynı anda iki eşitleme eski bir listeyle yenisini ezemez.
    pub fn sync(&self, folders: impl FnOnce() -> Result<Vec<FolderRow>, LibraryError>) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        if !state.started {
            return;
        }
        let folders = match folders() {
            Ok(folders) => folders,
            Err(error) => {
                diagnostics::error(&format!("Klasör izleme güncellenemedi: {error}"));
                return;
            }
        };
        let mut roots = self.roots.lock().map(|r| r.clone()).unwrap_or_default();
        let State {
            watcher,
            unwatched,
            logged,
            ..
        } = &mut *state;

        // Kütüphaneden çıkarılan (ya da yolu değişen) kaynakların izlemesi biter.
        roots.retain(|(id, root)| {
            let keep = folders
                .iter()
                .any(|f| f.id == *id && Path::new(&f.path) == root);
            if !keep {
                if let Some(watcher) = watcher.as_mut() {
                    let _ = watcher.unwatch(root);
                }
            }
            keep
        });

        unwatched.clear();
        for folder in &folders {
            if roots.iter().any(|(id, _)| *id == folder.id) {
                continue;
            }
            // Tek şarkı kaynağı (yeni eklenende `single` taramadan sonra dolar: diske bakılır).
            if folder.single || Path::new(&folder.path).is_file() {
                unwatched.push(folder.id);
                continue;
            }
            let root = PathBuf::from(&folder.path);
            let result = match watcher.as_mut() {
                Some(watcher) => watcher.watch(&root, RecursiveMode::Recursive),
                None => Err(notify::Error::generic("izleyici yok")),
            };
            match result {
                Ok(()) => {
                    logged.remove(&root);
                    roots.push((folder.id, root));
                }
                Err(error) => {
                    if logged.insert(root.clone()) {
                        diagnostics::error(&format!(
                            "Klasör izlenemiyor: {}: {error}. Bu klasördeki yeni şarkılar \
                             pencereye dönülünce taranır.",
                            root.display()
                        ));
                    }
                    unwatched.push(folder.id);
                }
            }
        }
        if let Ok(mut shared) = self.roots.lock() {
            *shared = roots;
        }
    }

    /// İzlenemeyen kaynaklar (tek şarkılar ve izlenemeyen klasörler). İzleme hiç
    /// başlatılmadıysa boştur.
    pub fn unwatched(&self) -> Vec<i64> {
        self.state
            .lock()
            .map(|s| s.unwatched.clone())
            .unwrap_or_default()
    }

    /// İzlenen klasör sayısı.
    pub fn watched_count(&self) -> usize {
        self.roots.lock().map(|r| r.len()).unwrap_or(0)
    }

    /// Kaç kez tarama istendi (testler için).
    #[cfg(test)]
    pub fn flush_count(&self) -> usize {
        self.flushes.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// İzlemeyi durdurur (program kapanırken): iş parçacığı uyanıp çıkar, işletim sistemi
    /// izleyicisi kapanır.
    pub fn stop(&self) {
        if let Some(tx) = self.stop.lock().ok().and_then(|mut s| s.take()) {
            let _ = tx.send(Message::Stop);
        }
        if let Ok(mut state) = self.state.lock() {
            state.watcher = None;
        }
        if let Ok(mut roots) = self.roots.lock() {
            roots.clear();
        }
    }
}

/// Olayları biriktiren iş parçacığının döngüsü: olay gelene ya da biriktirme süresi dolana kadar
/// uyur.
fn run(
    rx: &mpsc::Receiver<Message>,
    timing: Timing,
    roots: &Mutex<Vec<(i64, PathBuf)>>,
    probe: &impl Probe,
    mut on_due: impl FnMut(Vec<i64>),
) {
    let mut debouncer = Debouncer::new(timing);
    let mut error_logged = false;
    loop {
        let message = match debouncer.deadline() {
            Some(deadline) => {
                match rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                    Ok(message) => Some(message),
                    Err(mpsc::RecvTimeoutError::Timeout) => None,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            None => match rx.recv() {
                Ok(message) => Some(message),
                Err(_) => return,
            },
        };
        match message {
            Some(Message::Stop) => return,
            Some(Message::Event(Ok(event))) => {
                // Kilit yalnızca kopyalarken tutulur; disk ve kütüphane soruları kilitsiz.
                let snapshot = roots.lock().map(|r| r.clone()).unwrap_or_default();
                for id in affected_sources(&event, &snapshot, probe) {
                    debouncer.note(id, Instant::now());
                }
            }
            // Hata bir kez günlüğe yazılır (yinelenen hata günlüğü doldurmasın).
            Some(Message::Event(Err(error))) if !error_logged => {
                error_logged = true;
                diagnostics::error(&format!("Klasör izleme hatası: {error}"));
            }
            Some(Message::Event(Err(_))) | None => {}
        }
        if let Some(due) = debouncer.take_due(Instant::now()) {
            on_due(due);
        }
    }
}

/// Olayın yeniden taranmasını gerektirdiği kaynaklar. İşletim sistemi olayları kaçırdığını
/// söylerse (`need_rescan`) izlenen bütün kaynaklar taranır.
fn affected_sources(event: &Event, roots: &[(i64, PathBuf)], probe: &impl Probe) -> Vec<i64> {
    if event.need_rescan() {
        return roots.iter().map(|(id, _)| *id).collect();
    }
    let mut ids = Vec::new();
    for path in &event.paths {
        let Some((id, root)) = roots.iter().find(|(_, root)| path_covers(root, path)) else {
            continue;
        };
        if !ids.contains(id) && is_relevant(&event.kind, path, root, probe) {
            ids.push(*id);
        }
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, RemoveKind};

    struct FakeProbe {
        dirs: Vec<PathBuf>,
        known: Vec<PathBuf>,
    }

    impl Probe for FakeProbe {
        fn is_dir(&self, path: &Path) -> bool {
            self.dirs.iter().any(|d| d == path)
        }
        fn has_tracks_under(&self, path: &Path) -> bool {
            self.known.iter().any(|k| k == path)
        }
    }

    const TIMING: Timing = Timing {
        quiet: Duration::from_secs(2),
        cap: Duration::from_secs(10),
    };

    #[test]
    fn olaylar_sessizlik_olunca_tek_taramada_birlesir() {
        let start = Instant::now();
        let mut debouncer = Debouncer::new(TIMING);
        assert_eq!(debouncer.deadline(), None);
        // Bir indirme: aynı klasörde art arda birçok olay, arada başka kaynak.
        for i in 0..50 {
            debouncer.note(7, start + Duration::from_millis(i * 20));
        }
        debouncer.note(3, start + Duration::from_millis(990));
        let last = start + Duration::from_millis(990);
        assert_eq!(debouncer.take_due(last + Duration::from_millis(1999)), None);
        assert_eq!(
            debouncer.take_due(last + Duration::from_secs(2)),
            Some(vec![7, 3])
        );
        // Sıfırlandı: yeni olay olmadan bir daha tarama yok.
        assert_eq!(debouncer.deadline(), None);
        assert_eq!(debouncer.take_due(last + Duration::from_secs(60)), None);
    }

    #[test]
    fn olaylar_hic_kesilmese_de_ust_sinirda_taranir() {
        let start = Instant::now();
        let mut debouncer = Debouncer::new(TIMING);
        let mut flushed = Vec::new();
        // 25 sn boyunca her 500 ms'de bir olay (büyük bir kopyalama).
        for i in 0..=50u64 {
            let now = start + Duration::from_millis(i * 500);
            debouncer.note(1, now);
            if let Some(due) = debouncer.take_due(now) {
                flushed.push((now - start, due));
            }
        }
        assert_eq!(
            flushed,
            vec![
                (Duration::from_secs(10), vec![1]),
                (Duration::from_millis(20_500), vec![1])
            ]
        );
    }

    #[test]
    fn ses_dosyasi_olmayanlar_elenir_klasorler_ve_sarkilar_kalir() {
        let root = Path::new("/muzik");
        let probe = FakeProbe {
            dirs: vec![root.join("Yeni Albüm")],
            known: vec![root.join("Eski Albüm")],
        };
        let create = EventKind::Create(CreateKind::Any);
        let remove = EventKind::Remove(RemoveKind::Any);
        let write = EventKind::Modify(ModifyKind::Data(DataChange::Any));
        let renamed_in = EventKind::Modify(ModifyKind::Name(RenameMode::To));
        let renamed_out = EventKind::Modify(ModifyKind::Name(RenameMode::From));
        let relevant =
            |kind: &EventKind, rel: &str| is_relevant(kind, &root.join(rel), root, &probe);

        // Şarkılar: her türlü değişiklik.
        assert!(relevant(&create, "şarkı.MP3"));
        assert!(relevant(&write, "şarkı.flac"));
        assert!(relevant(&remove, "şarkı.mp3"));
        assert!(relevant(&renamed_in, "indirilen.webm"));
        // Gizli adlı şarkı dosyası taranır (yalnızca gizli klasörler atlanır).
        assert!(relevant(&create, ".gizli.mp3"));
        // İndirme ara dosyaları ve başka dosyalar elenir.
        assert!(!relevant(&create, "indirilen.webm.part"));
        assert!(!relevant(&renamed_out, "indirilen.webm.part"));
        assert!(!relevant(&write, "kapak.jpg"));
        assert!(!relevant(&remove, "notlar.txt"));
        assert!(!relevant(
            &EventKind::Access(notify::event::AccessKind::Any),
            "a.mp3"
        ));
        // İçeri taşınan klasör taranır; şarkısı olan klasörün silinmesi de.
        assert!(relevant(&renamed_in, "Yeni Albüm"));
        assert!(relevant(&create, "Yeni Albüm"));
        assert!(relevant(&remove, "Eski Albüm"));
        assert!(relevant(&renamed_out, "Eski Albüm"));
        assert!(!relevant(&remove, "Boş Klasör"));
        assert!(!relevant(&write, "Yeni Albüm"));
        // Sistem ve gizli klasörlerin içi elenir.
        assert!(!relevant(&create, "$RECYCLE.BIN/S-1-5/şarkı.mp3"));
        assert!(!relevant(&create, ".Trash-1000/files/şarkı.mp3"));
        assert!(!relevant(&create, "system volume information/x.mp3"));
        assert!(relevant(&create, "Albüm/şarkı.mp3"));
    }

    #[test]
    fn olaylar_kaynaklarina_eslenir() {
        let probe = FakeProbe {
            dirs: vec![],
            known: vec![],
        };
        let roots = vec![
            (1, PathBuf::from("/muzik")),
            (2, PathBuf::from("/indirilenler")),
        ];
        let event = Event::new(EventKind::Create(CreateKind::File))
            .add_path(PathBuf::from("/indirilenler/a.mp3"))
            .add_path(PathBuf::from("/indirilenler/b.mp3"))
            .add_path(PathBuf::from("/muzik 2/c.mp3"));
        assert_eq!(affected_sources(&event, &roots, &probe), vec![2]);
        // Kaçırılan olaylar: hepsi taranır.
        let rescan = Event::new(EventKind::Other).set_flag(notify::event::Flag::Rescan);
        assert_eq!(affected_sources(&rescan, &roots, &probe), vec![1, 2]);
    }

    #[test]
    fn durdurulan_izleyici_is_parcacigi_biter() {
        let (tx, rx) = mpsc::channel();
        let roots = Mutex::new(Vec::new());
        let probe = FakeProbe {
            dirs: vec![],
            known: vec![],
        };
        let worker = std::thread::spawn(move || run(&rx, TIMING, &roots, &probe, |_| {}));
        tx.send(Message::Stop).unwrap();
        worker.join().unwrap();
    }
}
