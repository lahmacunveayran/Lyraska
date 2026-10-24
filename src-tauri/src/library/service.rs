//! Kütüphane servisi: veritabanını ve arka plan taramasını bir arada yönetir.
//! Tauri komutları yalnızca bu servisi çağırır.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::audio::decode::Decoder;

use super::db::MAX_RESULTS;
use super::scan::{self, ScanProgress, ScanState};
use super::watch::{self, FolderWatcher};
use super::{path_covers, AlbumRow, ArtistRow, FolderRow, Library, LibraryError, TrackRow};

/// Arayüzün gösterdiği kütüphane durumu.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct LibraryStatus {
    pub folders: Vec<FolderRow>,
    pub track_count: usize,
    /// Analizi hazır şarkı sayısı (BPM ve şarkı haritası önbellekte).
    pub analyzed: usize,
    pub scan: ScanProgress,
    /// Son taramadaki sorunlar (ör. "Klasör bulunamadı: D:\Müzik").
    pub problems: Vec<String>,
}

/// Pencereye bırakılanların sonucu.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct DropOutcome {
    /// Çalınacak şarkılar, bırakılış sırasıyla (zaten kütüphanede olanlar dahil).
    pub tracks: Vec<String>,
    /// Kütüphaneye yeni eklenen şarkılar.
    pub added_tracks: usize,
    /// Kütüphaneye yeni eklenen klasörler (şarkıları arka planda taranır).
    pub added_folders: usize,
    /// Zaten kütüphanede olanlar (şarkı ya da klasör).
    pub already: usize,
    /// Eklenemeyenler (ör. "Bu dosya türü desteklenmiyor: notlar.txt").
    pub problems: Vec<String>,
}

/// Bekleyen tarama isteği: bütün kaynaklar, yalnızca bazı kaynaklar ya da kaynakların bazı alt
/// klasörleri (klasör izleme).
#[derive(Debug, Default)]
struct ScanRequest {
    all: bool,
    folders: Vec<i64>,
    /// Kaynak ve taranacak alt klasörü.
    parts: Vec<(i64, PathBuf)>,
}

impl ScanRequest {
    fn is_empty(&self) -> bool {
        !self.all && self.folders.is_empty() && self.parts.is_empty()
    }

    /// Kaynağın nasıl taranacağı: `[None]` bütün kaynak, `Some` alt klasörler (iç içe olanlardan
    /// dıştaki kalır), boş: hiç. Alt klasörler uzun bir tarama sürerken birçok istekte birikebilir;
    /// [`watch::MAX_SCOPES`]'tan fazlası bütün kaynağın tek bir taramasına döner (yüzlerce ayrı
    /// alt klasör taraması yapılmasın).
    fn scopes_of(&self, folder: &FolderRow) -> Vec<Option<&Path>> {
        if self.all || self.folders.contains(&folder.id) {
            return vec![None];
        }
        let mut kept: Vec<&Path> = Vec::new();
        for (_, part) in self.parts.iter().filter(|(id, _)| *id == folder.id) {
            if kept.iter().any(|k| path_covers(k, part)) {
                continue;
            }
            kept.retain(|k| !path_covers(part, k));
            kept.push(part);
        }
        if kept.len() > watch::MAX_SCOPES {
            return vec![None];
        }
        kept.into_iter().map(Some).collect()
    }
}

/// Pencereye dönülünce izlenemeyen kaynaklar en sık bu aralıkla taranır. (Kaçırılan olaylara
/// karşı bütün kaynakların düzenli taraması pencereden bağımsızdır: [`watch::DEFAULT_TIMING`].)
const FOCUS_RESCAN_INTERVAL: Duration = Duration::from_secs(60);

/// Kütüphaneyi değiştiren taramadan sonra çağrılan bildirim (arayüz listeyi tazelesin).
type ChangeListener = Box<dyn Fn() + Send + Sync>;

/// Tarama kuyruğu: bekleyen istekler ve tarayıcı iş parçacığı. Klasör izleyicisi de buraya
/// istek gönderir (servisin kendisini tutmaz: sahiplik döngüsü olmasın).
struct ScanQueue {
    library: Arc<Mutex<Library>>,
    scan: Arc<ScanState>,
    /// Tarama sürerken gelen yeni tarama isteği.
    pending: Mutex<ScanRequest>,
    worker_running: AtomicBool,
    problems: Mutex<Vec<String>>,
    on_change: OnceLock<ChangeListener>,
}

/// Kopyası aynı kütüphaneyi paylaşır (alanlar `Arc`): komutlar işi engellenebilir iş parçacığına
/// taşırken kopyayı götürür.
#[derive(Clone)]
pub struct LibraryService {
    library: Arc<Mutex<Library>>,
    scan: Arc<ScanState>,
    queue: Arc<ScanQueue>,
    watcher: Arc<FolderWatcher>,
    /// Pencereye dönüş taramasının son anı.
    focus: Arc<Mutex<Option<Instant>>>,
    /// Açılışta bozuk veritabanı kenara alındıysa açıklaması; oturum boyunca sorunların başında
    /// gösterilir (tam tarama sorun listesini yenilese de silinmez).
    recovery_notice: Option<String>,
    /// Programı kapattığı için taramada atlanan dosyalar (çökme döngüsü koruması); oturum boyunca
    /// sorunların başında gösterilir.
    crash_notices: Vec<String>,
}

impl LibraryService {
    pub fn open(path: &Path) -> Result<Self, LibraryError> {
        Self::open_checked(path, false)
    }

    /// `verify`: veri sayfaları da denetlenir (bkz. [`Library::open_checked`]).
    pub fn open_checked(path: &Path, verify: bool) -> Result<Self, LibraryError> {
        let library = Library::open_checked(path, verify)?;
        let recovery_notice = library.recovery_notice().map(str::to_owned);
        Ok(Self {
            recovery_notice,
            ..Self::new(library)
        })
    }

