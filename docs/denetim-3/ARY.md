# Arayüz, kullanıcı deneyimi, erişilebilirlik, komut sözleşmesi, kalıcılık ve dosya içe/dışa aktarma — Bağımsız denetim raporu (Faz 3, Denetim 2)

Denetçi: arayüz / sözleşme / kalıcılık (önek `ARY`). Kaynak: main @ 5805853. Tarih: 22 Ekim 2026.

Kanıt klasörü: `docs/denetim-3/hesap/ARY/`
(aşağıda kısaca `hesap/ARY/`).

---

## 1. Kapsam ve yöntem

**Okunan dosyalar (satır sayısı, 5805853):** `src/components/ParametricEq.tsx` (571), `CrossfeedStrip.tsx` (195),
`EqualizerPanel.tsx` (539, Faz 3 ile değişen görünüm sekmeleri ve şeritler), `src/hooks/useParametric.ts` (181),
`useCrossfeed.ts` (103), `useHeadphone.ts` (77), `useEqualizer.ts` (188), `src/lib/parametric.ts` (283),
`src/lib/crossfeed.ts` (139), `src/lib/backend.ts` (598; Faz 3 sarmalayıcıları), `src/lib/bindings/` (Parametric*,
Crossfeed*, Headphone*, DesignMethod, FilterKind), `src/styles/global.css` (ilgili kurallar), `src-tauri/src/commands.rs`
(954; kulaklık, parametrik, crossfeed komutları), `src-tauri/src/lib.rs` (188), `src-tauri/src/settings.rs` (299),
`src-tauri/src/audio/peq.rs` (1786; okuyucu `parse`/`parse_filter`, yazıcı `to_apo`, `ParametricState`),
`scripts/check-commands.mjs` (128), ilgili testler (`components.test.tsx`, `lib/parametric.test.ts`,
`lib/crossfeed.test.ts`, `peq.rs`/`settings.rs`/`commands.rs` testleri). Belgeler: `docs/MIMARI.md`,
`docs/DOGRULAMA.md`, `docs/ROADMAP.md`.

**Standartlar:** WCAG 2.2 AA (1.4.3, 1.4.11, 2.1.1, 2.4.3, 2.4.7, 2.5.3, 2.5.7, 2.5.8, 4.1.2, 4.1.3), WAI-ARIA APG
(slider, switch, tabs), Equalizer APO yapılandırma biçimi (`Preamp:`, `Filter:`, `Channel:`, `Include:`, `BW Oct`),
AutoEq `ParametricEQ.txt`, RBJ Audio EQ Cookbook (BW tanımı).

**Kanıt yöntemi.** Kritik/Yüksek/Orta her bulgu için çalışma ağacında kırmızı yanan test ya da çıktısı alıntılanan
hesap betiği yazıldı:

| Kanıt                              | Dosya                                                                                                             | Çalıştırma                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Rust kanıt testleri (12 + 1 döküm) | `hesap/ARY/rust-kanit-testleri.diff` (`peq.rs`, `settings.rs`, `commands.rs` sonlarına eklenen `mod ary_denetim`) | `cd src-tauri && cargo test --lib ary_ -- --nocapture --test-threads=1` → `hesap/ARY/cargo-ary.txt` |
| Vitest kanıt testleri (9)          | `hesap/ARY/ary-denetim.test.tsx.txt` (`src/components/` altına)                                                   | `npm test -- src/components/ary-denetim.test.tsx.txt` → `hesap/ARY/vitest-ary.txt`                  |
| Kontrast hesabı                    | `hesap/ARY/kontrast.py`                                                                                           | `python3 -I kontrast.py` → `kontrast.txt`                                                           |
| BW Oct yorumu                      | `hesap/ARY/bw_oct.py`                                                                                             | `python3 -I bw_oct.py` → `bw_oct.txt`                                                               |
| Komut sözleşmesi mutasyonları      | `hesap/ARY/check-commands-mutasyon.mjs.txt`                                                                       | `node check-commands-mutasyon.mjs.txt <çalışma ağacı>` → `check-commands-mutasyon.txt`              |

**Projenin kendi denetimleri (çalışma ağacında, 5805853):**

| Komut                                                            | Sonuç                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                   | temiz (çıkış 0)                                                                                                         |
| `npm run typecheck`                                              | temiz (çıkış 0)                                                                                                         |
| `npm run format:check`                                           | "All matched files use Prettier code style!" (çıkış 0)                                                                  |
| `npm run check:commands`                                         | "Komut sözleşmesi tamam: 53 komut, arayüzde 53 çağrı" (çıkış 0)                                                         |
| `npm test` (tam süit, makine yükü ~28/4 çekirdek)                | **11 başarısız / 298 geçti** — hepsi `components.test.tsx` içinde "Test timed out in 5000ms" (`hesap/ARY/npm-test.txt`) |
| `npx vitest run src/components/components.test.tsx` (tek başına) | **87/87 geçti** (parametrik testleri 1,1–1,4 s; `vitest-components-yalniz.txt`)                                         |

Yani mevcut testlerin kendisi yeşildir; tam süitteki 11 hata yükten kaynaklanan zaman aşımıdır (bkz. ARY-17).

---

## 2. Genel değerlendirme

**Puan: 6,5/10.**

- **En güçlü yan:** İstek sıralaması ve dosya okuyucunun dayanıklılığı. Hızlı sürüklemede çekirdeğe aynı anda tek
  istek gidiyor, en son ayar kazanıyor ve ara sonuçlar gösterilmiyor (yeşil test `ARY-sıra`). 20 000 rastgele
  dosyalık bulanık denemede okuyucu bir kez bile panik yapmadı, hiçbir değer sınır dışı kalmadı ve
  kaydet → yükle → kaydet döngüsü her açık filtrede sabit (2887/2887).
