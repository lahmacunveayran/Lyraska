//! Bağımsız denetim (RTS) kanıt testleri: üç adımlı geçişin yarışları, kilit altında uzun iş,
//! bit-perfect'te boşluksuz geçiş. Çıktıları görmek için `--nocapture`.

use super::*;
use crate::audio::test_util::{temp_path, write_wav, write_wav_bits};

fn wait_until(mut condition: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if condition() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    false
}

fn song(name: &str, seconds: usize) -> PathBuf {
    let path = temp_path(name);
    write_wav(&path, 8_000, 1, 8_000 * seconds, |frame, _| {
        0.5 * (frame as f64 * 0.05).sin()
    });
    path
}

/// [RTS] Sarma sürerken şarkı açılırsa (ya da tersi) iki hazırlık aynı anda çalışır: ikisi de
/// ses aygıtını açıp ÇALAR; eski sıradaki hazırlık takılırken kısılmadan kesilir.
#[test]
fn rts_sarma_ve_acma_ust_uste_iki_oturum_ayni_anda_calar() {
    let a = song("rts-a.wav", 10);
    let b = song("rts-b.wav", 10);
    let mut player = Player::new();
    player.load(&a, true).unwrap();
    assert!(wait_until(|| player.status().position_secs > 0.3));

    // Arayüz: seek_playback (seekInFlight) ve open_track (busy) ayrı kuyruklarda; ikisi de
    // `begin_*`'i kilit altında yapar, hazırlığı kilit dışında, aynı anda.
    let seek = player.begin_seek(1.0).unwrap(); // sıra 1: eski oturumu alır
    let open = player.begin_transition(&b, true, None); // sıra 2: eski oturum yok, beklemez
    let seek_thread = std::thread::spawn(move || Player::prepare(seek));
    let open_thread = std::thread::spawn(move || Player::prepare(open));
    let seek_ready = seek_thread.join().unwrap();
    let open_ready = open_thread.join().unwrap();

    let s1 = Arc::clone(&seek_ready.outcome.as_ref().unwrap().shared);
    let s2 = Arc::clone(&open_ready.outcome.as_ref().unwrap().shared);
    let (h1, h2) = (
        s1.output_heard.load(Ordering::Acquire),
        s2.output_heard.load(Ordering::Acquire),
    );
    std::thread::sleep(Duration::from_millis(20));
    let (d1, d2) = (
        s1.output_heard.load(Ordering::Acquire) - h1,
        s2.output_heard.load(Ordering::Acquire) - h2,
    );
    println!(
        "RTS üst üste: sarma oturumu {d1} kare, açma oturumu {d2} kare aynı 20 ms'de çaldı; \
         duraklatılmış mı: {} / {}",
        s1.paused.load(Ordering::Acquire),
        s2.paused.load(Ordering::Acquire)
    );
    assert!(d1 > 0 && d2 > 0, "iki oturum aynı anda çalmıyor");
    assert!(!s1.paused.load(Ordering::Acquire) && !s2.paused.load(Ordering::Acquire));

    // Kurulum sırası: önce eski (sıra 1) geçiş. Oturum kısılmadan durdurulur.
    player.install(seek_ready).unwrap();
    println!(
        "RTS eski hazırlık: stop={} faded_out={} (kısılma beklenmeden kesildi)",
        s1.stop.load(Ordering::Acquire),
        s1.faded_out.load(Ordering::Acquire)
    );
    assert!(s1.stop.load(Ordering::Acquire));
    assert!(
        !s1.faded_out.load(Ordering::Acquire),
        "tam seviyede kesildi: tık"
    );
    player.install(open_ready).unwrap();
    assert_eq!(player.status().track.unwrap().path, b);
    std::fs::remove_file(a).ok();
    std::fs::remove_file(b).ok();
}

/// Kilit tutulurken başka bir iş parçacığının kilidi ne kadar beklediği (durum sorgusu ve
/// görsel kare böyle bekler).
fn lock_wait(player: &Arc<Mutex<Player>>, work: impl FnOnce(&mut Player) + Send + 'static) -> (Duration, Duration) {
    let acquired = Arc::new(AtomicBool::new(false));
    let worker = {
        let player = Arc::clone(player);
        let acquired = Arc::clone(&acquired);
        std::thread::spawn(move || {
            let mut guard = player.lock().unwrap();
            acquired.store(true, Ordering::Release);
            let start = Instant::now();
            work(&mut guard);
            start.elapsed()
        })
    };
    while !acquired.load(Ordering::Acquire) {
        std::thread::yield_now();
    }
    let start = Instant::now();
    let _status = player.lock().unwrap().status();
    let waited = start.elapsed();
    (waited, worker.join().unwrap())
}

