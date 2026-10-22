//! DOĞRULAMA-1: ARY-01 bağımsız kanıt ve ulaşılabilirlik sınaması. Depoya girmez.
use super::*;
use crate::audio::peq::{FilterKind, ParametricBand};
use crate::audio::test_util::temp_path;

#[test]
fn dog1_ary01_bant_basina_degil_alan_basina() {
    // 1) Programın kendi yazdığı dosya: 6 bant.
    let path = temp_path("dog1-ary01.json");
    let store = SettingsStore::open(&path);
    store
        .update(|s| {
            s.parametric.bands.push(ParametricBand {
                kind: FilterKind::Notch,
                freq_hz: 6000.0,
                gain_db: 0.0,
                q: 8.0,
                enabled: true,
            });
            s.parametric.bands[1].gain_db = -3.5;
        })
        .unwrap();
    let text = std::fs::read_to_string(&path).unwrap();
    // 2) Gelecekteki bir sürümün yazdığını benzet: tek bandın türü bu sürümde yok.
    let future = text.replacen("\"notch\"", "\"tilt\"", 1);
    assert_ne!(future, text);
    std::fs::write(&path, &future).unwrap();
    let got = SettingsStore::open(&path).get().parametric;
    println!(
        "bilinmeyen tür: {} bant okundu (yazılan 6), bant 2 kazancı {} dB (yazılan -3.5)",
        got.bands.len(),
        got.bands[1].gain_db
    );
    // 3) Bilinmeyen ek alan (gelecek sürüm bir alan eklerse) zararsız mı?
    let extra = text.replacen("\"enabled\": true", "\"enabled\": true, \"slope\": 2", 1);
    std::fs::write(&path, &extra).unwrap();
    let got2 = SettingsStore::open(&path).get().parametric;
    println!("bilinmeyen ek alan: {} bant okundu", got2.bands.len());

    // 4) Program kendisi bozuk değer yazabilir mi? NaN, sanitized'den geçince kalmıyor mu?
    let nan = ParametricSettings {
        bands: vec![ParametricBand { kind: FilterKind::Peaking, freq_hz: f64::NAN, gain_db: f64::INFINITY, q: f64::NAN, enabled: true }],
        ..ParametricSettings::default()
    }
    .sanitized();
    println!("NaN/∞ girdi sanitized sonrası: {:?}; serde_json NaN'ı şöyle yazar: {}", nan.bands[0], serde_json::to_string(&f64::NAN).unwrap());
}
