//! Lyraska çekirdeği.
//!
//! Modül yapısı:
//! - [`audio`]: ses motoru (çözme, 64-bit iç işlem, WASAPI çıkışı)
//! - [`analysis`]: şarkı haritası analizi (beat, ölçü, bölümler, drop, enerji)
//! - [`director`]: Görsel Yönetmen — şarkıyı önceden bilen koreografi (atmosfer, ritim, doku)
//! - [`visual_bridge`]: analiz ve çalma zamanını arayüzdeki görsellere taşıyan köprü
//! - [`library`]: müzik kütüphanesi (SQLite, klasör tarama, arama)
//! - [`milkdrop`]: MilkDrop sahnesi için kullanıcının kendi `.milk` dosyaları (okuma, çevirme)
//! - [`storage`]: kütüphane veritabanının şeması ve sıralı göçleri
//! - [`settings`]: kalıcı kullanıcı ayarları (ekolayzer vb.)
//! - [`commands`]: arayüzün çağırabildiği Tauri komutları
//! - [`diagnostics`]: yerel hata ve çökme günlüğü
//! - [`data_dirs`]: veri klasörleri ve tek örnek kilidi; [`atomic_file`]: bölünmez dosya yazma

pub mod analysis;
pub mod atomic_file;
pub mod audio;
pub mod commands;
pub mod data_dirs;
pub mod diagnostics;
pub mod director;
pub mod file_manager;
pub mod library;
pub mod milkdrop;
pub mod settings;
pub mod storage;
pub mod visual_bridge;

use tauri::Manager;

/// Kütüphane bir taramayla değişince arayüze gönderilen olay (`src/lib/backend.ts` dinler).
pub const LIBRARY_CHANGED_EVENT: &str = "kutuphane-degisti";