    pub fn new(library: Library) -> Self {
        let library = Arc::new(Mutex::new(library));
        let scan = Arc::new(ScanState::default());
        Self {
            queue: Arc::new(ScanQueue {
                library: Arc::clone(&library),
                scan: Arc::clone(&scan),
                pending: Mutex::new(ScanRequest::default()),
                worker_running: AtomicBool::new(false),
                problems: Mutex::new(Vec::new()),
                on_change: OnceLock::new(),
            }),
            library,
            scan,
            watcher: Arc::new(FolderWatcher::default()),
            focus: Arc::new(Mutex::new(None)),
            recovery_notice: None,
            crash_notices: Vec::new(),
        }
    }

    /// Taramaya çökme döngüsü korumasını ekler (ilk taramadan önce). Programı iki kez kapatmış
    /// dosyalar atlanır ve kullanıcıya söylenir.
    pub fn with_crash_guard(mut self, guard: crate::analysis::background::CrashGuard) -> Self {
        self.crash_notices = self
            .scan
            .set_crash_guard(guard)
            .into_iter()
            .map(|path| {
                format!(
                    "{}: okunurken program kapandığı için atlanıyor (dosya değişirse yeniden denenir).",
                    path.display()
                )
            })
            .collect();
        self
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Library>, LibraryError> {
        self.library
            .lock()
            .map_err(|_| LibraryError::Database(rusqlite::Error::InvalidQuery))
    }

    pub fn status(&self) -> Result<LibraryStatus, LibraryError> {
        let lib = self.lock()?;
        Ok(LibraryStatus {
            folders: lib.folders()?,
            track_count: lib.track_count()?,
            analyzed: lib.analyzed_count()?,
            scan: self.scan.progress(),
            problems: self
                .recovery_notice
                .iter()
                .cloned()
                .chain(self.crash_notices.iter().cloned())
                .chain(
                    self.queue
                        .problems
                        .lock()
                        .map(|p| p.clone())
                        .unwrap_or_default(),
                )
                .collect(),
        })
    }

    pub fn search(&self, query: &str, limit: Option<usize>) -> Result<Vec<TrackRow>, LibraryError> {
        self.lock()?.search(query, limit.unwrap_or(MAX_RESULTS))
    }

    /// Albümler (arama [`Self::search`] gibi süzer).
    pub fn albums(&self, query: &str) -> Result<Vec<AlbumRow>, LibraryError> {
        self.lock()?.albums(query, MAX_RESULTS)
    }

    /// Sanatçılar (arama [`Self::search`] gibi süzer).
    pub fn artists(&self, query: &str) -> Result<Vec<ArtistRow>, LibraryError> {
        self.lock()?.artists(query, MAX_RESULTS)
    }

    /// Sanatçının şarkıları, çalma sırasıyla.
    pub fn artist_tracks(&self, artist: &str) -> Result<Vec<String>, LibraryError> {
        self.lock()?.artist_tracks(artist)
    }

    /// Çalma listeleri, en son değişen önce.
    pub fn playlists(&self) -> Result<Vec<crate::library::playlists::PlaylistRow>, LibraryError> {
        self.lock()?.playlists()
    }

    /// Yeni, boş çalma listesi.
    pub fn create_playlist(
        &self,
        name: &str,
    ) -> Result<crate::library::playlists::PlaylistRow, LibraryError> {
        self.lock()?.create_playlist(name)
    }

    /// Çalma listesinin adını değiştirir.
    pub fn rename_playlist(&self, id: i64, name: &str) -> Result<(), LibraryError> {
        self.lock()?.rename_playlist(id, name)
    }

    /// Çalma listesini siler.
    pub fn delete_playlist(&self, id: i64) -> Result<(), LibraryError> {
        self.lock()?.delete_playlist(id)
    }

    /// Çalma listesinin şarkıları, sırasıyla.
    pub fn playlist_tracks(&self, id: i64) -> Result<Vec<String>, LibraryError> {
        self.lock()?.playlist_tracks(id)
    }

    /// Şarkıları çalma listesinin sonuna ekler; yeni şarkı sayısı.
    pub fn add_to_playlist(&self, id: i64, paths: &[String]) -> Result<u32, LibraryError> {
        self.lock()?.add_to_playlist(id, paths)
    }

    /// Verilen sıralardaki şarkıları çalma listesinden çıkarır.
    pub fn remove_from_playlist(&self, id: i64, positions: &[u32]) -> Result<(), LibraryError> {
        self.lock()?.remove_from_playlist(id, positions)
    }

    /// Listenin dışa aktarılacak içeriği.
    pub fn playlist_file(
        &self,
        id: i64,
    ) -> Result<crate::library::playlist_file::PlaylistFile, LibraryError> {
        self.lock()?.playlist_file(id)
    }

    /// Dosyadan liste kurar; şarkılar kütüphanede (olmazsa diskte) aranır.
    pub fn import_playlist(
        &self,
        file: &crate::library::playlist_file::PlaylistFile,
    ) -> Result<crate::library::playlist_file::PlaylistImport, LibraryError> {
        self.lock()?
            .import_playlist(file, crate::library::playlist_file::on_disk)
    }

    /// Çalma listesinde bir şarkıyı başka sıraya taşır.
    pub fn move_in_playlist(&self, id: i64, from: u32, to: u32) -> Result<(), LibraryError> {
        self.lock()?.move_in_playlist(id, from, to)
    }

    /// Albümün şarkıları, çalma sırasıyla.
    pub fn album_tracks(
        &self,
        album: &str,
        artist: Option<&str>,
    ) -> Result<Vec<String>, LibraryError> {
        self.lock()?.album_tracks(album, artist)
    }

    /// Kaynak ekler — bir klasör ya da tek bir şarkı — ve taramayı başlatır.
    ///
    /// Zaten kütüphanedeki bir klasörün içindeyse eklenmez (şarkılar iki kez
    /// görünmesin). Yeni klasör daha önce eklenmiş kaynakları kapsıyorsa onların
    /// yerini alır; şarkıları bu klasörün taramasıyla geri gelir.
    pub fn add_folder(&self, path: &Path) -> Result<FolderRow, LibraryError> {
        let text = path.to_string_lossy().into_owned();
        if path.is_file() && !scan::is_audio(path) {
            return Err(LibraryError::UnsupportedFile(text));
        }
        if !path.exists() {
            return Err(LibraryError::FolderMissing(text));
        }
        let folder = {
            let mut lib = self.lock()?;
            let existing = lib.folders()?;
            if let Some(parent) = existing
                .iter()
                .find(|f| path_covers(Path::new(&f.path), path))
            {
                return Err(if path_covers(path, Path::new(&parent.path)) {
                    LibraryError::FolderExists
                } else {
                    LibraryError::AlreadyCovered(parent.path.clone())
                });
            }
            let covered: Vec<i64> = existing
                .iter()
                .filter(|f| path_covers(path, Path::new(&f.path)))
                .map(|f| f.id)
                .collect();
            lib.replace_folders(&text, &covered)?
        };
        self.sync_watches();
        // Yalnızca yeni kaynak taranır: büyük kütüphanede tek bir şarkı eklemek bütün
        // diskleri yeniden dolaşmasın, şarkı listede hemen görünsün.
        self.request(|r| r.folders.push(folder.id));
        Ok(folder)
    }

    /// Pencereye bırakılanları kütüphaneye ekler: klasörler ve şarkılar kaynak olur,
    /// şarkılar ayrıca çalınmak üzere bırakılış sırasıyla döndürülür.
    ///
    /// Dosya mı klasör mü olduğu diskte denetlenir (uzantıya bakılmaz). Zaten
    /// kütüphanede olan şarkı yine çalınır. Açılamayan şarkı (desteklenmeyen kodek, bozuk dosya)
    /// eklenmez ve çalma sırasına girmez; nedeni sorun olarak döner. Biri eklenemese de
    /// diğerleri eklenir; her sorun kullanıcıya gösterilecek bir cümle olarak döner.
    pub fn add_dropped(&self, paths: &[PathBuf]) -> DropOutcome {
        let mut outcome = DropOutcome::default();
        for path in paths {
            let name = path
                .file_name()
                .map_or_else(|| path.to_string_lossy(), |n| n.to_string_lossy())
                .into_owned();
            let is_track = path.is_file();
            if is_track && !scan::is_audio(path) {
                outcome
                    .problems
                    .push(LibraryError::UnsupportedFile(name).to_string());
                continue;
            }
            if !is_track && !path.is_dir() {
                // Ör. zip içinden ya da taşınmış dosya: diskte yok.
                outcome
                    .problems
                    .push(LibraryError::FolderMissing(name).to_string());
                continue;
            }
            if is_track {
                // Açılamayan dosya için ölü bir kaynak oluşturma ve "eklendi" deme: gerçek
                // nedeni söyle (ör. Opus'lu .webm: kodek desteklenmiyor).
                if let Err(error) = Decoder::open(path) {
                    outcome.problems.push(format!("{name}: {error}"));
                    continue;
                }
                outcome.tracks.push(path.to_string_lossy().into_owned());
            }
            match self.add_folder(path) {
                Ok(_) if is_track => outcome.added_tracks += 1,
                Ok(_) => outcome.added_folders += 1,
                Err(LibraryError::FolderExists | LibraryError::AlreadyCovered(_)) => {
                    outcome.already += 1;
                }
                Err(error) => outcome.problems.push(error.to_string()),
            }
        }
        outcome
    }

    pub fn remove_folder(&self, id: i64) -> Result<(), LibraryError> {
        self.lock()?.remove_folder(id)?;
        self.sync_watches();
        Ok(())
    }

    /// Kütüphane klasörlerini izlemeye başlar: sonradan eklenen, değişen ya da silinen şarkılar
    /// kendiliğinden taranır (bkz. [`watch`]). Klasörler izleme iş parçacığında izlemeye alınır
    /// (ağ sürücüsü yavaş yanıt verse de açılış beklemez).
    pub fn start_watching(&self) {
        self.start_watching_with(watch::DEFAULT_TIMING);
    }

    fn start_watching_with(&self, timing: watch::Timing) {
        let queue = Arc::clone(&self.queue);
        self.watcher
            .start(timing, Arc::clone(&self.library), move |due| {
                queue.request(|r| {
                    for watch::Due { source, within } in due {
                        match within {
                            Some(within) => r.parts.push((source, within)),
                            None => r.folders.push(source),
                        }
                    }
                });
            });
    }

    /// İzlenen klasörleri kaynaklarla eşitler (beklemez; izleme başlatılmadıysa bir şey yapmaz).
    fn sync_watches(&self) {
        self.watcher.request_sync();
    }

    /// Kütüphaneyi değiştiren her taramadan sonra çağrılacak bildirimi kurar (bir kez).
    pub fn set_on_change(&self, listener: impl Fn() + Send + Sync + 'static) {
        let _ = self.queue.on_change.set(Box::new(listener));
    }

    /// Program penceresi odağa geldi. En çok dakikada bir: izlenemeyen kaynaklar (tek şarkılar,
    /// izlenemeyen klasörler) taranır, izlemeler onarılır. Beklemez: izleme iş parçacığı ve
    /// tarayıcı arka planda çalışır (ağ sürücüsü yavaş yanıt verse de pencere donmaz).
    pub fn on_window_focus(&self) {
        if self.focus_due(Instant::now()) {
            self.focus_rescan();
        }
    }

    /// Pencereye dönüşte tarama vakti geldi mi?
    fn focus_due(&self, now: Instant) -> bool {
        let Ok(mut last) = self.focus.lock() else {
            return false;
        };
        if last.is_some_and(|last| now.duration_since(last) < FOCUS_RESCAN_INTERVAL) {
            return false;
        }
        *last = Some(now);
        true
    }

    fn focus_rescan(&self) {
        let unwatched = self.watcher.unwatched();
        self.watcher.request_heal();
        if !unwatched.is_empty() {
            self.request(|r| r.folders.extend(unwatched));
        }
    }

    /// Bütün klasörleri arka planda yeniden tarar. Tarama sürüyorsa bittikten
    /// sonra bir kez daha tarar (aradaki değişiklikler kaçmasın).
    pub fn request_scan(&self) {
        self.request(|r| r.all = true);
    }

    fn request(&self, add: impl FnOnce(&mut ScanRequest)) {
        self.queue.request(add);
    }

    /// Tarama sürüyor mu (testler ve durum için).
    pub fn is_scanning(&self) -> bool {
        self.queue.worker_running.load(Ordering::Acquire) || self.scan.is_scanning()
    }

    /// Program kapanırken süren taramayı ve klasör izlemeyi durdurur.
    pub fn shutdown(&self) {
        self.scan.cancel();
        self.watcher.stop();
    }
}

impl ScanQueue {
    /// Tarama isteğini bekleyenlere ekler ve gerekirse tarayıcıyı başlatır.
    fn request(self: &Arc<Self>, add: impl FnOnce(&mut ScanRequest)) {
        if let Ok(mut pending) = self.pending.lock() {
            add(&mut pending);
        }
        if self.worker_running.swap(true, Ordering::AcqRel) {
            return; // çalışan tarayıcı isteği görecek
        }
        let queue = Arc::clone(self);
        let spawned = std::thread::Builder::new()
            .name("lyraska-kutuphane-tarama".to_owned())
            .spawn(move || {
                let (pending, running) = (&queue.pending, &queue.worker_running);
                let take = || pending.lock().map(|mut p| std::mem::take(&mut *p)).ok();
                loop {
                    while let Some(request) = take().filter(|r| !r.is_empty()) {
                        let (found, changed) = run_scan(&queue.library, &queue.scan, &request);
                        if changed {
                            if let Some(listener) = queue.on_change.get() {
                                listener();
                            }
                        }
                        if let Ok(mut p) = queue.problems.lock() {
                            if request.all {
                                *p = found;
                            } else {
                                // Yeni kaynağın sorunları öncekilere eklenir.
                                for problem in found {
                                    if !p.contains(&problem) {
                                        p.push(problem);
                                    }
                                }
                            }
                        }
                    }
                    running.store(false, Ordering::Release);
                    // Bayrağı bıraktıktan hemen sonra gelen isteği kaçırma.
                    let waiting = pending.lock().is_ok_and(|p| !p.is_empty());
                    if !waiting || running.swap(true, Ordering::AcqRel) {
                        break;
                    }
                }
            });
        if spawned.is_err() {
            self.worker_running.store(false, Ordering::Release);
        }
    }
}

/// İstenen klasörleri (ya da hepsini) tarar; bir klasördeki sorun diğerlerini durdurmaz.
/// Bütün klasörler tek bir tarama sayılır: `scanning` bayrağı klasörler arasında düşmez (KUT-09).
/// Döner: sorunlar ve kütüphanenin değişip değişmediği (şarkı eklendi, güncellendi ya da çıktı).
fn run_scan(
    library: &Mutex<Library>,
    scan: &ScanState,
    request: &ScanRequest,
) -> (Vec<String>, bool) {
    let folders = match library.lock() {
        Ok(lib) => match lib.folders() {
            Ok(folders) => folders,
            Err(e) => return (vec![e.to_string()], false),
        },
        Err(_) => return (vec!["Kütüphane kilitlenemedi".to_owned()], false),
    };
    scan.set_scanning(true);
    let mut changed = false;
    let mut problems = Vec::new();
    for folder in &folders {
        // `None`: bütün kaynak; `Some`: yalnızca o alt klasör.
        for within in request.scopes_of(folder) {
            match scan::scan_folder_within(library, folder, within, scan) {
                Ok(summary) => {
                    changed |= summary.updated + summary.removed > 0;
                    problems.extend(scan_problems(&folder.path, &summary));
                }
                Err(e) => problems.push(e.to_string()),
            }
        }
    }
    scan.set_scanning(false);
    (problems, changed)
}

/// Bir klasör taramasının kullanıcıya gösterilecek sorunları; sorun yoksa boş döner.
fn scan_problems(path: &str, summary: &scan::ScanSummary) -> Vec<String> {
    let mut problems = Vec::new();
    if summary.suspicious > 0 {
        problems.push(format!(
            "{path}: kütüphanedeki {} şarkı bulunamadı (disk takılı değil, ağ paylaşımı bağlı \
             değil ya da klasör taşınmış olabilir); şarkılar kütüphaneden çıkarılmadı.",
            summary.suspicious
        ));
    }
    if summary.unreadable > 0 {
        problems.push(format!(
            "{path}: {} alt klasör ya da dosya okunamadı (izin, ağ ya da disk hatası); \
             oradaki şarkılara dokunulmadı.",
            summary.unreadable
        ));
    }
    if summary.failed > 0 {
        problems.push(format!(
            "{path}: {} dosya açılamadı (kodek desteklenmiyor ya da dosya bozuk); \
             kütüphaneye eklenmedi.",
            summary.failed
        ));
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::temp_path;
    use std::time::{Duration, Instant};

    fn wait_idle(service: &LibraryService) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while service.is_scanning() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert!(!service.is_scanning(), "tarama bitmedi");
    }

    fn folder_with_songs() -> std::path::PathBuf {
        let dir = temp_path("servis-muzik");
        std::fs::create_dir_all(&dir).unwrap();
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data");
        for ext in ["mp3", "flac"] {
            let name = format!("uc-uc-ton.{ext}");
            std::fs::copy(data.join(&name), dir.join(name)).unwrap();
        }
        dir
    }

    #[test]
    fn tarama_sorunlari_acilamayan_ve_supheli_silmeyi_bildirir() {
        let summary = scan::ScanSummary {
            failed: 2,
            suspicious: 5,
            ..scan::ScanSummary::default()
        };
        let problems = scan_problems("D:\\Müzik", &summary);
        assert_eq!(problems.len(), 2, "{problems:?}");
        assert!(problems[0].contains("5 şarkı bulunamadı"));
        assert!(problems[1].contains("2 dosya açılamadı"));
        assert!(scan_problems("D:\\Müzik", &scan::ScanSummary::default()).is_empty());
    }

    #[test]
    fn birakilan_acilamayan_dosya_eklenmez_sirada_olmaz_ve_nedeni_soylenir() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let elsewhere = temp_path("servis-acilamayan");
        std::fs::create_dir_all(&elsewhere).unwrap();
        // Uzantısı ses dosyası, içeriği çözülemiyor (desteklenmeyen kodek ya da bozuk dosya).
        let bad = elsewhere.join("klip.webm");
        std::fs::write(&bad, b"bozuk".repeat(50)).unwrap();

        let outcome = service.add_dropped(&[bad]);
        assert!(outcome.tracks.is_empty());
        assert_eq!(outcome.added_tracks, 0);
        assert_eq!(outcome.problems.len(), 1, "{:?}", outcome.problems);
        assert!(outcome.problems[0].starts_with("klip.webm: "));
        wait_idle(&service);
        assert!(
            service.status().unwrap().folders.is_empty(),
            "ölü kaynak eklenmemeli"
        );
    }