- **En zayıf yan:** Kalıcılık ve dosya biçiminin kenar durumları. Tek bir bozuk bant bütün parametrik ayarı siliyor
  (yedek de tutulmuyor). Ekolayzer kapalıyken kaydedilen dosya Lyraska'ya geri yüklenemiyor. Equalizer APO'nun
  `Channel:` bölümleri birleştirilip iki kanala birden uygulanıyor.
- **Bir numaralı risk:** Kullanıcının emek verdiği ayarın (parametrik EQ ya da kulaklık profili) sessizce ve geri
  dönüşsüz kaybolması. Ulaşma yolları: elle düzenleme, sürüm düşürme, gelecekteki bir sürümün eklediği bir tür,
  açılışta yükleme bitmeden dokunma.

Kritik bulgu yok. Ürünün temel vaadini bozan ya da işitmeye zarar veren bir arayüz hatası bulunmadı.

---

## 3. Bulgular (önem sırasıyla)

### [ARY-01] Ayar dosyasında tek bir bozuk bant/filtre, parametrik EQ'nun ya da kulaklık profilinin tamamını siliyor; yedek tutulmuyor

- **Önem:** Orta (veri kaybı; ulaşma yolu dar) | **Güven:** kesin (testle kanıtlandı)
- **Yer:** `src-tauri/src/settings.rs:127-149` (alan başına `field()`), `peq.rs:578-590` (`ParametricBand` için
  `#[serde(default)]` yok), `peq.rs:75-95` (`FilterKind` bilinmeyen değeri reddeder)
- **Kanıt:** Kod alan alan okuyor (`parametric: field(&value, "parametric")`), ama bir alanın içindeki tek bir hata
  bütün alanı varsayılana döndürüyor. Yedek (`.bozuk`) yalnızca dosya hiç JSON değilse alınıyor (`settings.rs:112-114`).
  - `settings::ary_denetim::ary_tek_bant_bozuksa_parametrik_ayarin_tamami_gider`: 7 bantlı ayarın 7. bandının türü
    `"tilt"`.
    ```
    okunan parametrik: 5 bant, ilk bant LowShelf 105 Hz 0 dB, tasarım Matched
    diskte 6000 Hz'lik bant duruyor mu: false; .bozuk yedeği var mı: false
    panicked: tanınan 6 bant da kayboldu (bant başına değil alan başına geri dönüş)
    ```
  - `ary_tek_filtre_bozuksa_kulaklik_profili_gider`: üç filtreden birinin `q`'su `null`. Sonuç:
    `kulaklık: açık=false profil=None`.
- **Kullanıcıya ulaşma yolu:** (a) İleride eklenecek bir süzgeç türüyle kaydedilmiş ayarın eski sürümle açılması.
  (b) Elle düzenleme ya da yarım kalan bir eşitleme (OneDrive gibi bulut eşitlemesi, `%APPDATA%` gezici klasörde).
  (c) Bkz. ARY-16: 0.0.52'ye dönmek. Kullanıcı herhangi bir ayara dokunduğu anda varsayılan diske yazılır ve eski
  bantlar geri gelmez.
- **Etki:** Kullanıcının elle kurduğu 20 banda kadar EQ ya da kulaklık profili, bir uyarı bile görmeden kaybolur.
  Uyarı yalnızca günlüğe yazılır.
- **Önerilen düzeltme:** `ParametricSettings` ve `HeadphoneProfile` için bant/filtre başına hoşgörülü okuma
  (`Vec<serde_json::Value>` okunur, her öğe ayrı çözülür, bozuk olan atlanır). Bir alan düştüğünde dosyanın o anki
  hâlini `settings.json.bozuk-<alan>` olarak yedekle. Kilit testi: yukarıdaki iki test yeşile dönmeli
  (6 bant korunur, profil korunur).

### [ARY-02] `parametric_set` oynatıcı kilidini ayar dosyası diske işlenirken (fsync) ve eğriler hesaplanırken de tutuyor

- **Önem:** Orta | **Güven:** kesin (ölçüldü; etkinin büyüklüğü diske bağlı)
- **Yer:** `src-tauri/src/commands.rs:529-540`
  ```rust
  fn apply_parametric(...) -> Result<ParametricState, String> {
      let mut player = player.lock()?;            // kilit fonksiyon sonuna kadar tutulur
      let applied = player.set_parametric(settings);
      store.update(|s| s.parametric = applied.clone())   // fsync (settings.rs:164)
          ...;
      Ok(ParametricState::new(applied, player.parametric_comparing()))  // 241 nokta × bant
  }
  ```
  Karşılaştırma: `equalizer_set` (`commands.rs:310-318`) ve `crossfeed_set` (`550-559`), kaydetmeden önce kilidi
  bırakıyor (`player.lock()?.set_…` geçici kilit). Her ekran karesinde çağrılan `visual_frame` (`commands.rs:229`) de
  aynı kilidi istiyor.
