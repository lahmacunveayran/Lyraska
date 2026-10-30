//! Sözleri sese oturtan hesap (`docs/arastirma/soz-hizalama/`, bağımsız denetimin §5 ve §10'u).
//!
//! Girdi, modelin her 20 ms'lik karede her harf için verdiği log-olasılıklar (emisyon matrisi) ve
//! hazırlanmış söz satırlarıdır (`lyrics_text`). Hesap modelden bağımsızdır; yalnızca matrise bakar.
//!
//! - **Yerleşim:** CTC Viterbi, bilinen metnin en olası yerleşimi. Harfler arasında boşluk (blank),
//!   kelimeler arasında en az bir kare kelime ayırıcısı. **Satır atlama:** yapıştırılan sözde şarkıda
//!   söylenmeyen satırlar olabilir (çeviri, yanlış satır); bir satır başına önceki en çok
//!   `MAX_SKIP` satır atlanarak da varılabilir, cezası atlanan her satır için
//!   `SKIP_PER_LABEL` × etiket + `SKIP_PER_LINE` nat (geliştirme setinde seçildi).
//! - **Güven:** ileri-geri (forward-backward) hesabıyla, satırın her harfine yerleşim anının
//!   ±`CONFIDENCE_WINDOW` sn içinde girilme olasılığı (sıcaklık `TEMPERATURE`); satırın güveni bu
//!   değerlerin ortancası. "Bu satır başka bir yere de oturabilir mi?" sorusunun cevabıdır: model
//!   satırı duymuyorsa olasılık yayılır, güven sıfıra iner. Denetimde büyük hatayı (> 1 sn) AUROC
//!   0,97 ile ayırdı; `LOW_CONFIDENCE` altı "tahmini" gösterilir.
//! - **Doğrulama:** bu kod denetimin Python yöntemiyle 113 şarkının 4165 satırında aynı yerleşimi
//!   verir (`docs/arastirma/soz-hizalama/dogrulama/`); 4 dk şarkı birkaç saniye.
//! - **Bellek:** geri izleme kare × durum başına bir bayt; ileri değerler 64 karede bir saklanır, geri
//!   geçişte bloklar yeniden hesaplanır (4 dk şarkı, 2000 harf: ~50 MB + birkaç MB).

use std::collections::HashMap;

/// Satır atlama cezası: atlanan satırın her etiketi için (nat).
pub const SKIP_PER_LABEL: f64 = 6.0;
/// Satır atlama cezası: atlanan her satır için (nat).
pub const SKIP_PER_LINE: f64 = 40.0;
/// Bir satır başına en çok kaç satır atlanarak varılabilir.
pub const MAX_SKIP: usize = 3;
/// Güven hesabının sıcaklığı (log-olasılıklar bununla çarpılır).
pub const TEMPERATURE: f64 = 0.5;
/// Güven penceresi (sn): harfe yerleşim anının bu kadar yakınında girilme olasılığı.
pub const CONFIDENCE_WINDOW: f64 = 0.3;
/// Bu güvenin altındaki satır "tahmini" (denetimde büyük hataların %80'ini yakalayan eşik).
pub const LOW_CONFIDENCE: f64 = 0.225;
/// Bu güvenin altındaki satırlar çoğunluktaysa sözler şarkıya oturmadı.
pub const UNALIGNED_CONFIDENCE: f64 = 0.5;
/// İleri değerlerin saklandığı aralık (kare).
const CHECKPOINT: usize = 64;

const NEG: f64 = -1e30;

/// Modelin karelik log-olasılıkları: `frames` × `columns`, satır satır.
#[derive(Debug, Clone)]
pub struct Emissions {
    pub frames: usize,
    pub columns: usize,
    pub log_probs: Vec<f32>,
    /// Bir karenin süresi (sn).
    pub frame_secs: f64,
}

impl Emissions {
    fn at(&self, t: usize, column: usize) -> f64 {
        f64::from(self.log_probs[t * self.columns + column])
    }
}

/// Harflerin emisyon matrisindeki sütunları.
#[derive(Debug, Clone)]
pub struct Vocabulary {
    pub blank: usize,
    /// Kelime ayırıcısı (yoksa kelimeler yalnızca blank ile ayrılır).
    pub space: Option<usize>,
    pub letters: HashMap<char, usize>,
}