/// [RTS] "Durdur", şarkı bitince "çal", bit-perfect'i açıp kapama ve aygıt değişimi oturumu
/// kilit ALTINDA yeniden kurar (eski oturumun kısılmasını bekleme + dosya açma + ön dolum + aygıt
/// açma). Açma ve sarmanın aksine, durum sorgusu ve görsel kareler bu süre boyunca bekler.
#[test]
fn rts_durdurma_ve_aygit_degisimi_kilidi_gecis_boyunca_tutar() {
    let a = song("rts-kilit.wav", 10);
    let player = Arc::new(Mutex::new(Player::new()));
    player.lock().unwrap().load(&a, true).unwrap();
    assert!(wait_until(|| player.lock().unwrap().status().position_secs > 0.3));

    // 1) Üç adımlı geçiş (open_track gibi): hazırlık kilit dışında.
    let transition = player.lock().unwrap().begin_transition(&a, true, Some(0.5));
    let prep = std::thread::spawn(move || {
        let start = Instant::now();
        let prepared = Player::prepare(transition);
        (prepared, start.elapsed())
    });
    std::thread::sleep(Duration::from_millis(1));
    let start = Instant::now();
    let _ = player.lock().unwrap().status();
    let open_wait = start.elapsed();
    let (prepared, prep_time) = prep.join().unwrap();
    player.lock().unwrap().install(prepared).unwrap();
    assert!(wait_until(|| player.lock().unwrap().status().position_secs > 0.8));

    // 2) Durdur (stop_playback): aynı iş kilit altında.
    let (stop_wait, stop_time) = lock_wait(&player, |p| p.stop().unwrap());
    // 3) Aygıt değişti: durum sorgusu oturumu kilit altında yeniden kurar.
    player.lock().unwrap().play().unwrap();
    assert!(wait_until(|| player.lock().unwrap().status().position_secs > 0.2));
    let (device_wait, device_time) = lock_wait(&player, |p| {
        p.session
            .as_ref()
            .unwrap()
            .shared
            .device_changed
            .store(true, Ordering::Release);
        let _ = p.status();
    });
    println!(
        "RTS kilit: açma/sarma hazırlığı {:.1} ms sürdü, durum sorgusu {:.2} ms bekledi; \
         durdur {:.1} ms (sorgu {:.1} ms bekledi); aygıt değişimi {:.1} ms (sorgu {:.1} ms bekledi)",
        prep_time.as_secs_f64() * 1e3,
        open_wait.as_secs_f64() * 1e3,
        stop_time.as_secs_f64() * 1e3,
        stop_wait.as_secs_f64() * 1e3,
        device_time.as_secs_f64() * 1e3,
        device_wait.as_secs_f64() * 1e3,
    );
    assert!(open_wait < prep_time / 4, "açmada sorgu beklememeli");
    // Ölçüm, işçi kilidi aldıktan biraz sonra başlar: beklemenin geçişin büyük kısmı olması yeter.
    assert!(
        stop_wait >= stop_time / 3 && stop_wait > open_wait * 10,
        "durdurmada sorgu geçişi bekler"
    );
    assert!(
        device_wait >= device_time / 3 && device_wait > open_wait * 10,
        "aygıt değişiminde de"
    );
    std::fs::remove_file(a).ok();
}

/// [RTS] Bit-perfect oturumda boşluksuz geçiş yalnızca hızı ve kanal sayısını denetler: 16 bit
/// özel moddaki akışa 24 bitlik şarkı eklenir, alt 8 biti yuvarlanır; ekran "bit-perfect,
/// 16 bit" demeyi sürdürür. (İlk şarkı için bu durum #79'da engellenmişti.)
#[test]
fn rts_bit_perfect_bosluksuz_geciste_bit_derinligi_denetlenmez() {
    output::simulated::set_device_rate(Some(48_000));
    output::simulated::set_exclusive(Some(output::IntFormat::new(16, 16)), false);
    let first = temp_path("rts-bp-16.wav");
    write_wav(&first, 8_000, 2, 8_000 * 3, |_, _| 0.1);
    let second = temp_path("rts-bp-24.wav");
    // 24 bitlik örnek: 16 bitle gösterilemeyen bir değer (alt 8 biti 0x5A).
    let value24 = (1_234_567i32 & !0xFF) | 0x5A;
    write_wav_bits(&second, 8_000, 2, 24, 8_000 * 3, |_, _| {
        f64::from(value24) / f64::from((1 << 23) - 1)
    });
    let mut player = Player::new();
    player
        .set_playback_options(super::super::PlaybackOptions {
            bit_perfect: true,
            ..Default::default()
        })
        .unwrap();

    // İlk şarkı 24 bit olsaydı bit-perfect açılmazdı (#79):
    player.load(&second, false).unwrap();
    let direct = player.status().output.unwrap();
    assert!(!direct.bit_perfect, "doğrudan açılışta denetleniyor");

    player.load(&first, true).unwrap();
    assert!(player.status().output.unwrap().bit_perfect);
    player.set_next(Some(second.clone()));
    assert!(wait_until(|| player.status().track.map(|t| t.path) == Some(second.clone())));
    let output = player.status().output.unwrap();
    println!(
        "RTS boşluksuz: çalan {:?}, ekranda bit_perfect={} bit_depth={:?}",
        player.status().track.unwrap().file_name,
        output.bit_perfect,
        output.bit_depth
    );
    assert!(output.bit_perfect, "ekran bit-perfect diyor");
    assert_eq!(output.bit_depth, Some(16));
    // Aygıta giden: 24 bitlik örnek 16 bite yuvarlanır.
    let mut bytes = [0u8; 2];
    let decoded = f64::from(value24) / f64::from(1 << 23); // çözücünün verdiği değer
    output::IntFormat::new(16, 16).encode(decoded, &mut bytes);
    let sent = i32::from(i16::from_le_bytes(bytes)) << 8;
    println!("RTS 24 bit örnek {value24:#x} aygıta {sent:#x} olarak gider");
    assert_ne!(sent, value24, "örnek değişti: bit-perfect değil");
    output::simulated::set_device_rate(None);
    output::simulated::set_exclusive(None, false);
    std::fs::remove_file(first).ok();
    std::fs::remove_file(second).ok();
}
