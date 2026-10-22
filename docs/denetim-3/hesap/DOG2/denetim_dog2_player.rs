//! Doğrulayıcı (DOG2) kanıt testleri: RTS-01, RTS-02 ve RTS-03'ü denetçinin testinden farklı
//! bir yoldan yeniden üretir. Çıktılar için `--nocapture`.

use super::*;
use crate::audio::test_util::{temp_path, write_wav, write_wav_bits};
use std::sync::mpsc;

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

/// `commands::seek_playback` ile aynı adımlar (kilit → begin → kilitsiz prepare → kilit → install).
fn seek_command(player: &Arc<Mutex<Player>>, seconds: f64, tx: mpsc::Sender<(&'static str, Arc<SharedState>)>) {
    let transition = player.lock().unwrap().begin_seek(seconds);
    if let Some(transition) = transition {
        let prepared = Player::prepare(transition);
        if let Ok(session) = &prepared.outcome {
            tx.send(("sarma", Arc::clone(&session.shared))).unwrap();
        }
        let _ = player.lock().unwrap().install(prepared);
    }
}

/// `commands::open_track` ile aynı adımlar.
fn open_command(player: &Arc<Mutex<Player>>, path: &Path, tx: mpsc::Sender<(&'static str, Arc<SharedState>)>) {
    let transition = player.lock().unwrap().begin_transition(path, true, None);
    let prepared = Player::prepare(transition);
    if let Ok(session) = &prepared.outcome {
        tx.send(("açma", Arc::clone(&session.shared))).unwrap();
    }
    let _ = player.lock().unwrap().install(prepared);
}

/// RTS-01, komutların gerçek sırasıyla: "Önceki"ye çift basış = önce sarma(0), `delay` sonra
/// açma. İki komut ayrı iş parçacığında, kilit komutlardaki gibi alınır. Ölçülen: iki
/// oturumun ÇIKIŞININ aynı anda ilerlediği gerçek (duvar saati) süre ve eskimiş oturumun
/// kısılmadan kesilip kesilmediği.
#[test]
fn dog2_rts01_komut_sirasiyla_iki_oturum() {
    for delay_ms in [0u64, 1, 3] {
        let a = song("dog2-a.wav", 10);
        let b = song("dog2-b.wav", 10);
        let player = Arc::new(Mutex::new(Player::new()));
        player.lock().unwrap().load(&a, true).unwrap();
        assert!(wait_until(|| player.lock().unwrap().status().position_secs > 0.3));

        let (tx, rx) = mpsc::channel();
        let seek = {
            let (player, tx) = (Arc::clone(&player), tx.clone());
            std::thread::spawn(move || seek_command(&player, 0.0, tx))
        };
        std::thread::sleep(Duration::from_millis(delay_ms));
        let open = {
            let (player, b) = (Arc::clone(&player), b.clone());
            std::thread::spawn(move || open_command(&player, &b, tx))
        };
        // Gözlemci: oturumların çıkış sayacını 100 µs'de bir okur.
        let mut sessions: Vec<(&'static str, Arc<SharedState>, u64)> = Vec::new();
        let mut both_running = Duration::ZERO;
        let mut last = Instant::now();
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            while let Ok((label, shared)) = rx.try_recv() {
                let heard = shared.output_heard.load(Ordering::Acquire);
                sessions.push((label, shared, heard));
            }
            let mut advancing = 0;
            for (_, shared, seen) in &mut sessions {
                let now = shared.output_heard.load(Ordering::Acquire);
                if now > *seen
                    && !shared.stop.load(Ordering::Acquire)
                    && !shared.paused.load(Ordering::Acquire)
                {
                    advancing += 1;
                }
                *seen = now;
            }
            let t = Instant::now();
            if advancing >= 2 {
                both_running += t - last;
            }
            last = t;
            if seek.is_finished() && open.is_finished() {
                break;
            }
            std::thread::sleep(Duration::from_micros(100));
        }
        seek.join().unwrap();
        open.join().unwrap();
        let final_path = player.lock().unwrap().status().track.map(|t| t.path);
        let report: Vec<String> = sessions
            .iter()
            .map(|(label, s, _)| {
                format!(
                    "{label}: stop={} faded_out={}",
                    s.stop.load(Ordering::Acquire),
                    s.faded_out.load(Ordering::Acquire)
                )
            })
            .collect();
        println!(
            "DOG2 RTS-01 gecikme {delay_ms} ms: oturum sayısı {}, iki çıkışın birlikte ilerlediği süre \
             {:.2} ms; {}; sonunda çalan B mi: {}",
            sessions.len(),
            both_running.as_secs_f64() * 1e3,
            report.join(" | "),
            final_path.as_deref() == Some(b.as_path())
        );
        assert_eq!(final_path.as_deref(), Some(b.as_path()));
        std::fs::remove_file(a).ok();
        std::fs::remove_file(b).ok();
    }
}

/// RTS-01 ters sıra: önce açma, sonra sarma. Açma oturumu oynatıcıdan aldığı için `begin_seek`
/// `None` döner: yarış yok (denetçinin "veya tersi" ifadesi sarma için geçerli değil).
#[test]
fn dog2_rts01_ters_sira_yaris_yok() {
    let a = song("dog2-ters-a.wav", 10);
    let b = song("dog2-ters-b.wav", 10);
    let mut player = Player::new();
    player.load(&a, true).unwrap();
    assert!(wait_until(|| player.status().position_secs > 0.3));
    let open = player.begin_transition(&b, true, None);
    let seek = player.begin_seek(1.0);
    println!("DOG2 RTS-01 ters sıra: açma sürerken begin_seek = {:?}", seek.is_some());
    assert!(seek.is_none());
    player.install(Player::prepare(open)).unwrap();
    std::fs::remove_file(a).ok();
    std::fs::remove_file(b).ok();
}

/// RTS-02'nin denetçinin ölçmediği iki yolu: bit-perfect değişimi ve şarkı bitince "çal"
/// (toggle). İkisi de oturumu kilit altında yeniden kurar.
#[test]
fn dog2_rts02_bit_perfect_degisimi_ve_bitince_cal_kilit_altinda() {
    let a = song("dog2-kilit.wav", 2);
    let player = Arc::new(Mutex::new(Player::new()));
    player.lock().unwrap().load(&a, true).unwrap();
    assert!(wait_until(|| player.lock().unwrap().status().position_secs > 0.3));
    let measure = |work: Box<dyn FnOnce(&mut Player) + Send>| {
        let acquired = Arc::new(AtomicBool::new(false));
        let worker = {
            let (player, acquired) = (Arc::clone(&player), Arc::clone(&acquired));
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
        let _ = player.lock().unwrap().status();
        (start.elapsed(), worker.join().unwrap())
    };
    let (w1, t1) = measure(Box::new(|p| {
        p.set_playback_options(super::super::PlaybackOptions {
            bit_perfect: true,
            ..Default::default()
        })
        .unwrap()
    }));
    assert!(wait_until(|| player.lock().unwrap().status().state == PlaybackState::Ended));
    let (w2, t2) = measure(Box::new(|p| p.toggle().unwrap()));
    println!(
        "DOG2 RTS-02: bit-perfect değişimi {:.1} ms (sorgu {:.1} ms bekledi); bitince çal {:.1} ms \
         (sorgu {:.1} ms bekledi)",
        t1.as_secs_f64() * 1e3,
        w1.as_secs_f64() * 1e3,
        t2.as_secs_f64() * 1e3,
        w2.as_secs_f64() * 1e3
    );
    assert!(w1 >= t1 / 3 && w2 >= t2 / 3);
    std::fs::remove_file(a).ok();
}

/// RTS-03 başka bir yoldan: aygıt özel modda en çok 24 bit (yaygın USB DAC durumu), ilk şarkı
/// 24 bit, sıradaki 32 bit tamsayı. Doğrudan açılışta bit-perfect reddedilir; boşluksuz geçişte
/// kabul edilir. Ayrıca gerçekçi bir 24 bit sinyalde 16 bit özel mod akışının kaç örneği
/// değiştirdiği ve en büyük hata.
#[test]
fn dog2_rts03_24_bit_aygitta_32_bit_sarki_ve_hata_buyuklugu() {
    output::simulated::set_device_rate(Some(48_000));
    output::simulated::set_exclusive(Some(output::IntFormat::new(24, 24)), false);
    let first = temp_path("dog2-bp-24.wav");
    write_wav_bits(&first, 48_000, 2, 24, 48_000 * 2, |f, _| 0.3 * (f as f64 * 0.01).sin());
    let second = temp_path("dog2-bp-32.wav");
    write_wav_bits(&second, 48_000, 2, 32, 48_000 * 2, |f, _| 0.3 * (f as f64 * 0.013).sin());
    let mut player = Player::new();
    player
        .set_playback_options(super::super::PlaybackOptions {
            bit_perfect: true,
            ..Default::default()
        })
        .unwrap();
    player.load(&second, false).unwrap();
    let direct = player.status().output.unwrap();
    println!(
        "DOG2 RTS-03: 32 bit şarkı doğrudan: bit_perfect={} notice={:?}",
        direct.bit_perfect, direct.notice
    );
    assert!(!direct.bit_perfect);
    // Sıra önceden bildirilir (2 sn'lik şarkı halka tampona sığar; çözme sona hemen ulaşır).
    player.set_next(Some(second.clone()));
    player.load(&first, true).unwrap();
    assert!(player.status().output.unwrap().bit_perfect);
    assert!(wait_until(|| player.status().track.map(|t| t.path) == Some(second.clone())));
    let output = player.status().output.unwrap();
    println!(
        "DOG2 RTS-03: boşluksuz geçişten sonra çalan 32 bit şarkı, ekranda bit_perfect={} bit_depth={:?}",
        output.bit_perfect, output.bit_depth
    );
    assert!(output.bit_perfect && output.bit_depth == Some(24));
    output::simulated::set_device_rate(None);
    output::simulated::set_exclusive(None, false);

    // Hata büyüklüğü: 24 bitlik gerçekçi sinyal (sinüs + 24 bit seviyesinde titreşim) 16 bit
    // özel mod biçimine çevrilince (wasapi.rs: `int.encode(sample, dst)`).
    let wav = temp_path("dog2-24-sinyal.wav");
    write_wav_bits(&wav, 44_100, 1, 24, 44_100, |f, _| {
        0.25 * (f as f64 * 0.0627).sin() + 1e-6 * ((f * 7919 % 101) as f64 - 50.0)
    });
    let mut decoder = crate::audio::decode::Decoder::open(&wav).unwrap();
    let (mut changed, mut total, mut worst) = (0usize, 0usize, 0.0f64);
    let format16 = output::IntFormat::new(16, 16);
    let format24 = output::IntFormat::new(24, 24);
    let mut b16 = [0u8; 2];
    let mut b24 = [0u8; 3];
    while let Ok(Some(chunk)) = decoder.next_chunk() {
        for &x in chunk {
            format16.encode(x, &mut b16);
            format24.encode(x, &mut b24);
            let v16 = i32::from(i16::from_le_bytes(b16)) << 8;
            let v24 = i32::from_le_bytes([0, b24[0], b24[1], b24[2]]) >> 8;
            total += 1;
            if v16 != v24 {
                changed += 1;
                worst = worst.max(f64::from((v16 - v24).abs()) / f64::from(1 << 23));
            }
        }
    }
    println!(
        "DOG2 RTS-03: 24 bit sinyal 16 bit akışta: {changed}/{total} örnek değişti (%{:.2}); en büyük \
         hata {:.1} dBFS (titreşimsiz yuvarlama)",
        100.0 * changed as f64 / total as f64,
        20.0 * worst.log10()
    );
    assert!(changed * 10 > total * 9);
    for p in [first, second, wav] {
        std::fs::remove_file(p).ok();
    }
}
