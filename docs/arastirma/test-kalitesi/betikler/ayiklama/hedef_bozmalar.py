"""Yeni testlerin hedef bozmayla düştüğünü doğrular (7 Kasım 2026 ayıklaması). Her satır: dosya, kaynaktaki metin
(bir kez geçmeli), bozulmuş hâli, çalıştırılacak test süzgeci. Bozma uygulanır, `cargo test --lib <süzgeç>` çalışır:
düşerse (ya da derlenmezse) "yakalandı"; dosya her seferinde geri yazılır (SIGINT/SIGTERM'de de).

Kullanım (src-tauri'de): python3 -I ../docs/arastirma/test-kalitesi/betikler/ayiklama/hedef_bozmalar.py [başlangıç]
`başlangıç`: listede kaçıncı hedeften (0'dan) sürüleceği. Derleme artımlıdır (yalnızca bozulan dosyanın crate'i;
artımsız derlemede bozma başına ~4 dk, artımlıda ~1 dk).
"""
import pathlib, signal, subprocess, sys

B = "src/audio/biquad.rs"
BA = "src/audio/bass.rs"
ST = "src/analysis/structure.rs"
AB = "src/audio/abx.rs"
LT = "src/analysis/lyrics_text.rs"
GL = "src/audio/gapless.rs"
SP = "src/analysis/spectrogram.rs"
NR = "src/analysis/net_rhythm.rs"

