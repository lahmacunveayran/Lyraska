use std::sync::atomic::AtomicUsize;
use std::time::{Duration, Instant};

use rtrb::RingBuffer;

use super::decode_thread::decode_loop;
use super::session::{derive_state, Segment, RING_SECONDS};
use super::transition::MAX_DEVICE_RECOVERIES;
use super::*;
use crate::analysis::cache::{AnalysisCache, FileStamp};
use crate::analysis::map_file::MapError;
use crate::analysis::spectrogram::Spectrogram;
use crate::audio::output::{self, OutputMode, OutputSpec};
use crate::audio::resample::Converter;
use crate::audio::test_util::{temp_path, write_wav};
use crate::audio::Sample;

fn test_segment() -> Segment {
    Segment {
        info: TrackInfo {
            path: PathBuf::from("deneme.wav"),
            file_name: "deneme".into(),
            title: None,
            artist: None,
            album: None,
            album_artist: None,
            track_number: None,
            disc_number: None,
            codec: "pcm".into(),
            sample_rate: 8_000,
            channels: 2,
            duration_secs: None,
        },
        first_output_frame: 0,
        start_frame: 0,
        rate_ratio: 1.0,
    }
}

#[test]
fn durum_onceligi_dogru() {
    assert_eq!(derive_state(true, true, true), PlaybackState::Error);
    assert_eq!(derive_state(false, true, true), PlaybackState::Ended);
    assert_eq!(derive_state(false, false, true), PlaybackState::Paused);
    assert_eq!(derive_state(false, false, false), PlaybackState::Playing);
}

#[test]
fn yeni_oynatici_bos_durumda() {
    let mut player = Player::new();
    let status = player.status();
    assert_eq!(status.state, PlaybackState::Idle);
    assert!(status.track.is_none());
    assert_eq!(status.position_secs, 0.0);
}

#[test]
fn cozme_dongusu_butun_ornekleri_sirasiyla_aktarir() {
    let path = temp_path("akis.wav");
    let frames = 30_000;
    // Her örnek kendi sırasını taşır; sıra bozulursa test yakalar.
    write_wav(&path, 8_000, 2, frames, |frame, channel| {
        ((frame * 2 + channel) % 2000) as f64 / 2000.0 - 0.5
    });
    let decoder = Decoder::open(&path).unwrap();

    // Küçük tampon: geri basınç (tampon dolu → bekle) yolunu da sınar.
    let (producer, mut consumer) = RingBuffer::<Sample>::new(1_001);
    let shared = Arc::new(SharedState::new(
        false,
        test_segment(),
        RenderControls::default(),
    ));
    let thread_shared = Arc::clone(&shared);
    let converter = Converter::new(8_000, 2, 8_000, 2).unwrap();
    let spec = OutputSpec {
        sample_rate: 8_000,
        channels: 2,
        mode: OutputMode::Shared,
    };
    let handle = std::thread::spawn(move || {
        decode_loop(decoder, converter, spec, producer, &thread_shared, None)
    });

    let mut received = Vec::with_capacity(frames * 2);
    while received.len() < frames * 2 {
        match consumer.pop() {
            Ok(sample) => received.push(sample),
            Err(_) => std::thread::yield_now(),
        }
    }
    handle.join().unwrap();

    assert!(shared.decode_done.load(Ordering::Acquire));
    assert!(shared.prefilled.load(Ordering::Acquire));
    assert!(consumer.is_empty());
    for (i, sample) in received.iter().enumerate() {
        let expected = (i % 2000) as f64 / 2000.0 - 0.5;
        assert!(
            (sample - expected).abs() < 1e-4,
            "örnek {i}: {sample} != {expected}"
        );
    }
    std::fs::remove_file(path).ok();
}

#[test]
fn durdurma_isareti_cozme_dongusunu_bitirir() {
    let path = temp_path("durdur.wav");
    write_wav(&path, 8_000, 1, 80_000, |_, _| 0.1);
    let decoder = Decoder::open(&path).unwrap();
    let (producer, _consumer) = RingBuffer::<Sample>::new(100); // hiç boşalmayacak
    let shared = Arc::new(SharedState::new(
        false,
        test_segment(),
        RenderControls::default(),
    ));
    let thread_shared = Arc::clone(&shared);
    let converter = Converter::new(8_000, 1, 8_000, 2).unwrap();
    let spec = OutputSpec {
        sample_rate: 8_000,
        channels: 2,
        mode: OutputMode::Shared,
    };
    let handle = std::thread::spawn(move || {
        decode_loop(decoder, converter, spec, producer, &thread_shared, None)
    });

    wait_for_prefill(&shared, Duration::from_secs(5));
    shared.stop.store(true, Ordering::Release);
    handle.join().unwrap();
    assert!(
        !shared.decode_done.load(Ordering::Acquire),
        "dosya sonuna gelinmemeli"
    );
    std::fs::remove_file(path).ok();
}

#[test]
fn acilamayan_dosya_hata_durumuna_gecirir() {
    let mut player = Player::new();
    let error = player
        .load(Path::new("/olmayan/sarki.flac"), true)
        .err()
        .unwrap();
    assert!(matches!(error, AudioError::Open(_)));
    let status = player.status();
    assert_eq!(status.state, PlaybackState::Error);
    assert!(status.error.unwrap().contains("Dosya açılamadı"));

    // Oynatıcı bozulmaz: yeni komutlar sorunsuz çalışır.
    player.play().unwrap();
    player.stop().unwrap();
}

#[test]
fn acilamayan_dosya_calan_sarkiyi_susturmaz() {
    let calan = ramp_song("n1-calan.wav");
    let bozuk = temp_path("n1-bozuk.wav");
    std::fs::write(&bozuk, [0u8; 64]).unwrap();
    let mut player = Player::new();
    player.load(&calan, false).unwrap();
    player.seek(1.2).unwrap();
    let before = player.status();

    // Olmayan ve bozuk dosya: hata döner ama çalan oturum yerinde kalır.
    for path in [Path::new("/olmayan/sarki.flac"), bozuk.as_path()] {
        assert!(player.load(path, true).is_err());
        let after = player.status();
        assert_eq!(after.state, before.state);
        assert!(after.error.is_none(), "{:?}", after.error);
        assert_eq!(
            after.track.as_ref().map(|t| &t.path),
            before.track.as_ref().map(|t| &t.path)
        );
        assert!((after.position_secs - before.position_secs).abs() < 0.05);
    }
    std::fs::remove_file(calan).ok();
    std::fs::remove_file(bozuk).ok();
}

/// Koşul sağlanana kadar (en fazla 5 sn) bekler.
fn wait_until(mut condition: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if condition() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    false
}

/// Her karesi kendi zamanını taşıyan 2 saniyelik mono test şarkısı.
fn ramp_song(name: &str) -> PathBuf {
    let path = temp_path(name);
    write_wav(&path, 8_000, 1, 16_000, |frame, _| frame as f64 / 16_000.0);
    path
}

#[test]
fn bosluksuz_geciste_ornekler_ara_vermeden_surer() {
    // A: 0..3000, B: 3000..5000 değerlerini taşıyan iki şarkı. Halka tampona
    // aralarında tek örnek bile eksik ya da fazla olmadan art arda gelmeli.
    let a = temp_path("bosluksuz-a.wav");
    let b = temp_path("bosluksuz-b.wav");
    write_wav(&a, 8_000, 2, 3_000, |f, _| f as f64 / 10_000.0);
    write_wav(&b, 8_000, 2, 2_000, |f, _| (3_000 + f) as f64 / 10_000.0);
    let decoder = Decoder::open(&a).unwrap();
    let (producer, mut consumer) = RingBuffer::<Sample>::new(777);
    let shared = Arc::new(SharedState::new(
        false,
        test_segment(),
        RenderControls::default(),
    ));
    shared.set_next(Some(b.clone()));
    let thread_shared = Arc::clone(&shared);
    let converter = Converter::new(8_000, 2, 8_000, 2).unwrap();
    let spec = OutputSpec {
        sample_rate: 8_000,
        channels: 2,
        mode: OutputMode::Shared,
    };
    let handle = std::thread::spawn(move || {
        decode_loop(decoder, converter, spec, producer, &thread_shared, None)
    });
    let mut received = Vec::new();
    while !(shared.decode_done.load(Ordering::Acquire) && consumer.is_empty()) {
        match consumer.pop() {
            Ok(sample) => received.push(sample),
            Err(_) => std::thread::yield_now(),
        }
    }
    handle.join().unwrap();
    assert_eq!(received.len(), 5_000 * 2);
    for (i, pair) in received.chunks(2).enumerate() {
        assert!(
            (pair[0] - i as f64 / 10_000.0).abs() < 1e-4,
            "kare {i}: {}",
            pair[0]
        );
    }
    // İkinci şarkı, çıkış akışının 3000. karesinde başlar.
    let segments = shared.segments.lock().unwrap().clone();
    assert_eq!(segments.len(), 2);
    assert_eq!(segments[1].first_output_frame, 3_000);
    assert_eq!(segments[1].info.path, b);
    // Konum hesabı: sınırdan önce A'da, sonra B'nin başında.
    shared.output_heard.store(2_999, Ordering::Release);
    assert_eq!(
        shared.now_playing().unwrap().0.path,
        PathBuf::from("deneme.wav")
    );
    shared.output_heard.store(3_400, Ordering::Release);
    let (track, seconds) = shared.now_playing().unwrap();
    assert_eq!(track.path, b);
    assert!((seconds - 0.05).abs() < 1e-9, "{seconds}");
    // Görsel zaman (A3): ses aygıtı 200 ms geç çalıyorsa duyulan B'nin 50. ms'i olsa da
    // görseller hâlâ A'nın sonunu göstermeli (B'nin 0. karesinde donmamalı).
    let (track, seconds) = shared.playing_at(-0.2).unwrap();
    assert_eq!(track.path, PathBuf::from("deneme.wav"), "{seconds}");
    assert!((seconds - 0.225).abs() < 1e-9, "{seconds}");
    // Ekran gecikmesi kadar ileri okurken sınırın hemen öncesinde B'ye geçilir.
    shared.output_heard.store(2_999, Ordering::Release);
    let (track, seconds) = shared.playing_at(0.05).unwrap();
    assert_eq!(track.path, b);
    assert!((seconds - 0.049875).abs() < 1e-9, "{seconds}");
    // Şarkının başından önceye gitmez.
    shared.output_heard.store(100, Ordering::Release);
    assert_eq!(shared.playing_at(-0.2).unwrap().1, 0.0);
    std::fs::remove_file(a).ok();
    std::fs::remove_file(b).ok();
}