    #[test]
    fn klasor_eklenince_arka_planda_taranir() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        service.add_folder(&folder_with_songs()).unwrap();
        wait_idle(&service);
        let status = service.status().unwrap();
        assert_eq!(status.track_count, 2);
        assert_eq!(status.folders.len(), 1);
        assert!(status.problems.is_empty());
        assert_eq!(service.search("üç ton", None).unwrap().len(), 2);
    }

    #[test]
    fn eksik_klasor_digerlerini_durdurmaz_ve_sorun_olarak_bildirilir() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        service
            .lock()
            .unwrap()
            .add_folder("/olmayan/klasor")
            .unwrap();
        service.add_folder(&folder_with_songs()).unwrap();
        wait_idle(&service);
        // Programın açılışındaki (ya da "Yeniden tara") tam tarama.
        service.request_scan();
        wait_idle(&service);
        let status = service.status().unwrap();
        assert_eq!(status.track_count, 2);
        assert_eq!(status.problems.len(), 1);
        assert!(status.problems[0].contains("/olmayan/klasor"));
    }

    #[test]
    fn olmayan_klasor_eklenemez() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let error = service.add_folder(Path::new("/olmayan/yer")).unwrap_err();
        assert!(matches!(error, LibraryError::FolderMissing(_)));
        assert!(service.status().unwrap().folders.is_empty());
    }

    #[test]
    fn desteklenmeyen_dosya_eklenemez() {
        // Pencereye ses dosyası olmayan bir dosya bırakılınca anlaşılır bir hata verilir.
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let file = folder_with_songs().join("notlar.txt");
        std::fs::write(&file, "merhaba").unwrap();
        let error = service.add_folder(&file).unwrap_err();
        assert!(matches!(error, LibraryError::UnsupportedFile(_)));
        assert!(error.to_string().contains("notlar.txt"));
        assert!(service.status().unwrap().folders.is_empty());
    }

    #[test]
    fn birakilanlar_eklenir_sarkilar_calinmak_uzere_doner() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let dir = folder_with_songs();
        let elsewhere = temp_path("servis-birakilan");
        std::fs::create_dir_all(&elsewhere).unwrap();
        let song = elsewhere.join("Gece Otoyolu.FLAC");
        std::fs::copy(dir.join("uc-uc-ton.flac"), &song).unwrap();
        // Desteklenmeyen tür: eskiden uzantı listede yok diye klasör sanılıyordu.
        let wma = elsewhere.join("Eski Kayıt.wma");
        std::fs::write(&wma, "değil").unwrap();
        // Zip içinden sürüklenen dosya gibi diskte olmayan yol.
        let missing = elsewhere.join("yok.mp3");

        let outcome = service.add_dropped(&[dir.clone(), wma, song.clone(), missing]);
        assert_eq!(outcome.tracks, vec![song.to_string_lossy().into_owned()]);
        assert_eq!((outcome.added_folders, outcome.added_tracks), (1, 1));
        assert_eq!(outcome.already, 0);
        assert_eq!(outcome.problems.len(), 2, "{:?}", outcome.problems);
        assert_eq!(
            outcome.problems[0],
            "Bu dosya türü desteklenmiyor: Eski Kayıt.wma"
        );
        assert!(outcome.problems[1].contains("yok.mp3"));
        wait_idle(&service);
        let status = service.status().unwrap();
        assert_eq!(status.folders.len(), 2);
        assert_eq!(status.track_count, 3);

        // Zaten kütüphanede olan şarkılar yine çalınır, iki kez eklenmez.
        let inside = dir.join("uc-uc-ton.mp3");
        let again = service.add_dropped(&[song.clone(), inside.clone(), dir]);
        assert_eq!(
            again.tracks,
            vec![
                song.to_string_lossy().into_owned(),
                inside.to_string_lossy().into_owned()
            ]
        );
        assert_eq!((again.added_folders, again.added_tracks), (0, 0));
        assert_eq!(again.already, 3);
        assert!(again.problems.is_empty(), "{:?}", again.problems);
        assert_eq!(service.status().unwrap().folders.len(), 2);
    }

    #[test]
    fn tek_sarki_eklenir_taranir_ve_cikarilir() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let dir = folder_with_songs();
        // Windows'ta sık görülen büyük harfli uzantı.
        let song = dir.join("Gülümse.MP3");
        std::fs::rename(dir.join("uc-uc-ton.mp3"), &song).unwrap();
        let source = service.add_folder(&song).unwrap();
        wait_idle(&service);
        let status = service.status().unwrap();
        assert_eq!(status.track_count, 1, "yalnızca seçilen şarkı");
        assert!(status.problems.is_empty(), "{:?}", status.problems);
        assert_eq!(
            service.search("", None).unwrap()[0].path,
            song.to_string_lossy()
        );

        // Yeniden tarama şarkıyı korur; kaynak çıkarılınca şarkı da çıkar.
        service.request_scan();
        wait_idle(&service);
        assert_eq!(service.status().unwrap().track_count, 1);
        service.remove_folder(source.id).unwrap();
        assert_eq!(service.status().unwrap().track_count, 0);
    }

    #[test]
    fn ayni_sarki_iki_kez_eklenmez() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let dir = folder_with_songs();
        service.add_folder(&dir).unwrap();
        wait_idle(&service);

        // Klasörü zaten kütüphanede olan şarkı ayrıca eklenmez.
        let error = service.add_folder(&dir.join("uc-uc-ton.flac")).unwrap_err();
        assert!(matches!(error, LibraryError::AlreadyCovered(_)), "{error}");
        assert!(error.to_string().contains(&*dir.to_string_lossy()));
        // Aynı klasör de iki kez eklenmez.
        assert!(matches!(
            service.add_folder(&dir).unwrap_err(),
            LibraryError::FolderExists
        ));
        assert_eq!(service.status().unwrap().folders.len(), 1);
    }

    #[test]
    fn klasor_icindeki_tek_sarkilarin_yerini_alir() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let dir = folder_with_songs();
        service.add_folder(&dir.join("uc-uc-ton.mp3")).unwrap();
        wait_idle(&service);
        assert_eq!(service.status().unwrap().track_count, 1);
        // Şarkının analizi önbellekte (aynı veritabanı).
        let song = dir
            .join("uc-uc-ton.mp3")
            .to_string_lossy()
            .replace('\'', "''");
        service.lock().unwrap().execute_for_test(&format!(
            "INSERT INTO analyses (path, file_size, modified, version, frames, levels, meters, onset)
             SELECT path, file_size, modified, 1, 0, x'', x'', x'' FROM tracks WHERE path = '{song}'"
        ));

        // Sonra bütün klasör eklenince tek şarkı kaynağı kalkar, şarkılar klasörden gelir.
        service.add_folder(&dir).unwrap();
        wait_idle(&service);
        let status = service.status().unwrap();
        assert_eq!(status.folders.len(), 1);
        assert_eq!(status.folders[0].path, dir.to_string_lossy());
        assert_eq!(status.track_count, 2);
        // Şarkı silinip yeniden eklenmedi: analizi (ve etiketi) korunur, baştan analiz edilmez.
        let analyses = service
            .lock()
            .unwrap()
            .count_for_test("SELECT COUNT(*) FROM analyses");
        assert_eq!(analyses, 1, "analiz silinmemeli");
    }

    #[test]
    fn yeni_kaynak_eklenince_yalnizca_o_taranir() {
        // Büyük kütüphanede tek şarkı eklemek (ya da pencereye bırakmak) bütün kaynakları
        // yeniden taramamalı.
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let first = folder_with_songs();
        service.add_folder(&first).unwrap();
        wait_idle(&service);
        assert_eq!(service.status().unwrap().track_count, 2);

        // İlk klasörden bir dosya silinir; o klasör yeniden taranırsa şarkı listeden çıkar.
        std::fs::remove_file(first.join("uc-uc-ton.flac")).unwrap();
        let second = folder_with_songs();
        service.add_folder(&second.join("uc-uc-ton.mp3")).unwrap();
        wait_idle(&service);
        assert_eq!(
            service.status().unwrap().track_count,
            3,
            "ilk klasör taranmadı, yeni şarkı eklendi"
        );

        // "Yeniden tara" yine her şeyi tarar.
        service.request_scan();
        wait_idle(&service);
        assert_eq!(service.status().unwrap().track_count, 2);
    }

    /// Testlerde kısa süreler (programdakiler: [`watch::DEFAULT_TIMING`]).
    const FAST: watch::Timing = watch::Timing {
        quiet: Duration::from_millis(150),
        cap: Duration::from_secs(1),
        slow_after: Duration::from_secs(2),
        slow_quiet: Duration::from_secs(3),
        slow_cap: Duration::from_secs(10),
        heal: Duration::from_secs(600),
        backstop: Duration::from_secs(600),
    };

    /// Koşul sağlanana kadar bekler (en çok 10 sn; sağlanır sağlanmaz döner).
    fn wait_until(what: &str, mut ok: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while !ok() {
            assert!(Instant::now() < deadline, "beklenen olmadı: {what}");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn watching_service(timing: watch::Timing) -> LibraryService {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        service.start_watching_with(timing);
        service
    }

    /// Klasörün adını değiştirir; Windows'ta bir dosya kısa süre açık kalırsa (tarayıcı,
    /// virüs tarayıcısı, dizin izleme) birkaç kez yeniden dener.
    fn rename_retrying(from: &Path, to: &Path) {
        let mut tries = 0;
        while let Err(error) = std::fs::rename(from, to) {
            tries += 1;
            assert!(tries < 20, "ad değiştirilemedi: {error}");
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    fn track_count(service: &LibraryService) -> usize {
        service.status().unwrap().track_count
    }

    #[test]
    fn izlenen_klasore_eklenen_ve_silinen_sarki_kendiliginden_islenir() {
        let service = watching_service(FAST);
        let changes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = Arc::clone(&changes);
        service.set_on_change(move || {
            counter.fetch_add(1, Ordering::Relaxed);
        });
        let dir = folder_with_songs();
        service.add_folder(&dir).unwrap();
        wait_idle(&service);
        assert_eq!(track_count(&service), 2);
        wait_until("klasör izleniyor", || service.watcher.watched_count() == 1);
        let after_add = changes.load(Ordering::Relaxed);
        assert!(after_add >= 1, "ilk tarama da bildirilir");

        // yt-dlp gibi: önce ara dosya yazılır, sonra adı değişir; alt klasöre de iner.
        let sub = dir.join("İndirilenler");
        std::fs::create_dir_all(&sub).unwrap();
        let part = sub.join("yeni şarkı.mp3.part");
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data");
        std::fs::copy(data.join("uc-uc-ton.mp3"), &part).unwrap();
        std::fs::rename(&part, sub.join("yeni şarkı.mp3")).unwrap();
        wait_until("yeni şarkı kütüphanede", || track_count(&service) == 3);
        wait_until("değişiklik arayüze bildirildi", || {
            changes.load(Ordering::Relaxed) > after_add
        });

        // Silinen şarkı kütüphaneden çıkar.
        std::fs::remove_file(dir.join("uc-uc-ton.flac")).unwrap();
        wait_until("silinen şarkı çıktı", || track_count(&service) == 2);

        // İçi şarkı dolu bir klasör içeri taşınır (tek bir ad değişikliği olayı).
        let outside = temp_path("servis-tasinan");
        std::fs::create_dir_all(outside.join("CD1")).unwrap();
        std::fs::copy(data.join("uc-uc-ton.flac"), outside.join("CD1/albüm.flac")).unwrap();
        std::fs::rename(&outside, dir.join("Taşınan Albüm")).unwrap();
        wait_until("taşınan klasörün şarkısı kütüphanede", || {
            track_count(&service) == 3
        });
        service.shutdown();
    }

    #[test]
    fn izleme_yalnizca_degisen_alt_klasoru_tarar() {
        let service = watching_service(FAST);
        let dir = folder_with_songs();
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data");
        std::fs::create_dir_all(dir.join("DLP")).unwrap();
        service.add_folder(&dir).unwrap();
        wait_idle(&service);
        wait_until("klasör izleniyor", || service.watcher.watched_count() == 1);

        // Kökteki bir şarkının kaydı kütüphaneden silinir (bütün kaynak taranırsa geri gelirdi);
        // DLP'ye şarkı inince yalnızca DLP taranır, kök dolaşılmaz.
        service
            .lock()
            .unwrap()
            .execute_for_test("DELETE FROM tracks WHERE path LIKE '%uc-uc-ton.flac'");
        assert_eq!(track_count(&service), 1);
        std::fs::copy(data.join("uc-uc-ton.mp3"), dir.join("DLP/indirilen.mp3")).unwrap();
        wait_until("indirilen şarkı kütüphanede", || {
            track_count(&service) == 2
        });
        wait_idle(&service);
        let paths: Vec<String> = service
            .search("", None)
            .unwrap()
            .into_iter()
            .map(|t| t.path)
            .collect();
        assert!(
            !paths.iter().any(|p| p.ends_with("uc-uc-ton.flac")),
            "kök taranmadı: {paths:?}"
        );
        service.shutdown();
    }

    #[test]
    fn guvenlik_agi_taramasi_kacirilan_degisikligi_bulur() {
        // Olay kaybolmuş gibi (Windows arabelleği taştı): kütüphane diskten geri kalır.
        let service = watching_service(watch::Timing {
            backstop: Duration::from_millis(400),
            ..FAST
        });
        service.add_folder(&folder_with_songs()).unwrap();
        wait_idle(&service);
        service
            .lock()
            .unwrap()
            .execute_for_test("DELETE FROM tracks WHERE path LIKE '%uc-uc-ton.flac'");
        assert_eq!(track_count(&service), 1);
        wait_until("güvenlik ağı taraması şarkıyı geri getirdi", || {
            track_count(&service) == 2
        });
        service.shutdown();
    }

    #[test]
    fn kaybolup_geri_gelen_klasor_yeniden_izlenir_ve_taranir() {
        // USB çıkarılıp yeniden takıldı: izleme (Windows'ta sessizce) düştü.
        let service = watching_service(watch::Timing {
            heal: Duration::from_millis(200),
            ..FAST
        });
        let dir = folder_with_songs();
        let folder = service.add_folder(&dir).unwrap();
        wait_idle(&service);
        wait_until("klasör izleniyor", || service.watcher.watched_count() == 1);

        let unplugged = temp_path("servis-usb-cikarildi");
        rename_retrying(&dir, &unplugged);
        wait_until("kaybolan klasör izlenemiyor", || {
            service.watcher.unwatched().contains(&folder.id)
        });
        // Bu arada bir şarkı eklenmişti; geri takıldı.
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data");
        std::fs::copy(data.join("uc-uc-ton.mp3"), unplugged.join("yeni.mp3")).unwrap();
        rename_retrying(&unplugged, &dir);
        wait_until("yeniden izleniyor", || service.watcher.watched_count() == 1);
        wait_until("geri gelen klasör tarandı", || track_count(&service) == 3);
        service.shutdown();
    }

    #[test]
    fn cikarilan_klasor_artik_izlenmez() {
        let service = watching_service(FAST);
        let dir = folder_with_songs();
        let folder = service.add_folder(&dir).unwrap();
        wait_idle(&service);
        wait_until("klasör izleniyor", || service.watcher.watched_count() == 1);

        service.remove_folder(folder.id).unwrap();
        wait_until("izleme bitti", || service.watcher.watched_count() == 0);
        let flushes = service.watcher.flush_count();
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data");
        std::fs::copy(data.join("uc-uc-ton.mp3"), dir.join("sonradan.mp3")).unwrap();
        // Biriktirme süresinin birkaç katı beklenir: tarama istenmemeli.
        std::thread::sleep(FAST.quiet * 4);
        assert_eq!(service.watcher.flush_count(), flushes, "tarama istenmemeli");
        wait_idle(&service);
        let status = service.status().unwrap();
        assert!(status.folders.is_empty());
        assert_eq!(status.track_count, 0);
        service.shutdown();
    }

    #[test]
    fn tek_sarki_kaynaklari_izlenmez_pencereye_donunce_taranir() {
        let service = watching_service(FAST);
        let dir = folder_with_songs();
        let song = service.add_folder(&dir.join("uc-uc-ton.mp3")).unwrap();
        wait_idle(&service);
        wait_until("tek şarkı izlenmiyor", || {
            service.watcher.unwatched() == vec![song.id]
        });
        assert_eq!(service.watcher.watched_count(), 0);
        assert!(service.status().unwrap().problems.is_empty());

        // Şarkı diskten kalkar; pencereye dönüş taraması onu yeniden tarar ve durumu bildirir.
        std::fs::remove_file(dir.join("uc-uc-ton.mp3")).unwrap();
        service.focus_rescan();
        wait_until("tek şarkı kaynağı tarandı", || {
            let problems = service.status().unwrap().problems;
            problems.iter().any(|p| p.contains("uc-uc-ton.mp3"))
        });
        service.shutdown();
    }

    #[test]
    fn pencereye_donus_taramasi_seyrek_yapilir() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        let start = Instant::now();
        assert!(service.focus_due(start));
        // Bir dakika içinde yeniden odak: tarama yok.
        assert!(!service.focus_due(start + Duration::from_secs(30)));
        assert!(service.focus_due(start + Duration::from_secs(61)));
    }

    #[test]
    fn alt_klasor_istekleri_birlesir() {
        let folder = FolderRow {
            id: 1,
            path: "/d".to_owned(),
            track_count: 0,
            single: false,
        };
        let request = ScanRequest {
            parts: vec![
                (1, PathBuf::from("/d/DLP/alt")),
                (2, PathBuf::from("/e/x")),
                (1, PathBuf::from("/d/DLP")),
                (1, PathBuf::from("/d/Müzik")),
            ],
            ..ScanRequest::default()
        };
        assert_eq!(
            request.scopes_of(&folder),
            vec![Some(Path::new("/d/DLP")), Some(Path::new("/d/Müzik"))]
        );
        // İsteği olmayan kaynak taranmaz.
        let other = FolderRow {
            id: 3,
            path: "/f".to_owned(),
            ..folder.clone()
        };
        assert!(request.scopes_of(&other).is_empty());
        // Bütün kaynak da isteniyorsa alt klasörler ayrıca taranmaz.
        let whole = ScanRequest {
            folders: vec![1],
            ..request
        };
        assert_eq!(whole.scopes_of(&folder), vec![None]);
    }

    #[test]
    fn biriken_alt_klasor_istekleri_sinirda_butun_kaynaga_doner() {
        let folder = FolderRow {
            id: 1,
            path: "/d".to_owned(),
            track_count: 0,
            single: false,
        };
        // Uzun bir tarama sürerken izleyici her seferinde sınırın altında alt klasör gönderir;
        // istekler birikir.
        let mut request = ScanRequest::default();
        let mut batch = 0;
        while request.parts.len() <= watch::MAX_SCOPES {
            for i in 0..watch::MAX_SCOPES / 2 {
                request
                    .parts
                    .push((1, PathBuf::from(format!("/d/{batch}-{i}"))));
            }
            batch += 1;
        }
        assert!(batch > 1, "birden çok istekte birikti");
        assert_eq!(
            request.scopes_of(&folder),
            vec![None],
            "tek bir bütün tarama"
        );
        // Sınırda (iç içe olanlar sayılmadan) alt klasörler ayrı ayrı taranır.
        let mut request = ScanRequest::default();
        for i in 0..watch::MAX_SCOPES {
            request.parts.push((1, PathBuf::from(format!("/d/{i}"))));
            request
                .parts
                .push((1, PathBuf::from(format!("/d/{i}/alt"))));
        }
        let scopes = request.scopes_of(&folder);
        assert_eq!(scopes.len(), watch::MAX_SCOPES);
        assert!(scopes.iter().all(Option::is_some));
    }

    #[test]
    fn ust_uste_tarama_istekleri_guvenle_birlesir() {
        let service = LibraryService::new(Library::open_in_memory().unwrap());
        service.add_folder(&folder_with_songs()).unwrap();
        for _ in 0..20 {
            service.request_scan();
        }
        wait_idle(&service);
        assert_eq!(service.status().unwrap().track_count, 2);
    }
}
