//! Bağımsız denetim (RTS) kanıt testleri: `PeqControl` kilitsiz kanalında yırtık okuma ve ses
//! iş parçacığındaki yeniden tasarımın süresi. Çıktıları görmek için `--nocapture`.

use super::*;
use std::time::Instant;

fn bank_of(control: &PeqControl, rate: f64) -> Bank {
    let mut bank = Bank::new(2);
    control.design(rate, &mut bank);
    bank
}

struct Stress {
    designs: usize,
    a: usize,
    b: usize,
    mixed: usize,
    /// Karışık tasarımda okumadan önceki ve sonraki sürüm aynıydı (okuma sonrası denetim kaçırırdı).
    mixed_same_version: usize,
    /// Karışık tasarımların 1 kHz kazancının en büyük mutlak değeri (dB).
    worst_peak_db: f64,
}

/// Yazıcı iki ayarı art arda yazarken ses iş parçacığının `design`'ı ne görür?
fn stress(a: &[PeqFilter], b: &[PeqFilter], iterations: usize) -> Stress {
    let rate = 48_000.0;
    let control = Arc::new(PeqControl::default());
    control.set_filters(a, 0.0, 1.0, DesignMethod::Rbj, true);
    let bank_a = bank_of(&control, rate);
    control.set_filters(b, 0.0, 1.0, DesignMethod::Rbj, true);
    let bank_b = bank_of(&control, rate);
    let stop = Arc::new(AtomicBool::new(false));
    let writer = {
        let control = Arc::clone(&control);
        let stop = Arc::clone(&stop);
        let (a, b) = (a.to_vec(), b.to_vec());
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                control.set_filters(&a, 0.0, 1.0, DesignMethod::Rbj, true);
                control.set_filters(&b, 0.0, 1.0, DesignMethod::Rbj, true);
            }
        })
    };
    let mut s = Stress {
        designs: iterations,
        a: 0,
        b: 0,
        mixed: 0,
        mixed_same_version: 0,
        worst_peak_db: f64::NEG_INFINITY,
    };
    let mut bank = Bank::new(2);
    for _ in 0..iterations {
        let before = control.version();
        control.design(rate, &mut bank);
        let after = control.version();
        let same = |other: &Bank| bank.count == other.count && bank.coefs == other.coefs;
        if same(&bank_a) {
            s.a += 1;
        } else if same(&bank_b) {
            s.b += 1;
        } else {
            s.mixed += 1;
            if before == after {
                s.mixed_same_version += 1;
            }
            // 1 kHz'teki toplam kazancın mutlak değeri (yükseltme ya da kısma).
            let w = 2.0 * PI * 1_000.0 / rate;
            let at_1k: f64 = bank.coefs[..bank.count]
                .iter()
                .map(|c| c.response_db(w))
                .sum();
            s.worst_peak_db = s.worst_peak_db.max(at_1k.abs());
        }
    }
    stop.store(true, Ordering::Relaxed);
    writer.join().unwrap();
    s
}

fn pk(freq_hz: f64, gain_db: f64) -> PeqFilter {
    PeqFilter {
        kind: FilterKind::Peaking,
        freq_hz,
        gain_db,
        q: 1.0,
    }
}