#[test]
fn bosluksuz_geciste_yeniden_orneklenen_dalga_sinirda_kopmaz() {
    // 44,1 kHz kesintisiz albüm, 48 kHz aygıt (#54): iki şarkıya bölünmüş tek bir dalga.
    // Çıkış, aynı örneklerin tek bir dönüştürücüden geçmiş halinin aynısı olmalı;
    // şarkı başına ayrı dönüştürücü sınırda dalgayı koparıyor, tık duyuluyordu.
    let wave =
        |frame: usize| 0.5 * (2.0 * std::f64::consts::PI * 100.0 * frame as f64 / 44_100.0).sin();
    let a = temp_path("kesintisiz-a.wav");
    let b = temp_path("kesintisiz-b.wav");
    write_wav(&a, 44_100, 2, 30_000, |f, _| wave(f));
    write_wav(&b, 44_100, 2, 20_000, |f, _| wave(30_000 + f));
    let (producer, mut consumer) = RingBuffer::<Sample>::new(4_096);
    let shared = Arc::new(SharedState::new(
        false,
        test_segment(),
        RenderControls::default(),
    ));
    shared.set_next(Some(b.clone()));
    let thread_shared = Arc::clone(&shared);
    let decoder = Decoder::open(&a).unwrap();
    let converter = Converter::new(44_100, 2, 48_000, 2).unwrap();
    let spec = OutputSpec {
        sample_rate: 48_000,
        channels: 2,
        mode: OutputMode::Shared,
    };
    let handle = std::thread::spawn(move || {
        decode_loop(decoder, converter, spec, producer, &thread_shared, None)
    });
    let mut received = Vec::new();
    while !(shared.decode_done.load(Ordering::Acquire) && consumer.is_empty()) {
        match consumer.pop() {
            Ok(sample) => received.push(sample),
            Err(_) => std::thread::yield_now(),
        }
    }
    handle.join().unwrap();

    let mut whole = Converter::new(44_100, 2, 48_000, 2).unwrap();
    let mut expected = Vec::new();
    for path in [&a, &b] {
        let mut decoder = Decoder::open(path).unwrap();
        while let Some(chunk) = decoder.next_chunk().unwrap() {
            expected.extend_from_slice(whole.process(chunk).unwrap());
        }
    }
    expected.extend_from_slice(whole.finish().unwrap());
    assert_eq!(received.len(), expected.len());
    let worst = received
        .iter()
        .zip(&expected)
        .map(|(got, want)| (got - want).abs())
        .fold(0.0, f64::max);
    assert!(worst < 1e-9, "sınırda {worst} sapma");
    // B, A'nın aygıt hızındaki süresinin bittiği karede başlar.
    let segments = shared.segments.lock().unwrap().clone();
    assert_eq!(segments.len(), 2);
    assert_eq!(segments[1].first_output_frame, 32_653);
    std::fs::remove_file(a).ok();
    std::fs::remove_file(b).ok();
}

#[test]
fn oynatici_siradakine_kesintisiz_gecer() {
    // 8 kHz şarkılar, 48 kHz sanal aygıt: geçiş, aygıt hızına çevrilen akışta olur.
    // Şarkılar 2 saniyelik halka tampondan uzun (4 sn): kısa şarkı tampona tamamen sığıp
    // çözme, sıradaki bildirilmeden bitebilirdi (yük altında yarış).
    output::simulated::set_device_rate(Some(48_000));
    let song = |name: &str| {
        let path = temp_path(name);
        write_wav(&path, 8_000, 1, 32_000, |frame, _| frame as f64 / 32_000.0);
        path
    };
    let a = song("gecis-a.wav");
    let b = song("gecis-b.wav");
    let mut player = Player::new();
    player.load(&a, true).unwrap();
    player.set_next(Some(b.clone()));
    assert!(wait_until(|| player
        .status()
        .track
        .is_some_and(|t| t.path == b)));
    assert_ne!(
        player.state(),
        PlaybackState::Ended,
        "ilk şarkı bitince durmaz"
    );
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    let status = player.status();
    assert_eq!(status.track.unwrap().path, b);
    assert!(
        (status.position_secs - 4.0).abs() < 1e-9,
        "{}",
        status.position_secs
    );
    assert_eq!(status.underruns, 0);
    // Görseller de yeni şarkının analizine geçer.
    // (Şarkı sonunda görsel kare yok; çağrı yine de analizi yeni şarkıya geçirir.)
    player.visual_now();
    assert_eq!(player.analysis.as_ref().unwrap().path, b);
    output::simulated::set_device_rate(None);
    std::fs::remove_file(a).ok();
    std::fs::remove_file(b).ok();
}

#[test]
fn kanal_sayisi_uymayan_siradaki_sarkiya_gecilmez() {
    let a = ramp_song("kanal-a.wav");
    let b = temp_path("kanal-b.wav");
    write_wav(&b, 8_000, 3, 8_000, |_, _| 0.1); // 3 kanal: stereo akışa eklenemez
    let mut player = Player::new();
    player.load(&a, true).unwrap();
    player.set_next(Some(b.clone()));
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    assert_eq!(
        player.status().track.unwrap().path,
        a,
        "ilk şarkı normal biter"
    );
    std::fs::remove_file(a).ok();
    std::fs::remove_file(b).ok();
}

#[test]
fn sarki_sonuna_kadar_calar_ve_bitti_durumuna_gecer() {
    let path = ramp_song("sona-kadar.wav");
    let mut player = Player::new();
    let info = player.load(&path, true).unwrap();
    assert_eq!(info.sample_rate, 8_000);
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    let status = player.status();
    assert!(
        (status.position_secs - 2.0).abs() < 1e-9,
        "{}",
        status.position_secs
    );

    // Bitince "çal" baştan başlatır.
    player.play().unwrap();
    assert!(matches!(
        player.state(),
        PlaybackState::Playing | PlaybackState::Ended
    ));
    std::fs::remove_file(path).ok();
}

#[test]
fn aygitin_hizina_cevirip_calar_ve_konumu_dogru_sayar() {
    // Şarkı 8 kHz, sanal aygıt 48 kHz: ses aygıtın hızına çevrilir; konum
    // yine şarkı zamanıyla ilerler ve tam şarkı süresinde biter.
    output::simulated::set_device_rate(Some(48_000));
    let path = ramp_song("aygit-hizi.wav");
    let mut player = Player::new();
    player.load(&path, true).unwrap();
    let path_info = player.status().output.unwrap();
    assert_eq!(path_info.sample_rate, 48_000);
    assert_eq!(path_info.channels, 2);
    assert!(path_info.resampled);
    assert_eq!(path_info.device_name, "Sanal aygıt");
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    let status = player.status();
    assert!(
        (status.position_secs - 2.0).abs() < 1e-9,
        "{}",
        status.position_secs
    );
    assert_eq!(status.underruns, 0);
    output::simulated::set_device_rate(None);
    std::fs::remove_file(path).ok();
}

#[test]
fn duraklatilmisken_sarinca_yeni_noktada_bekler() {
    let path = ramp_song("sar-duraklat.wav");
    let mut player = Player::new();
    player.load(&path, false).unwrap();
    assert_eq!(player.state(), PlaybackState::Paused);

    player.seek(1.5).unwrap();
    assert_eq!(player.state(), PlaybackState::Paused);
    std::thread::sleep(Duration::from_millis(30));
    assert!((player.status().position_secs - 1.5).abs() < 1e-9);

    // Devam edince 1,5 saniyeden sona kadar çalar.
    player.play().unwrap();
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    assert!((player.status().position_secs - 2.0).abs() < 1e-9);
    std::fs::remove_file(path).ok();
}

#[test]
fn calarken_sarinca_calmaya_devam_eder() {
    let path = ramp_song("sar-cal.wav");
    let mut player = Player::new();
    player.load(&path, true).unwrap();
    player.seek(0.5).unwrap();
    assert!(player.status().position_secs >= 0.5);
    assert!(matches!(
        player.state(),
        PlaybackState::Playing | PlaybackState::Ended
    ));
    std::fs::remove_file(path).ok();
}

#[test]
fn aygit_hatasindan_sonra_cal_kaldigi_yerden_surer() {
    // Ör. kulaklık çıkarılınca aygıta yazılamaz ve oturum hata durumuna geçer.
    let path = ramp_song("aygit-hatasi.wav");
    let mut player = Player::new();
    player.load(&path, false).unwrap();
    player.seek(1.2).unwrap();
    let session = player.session.as_ref().unwrap();
    session.shared.fail("Ses aygıtına yazılamadı".to_owned());
    assert_eq!(player.state(), PlaybackState::Error);

    player.play().unwrap();
    let session = player.session.as_ref().unwrap();
    let start = session.shared.segments.lock().unwrap()[0].start_frame;
    assert_eq!(start, 9_600, "baştan değil, kalınan yerden (1,2 sn)");
    std::fs::remove_file(path).ok();
}