TARGETS = [
    # biquad
    (B, "let alpha = sin / (2.0 * q);\n        Self::normalized([alpha, 0.0, -alpha]", "let alpha = sin / (2.0 + q);\n        Self::normalized([alpha, 0.0, -alpha]", "audio::biquad::tests::rbj_q"),
    (B, "let freq_hz = freq_hz.min(sample_rate * MAX_FREQ_RATIO);\n        let w0 = 2.0 * PI * freq_hz / sample_rate;\n        let (sin, cos) = w0.sin_cos();\n        let alpha = sin / (2.0 * q);\n        Self::normalized([alpha", "let freq_hz = freq_hz.min(sample_rate + MAX_FREQ_RATIO);\n        let w0 = 2.0 * PI * freq_hz / sample_rate;\n        let (sin, cos) = w0.sin_cos();\n        let alpha = sin / (2.0 * q);\n        Self::normalized([alpha", "audio::biquad::tests::nyquist_otesindeki"),
    (B, "if spec.is_flat() || spec.freq_hz >= sample_rate * MAX_FREQ_RATIO {", "if spec.is_flat() || spec.freq_hz >= sample_rate / MAX_FREQ_RATIO {", "audio::biquad::tests::nyquist_otesindeki"),
    (B, "self.a2.abs() < 1.0 && self.a1.abs() < 1.0 + self.a2", "self.a2.abs() < 1.0 || self.a1.abs() < 1.0 + self.a2", "audio::biquad::tests::kararlilik"),
    (B, "self.a2.abs() < 1.0 && self.a1.abs() < 1.0 + self.a2", "self.a2.abs() <= 1.0 && self.a1.abs() < 1.0 + self.a2", "audio::biquad::tests::kararlilik"),
    (B, ".max(((-b1 - root) / (2.0 * b0)).abs())", ".max(((b1 - root) / (2.0 * b0)).abs())", "audio::biquad::tests::pay_sifirlarinin"),
    (B, "            gain *= z.abs();", "            gain += z.abs();", "audio::biquad::tests::en_kucuk_faz"),
    (B, "    if disc < 0.0 || b0 == 0.0 || b2 == 0.0 {\n        return b;", "    if disc < 0.0 || b0 == 0.0 && b2 == 0.0 {\n        return b;", "audio::biquad::tests::en_kucuk_faz"),
    (B, "        if value.abs() < 1e-200 {", "        if value.abs() == 1e-200 {", "audio::biquad::tests::denormal"),
    # bass
    (BA, "            self.step();\n            self.update_left = self.update_frames;\n        }\n        self.update_left -= 1;", "            self.step();\n            self.update_left = self.update_frames;\n        }\n        self.update_left += 1;", "audio::bass::tests::calarken_degisen"),
    (BA, "        if delta.abs() <= step {\n            *value = target;\n            true", "        if delta.abs() > step {\n            *value = target;\n            true", "audio::bass::tests::karisim_derinlik"),
    (BA, "        8.0 * u2 * (u2 - 1.0) + 1.0,", "        8.0 * u2 * (u2 - 1.0) - 1.0,", "audio::bass::tests::chebyshev"),
    (BA, "        let mono = mono / frame.len().max(1) as f64;", "        let mono = mono * frame.len().max(1) as f64;", "audio::bass::tests::bas_tepesi_olcumu"),
    (BA, "linear_to_db(self.band_peak / self.raw_peak).min(0.0)", "linear_to_db(self.band_peak * self.raw_peak).min(0.0)", "audio::bass::tests::bas_tepesi_olcumu"),
    # structure
    (ST, "(beat_index as isize - self.downbeat_phase as isize)", "(beat_index as isize + self.downbeat_phase as isize)", "analysis::structure::tests::olcudeki_yer"),
    (ST, "if !seconds.is_finite() || seconds < 0.0 {", "if !seconds.is_finite() && seconds < 0.0 {", "analysis::structure::tests::olcudeki_yer"),
    (ST, ".position(|s| seconds >= s.start && seconds < s.end)", ".position(|s| seconds >= s.start && seconds <= s.end)", "analysis::structure::tests::olcudeki_yer"),
    (ST, "(-0.5 * (x / (0.5 * width)).powi(2)).exp()", "(-0.5 * (x / (0.5 + width)).powi(2)).exp()", "analysis::structure::tests::sayisal"),
    (ST, "sorted[((sorted.len() - 1) as f64 * p).round() as usize]", "sorted[((sorted.len() / 1) as f64 * p).round() as usize]", "analysis::structure::tests::sayisal"),
    # abx
    (AB, "let (mut ga, mut gb) = if level_diff_db > 0.0 {", "let (mut ga, mut gb) = if level_diff_db < 0.0 {", "audio::abx::tests::esitleme_yalnizca"),
    (AB, "    if top > PEAK_LIMIT {", "    if top < PEAK_LIMIT {", "audio::abx::tests::esitlemeden_sonra"),
    (AB, "        gb *= PEAK_LIMIT / top;", "        gb /= PEAK_LIMIT / top;", "audio::abx::tests::esitlemeden_sonra"),
    # lyrics_text
    (LT, "                    ('S', '\\u{327}') => Some('Ş'),\n", "", "analysis::lyrics_text::tests::ayrisik_harflerin"),
    (LT, "                '\\u{2028}' | '\\u{2029}' => out.push('\\n'),\n", "", "analysis::lyrics_text::tests::ayrisik_harflerin"),
    (LT, "                'I' => \"ı\".to_string(),\n                'İ' => \"i\".to_string(),\n", "                'I' => \"ı\".to_string(),\n", "analysis::lyrics_text::tests::dile_gore"),
    (LT, "            english_number(n / scale, out);\n            out.push(word.into());\n            n %= scale;", "            english_number(n / scale, out);\n            out.push(word.into());\n            n /= scale;", "analysis::lyrics_text::tests::ingilizce_sayi"),
    (LT, "        r if r < 10 => {", "        r if r <= 10 => {", "analysis::lyrics_text::tests::ingilizce_sayi"),
    (LT, "                    ('.', Language::English) => out.push(\"point\".into()),\n", "", "analysis::lyrics_text::tests::ondalik"),
    (LT, "if groups[1].starts_with('0') && language == Language::Turkish {", "if groups[1].starts_with('0') || language == Language::Turkish {", "analysis::lyrics_text::tests::ondalik"),
    # gapless
    (GL, "            b\"meta\" => walk(body.get(4..).unwrap_or_default(), info, depth + 1),\n", "", "audio::gapless::tests::itunsmpb_dosyadan"),
    (GL, "    (name.as_deref() == Some(wanted)).then_some(value).flatten()", "    (name.as_deref() != Some(wanted)).then_some(value).flatten()", "audio::gapless::tests::itunsmpb_dosyadan"),
    (GL, "        let at = 8 + i * entry;", "        let at = 8 + i / entry;", "audio::gapless::tests::duzenleme_listesinin_bos"),
    (GL, "    (delay > 0 || frames.is_some()).then_some(Trim { delay, frames })", "    (delay > 0 && frames.is_some()).then_some(Trim { delay, frames })", "audio::gapless::tests::duzenleme_listesinin_bos"),
    (GL, "    if depth > 8 {\n        return;\n    }\n    let mut offset = 0usize;\n    // Bir", "    if depth >= 8 {\n        return;\n    }\n    let mut offset = 0usize;\n    // Bir", "audio::gapless::tests::cok_derin"),
    # ritim paketi (bu oturumun kodu): aksak oranı, ızgara süzgeci
    (SP, ".filter(|a| a.beat_grid().bpm >= NET_AKSAK_MIN_TEMPO_RATIO * grid.bpm)", ".filter(|a| a.beat_grid().bpm >= 0.0 * grid.bpm)", "analysis::spectrogram::tests::model_varken_aksak"),
    (NR, "let bpm = super::evaluate::interval_bpm(&self.beats)?;", "let bpm = (600.0 / median_interval(&self.beats)?).round() / 10.0;", "analysis::net_rhythm::tests::fazladan_sik"),
]

current = None


def restore(*_):
    if current:
        current[0].write_text(current[1], encoding="utf-8")
    sys.exit(1)


signal.signal(signal.SIGINT, restore)
signal.signal(signal.SIGTERM, restore)
start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
for path, old, new, filt in TARGETS[start:]:
    p = pathlib.Path(path)
    text = p.read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"BULUNAMADI\t{path}\t{old[:60]!r}", flush=True)
        continue
    current = (p, text)
    p.write_text(text.replace(old, new), encoding="utf-8")
    r = subprocess.run(["cargo", "test", "-q", "--lib", filt], capture_output=True, text=True)
    p.write_text(text, encoding="utf-8")
    current = None
    print(f"{'yakalandı' if r.returncode != 0 else 'KAÇTI'}\t{path}\t{filt}\t{old.strip()[:50]!r}", flush=True)
