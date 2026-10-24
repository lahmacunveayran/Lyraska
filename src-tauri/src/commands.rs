//! Arayüzün (`invoke`) çağırabildiği Tauri komutları.
//!
//! Komutlar ince tutulur: asıl iş ilgili modülde yapılır, burada yalnızca
//! arayüze uygun veri biçimine çevrilir. Hatalar Türkçe metin olarak döner.
//!
//! Oynatıcı komutları `async`tır: Tauri düz komutları ana (pencere) iş parçacığında
//! çalıştırır; şarkı açmak birkaç yüz milisaniye sürebildiği için pencere donmasın diye
//! bu komutlar arka plandaki iş parçacıklarında çalışır.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use tauri::State;

use crate::analysis::annotation::{
    AnnotatedTrack, Annotation, AnnotationStore, EvaluationSaveError, MIN_EVALUATION_BEATS,
};
use crate::analysis::background::{BackgroundAnalysis, CrashGuard};
use crate::analysis::cache::AnalysisCache;
use crate::analysis::evaluate;
use crate::analysis::map_file::{ImportedMapStatus, MapFile, MapStore};
use crate::audio::abx::{AbxChoice, AbxRequest, AbxSource, AbxStatus, AbxTest};
use crate::audio::crossfeed::{CrossfeedSettings, CrossfeedState};
use crate::audio::decode::{Decoder, TrackInfo, SUPPORTED_EXTENSIONS};
use crate::audio::eq::{EqSettings, EqState};
use crate::audio::lyrics::Lyrics;
use crate::audio::peq::{
    HeadphoneProfile, HeadphoneSettings, HeadphoneState, ParametricSettings, ParametricState,
};
use crate::audio::player::{PlaybackState, PlaybackStatus, Player, Transition};
use crate::audio::PlaybackOptions;
use crate::library::{AlbumRow, ArtistRow, DropOutcome, LibraryService, LibraryStatus, TrackRow};
use crate::milkdrop::{self, MilkdropFolder, MilkdropPreset};
use crate::settings::SettingsStore;
use crate::visual_bridge::VisualFrame;
use crate::{analysis, audio, diagnostics, visual_bridge};

/// Kullanıcıya dönen hatayı günlüğe de yazar.
fn reported(error: impl std::fmt::Display) -> String {
    let message = error.to_string();
    diagnostics::error(&message);
    message
}

/// Karşılama ekranında gösterilen program bilgisi.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    /// Derlendiği commit'in kısa kimliği (ör. "a1b2c3d"; yerel derlemede "yerel").
    pub commit: String,
    pub phase: String,
    pub audio_engine: String,
    pub analysis: String,
    pub visual_bridge: String,
    /// "Dosya aç" penceresinde gösterilecek uzantılar.
    pub supported_extensions: Vec<String>,
}

impl AppInfo {
    /// Derleme anındaki bilgilerden program bilgisini oluşturur.
    pub fn current() -> Self {
        Self {
            name: "Lyraska".to_owned(),
            version: env!("CARGO_PKG_VERSION").to_owned(),
            commit: env!("LYRASKA_BUILD_COMMIT").to_owned(),
            // Faz adı değil: programda birden çok fazın işi bir arada; yol haritası docs/ROADMAP.md.
            phase: "Test sürümü".to_owned(),
            audio_engine: audio::status().label().to_owned(),
            analysis: analysis::status().label().to_owned(),
            visual_bridge: visual_bridge::status().label().to_owned(),
            supported_extensions: SUPPORTED_EXTENSIONS
                .iter()
                .map(|e| (*e).to_owned())
                .collect(),
        }
    }
}

/// Tauri'nin yönettiği oynatıcı.
#[derive(Default)]
pub struct PlayerState(Mutex<Player>);

impl PlayerState {
    fn lock(&self) -> Result<MutexGuard<'_, Player>, String> {
        self.0.lock().map_err(|_| {
            reported("Oynatıcı beklenmedik bir hatayla durdu; programı yeniden başlatın.")
        })
    }
}

/// Program kapanırken oynatıcıyı kapatır (`lib.rs`, `RunEvent::Exit`).
pub fn stop_on_exit(player: &PlayerState) {
    if let Ok(mut player) = player.0.lock() {
        player.shutdown();
    }
}

/// Kayıtlı ayarları oynatıcıya uygular (program açılırken).
pub fn restore_settings(player: &PlayerState, store: &SettingsStore) {
    if let Ok(mut player) = player.lock() {
        let settings = store.get();
        player.set_equalizer(settings.equalizer);
        player.set_headphone(settings.headphone);
        player.set_parametric(settings.parametric);
        player.set_crossfeed(settings.crossfeed);
        player.set_visual_safe(settings.visual_safe);
        player.set_audio_delay_ms(settings.audio_delay_ms);
        // Açılışta çalan şarkı yok: aygıt açılmaz, hata olamaz.
        let _ = player.set_playback_options(settings.playback);
    }
}

/// Analiz önbelleğini oynatıcıya bağlar ve kütüphanenin arka plan analizini başlatır
/// (program açılırken). Oynatıcının kendi analizleri sürerken arka plan bekler.
pub fn start_analysis_cache(
    player: &PlayerState,
    cache: Arc<AnalysisCache>,
    guard: CrashGuard,
) -> Option<BackgroundAnalysis> {
    let mut player = player.lock().ok()?;
    player.set_analysis_cache(Arc::clone(&cache));
    Some(BackgroundAnalysis::start(
        cache,
        player.foreground_analyses(),
        guard,
    ))
}

/// Büyük, yeniden üretilebilir verinin klasörü (Windows'ta Local; bulunamadıysa neden).
pub struct BigDataDir(pub Result<PathBuf, String>);

/// Tauri'nin yönettiği arka plan analizi (önbellek açılamadıysa yok).
pub struct BackgroundState(pub Option<BackgroundAnalysis>);

impl BackgroundState {
    /// Program kapanırken süren arka plan analizini durdurur.
    pub fn shutdown(&self) {
        if let Some(background) = &self.0 {
            background.stop();
        }
    }
}

/// Tauri'nin yönettiği kütüphane. Veritabanı açılamadıysa nedenini taşır.
pub struct LibraryState {
    service: Result<LibraryService, String>,
}

impl LibraryState {
    pub fn new(service: Result<LibraryService, String>) -> Self {
        Self { service }
    }

    fn get(&self) -> Result<&LibraryService, String> {
        self.service.as_ref().map_err(Clone::clone)
    }