/// Programı başlatır.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    // Küçük, kullanıcıya ait veri (ayarlar, işaretler) gezici klasörde (Roaming); büyük ve yeniden
    // üretilebilir veri (kütüphane + analiz önbelleği, günlükler) makineye özgü klasörde (Local).
    // Klasörler Tauri'den önce bulunur.
    let paths = data_dirs::locate(&context.config().identifier);
    // Tek örnek: kilit her zaman Local'da. Program zaten açıksa ikinci kopya hiçbir dosyaya
    // dokunmadan (taşıma, günlük) kapanır.
    let lock = paths
        .as_ref()
        .map(|(_, local)| data_dirs::acquire_instance_lock(local));
    if let Some(Err(data_dirs::LockError::AlreadyRunning)) = lock {
        already_running_notice();
        return;
    }
    // Eski sürümün Roaming'e yazdıkları bir kez taşınır (kilitten sonra: iki kopya aynı anda taşımaz).
    let early = paths.map(|(roaming, local)| data_dirs::DataDirs::migrate(roaming, &local));
    // Hata ve çökme günlüğü pencereden önce açılır: WebView2 ya da pencere açılamazsa Tauri
    // panikler; o çökme de günlüğe yazılır ve kullanıcıya gösterilir.
    if let Some((dirs, migration)) = &early {
        diagnostics::init(&dirs.big.join("logs"));
        log_migration(migration);
    }
    let early = early.map(|(dirs, _)| dirs);
    let _instance = match lock {
        Some(Ok(lock)) => Some(lock),
        Some(Err(data_dirs::LockError::Io(e))) => {
            diagnostics::error(&format!("Tek örnek kilidi alınamadı: {e}"));
            None
        }
        _ => None,
    };
    // Önceki oturum yarıda kaldıysa (çökme, elektrik kesintisi) kütüphane bu açılışta tam denetlenir.
    let session_dir = early.as_ref().map(|dirs| dirs.big.clone());
    let unclean = session_dir.as_deref().is_some_and(data_dirs::begin_session);
    if unclean {
        diagnostics::info("Önceki oturum düzgün kapanmamış; kütüphane dosyası denetleniyor");
    }

    let built = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::PlayerState::default())
        .setup(move |app| {
            let (roaming, big) = match early {
                Some(dirs) => (Ok(dirs.roaming), Ok(dirs.big)),
                // İşletim sistemi klasörü bildirmediyse Tauri'ninki (aynı kural).
                None => {
                    let roaming = app.path().app_data_dir().map_err(|e| e.to_string());
                    let big = match (&roaming, app.path().app_local_data_dir()) {
                        (Ok(roaming), Ok(local)) => {
                            let (big, migration) = data_dirs::big_data_dir(roaming, &local);
                            diagnostics::init(&big.join("logs"));
                            log_migration(&migration);
                            Ok(big)
                        }
                        (Ok(roaming), Err(_)) => Ok(roaming.clone()),
                        (Err(e), _) => Err(e.clone()),
                    };
                    (roaming, big)
                }
            };
            app.manage(commands::BigDataDir(big.clone()));
            // Kütüphane açılır açılmaz arka planda güncellenir.
            // Etiketi okunurken programı kapatan dosya her açılışta yeniden kapatmasın.
            let service = big.clone().and_then(|dir| {
                library::LibraryService::open_checked(&dir.join("library.sqlite3"), unclean)
                    .map(|service| {
                        service.with_crash_guard(analysis::background::CrashGuard::named(
                            dir.clone(),
                            "tarama",
                        ))
                    })
                    .map_err(|e| e.to_string())
            });
            match &service {
                Ok(service) => {
                    // Tarama kütüphaneyi değiştirince (ör. izlenen klasöre yeni şarkı indi)
                    // arayüz listeyi kendiliğinden tazeler.
                    let handle = app.handle().clone();
                    service.set_on_change(move || {
                        let _ = tauri::Emitter::emit(&handle, LIBRARY_CHANGED_EVENT, ());
                    });
                    service.request_scan();
                    service.start_watching();
                }
                Err(error) => diagnostics::error(&format!("Kütüphane açılamadı: {error}")),
            }
            app.manage(commands::LibraryState::new(service));

            // Şarkı haritası önbelleği kütüphaneyle aynı veritabanında; kütüphane arka
            // planda, düşük öncelikle analiz edilir (önce çalan, sonra sıradaki şarkı).
            let background = big
                .clone()
                .and_then(|dir| {
                    analysis::cache::AnalysisCache::open(&dir.join("library.sqlite3"))
                        .map_err(|e| e.to_string())
                })
                .map_err(|e| diagnostics::error(&format!("Analiz önbelleği açılamadı: {e}")))
                .ok()
                .and_then(|cache| {
                    // Çökme döngüsü koruması: analizi programı kapatan dosya atlanır.
                    let guard = match &big {
                        Ok(dir) => analysis::background::CrashGuard::new(dir.clone()),
                        Err(_) => analysis::background::CrashGuard::disabled(),
                    };
                    commands::start_analysis_cache(
                        &app.state::<commands::PlayerState>(),
                        std::sync::Arc::new(cache),
                        guard,
                    )
                });
            app.manage(commands::BackgroundState(background));

            // Ayarlar (ekolayzer) kaldığı gibi geri yüklenir.
            let store = match &roaming {
                Ok(dir) => settings::SettingsStore::open(&dir.join("settings.json")),
                Err(_) => settings::SettingsStore::in_memory(),
            };
            commands::restore_settings(&app.state::<commands::PlayerState>(), &store);
            app.manage(store);

            // İçe aktarılan şarkı haritaları: uygulama veri klasöründe, ses içermez.
            commands::set_map_store(
                &app.state::<commands::PlayerState>(),
                match &roaming {
                    Ok(dir) => analysis::map_file::MapStore::new(dir.join("haritalar")),
                    Err(_) => analysis::map_file::MapStore::unavailable(),
                },
            );

            // İnsan işaretleri (beat/drop): uygulama veri klasöründe, ses içermez.
            app.manage(match roaming {
                Ok(dir) => analysis::annotation::AnnotationStore::new(dir.join("isaretler")),
                Err(_) => analysis::annotation::AnnotationStore::unavailable(),
            });
            diagnostics::mark_started();
            Ok(())
        })
        // Sürükle-bırak sorunlarını ayırt etmek için: Windows dosyaları pencereye
        // ulaştırıyor mu? (Arayüzün bırakılanları işlediği ayrıca yazılır.)
        .on_window_event(|window, event| {
            // Pencereye dönülünce izlenemeyen kaynaklar taranır (seyrek; bkz. on_window_focus).
            // `try_state`: kurulum bitmeden gelen odak olayında kütüphane henüz yönetilmiyor olabilir.
            if let tauri::WindowEvent::Focused(true) = event {
                if let Some(library) = window.try_state::<commands::LibraryState>() {
                    library.on_window_focus();
                }
            }
            if let tauri::WindowEvent::DragDrop(drag) = event {
                match drag {
                    tauri::DragDropEvent::Enter { paths, .. } => {
                        diagnostics::info(&format!("Pencereye {} öğe sürükleniyor", paths.len()));
                    }
                    tauri::DragDropEvent::Drop { paths, .. } => {
                        diagnostics::info(&format!("Pencereye {} öğe bırakıldı", paths.len()));
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_track,
            commands::track_cover,
            commands::track_lyrics,
            commands::toggle_playback,
            commands::stop_playback,
            commands::seek_playback,
            commands::playback_status,
            commands::visual_frame,
            commands::visual_waveform,
            commands::library_status,
            commands::library_add_folder,
            commands::library_add_dropped,
            commands::library_remove_folder,
            commands::library_rescan,
            commands::library_search,
            commands::library_albums,
            commands::library_album_tracks,
            commands::library_artists,
            commands::library_artist_tracks,
            commands::album_cover_get,
            commands::album_cover_set,
            commands::album_cover_clear,
            commands::playlists_list,
            commands::playlist_create,
            commands::playlist_rename,
            commands::playlist_delete,
            commands::playlist_tracks,
            commands::playlist_add,
            commands::playlist_remove,
            commands::playlist_move,
            commands::playlist_cover_get,
            commands::playlist_cover_set,
            commands::playlist_cover_clear,
            commands::playlist_export,
            commands::playlist_import,
            commands::equalizer_get,
            commands::equalizer_set,
            commands::set_next_track,
            commands::log_frontend_error,
            commands::open_log,
            commands::annotation_get,
            commands::annotation_save,
            commands::annotation_evaluate,
            commands::annotation_open_folder,
            commands::song_map,
            commands::song_key,
            commands::headphone_get,
            commands::headphone_import,
            commands::headphone_set_enabled,
            commands::headphone_clear,
            commands::parametric_get,
            commands::parametric_set,
            commands::parametric_compare,
            commands::parametric_import,
            commands::parametric_export,
            commands::song_map_export,
            commands::song_map_import,
            commands::song_map_imported,
            commands::song_map_remove,
            commands::crossfeed_get,
            commands::crossfeed_set,
            commands::visual_safe_get,
            commands::visual_safe_set,
            commands::playback_options_get,
            commands::playback_options_set,
            commands::audio_delay_get,
            commands::audio_delay_set,
            commands::calibration_track,
            commands::milkdrop_list,
            commands::milkdrop_set_folder,
            commands::milkdrop_load,
            commands::abx_start,
            commands::abx_select,
            commands::abx_pause,
            commands::abx_answer,
            commands::abx_status,
            commands::abx_stop,
        ])
        .build(context);
    let app = match built {
        Ok(app) => app,
        Err(e) => {
            // Olay döngüsü ya da bir eklenti kurulamadı (pencere ve WebView2 burada değil, `run`
            // içinde açılır; onların hatası panik olarak günlüğe ve uyarı kutusuna gider).
            let message = format!("Lyraska başlatılamadı: {e}");
            diagnostics::error(&message);
            eprintln!("{message}");
            // Konsolsuz programda kullanıcının tek izi bu kutu (neden ve günlüğün yeri).
            diagnostics::startup_failure_dialog(&message);
            std::process::exit(1);
        }
    };
    app.run(move |app, event| {
        if let tauri::RunEvent::Exit = event {
            // Ses önce durur: kapanış sırasında aygıtta yarım arabellek kalmasın.
            commands::stop_on_exit(&app.state::<commands::PlayerState>());
            app.state::<commands::LibraryState>().shutdown();
            app.state::<commands::BackgroundState>().shutdown();
            if let Some(dir) = &session_dir {
                data_dirs::end_session(dir);
            }
        }
    });
}

/// Eski kütüphanenin taşınmasının sonucu: Roaming'de kalındıysa hata kaydında görünsün.
fn log_migration(migration: &data_dirs::Migration) {
    match migration {
        data_dirs::Migration::NotNeeded => {}
        data_dirs::Migration::Moved => {
            diagnostics::info("Kütüphane ve günlükler makineye özgü klasöre (Local) taşındı");
        }
        data_dirs::Migration::KeptInRoaming(reason) => diagnostics::error(&format!(
            "Kütüphane Local klasörüne taşınamadı, Roaming'de kalıyor: {reason}"
        )),
    }
}

/// Program zaten açıkken ikinci kez başlatılınca: kullanıcıya kısa bir not (Windows).
fn already_running_notice() {
    diagnostics::notice_dialog(
        "Lyraska zaten açık. Görev çubuğundaki Lyraska penceresine geçin.",
        false,
    );
}