#[test]
fn aygit_degisince_sarki_yeni_aygitta_kaldigi_yerden_surer() {
    // Kulaklık takıldı: Windows varsayılan aygıtı değiştirdi, çıkış tarafı işareti kaldırdı.
    // Durum sorgusu şarkıyı yeni aygıtta aynı konumdan ve aynı durumda açar (SES-01).
    let path = ramp_song("aygit-degisti.wav");
    let mut player = Player::new();
    player.load(&path, false).unwrap();
    player.seek(1.2).unwrap();
    let old = Arc::clone(&player.session.as_ref().unwrap().shared);
    old.device_changed.store(true, Ordering::Release);

    // Durum sorgusu kendisi aygıtı açmaz (kilit altında yavaş iş olmasın); komut katmanı
    // geçişi kilit dışında yapar. Burada aynı adımlar art arda.
    let status = player.status();
    assert!(
        Arc::ptr_eq(&player.session.as_ref().unwrap().shared, &old),
        "sorgu açmaz"
    );
    player.recover_device();
    let status = {
        let _ = status;
        player.status()
    };
    assert_eq!(
        status.state,
        PlaybackState::Paused,
        "duraklatılmıştı, öyle kalır"
    );
    let session = player.session.as_ref().unwrap();
    assert!(!Arc::ptr_eq(&session.shared, &old), "yeni oturum");
    assert!(old.stop.load(Ordering::Acquire), "eskisi kapandı");
    let start = session.shared.segments.lock().unwrap()[0].start_frame;
    assert_eq!(start, 9_600, "kalınan yerden (1,2 sn)");

    // Çalarken: çalmaya devam eder.
    player.play().unwrap();
    let shared = Arc::clone(&player.session.as_ref().unwrap().shared);
    shared.device_changed.store(true, Ordering::Release);
    player.recover_device();
    assert_eq!(player.status().state, PlaybackState::Playing);
    assert!(!Arc::ptr_eq(
        &player.session.as_ref().unwrap().shared,
        &shared
    ));
    std::fs::remove_file(path).ok();
}

#[test]
fn aygit_kopunca_otomatik_toparlanir_surekli_kopuyorsa_hata_durumunda_kalir() {
    // Kulaklık çıkarıldı: akış hata verdi ve işareti kaldırdı. Şarkı o anki varsayılan
    // aygıtta kendiliğinden sürer; "çal"a basmak gerekmez. Aygıt art arda kopuyorsa
    // sonsuz döngüye girilmez: üçüncü denemeden sonra hata durumu gösterilir.
    let path = ramp_song("aygit-koptu.wav");
    let mut player = Player::new();
    player.load(&path, true).unwrap();
    for attempt in 1..=MAX_DEVICE_RECOVERIES {
        let shared = Arc::clone(&player.session.as_ref().unwrap().shared);
        shared.fail("Ses aygıtına yazılamadı".to_owned());
        shared.device_changed.store(true, Ordering::Release);
        player.recover_device();
        assert_eq!(
            player.state(),
            PlaybackState::Playing,
            "{attempt}. kopmada toparlanır"
        );
    }
    let shared = Arc::clone(&player.session.as_ref().unwrap().shared);
    shared.fail("Ses aygıtına yazılamadı".to_owned());
    shared.device_changed.store(true, Ordering::Release);
    player.recover_device();
    assert_eq!(
        player.status().state,
        PlaybackState::Error,
        "artık denenmez"
    );
    // Kullanıcı "çal" deyince sayaç sıfırlanır ve yeniden denenir.
    player.play().unwrap();
    assert_eq!(player.state(), PlaybackState::Playing);
    std::fs::remove_file(path).ok();
}

#[test]
fn gecis_kilit_disinda_hazirlanir_durum_bu_sirada_cevap_verir() {
    // Arayüz komutu: begin (kilitli, anında) → prepare (kilitsiz, ayrı iş parçacığı) →
    // install (kilitli, anında). Hazırlık sürerken durum sorgusu hedef durumu söyler ve
    // eski oturumun sesi kısılmaya başlamıştır (SES-02, KUT-08).
    let path = ramp_song("gecis.wav");
    let mut player = Player::new();
    player.load(&path, true).unwrap();
    assert!(wait_until(|| player.status().position_secs > 0.3));
    let old = Arc::clone(&player.session.as_ref().unwrap().shared);

    let transition = player.begin_transition(&path, true, Some(1.0));
    assert!(player.session.is_none(), "eski oturum oynatıcıdan alındı");
    assert!(old.paused.load(Ordering::Acquire), "kısılma başladı");
    assert!(
        !old.stop.load(Ordering::Acquire),
        "ama henüz kapanmadı (kilit dışında)"
    );
    let status = player.status();
    assert_eq!(status.state, PlaybackState::Playing, "hedef durum");
    assert_eq!(status.track.map(|t| t.path), Some(path.clone()));
    assert_eq!(status.position_secs, 1.0);

    let prepared = std::thread::spawn(move || Player::prepare(transition))
        .join()
        .unwrap();
    assert!(
        old.stop.load(Ordering::Acquire),
        "hazırlık eskisini kapattı"
    );
    let info = player.install(prepared).unwrap();
    assert_eq!(info.path, path);
    let session = player.session.as_ref().unwrap();
    assert_eq!(
        session.shared.segments.lock().unwrap()[0].start_frame,
        8_000
    );
    assert_eq!(player.state(), PlaybackState::Playing);
    assert!(player.pending.is_none());
    std::fs::remove_file(path).ok();
}

#[test]
fn daha_yeni_gecis_baslamissa_eski_hazirlik_takilmaz() {
    // Kullanıcı art arda iki şarkıya tıkladı: ilk hazırlık sonra bitse de ikinci kazanır.
    let a = ramp_song("gecis-a.wav");
    let b = ramp_song("gecis-b.wav");
    let mut player = Player::new();
    let first = player.begin_transition(&a, false, None);
    let second = player.begin_transition(&b, false, None);
    let second_ready = Player::prepare(second);
    let first_ready = Player::prepare(first);
    player.install(first_ready).unwrap();
    assert!(player.session.is_none(), "eski geçiş takılmadı");
    player.install(second_ready).unwrap();
    assert_eq!(player.status().track.unwrap().path, b);
    assert_eq!(player.analysis.as_ref().unwrap().path, b);
    std::fs::remove_file(a).ok();
    std::fs::remove_file(b).ok();
}

#[test]
fn analiz_baslatilamazsa_ilk_ses_beklemez() {
    // Analiz yoksa ölçüm hiç gelmeyecek: eşitleme bu şarkıya uygulanmaz, ses beklemeden
    // başlar (SES-04).
    let path = ramp_song("analizsiz.wav");
    let controls = Player::new().render_controls();
    let session = Session::start(&path, false, None, None, &controls, None, false).unwrap();
    assert!(session.shared.controls.levels.is_known(0));
    assert_eq!(
        session.shared.controls.levels.level(0, true).gain_db,
        0.0,
        "ölçülemeyen şarkıya kazanç uygulanmaz"
    );
    std::fs::remove_file(path).ok();
}

#[test]
fn calarken_sarinca_eski_oturum_sesi_kisilinca_kapanir() {
    let path = temp_path("sar-kis.wav");
    write_wav(&path, 8_000, 1, 80_000, |_, _| 0.5);
    let mut player = Player::new();
    player.load(&path, true).unwrap();
    assert!(wait_until(|| player.status().position_secs > 0.5));
    let old = Arc::clone(&player.session.as_ref().unwrap().shared);
    assert!(!old.faded_out.load(Ordering::Acquire), "çalarken ses açık");

    player.seek(0.1).unwrap();
    // Akış ancak kısılma hoparlöre ulaşınca kapatılır (yoksa "tık" duyulur).
    assert!(old.faded_out.load(Ordering::Acquire));
    assert!(old.stop.load(Ordering::Acquire));
    std::fs::remove_file(path).ok();
}

/// Kör test için geniş bantlı, tekrarlanabilir bir kayıt (aynı kaydın iki kopyası).
fn abx_song(name: &str) -> PathBuf {
    let path = temp_path(name);
    let mut state = 12_345u64;
    let noise: Vec<f64> = (0..40_000)
        .map(|_| {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            0.3 * ((state >> 33) as f64 / f64::from(1u32 << 30) - 1.0)
        })
        .collect();
    write_wav(&path, 8_000, 2, noise.len(), |frame, _| noise[frame]);
    path
}

#[test]
fn kor_test_sarkiyi_durdurur_bitince_kaldigi_yerde_acar() {
    let song = ramp_song("kor-test-calan.wav");
    let a = abx_song("kor-a.wav");
    let b = abx_song("kor-b.wav");
    let mut player = Player::new();
    player.load(&song, true).unwrap();
    assert!(wait_until(|| player.status().position_secs > 0.5));
    let request = AbxRequest {
        a,
        b,
        start_secs: 0.0,
        clip_secs: 3.0,
        trials: 8,
    };
    let status = player.abx_start(&request).unwrap();
    assert!(status.active);
    // Ses aygıtı teste geçti: şarkı oturumu kapandı.
    assert_eq!(player.state(), PlaybackState::Idle);
    let position = player.abx_resume.as_ref().unwrap().1;
    assert!(position > 0.4, "{position}");
    assert_eq!(player.abx_select(AbxChoice::X).playing, Some(AbxChoice::X));
    assert_eq!(player.abx_answer(AbxSource::A).answered, 1);
    // Test kapanınca şarkı kaldığı yerde, duraklatılmış.
    assert!(!player.abx_stop().active);
    assert_eq!(player.state(), PlaybackState::Paused);
    assert!((player.status().position_secs - position).abs() < 0.2);
    // Yeniden kurulup şarkı açılınca test kendiliğinden kapanır.
    player.abx_start(&request).unwrap();
    player.load(&song, false).unwrap();
    assert!(!player.abx_status().active);
    std::fs::remove_file(song).ok();
}