    /// Kütüphane işini engellenebilir iş parçacığında yapar: tarama yazarken bir sorgu
    /// veritabanını saniyelerce bekleyebilir (`busy_timeout`).
    async fn run<T: Send + 'static>(
        &self,
        work: impl FnOnce(&LibraryService) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let service = self.get()?.clone();
        blocking(move || work(&service)).await
    }

    /// Program kapanırken süren taramayı ve klasör izlemeyi durdurur.
    pub fn shutdown(&self) {
        if let Ok(service) = &self.service {
            service.shutdown();
        }
    }

    /// Program penceresi odağa geldi (bkz. [`LibraryService::on_window_focus`]).
    pub fn on_window_focus(&self) {
        if let Ok(service) = &self.service {
            service.on_window_focus();
        }
    }
}

/// Program adı, sürümü ve modüllerin durumu.
#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo::current()
}

/// Şarkıyı açar ve çalmaya başlar. Dosyayı açma, ön dolum ve ses aygıtını açma yüzlerce ms
/// sürer: oynatıcı kilidi dışında, ayrı iş parçacığında yapılır; görseller ve durum sorguları bu
/// sırada beklemez (SES-02).
#[tauri::command]
pub async fn open_track(
    path: PathBuf,
    player: State<'_, PlayerState>,
) -> Result<TrackInfo, String> {
    let transition = player.lock()?.begin_transition(&path, true, None);
    let prepared = tauri::async_runtime::spawn_blocking(move || Player::prepare(transition))
        .await
        .map_err(reported)?;
    player.lock()?.install(prepared).map_err(reported)
}

/// Şarkının içindeki kapak resmi (`data:` adresi; kapak yoksa `null`). Okunamayan dosya
/// hata değildir: kapak yerine özgün renk kapağı gösterilir.
#[tauri::command]
pub async fn track_cover(path: PathBuf) -> Result<Option<String>, String> {
    blocking(move || {
        Ok(crate::audio::decode::read_cover(&path)
            .ok()
            .flatten()
            .map(|cover| cover.data_url()))
    })
    .await
}

/// Şarkının sözleri: yanındaki `.lrc` dosyası ya da şarkıya gömülü sözler; yoksa `null`.
/// Sözler yalnızca kullanıcının kendi dosyalarından okunur, hiçbir yere kaydedilmez.
#[tauri::command]
pub async fn track_lyrics(path: PathBuf) -> Result<Option<Lyrics>, String> {
    blocking(move || {
        let duration = Decoder::open(&path)
            .ok()
            .and_then(|d| d.info().duration_secs);
        Ok(crate::audio::lyrics::for_track(&path, duration))
    })
    .await
}

/// Boşluksuz geçiş için sıradaki şarkıyı bildirir (`null`: sıra yok).
#[tauri::command]
pub async fn set_next_track(
    path: Option<PathBuf>,
    player: State<'_, PlayerState>,
) -> Result<(), String> {
    player.lock()?.set_next(path);
    Ok(())
}

/// Çalıyorsa duraklatır, değilse çalar.
#[tauri::command]
pub async fn toggle_playback(player: State<'_, PlayerState>) -> Result<PlaybackStatus, String> {
    // Duraklatma ve sürdürme anında; bitmiş ya da hatalı şarkıyı yeniden kurmak (dosya açma, ses
    // aygıtı) kilit dışında yapılır (bkz. `open_track`; DENETIM-FAZ0 ISK-01).
    let transition = {
        let mut player = player.lock()?;
        if player.state() == PlaybackState::Playing {
            player.pause();
            None
        } else {
            player.begin_play()
        }
    };
    finish_transition(transition, &player).await
}

/// Kilit altında başlatılmış bir geçişi kilit dışında hazırlar, kilit altında kurar.
async fn finish_transition(
    transition: Option<Transition>,
    player: &PlayerState,
) -> Result<PlaybackStatus, String> {
    if let Some(transition) = transition {
        let prepared = tauri::async_runtime::spawn_blocking(move || Player::prepare(transition))
            .await
            .map_err(reported)?;
        player.lock()?.install(prepared).map_err(reported)?;
    }
    Ok(player.lock()?.status())
}

/// Dosya ya da veritabanı işini tokio'nun engellenebilir iş parçacığında yapar. Async komutlar
/// çalışma zamanının birkaç işçisini paylaşır; diskte uzun süren bir okuma onları bağlarsa görsel
/// kareleri ve durum sorguları sıraya girer (DENETIM-FAZ0 ISK-05).
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(reported)?
}

/// Durdurur ve şarkının başına döner.
#[tauri::command]
pub async fn stop_playback(player: State<'_, PlayerState>) -> Result<PlaybackStatus, String> {
    let transition = player.lock()?.begin_stop();
    finish_transition(transition, &player).await
}

/// Şarkıda verilen saniyeye atlar (yeni oturum; hazırlığı kilit dışında, bkz. `open_track`).
#[tauri::command]
pub async fn seek_playback(
    seconds: f64,
    player: State<'_, PlayerState>,
) -> Result<PlaybackStatus, String> {
    let transition = player.lock()?.begin_seek(seconds);
    finish_transition(transition, &player).await
}

/// Şu an duyulan anın görsel verisi. Arayüz her ekran karesinde sorar;
/// analiz o ana yetişmediyse `null` döner.
#[tauri::command]
pub async fn visual_frame(player: State<'_, PlayerState>) -> Result<Option<VisualFrame>, String> {
    // Aygıt değiştiyse şarkı yeni aygıtta kilit dışında yeniden açılır (bkz. `playback_status`).
    let transition = player.lock()?.begin_device_recovery();
    if transition.is_some() {
        finish_transition(transition, &player).await?;
    }
    Ok(player.lock()?.visual_now().map(VisualFrame::from))
}

/// Şu an duyulan anın ham dalga biçimi (MilkDrop sahnesi): ham bayt olarak 3 × 1024 bayt —
/// karışım, sol, sağ; 44,1 kHz; 128 = sessizlik (WebAudio `getByteTimeDomainData` biçimi).
/// JSON sayı dizisi yerine ham yanıt: arayüze `ArrayBuffer` olarak gelir. Çalan şarkı yoksa
/// boş yanıt.
#[tauri::command]
pub async fn visual_waveform(
    player: State<'_, PlayerState>,
) -> Result<tauri::ipc::Response, String> {
    let bytes = player.lock()?.visual_waveform().unwrap_or_default();
    Ok(tauri::ipc::Response::new(bytes))
}