/// [RTS] Ses iş parçacığı yazıcıyla aynı anda okuyunca iki ayarın karışımını tasarlar. Sürüm
/// yalnızca okumadan önce alındığı için karışım o turda fark edilmez (sonraki turda düzelir).
#[test]
fn rts_peq_kanali_yirtik_okur() {
    // A: 20 tepe süzgeci +6 dB, B: 20 yüksek raf −6 dB (her alanı farklı).
    let a: Vec<PeqFilter> = (0..MAX_FILTERS)
        .map(|i| pk(100.0 + 50.0 * i as f64, 6.0))
        .collect();
    let b: Vec<PeqFilter> = (0..MAX_FILTERS)
        .map(|i| PeqFilter {
            kind: FilterKind::HighShelf,
            freq_hz: 5_000.0 + 100.0 * i as f64,
            gain_db: -6.0,
            q: 0.7,
        })
        .collect();
    let s = stress(&a, &b, 200_000);
    println!(
        "RTS yırtık okuma: {} tasarım; A {}, B {}, karışık {} (karışıkken sürüm önce = sonra: {})",
        s.designs, s.a, s.b, s.mixed, s.mixed_same_version
    );
    assert!(s.mixed > 0, "karışık tasarım görülmedi");
    // Yazıcı sürümü yalnızca yazdıktan SONRA artırdığı için okumadan önce ve sonra aynı sürümü
    // görmek karışımı dışlamaz: yalnızca "okuma sonrası denetim" eklemek yetmez, yazma sırasında
    // tek sayılı sürüm (seqlock) gerekir.
    assert!(
        s.mixed_same_version > 0,
        "sürüm aynıyken de karışık okuma olur"
    );
}

/// [RTS] En kötü durum: A ve B'nin ikisi de düz (bildirilen yükseltme 0), karışımları ±48 dB.
#[test]
fn rts_peq_yirtik_okuma_iki_duz_ayardan_yuksek_tepe_uretir() {
    let a = [pk(1_000.0, 24.0), pk(1_000.0, -24.0)];
    let b = [pk(1_000.0, -24.0), pk(1_000.0, 24.0)];
    let flat_a = response_peak_db(&a, DesignMethod::Rbj, 48_000.0);
    let flat_b = response_peak_db(&b, DesignMethod::Rbj, 48_000.0);
    let s = stress(&a, &b, 400_000);
    println!(
        "RTS en kötü: A tepe {flat_a:.2} dB, B tepe {flat_b:.2} dB; {} tasarım, A {}, B {}, \
         karışık {}, karışığın 1 kHz kazancı en çok ±{:.1} dB",
        s.designs, s.a, s.b, s.mixed, s.worst_peak_db
    );
    assert!(flat_a.abs() < 0.01 && flat_b.abs() < 0.01);
    assert!(s.mixed > 0 && s.worst_peak_db > 40.0);
}

/// [RTS] Ses iş parçacığındaki yeniden tasarımın süresi (20 eşlenmiş süzgeç) ve bellek ayırma.
#[test]
fn rts_peq_tasarim_suresi_ve_ayirma() {
    let kinds = FilterKind::ALL;
    let filters: Vec<PeqFilter> = (0..MAX_FILTERS)
        .map(|i| PeqFilter {
            kind: kinds[i % kinds.len()],
            freq_hz: 25.0 * 1.4f64.powi(i as i32),
            gain_db: if i % 2 == 0 { 9.0 } else { -7.0 },
            q: [0.3, 1.0, 4.0, 12.0, 30.0][i % 5],
        })
        .collect();
    for (label, boost) in [("kulaklık (tepe taraması dahil)", 0.0), ("parametrik", 6.0)] {
        for rate in [44_100.0, 48_000.0, 96_000.0, 192_000.0] {
            let control = PeqControl::default();
            control.set_filters(&filters, -6.0, boost, DesignMethod::Matched, true);
            let mut bank = Bank::new(2);
            control.design(rate, &mut bank); // ısınma
            let runs = 50;
            let mut worst = 0.0f64;
            let start = Instant::now();
            for _ in 0..runs {
                let t = Instant::now();
                control.design(rate, &mut bank);
                worst = worst.max(t.elapsed().as_secs_f64());
            }
            let mean = start.elapsed().as_secs_f64() / f64::from(runs);
            println!(
                "RTS tasarım {label} @ {rate} Hz: ortalama {:.0} µs, en kötü {:.0} µs \
                 (10 ms'lik paylaşımlı periyodun %{:.1}'i)",
                mean * 1e6,
                worst * 1e6,
                worst / 0.010 * 100.0
            );
            let info = allocation_counter::measure(|| control.design(rate, &mut bank));
            assert_eq!(info.count_total, 0, "tasarım bellek ayırdı");
        }
    }
}