#[test]
fn kor_test_suren_sarki_gecisiyle_ust_uste_calmaz() {
    // Şarkıya tıklandı (geçiş kilit dışında hazırlanıyor) ve hemen kör test başlatıldı.
    let song = ramp_song("kor-gecis-eski.wav");
    let next = ramp_song("kor-gecis-yeni.wav");
    let mut player = Player::new();
    player.load(&song, true).unwrap();
    assert!(wait_until(|| player.status().position_secs > 0.2));
    let transition = player.begin_transition(&next, true, None);
    let request = AbxRequest {
        a: abx_song("kor-gecis-a.wav"),
        b: abx_song("kor-gecis-b.wav"),
        start_secs: 0.0,
        clip_secs: 3.0,
        trials: 8,
    };
    assert!(player.abx_start(&request).unwrap().active);
    // Geçiş şimdi biter: oturumu takılmaz, test tek ses kaynağı kalır.
    let _ = player.install(Player::prepare(transition));
    assert!(
        player.session.is_none(),
        "şarkı ile test üst üste çalmamalı"
    );
    assert!(player.abx_status().active);
    // Test bitince açılmakta olan şarkıya dönülür.
    player.abx_stop();
    assert_eq!(player.state(), PlaybackState::Paused);
    assert_eq!(player.status().track.map(|t| t.path), Some(next.clone()));
    std::fs::remove_file(song).ok();
    std::fs::remove_file(next).ok();
}

#[test]
fn kor_test_kurulamazsa_calan_sarki_durmaz() {
    let song = ramp_song("kor-test-kurulamaz.wav");
    let a = abx_song("kor-kurulamaz-a.wav");
    let mut player = Player::new();
    player.load(&song, true).unwrap();
    assert!(wait_until(|| player.status().position_secs > 0.3));
    // B başka bir kayıt: test kurulamaz.
    let request = AbxRequest {
        a,
        b: song.clone(),
        start_secs: 0.0,
        clip_secs: 2.0,
        trials: 8,
    };
    let error = player.abx_start(&request).unwrap_err();
    assert!(
        error.to_string().contains("aynı kayda benzemiyor"),
        "{error}"
    );
    // Çalan şarkı hiç kesilmeden sürer; test yarım kalmaz.
    assert_eq!(player.state(), PlaybackState::Playing);
    assert!(player.abx_resume.is_none());
    assert!(!player.abx_status().active);
    let before = player.status().position_secs;
    assert!(wait_until(|| player.status().position_secs > before + 0.1));

    // Süren bir test yeniden kurulamazsa test kapanır, şarkı kaldığı yerde geri gelir.
    let good = AbxRequest {
        b: abx_song("kor-kurulamaz-b.wav"),
        ..request.clone()
    };
    player.abx_start(&good).unwrap();
    assert_eq!(player.state(), PlaybackState::Idle);
    assert!(player.abx_start(&request).is_err());
    assert!(!player.abx_status().active);
    assert_eq!(player.state(), PlaybackState::Paused);
    assert!(player.abx_resume.is_none());
    std::fs::remove_file(song).ok();
}

#[test]
fn durdur_basa_sarar_ve_duraklatir() {
    let path = ramp_song("durdur.wav");
    let mut player = Player::new();
    player.load(&path, true).unwrap();
    assert!(wait_until(|| player.status().position_secs > 0.5));
    player.stop().unwrap();
    assert_eq!(player.state(), PlaybackState::Paused);
    assert_eq!(player.status().position_secs, 0.0);
    std::fs::remove_file(path).ok();
}

#[test]
fn spektrum_calan_ana_karsilik_gelir_ve_sarmada_korunur() {
    let path = ramp_song("spektrum.wav");
    let mut player = Player::new();
    player.load(&path, false).unwrap();
    let first = Arc::clone(&player.analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| first.is_done()));

    player.seek(1.0).unwrap();
    let visual = player.visual_now().unwrap();
    let (seconds, bands) = (visual.seconds, visual.bands);
    assert!(
        visual.vu_reference_db.is_some(),
        "analiz bitti: referans hazır"
    );
    // Görseller ekranda görünecekleri an için okunur (ekran gecikmesi kadar ileri).
    let lead = crate::visual_bridge::DISPLAY_LEAD_SECONDS;
    assert!((seconds - (1.0 + lead)).abs() < 1e-9, "{seconds}");
    assert_eq!(bands.len(), BANDS);
    // Ses aygıtı 200 ms geç çalıyorsa görseller o kadar geriden okunur; sarmanın hemen
    // ardından (henüz hiçbir kare duyulmadı) sarılan noktada bekler, öncesine gitmez.
    assert_eq!(player.set_audio_delay_ms(200), 200);
    let delayed = player.visual_now().unwrap().seconds;
    assert!((delayed - 1.0).abs() < 1e-9, "{delayed}");
    assert_eq!(player.set_audio_delay_ms(10_000), 400, "sınır");
    player.set_audio_delay_ms(0);
    // Aynı şarkıda sarma analizi yeniden başlatmaz.
    assert!(Arc::ptr_eq(
        &first,
        &player.analysis.as_ref().unwrap().spectrogram
    ));

    // Başka şarkı açılınca analiz yenilenir.
    let other = ramp_song("spektrum-2.wav");
    player.load(&other, false).unwrap();
    assert!(!Arc::ptr_eq(
        &first,
        &player.analysis.as_ref().unwrap().spectrogram
    ));
    std::fs::remove_file(path).ok();
    std::fs::remove_file(other).ok();
}
#[test]
fn analiz_onbellege_yazilir_ve_sonraki_acilista_aninda_hazir() {
    let path = ramp_song("onbellek.wav");
    let cache = Arc::new(AnalysisCache::open_in_memory().unwrap());
    let stamp = FileStamp::of(&path).unwrap();

    let mut first = Player::new();
    first.set_analysis_cache(Arc::clone(&cache));
    first.load(&path, false).unwrap();
    let analyzed = Arc::clone(&first.analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| cache.load(&path, stamp).unwrap().is_some()));
    assert!(analyzed.is_done());

    // Yeni açılış (ör. program yeniden başladı): şarkı çözülmeden, anında hazır.
    let mut second = Player::new();
    second.set_analysis_cache(Arc::clone(&cache));
    second.load(&path, false).unwrap();
    let analysis = second.analysis.as_ref().unwrap();
    assert!(
        analysis.thread.is_none(),
        "önbellekten okundu, analiz başlamadı"
    );
    assert!(analysis.spectrogram.is_done());
    assert_eq!(analysis.spectrogram.frame_at(1.0), analyzed.frame_at(1.0));
    assert_eq!(second.foreground_analyses().load(Ordering::Acquire), 0);
    std::fs::remove_file(path).ok();
}

#[test]
fn eskiyen_parca_acilista_yenilenir_kareler_hemen_hazir() {
    let path = ramp_song("parca-yenile.wav");
    let cache = Arc::new(AnalysisCache::open_in_memory().unwrap());
    let stamp = FileStamp::of(&path).unwrap();
    let mut first = Player::new();
    first.set_analysis_cache(Arc::clone(&cache));
    first.load(&path, false).unwrap();
    assert!(wait_until(|| cache.load(&path, stamp).unwrap().is_some()));
    let full = cache.load(&path, stamp).unwrap().unwrap().saved;

    // Program güncellendi: ses yüksekliği hesabı değişti.
    cache
        .lock_for_test()
        .execute("UPDATE analyses SET loudness_version = 0", [])
        .unwrap();
    let mut second = Player::new();
    second.set_analysis_cache(Arc::clone(&cache));
    second.load(&path, false).unwrap();
    let spectrogram = Arc::clone(&second.analysis.as_ref().unwrap().spectrogram);
    // Görseller beklemez: kareler önbellekten hemen okunur.
    assert_eq!(spectrogram.ready_frames(), full.frames());
    assert!(wait_until(|| spectrogram.is_done()));
    assert!(wait_until(|| cache
        .load(&path, stamp)
        .unwrap()
        .is_some_and(|c| !c.stale.any())));
    assert_eq!(spectrogram.saved().unwrap(), full);
    std::fs::remove_file(path).ok();
}