/// Kütüphane durumu: klasörler, şarkı sayısı, tarama ilerlemesi.
#[tauri::command]
pub async fn library_status(library: State<'_, LibraryState>) -> Result<LibraryStatus, String> {
    library
        .run(|service| service.status().map_err(reported))
        .await
}

/// Klasörü kütüphaneye ekler ve arka planda taramaya başlar.
#[tauri::command]
pub async fn library_add_folder(
    path: PathBuf,
    library: State<'_, LibraryState>,
) -> Result<LibraryStatus, String> {
    library
        .run(move |service| {
            service.add_folder(&path).map_err(reported)?;
            service.status().map_err(reported)
        })
        .await
}

/// Pencereye bırakılan şarkıları ve klasörleri kütüphaneye ekler; çalınacak şarkıları döndürür.
#[tauri::command]
pub async fn library_add_dropped(
    paths: Vec<PathBuf>,
    library: State<'_, LibraryState>,
) -> Result<DropOutcome, String> {
    let (outcome, paths) = library
        .run(move |service| Ok((service.add_dropped(&paths), paths)))
        .await?;
    diagnostics::info(&format!(
        "Bırakılanlar işlendi: {} öğe; {} şarkı çalınacak, {} şarkı ve {} klasör eklendi, \
         {} zaten kütüphanede, {} sorun",
        paths.len(),
        outcome.tracks.len(),
        outcome.added_tracks,
        outcome.added_folders,
        outcome.already,
        outcome.problems.len(),
    ));
    for problem in &outcome.problems {
        diagnostics::info(&format!("Bırakılan eklenemedi: {problem}"));
    }
    Ok(outcome)
}

/// Klasörü (ve şarkılarını) kütüphaneden çıkarır; diskteki dosyalara dokunmaz.
#[tauri::command]
pub async fn library_remove_folder(
    id: i64,
    library: State<'_, LibraryState>,
) -> Result<LibraryStatus, String> {
    library
        .run(move |service| {
            service.remove_folder(id).map_err(reported)?;
            service.status().map_err(reported)
        })
        .await
}

/// Kütüphanedeki albümler (arama kutusundaki yazıyla süzülür).
#[tauri::command]
pub async fn library_albums(
    query: String,
    library: State<'_, LibraryState>,
) -> Result<Vec<AlbumRow>, String> {
    library
        .run(move |service| service.albums(&query).map_err(reported))
        .await
}

/// Kütüphanedeki sanatçılar (arama kutusundaki yazıyla süzülür).
#[tauri::command]
pub async fn library_artists(
    query: String,
    library: State<'_, LibraryState>,
) -> Result<Vec<ArtistRow>, String> {
    library
        .run(move |service| service.artists(&query).map_err(reported))
        .await
}

/// Sanatçının şarkılarının yolları, çalma sırasıyla.
#[tauri::command]
pub async fn library_artist_tracks(
    artist: String,
    library: State<'_, LibraryState>,
) -> Result<Vec<String>, String> {
    library
        .run(move |service| service.artist_tracks(&artist).map_err(reported))
        .await
}

/// Kullanıcının albüme seçtiği kapakların deposu (büyük veri klasöründe).
fn cover_store(big: &BigDataDir) -> Result<crate::library::covers::CoverStore, String> {
    big.0
        .as_ref()
        .map(|dir| crate::library::covers::CoverStore::new(dir))
        .map_err(|e| reported(format!("Uygulama klasörü bulunamadı: {e}")))
}

/// Albüme seçilmiş kapak (`data:` adresi); seçilmemişse `null`.
#[tauri::command]
pub async fn album_cover_get(
    album: String,
    artist: Option<String>,
    big: State<'_, BigDataDir>,
) -> Result<Option<String>, String> {
    let store = cover_store(&big)?;
    blocking(move || {
        Ok(store
            .get(&album, artist.as_deref())
            .map(|cover| cover.data_url()))
    })
    .await
}

/// Resmi albümün kapağı yapar (kopyası Lyraska'da saklanır; müzik dosyalarına dokunulmaz).
#[tauri::command]
pub async fn album_cover_set(
    album: String,
    artist: Option<String>,
    path: PathBuf,
    big: State<'_, BigDataDir>,
) -> Result<(), String> {
    let store = cover_store(&big)?;
    blocking(move || {
        store
            .set(&album, artist.as_deref(), &path)
            .map_err(|e| e.to_string())
    })
    .await
}

/// Albüme seçilmiş kapağı kaldırır.
#[tauri::command]
pub async fn album_cover_clear(
    album: String,
    artist: Option<String>,
    big: State<'_, BigDataDir>,
) -> Result<(), String> {
    let store = cover_store(&big)?;
    blocking(move || store.clear(&album, artist.as_deref()).map_err(reported)).await
}

/// Çalma listeleri, en son değişen önce.
#[tauri::command]
pub async fn playlists_list(
    library: State<'_, LibraryState>,
) -> Result<Vec<crate::library::playlists::PlaylistRow>, String> {
    library
        .run(move |service| service.playlists().map_err(reported))
        .await
}

/// Yeni, boş çalma listesi. Kütüphane dosyası bozulup yeniden kurulduysa (ya da silindiyse) kimlikler
/// baştan başlar: eski listenin `kapaklar/` altında kalan kapağı yeni listeye geçmesin diye silinir.
#[tauri::command]
pub async fn playlist_create(
    name: String,
    library: State<'_, LibraryState>,
    big: State<'_, BigDataDir>,
) -> Result<crate::library::playlists::PlaylistRow, String> {
    let created = library
        .run(move |service| service.create_playlist(&name).map_err(|e| e.to_string()))
        .await?;
    if let Ok(store) = cover_store(&big) {
        let id = created.id;
        // Kalıntı kapak silinemese de liste kuruldu: yalnızca günlüğe yazılır.
        blocking(move || store.playlist_clear(id).map_err(reported))
            .await
            .ok();
    }
    Ok(created)
}

#[tauri::command]
pub async fn playlist_rename(
    id: i64,
    name: String,
    library: State<'_, LibraryState>,
) -> Result<(), String> {
    library
        .run(move |service| {
            service
                .rename_playlist(id, &name)
                .map_err(|e| e.to_string())
        })
        .await
}

