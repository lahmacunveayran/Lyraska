//! Klasör izleme: kütüphane klasörlerine sonradan eklenen, değişen, adı değişen ya da silinen
//! şarkıları kendiliğinden fark eder (ör. yt-dlp ile `D:\DLP`'ye indirilen şarkı).
//!
//! - Her klasör kaynağı alt klasörleriyle izlenir (Windows'ta `ReadDirectoryChangesW`; bütün bir
//!   sürücü, ör. `D:\`, de izlenebilir). Tek şarkı kaynakları izlenmez.
//! - Olaylar biriktirilir: son olaydan sonra [`Timing::quiet`] kadar sessizlik olunca (ya da ilk
//!   olaydan [`Timing::cap`] sonra) yalnızca değişikliğin olduğu **alt klasör** bir kez yeniden
//!   taranır ([`scan::scan_folder_within`]; değişmeyen dosyalar atlanır, silinen çıkarılır).
//!   Bütün bir sürücüde tek bir indirme bütün diski dolaştırmaz.
//! - Hâlâ yazılan şarkı (torrent istemcisi parça parça yazar) yazma bitene kadar beklenir: aynı
//!   dosyaya [`Timing::slow_after`]'dan uzun süredir yazılıyorsa [`Timing::slow_quiet`] kadar
//!   sessizlik beklenir (en çok [`Timing::slow_cap`]); yarım dosya tekrar tekrar çözülmez.
//! - Ses dosyası olmayan yollar ucuzca elenir. İçeri gelen klasör yalnızca içinde (sınırlı bir
//!   bakışla) şarkı varsa taramayı başlatır; şarkıları kütüphanede olan bir klasörün silinmesi de
//!   başlatır. Taranmayan sistem klasörlerindeki ([`scan::is_skipped_dir_name`]) olaylar yok
//!   sayılır.
//! - Kendini onaran izleme: Windows, izlenen klasör kaybolunca (USB çıkarıldı, ağ koptu) ya da
//!   G/Ç hatasında izlemeyi **sessizce** bırakır; hiçbir olay gelmez. Bu yüzden her
//!   [`Timing::heal`] aralığında izlenen köklerin yerinde olup olmadığına bakılır (bir `stat`).
//!   Sağlam izlemelere dokunulmaz: izlemeyi kapatıp açmak (Windows'ta `CancelIo`) o anda
//!   arabellekteki olayları atar. Kaybolan kökün izlemesi bırakılır; geri gelince yeniden kurulur
//!   ve kaynak **bütünüyle** taranır (arada başka bilgisayarda değişmiş olabilir; bütün kaynak
//!   taramasında "disk takılı değil" kuşkusu geçerlidir). İzleyici hata bildirdiyse ya da kökün
//!   kendisi silindiyse o izleme de yeniden kurulur ve kaynak bütünüyle taranır. Pencere
//!   küçültülmüş olsa da (müzik çalarken) çalışır.
//! - Güvenlik ağı: Windows olay arabelleği (16 KB) taşınca olaylar da sessizce kaybolur (notify
//!   Windows'ta "yeniden tara" işareti vermez). Kök iki bakış arasında kaybolup geri geldiyse
//!   (USB iki dakikadan kısa sürede çıkarılıp takıldı) ya da ağ hatası izlemeyi kök yerindeyken
//!   düşürdüyse bu da görünmez. Bu yüzden her [`Timing::backstop`] aralığında bütün izlemeler
//!   yenilenir ve hemen ardından bütün kaynaklar taranır (yenileme arasında kaçan olayı da bu
//!   tarama bulur).
//! - İzlenemeyen klasör bir kez günlüğe yazılır; pencereye dönülünce de taranır
//!   ([`super::service::LibraryService::on_window_focus`]).
//! - Bütün yavaş işler (izleme kurma, disk ve kütüphane soruları) tek bir iş parçacığında yapılır;
//!   çağıranlar yalnızca mesaj gönderir: çevrimdışı bir ağ sürücüsü kaynak ekleme/çıkarmayı ya da
//!   kapanışı bekletmez. İş parçacığı olay ya da zamanlayıcı gelene kadar uyur (yoklama yok).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::event::{ModifyKind, RenameMode};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use walkdir::WalkDir;

use super::{path_covers, scan, FolderRow, Library};
use crate::diagnostics;

/// İzlemenin zamanları.
#[derive(Debug, Clone, Copy)]
pub struct Timing {
    /// Son olaydan sonra beklenen sessizlik (indirme, kopyalama bitsin).
    pub quiet: Duration,
    /// İlk olaydan sonra en fazla bekleme: olaylar kesilmese de bu sürede bir tarama yapılır.
    pub cap: Duration,
    /// Aynı dosyaya bundan uzun süredir yazılıyorsa "yavaş yazılan" sayılır (torrent, ağ kopyası).
    pub slow_after: Duration,
    /// Yavaş yazılan dosya için beklenen sessizlik.
    pub slow_quiet: Duration,
    /// Yavaş yazılan dosya için en fazla bekleme (yazma hiç bitmese de bir kez taranır).
    pub slow_cap: Duration,
    /// İzlenen köklerin yerinde olup olmadığına bakılma, hatalı izlemelerin yeniden kurulma ve
    /// izlenemeyenlerin yeniden denenme aralığı.
    pub heal: Duration,
    /// Bütün izlemelerin yenilenip bütün kaynakların taranma (güvenlik ağı) aralığı.
    pub backstop: Duration,
}

/// Programın kullandığı süreler.
///
/// - `heal` 2 dk: her kök için bir `stat`; çıkarılıp yeniden takılan bir USB diski ya da geri gelen
///   bir ağ sürücüsü en geç iki dakikada yeniden izlenir ve taranır.
/// - `backstop` 30 dk: tarama değişmeyen dosyaları yalnızca listeler (etiket okumaz); yerel bir
///   SSD'de saniyeler sürer, ama yüz binlerce dosyalı bütün bir sabit diskte ya da ağ sürücüsünde
///   (NAS) birkaç dakika sürebilir (arka planda; arayüz beklemez). Kaybolan bir olay (arabellek taşması, iki bakış arasında düşen izleme) program
///   küçültülmüşken bile en geç yarım saatte yakalanır.
pub const DEFAULT_TIMING: Timing = Timing {
    quiet: Duration::from_secs(2),
    cap: Duration::from_secs(10),
    slow_after: Duration::from_secs(5),
    slow_quiet: Duration::from_secs(30),
    slow_cap: Duration::from_secs(10 * 60),
    heal: Duration::from_secs(2 * 60),
    backstop: Duration::from_secs(30 * 60),
};