#[test]
fn onbellekten_yenilemede_kareler_is_parcacigini_beklemeden_hazir() {
    // Yenileme iş parçacığı çalan şarkının analizini bekliyorsa (ya da zamanlayıcı onu geç
    // başlattıysa) önbellekteki kareler yine de hemen yayımlanmalı: görseller beklemez.
    // Eskiden kareler iş parçacığının içinde yayımlanıyordu; CI'da yarış olarak yakalandı.
    let path = ramp_song("yenile-hemen.wav");
    let cache = Arc::new(AnalysisCache::open_in_memory().unwrap());
    let stamp = FileStamp::of(&path).unwrap();
    let mut first = Player::new();
    first.set_analysis_cache(Arc::clone(&cache));
    first.load(&path, false).unwrap();
    assert!(wait_until(|| cache.load(&path, stamp).unwrap().is_some()));
    cache
        .lock_for_test()
        .execute("UPDATE analyses SET loudness_version = 0", [])
        .unwrap();
    let cached = cache.load(&path, stamp).unwrap().unwrap();
    let frames = cached.saved.frames();
    let context = AnalysisContext {
        cache: Some(Arc::clone(&cache)),
        foreground: Arc::new(AtomicUsize::new(0)),
        maps: None,
    };
    // Hiç bitmeyecek bir "çalan şarkı" analizi: yenileme iş parçacığı onu bekler.
    let never = Spectrogram::new();
    let analysis =
        Analysis::refresh(&path, cached, &context, Some(Arc::clone(&never)), stamp).unwrap();
    assert_eq!(
        analysis.spectrogram.ready_frames(),
        frames,
        "kareler iş parçacığından önce hazır"
    );
    drop(analysis); // bekleyen iş parçacığı iptalle biter
    std::fs::remove_file(path).ok();
}

#[test]
fn siradaki_sarki_calanin_analizi_bitince_analiz_edilir() {
    let current = temp_path("once-calan.wav");
    write_wav(&current, 44_100, 2, 44_100 * 6, |frame, _| {
        0.3 * crate::audio::test_util::sine(440.0, 44_100, frame)
    });
    let next = ramp_song("sonra-siradaki.wav");
    let mut player = Player::new();
    let foreground = player.foreground_analyses();
    player.load(&current, false).unwrap();
    player.set_next(Some(next.clone()));
    let first = Arc::clone(&player.analysis.as_ref().unwrap().spectrogram);
    let second = Arc::clone(&player.next_analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| {
        // Sıradakinin ilk karesi ancak çalanın analizi bittikten sonra gelir.
        assert!(second.ready_frames() == 0 || first.is_done());
        second.is_done()
    }));
    assert!(wait_until(|| foreground.load(Ordering::Acquire) == 0));
    std::fs::remove_file(current).ok();
    std::fs::remove_file(next).ok();
}

#[test]
fn ekolayzer_her_oturuma_ulasir_ve_gorsellere_yansir() {
    use crate::audio::eq::BANDS as EQ_BANDS;
    let path = temp_path("eq-sinus.wav");
    let w = 2.0 * std::f64::consts::PI * 1000.0 / 44_100.0;
    write_wav(&path, 44_100, 1, 88_200, |frame, _| {
        0.5 * (w * frame as f64).sin()
    });
    let mut player = Player::new();
    player.load(&path, false).unwrap();
    let analysis = Arc::clone(&player.analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| analysis.is_done()));
    player.seek(1.0).unwrap();
    let before = player.visual_now().unwrap().bands;
    let loudest = (0..BANDS)
        .max_by(|&a, &b| before[a].total_cmp(&before[b]))
        .unwrap();

    // 1 kHz bandını 12 dB kıs: ses yolu ve görseller aynı ayarı kullanır.
    let mut gains = [0.0; EQ_BANDS];
    gains[5] = -12.0;
    let applied = player.set_equalizer(EqSettings {
        enabled: true,
        gains_db: gains,
        ..EqSettings::default()
    });
    assert_eq!(player.equalizer(), applied);
    let after = player.visual_now().unwrap().bands;
    let drop_db = f64::from(before[loudest] - after[loudest]) * 60.0;
    assert!((drop_db - 12.0).abs() < 1.5, "görsel düşüş {drop_db:.1} dB");

    // Sarma yeni bir oturum açar; ekolayzer ayarı yine aynıdır.
    player.seek(0.5).unwrap();
    let session = player.session.as_ref().unwrap();
    assert!(Arc::ptr_eq(&session.shared.controls.eq, &player.eq));
    assert_eq!(session.shared.controls.eq.settings().gains_db[5], -12.0);
    std::fs::remove_file(path).ok();
}

#[test]
fn crossfeed_sinirlanir_ve_her_oturuma_ulasir() {
    use crate::audio::crossfeed::CrossfeedSettings;
    let path = temp_path("crossfeed.wav");
    write_wav(&path, 44_100, 2, 44_100, |frame, channel| {
        if channel == 0 {
            0.5 * crate::audio::test_util::sine(100.0, 44_100, frame)
        } else {
            0.0
        }
    });
    let mut player = Player::new();
    assert!(!player.crossfeed().enabled, "varsayılan kapalı");
    let applied = player.set_crossfeed(CrossfeedSettings {
        enabled: true,
        cutoff_hz: 5.0,
        level_db: f64::INFINITY,
    });
    assert_eq!(applied.cutoff_hz, crate::audio::crossfeed::MIN_CUTOFF_HZ);
    assert_eq!(applied.level_db, CrossfeedSettings::default().level_db);
    assert_eq!(player.crossfeed(), applied);

    // Şarkı açılınca ve sarınca yeni oturum aynı kanalı okur: ayar değişikliği çalan sese ulaşır.
    player.load(&path, false).unwrap();
    let session = player.session.as_ref().unwrap();
    assert!(Arc::ptr_eq(
        &session.shared.controls.crossfeed,
        &player.crossfeed_control
    ));
    player.seek(0.5).unwrap();
    let session = player.session.as_ref().unwrap();
    assert!(Arc::ptr_eq(
        &session.shared.controls.crossfeed,
        &player.crossfeed_control
    ));
    std::fs::remove_file(path).ok();
}

#[test]
fn sarki_haritasi_disa_aktarilir_baska_dosyaya_uygulanir_ve_kalici() {
    use crate::analysis::fingerprint::tests::song;
    use crate::analysis::map_file::{MapFile, MapStore};
    let rate = 44_100;
    let samples = song(1, 120.0, 30.0, rate);
    let original = temp_path("harita-sarki.wav");
    let copy = temp_path("harita-kopya.wav");
    for path in [&original, &copy] {
        write_wav(path, rate, 1, samples.len(), |f, _| samples[f]);
    }
    let dir = temp_path("harita-oynatici-deposu");
    let info = |path: &Path| Decoder::open(path).unwrap().info().clone();

    let mut player = Player::new();
    player.set_map_store(Arc::new(MapStore::new(dir.clone())));
    player.load(&original, false).unwrap();
    assert!(matches!(
        player.export_song_map(&info(&copy), None),
        Err(MapError::NotAnalyzed)
    ));
    let analysis = Arc::clone(&player.analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| analysis.is_done()));
    let exported = player.export_song_map(&info(&original), None).unwrap();
    // Paylaşılan dosya: metin olarak gider gelir.
    let shared = MapFile::parse(&exported.to_json()).unwrap();
    // Biri tonu düzeltmiş (analizin bulduğundan farklı bir ton).
    let analysis_key = player.song_key().and_then(|k| k.key).map(|k| k.tonic);
    let corrected = analysis_key.map_or(9, |t| (t + 6) % 12);
    let edited = MapFile {
        key: Some(crate::analysis::map_file::MapKey {
            tonic: corrected,
            minor: true,
            confidence: 1.0,
        }),
        ..shared
    };

    // Aynı kaydın başka dosyası.
    player.load(&copy, false).unwrap();
    let analysis = Arc::clone(&player.analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| analysis.is_done()));
    assert_eq!(player.imported_song_map(&copy), None);
    let status = player
        .import_song_map(&info(&copy), &edited, "gece.lyraska-harita.json")
        .unwrap();
    assert!(status.similarity > 0.9, "{status:?}");
    assert!(status.offset_secs.abs() < 0.02, "{status:?}");
    assert_eq!(status.source_name, "gece.lyraska-harita.json");
    assert_eq!(player.imported_song_map(&copy), Some(status.clone()));
    assert_eq!(player.song_key().unwrap().key.unwrap().tonic, corrected);

    // Program yeniden açılır: harita şarkı açılınca, analiz beklenmeden uygulanır.
    let mut reopened = Player::new();
    reopened.set_map_store(Arc::new(MapStore::new(dir.clone())));
    reopened.load(&copy, false).unwrap();
    let spectrogram = Arc::clone(&reopened.analysis.as_ref().unwrap().spectrogram);
    assert!(spectrogram.has_imported());
    assert_eq!(
        spectrogram.beat_grid().unwrap().beats.len(),
        edited.beats.len()
    );
    assert!(wait_until(|| spectrogram.is_done()));
    assert_eq!(reopened.imported_song_map(&copy), Some(status));
    // Kaldırınca programın analizi geri gelir; bir daha açılınca da uygulanmaz.
    reopened.remove_song_map(&copy).unwrap();
    assert_eq!(reopened.imported_song_map(&copy), None);
    assert!(!spectrogram.has_imported());
    assert_eq!(
        reopened.song_key().and_then(|k| k.key).map(|k| k.tonic),
        analysis_key
    );
    let mut again = Player::new();
    again.set_map_store(Arc::new(MapStore::new(dir.clone())));
    again.load(&copy, false).unwrap();
    assert!(!again.analysis.as_ref().unwrap().spectrogram.has_imported());

    // Başka şarkıya uygulanmaz.
    let other_samples = song(5, 120.0, 30.0, rate);
    let other = temp_path("harita-baska.wav");
    write_wav(&other, rate, 1, other_samples.len(), |f, _| {
        other_samples[f]
    });
    again.load(&other, false).unwrap();
    let analysis = Arc::clone(&again.analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| analysis.is_done()));
    assert!(matches!(
        again.import_song_map(&info(&other), &edited, "gece.json"),
        Err(MapError::NoMatch(_))
    ));
    assert!(!analysis.has_imported());
    for path in [original, copy, other] {
        std::fs::remove_file(path).ok();
    }
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn gorseller_ekolayzer_yukseltmesini_duyuldugu_gibi_gosterir() {
    use crate::audio::eq::BANDS as EQ_BANDS;
    // Yarım genlikte 1 kHz sinüs: tepe −6 dBTP; eşitleme sonrası tepeye 14 dB boşluk kalır.
    let path = temp_path("eq-yukselt.wav");
    write_wav(&path, 44_100, 1, 88_200, |frame, _| {
        0.5 * crate::audio::test_util::sine(1000.0, 44_100, frame)
    });
    let mut player = Player::new();
    player.load(&path, false).unwrap();
    let analysis = Arc::clone(&player.analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| analysis.is_done()));
    player.seek(1.0).unwrap();
    let before = player.visual_now().unwrap().bands;
    let loudest = (0..BANDS)
        .max_by(|&a, &b| before[a].total_cmp(&before[b]))
        .unwrap();
    let change_db = |player: &mut Player| {
        let after = player.visual_now().unwrap().bands;
        f64::from(after[loudest] - before[loudest]) * 60.0
    };

    // 31 Hz +12 dB: boşluk yettiği için ses kısılmaz; 1 kHz görselde yerinde kalır.
    // (Eskiden ekolayzer bütün sesi 12 dB kısıyordu; görseller de öyle gösteriyordu.)
    let mut gains = [0.0; EQ_BANDS];
    gains[0] = 12.0;
    player.set_equalizer(EqSettings {
        enabled: true,
        gains_db: gains,
        ..EqSettings::default()
    });
    let change = change_db(&mut player);
    assert!(change.abs() < 1.0, "1 kHz değişimi {change:.1} dB");

    // Eşitleme kapalıyken boşluk yalnızca şarkının tepesinden (6 dB): yükseltmenin
    // kalan 6 dB'si için ses kısılır, görsel de öyle.
    player
        .set_playback_options(super::super::PlaybackOptions {
            normalize: false,
            ..Default::default()
        })
        .unwrap();
    let change = change_db(&mut player);
    assert!((change + 6.0).abs() < 1.0, "1 kHz değişimi {change:.1} dB");
    std::fs::remove_file(path).ok();
}