/// Listeyi ve seçilmiş kapağını siler; şarkı dosyalarına dokunulmaz.
#[tauri::command]
pub async fn playlist_delete(
    id: i64,
    library: State<'_, LibraryState>,
    big: State<'_, BigDataDir>,
) -> Result<(), String> {
    library
        .run(move |service| service.delete_playlist(id).map_err(reported))
        .await?;
    let store = cover_store(&big)?;
    blocking(move || store.playlist_clear(id).map_err(reported)).await
}

/// Listedeki şarkıların yolları, sırasıyla (aynı şarkı birden çok kez olabilir).
#[tauri::command]
pub async fn playlist_tracks(
    id: i64,
    library: State<'_, LibraryState>,
) -> Result<Vec<String>, String> {
    library
        .run(move |service| service.playlist_tracks(id).map_err(reported))
        .await
}

/// Şarkıları listenin sonuna ekler; eklenen şarkı sayısını döndürür.
#[tauri::command]
pub async fn playlist_add(
    id: i64,
    paths: Vec<String>,
    library: State<'_, LibraryState>,
) -> Result<u32, String> {
    library
        .run(move |service| service.add_to_playlist(id, &paths).map_err(reported))
        .await
}

/// Verilen sıralardaki şarkıları listeden çıkarır.
#[tauri::command]
pub async fn playlist_remove(
    id: i64,
    positions: Vec<u32>,
    library: State<'_, LibraryState>,
) -> Result<(), String> {
    library
        .run(move |service| {
            service
                .remove_from_playlist(id, &positions)
                .map_err(reported)
        })
        .await
}

/// Bir şarkıyı listede başka bir sıraya taşır.
#[tauri::command]
pub async fn playlist_move(
    id: i64,
    from: u32,
    to: u32,
    library: State<'_, LibraryState>,
) -> Result<(), String> {
    library
        .run(move |service| service.move_in_playlist(id, from, to).map_err(reported))
        .await
}

/// Listeye seçilmiş kapak (`data:` adresi); seçilmemişse `null`.
#[tauri::command]
pub async fn playlist_cover_get(
    id: i64,
    big: State<'_, BigDataDir>,
) -> Result<Option<String>, String> {
    let store = cover_store(&big)?;
    blocking(move || Ok(store.playlist_get(id).map(|cover| cover.data_url()))).await
}