- **Kanıt:** `commands::ary_denetim::ary_parametrik_kilit_dokumu` (20 bant; optimize test derlemesi, Linux,
  `/tmp`):
  ```
  adım  1: set_parametric 909µs, kaydetme 5.70ms, ParametricState::new 1.65ms, apply_parametric (tamamı, kilit altında) 10.87ms
  adım  2: ... apply_parametric 16.47ms
  adım 11: ... kaydetme 4.53ms ... apply_parametric 27.23ms
  ```
  `ary_parametrik_kayit_oynatici_kilidini_tutar` üç kez çalıştırıldı. Kilidin tutulduğu en uzun süre 18–34 ms
  (60 fps'te bir kare 16,7 ms). Aynı testte `visual_frame` benzeri iş parçacığı 200–270 ms bekledi. Bu bekleme,
  testin istekleri arka arkaya göndermesi ve `std::sync::Mutex`'in adil olmaması yüzünden abartılıdır; gerçek
  arayüzde istekler arasında bir IPC gidiş-dönüşü vardır. İlk, yük altındaki çalıştırmada kilit 570 ms tutuldu
  (disk çekişmesi).
- **Kullanıcıya ulaşma yolu:** Çalarken parametrik EQ'da bir düğümü sürüklemek. Her `pointermove` çekirdeğe bir
  `parametric_set` gönderir; her biri diske fsync yapar. Windows'ta (NTFS, Defender taraması, OneDrive'daki
  `%APPDATA%`) fsync çoğu zaman Linux tmp'den yavaştır.
- **Etki:** Sürükleme sürerken görseller (60 fps) kare atlar. Kilit, oynatıcının başka komutlarını
  (`playback_status`, `toggle_playback`) da bekletir. Ses iş parçacığı etkilenmez (kilitsiz kanal).
- **Önerilen düzeltme:** `equalizer_set` düzenine uy: `let applied = player.lock()?.set_parametric(settings);`
  ifadesinden sonra kilidi bırak, `parametric_comparing()` değerini de o kilit içinde oku; sonra kilit dışında
  `store.update` ve `ParametricState::new` çalıştır. Kilit testi: `ary_parametrik_kilit_dokumu` benzeri bir test,
  kilidin `store.update` sırasında tutulmadığını doğrular (ör. `store` güncellemesi sırasında başka bir iş
  parçacığı kilidi 1 ms içinde alabilmeli).

### [ARY-03] "Equalizer APO ile aynı" tasarımda ekranda çizilen eğri, duyulan eğriden 3 dB'ye kadar sapıyor; belgeler farklı şey söylüyor

- **Önem:** Orta (ölçülebilir sapma + sayısal belge–kod uyumsuzluğu) | **Güven:** kesin
- **Yer:** `peq.rs:65` (`const ANALYSIS_RATE: f64 = 96_000.0;`), `peq.rs:821-835` (`response_curve`, ekran eğrisi
  96 kHz'te). Ses yolu çalan hızda tasarlanır (`PeqProcessor::new(..., sample_rate)`). Belgeler:
  `peq.rs:32` "Arayüzün çizdiği eğri 48 kHz'e göredir", `docs/MIMARI.md:58` "(çizilen eğri duyulan eğridir)",
  `ParametricEq.tsx:192` "Çizilen eğri, çekirdeğin hesapladığı gerçek sayısal eğridir".
- **Kanıt:** `audio::peq::ary_denetim::ary_ekrandaki_egri_duyulan_egri` (241 nokta, 20 Hz – 20 kHz):
  ```
  Rbj   44100 Hz  PK 16 kHz +6 dB Q 2   en büyük fark 3.00 dB @ 18346 Hz (ekranda +4.05, duyulan +1.05)
  Rbj   48000 Hz  PK 16 kHz +6 dB Q 2   en büyük fark 2.37 dB @ 18346 Hz
  Rbj   44100 Hz  PK 12 kHz −8 dB Q 4   en büyük fark 1.79 dB @ 13367 Hz (ekranda -4.10, duyulan -2.31)
  Rbj   44100 Hz  AutoEq benzeri         en büyük fark 0.18 dB
  Matched (dört durumun hepsi)          en büyük fark ≤ 0.51 dB
  Kulaklık PK 16 kHz +6 Q2: ekranda (48 kHz) – duyulan (44,1 kHz) en büyük fark 0.73 dB
  ```
  Varsayılan "Analog eğriye sadık" tasarımda iddia büyük ölçüde doğru (≤ 0,5 dB). "Equalizer APO ile aynı" (RBJ)
  seçildiğinde ise 10 kHz üstündeki bantlarda ekran 96 kHz'in eğrisini, kulak 44,1/48 kHz'inkini görüyor.
- **Kullanıcıya ulaşma yolu:** AutoEq/REW dosyası yüklemek (içe aktarma tasarımı otomatik olarak RBJ yapar,
  `peq.rs:714-733`) ya da "Equalizer APO ile aynı" düğmesine basmak; ardından 12 kHz üstünde bir bant kullanmak.
- **Etki:** Kullanıcı tizde görmediği bir ayarı duyar; ekran "+4 dB" gösterirken duyulan +1 dB'dir.
- **Önerilen düzeltme:** `ParametricState::new`'e çalan aygıtın hızını geçir (oynatıcıda `output.sample_rate`
  var; çalmıyorken 48 kHz) ve eğriyi o hızda çiz. Ya da en azından RBJ'de 44,1 kHz'te çiz ve belgeleri düzelt
  (`peq.rs:32` 48 → 96 kHz). Kilit testi: `ary_ekrandaki_egri_duyulan_egri` RBJ için < 0,5 dB.

### [ARY-04] Kapalı ekolayzer dışa aktarılınca dosya geri yüklenemiyor; kapalı bantlar ve tasarım yöntemi gidiş-dönüşte kayboluyor

- **Önem:** Orta | **Güven:** kesin
- **Yer:** `peq.rs:746-750` (`to_apo`: ana anahtar kapalıysa bütün bantlar `OFF` yazılır), `peq.rs:310-312`
  (`parse`: `OFF` filtreler atlanır), `peq.rs:330-332` (`filters.is_empty()` → `ProfileError::Empty`),
  `peq.rs:714-733` (`from_profile` tasarımı her zaman `Rbj` yapar)
