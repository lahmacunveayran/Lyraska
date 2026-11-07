//! Ritim modelinin ([`super::rhythm_net`]) sonucundan şarkı haritasının girdileri: vuruş ızgarası
//! (tempo, değişken tempo) ve ölçü (ölçüdeki vuruş, ilk ölçü başının yeri, güven). Saf hesap.
//!
//! Model ölçü başlarını vuruş vuruş verir; şarkı haritası ise düzenli ölçü kullanır (vuruşun ölçüdeki
//! yeri `(sıra − ilk ölçü başı) mod ölçü`, [`super::structure::SongMap`]). Ölçü, modelin ölçü
//! başlarıyla en çok uyuşan düzenli ölçüdür (2–7 vuruş, her başlangıç yeri): uyuşma F-ölçüsü
//! (isabet / bulunan ve modelin ölçü başları), güven de odur.

use serde::{Deserialize, Serialize};

use super::beats::BeatGrid;

/// Modelin bir şarkıdaki sonucu: vuruş ve ölçü başı zamanları (sn, artan). Model çalışmadıysa
/// (şarkı çok uzun, çözülemedi) ikisi de boştur: ritim o zaman Lyraska'nın kendi analiziyle bulunur.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NetRhythm {
    pub beats: Vec<f64>,
    pub downbeats: Vec<f64>,
}

/// Ölçünün seçilmiş hâli.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NetMeter {
    /// Ölçüdeki vuruş.
    pub meter: usize,
    /// İlk tam ölçünün başladığı vuruşun sırası (0..meter).
    pub downbeat_phase: usize,
    /// Modelin ölçü başlarıyla uyuşma (0..1).
    pub confidence: f32,
}

/// Izgara için en az vuruş (şarkı haritası 8 vuruştan azında kurulmaz).
pub const MIN_BEATS: usize = 8;
/// Tempo değişimi aranırken şarkının bölündüğü parça (sn) ve "değişken" sayılan oran (%8; Lyraska'nın
/// kendi takipçisiyle aynı ölçüt, `beats.rs`).
const SEGMENT_SECONDS: f64 = 20.0;
const VARIABLE_TEMPO_RATIO: f64 = 1.08;
/// Aranan ölçüler.
const METERS: std::ops::RangeInclusive<usize> = 2..=7;
/// Modelin ölçü başı vuruşa taşınmıştır (`rhythm_model::pick`); eşleşme payı (sn).
const SAME_BEAT: f64 = 1e-6;