/// Bir kaynakta en fazla bu kadar ayrı alt klasör taranır; fazlası bütün kaynağın taranması
/// (tarama kuyruğu da aynı sınırı uygular: [`super::service`]).
pub(super) const MAX_SCOPES: usize = 8;
/// İçeri gelen klasörde şarkı ararken bakılan en fazla girdi ve derinlik (büyük bir klasör
/// taşınsa da bakış kısa sürer; daha derindeki şarkıları güvenlik ağı taraması bulur).
const DIR_PROBE_ENTRIES: usize = 2000;
const DIR_PROBE_DEPTH: usize = 4;

/// Taranacak bir kaynak: `within` verilmişse yalnızca o alt klasörü.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Due {
    pub source: i64,
    pub within: Option<PathBuf>,
}

/// Bekleyen bir değişiklik: kaynak ve alt klasörü (`None`: bütün kaynak).
#[derive(Debug)]
struct Pending {
    source: i64,
    scope: Option<PathBuf>,
    first: Instant,
    last: Instant,
    /// İçinde yavaş yazılan bir dosya var.
    slow: bool,
}

/// Değişen yerleri biriktirir ve ne zaman taranacaklarına karar verir (saf; saati dışarıdan
/// alır, test edilebilir).
#[derive(Debug)]
pub struct Debouncer {
    timing: Timing,
    pending: Vec<Pending>,
    /// Yazılan şarkı dosyaları: ilk ve son yazma anı (yavaş yazılanı tanımak için).
    writes: HashMap<PathBuf, (Instant, Instant)>,
}

impl Debouncer {
    pub fn new(timing: Timing) -> Self {
        Self {
            timing,
            pending: Vec::new(),
            writes: HashMap::new(),
        }
    }

    /// `source` kaynağının `scope` alt klasöründe `now` anında değişiklik oldu. `written`: içeriği
    /// yazılan şarkı dosyası (yeni oluşturuldu ya da değişti).
    pub fn note(
        &mut self,
        source: i64,
        scope: Option<PathBuf>,
        written: Option<&Path>,
        now: Instant,
    ) {
        let slow = written.is_some_and(|path| {
            let quiet = self.timing.slow_quiet;
            let record = self.writes.entry(path.to_path_buf()).or_insert((now, now));
            if now.saturating_duration_since(record.1) > quiet {
                *record = (now, now); // uzun aradan sonra yeni bir yazma
            }
            record.1 = now;
            record.1.saturating_duration_since(record.0) >= self.timing.slow_after
        });
        match self
            .pending
            .iter_mut()
            .find(|p| p.source == source && p.scope == scope)
        {
            Some(pending) => {
                pending.last = now;
                pending.slow |= slow;
            }
            None => self.pending.push(Pending {
                source,
                scope,
                first: now,
                last: now,
                slow,
            }),
        }
    }

    fn deadline_of(&self, p: &Pending) -> Instant {
        let t = &self.timing;
        if p.slow {
            (p.last + t.slow_quiet).min(p.first + t.slow_cap)
        } else {
            (p.last + t.quiet).min(p.first + t.cap)
        }
    }

    /// Bekleyen değişiklik varsa en yakın taramanın anı.
    pub fn deadline(&self) -> Option<Instant> {
        self.pending.iter().map(|p| self.deadline_of(p)).min()
    }

    /// Vakti gelen yerleri kaynak başına birleştirip verir (alt klasörü kapsanan düşer, çok alt
    /// klasör bütün kaynağa döner).
    pub fn take_due(&mut self, now: Instant) -> Vec<Due> {
        let (due, waiting): (Vec<Pending>, Vec<Pending>) = std::mem::take(&mut self.pending)
            .into_iter()
            .partition(|p| self.deadline_of(p) <= now);
        self.pending = waiting;
        let quiet = self.timing.slow_quiet;
        self.writes
            .retain(|_, (_, last)| now.saturating_duration_since(*last) <= quiet);
        let mut sources: Vec<i64> = Vec::new();
        for p in &due {
            if !sources.contains(&p.source) {
                sources.push(p.source);
            }
        }
        let mut out = Vec::new();
        for source in sources {
            let scopes: Option<Vec<&PathBuf>> = due
                .iter()
                .filter(|p| p.source == source)
                .map(|p| p.scope.as_ref())
                .collect();
            match scopes.map(|s| outermost(&s)) {
                Some(scopes) if scopes.len() <= MAX_SCOPES => {
                    out.extend(scopes.into_iter().map(|scope| Due {
                        source,
                        within: Some(scope),
                    }));
                }
                _ => out.push(Due {
                    source,
                    within: None,
                }),
            }
        }
        out
    }
}

/// Başka birinin içinde olmayan klasörler (iç içe olanlardan dıştaki kalır), ilk görülme sırasıyla.
fn outermost(scopes: &[&PathBuf]) -> Vec<PathBuf> {
    let mut kept: Vec<PathBuf> = Vec::new();
    for scope in scopes {
        if kept.iter().any(|k| path_covers(k, scope)) {
            continue;
        }
        kept.retain(|k| !path_covers(scope, k));
        kept.push((*scope).clone());
    }
    kept
}

/// Bir olayın kütüphaneyi ilgilendirip ilgilendirmediğine karar verirken gereken sorular
/// (disk ve kütüphane; testlerde sahtesi kullanılır).
pub trait Probe {
    /// Bu bir klasörse içinde (sınırlı bir bakışla) şarkı var mı?
    fn dir_has_audio(&self, path: &Path) -> bool;
    /// Kütüphanede bu klasörün altında şarkı var mı?
    fn has_tracks_under(&self, path: &Path) -> bool;
}

/// Gerçek disk ve kütüphane.
struct LiveProbe {
    library: Arc<Mutex<Library>>,
}

impl Probe for LiveProbe {
    fn dir_has_audio(&self, path: &Path) -> bool {
        dir_has_audio(path)
    }

    fn has_tracks_under(&self, path: &Path) -> bool {
        // Kilit yalnızca tek sorgu boyunca tutulur. Bilinemiyorsa taranır (kaçırmaktansa).
        self.library
            .lock()
            .map_or(true, |lib| lib.has_tracks_under(path).unwrap_or(true))
    }
}