- **Kanıt:**
  - `ary_kapali_ekolayzer_kaydedilip_geri_yuklenir`:
    ```
    Preamp: -4.00 dB
    Filter 1: OFF LSC Fc 105.00 Hz Gain 0.00 dB Q 0.7071
    Filter 2: OFF PK Fc 250.00 Hz Gain 4.00 dB Q 1.0000
    ...
    geri okuma: Err(Empty)
    ```
    Kullanıcı şu hatayı görür: "Dosyada kulaklık düzeltmesi bulunamadı. AutoEq'ten "ParametricEQ.txt" … seçin."
  - `ary_gidis_donus_kayipsiz`: `önce: 5 bant, tasarım Matched; sonra: 4 bant, tasarım Rbj`.
- **Kullanıcıya ulaşma yolu:** Ekolayzeri kapatıp (ana anahtar) "Dosyaya kaydet", sonra "Dosyadan yükle". Ya da
  bir bandı geçici kapatıp kaydetmek. Equalizer APO'nun kendisi `OFF` satırlarını korur.
- **Etki:** Kullanıcının kendi yedeği Lyraska'ya geri yüklenemiyor ya da eksik yükleniyor. Hata metni
  yanıltıcı (bkz. ARY-15).
- **Önerilen düzeltme:** Ana anahtarın durumunu filtrelerin `ON/OFF` alanına karıştırma (ör. bir yorum satırıyla
  `# Lyraska: kapalı` yaz). İçe aktarmada `OFF` filtreleri `enabled: false` bant olarak al (yalnız kulaklık profili
  okurken atla). Lyraska'nın yazdığı dosyada tasarımı bir yorum satırından (`# Lyraska tasarım: matched`) geri
  oku. Kilit testi: iki test yeşil.

### [ARY-05] Equalizer APO komutları: `Channel:` bölümleri birleştiriliyor, birden fazla `Preamp:` toplanmıyor

- **Önem:** Orta | **Güven:** kesin (Lyraska davranışı testle) / yüksek (APO anlamı: `Channel:` sonraki filtreleri
  yalnız o kanala uygular, `Preamp:` satırları zincirde art arda uygulanır)
- **Yer:** `peq.rs:299-302`
  ```rust
  if !lower.starts_with("filter") {
      // Equalizer APO'nun başka komutları (Device:, Include: vb.) yok sayılır.
      continue;
  }
  ```
  ve `peq.rs:294-297` (her `Preamp:` satırı öncekini ezer).
- **Kanıt:**
  - `ary_channel_bolumleri`: `Channel: L` altında `PK 1000 Hz +6 dB`, `Channel: R` altında aynısı →
    `filtre sayısı 2, 1 kHz'te uygulanan kazanç 12.00 dB (Equalizer APO: her kanalda 6 dB)`.
  - `ary_birden_fazla_preamp`: `Preamp: -4 dB` iki kez → `ön kazanç -4 dB (Equalizer APO: −8 dB)`.
- **Kullanıcıya ulaşma yolu:** Equalizer APO'nun `config.txt`'si ya da Peace'in kaydettiği, kanal başına
  düzeltme içeren bir dosyayı "Dosyadan yükle" ya da "Profil yükle" ile açmak. `DOGRULAMA.md` C4 "Equalizer APO'da
  nasıl duyuluyorsa Lyraska'da da öyle duyulmalı" diyor. AutoEq dosyalarında `Channel:` yoktur; bu yüzden önem
  Orta.
- **Etki:** Kanal başına düzeltme iki kanala da iki kat uygulanır (+12 dB yerine +6). Taşma koruması sesi kısar
  ama ton dengesi yanlıştır. Kullanıcı bunu bilmez.
- **Önerilen düzeltme:** `Channel:` (ve `Device:`, `Include:`, `Stage:`) satırı görülünce ya açık bir hata ver
  ("Kanal/aygıt bölümlü dosyalar desteklenmiyor") ya da yalnız `Channel: all` / bölümsüz filtreleri al. `Preamp:`
  değerlerini topla. Kilit testi: iki test yeşil.

### [ARY-06] Türkçe binlik noktası: "2.500" yazılan frekans 2,5 Hz okunup sessizce 10 Hz'e çekiliyor

- **Önem:** Orta | **Güven:** kesin
- **Yer:** `src/lib/parametric.ts:118-123`
  ```ts
  const cleaned = text.trim().toLowerCase().replace(/\s|hz/g, "").replace(",", ".");
  ```
  "2.500" → `Number("2.500")` = 2,5 → `roundHz` → 10 Hz (`PEQ_FREQ_MIN`).
- **Kanıt:** Vitest `ARY-yerel`: Frekans kutusuna `2.500` + Enter → `expected 10 to be 2500`.
- **Kullanıcıya ulaşma yolu:** Türkçede binler noktayla yazılır ("1.000 Hz", "2.500 Hz"). Program da sayıları
  Türkçe gösteriyor (virgüllü ondalık), bu yüzden kullanıcı noktayı binlik ayırıcı sanar.