/// Resmi listenin kapağı yapar; kopyası Lyraska'nın veri klasöründe saklanır.
#[tauri::command]
pub async fn playlist_cover_set(
    id: i64,
    path: PathBuf,
    big: State<'_, BigDataDir>,
) -> Result<(), String> {
    let store = cover_store(&big)?;
    blocking(move || store.playlist_set(id, &path).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn playlist_cover_clear(id: i64, big: State<'_, BigDataDir>) -> Result<(), String> {
    let store = cover_store(&big)?;
    blocking(move || store.playlist_clear(id).map_err(reported)).await
}

/// Albümün şarkılarının yolları, çalma sırasıyla.
#[tauri::command]
pub async fn library_album_tracks(
    album: String,
    artist: Option<String>,
    library: State<'_, LibraryState>,
) -> Result<Vec<String>, String> {
    library
        .run(move |service| {
            service
                .album_tracks(&album, artist.as_deref())
                .map_err(reported)
        })
        .await
}

/// Bütün klasörleri yeniden tarar (değişmeyen dosyalar atlanır).
#[tauri::command]
pub async fn library_rescan(library: State<'_, LibraryState>) -> Result<LibraryStatus, String> {
    library
        .run(|service| {
            service.request_scan();
            service.status().map_err(reported)
        })
        .await
}

/// Kütüphanede arar; boş arama bütün şarkıları döndürür.
#[tauri::command]
pub async fn library_search(
    query: String,
    limit: Option<usize>,
    library: State<'_, LibraryState>,
) -> Result<Vec<TrackRow>, String> {
    library
        .run(move |service| service.search(&query, limit).map_err(reported))
        .await
}

/// Ekolayzer ayarları ve uygulanan eğri.
#[tauri::command]
pub async fn equalizer_get(player: State<'_, PlayerState>) -> Result<EqState, String> {
    Ok(player.lock()?.equalizer_state())
}

/// Ekolayzer ayarlarını değiştirir (çalan sese hemen yansır) ve kaydeder.
#[tauri::command]
pub async fn equalizer_set(
    settings: EqSettings,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<EqState, String> {
    let applied = player.lock()?.set_equalizer(settings);
    store
        .update(|s| s.equalizer = applied)
        .map_err(|e| reported(format!("Ekolayzer ayarı kaydedilemedi: {e}")))?;
    Ok(player.lock()?.equalizer_state())
}

/// Ses aygıtının ek gecikmesi (ms; görseller bu kadar geriden gösterilir).
#[tauri::command]
pub async fn audio_delay_get(player: State<'_, PlayerState>) -> Result<i32, String> {
    Ok(player.lock()?.audio_delay_ms())
}

/// Ses gecikmesini ayarlar (görsellere hemen yansır), kaydeder ve uygulanan değeri döndürür.
#[tauri::command]
pub async fn audio_delay_set(
    ms: i32,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<i32, String> {
    let applied = player.lock()?.set_audio_delay_ms(ms);
    store
        .update(|s| s.audio_delay_ms = applied)
        .map_err(|e| reported(format!("Senkron ayarı kaydedilemedi: {e}")))?;
    Ok(applied)
}

/// Senkron ölçümü için tıklama kaydı: dosya yolu ve tıklamaların zamanları.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct CalibrationTrack {
    pub path: PathBuf,
    pub clicks: Vec<f64>,
}

/// Tıklama kaydını büyük veri klasörüne (Local) yazar: her seferinde yeniden üretilir (~1,6 MB),
/// gezici profilde eşitlenmesin.
#[tauri::command]
pub async fn calibration_track(big: State<'_, BigDataDir>) -> Result<CalibrationTrack, String> {
    let dir = big
        .0
        .as_ref()
        .map_err(|e| reported(format!("Uygulama klasörü bulunamadı: {e}")))?;
    let path = dir.join("kalibrasyon").join("tiklama.wav");
    visual_bridge::calibration::write(&path)
        .map_err(|e| reported(format!("Tıklama kaydı yazılamadı: {e}")))?;
    Ok(CalibrationTrack {
        path,
        clicks: visual_bridge::calibration::click_times(),
    })
}

/// MilkDrop sahnesi: hatırlanan klasör ve içindeki `.milk` görselleri (seçilmediyse boş).
#[tauri::command]
pub async fn milkdrop_list(store: State<'_, SettingsStore>) -> Result<MilkdropFolder, String> {
    // Klasörü taramak diskte sürebilir: arka plandaki iş parçacığında.
    let folder = store.get().milkdrop_folder;
    tauri::async_runtime::spawn_blocking(move || milkdrop::folder_state(folder))
        .await
        .map_err(reported)
}

/// MilkDrop klasörünü seçer (hatırlanır) ve içindeki görselleri döndürür.
#[tauri::command]
pub async fn milkdrop_set_folder(
    path: PathBuf,
    store: State<'_, SettingsStore>,
) -> Result<MilkdropFolder, String> {
    let folder = milkdrop::sanitize_folder(Some(path))
        .ok_or_else(|| reported("MilkDrop klasörünün yolu geçersiz"))?;
    store
        .update(|s| s.milkdrop_folder = Some(folder.clone()))
        .map_err(|e| reported(format!("MilkDrop klasörü kaydedilemedi: {e}")))?;
    tauri::async_runtime::spawn_blocking(move || milkdrop::folder_state(Some(folder)))
        .await
        .map_err(reported)
}

/// Seçilen klasördeki bir `.milk` görselini Butterchurn biçimine çevirir. Açılamayan görsel
/// kullanıcının dosyasıdır, programın hatası değil: günlüğe yazılmaz, nedeni arayüzde görünür.
#[tauri::command]
pub async fn milkdrop_load(
    path: PathBuf,
    store: State<'_, SettingsStore>,
) -> Result<MilkdropPreset, String> {
    let folder = store.get().milkdrop_folder;
    let preset =
        tauri::async_runtime::spawn_blocking(move || milkdrop::load(folder.as_deref(), &path))
            .await
            .map_err(reported)?
            .map_err(|e| e.to_string())?;
    // Gölgelendiricisi çevrilemeyen görsel yine çalar; neden bilgi olarak günlüğe yazılır
    // (çevirici iyileştirilirken hangi presetlerin kaldığı görülsün).
    if let Some(reason) = &preset.shader_error {
        diagnostics::info(&format!(
            "MilkDrop görseli sade çalıyor ({}): {reason}",
            preset.name
        ));
    }
    Ok(preset)
}

/// Epilepsi güvenli modu açık mı.
#[tauri::command]
pub async fn visual_safe_get(player: State<'_, PlayerState>) -> Result<bool, String> {
    Ok(player.lock()?.visual_safe())
}

/// Epilepsi güvenli modunu açar ya da kapatır (görsellere hemen yansır) ve kaydeder.
#[tauri::command]
pub async fn visual_safe_set(
    enabled: bool,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<bool, String> {
    player.lock()?.set_visual_safe(enabled);
    store
        .update(|s| s.visual_safe = enabled)
        .map_err(|e| reported(format!("Güvenli mod ayarı kaydedilemedi: {e}")))?;
    Ok(enabled)
}

/// Çalma seçenekleri (ses yüksekliği eşitlemesi vb.).
#[tauri::command]
pub async fn playback_options_get(
    player: State<'_, PlayerState>,
) -> Result<PlaybackOptions, String> {
    Ok(player.lock()?.playback_options())
}

/// Çalma seçeneklerini uygular (çalan sese hemen yansır) ve kaydeder. Bit-perfect
/// değişince ses aygıtı yeniden açılır; açılamazsa seçenek yine kaydedilir, hata döner.
#[tauri::command]
pub async fn playback_options_set(
    options: PlaybackOptions,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<PlaybackOptions, String> {
    let applied = player.lock()?.set_playback_options(options);
    store
        .update(|s| s.playback = options)
        .map_err(|e| reported(format!("Çalma seçenekleri kaydedilemedi: {e}")))?;
    applied.map_err(reported)?;
    Ok(options)
}

/// Kulaklık düzeltmesi ve eğrisi.
#[tauri::command]
pub async fn headphone_get(player: State<'_, PlayerState>) -> Result<HeadphoneState, String> {
    Ok(HeadphoneState::new(player.lock()?.headphone()))
}

/// AutoEq / Equalizer APO parametrik profil dosyasını okur, açar ve kaydeder.
#[tauri::command]
pub async fn headphone_import(
    path: String,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<HeadphoneState, String> {
    let profile = blocking(move || {
        let path = std::path::Path::new(&path);
        let text = std::fs::read_to_string(path)
            .map_err(|e| reported(format!("Profil dosyası okunamadı: {e}")))?;
        let name = path
            .file_stem()
            .map(|s| HeadphoneProfile::name_from_file(&s.to_string_lossy()))
            .unwrap_or_default();
        HeadphoneProfile::parse(&text, &name).map_err(reported)
    })
    .await?;
    apply_headphone(
        HeadphoneSettings {
            enabled: true,
            profile: Some(profile),
        },
        &player,
        &store,
    )
}

/// Kulaklık düzeltmesini açar ya da kapatır (profil korunur).
#[tauri::command]
pub async fn headphone_set_enabled(
    enabled: bool,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<HeadphoneState, String> {
    let current = player.lock()?.headphone();
    apply_headphone(HeadphoneSettings { enabled, ..current }, &player, &store)
}

/// Kulaklık profilini kaldırır.
#[tauri::command]
pub async fn headphone_clear(
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<HeadphoneState, String> {
    apply_headphone(HeadphoneSettings::default(), &player, &store)
}

fn apply_headphone(
    settings: HeadphoneSettings,
    player: &PlayerState,
    store: &SettingsStore,
) -> Result<HeadphoneState, String> {
    let applied = player.lock()?.set_headphone(settings);
    store
        .update(|s| s.headphone = applied.clone())
        .map_err(|e| reported(format!("Kulaklık ayarı kaydedilemedi: {e}")))?;
    Ok(HeadphoneState::new(applied))
}

/// Elle parametrik ekolayzer: ayar, eğriler, taşma koruması.
#[tauri::command]
pub async fn parametric_get(player: State<'_, PlayerState>) -> Result<ParametricState, String> {
    let player = player.lock()?;
    Ok(ParametricState::new(
        player.parametric(),
        player.parametric_comparing(),
    ))
}

/// Parametrik ekolayzeri uygular ve kaydeder.
#[tauri::command]
pub async fn parametric_set(
    settings: ParametricSettings,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<ParametricState, String> {
    apply_parametric(settings, &player, &store)
}

/// Karşılaştırma (A/B): açıkken parametrik ekolayzer atlanır, ses eşit yükseklikte çalar.
#[tauri::command]
pub async fn parametric_compare(
    compare: bool,
    player: State<'_, PlayerState>,
) -> Result<ParametricState, String> {
    let mut player = player.lock()?;
    player.set_parametric_compare(compare);
    Ok(ParametricState::new(
        player.parametric(),
        player.parametric_comparing(),
    ))
}

/// Equalizer APO biçimindeki dosyayı (AutoEq, REW, Equalizer APO) parametrik ekolayzere yükler.
#[tauri::command]
pub async fn parametric_import(
    path: String,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<ParametricState, String> {
    let profile = blocking(move || {
        let text = std::fs::read_to_string(&path)
            .map_err(|e| reported(format!("Dosya okunamadı: {e}")))?;
        HeadphoneProfile::parse(&text, "").map_err(reported)
    })
    .await?;
    apply_parametric(ParametricSettings::from_profile(&profile), &player, &store)
}

/// Kaydetme penceresini çekirdek açar: yazılacak yol arayüzden gelmez. Arayüzde bir hata yüzünden
/// betik çalıştırılabilse bile kullanıcının seçmediği bir yere dosya yazılamaz (DENETIM-FAZ0
/// KAB-06). Kullanıcı vazgeçerse `None`.
async fn ask_save_path(
    app: tauri::AppHandle,
    title: &'static str,
    file_name: String,
    filter: (&'static str, &'static str),
) -> Result<Option<PathBuf>, String> {
    use tauri_plugin_dialog::DialogExt;
    blocking(move || {
        app.dialog()
            .file()
            .set_title(title)
            .set_file_name(file_name)
            .add_filter(filter.0, &[filter.1])
            .blocking_save_file()
            .map(|chosen| {
                chosen
                    .into_path()
                    .map_err(|e| reported(format!("Kaydetme yolu okunamadı: {e}")))
            })
            .transpose()
    })
    .await
}

/// Seçilen yola yazar; kaydedilen dosyanın yolu.
async fn write_chosen(path: PathBuf, bytes: Vec<u8>) -> Result<Option<String>, String> {
    blocking(move || {
        std::fs::write(&path, bytes).map_err(|e| reported(format!("Dosya yazılamadı: {e}")))?;
        Ok(Some(path.display().to_string()))
    })
    .await
}

/// Parametrik ekolayzeri Equalizer APO biçiminde kullanıcının seçtiği dosyaya yazar; kaydedilen
/// dosyanın yolu (vazgeçildiyse `null`).
#[tauri::command]
pub async fn parametric_export(
    app: tauri::AppHandle,
    player: State<'_, PlayerState>,
) -> Result<Option<String>, String> {
    let text = player.lock()?.parametric().to_apo();
    let Some(path) = ask_save_path(
        app,
        "Parametrik ekolayzeri kaydet (Equalizer APO biçimi)",
        "Lyraska ParametricEQ.txt".to_owned(),
        ("Equalizer APO", "txt"),
    )
    .await?
    else {
        return Ok(None);
    };
    write_chosen(path, text.into_bytes()).await
}

fn apply_parametric(
    settings: ParametricSettings,
    player: &PlayerState,
    store: &SettingsStore,
) -> Result<ParametricState, String> {
    // Oynatıcı kilidi yalnızca ayarı uygularken tutulur; dosyaya yazma (diske işleme) kilit
    // dışında: bant sürüklenirken görsel veri ve durum sorguları beklemez (DENETIM-FAZ0 ISK-01).
    let (applied, comparing) = {
        let mut player = player.lock()?;
        let applied = player.set_parametric(settings);
        (applied, player.parametric_comparing())
    };
    store
        .update(|s| s.parametric = applied.clone())
        .map_err(|e| reported(format!("Parametrik ekolayzer kaydedilemedi: {e}")))?;
    Ok(ParametricState::new(applied, comparing))
}

/// Crossfeed: ayar, hazır ayarlar ve çizim için eğriler.
#[tauri::command]
pub async fn crossfeed_get(player: State<'_, PlayerState>) -> Result<CrossfeedState, String> {
    Ok(CrossfeedState::new(player.lock()?.crossfeed()))
}

/// Crossfeed'i uygular ve kaydeder; uygulanan (sınırlara çekilmiş) durumu döndürür.
#[tauri::command]
pub async fn crossfeed_set(
    settings: CrossfeedSettings,
    player: State<'_, PlayerState>,
    store: State<'_, SettingsStore>,
) -> Result<CrossfeedState, String> {
    let applied = player.lock()?.set_crossfeed(settings);
    store
        .update(|s| s.crossfeed = applied)
        .map_err(|e| reported(format!("Crossfeed ayarı kaydedilemedi: {e}")))?;
    Ok(CrossfeedState::new(applied))
}

/// Şarkı haritasını kullanıcının seçtiği dosyaya yazar (açık biçim, `docs/SARKI-HARITASI.md`);
/// kaydedilen dosyanın yolu (vazgeçildiyse `null`). Kullanıcının işaretlediği vuruş, drop ve ton
/// analizinkinin yerine geçer. `default_name`: pencerede önerilen dosya adı (klasör kısmı atılır).
#[tauri::command]
pub async fn song_map_export(
    path: PathBuf,
    default_name: String,
    app: tauri::AppHandle,
    player: State<'_, PlayerState>,
    annotations: State<'_, AnnotationStore>,
) -> Result<Option<String>, String> {
    let info = blocking(move || Ok(Decoder::open(&path).map_err(reported)?.info().clone())).await?;
    let marks = annotations.load(&AnnotatedTrack::from_info(&info));
    let map = player
        .lock()?
        .export_song_map(&info, marks.as_ref())
        .map_err(reported)?;
    let default_name = std::path::Path::new(&default_name).file_name().map_or_else(
        || "sarki.harita.json".to_owned(),
        |n| n.to_string_lossy().into_owned(),
    );
    let Some(target) = ask_save_path(
        app,
        "Şarkı haritasını kaydet",
        default_name,
        ("Lyraska şarkı haritası", "json"),
    )
    .await?
    else {
        return Ok(None);
    };
    write_chosen(target, map.to_json().into_bytes()).await
}

/// Şarkı haritası dosyasını şarkıya uygular (parmak iziyle eşleşirse).
#[tauri::command]
pub async fn song_map_import(
    path: PathBuf,
    file: PathBuf,
    player: State<'_, PlayerState>,
) -> Result<ImportedMapStatus, String> {
    let (info, map, file) = blocking(move || {
        let info = Decoder::open(&path).map_err(reported)?.info().clone();
        let map = MapFile::read(&file).map_err(reported)?;
        Ok((info, map, file))
    })
    .await?;
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    player
        .lock()?
        .import_song_map(&info, &map, &name)
        .map_err(reported)
}

/// Şarkıya içe aktarılmış ve uygulanan harita (yoksa `null`).
#[tauri::command]
pub async fn song_map_imported(
    path: PathBuf,
    player: State<'_, PlayerState>,
) -> Result<Option<ImportedMapStatus>, String> {
    Ok(player.lock()?.imported_song_map(&path))
}

/// İçe aktarılan haritayı kaldırır: programın analizi geri gelir.
#[tauri::command]
pub async fn song_map_remove(path: PathBuf, player: State<'_, PlayerState>) -> Result<(), String> {
    player
        .lock()?
        .remove_song_map(&path)
        .map_err(|e| reported(format!("Harita kaldırılamadı: {e}")))
}

/// İçe aktarılan şarkı haritalarının deposunu oynatıcıya bağlar (program açılırken).
pub fn set_map_store(player: &PlayerState, store: MapStore) {
    if let Ok(mut player) = player.lock() {
        player.set_map_store(Arc::new(store));
    }
}

/// İşaretleme: şarkının kayıtlı işaretleri (yoksa `null`).
#[tauri::command]
pub async fn annotation_get(
    path: PathBuf,
    store: State<'_, AnnotationStore>,
) -> Result<Option<Annotation>, String> {
    Ok(store.load(&annotated_track(path).await?))
}

/// İşaretleri şarkının işaret dosyasına yazar; dosyanın yolunu döndürür.
/// Önceki "doğruluk" sonucu, işaretler değiştiği için silinir.
#[tauri::command]
pub async fn annotation_save(
    path: PathBuf,
    beats: Vec<f64>,
    drops: Vec<f64>,
    key: Option<crate::analysis::key::MarkedKey>,
    store: State<'_, AnnotationStore>,
) -> Result<String, String> {
    let annotation = Annotation::new(annotated_track(path.clone()).await?, beats, drops, key);
    store
        .save(&annotation)
        .map(|p| p.display().to_string())
        .map_err(|e| reported(format!("İşaretler kaydedilemedi: {e}")))
}

/// Kayıtlı işaretleri programın beat analiziyle karşılaştırır (birkaç saniye
/// sürer); sonucu işaret dosyasına ekler ve döndürür.
#[tauri::command]
pub async fn annotation_evaluate(
    path: PathBuf,
    store: State<'_, AnnotationStore>,
) -> Result<Annotation, String> {
    let track = annotated_track(path.clone()).await?;
    let annotation = store
        .load(&track)
        .ok_or_else(|| "Önce işaretleri kaydedin.".to_owned())?;
    if annotation.beats.len() < MIN_EVALUATION_BEATS {
        return Err(format!(
            "Doğruluğu ölçmek için en az {MIN_EVALUATION_BEATS} beat işaretleyin."
        ));
    }
    let marked = annotation.beats.clone();
    let marked_drops = annotation.drops.clone();
    let marked_key = annotation.key;
    let result = tauri::async_runtime::spawn_blocking(move || {
        evaluate::evaluate_file(&path, &marked, &marked_drops, marked_key)
    })
    .await
    .map_err(reported)?
    .map_err(reported)?;
    // Yalnızca ölçülen işaretler hâlâ diskteyse yazılır: ölçüm sürerken kaydedilen yeni işaretler
    // eskileriyle ezilmez (DENETIM-FAZ0 ISK-03).
    store
        .save_evaluation(&annotation, result)
        .map_err(|e| match e {
            EvaluationSaveError::MarksChanged => {
                "Ölçüm sürerken işaretler değişti; sonuç yazılmadı. Yeniden ölçün.".to_owned()
            }
            EvaluationSaveError::Io(e) => reported(format!("Sonuç kaydedilemedi: {e}")),
        })
}

/// Çalan şarkının yapısı (ölçü, bölümler, droplar, enerji); analiz bitmediyse `null`.
#[tauri::command]
pub async fn song_map(
    player: State<'_, PlayerState>,
) -> Result<Option<crate::analysis::structure::SongMap>, String> {
    Ok(player.lock()?.song_map().map(|m| (*m).clone()))
}

/// Çalan şarkının tonu (Camelot) ve tonu farklı bölümleri; ton analizi bitmediyse `null`.
#[tauri::command]
pub async fn song_key(
    player: State<'_, PlayerState>,
) -> Result<Option<crate::analysis::key::KeyMap>, String> {
    Ok(player.lock()?.song_key())
}

/// İşaret dosyalarının klasörünü dosya gezgininde açar.
#[tauri::command]
pub fn annotation_open_folder(store: State<'_, AnnotationStore>) -> Result<(), String> {
    let dir = store
        .dir()
        .ok_or_else(|| "İşaret klasörü bulunamadı.".to_owned())?;
    std::fs::create_dir_all(dir).map_err(|e| reported(format!("Klasör açılamadı: {e}")))?;
    crate::file_manager::open_folder(dir).map_err(|e| reported(format!("Klasör açılamadı: {e}")))
}

async fn annotated_track(path: PathBuf) -> Result<AnnotatedTrack, String> {
    blocking(move || {
        let decoder = Decoder::open(&path).map_err(reported)?;
        Ok(AnnotatedTrack::from_info(decoder.info()))
    })
    .await
}

/// Arayüzde oluşan hatayı (yakalanmamış istisna vb.) günlüğe yazar.
#[tauri::command]
pub fn log_frontend_error(message: String) {
    diagnostics::error(&format!(
        "arayüz: {}",
        message.chars().take(4000).collect::<String>()
    ));
}

/// Hata günlüğünü dosya gezgininde seçili olarak gösterir (hata kaydına eklemek için).
#[tauri::command]
pub fn open_log() -> Result<(), String> {
    let path = diagnostics::log_path()
        .ok_or_else(|| "Hata günlüğü açılamadı: uygulama veri klasörü bulunamadı.".to_owned())?;
    crate::file_manager::reveal(&path).map_err(|e| format!("Hata günlüğü açılamadı: {e}"))
}

/// Kör dinleme testini kurar: iki dosyanın aynı bölümü belleğe çözülür, hizalanır, ses yüksekliği
/// eşitlenir. Çalan şarkı durur; test bitince kaldığı yerde duraklatılmış açılır.
#[tauri::command]
pub async fn abx_start(
    a: PathBuf,
    b: PathBuf,
    start_secs: f64,
    clip_secs: f64,
    trials: usize,
    player: State<'_, PlayerState>,
) -> Result<AbxStatus, String> {
    let request = AbxRequest {
        a,
        b,
        start_secs,
        clip_secs,
        trials,
    };
    // Hazırlık (iki dosyayı çözme, hizalama) saniyeler sürebilir: oynatıcının kilidi dışında ve
    // ayrı bir iş parçacığında yapılır; görseller ve durum sorguları bu sırada beklemez.
    let prepared = tauri::async_runtime::spawn_blocking(move || AbxTest::prepare(&request))
        .await
        .map_err(reported)?;
    player.lock()?.abx_install(prepared).map_err(reported)
}

/// Testte A, B ya da X'i çalar (aynı konumdan).
#[tauri::command]
pub async fn abx_select(
    choice: AbxChoice,
    player: State<'_, PlayerState>,
) -> Result<AbxStatus, String> {
    Ok(player.lock()?.abx_select(choice))
}

#[tauri::command]
pub async fn abx_pause(player: State<'_, PlayerState>) -> Result<AbxStatus, String> {
    Ok(player.lock()?.abx_pause())
}

/// "X, A'dır" ya da "X, B'dir".
#[tauri::command]
pub async fn abx_answer(
    guess: AbxSource,
    player: State<'_, PlayerState>,
) -> Result<AbxStatus, String> {
    Ok(player.lock()?.abx_answer(guess))
}

#[tauri::command]
pub async fn abx_status(player: State<'_, PlayerState>) -> Result<AbxStatus, String> {
    Ok(player.lock()?.abx_status())
}

/// Testi kapatır.
#[tauri::command]
pub async fn abx_stop(player: State<'_, PlayerState>) -> Result<AbxStatus, String> {
    // Şarkıya dönüş (ses aygıtını açmak) kilit dışında: görsel kareler ve durum sorguları beklemez.
    let transition = player.lock()?.begin_abx_stop();
    if let Some(transition) = transition {
        let prepared = tauri::async_runtime::spawn_blocking(move || Player::prepare(transition))
            .await
            .map_err(reported)?;
        // Açılamazsa (ör. dosya silindi) hata durumu gösterilir; test yine kapanır.
        let _ = player.lock()?.install(prepared);
    }
    Ok(AbxStatus::inactive())
}

/// Konum, durum ve şarkı bilgisi. Arayüz bunu düzenli aralıklarla sorar.
#[tauri::command]
pub async fn playback_status(player: State<'_, PlayerState>) -> Result<PlaybackStatus, String> {
    // Kulaklık takılıp çıkarılınca: yeni aygıtı açmak kilit dışında (görseller beklemez).
    let transition = player.lock()?.begin_device_recovery();
    finish_transition(transition, &player).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surum_package_json_ile_ayni() {
        // Sürüm numarası `package.json`'da; Cargo.toml aynı tutulur (CLAUDE.md). Biri unutulursa
        // ekrandaki sürüm ile kurulu farklı olur (DENETIM.md C7).
        let package: serde_json::Value =
            serde_json::from_str(include_str!("../../package.json")).unwrap();
        assert_eq!(
            package["version"].as_str(),
            Some(env!("CARGO_PKG_VERSION")),
            "package.json ile src-tauri/Cargo.toml sürümleri farklı"
        );
    }

    #[test]
    fn surum_cargo_toml_ile_ayni() {
        assert_eq!(AppInfo::current().version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn arayuze_camel_case_gonderilir() {
        let json = serde_json::to_value(AppInfo::current()).unwrap();
        assert!(json.get("audioEngine").is_some());
        assert!(json.get("supportedExtensions").is_some());
        assert!(json.get("audio_engine").is_none());
    }

    #[test]
    fn ekolayzer_arayuz_bicimine_uyar() {
        let json = serde_json::to_value(EqState::new(EqSettings::default(), 0.0, None)).unwrap();
        for key in [
            "enabled",
            "gainsDb",
            "bandsHz",
            "maxGainDb",
            "preampDb",
            "curveHz",
            "curveDb",
        ] {
            assert!(json.get(key).is_some(), "{key} eksik");
        }
        // Arayüzden gelen ayar biçimi.
        let settings: EqSettings = serde_json::from_value(
            serde_json::json!({"enabled": false, "gainsDb": [1,0,0,0,0,0,0,0,0,0]}),
        )
        .unwrap();
        assert!(!settings.enabled);
        assert_eq!(settings.gains_db[0], 1.0);
    }

    #[test]
    fn kayitli_ayarlar_oynaticiya_uygulanir() {
        let store = SettingsStore::in_memory();
        let profile = HeadphoneProfile::parse(
            "Preamp: -3 dB\nFilter 1: ON PK Fc 1000 Hz Gain 3 dB Q 1\n",
            "Deneme",
        )
        .unwrap();
        store
            .update(|s| {
                s.equalizer.gains_db[4] = 7.0;
                s.visual_safe = true;
                s.audio_delay_ms = 180;
                s.headphone = HeadphoneSettings {
                    enabled: true,
                    profile: Some(profile.clone()),
                };
            })
            .unwrap();
        let player = PlayerState::default();
        restore_settings(&player, &store);
        let restored = player.lock().unwrap();
        assert_eq!(restored.equalizer().gains_db[4], 7.0);
        assert!(restored.headphone().enabled);
        assert!(restored.visual_safe());
        assert_eq!(restored.audio_delay_ms(), 180);
        assert_eq!(restored.headphone().profile.unwrap().name, "Deneme");
    }

    #[test]
    fn eski_ayar_dosyasi_kulaklik_ayari_olmadan_okunur() {
        let settings: crate::settings::Settings = serde_json::from_str(
            r#"{"equalizer":{"enabled":true,"gainsDb":[0,0,0,0,0,0,0,0,0,0]}}"#,
        )
        .unwrap();
        assert_eq!(settings.headphone, HeadphoneSettings::default());
        assert!(!settings.visual_safe);
        assert_eq!(settings.audio_delay_ms, 0);
    }

    #[test]
    fn oynatici_durumu_arayuz_bicimine_uyar() {
        let json = serde_json::to_value({
            let mut player = Player::new();
            player.status()
        })
        .unwrap();
        assert_eq!(json["state"], "idle");
        assert_eq!(json["positionSecs"], 0.0);
        assert!(json.get("underruns").is_some());
    }
}