/// `path` bir klasörse içinde (en çok [`DIR_PROBE_DEPTH`] derinlikte, ilk [`DIR_PROBE_ENTRIES`]
/// girdide; taranmayan sistem klasörlerine girmeden) bir şarkı var mı? Dosyaysa `false` (bir
/// `stat` kadar ucuz). Steam, npm, OneDrive gibi şarkısız klasörler taramayı başlatmaz.
fn dir_has_audio(path: &Path) -> bool {
    WalkDir::new(path)
        .max_depth(DIR_PROBE_DEPTH)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            !(e.depth() > 0
                && e.file_type().is_dir()
                && e.file_name()
                    .to_str()
                    .is_some_and(scan::is_skipped_dir_name))
        })
        .take(DIR_PROBE_ENTRIES)
        .filter_map(Result::ok)
        .any(|e| e.depth() > 0 && e.file_type().is_file() && scan::is_audio(e.path()))
}

/// Bir değişikliğin türü.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    /// Şarkı ya da şarkılı klasör geldi, gitti, adı değişti.
    Structure,
    /// Şarkı dosyasının içeriği yazıldı (yeni dosya ya da değişen dosya; yazma sürüyor olabilir).
    Write,
}

/// `root` kaynağındaki `path` yolunda olan `kind` değişikliği yeniden taramayı gerektirir mi?
pub fn classify(kind: &EventKind, path: &Path, root: &Path, probe: &impl Probe) -> Option<Change> {
    let audio = scan::is_audio(path);
    if in_skipped_dir(path, root, audio) {
        return None;
    }
    let relevant = match kind {
        EventKind::Access(_) => return None,
        // Yeni ya da yazılan şarkı.
        EventKind::Create(_) | EventKind::Modify(ModifyKind::Data(_) | ModifyKind::Any)
            if audio =>
        {
            return Some(Change::Write);
        }
        // İçeri gelen klasör: içinde şarkı varsa.
        EventKind::Create(_) | EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
            audio || probe.dir_has_audio(path)
        }
        // Silinen ya da dışarı taşınan: artık diskte yok, kütüphaneye sorulur (dosya uzantılı
        // ses dışı yollar sorulmadan elenir: bütün bir sürücüde her silinen geçici dosya
        // kütüphane kilidini almasın).
        EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
            audio || may_be_folder(path) && probe.has_tracks_under(path)
        }
        // Yönü belli olmayan ad değişikliği: iki ihtimale de bakılır.
        EventKind::Modify(ModifyKind::Name(_)) => {
            audio
                || probe.dir_has_audio(path)
                || may_be_folder(path) && probe.has_tracks_under(path)
        }
        // Başka içerik değişiklikleri: yalnızca şarkılar.
        EventKind::Modify(_) | EventKind::Any | EventKind::Other => {
            return audio.then_some(Change::Write);
        }
    };
    relevant.then_some(Change::Structure)
}

/// Artık diskte olmayan (silinen) bir yol klasör olabilir mi? Uzantısı dosya uzantısına benzeyen
/// (1–5 ASCII harf/rakam, en az bir harf: `.jpg`, `.tmp`, `.mp3x`) yol klasör sayılmaz.
/// Uzantısız yollar ve "Vol. 2", "Mr. Bungle", "2023.05" gibi noktalı klasör adları klasör
/// olabilir. Nadiren adı dosyaya benzeyen bir klasör ("Disc.One") silinirse güvenlik ağı
/// taraması onu yakalar.
fn may_be_folder(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return true;
    };
    let file_like = (1..=5).contains(&ext.len())
        && ext.chars().all(|c| c.is_ascii_alphanumeric())
        && ext.chars().any(|c| c.is_ascii_alphabetic());
    !file_like
}

/// Değişikliğin taranacağı alt klasör: yolun bulunduğu klasör (içeri gelen bir klasörün kendisi
/// de böylece taranır). Kökün kendisi ya da kökteki bir yol için `None` (bütün kaynak).
fn scope_of(path: &Path, root: &Path) -> Option<PathBuf> {
    let parent = path.parent()?;
    if path_covers(parent, root) {
        return None;
    }
    Some(parent.to_path_buf())
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

/// İzlemeleri kaynaklarla eşitleme planı.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct SyncPlan {
    /// İzlemesi bırakılacak kökler.
    pub unwatch: Vec<PathBuf>,
    /// İzlenecek klasörler; üçüncü değer: izlenince bütünüyle taransın mı (izlenemezken ya da
    /// izleme bozukken değişiklik kaçırılmış olabilir).
    pub watch: Vec<(i64, PathBuf, bool)>,
    /// Bulunamayan (kaybolan ya da hiç olmayan) klasörler: izlenemiyor.
    pub missing: Vec<i64>,
    /// Tek şarkı kaynakları (izlenmez).
    pub files: Vec<i64>,
}

/// Eşitlemenin izlenen köklere ne yapacağı.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncMode {
    /// Yalnızca kaynak listesindeki değişiklikler (eklenen, çıkarılan); izlenenlere dokunulmaz.
    Sources,
    /// Onarma: kaybolan kökün izlemesi bırakılır; hata bildiren (`suspect`) izleme yeniden kurulur.
    /// Sağlam izlemelere dokunulmaz (yeniden kurmak arabellekteki olayları atar).
    Heal,
    /// Yenileme (güvenlik ağı taramasından hemen önce): yerinde olan bütün izlemeler yeniden
    /// kurulur. Gerekçe: Windows'ta notify, kök kaybolup iki bakış arasında geri geldiğinde ya da
    /// bilinmeyen bir G/Ç hatasında (ağ kopması) izlemeyi kök yerindeyken sessizce bırakır ve
    /// bunu soracak bir yol yoktur. Arada kaçan olayları ardından gelen bütün kaynak taraması
    /// bulur; bu yüzden sağlam izlemeler burada ayrıca taranmak üzere işaretlenmez.
    Refresh,
}