- **Etki:** Bant, girilen kazançla (±24 dB'ye kadar) 10 Hz'e gider: ses altı bas yükselir, istenen frekans
  değişmez. Uyarı gösterilmez.
- **Önerilen düzeltme:** Hem nokta hem virgül varsa ya da noktadan sonra tam üç rakam varsa noktayı binlik ayırıcı
  say (`/^\d{1,3}(\.\d{3})+(,\d+)?$/`). Belirsiz girdide kutuyu kırmızıya boya, değeri sessizce kırpma. Kilit testi:
  `ARY-yerel` yeşil; "2,5k", "2.5k", "1.000", "1.000,5" durumları.

### [ARY-07] Hata ve durum mesajları ekran okuyucuya duyurulmuyor (WCAG 4.1.3)

- **Önem:** Orta | **Güven:** kesin
- **Yer:** `ParametricEq.tsx:414` (`{error && <p className="library__notice library__problem">{error}</p>}`),
  `CrossfeedStrip.tsx:192`, `EqualizerPanel.tsx:217-219` (kulaklık hatası), `ParametricEq.tsx:386-390` (bit-perfect
  uyarısı). Hiçbirinde `role="alert"`, `role="status"` ya da `aria-live` yok. Projenin başka yerleri bunu yapıyor
  (`LibraryPanel.tsx:187,199`, `NowPlaying.tsx:80`).
- **Kanıt:** Vitest `ARY-duyuru`: içe aktarma `'3. satır okunamadı: …'` hatasıyla reddedilince metin ekranda
  görünüyor, ama `message.closest('[role="alert"],[role="status"],[aria-live]')` → `null`.
- **Kullanıcıya ulaşma yolu:** Ekran okuyucu kullanan biri bozuk bir ParametricEQ.txt yüklemeyi dener.
- **Etki:** Yükleme başarısız olur ve kullanıcı bunu hiç duymaz; düğme sessizce eski hâline döner.
- **Önerilen düzeltme:** Hata paragraflarına `role="alert"`, bit-perfect uyarısına `role="status"`. Kilit testi:
  `ARY-duyuru` yeşil.

### [ARY-08] Renk kontrastı: parametrik grafiğin dB ölçeği, bant eğrileri ve A/B'deki eğri AA'nın altında

- **Önem:** Orta | **Güven:** kesin (hesapla; zemin varsayımı aşağıda)
- **Yer:** `global.css:2685` (`.eq__scale span { color: #4d575e }`, 10 px), `global.css:3470`
  (`.peq__band-line { stroke: rgba(124, 92, 255, 0.45) }`), `global.css:3487` (`.peq__board.is-comparing .eq__line
{ stroke: #3a4247 }`), `global.css:2575-2578` (`.xf.is-off` içinde metne `opacity: 0.45`)
- **Kanıt:** `hesap/ARY/kontrast.py`. Zemin: `--glass-strong` rgba(9,12,20,0,8), altında en karanlık sahne pikseli
  `#02040b` (en iyi durum):
  ```
  KALIR   2.67:1 (gereken 4.5:1)  .eq__scale span #4d575e (parametrik grafiğin dB etiketleri, 10px)
  KALIR   1.78:1 (gereken 3.0:1)  .peq__band-line rgba(124,92,255,.45) (bant eğrisi, 1.4.11)
  KALIR   1.93:1 (gereken 3.0:1)  .peq__board.is-comparing .eq__line #3a4247 (A/B'de eğri)
  KALIR   1.89:1 (gereken 4.5:1)  --text-muted, .xf.is-off içinde opacity .45
  GEÇER   5.03:1                  --text-muted (peq__keys, peq-field__label)
  GEÇER   4.54:1 (gereken 3.0:1)  .peq-node kenarı --violet
  ```
  Kuzey ışığı sahnesinin üstünde (`#46f0a6`) `--text-muted` de 4,15:1'e, düğüm kenarı 2,89:1'e düşüyor.
- **Kullanıcıya ulaşma yolu:** Parametrik görünümü açan her kullanıcı. dB ölçeği grafiğin tek dikey ekseni.
- **Etki:** Az gören kullanıcı kazanç ölçeğini okuyamaz. Seçili olmayan bantların eğrileri neredeyse görünmez.
- **Önerilen düzeltme:** `.eq__scale span` için `var(--text-muted)` (5,0:1). Bant eğrileri için en az
  `rgba(124,92,255,0.85)`. A/B'de gri yerine kesikli `--ink-3` çizgi. Çekmece zeminini sahneden bağımsız yapmak için
  opaklığı 0,8 → 0,9. Kilit: `kontrast.py` tarzı bir Vitest ya da `check:scenes` denetimi.

### [ARY-09] Açılıştaki yükleme bitmeden yapılan ilk dokunuş, kayıtlı parametrik ayarı varsayılanla eziyor

- **Önem:** Düşük (pencere birkaç ms; `getParametric` hata verirse kalıcı) | **Güven:** kesin
- **Yer:** `useParametric.ts:68-82` ve `95-104`. `touched` doğruysa yüklenen ayar atılıyor, ama kullanıcının
  değişikliği `DEFAULT_PARAMETRIC` üzerine kurulmuş olarak gönderiliyor. Aynı düzen `useCrossfeed.ts:41-55` ve
  `useEqualizer.ts:66-87` içinde de var.
- **Kanıt:** Vitest `ARY-yükleme`: kayıtlı 8 bant yüklenirken "+ Bant ekle" → `çekirdeğe giden bant sayısı 6
(kayıtlı 8 bant + 1 bekleniyordu)`.
- **Kullanıcıya ulaşma yolu:** Yavaş açılış (antivirüs) ya da `parametric_get` hatası. İkincisinde arayüz düz beş
  bandı gösterir ve ilk dokunuş kayıtlı ayarın üstüne yazar.
- **Önerilen düzeltme:** Yükleme bitene kadar düzenlemeyi kapat (`loading` durumu) ya da yüklenen ayarı temel alıp
  değişikliği yeniden uygula. `getParametric` hatasında düzenlemeyi kilitle.

### [ARY-10] Erişilebilirlik: bant anahtarının adı durumla çelişiyor, Delete sonrası odak kayboluyor, görünüm sekmeleri ARIA deseninde değil, anahtar adları görünen metni içermiyor

- **Önem:** Düşük | **Güven:** kesin (dördü de testle ya da kodla)
- **Yer ve kanıt:**
  - `ParametricEq.tsx:174`: `aria-label={`Bant ${index + 1} açık`}` sabit. Vitest `ARY-ad`: kapalı bant için ad
    "Bant 1 açık", `aria-checked="false"`. Ekran okuyucu "Bant 1 açık, anahtar, kapalı" diyor (4.1.2, Türkçe olarak
    da çelişkili).
  - `ParametricEq.tsx:320-323`: düğümde Delete son bandı silince odak `document.body`'ye düşüyor (Vitest
    `ARY-odak`, 2.4.3).
  - `EqualizerPanel.tsx:364-384`: `role="tab"` var, ama `aria-controls`/`role="tabpanel"` yok ve ok tuşlarıyla
    gezinme yok (Vitest `ARY-sekme`; APG tabs deseni).
  - 2.5.3 (Etikette ad): Parametrik, crossfeed ve kulaklık anahtarlarının görünen metni "Açık/Kapalı", erişilebilir
    adı ise "Parametrik ekolayzer" vb. Ses komutuyla "Açık'a tıkla" çalışmıyor. A/B düğmesinin adı durumla
    değişiyor ("A/B karşılaştır" ↔ "Karşılaştırma: ekolayzersiz") ve aynı zamanda `aria-pressed` kullanıyor; APG,
    basılı düğmenin adının değişmemesini ister.