#[test]
fn esitleme_calan_sarkiyi_olcer_ve_kapatinca_kalkar() {
    use crate::audio::loudness::TARGET_LUFS;
    // Yarım genlikte 1 kHz sinüs: −6 LUFS, tepe −6 dBTP.
    let path = temp_path("esitleme.wav");
    write_wav(&path, 44_100, 1, 44_100 * 3, |frame, _| {
        0.5 * crate::audio::test_util::sine(1000.0, 44_100, frame)
    });
    let mut player = Player::new();
    assert!(player.playback_options().normalize, "varsayılan açık");
    player.load(&path, false).unwrap();
    let analysis = Arc::clone(&player.analysis.as_ref().unwrap().spectrogram);
    assert!(wait_until(|| analysis.measured_loudness().is_some()));
    let loudness = analysis.loudness().unwrap();
    assert!(
        (loudness.integrated_lufs + 6.02).abs() < 0.1,
        "{loudness:?}"
    );

    // Çalan şarkı −14 LUFS'e kısılır; ekolayzer için tepeye 14 dB boşluk kalır.
    let gain = player.status().output.unwrap().normalization_db.unwrap();
    assert!((gain - (TARGET_LUFS - loudness.integrated_lufs)).abs() < 1e-9);
    assert!(
        (player.headroom_db() - 14.0).abs() < 0.1,
        "{}",
        player.headroom_db()
    );
    let session = player.session.as_ref().unwrap();
    assert!(
        session.shared.controls.levels.is_known(0),
        "ses yoluna yazıldı"
    );
    // Tam analiz bitince bas tepeleri de ses yoluna geçer (taşma koruması için).
    assert!(wait_until(|| analysis.is_done()));
    player.status();
    let session = player.session.as_ref().unwrap();
    assert!(session.shared.controls.levels.has_bass_peaks(0));
    assert!(player.equalizer_state().preamp_db <= 0.0);

    // Sarma yeni oturum açar: ölçüm baştan bilinir, ilk ses beklemez.
    player.seek(1.0).unwrap();
    let session = player.session.as_ref().unwrap();
    assert!(session.shared.controls.levels.is_known(0));
    assert!(Arc::ptr_eq(
        &session.shared.controls.loudness,
        &player.loudness
    ));

    // Kapatınca kazanç kalkar; boşluk yalnızca şarkının kendi tepesinden gelir.
    player
        .set_playback_options(super::super::PlaybackOptions {
            normalize: false,
            ..Default::default()
        })
        .unwrap();
    assert_eq!(player.status().output.unwrap().normalization_db, None);
    assert!(
        (player.headroom_db() - 6.02).abs() < 0.1,
        "{}",
        player.headroom_db()
    );
    std::fs::remove_file(path).ok();
}

/// Sanal aygıt: paylaşımlı modda 48 kHz; özel modda verilen biçim.
fn exclusive_device(format: Option<output::IntFormat>, busy: bool) {
    output::simulated::set_device_rate(Some(48_000));
    output::simulated::set_exclusive(format, busy);
}

fn reset_device() {
    output::simulated::set_device_rate(None);
    output::simulated::set_exclusive(None, false);
}

fn bit_perfect(on: bool) -> super::super::PlaybackOptions {
    super::super::PlaybackOptions {
        bit_perfect: on,
        ..Default::default()
    }
}

#[test]
fn bit_perfect_aygiti_sarkinin_hizinda_ozel_modda_acar() {
    exclusive_device(Some(output::IntFormat::new(32, 24)), false);
    let path = temp_path("bit-perfect.wav");
    write_wav(&path, 44_100, 2, 44_100 * 2, |frame, channel| {
        0.3 * crate::audio::test_util::sine(440.0 + 110.0 * channel as f64, 44_100, frame)
    });
    let mut player = Player::new();
    player.set_playback_options(bit_perfect(true)).unwrap();
    assert!(player.playback_options().bit_perfect);
    assert!(
        player.playback_options().normalize,
        "eşitleme ayarı korunur"
    );
    player.load(&path, false).unwrap();

    let output = player.status().output.unwrap();
    assert!(output.bit_perfect);
    assert_eq!(
        output.sample_rate, 44_100,
        "aygıtın 48 kHz'i değil, şarkının hızı"
    );
    assert!(!output.resampled);
    assert_eq!(output.bit_depth, Some(24));
    assert_eq!(output.notice, None);
    assert_eq!(output.normalization_db, None, "ses işlenmez");
    let session = player.session.as_ref().unwrap();
    assert!(session.shared.controls.bit_perfect);

    // Kapatınca aygıt paylaşımlı modda yeniden açılır; şarkı kaldığı yerde bekler.
    player.seek(1.0).unwrap();
    player.set_playback_options(bit_perfect(false)).unwrap();
    assert_eq!(player.state(), PlaybackState::Paused);
    assert!((player.status().position_secs - 1.0).abs() < 1e-9);
    let output = player.status().output.unwrap();
    assert!(!output.bit_perfect);
    assert_eq!(output.sample_rate, 48_000);
    assert!(output.resampled);
    assert_eq!(output.bit_depth, None);
    assert!(!player.session.as_ref().unwrap().shared.controls.bit_perfect);
    reset_device();
    std::fs::remove_file(path).ok();
}

#[test]
fn bit_perfect_aygit_sarkidan_dar_bit_derinligindeyse_acilmaz_ve_nedenini_soyler() {
    // Aygıt özel modda yalnızca 16 bit kabul ediyor; 24 bit şarkı orada bit bit aynı çıkamaz.
    exclusive_device(Some(output::IntFormat::new(16, 16)), false);
    let path = temp_path("bit-perfect-24.wav");
    crate::audio::test_util::write_wav_bits(&path, 44_100, 2, 24, 44_100, |frame, _| {
        0.3 * crate::audio::test_util::sine(440.0, 44_100, frame)
    });
    let mut player = Player::new();
    player.set_playback_options(bit_perfect(true)).unwrap();
    player.load(&path, false).unwrap();
    let output = player.status().output.unwrap();
    assert!(
        !output.bit_perfect,
        "16 bit aygıtta 24 bit şarkı bit-perfect sayılmaz"
    );
    assert_eq!(output.bit_depth, None);
    let notice = output.notice.unwrap();
    assert!(
        notice.contains("24 bit") && notice.contains("16 bit"),
        "{notice}"
    );
    assert!(!player.session.as_ref().unwrap().shared.controls.bit_perfect);

    // Aynı şarkı 24 bit kabul eden aygıtta bit-perfect açılır.
    exclusive_device(Some(output::IntFormat::new(32, 24)), false);
    player.load(&path, false).unwrap();
    let output = player.status().output.unwrap();
    assert!(output.bit_perfect);
    assert_eq!(output.bit_depth, Some(24));
    reset_device();
    std::fs::remove_file(path).ok();
}

#[test]
fn bit_perfect_acilamazsa_normal_yoldan_calar_ve_nedenini_soyler() {
    let path = ramp_song("bit-perfect-yok.wav");
    let mut player = Player::new();
    player.set_playback_options(bit_perfect(true)).unwrap();

    // Aygıt bu biçimi özel modda desteklemiyor.
    exclusive_device(None, false);
    player.load(&path, true).unwrap();
    let output = player.status().output.unwrap();
    assert!(!output.bit_perfect);
    assert_eq!(output.sample_rate, 48_000, "Lyraska'nın dönüştürücüsüyle");
    let notice = output.notice.unwrap();
    assert!(notice.contains("desteklemiyor"), "{notice}");
    assert!(!player.session.as_ref().unwrap().shared.controls.bit_perfect);

    // Destekliyor ama aygıtı başka program tutuyor: akış açılamaz, yine çalar.
    exclusive_device(Some(output::IntFormat::new(16, 16)), true);
    player.load(&path, true).unwrap();
    let output = player.status().output.unwrap();
    assert!(!output.bit_perfect);
    let notice = output.notice.unwrap();
    assert!(notice.contains("başka bir program"), "{notice}");
    assert!(matches!(
        player.state(),
        PlaybackState::Playing | PlaybackState::Ended
    ));
    reset_device();
    std::fs::remove_file(path).ok();
}