/// İzlemeleri kaynaklarla eşitleme planı (saf). `roots`: şu an izlenenler; `failed`: izlenemeyen
/// (izlenince bütünüyle taranacak) klasör kaynakları; `suspect`: izleyicisi hata bildiren ya da
/// kökü silinen kaynaklar (bkz. [`SyncMode`]).
pub fn plan_sync(
    folders: &[FolderRow],
    roots: &[(i64, PathBuf)],
    failed: &HashSet<i64>,
    suspect: &HashSet<i64>,
    mode: SyncMode,
    exists: impl Fn(&Path) -> bool,
    is_file: impl Fn(&Path) -> bool,
) -> SyncPlan {
    let mut plan = SyncPlan::default();
    for (id, root) in roots {
        if !folders
            .iter()
            .any(|f| f.id == *id && Path::new(&f.path) == root)
        {
            plan.unwatch.push(root.clone());
        }
    }
    for folder in folders {
        let path = PathBuf::from(&folder.path);
        let watched = roots
            .iter()
            .any(|(id, root)| *id == folder.id && *root == path);
        if watched {
            if mode == SyncMode::Sources {
                continue;
            }
            let suspect = suspect.contains(&folder.id);
            if !exists(&path) {
                // Kaybolan kök: izleme bırakılır; geri gelince yeniden kurulur ve taranır.
                plan.unwatch.push(path);
                plan.missing.push(folder.id);
            } else if suspect || mode == SyncMode::Refresh {
                plan.unwatch.push(path.clone());
                plan.watch.push((folder.id, path, suspect));
            }
        } else if folder.single || is_file(&path) {
            // Tek şarkı kaynağı (yeni eklenende `single` taramadan sonra dolar: diske bakılır).
            plan.files.push(folder.id);
        } else if exists(&path) {
            plan.watch
                .push((folder.id, path, failed.contains(&folder.id)));
        } else {
            plan.missing.push(folder.id);
        }
    }
    plan
}

enum Message {
    Event(notify::Result<Event>),
    /// Kaynaklar değişti: izlemeleri eşitle.
    Sync,
    /// İzlemeleri onar, izlenemeyenleri yeniden dene (pencereye dönüldü).
    Heal,
    Stop,
}

/// İş parçacığının dışarıya gösterdiği durum.
#[derive(Debug, Default)]
struct Published {
    watched: usize,
    unwatched: Vec<i64>,
}

/// Kütüphane klasörlerinin izleyicisi; [`super::LibraryService`] sahiplenir.
#[derive(Default)]
pub struct FolderWatcher {
    tx: Mutex<Option<mpsc::Sender<Message>>>,
    published: Arc<Mutex<Published>>,
    /// Kaç kez tarama istendi (testler için).
    flushes: Arc<AtomicUsize>,
}

impl FolderWatcher {
    /// İzlemeyi başlatır: işletim sistemi izleyicisini kurar ve iş parçacığını açar; klasörler
    /// iş parçacığında izlemeye alınır. Vakti gelen yerler `on_due` ile taramaya gönderilir.
    /// İkinci çağrı bir şey yapmaz.
    pub fn start(
        &self,
        timing: Timing,
        library: Arc<Mutex<Library>>,
        on_due: impl Fn(Vec<Due>) + Send + 'static,
    ) {
        let Ok(mut slot) = self.tx.lock() else {
            return;
        };
        if slot.is_some() {
            return;
        }
        let (tx, rx) = mpsc::channel();
        let events = tx.clone();
        let watcher = match notify::recommended_watcher(move |event| {
            let _ = events.send(Message::Event(event));
        }) {
            Ok(watcher) => Some(watcher),
            Err(error) => {
                // İş parçacığı yine çalışır: onarma, güvenlik ağı ve pencereye dönüş taraması.
                diagnostics::error(&format!(
                    "Klasör izleme başlatılamadı: {error}. Yeni şarkılar arada bir taranarak bulunur."
                ));
                None
            }
        };
        let flushes = Arc::clone(&self.flushes);
        let mut worker = Worker {
            watcher,
            timing,
            probe: LiveProbe { library },
            roots: Vec::new(),
            failed: HashSet::new(),
            suspect: HashSet::new(),
            logged: HashSet::new(),
            debouncer: Debouncer::new(timing),
            published: Arc::clone(&self.published),
            on_due: Box::new(move |due| {
                flushes.fetch_add(1, Ordering::Relaxed);
                on_due(due);
            }),
        };
        let spawned = std::thread::Builder::new()
            .name("lyraska-klasor-izleme".to_owned())
            .spawn(move || worker.run(&rx));
        match spawned {
            Ok(_) => {
                let _ = tx.send(Message::Sync);
                *slot = Some(tx);
            }
            Err(error) => {
                diagnostics::error(&format!("Klasör izleme iş parçacığı açılamadı: {error}"));
            }
        }
    }

    fn send(&self, message: Message) {
        if let Some(tx) = self.tx.lock().ok().and_then(|tx| tx.clone()) {
            let _ = tx.send(message);
        }
    }

    /// Kaynaklar değişti: izlemeler arka planda eşitlenir (beklemez).
    pub fn request_sync(&self) {
        self.send(Message::Sync);
    }

    /// İzlemeleri arka planda onarır ve izlenemeyenleri yeniden dener (beklemez; bkz.
    /// [`SyncMode::Heal`]).
    pub fn request_heal(&self) {
        self.send(Message::Heal);
    }

    /// İzlenemeyen kaynaklar (tek şarkılar ve izlenemeyen klasörler). İzleme başlatılmadıysa boş.
    pub fn unwatched(&self) -> Vec<i64> {
        self.published
            .lock()
            .map(|p| p.unwatched.clone())
            .unwrap_or_default()
    }

    /// İzlenen klasör sayısı.
    pub fn watched_count(&self) -> usize {
        self.published.lock().map(|p| p.watched).unwrap_or(0)
    }

    /// Kaç kez tarama istendi (testler için).
    #[cfg(test)]
    pub fn flush_count(&self) -> usize {
        self.flushes.load(Ordering::Relaxed)
    }

    /// İzlemeyi durdurur (program kapanırken). Beklemez: iş parçacığı mesajı alınca çıkar ve
    /// işletim sistemi izleyicisini kapatır.
    pub fn stop(&self) {
        if let Some(tx) = self.tx.lock().ok().and_then(|mut tx| tx.take()) {
            let _ = tx.send(Message::Stop);
        }
    }
}

/// İzleme iş parçacığının durumu; yalnızca o iş parçacığı dokunur (kilit yok).
struct Worker {
    watcher: Option<RecommendedWatcher>,
    timing: Timing,
    probe: LiveProbe,
    /// İzlenen klasörler: kaynak kimliği ve kök yolu.
    roots: Vec<(i64, PathBuf)>,
    /// İzlenemeyen klasör kaynakları (izlenince bütünüyle taranır).
    failed: HashSet<i64>,
    /// İzleyicisi hata bildiren ya da kökü silinen kaynaklar: bir sonraki onarmada izlemesi
    /// yeniden kurulur ve bütünüyle taranır.
    suspect: HashSet<i64>,
    /// Günlüğe bir kez yazılan izleme sorunları (her denemede yinelenmesin).
    logged: HashSet<PathBuf>,
    debouncer: Debouncer,
    published: Arc<Mutex<Published>>,
    on_due: Box<dyn Fn(Vec<Due>) + Send>,
}