fn median(values: &mut [f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let n = values.len();
    Some(if n % 2 == 1 {
        values[n / 2]
    } else {
        0.5 * (values[n / 2 - 1] + values[n / 2])
    })
}

/// Vuruş aralıklarının ortancası (sn).
fn median_interval(beats: &[f64]) -> Option<f64> {
    let mut intervals: Vec<f64> = beats.windows(2).map(|w| w[1] - w[0]).collect();
    median(&mut intervals).filter(|&i| i > 0.0)
}

impl NetRhythm {
    /// Vuruş ızgarası: tempo vuruş aralıklarının ortancasından (0,1 BPM'e yuvarlı); 20 sn'lik
    /// parçaların ortanca aralıkları birbirinden %8'den çok ayrılıyorsa tempo değişken.
    pub fn grid(&self) -> Option<BeatGrid> {
        if self.beats.len() < MIN_BEATS {
            return None;
        }
        let interval = median_interval(&self.beats)?;
        let bpm = (600.0 / interval).round() / 10.0;
        let first = self.beats[0];
        let mut segments: Vec<f64> = Vec::new();
        let mut start = 0;
        while start < self.beats.len() {
            let limit = first + SEGMENT_SECONDS * (segments.len() + 1) as f64;
            let end = self.beats[start..]
                .iter()
                .position(|&b| b >= limit)
                .map_or(self.beats.len(), |p| start + p);
            if end - start >= 4 {
                if let Some(i) = median_interval(&self.beats[start..end]) {
                    segments.push(i);
                }
            }
            start = end.max(start + 1);
        }
        let (lo, hi) = segments
            .iter()
            .fold((f64::INFINITY, 0.0f64), |(lo, hi), &s| {
                (lo.min(s), hi.max(s))
            });
        let variable_tempo = segments.len() >= 2 && hi / lo > VARIABLE_TEMPO_RATIO;
        Some(BeatGrid {
            bpm,
            beats: self.beats.clone(),
            variable_tempo,
        })
    }

    /// Modelin ölçü başlarıyla en çok uyuşan düzenli ölçü. Uyuşma eşitse küçük ölçü ve erken
    /// başlangıç (4/4'ü 2/4'e bölmez: 4'lük ölçüde 2'lik ölçünün yarısı isabetsiz kalır). Ölçü başı
    /// ikiden azsa 4/4, güven 0.
    pub fn meter(&self) -> NetMeter {
        let fallback = NetMeter {
            meter: 4,
            downbeat_phase: 0,
            confidence: 0.0,
        };
        let marked: Vec<bool> = self
            .beats
            .iter()
            .map(|&b| self.downbeats.iter().any(|d| (d - b).abs() <= SAME_BEAT))
            .collect();
        let total = marked.iter().filter(|&&m| m).count();
        if total < 2 {
            return fallback;
        }
        let mut best = (0.0f64, fallback);
        for meter in METERS {
            for phase in 0..meter.min(self.beats.len()) {
                let predicted = (phase..self.beats.len()).step_by(meter).count();
                let hits = (phase..self.beats.len())
                    .step_by(meter)
                    .filter(|&i| marked[i])
                    .count();
                let f = 2.0 * hits as f64 / (predicted + total) as f64;
                if f > best.0 + 1e-12 {
                    best = (
                        f,
                        NetMeter {
                            meter,
                            downbeat_phase: phase,
                            confidence: f as f32,
                        },
                    );
                }
            }
        }
        best.1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn beats(n: usize, interval: f64) -> Vec<f64> {
        (0..n).map(|i| 0.3 + i as f64 * interval).collect()
    }

    #[test]
    fn tempo_ortanca_araliktan_ve_sabit() {
        let b = beats(100, 0.5);
        let net = NetRhythm {
            beats: b.clone(),
            downbeats: Vec::new(),
        };
        let grid = net.grid().expect("ızgara");
        assert_eq!(grid.bpm, 120.0);
        assert_eq!(grid.beats, b);
        assert!(!grid.variable_tempo);
        // Bir aykırı aralık ortancayı değiştirmez.
        let mut odd = b;
        odd.insert(50, odd[49] + 0.1);
        let grid = NetRhythm {
            beats: odd,
            downbeats: Vec::new(),
        }
        .grid()
        .expect("ızgara");
        assert_eq!(grid.bpm, 120.0);
    }

    #[test]
    fn tempo_degisince_degisken() {
        // 40 sn 120 BPM, sonra 40 sn 100 BPM (oran 1,2 > 1,08).
        let mut b = beats(80, 0.5);
        let last = *b.last().unwrap();
        b.extend((1..=67).map(|i| last + i as f64 * 0.6));
        let grid = NetRhythm {
            beats: b,
            downbeats: Vec::new(),
        }
        .grid()
        .expect("ızgara");
        assert!(grid.variable_tempo);
        // %5'lik oynama değişken sayılmaz.
        let mut b = beats(80, 0.5);
        let last = *b.last().unwrap();
        b.extend((1..=76).map(|i| last + i as f64 * 0.525));
        assert!(
            !NetRhythm {
                beats: b,
                downbeats: Vec::new()
            }
            .grid()
            .unwrap()
            .variable_tempo
        );
    }

    #[test]
    fn az_vurusta_izgara_yok() {
        let net = NetRhythm {
            beats: beats(MIN_BEATS - 1, 0.5),
            downbeats: Vec::new(),
        };
        assert!(net.grid().is_none());
        assert!(NetRhythm {
            beats: beats(MIN_BEATS, 0.5),
            downbeats: Vec::new()
        }
        .grid()
        .is_some());
    }

    fn with_downbeats(n: usize, every: usize, phase: usize) -> NetRhythm {
        let b = beats(n, 0.5);
        let d = (phase..n).step_by(every).map(|i| b[i]).collect();
        NetRhythm {
            beats: b,
            downbeats: d,
        }
    }

    #[test]
    fn olcu_ve_baslangic_modelin_olcu_baslarindan() {
        for (every, phase) in [(4, 0), (4, 3), (3, 1), (2, 1), (5, 2), (7, 6), (6, 0)] {
            let m = with_downbeats(84, every, phase).meter();
            assert_eq!(
                (m.meter, m.downbeat_phase),
                (every, phase),
                "{every}/{phase}"
            );
            assert!((m.confidence - 1.0).abs() < 1e-6);
        }
    }

    #[test]
    fn olcu_guveni_uyusmayla_duser() {
        // 4/4, ölçü başlarının dörtte biri bir vuruş kaymış: el hesabı. 84 vuruş, 21 ölçü başı; 16'sı
        // yerinde, 5'i kayık. Seçilen 4/0: tahmin 21, isabet 16 → F = 32/42.
        let mut net = with_downbeats(84, 4, 0);
        for k in [1usize, 5, 9, 13, 17] {
            net.downbeats[k] = net.beats[4 * k + 1];
        }
        let m = net.meter();
        assert_eq!((m.meter, m.downbeat_phase), (4, 0));
        assert!(
            (m.confidence - 32.0 / 42.0).abs() < 1e-6,
            "{}",
            m.confidence
        );
    }

    #[test]
    fn olcu_basi_yoksa_dort_ve_guven_sifir() {
        let net = NetRhythm {
            beats: beats(40, 0.5),
            downbeats: vec![0.3],
        };
        let m = net.meter();
        assert_eq!((m.meter, m.downbeat_phase, m.confidence), (4, 0, 0.0));
    }
}