- **Önerilen düzeltme:** Adı `Bant ${n}` yap (durum `aria-checked`'te). Silmeden sonra odağı komşu düğüme ya da
  "+ Bant ekle"ye taşı. Sekmelere `id`/`aria-controls`/`tabpanel` ve ←/→ ekle. Anahtarlarda görünür adı
  (`<span>Parametrik ekolayzer</span>`) düğmenin içine al.

### [ARY-11] Sürüklerken grafik ölçeği ±18 dB'den ±24 dB'ye geçince kazanç 0,4 piksellik harekette 5,8 dB sıçrıyor

- **Önem:** Düşük | **Güven:** kesin
- **Yer:** `ParametricEq.tsx:207-210` (`range`, her çizimde eğriden hesaplanıyor) ve `ParametricEq.tsx:281-282`
  (`yToDb(dbToY(start.db, range) + dy, range)`: başlangıç noktası yeni ölçekle yeniden yorumlanıyor)
- **Kanıt:** Vitest `ARY-ölçek`: `imleç y = 11,2 / 9,0 / 8,6 px → kazanç 16.9 / 17.1 / 22.9 dB`.
- **Etki:** 17 dB'nin üstüne ince ayar yapılamıyor; değer bir anda 23 dB'ye atlıyor. Taşma koruması devrede
  olduğu için tehlike yok, ama ses birden kısılır (`boostDb` artar).
- **Önerilen düzeltme:** Sürükleme başında `range` değerini `drag.current` içinde dondur ve bırakınca güncelle.

### [ARY-12] Türü kazançsız bir türe (LP/HP/BP/NO/AP) çevirip geri dönmek bandın kazancını siliyor

- **Önem:** Düşük | **Güven:** kesin
- **Yer:** `peq.rs:649-662` (`sanitized`: kazançsız türde `gain_db = 0.0`), `useParametric.ts:85-86` (çekirdeğin
  cevabı "kanonik" olarak benimseniyor). Arayüzün kendi amacı kazancı korumak (`ParametricEq.tsx:286`
  `: b.gainDb`; `ParametricBand.gain_db` belgesi "yok sayılır" diyor, "sıfırlanır" değil).
- **Kanıt:** Vitest `ARY-tür` (çekirdeğin `sanitized` işleminin aynısıyla): PK +6 dB → LP → PK →
  `gainDb: 0`.
- **Önerilen düzeltme:** `sanitized` kazançsız türde `gain_db`'yi olduğu gibi bıraksın (zaten `PeqFilter::spec`
  `0.0` kullanıyor, `peq.rs:171-183`).

### [ARY-13] `check:commands` argüman türlerini denetlemiyor; `typecheck` de yakalamıyor

- **Önem:** Düşük | **Güven:** kesin
- **Yer:** `scripts/check-commands.mjs:79-90` (yalnızca anahtar adları). `invoke` argümanları
  `InvokeArgs = Record<string, unknown>` (`@tauri-apps/api/core.d.ts:268`).
- **Kanıt:** `hesap/ARY/check-commands-mutasyon.txt`:
  ```
  check:commands GEÇTİ, typecheck GEÇTİ  M1 arayüz boolean yerine metin gönderir: { compare } → { compare: String(compare) }
  check:commands YAKALADI, typecheck GEÇTİ  M3 arayüzde argüman adı yanlış: { path } → { pth: path }
  ```
  Faz 3'ün bütün komutları kapsamda; adlar doğru denetleniyor. Başarı mesajı ise "adlar ve argümanlar eşleşiyor"
  diyor ve türleri denetlediği izlenimi veriyor. `MIMARI.md:240,293` de aynı.
- **Önerilen düzeltme:** Sarmalayıcılarda argüman nesnesine `satisfies { compare: boolean }` gibi bir tür kısıtı
  koy ya da `ts-rs` ile komut argümanlarını da üret. Betiğin mesajını "adlar eşleşiyor" diye düzelt.

### [ARY-14] "BW Oct" ile yazılmış filtreler 8 kHz üstünde Equalizer APO'dan farklı duyuluyor

- **Önem:** Düşük | **Güven:** yüksek (APO'nun RBJ BW tanımını kullandığını kodun kendi yorumu söylüyor,
  `peq.rs:451-452`)