impl Worker {
    /// Olay, mesaj ya da zamanlayıcı gelene kadar uyur.
    fn run(&mut self, rx: &mpsc::Receiver<Message>) {
        let mut next_heal = Instant::now() + self.timing.heal;
        let mut next_backstop = Instant::now() + self.timing.backstop;
        let mut error_logged = false;
        loop {
            let wake = self
                .debouncer
                .deadline()
                .map_or(next_heal.min(next_backstop), |d| {
                    d.min(next_heal).min(next_backstop)
                });
            let message = match rx.recv_timeout(wake.saturating_duration_since(Instant::now())) {
                Ok(message) => Some(message),
                Err(mpsc::RecvTimeoutError::Timeout) => None,
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            };
            match message {
                Some(Message::Stop) => return,
                Some(Message::Event(Ok(event))) => self.handle(&event),
                Some(Message::Event(Err(error))) => {
                    self.mark_suspect(&error.paths);
                    // Hata bir kez günlüğe yazılır (yinelenen hata günlüğü doldurmasın).
                    if !error_logged {
                        error_logged = true;
                        diagnostics::error(&format!("Klasör izleme hatası: {error}"));
                    }
                }
                Some(Message::Sync) => self.sync(SyncMode::Sources),
                Some(Message::Heal) => {
                    self.sync(SyncMode::Heal);
                    next_heal = Instant::now() + self.timing.heal;
                }
                None => {}
            }
            let now = Instant::now();
            if now >= next_backstop {
                // Önce izlemeler yenilenir, sonra taranır: yenileme arasında kaçan olay da
                // taramada bulunur (bkz. [`SyncMode::Refresh`]).
                self.sync(SyncMode::Refresh);
                next_heal = Instant::now() + self.timing.heal;
                self.backstop();
                next_backstop = Instant::now() + self.timing.backstop;
            } else if now >= next_heal {
                self.sync(SyncMode::Heal);
                next_heal = Instant::now() + self.timing.heal;
            }
            let due = self.debouncer.take_due(Instant::now());
            if !due.is_empty() {
                (self.on_due)(due);
            }
        }
    }

    fn handle(&mut self, event: &Event) {
        let now = Instant::now();
        // Olayları kaçırdığını söyleyen izleyici (Windows'ta söylemez; bkz. modül belgesi).
        if event.need_rescan() {
            for (id, _) in &self.roots {
                self.debouncer.note(*id, None, None, now);
            }
            return;
        }
        for path in &event.paths {
            let Some((id, root)) = self.roots.iter().find(|(_, root)| path_covers(root, path))
            else {
                continue;
            };
            // Kökün kendisi silindi ya da taşındı: izleme düşmüş olabilir (onarmada bakılır).
            if path_covers(path, root)
                && matches!(
                    event.kind,
                    EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
                )
            {
                self.suspect.insert(*id);
            }
            if let Some(change) = classify(&event.kind, path, root, &self.probe) {
                let written = (change == Change::Write).then_some(path.as_path());
                self.debouncer.note(*id, scope_of(path, root), written, now);
            }
        }
    }

    /// İzleyici hata bildirdi: yolları verilmişse onları kapsayan izlemeler, verilmemişse hepsi
    /// bir sonraki onarmada yeniden kurulur ve taranır.
    fn mark_suspect(&mut self, paths: &[PathBuf]) {
        for (id, root) in &self.roots {
            if paths.is_empty()
                || paths
                    .iter()
                    .any(|p| path_covers(root, p) || path_covers(p, root))
            {
                self.suspect.insert(*id);
            }
        }
    }

    fn folders(&self) -> Option<Vec<FolderRow>> {
        let result = match self.probe.library.lock() {
            Ok(lib) => lib.folders(),
            Err(_) => return None,
        };
        result
            .map_err(|e| diagnostics::error(&format!("Klasör izleme güncellenemedi: {e}")))
            .ok()
    }

    /// İzlemeleri kaynaklarla eşitler (bkz. [`plan_sync`]); sonucu yayımlar.
    fn sync(&mut self, mode: SyncMode) {
        let Some(folders) = self.folders() else {
            return;
        };
        let plan = plan_sync(
            &folders,
            &self.roots,
            &self.failed,
            &self.suspect,
            mode,
            Path::exists,
            Path::is_file,
        );
        for root in &plan.unwatch {
            if let Some(watcher) = self.watcher.as_mut() {
                let _ = watcher.unwatch(root);
            }
            self.roots.retain(|(_, r)| r != root);
        }
        let now = Instant::now();
        for (id, path, rescan) in plan.watch {
            let result = match self.watcher.as_mut() {
                Some(watcher) => watcher.watch(&path, RecursiveMode::Recursive),
                None => Err(notify::Error::generic("izleyici yok")),
            };
            match result {
                Ok(()) => {
                    self.failed.remove(&id);
                    self.logged.remove(&path);
                    self.roots.push((id, path));
                    if rescan {
                        self.debouncer.note(id, None, None, now);
                    }
                }
                Err(error) => {
                    self.failed.insert(id);
                    self.log_once(&path, &error.to_string());
                }
            }
        }
        for id in plan.missing {
            // Geri gelince bütünüyle taranır (`failed`).
            self.failed.insert(id);
            if let Some(folder) = folders.iter().find(|f| f.id == id) {
                self.log_once(Path::new(&folder.path), "klasör bulunamadı");
            }
        }
        if mode != SyncMode::Sources {
            // Hepsi ele alındı: yeniden kuruldu (taranacak), kayboldu ya da kurulamadı (ikisi
            // de `failed`: izlenince taranır).
            self.suspect.clear();
        }
        self.failed.retain(|id| folders.iter().any(|f| f.id == *id));
        if let Ok(mut published) = self.published.lock() {
            published.watched = self.roots.len();
            published.unwatched = plan.files;
            published.unwatched.extend(self.failed.iter().copied());
            published.unwatched.sort_unstable();
        }
    }

    fn log_once(&mut self, path: &Path, reason: &str) {
        if self.logged.insert(path.to_path_buf()) {
            diagnostics::error(&format!(
                "Klasör izlenemiyor: {}: {reason}. Yeniden denenecek; bu arada yeni şarkılar \
                 arada bir taranarak bulunur.",
                path.display()
            ));
        }
    }