#[test]
fn bit_perfect_hizi_farkli_siradaki_sarkiya_bosluksuz_gecilmez() {
    exclusive_device(Some(output::IntFormat::new(16, 16)), false);
    // 3 saniyelik şarkılar: 2 saniyelik tampona sığmasınlar, sıradaki zamanında bilinsin.
    let song = |name: &str, rate: u32| {
        let path = temp_path(name);
        write_wav(&path, rate, 1, rate as usize * 3, |_, _| 0.1);
        path
    };
    let a = song("bp-a.wav", 8_000);
    let same = song("bp-ayni.wav", 8_000);
    let other = song("bp-farkli.wav", 16_000);
    let mut player = Player::new();
    player.set_playback_options(bit_perfect(true)).unwrap();

    // Aynı hızdaki şarkıya akış kesilmeden geçilir.
    player.load(&a, true).unwrap();
    player.set_next(Some(same.clone()));
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    assert_eq!(player.status().track.unwrap().path, same);

    // Hızı farklı şarkı dönüştürülmez: oturum biter, arayüz sıradakini kendi hızında açar.
    player.load(&a, true).unwrap();
    player.set_next(Some(other.clone()));
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    assert_eq!(player.status().track.unwrap().path, a);
    player.load(&other, true).unwrap();
    assert_eq!(player.status().output.unwrap().sample_rate, 16_000);
    reset_device();
    for path in [a, same, other] {
        std::fs::remove_file(path).ok();
    }
}

#[test]
fn bit_perfect_zinciri_dosyadaki_tamsayilari_aynen_aygita_verir() {
    use crate::audio::render::Renderer;
    // 16 bitlik stereo dosya; değerler tam ölçek dahil bütün aralığa yayılır.
    let path = temp_path("bit-perfect-zincir.wav");
    let (rate, frames) = (44_100u32, 6_000usize);
    let value = |frame: usize, channel: usize| {
        ((frame * 7_919 + channel * 104_729) % 65_535) as f64 / 32_767.0 - 1.0
    };
    write_wav(&path, rate, 2, frames, value);
    // `write_wav`'ın yazdığı tamsayılar.
    let expected: Vec<i16> = (0..frames)
        .flat_map(|f| (0..2).map(move |c| (value(f, c) * 32_767.0).round() as i16))
        .collect();

    // Çözme → dönüştürücü (aynı hız: dokunmaz) → halka tampon → ses çıkışı → aygıt.
    let mut decoder = Decoder::open(&path).unwrap();
    let mut converter = Converter::new(rate, 2, rate, 2).unwrap();
    let (mut producer, mut consumer) = RingBuffer::new(frames * 2);
    while let Some(chunk) = decoder.next_chunk().unwrap() {
        for &sample in converter.process(chunk).unwrap() {
            producer.push(sample).unwrap();
        }
    }
    let controls = RenderControls {
        eq: Arc::new(EqControl::new(EqSettings {
            enabled: true,
            gains_db: [6.0; crate::audio::eq::BANDS],
            ..EqSettings::default()
        })),
        loudness: Arc::new(LoudnessControl::new(true)),
        bit_perfect: true,
        ..RenderControls::default()
    };
    let mut renderer = Renderer::new(2, rate, controls);
    let latency = renderer.latency_frames();
    let mut out = vec![0.0; (frames + latency) * 2];
    renderer.render(&mut consumer, &mut out, false);

    let format = output::IntFormat::new(32, 24);
    let mut bytes = [0u8; 4];
    // Açılış geçişinden (10 ms) sonrası taşma korumasının gecikmesi kadar kayık.
    let fade = (rate as usize / 100 + 1) * 2;
    for (i, &want) in expected.iter().enumerate().skip(fade) {
        format.encode(out[latency * 2 + i], &mut bytes);
        assert_eq!(
            i32::from_le_bytes(bytes),
            i32::from(want) << 16,
            "{i}. örnek değişti"
        );
    }
    std::fs::remove_file(path).ok();
}

// --- Görseller için dalga biçimi dokunuşu (MilkDrop) ---

use super::super::loudness::Loudness;
use super::super::waveform::{to_byte, TAP_FRAMES, WAVEFORM_BYTES, WINDOW};
use crate::visual_bridge::{visual_offset_secs, DISPLAY_LEAD_SECONDS, MAX_AUDIO_DELAY_MS};

/// Kazancı 0 dB yapan ölçüm (−14 LUFS).
const NEUTRAL: Loudness = Loudness {
    integrated_lufs: -14.0,
    true_peak_dbtp: -6.0,
};

/// Şarkıları (boşluksuz sırayla, en çok iki) `device_rate` hızındaki stereo akışa çözer ve
/// halka tamponu sonuna kadar boşaltır; dalga biçimi dokunuşu dolmuş ortak durumu döndürür.
fn decode_all(songs: &[&Path], device_rate: u32) -> Arc<SharedState> {
    let decoder = Decoder::open(songs[0]).unwrap();
    let info = decoder.info().clone();
    let converter = Converter::new(info.sample_rate, info.channels, device_rate, 2).unwrap();
    let spec = OutputSpec {
        sample_rate: device_rate,
        channels: 2,
        mode: OutputMode::Shared,
    };
    let (producer, mut consumer) = RingBuffer::<Sample>::new(4_096);
    let shared = Arc::new(SharedState::new(
        false,
        test_segment(),
        RenderControls::default(),
    ));
    shared.set_next(songs.get(1).map(|p| p.to_path_buf()));
    let thread_shared = Arc::clone(&shared);
    let handle = std::thread::spawn(move || {
        decode_loop(decoder, converter, spec, producer, &thread_shared, None)
    });
    while !(shared.decode_done.load(Ordering::Acquire) && consumer.is_empty()) {
        if consumer.pop().is_err() {
            std::thread::yield_now();
        }
    }
    handle.join().unwrap();
    shared
}

/// Bir pencerenin sol kanalı.
fn left(bytes: &[u8]) -> &[u8] {
    &bytes[WINDOW..2 * WINDOW]
}

#[test]
fn dalga_bicimi_sinusun_periyodunu_ve_kare_kare_surekliligini_korur() {
    // 48 kHz aygıt, 441 Hz sinüs: 44,1 kHz'te periyot tam 100 örnek.
    let wave = |frame: usize, amp: f64| {
        amp * (2.0 * std::f64::consts::PI * 441.0 * frame as f64 / 48_000.0).sin()
    };
    let path = temp_path("dalga-sinus.wav");
    write_wav(&path, 48_000, 2, 48_000, |f, ch| {
        wave(f, if ch == 0 { 0.5 } else { 0.25 })
    });
    let shared = decode_all(&[&path], 48_000);
    shared.controls.levels.set_loudness(0, Some(NEUTRAL));

    // 0,5. saniye (48 kHz'te 24000. kare = 44,1 kHz'te 22050. örnek): pencere o anla biter.
    let first = shared.waveform_at(24_000, 0.0).unwrap();
    assert_eq!(first.len(), WAVEFORM_BYTES);
    let start = 22_050 - (WINDOW - 1);
    for k in 0..WINDOW {
        let t = (start + k) as f64 / 44_100.0;
        let value = (2.0 * std::f64::consts::PI * 441.0 * t).sin();
        let expect = [0.375 * value, 0.5 * value, 0.25 * value].map(to_byte);
        for (channel, want) in expect.iter().enumerate() {
            let got = first[channel * WINDOW + k];
            assert!(
                got.abs_diff(*want) <= 1,
                "kanal {channel}, örnek {k}: {got} != {want}"
            );
        }
    }
    // Periyot 100 örnek.
    let l = left(&first);
    for k in 0..WINDOW - 100 {
        assert!(l[k].abs_diff(l[k + 100]) <= 1, "örnek {k}");
    }
    // Bir sonraki ekran karesi (1/60 sn = 48 kHz'te 800 kare, 44,1 kHz'te 735 örnek):
    // pencere tam o kadar kayar, örtüşen kısım bayt bayt aynı (faz sürekli).
    let next = shared.waveform_at(24_800, 0.0).unwrap();
    for channel in 0..3 {
        let a = &first[channel * WINDOW..(channel + 1) * WINDOW];
        let b = &next[channel * WINDOW..(channel + 1) * WINDOW];
        assert_eq!(&b[..WINDOW - 735], &a[735..], "kanal {channel}");
    }
    std::fs::remove_file(path).ok();
}

#[test]
fn dalga_bicimi_sessizlikte_hep_128() {
    let path = temp_path("dalga-sessiz.wav");
    write_wav(&path, 44_100, 2, 20_000, |_, _| 0.0);
    let shared = decode_all(&[&path], 48_000);
    // Ölçülmemiş şarkı (varsayılan kazanç) da sessizliği değiştirmez; şarkı sonundan
    // sonrası da sessizlik.
    for heard in [0, 10_000, 21_000, 40_000] {
        let bytes = shared.waveform_at(heard, 0.0).unwrap();
        assert!(bytes.iter().all(|&b| b == 128), "{heard}");
    }
    std::fs::remove_file(path).ok();
}