- **Kanıt:** `hesap/ARY/bw_oct.txt` (PK +6 dB):
  ```
   44100  10000  1.0  Q 1.414 (Lyraska)  eşdeğer Q 0.961 (APO)  1.10 dB
   44100  14000  2.0  Q 0.667            eşdeğer Q 0.231        2.83 dB
   48000   8000  1.0  Q 1.414            eşdeğer Q 1.159        0.57 dB
  ```
  Bu, `DOGRULAMA.md:232-234`'teki "Equalizer APO'da nasıl duyuluyorsa Lyraska'da da öyle" sözüyle çelişiyor.
  AutoEq dosyaları Q kullandığı için etki dar.
- **Önerilen düzeltme:** Bant genişliğini banda sakla (`bw_oct: Option<f64>`) ve tasarımda çalan hızla RBJ BW
  formülünü uygula. Ya da DOGRULAMA'yı düzelt.

### [ARY-15] Dosya içe aktarmada küçük sağlamlık ve metin sorunları

- **Önem:** Düşük | **Güven:** kesin
- (a) **UTF-16 dosya** (Not Defteri'nin "Unicode" kaydı) → `Dosya okunamadı: stream did not contain valid UTF-8`
  (`ary_utf16_dosya`). Kullanıcı Türkçe olmayan bir metin görür; UTF-16 çözülmüyor.
- (b) **Boyut sınırı yok:** `commands.rs:516` ve `425`: `std::fs::read_to_string` bütün dosyayı belleğe alır.
  Dosya penceresindeki `.txt` süzgeci zorunlu değil, kullanıcı "Tüm dosyalar"dan çok büyük bir dosya seçebilir.
- (c) **Anlamsız değerler sessizce kabul ediliyor** (`ary_anlamsiz_degerler_sessizce_kabul`): `Fc -1000` → 10 Hz,
  `Gain 1e308` → 24 dB, `Q 0` ve `Q -5` → 0,1. Hata vermek yerine kırpıyor (güvenli, ama kullanıcı bunu bilmez).
- (d) Parametrik EQ'ya içe aktarmada da hata metni "Dosyada **kulaklık düzeltmesi** bulunamadı. AutoEq'ten
  ParametricEQ.txt seçin" (`peq.rs:256-257`). GraphicEQ.txt yüklenince de aynı metin çıkıyor.
- **Olumlu:** BOM, CRLF, virgüllü ondalık ("5,5"), `NaN`/`inf` (satır hatası), 21+ filtre (anlaşılır hata) doğru
  işleniyor. 20 000 rastgele girdide panik yok (`ary_bulanik_okuma_ve_gidis_donus`:
  `okunan 2887, reddedilen 17113, gidiş-dönüşte sabit 2887/2887; panik yok`).
- **Önerilen düzeltme:** BOM'a bakıp UTF-16 LE/BE'yi çöz, 1 MB üstünü reddet, hata metnini bağlama göre seç,
  kırpılan değerleri kullanıcıya bildir.

### [ARY-16] Sürüm düşürmede (0.0.52) kulaklık profili, crossfeed ve parametrik ayar kalıcı olarak kayboluyor

- **Önem:** Düşük (test bağlantısı hep en yeni sürümü veriyor) | **Güven:** kesin (0.0.52'nin yapıları birebir
  kopyalanarak benzetildi)
- **Kanıt:** `settings::ary_denetim::ary_surum_dusurme_ve_geri_yukseltme`. 0.0.52'nin `FilterKind`'ı yalnızca 3 tür
  tanıyor (`git show 9dc0b82:src-tauri/src/audio/peq.rs:61-68`):
  ```
  eski program okudu: kulaklık profili YOK          (profilde HP filtresi var)
  geri yükseltmede: crossfeed açık=false, parametrik bant 3 = 0 dB, kulaklık profili YOK
  ```
  Eski program bilmediği alanları (`parametric`, `crossfeed`) yazarken düşürüyor.
- **Önerilen düzeltme:** `Settings`'e `#[serde(flatten)] extra: serde_json::Map<…>` ekle (bilinmeyen alanlar
  korunur). Bu yalnızca bundan sonraki sürüm düşürmelerini korur. Kalıcılık tablosuna (`MIMARI.md:204`) "sürüm
  düşürmede …" satırı ekle.

### [ARY-17] Bileşen testleri yük altında 5 s zaman aşımına uğruyor (tam süitte 11 kırmızı)

- **Önem:** Düşük (CI kararsızlığı) | **Güven:** kesin
- **Kanıt:** `npm-test.txt`: 11 "Test timed out in 5000ms"; tek başına 87/87 (her test `render(<App />)` ile tüm
  uygulamayı çiziyor, tek başına 1,1–1,4 s).
- **Önerilen düzeltme:** Faz 3 testlerini bileşen düzeyine indir (bu denetimdeki `Harness` gibi) ya da bu dosyaya
  `testTimeout: 15000` ver.

### [ARY-18] `var(--glass)` tanımsız: parametrik ve grafik EQ panosunun zemini düşüyor

- **Önem:** Düşük | **Güven:** kesin (kodla)
- **Yer:** `global.css:2671` ve `3458` `background: radial-gradient(…), var(--glass);`. `:root`'ta yalnızca
  `--glass-fill`, `--glass-strong`, `--glass-edge`, `--glass-blur` var (`global.css:29-32`). Tanımsız değişken,
  bütün `background` bildirimini hesaplama anında geçersiz yapar ve pano saydam kalır.
- **Önerilen düzeltme:** `var(--glass-fill)`. ARY-08'deki kontrast hesabı bu saydam zemini varsaydı.

---

## 4. Şüpheler (kanıtlanamayanlar, güven "olası")