    /// Güvenlik ağı: bütün kaynaklar taranır (bkz. [`DEFAULT_TIMING`]).
    fn backstop(&mut self) {
        if let Some(folders) = self.folders() {
            if !folders.is_empty() {
                (self.on_due)(
                    folders
                        .iter()
                        .map(|f| Due {
                            source: f.id,
                            within: None,
                        })
                        .collect(),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::temp_path;
    use notify::event::{CreateKind, DataChange, RemoveKind};

    struct FakeProbe {
        dirs_with_audio: Vec<PathBuf>,
        known: Vec<PathBuf>,
    }

    impl Probe for FakeProbe {
        fn dir_has_audio(&self, path: &Path) -> bool {
            self.dirs_with_audio.iter().any(|d| d == path)
        }
        fn has_tracks_under(&self, path: &Path) -> bool {
            self.known.iter().any(|k| k == path)
        }
    }

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    fn due(source: i64, within: Option<&str>) -> Due {
        Due {
            source,
            within: within.map(PathBuf::from),
        }
    }

    #[test]
    fn olaylar_sessizlik_olunca_tek_taramada_birlesir() {
        let start = Instant::now();
        let mut debouncer = Debouncer::new(DEFAULT_TIMING);
        assert_eq!(debouncer.deadline(), None);
        // Bir indirme: aynı klasörde art arda birçok olay, alt klasörde ve başka kaynakta da.
        for i in 0..50 {
            let scope = Some(PathBuf::from("/d/DLP"));
            debouncer.note(7, scope, None, start + ms(i * 20));
        }
        debouncer.note(7, Some(PathBuf::from("/d/DLP/alt")), None, start + ms(980));
        debouncer.note(3, None, None, start + ms(990));
        let last = start + ms(980);
        assert!(debouncer.take_due(last + ms(1999)).is_empty());
        assert_eq!(
            debouncer.take_due(last + Duration::from_secs(2)),
            vec![due(7, Some("/d/DLP"))],
            "iç içe alt klasörlerden dıştaki taranır"
        );
        assert_eq!(
            debouncer.take_due(start + ms(990) + Duration::from_secs(2)),
            vec![due(3, None)]
        );
        // Sıfırlandı: yeni olay olmadan bir daha tarama yok.
        assert_eq!(debouncer.deadline(), None);
        assert!(debouncer
            .take_due(last + Duration::from_secs(60))
            .is_empty());
    }

    #[test]
    fn cok_alt_klasor_butun_kaynaga_doner() {
        let start = Instant::now();
        let mut debouncer = Debouncer::new(DEFAULT_TIMING);
        for i in 0..=MAX_SCOPES {
            debouncer.note(1, Some(PathBuf::from(format!("/d/{i}"))), None, start);
        }
        assert_eq!(
            debouncer.take_due(start + Duration::from_secs(2)),
            vec![due(1, None)]
        );
    }

    #[test]
    fn olaylar_hic_kesilmese_de_ust_sinirda_taranir() {
        // Büyük bir kopyalama: her 500 ms'de bir başka dosya (aynı dosyaya uzun süre yazılmıyor).
        let start = Instant::now();
        let mut debouncer = Debouncer::new(DEFAULT_TIMING);
        let mut flushed = Vec::new();
        for i in 0..=50u64 {
            let now = start + ms(i * 500);
            let file = PathBuf::from(format!("/d/a/{i}.mp3"));
            debouncer.note(1, Some(PathBuf::from("/d/a")), Some(&file), now);
            if !debouncer.take_due(now).is_empty() {
                flushed.push(now - start);
            }
        }
        assert_eq!(flushed, vec![Duration::from_secs(10), ms(20_500)]);
    }

    #[test]
    fn yazilmaya_devam_eden_dosya_yazma_bitene_kadar_beklenir() {
        // Torrent: aynı dosyaya 3 dakika boyunca, arada 3 sn boşluklarla yazılıyor.
        let start = Instant::now();
        let mut debouncer = Debouncer::new(DEFAULT_TIMING);
        let file = PathBuf::from("/d/t/albüm.flac");
        let scope = || Some(PathBuf::from("/d/t"));
        let mut flushed = Vec::new();
        let mut now = start;
        for i in 0..=60u64 {
            now = start + Duration::from_secs(i * 3);
            debouncer.note(1, scope(), Some(&file), now);
            // Olaylar arasında saniye saniye zaman ilerler.
            for s in 0..3 {
                let t = now + Duration::from_secs(s);
                if !debouncer.take_due(t).is_empty() {
                    flushed.push(t - start);
                }
            }
        }
        // Yalnızca ilk 5 saniyede (henüz yavaş sayılmadan) taranabilir; sonra 3 dakika boyunca,
        // yazma sürdükçe tarama yok (eskiden her boşlukta yarım dosya yeniden çözülürdü).
        assert!(
            flushed.iter().all(|t| *t <= Duration::from_secs(6)),
            "{flushed:?}"
        );
        // Yazma bitti: 30 sn sessizlikten sonra taranır.
        let end = now;
        assert!(debouncer.take_due(end + Duration::from_secs(29)).is_empty());
        assert_eq!(
            debouncer.take_due(end + Duration::from_secs(30)),
            vec![due(1, Some("/d/t"))]
        );
        // Hiç bitmeyen yazma da en geç 10 dakikada bir taranır.
        let mut debouncer = Debouncer::new(DEFAULT_TIMING);
        let mut first_flush = None;
        for i in 0..=700u64 {
            let t = start + Duration::from_secs(i);
            debouncer.note(1, scope(), Some(&file), t);
            if i > 5 && first_flush.is_none() && !debouncer.take_due(t).is_empty() {
                first_flush = Some(i);
            }
        }
        assert!(
            first_flush.is_some_and(|i| i <= 10 * 60 + 5),
            "{first_flush:?}"
        );
    }

    #[test]
    fn hizli_kopyalanan_sarki_birkac_saniyede_taranir() {
        let start = Instant::now();
        let mut debouncer = Debouncer::new(DEFAULT_TIMING);
        let file = PathBuf::from("/d/DLP/şarkı.mp3");
        for i in 0..10 {
            debouncer.note(
                1,
                Some(PathBuf::from("/d/DLP")),
                Some(&file),
                start + ms(i * 50),
            );
        }
        assert_eq!(
            debouncer.deadline(),
            Some(start + ms(450) + Duration::from_secs(2))
        );
    }

    #[test]
    fn ses_dosyasi_olmayanlar_elenir_sarkili_klasorler_kalir() {
        let root = Path::new("/muzik");
        let probe = FakeProbe {
            dirs_with_audio: vec![root.join("Yeni Albüm")],
            known: vec![root.join("Eski Albüm")],
        };
        let create = EventKind::Create(CreateKind::Any);
        let remove = EventKind::Remove(RemoveKind::Any);
        let write = EventKind::Modify(ModifyKind::Data(DataChange::Any));
        let renamed_in = EventKind::Modify(ModifyKind::Name(RenameMode::To));
        let renamed_out = EventKind::Modify(ModifyKind::Name(RenameMode::From));
        let c = |kind: &EventKind, rel: &str| classify(kind, &root.join(rel), root, &probe);
        let (s, w) = (Some(Change::Structure), Some(Change::Write));

        // Şarkılar: oluşturma ve yazma "yazma", ad değişikliği ve silme "yapı".
        assert_eq!(c(&create, "şarkı.MP3"), w);
        assert_eq!(c(&write, "şarkı.flac"), w);
        assert_eq!(c(&EventKind::Modify(ModifyKind::Any), "a.mp3"), w);
        assert_eq!(c(&remove, "şarkı.mp3"), s);
        assert_eq!(c(&renamed_in, "indirilen.webm"), s);
        // Gizli adlı şarkı dosyası taranır (yalnızca gizli klasörler atlanır).
        assert_eq!(c(&create, ".gizli.mp3"), w);
        // İndirme ara dosyaları ve başka dosyalar elenir.
        assert_eq!(c(&create, "indirilen.webm.part"), None);
        assert_eq!(c(&renamed_out, "indirilen.webm.part"), None);
        assert_eq!(c(&write, "kapak.jpg"), None);
        assert_eq!(c(&remove, "notlar.txt"), None);
        assert_eq!(
            c(&EventKind::Access(notify::event::AccessKind::Any), "a.mp3"),
            None
        );
        // İçeri gelen klasör yalnızca içinde şarkı varsa; şarkısı olan klasörün silinmesi de.
        assert_eq!(c(&renamed_in, "Yeni Albüm"), s);
        assert_eq!(c(&create, "Yeni Albüm"), s);
        assert_eq!(c(&create, "Steam"), None, "şarkısız klasör");
        assert_eq!(c(&remove, "Eski Albüm"), s);
        assert_eq!(c(&renamed_out, "Eski Albüm"), s);
        assert_eq!(c(&remove, "Boş Klasör"), None);
        assert_eq!(c(&write, "Yeni Albüm"), None);
        // Sistem ve gizli klasörlerin içi elenir.
        assert_eq!(c(&create, "$RECYCLE.BIN/S-1-5/şarkı.mp3"), None);
        assert_eq!(c(&create, ".Trash-1000/files/şarkı.mp3"), None);
        assert_eq!(c(&create, "system volume information/x.mp3"), None);
        assert_eq!(c(&create, "Albüm/şarkı.mp3"), w);
    }

    #[test]
    fn degisikligin_alt_klasoru_bulunur() {
        let root = Path::new("/d");
        assert_eq!(
            scope_of(Path::new("/d/DLP/a.mp3"), root),
            Some(PathBuf::from("/d/DLP"))
        );
        // İçeri gelen klasör: bulunduğu klasör taranır (klasörün kendisi de içinde).
        assert_eq!(
            scope_of(Path::new("/d/DLP/Albüm"), root),
            Some(PathBuf::from("/d/DLP"))
        );
        assert_eq!(scope_of(Path::new("/d/a.mp3"), root), None, "kökteki dosya");
        assert_eq!(scope_of(root, root), None, "kökün kendisi");
    }

    #[test]
    fn klasorde_sarki_bakisi_sinirlidir() {
        let dir = temp_path("izleme-bakis");
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data");
        let song = data.join("uc-uc-ton.mp3");
        // Şarkısız (ör. Steam) klasör.
        std::fs::create_dir_all(dir.join("Oyun/bin")).unwrap();
        std::fs::write(dir.join("Oyun/bin/oyun.dll"), b"x").unwrap();
        assert!(!dir_has_audio(&dir.join("Oyun")));
        // İki kat aşağıda şarkı olan albüm klasörü.
        std::fs::create_dir_all(dir.join("Albüm/CD1")).unwrap();
        std::fs::copy(&song, dir.join("Albüm/CD1/a.mp3")).unwrap();
        assert!(dir_has_audio(&dir.join("Albüm")));
        // Gizli klasördeki şarkı sayılmaz; çok derindeki de (bakış sınırlı).
        std::fs::create_dir_all(dir.join("Gizli/.cache")).unwrap();
        std::fs::copy(&song, dir.join("Gizli/.cache/a.mp3")).unwrap();
        assert!(!dir_has_audio(&dir.join("Gizli")));
        let deep = dir.join("Derin/1/2/3/4/5");
        std::fs::create_dir_all(&deep).unwrap();
        std::fs::copy(&song, deep.join("a.mp3")).unwrap();
        assert!(!dir_has_audio(&dir.join("Derin")));
        // Dosyanın kendisi klasör değil.
        assert!(!dir_has_audio(&dir.join("Albüm/CD1/a.mp3")));
    }

    fn folder(id: i64, path: &str, single: bool) -> FolderRow {
        FolderRow {
            id,
            path: path.to_owned(),
            track_count: 0,
            single,
        }
    }

    #[test]
    fn esitleme_yeni_kaynaklari_izler_cikarilanlari_birakir() {
        let folders = vec![
            folder(1, "/muzik", false),
            folder(2, "/dlp", false),
            folder(3, "/tek.mp3", false),
            folder(4, "/usb", false),
        ];
        let roots = vec![(1, PathBuf::from("/muzik")), (9, PathBuf::from("/eski"))];
        let failed = HashSet::from([2]);
        let plan = plan_sync(
            &folders,
            &roots,
            &failed,
            &HashSet::new(),
            SyncMode::Sources,
            |p| p != Path::new("/usb"),
            |p| p == Path::new("/tek.mp3"),
        );
        assert_eq!(
            plan,
            SyncPlan {
                unwatch: vec![PathBuf::from("/eski")],
                // Önceden izlenemeyen klasör izlenince taranır (arada kaçırılmış olabilir).
                watch: vec![(2, PathBuf::from("/dlp"), true)],
                missing: vec![4],
                files: vec![3],
            }
        );
    }

    #[test]
    fn onarma_saglam_izlemeye_dokunmaz_kaybolani_birakir() {
        // Sağlam izlemeyi kapatıp açmak (Windows'ta CancelIo) arabellekteki olayları atar:
        // onarmada yalnızca kaybolan köke dokunulur.
        let folders = vec![folder(1, "/muzik", false), folder(2, "/usb", false)];
        let roots = vec![(1, PathBuf::from("/muzik")), (2, PathBuf::from("/usb"))];
        let none = HashSet::new();
        let plan = plan_sync(
            &folders,
            &roots,
            &none,
            &none,
            SyncMode::Heal,
            |p| p != Path::new("/usb"),
            |_| false,
        );
        assert_eq!(
            plan,
            SyncPlan {
                unwatch: vec![PathBuf::from("/usb")],
                watch: vec![],
                missing: vec![2],
                files: vec![],
            }
        );
        // Kaynak listesi eşitlemesi de izlenen köklere dokunmaz.
        let plan = plan_sync(
            &folders,
            &roots,
            &none,
            &none,
            SyncMode::Sources,
            |_| false,
            |_| false,
        );
        assert_eq!(plan, SyncPlan::default());
    }

    #[test]
    fn kaybolup_geri_gelen_kok_yeniden_izlenir_ve_butunuyle_taranir() {
        let folders = vec![folder(1, "/muzik", false), folder(2, "/usb", false)];
        // USB çıkarıldı: onarma izlemeyi bıraktı, kaynak izlenemeyenlere (`failed`) geçti.
        let roots = vec![(1, PathBuf::from("/muzik"))];
        let failed = HashSet::from([2]);
        // Geri takıldı: hangi kipte olursa olsun yeniden izlenir ve bütünüyle taranır (`true`);
        // sağlam izleme yeniden kurulmaz.
        for mode in [SyncMode::Sources, SyncMode::Heal] {
            let plan = plan_sync(
                &folders,
                &roots,
                &failed,
                &HashSet::new(),
                mode,
                |_| true,
                |_| false,
            );
            assert_eq!(
                plan.watch,
                vec![(2, PathBuf::from("/usb"), true)],
                "{mode:?}"
            );
            assert!(plan.unwatch.is_empty(), "{mode:?}");
        }
    }

    #[test]
    fn hata_bildiren_izleme_yeniden_kurulur_ve_butunuyle_taranir() {
        let folders = vec![folder(1, "/muzik", false), folder(2, "/nas", false)];
        let roots = vec![(1, PathBuf::from("/muzik")), (2, PathBuf::from("/nas"))];
        let suspect = HashSet::from([2]);
        let plan = plan_sync(
            &folders,
            &roots,
            &HashSet::new(),
            &suspect,
            SyncMode::Heal,
            |_| true,
            |_| false,
        );
        assert_eq!(
            plan,
            SyncPlan {
                unwatch: vec![PathBuf::from("/nas")],
                watch: vec![(2, PathBuf::from("/nas"), true)],
                missing: vec![],
                files: vec![],
            }
        );
        // Hata bildiren kök kaybolmuşsa yalnızca bırakılır (geri gelince taranır).
        let plan = plan_sync(
            &folders,
            &roots,
            &HashSet::new(),
            &suspect,
            SyncMode::Heal,
            |p| p != Path::new("/nas"),
            |_| false,
        );
        assert_eq!(plan.unwatch, vec![PathBuf::from("/nas")]);
        assert!(plan.watch.is_empty());
        assert_eq!(plan.missing, vec![2]);
    }

    #[test]
    fn yenileme_butun_izlemeleri_yeniden_kurar() {
        // Güvenlik ağı taramasından hemen önce: sessizce düşmüş olabilecek izlemeler yenilenir;
        // ardından bütün kaynaklar zaten taranır, yalnızca hata bildiren ayrıca işaretlenir.
        let folders = vec![
            folder(1, "/muzik", false),
            folder(2, "/nas", false),
            folder(3, "/usb", false),
        ];
        let roots = vec![
            (1, PathBuf::from("/muzik")),
            (2, PathBuf::from("/nas")),
            (3, PathBuf::from("/usb")),
        ];
        let plan = plan_sync(
            &folders,
            &roots,
            &HashSet::new(),
            &HashSet::from([2]),
            SyncMode::Refresh,
            |p| p != Path::new("/usb"),
            |_| false,
        );
        assert_eq!(
            plan,
            SyncPlan {
                unwatch: vec![
                    PathBuf::from("/muzik"),
                    PathBuf::from("/nas"),
                    PathBuf::from("/usb"),
                ],
                watch: vec![
                    (1, PathBuf::from("/muzik"), false),
                    (2, PathBuf::from("/nas"), true),
                ],
                missing: vec![3],
                files: vec![],
            }
        );
    }

    #[test]
    fn silinen_yolun_klasor_olabilecegi_uzantisindan_anlasilir() {
        for folder in [
            "Albüm",
            "Vol. 2",
            "Mr. Bungle",
            "2023.05",
            "R.E.M.",
            "Kayıtlar.yedekler",
        ] {
            assert!(may_be_folder(Path::new(folder)), "{folder}");
        }
        for file in [
            "kapak.jpg",
            "notlar.TXT",
            "x.tmp",
            "a.part",
            "web.mp3x",
            "yedek.7z",
        ] {
            assert!(!may_be_folder(Path::new(file)), "{file}");
        }
    }

    #[test]
    fn silinen_ses_disi_dosya_kutuphaneye_sorulmaz() {
        struct CountingProbe(std::cell::Cell<usize>);
        impl Probe for CountingProbe {
            fn dir_has_audio(&self, _: &Path) -> bool {
                false
            }
            fn has_tracks_under(&self, _: &Path) -> bool {
                self.0.set(self.0.get() + 1);
                true
            }
        }
        let root = Path::new("/d");
        let probe = CountingProbe(std::cell::Cell::new(0));
        let remove = EventKind::Remove(RemoveKind::Any);
        let renamed = EventKind::Modify(ModifyKind::Name(RenameMode::Any));
        for name in ["önbellek.tmp", "kapak.jpg", "Thumbs.db"] {
            assert_eq!(classify(&remove, &root.join(name), root, &probe), None);
            assert_eq!(classify(&renamed, &root.join(name), root, &probe), None);
        }
        assert_eq!(probe.0.get(), 0, "kütüphane kilidi alınmadı");
        // Uzantısız yol klasör olabilir: sorulur.
        assert_eq!(
            classify(&remove, &root.join("Albüm"), root, &probe),
            Some(Change::Structure)
        );
        assert_eq!(probe.0.get(), 1);
    }
}