/// Bir kelimenin yeri (sn).
#[derive(Debug, Clone, PartialEq)]
pub struct WordTiming {
    pub start: f64,
    pub end: f64,
}

/// Bir satırın yeri ve güveni.
#[derive(Debug, Clone, PartialEq)]
pub struct LineTiming {
    pub start: f64,
    pub end: f64,
    /// Satırın kelimeleri (sözlükte harfi olmayan kelime bir önceki kelimenin sonuna oturur).
    pub words: Vec<WordTiming>,
    /// 0–1; atlanan ya da harfi olmayan satırda 0.
    pub confidence: f64,
    /// Satır şarkıda bulunamadı (atlandı); zamanı komşularından.
    pub skipped: bool,
}

impl LineTiming {
    /// Ekranda "tahmini" gösterilir.
    pub fn low_confidence(&self) -> bool {
        self.skipped || self.confidence < LOW_CONFIDENCE
    }
}

/// Şarkının bütünü için hüküm.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Satırların hepsi güvenli.
    Good,
    /// Bazı satırlar tahmini.
    PartlyEstimated,
    /// Satırların çoğu oturmadı: sözler bu şarkıya ait olmayabilir ya da kayıt çok zor (denetim
    /// setindeki doğru sözlü 113 şarkının 4'ünde: hepsinde hizalama gerçekten bozuktu).
    Unaligned,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Alignment {
    pub lines: Vec<LineTiming>,
    pub verdict: Verdict,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AlignError {
    #[error("sözde modelin tanıdığı harf yok")]
    NoLetters,
    #[error("ses sözü taşıyamayacak kadar kısa")]
    TooShort,
    #[error("emisyon matrisi bozuk")]
    BadEmissions,
}

/// Etiket dizisi: harfler ve ayırıcılar; her kelimenin ve satırın etiket aralığı.
struct Labels {
    columns: Vec<usize>,
    /// Kelimenin ilk ve son etiketi (harfi olmayan kelimede `None`), satır satır.
    words: Vec<Vec<Option<(usize, usize)>>>,
    /// Satırın ilk ve son etiketi.
    lines: Vec<Option<(usize, usize)>>,
}

fn build_labels(lines: &[Vec<String>], vocab: &Vocabulary) -> Labels {
    let mut columns = Vec::new();
    let mut words_out = Vec::with_capacity(lines.len());
    let mut lines_out = Vec::with_capacity(lines.len());
    for line in lines {
        let mut first = None;
        let mut words = Vec::with_capacity(line.len());
        for word in line {
            let letters: Vec<usize> = word
                .chars()
                .filter_map(|c| vocab.letters.get(&c).copied())
                .collect();
            if letters.is_empty() {
                words.push(None);
                continue;
            }
            if let (false, Some(space)) = (columns.is_empty(), vocab.space) {
                columns.push(space);
            }
            let start = columns.len();
            first.get_or_insert(start);
            columns.extend(letters);
            words.push(Some((start, columns.len() - 1)));
        }
        lines_out.push(first.map(|a| (a, columns.len() - 1)));
        words_out.push(words);
    }
    Labels {
        columns,
        words: words_out,
        lines: lines_out,
    }
}

/// CTC durumları: çift durum blank, tek durum `(s - 1) / 2` etiketi.
struct States {
    emit: Vec<usize>,
    /// s - 2'den doğrudan gelinebilir mi (iki ardışık etiket farklıysa).
    skip_ok: Vec<bool>,
}

fn states(labels: &[usize], blank: usize) -> States {
    let count = 2 * labels.len() + 1;
    let mut emit = vec![blank; count];
    let mut skip_ok = vec![false; count];
    for (i, &label) in labels.iter().enumerate() {
        emit[2 * i + 1] = label;
        if i > 0 && labels[i - 1] != label {
            skip_ok[2 * i + 1] = true;
        }
    }
    States { emit, skip_ok }
}

fn log_add(a: f64, b: f64) -> f64 {
    let (hi, lo) = if a > b { (a, b) } else { (b, a) };
    if lo <= NEG {
        hi
    } else {
        hi + (lo - hi).exp().ln_1p()
    }
}

/// Satır atlama yayları ve başlangıç/bitiş cezaları.
struct Arcs {
    /// Hedef durum → (kaynak durum, ceza).
    incoming: HashMap<usize, Vec<(usize, f64)>>,
    start_penalty: Vec<f64>,
    end_penalty: Vec<f64>,
}

fn skip_arcs(labels: &Labels, state_count: usize) -> Arcs {
    let mut start_penalty = vec![f64::INFINITY; state_count];
    let mut end_penalty = vec![f64::INFINITY; state_count];
    start_penalty[0] = 0.0;
    start_penalty[1] = 0.0;
    end_penalty[state_count - 1] = 0.0;
    end_penalty[state_count - 2] = 0.0;
    let real: Vec<(usize, usize)> = labels.lines.iter().flatten().copied().collect();
    let penalty: Vec<f64> = real
        .iter()
        .map(|&(a, b)| SKIP_PER_LABEL * (b - a + 1) as f64 + SKIP_PER_LINE)
        .collect();
    let skipped = |from: usize, to: usize| -> f64 { penalty[from..to].iter().sum() };
    let mut incoming: HashMap<usize, Vec<(usize, f64)>> = HashMap::new();
    for (j, &(a, b)) in real.iter().enumerate() {
        for k in 1..=MAX_SKIP {
            if j > k {
                // Önceki k satır atlanarak: (j - k - 1). satırın sonundan bu satırın ilk harfine.
                let (_, prev_end) = real[j - k - 1];
                for source in [2 * prev_end + 1, 2 * prev_end + 2] {
                    incoming
                        .entry(2 * a + 1)
                        .or_default()
                        .push((source, skipped(j - k, j)));
                }
            } else if j == k {
                // Baştaki k satır atlanarak başlanır.
                let p = skipped(0, j);
                start_penalty[2 * a + 1] = start_penalty[2 * a + 1].min(p);
                start_penalty[2 * a] = start_penalty[2 * a].min(p);
            }
        }
        let after = real.len() - 1 - j;
        if (1..=MAX_SKIP).contains(&after) {
            let p = skipped(j + 1, real.len());
            end_penalty[2 * b + 1] = end_penalty[2 * b + 1].min(p);
            end_penalty[2 * b + 2] = end_penalty[2 * b + 2].min(p);
        }
    }
    Arcs {
        incoming,
        start_penalty,
        end_penalty,
    }
}

/// Satır atlamalı Viterbi: her karenin durumu.
fn viterbi(em: &Emissions, st: &States, arcs: &Arcs) -> Result<Vec<usize>, AlignError> {
    let s_count = st.emit.len();
    let t_count = em.frames;
    // Geri izleme: 0 aynı durum, 1 s-1, 2 s-2, 3+k gelen k. yay.
    let mut back = vec![0u8; t_count * s_count];
    let mut d: Vec<f64> = (0..s_count)
        .map(|s| {
            if arcs.start_penalty[s].is_finite() {
                em.at(0, st.emit[s]) - arcs.start_penalty[s]
            } else {
                NEG
            }
        })
        .collect();
    let mut next = vec![NEG; s_count];
    let mut targets: Vec<(&usize, &Vec<(usize, f64)>)> = arcs.incoming.iter().collect();
    targets.sort_by_key(|(t, _)| **t);
    for t in 1..t_count {
        let row = &mut back[t * s_count..(t + 1) * s_count];
        for s in 0..s_count {
            let mut best = d[s];
            let mut code = 0u8;
            if s >= 1 && d[s - 1] > best {
                best = d[s - 1];
                code = 1;
            }
            if s >= 2 && st.skip_ok[s] && d[s - 2] > best {
                best = d[s - 2];
                code = 2;
            }
            next[s] = best;
            row[s] = code;
        }
        for (&target, sources) in &targets {
            for (k, &(source, penalty)) in sources.iter().enumerate() {
                let v = d[source] - penalty;
                if v > next[target] {
                    next[target] = v;
                    row[target] = 3 + k as u8;
                }
            }
        }
        for s in 0..s_count {
            d[s] = if next[s] <= NEG {
                NEG
            } else {
                next[s] + em.at(t, st.emit[s])
            };
        }
    }
    let (mut s, best) = (0..s_count)
        .filter(|&s| arcs.end_penalty[s].is_finite())
        .map(|s| (s, d[s] - arcs.end_penalty[s]))
        .fold(
            (s_count - 1, NEG),
            |acc, x| if x.1 > acc.1 { x } else { acc },
        );
    if best <= NEG / 2.0 {
        return Err(AlignError::TooShort);
    }
    let mut path = vec![0; t_count];
    for t in (0..t_count).rev() {
        path[t] = s;
        if t == 0 {
            break;
        }
        s = match back[t * s_count + s] {
            0 => s,
            1 => s - 1,
            2 => s - 2,
            code => arcs.incoming[&s][usize::from(code - 3)].0,
        };
    }
    Ok(path)
}

/// Her etikete girme olasılığının, `first[i]` çevresindeki ±`window` karelik toplamı (düz CTC,
/// sıcaklıkla). İleri değerler `CHECKPOINT` karede bir saklanır.
fn entry_mass(em: &Emissions, st: &States, first: &[usize], window: usize) -> Vec<f64> {
    let s_count = st.emit.len();
    let t_count = em.frames;
    let emit = |t: usize, s: usize| TEMPERATURE * em.at(t, st.emit[s]);
    let step = |prev: &[f64], t: usize, out: &mut [f64]| {
        for s in 0..s_count {
            let mut v = prev[s];
            if s >= 1 {
                v = log_add(v, prev[s - 1]);
            }
            if s >= 2 && st.skip_ok[s] {
                v = log_add(v, prev[s - 2]);
            }
            out[s] = v + emit(t, s);
        }
    };
    // İleri geçiş: saklama noktaları.
    let mut alpha = vec![NEG; s_count];
    alpha[0] = emit(0, 0);
    if s_count > 1 {
        alpha[1] = emit(0, 1);
    }
    let mut checkpoints: Vec<Vec<f64>> = vec![alpha.clone()];
    let mut next = vec![NEG; s_count];
    for t in 1..t_count {
        step(&alpha, t, &mut next);
        std::mem::swap(&mut alpha, &mut next);
        if t % CHECKPOINT == 0 {
            checkpoints.push(alpha.clone());
        }
    }
    let z = log_add(alpha[s_count - 1], alpha[s_count - 2]);
    let mut mass = vec![0.0; first.len()];
    // Karede penceresi bu kareyi içeren etiketler: first sıralıdır.
    let labels_near = |t: usize| -> (usize, usize) {
        let lo = first.partition_point(|&f| f + window < t);
        let hi = first.partition_point(|&f| f <= t + window);
        (lo, hi)
    };
    let mut beta = vec![NEG; s_count];
    beta[s_count - 1] = 0.0;
    beta[s_count - 2] = 0.0;
    let mut next_beta = vec![NEG; s_count];
    // Geri geçiş: bloğun ileri değerleri saklama noktasından yeniden hesaplanır.
    let mut block: Vec<Vec<f64>> = Vec::new();
    let mut block_start = usize::MAX;
    for t in (1..t_count).rev() {
        let need = t - 1;
        if need < block_start || block.is_empty() {
            block_start = need / CHECKPOINT * CHECKPOINT;
            block.clear();
            block.push(checkpoints[need / CHECKPOINT].clone());
            let end = (block_start + CHECKPOINT).min(t_count);
            for u in block_start + 1..end {
                let mut row = vec![NEG; s_count];
                step(&block[u - block_start - 1], u, &mut row);
                block.push(row);
            }
        }
        let prev = &block[need - block_start];
        let (lo, hi) = labels_near(t);
        for (i, m) in mass.iter_mut().enumerate().take(hi).skip(lo) {
            let s = 2 * i + 1;
            let mut v = prev[s - 1];
            if s >= 2 && st.skip_ok[s] {
                v = log_add(v, prev[s - 2]);
            }
            let p = v + emit(t, s) + beta[s] - z;
            if p > -700.0 {
                *m += p.exp();
            }
        }
        for s in 0..s_count {
            let mut v = beta[s] + emit(t, s);
            if s + 1 < s_count {
                v = log_add(v, beta[s + 1] + emit(t, s + 1));
            }
            if s + 2 < s_count && st.skip_ok[s + 2] {
                v = log_add(v, beta[s + 2] + emit(t, s + 2));
            }
            next_beta[s] = v;
        }
        std::mem::swap(&mut beta, &mut next_beta);
    }
    // İlk karede başlanan ilk etiket.
    let (lo, hi) = labels_near(0);
    if lo == 0 && hi > 0 {
        let p = checkpoints[0][1] + beta[1] - z;
        if p > -700.0 {
            mass[0] += p.exp();
        }
    }
    mass
}

fn median(values: &mut [f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(f64::total_cmp);
    let n = values.len();
    if n % 2 == 1 {
        values[n / 2]
    } else {
        (values[n / 2 - 1] + values[n / 2]) / 2.0
    }
}

/// Sözleri sese oturtur. `lines`: satır satır söylenen kelimeler (`lyrics_text::AlignLine::words`).
pub fn align(
    em: &Emissions,
    vocab: &Vocabulary,
    lines: &[Vec<String>],
) -> Result<Alignment, AlignError> {
    if em.columns == 0
        || em.log_probs.len() != em.frames * em.columns
        || !em.frame_secs.is_finite()
        || em.frame_secs <= 0.0
        || vocab.blank >= em.columns
        || vocab.space.is_some_and(|s| s >= em.columns)
        || vocab.letters.values().any(|&c| c >= em.columns)
        || em.log_probs.iter().any(|v| !v.is_finite())
    {
        return Err(AlignError::BadEmissions);
    }
    let labels = build_labels(lines, vocab);
    if labels.columns.is_empty() {
        return Err(AlignError::NoLetters);
    }
    // Her etiket en az bir kare; ardışık aynı etiketlerin arasına bir blank.
    let repeats = labels.columns.windows(2).filter(|w| w[0] == w[1]).count();
    if em.frames < labels.columns.len() + repeats {
        return Err(AlignError::TooShort);
    }
    let st = states(&labels.columns, vocab.blank);
    let arcs = skip_arcs(&labels, st.emit.len());
    let path = viterbi(em, &st, &arcs)?;

    // Etiketin ilk ve son karesi; yolda olmayan etiket bir sonrakinin ilk karesine oturur.
    let label_count = labels.columns.len();
    let mut first = vec![usize::MAX; label_count];
    let mut last = vec![usize::MAX; label_count];
    for (t, &s) in path.iter().enumerate() {
        if s % 2 == 1 {
            let i = s / 2;
            if first[i] == usize::MAX {
                first[i] = t;
            }
            last[i] = t;
        }
    }
    let placed: Vec<bool> = first.iter().map(|&f| f != usize::MAX).collect();
    let mut following = em.frames;
    for i in (0..label_count).rev() {
        if placed[i] {
            following = first[i];
        } else {
            first[i] = following.min(em.frames - 1);
            last[i] = first[i];
        }
    }

    let window = (CONFIDENCE_WINDOW / em.frame_secs) as usize;
    let mass = entry_mass(em, &st, &first, window);

    let secs = |frame: usize| frame as f64 * em.frame_secs;
    let mut out: Vec<LineTiming> = Vec::with_capacity(lines.len());
    for (line, words) in labels.lines.iter().zip(&labels.words) {
        match *line {
            Some((a, b)) => {
                let skipped = !placed[a..=b].iter().any(|&p| p);
                let mut values: Vec<f64> = mass[a..=b].iter().map(|m| m.min(1.0)).collect();
                let confidence = if skipped { 0.0 } else { median(&mut values) };
                let start = secs(first[a]);
                let mut word_out = Vec::with_capacity(words.len());
                let mut cursor = start;
                for word in words {
                    let timing = match *word {
                        Some((wa, wb)) => WordTiming {
                            start: secs(first[wa]),
                            end: secs(last[wb] + 1).max(secs(first[wa])),
                        },
                        None => WordTiming {
                            start: cursor,
                            end: cursor,
                        },
                    };
                    cursor = timing.end;
                    word_out.push(timing);
                }
                out.push(LineTiming {
                    start,
                    end: secs(last[b] + 1).max(start),
                    words: word_out,
                    confidence,
                    skipped,
                });
            }
            None => out.push(LineTiming {
                start: 0.0,
                end: 0.0,
                words: vec![],
                confidence: 0.0,
                skipped: true,
            }),
        }
    }
    // Harfi olmayan satır: bir önceki satırın sonuna oturur.
    let mut previous_end = 0.0;
    for line in &mut out {
        if line.words.is_empty() && line.skipped {
            line.start = previous_end;
            line.end = previous_end;
        }
        previous_end = line.end;
    }

    let n = out.len().max(1) as f64;
    let weak = out.iter().filter(|l| l.low_confidence()).count();
    let doubtful = out
        .iter()
        .filter(|l| l.skipped || l.confidence < UNALIGNED_CONFIDENCE)
        .count();
    let verdict = if doubtful as f64 / n > 0.5 {
        Verdict::Unaligned
    } else if weak > 0 {
        Verdict::PartlyEstimated
    } else {
        Verdict::Good
    };
    Ok(Alignment {
        lines: out,
        verdict,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const LETTERS: &str = "abcdefghijklmnopqrstuvwxyzışğüöç'";
    const DT: f64 = 0.02;

    fn vocab() -> Vocabulary {
        Vocabulary {
            blank: 0,
            space: Some(1),
            letters: LETTERS
                .chars()
                .enumerate()
                .map(|(i, c)| (c, i + 2))
                .collect(),
        }
    }

    fn columns() -> usize {
        LETTERS.chars().count() + 2
    }

    /// Kare kare ne duyulduğu: `Some(sütun)` net duyulan harf, `None` hiçbir şey (eşit olasılık).
    fn emissions(frames: &[Option<usize>]) -> Emissions {
        let c = columns();
        let mut log_probs = Vec::with_capacity(frames.len() * c);
        for frame in frames {
            for col in 0..c {
                // CTC modelleri sivridir: duyulmayan harfin olasılığı ~1e-7 (log ≈ −16).
                let p = match frame {
                    Some(target) if *target == col => 1.0 - 1e-7 * (c - 1) as f64,
                    Some(_) => 1e-7,
                    None => 1.0 / c as f64,
                };
                log_probs.push(p.ln() as f32);
            }
        }
        Emissions {
            frames: frames.len(),
            columns: c,
            log_probs,
            frame_secs: DT,
        }
    }

    /// Bir şarkı: (başlangıç karesi, satır) çiftleri; her harf 4 kare, harf arası 1 kare blank,
    /// kelime arası 2 kare ayırıcı, geri kalan sessizlik (blank).
    fn song(total: usize, lines: &[(usize, &str)]) -> (Vec<Option<usize>>, Vec<usize>) {
        let v = vocab();
        let mut frames = vec![Some(0); total];
        let mut starts = Vec::new();
        for &(at, text) in lines {
            starts.push(at);
            let mut t = at;
            for (wi, word) in text.split(' ').enumerate() {
                if wi > 0 {
                    frames[t] = Some(1);
                    frames[t + 1] = Some(1);
                    t += 2;
                }
                for ch in word.chars() {
                    for _ in 0..4 {
                        frames[t] = Some(v.letters[&ch]);
                        t += 1;
                    }
                    frames[t] = Some(0);
                    t += 1;
                }
            }
        }
        (frames, starts)
    }

    fn words(lines: &[&str]) -> Vec<Vec<String>> {
        lines
            .iter()
            .map(|l| l.split(' ').map(str::to_string).collect())
            .collect()
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() <= DT + 1e-9
    }

    #[test]
    fn satirlar_dogru_yere_oturur_ve_guvenli() {
        let (frames, starts) = song(
            600,
            &[(50, "gel bana"), (200, "kal burada"), (400, "ışık söndü")],
        );
        let a = align(
            &emissions(&frames),
            &vocab(),
            &words(&["gel bana", "kal burada", "ışık söndü"]),
        )
        .expect("hizalanır");
        for (line, start) in a.lines.iter().zip(&starts) {
            assert!(
                close(line.start, *start as f64 * DT),
                "{} != {}",
                line.start,
                *start as f64 * DT
            );
            assert!(line.confidence > 0.9, "güven {}", line.confidence);
            assert!(!line.skipped && !line.low_confidence());
        }
        // İkinci kelime: 3 harf × 5 kare + 2 kare ayırıcı sonra.
        assert!(close(a.lines[0].words[1].start, (50 + 15 + 2) as f64 * DT));
        assert!(a.lines[0].words[0].end <= a.lines[0].words[1].start + 1e-9);
        assert_eq!(a.verdict, Verdict::Good);
    }

    #[test]
    fn soylenmeyen_satir_atlanir() {
        // Yapıştırılan sözde şarkıda olmayan bir satır (çeviri) var.
        let (frames, starts) = song(
            700,
            &[(50, "gel bana"), (250, "kal burada"), (450, "ışık söndü")],
        );
        let lyrics = words(&["gel bana", "come to me now", "kal burada", "ışık söndü"]);
        let a = align(&emissions(&frames), &vocab(), &lyrics).expect("hizalanır");
        assert!(a.lines[1].skipped && a.lines[1].low_confidence());
        for (i, start) in [(0, starts[0]), (2, starts[1]), (3, starts[2])] {
            assert!(
                close(a.lines[i].start, start as f64 * DT),
                "satır {i}: {}",
                a.lines[i].start
            );
            assert!(!a.lines[i].skipped && a.lines[i].confidence > 0.9);
        }
        assert_eq!(a.verdict, Verdict::PartlyEstimated);
    }

    #[test]
    fn bastaki_ve_sondaki_satir_da_atlanabilir() {
        let (frames, starts) = song(500, &[(100, "kal burada")]);
        let lyrics = words(&["verse one", "kal burada", "outro end"]);
        let a = align(&emissions(&frames), &vocab(), &lyrics).expect("hizalanır");
        assert!(a.lines[0].skipped && a.lines[2].skipped);
        assert!(close(a.lines[1].start, starts[0] as f64 * DT));
    }

    #[test]
    fn duyulmayan_satirin_guveni_duser() {
        // İkinci satırın yeri gürültü: model orada hiçbir şey duymuyor.
        let (mut frames, _) = song(
            700,
            &[(50, "gel bana"), (250, "kal burada"), (450, "ışık söndü")],
        );
        for f in frames.iter_mut().take(320).skip(220) {
            *f = None;
        }
        let a = align(
            &emissions(&frames),
            &vocab(),
            &words(&["gel bana", "kal burada", "ışık söndü"]),
        )
        .expect("hizalanır");
        assert!(
            a.lines[1].low_confidence(),
            "güven {}",
            a.lines[1].confidence
        );
        assert!(a.lines[0].confidence > 0.9 && a.lines[2].confidence > 0.9);
    }

    #[test]
    fn yanlis_sarkinin_sozu_fark_edilir() {
        let (frames, _) = song(
            900,
            &[(50, "gel bana"), (250, "kal burada"), (450, "ışık söndü")],
        );
        // Sese hiç uymayan söz (şarkıda olmayan harfler): her yerleşim aynı kötülükte, olasılık
        // yayılır. Gerçek modelle ölçüm: denetimde 20 yanlış sözün 19'u bu hükmü aldı.
        let other = words(&["ciğ moy hit", "pof tiz coj", "hoj vic myt", "zoy fit poç"]);
        let a = align(&emissions(&frames), &vocab(), &other).expect("hizalanır");
        assert_eq!(a.verdict, Verdict::Unaligned);
    }

    #[test]
    fn ayni_harf_ardisik_ve_bilinmeyen_kelime() {
        // "aa": iki ayrı a (arada blank). "@@" sözlükte yok: önceki kelimenin sonuna oturur.
        let (frames, starts) = song(300, &[(40, "saat")]);
        let lyrics = vec![vec!["saat".to_string(), "@@".to_string()]];
        let a = align(&emissions(&frames), &vocab(), &lyrics).expect("hizalanır");
        assert!(close(a.lines[0].start, starts[0] as f64 * DT));
        assert_eq!(a.lines[0].words[1].start, a.lines[0].words[0].end);
    }

    #[test]
    fn hatali_girdiler() {
        let (frames, _) = song(100, &[(10, "ab")]);
        let em = emissions(&frames);
        assert_eq!(
            align(&em, &vocab(), &[vec!["@".into()]]),
            Err(AlignError::NoLetters)
        );
        assert_eq!(align(&em, &vocab(), &[]), Err(AlignError::NoLetters));
        let short = emissions(&frames[..3]);
        assert_eq!(
            align(&short, &vocab(), &words(&["abcdef"])),
            Err(AlignError::TooShort)
        );
        let mut bad = em.clone();
        bad.log_probs[5] = f32::NAN;
        assert_eq!(
            align(&bad, &vocab(), &words(&["ab"])),
            Err(AlignError::BadEmissions)
        );
        let mut bad = em.clone();
        bad.log_probs.pop();
        assert_eq!(
            align(&bad, &vocab(), &words(&["ab"])),
            Err(AlignError::BadEmissions)
        );
        let mut wide = vocab();
        wide.letters.insert('ж', 999);
        assert_eq!(
            align(&em, &wide, &words(&["ab"])),
            Err(AlignError::BadEmissions)
        );
    }

    /// Saklama noktasız, tam matrisli ileri-geri: `entry_mass`ın blok yeniden hesabını sınar.
    fn entry_mass_full(em: &Emissions, st: &States, first: &[usize], window: usize) -> Vec<f64> {
        let s_count = st.emit.len();
        let e = |t: usize, s: usize| TEMPERATURE * em.at(t, st.emit[s]);
        let mut alpha = vec![vec![NEG; s_count]; em.frames];
        alpha[0][0] = e(0, 0);
        alpha[0][1] = e(0, 1);
        for t in 1..em.frames {
            for s in 0..s_count {
                let mut v = alpha[t - 1][s];
                if s >= 1 {
                    v = log_add(v, alpha[t - 1][s - 1]);
                }
                if s >= 2 && st.skip_ok[s] {
                    v = log_add(v, alpha[t - 1][s - 2]);
                }
                alpha[t][s] = v + e(t, s);
            }
        }
        let mut beta = vec![vec![NEG; s_count]; em.frames];
        let last = em.frames - 1;
        beta[last][s_count - 1] = 0.0;
        beta[last][s_count - 2] = 0.0;
        for t in (0..last).rev() {
            for s in 0..s_count {
                let mut v = beta[t + 1][s] + e(t + 1, s);
                if s + 1 < s_count {
                    v = log_add(v, beta[t + 1][s + 1] + e(t + 1, s + 1));
                }
                if s + 2 < s_count && st.skip_ok[s + 2] {
                    v = log_add(v, beta[t + 1][s + 2] + e(t + 1, s + 2));
                }
                beta[t][s] = v;
            }
        }
        let z = log_add(alpha[last][s_count - 1], alpha[last][s_count - 2]);
        first
            .iter()
            .enumerate()
            .map(|(i, &f)| {
                let s = 2 * i + 1;
                (f.saturating_sub(window)..=(f + window).min(last))
                    .map(|t| {
                        let into = if t == 0 {
                            if s == 1 {
                                0.0
                            } else {
                                NEG
                            }
                        } else {
                            let mut v = alpha[t - 1][s - 1];
                            if s >= 2 && st.skip_ok[s] {
                                v = log_add(v, alpha[t - 1][s - 2]);
                            }
                            v
                        };
                        let p = into + e(t, s) + beta[t][s] - z;
                        if p > -700.0 {
                            p.exp()
                        } else {
                            0.0
                        }
                    })
                    .sum()
            })
            .collect()
    }

    #[test]
    fn saklama_noktali_hesap_tam_hesapla_ayni() {
        // Birkaç blok (CHECKPOINT = 64) ve gürültülü bölge.
        let (mut frames, _) = song(400, &[(30, "gel bana"), (150, "kal"), (260, "ışık")]);
        for f in frames.iter_mut().take(200).skip(140) {
            *f = None;
        }
        let em = emissions(&frames);
        let labels = build_labels(&words(&["gel bana", "kal", "ışık"]), &vocab());
        let st = states(&labels.columns, 0);
        // Etiketlere kendi yerleri: Viterbi'nin bulduğu.
        let arcs = skip_arcs(&labels, st.emit.len());
        let path = viterbi(&em, &st, &arcs).expect("yol");
        let mut first = vec![usize::MAX; labels.columns.len()];
        for (t, &s) in path.iter().enumerate() {
            if s % 2 == 1 && first[s / 2] == usize::MAX {
                first[s / 2] = t;
            }
        }
        let window = 15;
        let fast = entry_mass(&em, &st, &first, window);
        let full = entry_mass_full(&em, &st, &first, window);
        for (a, b) in fast.iter().zip(&full) {
            assert!((a - b).abs() < 1e-9, "{a} != {b}");
        }
        assert!(fast.iter().any(|&m| m > 0.9) && fast.iter().any(|&m| m < 0.5));
    }
}