#[test]
fn dalga_bicimi_bosluksuz_geciste_tam_sinirda_degisir() {
    // A: +0,25 (3000 kare), B: −0,25 (2000 kare); 44,1 kHz aygıt. B'nin eşitleme kazancı
    // +6 dB: hem dalga hem kazanç akışın 3000. karesinde değişmeli.
    let a = temp_path("dalga-gecis-a.wav");
    let b = temp_path("dalga-gecis-b.wav");
    write_wav(&a, 44_100, 2, 3_000, |_, _| 0.25);
    write_wav(&b, 44_100, 2, 2_000, |_, _| -0.25);
    let shared = decode_all(&[&a, &b], 44_100);
    assert_eq!(shared.segments.lock().unwrap()[1].first_output_frame, 3_000);
    let levels = &shared.controls.levels;
    levels.set_loudness(0, Some(NEUTRAL));
    levels.set_loudness(
        1,
        Some(Loudness {
            integrated_lufs: -20.0,
            true_peak_dbtp: -10.0,
        }),
    );
    let quantized = 8_192.0 / 32_767.0;
    let gain = 10f64.powf(6.0 / 20.0);
    let bytes = shared.waveform_at(3_500, 0.0).unwrap();
    let first = 3_500 - (WINDOW - 1);
    let boundary = 3_000 - first;
    let l = left(&bytes);
    assert!(l[..boundary].iter().all(|&v| v == to_byte(quantized)));
    assert!(l[boundary..]
        .iter()
        .all(|&v| v == to_byte(-quantized * gain)));
    std::fs::remove_file(a).ok();
    std::fs::remove_file(b).ok();
}

#[test]
fn dalga_bicimi_ses_gecikmesi_kadar_geriden_okunur() {
    let path = temp_path("dalga-gecikme.wav");
    write_wav(&path, 48_000, 2, 48_000, |f, _| {
        0.5 * (2.0 * std::f64::consts::PI * 441.0 * f as f64 / 48_000.0).sin()
    });
    let shared = decode_all(&[&path], 48_000);
    shared.controls.levels.set_loudness(0, Some(NEUTRAL));
    // 100 ms ses gecikmesi: pencere duyulandan 100 ms (48 kHz'te 4800 kare) önce biter.
    let heard = 24_080;
    let delayed = shared.waveform_at(heard, visual_offset_secs(100)).unwrap();
    let earlier = shared
        .waveform_at(heard - 4_800, visual_offset_secs(0))
        .unwrap();
    assert_eq!(delayed, earlier);
    let undelayed = shared.waveform_at(heard, visual_offset_secs(0)).unwrap();
    assert_ne!(delayed, undelayed);
    std::fs::remove_file(path).ok();
}

#[test]
fn dalga_dokunusu_yeterince_uzun() {
    // Okunan pencerenin en eski örneği (ses gecikmesi + 1024 örnek geride) ile yazılan uç
    // (halka tampon + aygıt arabelleği ~100 ms + ekran gecikmesi ileride) arası payla sığmalı.
    let span_secs =
        RING_SECONDS as f64 + 0.1 + f64::from(MAX_AUDIO_DELAY_MS) / 1000.0 + DISPLAY_LEAD_SECONDS;
    let needed = span_secs * 44_100.0 + WINDOW as f64;
    assert!(
        TAP_FRAMES as f64 >= 1.25 * needed,
        "{TAP_FRAMES} < {needed}"
    );
}

/// 8 kHz mono, 30 sn: ilk 10 sn −0,5, sonrası +0,5 (dalganın işareti konumu söyler).
fn split_song(name: &str) -> PathBuf {
    let path = temp_path(name);
    write_wav(&path, 8_000, 1, 240_000, |frame, _| {
        if frame < 80_000 {
            -0.5
        } else {
            0.5
        }
    });
    path
}

#[test]
fn dalga_bicimi_sarinca_eski_konumu_hic_gostermez() {
    let path = split_song("dalga-sarma.wav");
    let mut player = Player::new();
    assert_eq!(player.visual_waveform(), None, "şarkı yokken boş");
    player.load(&path, true).unwrap();
    // Başta yalnızca eksi örnekler (eşitleme kazancı işareti değiştirmez).
    assert!(wait_until(|| player
        .visual_waveform()
        .is_some_and(|w| w.iter().any(|&b| b < 128))));
    player.seek(10.05).unwrap();
    // Sarmadan sonra hiçbir pencerede sarmadan önceki (eksi) örnek yok; yeni konumun artı
    // örnekleri hemen görünür.
    let mut seen_new = false;
    for _ in 0..50 {
        let Some(bytes) = player.visual_waveform() else {
            continue;
        };
        assert!(bytes.iter().all(|&b| b >= 128), "eski konumdan örnek");
        seen_new |= bytes.iter().any(|&b| b > 128);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(seen_new);
    std::fs::remove_file(path).ok();
}

#[test]
fn dalga_bicimi_cok_geriden_okununca_da_delik_yok() {
    // En büyük ses gecikmesinde (400 ms) çalarken okunan pencere tamamen dolu: halka
    // tampon önden giderken dokunuş eski örnekleri silmemiş olmalı.
    let path = split_song("dalga-delik.wav");
    let mut player = Player::new();
    player.set_audio_delay_ms(MAX_AUDIO_DELAY_MS);
    player.load(&path, true).unwrap();
    assert!(wait_until(|| player.status().position_secs >= 1.0));
    let bytes = player.visual_waveform().unwrap();
    assert!(bytes.iter().all(|&b| b < 128), "pencerede boşluk");
    std::fs::remove_file(path).ok();
}

#[test]
fn dalga_bicimi_duraklatinca_ve_sarki_bitince_sessiz() {
    let path = ramp_song("dalga-durum.wav");
    let mut player = Player::new();
    player.load(&path, false).unwrap();
    assert_eq!(player.visual_waveform(), Some(vec![128; WAVEFORM_BYTES]));
    player.play().unwrap();
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    assert_eq!(player.visual_waveform(), Some(vec![128; WAVEFORM_BYTES]));
    std::fs::remove_file(path).ok();
}

// --- "Kendi resmin" sahnesinin spektrum çubukları ---

/// Çubuğun (bas solda, doğrusal frekans) hangi frekansta olduğu: en güçlü çubuğun sırası.
fn loudest_bar(levels: &[f32]) -> usize {
    levels
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.total_cmp(b.1))
        .map_or(0, |(i, _)| i)
}

#[test]
fn spektrum_bas_sesini_kendi_cubugunda_ve_duyulan_anda_gosterir() {
    // 48 kHz aygıt; ilk 1 sn 60 Hz, sonrası 80 Hz sinüs (çubuğu doldurmayan genlikte).
    let path = temp_path("spektrum-bas.wav");
    write_wav(&path, 48_000, 2, 96_000, |f, _| {
        let hz = if f < 48_000 { 60.0 } else { 80.0 };
        0.02 * (2.0 * std::f64::consts::PI * hz * f as f64 / 48_000.0).sin()
    });
    let shared = decode_all(&[&path], 48_000);
    shared.controls.levels.set_loudness(0, Some(NEUTRAL));
    let first = shared.spectrum_at(24_000, 0.0).unwrap();
    let second = shared.spectrum_at(72_000, 0.0).unwrap();
    assert_eq!(first.len(), spectrum::BARS);
    let (a, b) = (loudest_bar(&first), loudest_bar(&second));
    // Doğrusal eksende 9,9 Hz aralık: 60 Hz 4., 80 Hz 6. çubuk.
    assert_eq!((a, b), (4, 6), "60 Hz {a}, 80 Hz {b}");
    // Pencere duyulan ana ortalanır: geçişten 30 ms önce hâlâ 60 Hz baskın.
    let before = shared.spectrum_at(48_000 - 1_440, 0.0).unwrap();
    assert!(before[a] > before[b], "{} {}", before[a], before[b]);
    // Kazanç uygulanır: şarkı 20 dB yüksek ölçülmüşse çubuk kısalır.
    shared.controls.levels.set_loudness(
        0,
        Some(Loudness {
            integrated_lufs: 6.0,
            true_peak_dbtp: -6.0,
        }),
    );
    let quiet = shared.spectrum_at(24_000, 0.0).unwrap();
    assert!(quiet[a] < first[a], "{} {}", quiet[a], first[a]);
    std::fs::remove_file(path).ok();
}

#[test]
fn spektrum_sarki_yokken_bos_duraklatinca_ve_bitince_sifir() {
    let path = ramp_song("spektrum-durum.wav");
    let mut player = Player::new();
    assert_eq!(player.visual_spectrum(), None, "şarkı yokken boş");
    player.load(&path, false).unwrap();
    assert_eq!(player.visual_spectrum(), Some(vec![0.0; spectrum::BARS]));
    player.play().unwrap();
    assert!(wait_until(|| player.state() == PlaybackState::Ended));
    assert_eq!(player.visual_spectrum(), Some(vec![0.0; spectrum::BARS]));
    std::fs::remove_file(path).ok();
}

#[test]
fn spektrum_calarken_ses_gorunur() {
    let path = split_song("spektrum-calar.wav");
    let mut player = Player::new();
    player.load(&path, true).unwrap();
    assert!(wait_until(|| player.status().position_secs >= 0.5));
    let levels = player.visual_spectrum().unwrap();
    assert_eq!(levels.len(), spectrum::BARS);
    assert!(levels.iter().all(|v| (0.0..=1.0).contains(v)));
    std::fs::remove_file(path).ok();
}