- **A/B ile ayar isteğinin çekirdekte yer değiştirmesi:** `useParametric.ts:120-128` karşılaştırma cevabını,
  `inFlight`/`pending` boşsa "kanonik" olarak benimsiyor. Tauri'nin eşzamanlı async görevlerinde
  `parametric_compare` kendinden önce gönderilen bir `parametric_set`'ten önce kilidi alırsa, cevap eski ayarı
  taşır ve arayüz eski ayara döner. Kilit sırası pratikte buna izin vermiyor gibi; tekrar üretilemedi.
- **Sürüklerken eğrinin titremesi:** Sürükleme sırasında analog önizleme, cevap gelince 96 kHz'teki sayısal eğri
  gösteriliyor. RBJ'de tizde ikisi farklı olduğundan eğri sıçrayabilir (ARY-03 ile aynı kök). Görsel olarak
  doğrulanmadı.
- **Düğüm değerinin duyurulması:** Düğümler `button` (2B denetim için uygun bir ARIA rolü yok). Ok tuşuyla değişen
  değer yalnızca `aria-label` içinde. NVDA odaktaki öğenin ad değişimini çoğu zaman okur, JAWS okumayabilir. Gerçek
  ekran okuyucuyla denenmedi.
- **Bit-perfect'te A/B:** Bit-perfect çalarken A/B düğmesi etkin kalıyor ve basılınca hiçbir şey değişmiyor.
  Parametrik görünümdeki uyarı yalnızca parametrik EQ'yu anıyor, kulaklık düzeltmesini anmıyor
  (`ParametricEq.tsx:386-390`).

## 5. Güçlü yanlar (kanıtla)

- **İstek sıralaması doğru:** Vitest `ARY-sıra` (yeşil). 5 hızlı ok tuşunda çekirdeğe yalnızca ilk ve son istek
  gidiyor, ara cevap gösterilmiyor, son cevap ekrana geliyor (`+2,5 dB`).
- **Okuyucu dayanıklı:** 20 000 rastgele girdide panik yok, bütün değerler sınır içinde, eğri sonlu,
  kaydet → yükle → kaydet sabit (`ary_bulanik_okuma_ve_gidis_donus`). `NaN`/`inf` satır hatası veriyor
  (`peq.rs:388-393`).
- **Arayüz ve çekirdeğin sınırları aynı:** `PEQ_LIMITS`/`PEQ_FREQ_*` (`parametric.ts:8-12`) ile `peq.rs:46-50,
571-573` ve `CROSSFEED_LIMITS` ile `crossfeed.rs` `sanitized` bire bir eşleşiyor. Çekirdeğin sınıra çektiği
  değer cevapla ekrana dönüyor (`adopt(..., true)`).
- **Ayar yazımı atomik:** geçici dosya + `sync_all` + yeniden adlandırma (`settings.rs:154-167`), okunamayan
  dosyanın üstüne yazılmıyor (`settings.rs:56-62`).
- **Komut adları ve zorunlu argümanlar gerçekten denetleniyor** (mutasyon M3 yakalandı). Faz 3'ün 11 komutu
  kapsamda.
- **Klavye:** Düğümler ←/→/↑/↓/PageUp/PageDown/Delete/0 ile tam kullanılabiliyor, kısayollar şarkıyı sarmıyor
  (mevcut testler). Sürüklemenin tek işaretçili alternatifi var (sayı kutuları, "+ Bant ekle"; WCAG 2.5.7). Hedef
  boyutları: düğüm 24×24, anahtar 30 px, çip 28 px, sürgü 26 px (2.5.8 sağlanıyor). Odak halkaları belirgin.
- **Lint, tür, biçim ve sözleşme denetimleri temiz.** "Analog eğriye sadık" tasarımda ekran–ses farkı ≤ 0,51 dB
  (ARY-03 tablosu).

## 6. Denetlenemeyenler ve sınırlar

- Gerçek Windows/WebView2 ve gerçek ekran okuyucu (NVDA/JAWS/Anlatıcı) kullanılmadı. Erişilebilirlik bulguları
  jsdom + Testing Library'deki erişilebilir ad ve rol hesabına dayanıyor.
- Equalizer APO çalıştırılamadı. APO anlamları (`Channel:`, `Preamp:` toplamı, BW tanımı) belgeye ve kodun kendi
  yorumlarına göre değerlendirildi (güven "yüksek").
- fsync süreleri Linux'ta, paylaşılan ve yüklü bir makinede ölçüldü. Windows'taki süreler farklı olabilir.
- Kontrast hesabında arkadaki sahne bulanık ve hareketli. Üç uç sahne rengi alındı, bulanıklığın etkisi
  modellenmedi.
- Makine denetim sırasında bir kez yeniden başladı. Derleme önbelleği korunduğu için sonuçlar etkilenmedi.

## 7. Önerilen öncelik sırası

1. **ARY-01** (bant/filtre başına hoşgörülü okuma + alan yedeği) ve **ARY-16**'nın `flatten` koruması: veri kaybı.
2. **ARY-04** ve **ARY-05**: dosya biçimi doğruluğu (kendi dosyasını geri okuyamama, kanal bölümlerinin
   birleştirilmesi).
3. **ARY-02**: kilit kapsamını `equalizer_set` düzenine indir (birkaç satır).
4. **ARY-06** ve **ARY-07**: Türkçe sayı girişi ve hata duyurusu (küçük, kullanıcıya doğrudan dokunuyor).
5. **ARY-03**: eğriyi çalan hızda çiz, belgeleri düzelt.
6. **ARY-08**, **ARY-18**: kontrast ve tanımsız CSS değişkeni.
7. **ARY-09 – ARY-15**, **ARY-17**: düşük öncelikli düzeltmeler ve test sağlamlığı.

Bulgu sayısı: Kritik 0, Yüksek 0, Orta 8 (ARY-01…08), Düşük 10 (ARY-09…18). Şüphe: 4.
