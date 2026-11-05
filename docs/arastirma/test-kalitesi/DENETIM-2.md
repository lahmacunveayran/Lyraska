# Lyraska otomatik testlerinin bağımsız denetimi (2)

Tarih: 5 Kasım 2026. Denetlenen: `D:\Lyraska`, dal `claude/bit-perfect-ses`, commit `0665069`.
Denetçi önceki denetimin sonuçlarını görmedi; depodaki `docs/DENETIM*.md` belgelerine dayanılmadı.
Depoda hiçbir dosya değiştirilmedi (denetim sonunda `git status` temiz; bkz. Ek B).

---

## 1. Genel hüküm

**Testler "geçsin diye, öylesine" yazılmamış.** Kanıta göre bu test takımı ortalamanın belirgin
üstünde: çekirdek ses hesaplarının çoğu standart sayılara, bağımsız başvuru hesaplarına ya da elle
türetilebilen değerlere bağlı; testlerin hemen hepsi gerçek bir şey doğruluyor; geçmişte eşikler
gerekçesiz gevşetilmemiş. Zayıflıklar yerel ve düzeltilebilir: birkaç önemli süzgeç parametresi
(Q) hiçbir testte bağımsız olarak sabitlenmemiş, bir standart durumu (5.0 kanal) hiç sınanmamış ve
bu boşlukta gerçek bir hata duruyor, bazı toleranslar gerekenden birkaç kat geniş ve duvar saatine
bağlı birkaç TS testi meşgul işlemcide **gerçekten kaldı** (bu denetimde ölçüldü: 4 test, hepsi
zamanlama kaynaklı; B5). Hesap hatası yüzünden kalan test yok.

Sayılarla:

| Ölçü                                                             | Değer                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust testleri (`#[test]`)                                        | 771 (7'si `#[ignore]`, hepsi gerekçeli: dış araç/model/elle ölçüm)                                                                                                                                                                                                                |
| TypeScript testleri (`it`/`test`)                                | 780 (92 dosya)                                                                                                                                                                                                                                                                    |
| Rust testi çalıştırma (tek iş parçacığı, 2 kez)                  | 755 geçti, 0 kaldı, 7 atlandı — iki koşuda da aynı (Ek B)                                                                                                                                                                                                                         |
| TS testi çalıştırma (`--maxWorkers=1`, meşgul işlemci)           | ana depoda **4 test kaldı**, hepsi zamana bağlı (2 gerçek zamanlayıcılı saat testi, 1 "600 ms'de > 20 kare" sayımı, 1 varsayılan 5 sn zaman aşımı); aynı testler depodaki 3 ajan çalışma kopyasında da kaldı (Ek B, B5)                                                           |
| Gövdesinde doğrudan `assert` olmayan Rust testi                  | 10: 5'i doğrulayan yardımcı çağırır; 3'ü `#[ignore]`lu ölçüm aracı; 1'i tarayıcının yanılgısı (dizgideki `}`; `shader.rs:1172` testinde assert var); 1'i bilinçli örtük kâhinli bozuk girdi testi ("panik yok", `milkdrop/parse.rs:1013`) → **CI'da çalışan doğrulamasız test 0** |
| Yalnızca `is_ok/is_some/is_none/!is_empty` doğrulayan Rust testi | 14; elle bakıldı: 13'ünde sınanan davranış tam olarak budur (ör. bozuk kayıt `None` döner); 1'i zayıf (B9)                                                                                                                                                                        |
| Yalnızca `toBeInTheDocument/toBeTruthy` doğrulayan TS testi      | 8; hepsi belirli bir metni arıyor (Testing Library'de geçerli doğrulama)                                                                                                                                                                                                          |
| `expect` içermeyen TS testi                                      | 0                                                                                                                                                                                                                                                                                 |
| Rust testlerinde doğrulama sayısı                                | 1: 145 · 2: 155 · 3: 121 · 4: 114 · ≥5: 226 (testlerin %80'i iki ya da daha fazla doğrulama)                                                                                                                                                                                      |
| CI'da yeniden deneme (retry) ya da `continue-on-error`           | yok                                                                                                                                                                                                                                                                               |
| Snapshot testi                                                   | yok                                                                                                                                                                                                                                                                               |
| git geçmişinde test eşiğinin sayısal değiştiği commit            | 28 / 442 (birleştirme hariç); gerekçesiz gevşetme **bulunmadı** (bölüm 5)                                                                                                                                                                                                         |
| Elle incelenen test                                              | ≈160 Rust (ses yolu, analiz, çıkış, kodekler), ≈60 TS (saat, VU, parlama, crossfeed, parametrik EQ, ışık)                                                                                                                                                                         |
| Bağımsız olarak yeniden hesaplanan beklenen değer                | 30'dan fazla (EBU 3341 durum 1–6, gerçek tepe, RBJ/analog süzgeç noktaları, VU balistiği, crossfeed gecikmesi)                                                                                                                                                                    |

Çekirdek hesap testlerinde beklenen değerin kaynağı (elle incelenen ≈160 Rust testi üzerinden,
test başına baskın kaynak; yaklaşık):

| Kaynak                                     | Pay  | Örnek                                                                                                                                                    |
| ------------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standardın sayısı                          | ~%10 | BS.1770-4 Tablo 1–2 katsayıları, EBU Tech 3341 durum 1–5, Camelot çarkı, Krumhansl–Kessler profilleri                                                    |
| Bağımsız başvuru hesabı / analitik çözüm   | ~%30 | sınırlayıcı testlerindeki 64 katsayılı gerçek tepe ölçeri, crossfeed'in ρ(s) hedefi, sinüs uydurma (ton/bozulma), dosyadaki PCM'in kendisi (bit-perfect) |
| Yapım gereği bilinen doğru (sentetik veri) | ~%30 | davul kaydı üreteci (vuruş anları bilinir), akor dizisi (ton bilinir), ffmpeg ile üretilmiş üç ton                                                       |
| El hesabı / spesifikasyon                  | ~%25 | eşitleme kazancı, gecikme kare sayısı, ölçü/nabız kuralları                                                                                              |
| Kodun kendi çıktısı (totoloji)             | <%5  | `Spec::analog` hem tasarımın hedefi hem testin ölçütü (B1)                                                                                               |
| Açıklamasız sihirli sayı                   | ~0   | taramada tek örnek bulunmadı (Ek A)                                                                                                                      |

---

## 2. Yöntem ve kaynaklar

### 2.1 Dayanılan literatür ve standartlar

- **Test kâhini (oracle) problemi:** E. T. Barr, M. Harman, P. McMinn, M. Shahbaz, S. Yoo, "The Oracle
  Problem in Software Testing: A Survey", IEEE TSE 41(5), 2015. Kâhinler: belirtilmiş (standart),
  türetilmiş (başvuru uygulaması, metamorfik ilişki), örtük (çökme yok), insan. Totoloji: beklenen
  değerin sınanan koddan alınması.
- **Metamorfik test:** T. Y. Chen ve ark., "Metamorphic Testing: A Review of Challenges and
  Opportunities", ACM CSUR 51(1), 2018.
- **Test kokuları:** G. Meszaros, _xUnit Test Patterns_, 2007 (Assertion Roulette, Fragile Test,
  Obscure Test); A. van Deursen ve ark., "Refactoring Test Code", XP 2001; A. Peruma ve ark.,
  "tsDetect", ESEC/FSE 2020 (Empty Test, Unknown Test, Sleepy Test, Magic Number Test).
- **Kararsız testler:** Q. Luo, F. Hariri, L. Eloussi, D. Marinov, "An Empirical Analysis of Flaky
  Tests", FSE 2014 (en sık nedenler: async wait, eşzamanlılık, zaman).
- **Tasarım teknikleri:** ISO/IEC/IEEE 29119-4 (sınır değer, denklik sınıfı).
- **Alan standartları:** ITU-R BS.1770-4; EBU R128 ve EBU Tech 3341 (ölçer uygunluk sinyalleri,
  ±0,1 LU; gerçek tepe toleransı +0,2/−0,4 dB); R. Bristow-Johnson, "Audio EQ Cookbook" (RBJ);
  IEC 60268-17 / ANSI C16.5 (VU: 300 ms'de %99, aşma %1–1,5); WCAG 2.x başarı ölçütü 2.3.1 (parlama
  tanımı); C. Raffel ve ark., "mir_eval", ISMIR 2014 (beat F-ölçüsü ±70 ms, ton puanı);
  Krumhansl & Kessler 1982 (ton profilleri).

### 2.2 Adımlar

1. **Envanter ve otomatik koku taraması** (`denetim2/koku_tarama.py`): her Rust testinin gövdesi
   çıkarıldı, `assert*` sayıldı, doğrulayan yardımcı çağrıları ayıklandı; yalnızca var/yok doğrulayan
   testler işaretlendi. TS'de `expect` ve eşleştirici türleri sayıldı. Çıktı: `denetim2/koku.txt`.
2. **Eşik geçmişi** (`denetim2/esik_gecmisi.py`): 442 birleştirme dışı commit'in her hunk'ında,
   yalnızca sayıları farklı silinen/eklenen doğrulama satırı çiftleri bulundu (28 commit), her biri
   commit mesajı ve diff'iyle elle sınıflandı. Çıktı: `denetim2/esik.txt`. Ayrıca önemli
   toleranslar için `git log -S` ile tek tek bakıldı (ör. `eq.rs` `error < 1.2`: ilk commit'ten beri
   aynı).
3. **Risk tabanlı örneklem, elle inceleme:** önce kullanıcıya en doğrudan dokunan hesaplar (ses
   yüksekliği, gerçek tepe/sınırlayıcı, süzgeçler, EQ, kulaklık düzeltmesi, crossfeed, örnekleme
   hızı dönüşümü, bit-perfect, beat/ton/bölüm analizi, Görsel Yönetmen, parlama güvenliği), sonra
   eşzamanlılık ve zamanlamaya dayanan testler.
4. **Bağımsız yeniden hesap** (NumPy 1.24, Python 3.8; kodu değil standardı ya da analitik çözümü
   kullanarak): `r128_bagimsiz.py`, `gercek_tepe.py`, `biquad_pay.py`, `raf_q_onerisi.py`,
   `k_hiz_duyarlilik.py`, `vu_balistik.py`, `bas_sonuc` (komut satırı). Kodun davranışı yalnızca
   "kod bunu verir mi?" sorusu için, satır satır taklit edilerek hesaplandı ve öyle işaretlendi.
5. **Düşünce mutasyonu** (mutasyon aracı çalıştırılmadı): "şu hata olsaydı test yakalar mıydı?"
   sorusu, testin girdisi ve toleransı üzerinde bağımsız hesapla yanıtlandı.
6. **Çalıştırma:** güncel test ikilisi (`target/debug/deps/lyraska_lib-7f21cbe00a9ae9ca.exe`, kaynak
   dosyalardan yeni) tek iş parçacığıyla iki kez; `export_bindings` testleri atlandı (ts-rs
   `src/lib/bindings/`'e yazar; depo değişmesin). TS: `npx vitest run --maxWorkers=1`. Derleme
   yapılmadı.

### 2.3 Sınırlar

- Mutasyon testi yapılmadı; mutasyon skoru yok. Duyarlılık, seçilen testlerde hesapla tahmin edildi.
- Kapsam (coverage) ölçülmedi (araç kurulmadı).
- 1551 testin tamamı elle okunmadı; elle okunmayanlar için yalnızca otomatik tarama sonucu vardır.
- Bağımsız hesaplardaki EBU Tech 3341 durum 6 seviyeleri (L=R=−28, C=−24, Ls=Rs=−30 dBFS)
  bellekten alınmıştır; bağımsız BS.1770 hesabının bu seviyelerle tam −23,0 LUFS vermesi
  (−23,016) seviyelerin doğruluğunu destekler, ama standart metni bu denetimde açılmadı.

---

## 3. Bulgular (önem sırasına göre)

Önem: **Yüksek** = gerçek hata ya da kullanıcıya doğrudan dokunan davranışın sınanmaması;
**Orta** = gerileme yakalanmaz; **Düşük** = gevşeklik, belge ya da bakım riski.

Bulgu kimlikleri (B1…B11) metin içi göndermeler için sabittir; aşağıdaki **sıra önem sırasıdır**: B2, B5, B1, B3, B4, B6, B7, B8, B10, B11, B9.

### B2 — Orta (gerçek hata): 5.0 kanallı seste BS.1770 çevre kanal ağırlığı yanlış; sınanmamış

Kanıt:

- `loudness.rs:228-235`: çevre kanallarına (Ls, Rs) 1,41 ağırlığı yalnızca `channels >= 6` ise
  verilir. 5 kanallı (5.0: L, R, C, Ls, Rs) akışta Ls ve Rs 1,0 sayılır. BS.1770-4 Tablo 3'e göre
  1,41 olmalıdır.
- Ölçere şarkının kendi kanalları verilir (`analysis/spectrogram.rs:596`: "bütün kanallarıyla
  ölçülür"); yani durum programda gerçekten oluşur.
- Testlerde 5 ya da 6 kanallı tek bir sınama yoktur (`loudness.rs:338-466`; yalnızca 1 ve 2 kanal).
- Bağımsız hesap (`denetim2/r128_durum6.txt`), EBU Tech 3341 durum 6 sinyaliyle (5.0, 1 kHz,
  L=R=−28, C=−24, Ls=Rs=−30 dBFS, 20 sn; beklenen −23,0 ±0,1 LUFS):
  - BS.1770 ağırlıklarıyla: **−23,016 LUFS** (uygun),
  - Lyraska'nın kuralıyla (5 kanalın hepsi 1,0): **−23,389 LUFS** → standardın ±0,1 LU
    toleransının **dışında** (0,39 LU).
  - Aynı içerik 5.1 düzeninde (LFE sessiz) Lyraska kuralı doğru sonuç verir (−23,016).
- Etki küçük (5.0 müzik dosyası nadir; eşitleme ~0,4 dB fazla yükseltir), ama belge
  (`loudness.rs:1`, "ITU-R BS.1770-4 / EBU R128") uygunluk iddia ediyor.

Düzeltme: önce hatayı yakalayan test (proje kuralı), sonra kod.
`ebu_3341_durum_6_bes_kanal`: `LoudnessMeter::new(48_000, 5)`, kanallar `[L, R, C, Ls, Rs]` =
`[−28, −28, −24, −30, −30]` dBFS 1 kHz sinüs, 20 sn → `(integrated + 23.0).abs() < 0.1`
(kaynak: EBU Tech 3341 durum 6; bağımsız başvuru −23,016). Aynı testte 6 kanal (LFE = 3. indeks
sessiz) aynı sonucu vermeli (metamorfik: LFE eklemek sonucu değiştirmez). Kodda 5 kanal için de
3 ve 4. indekse 1,41.

Ek not (tasarım kararı, hata değil): tek kanallı şarkı iki kanal sayılır (`loudness.rs:230`,
ağırlık 2,0). BS.1770 tek kanalı bir kanal sayar: −23 dBFS tek kanallı sinüs BS.1770'e göre
**−26,0 LUFS**, Lyraska'ya göre **−23,0 LUFS** (`r128_sonuc.txt`). Test
(`tek_kanalli_sarki_iki_hoparlorde_calindigi_gibi_olculur`, `loudness.rs:404-408`) bu kararı
kendi kendine (mono = stereo) doğrular; standarda dayanmaz. libebur128'in "dual mono" seçeneğine
denk bir karar; belgeye "BS.1770'ten bilinçli sapma: çift mono" diye yazılması önerilir.

### B5 — Orta (ölçüldü): Duvar saatine bağlı testler meşgul işlemcide kalıyor

Luo ve ark. (2014) sınıflamasında "zaman" ve "async wait" kökenli. Bu denetimde işlemci başka
işlerle meşgulken `npx vitest run --maxWorkers=1` çalıştırıldı (`denetim2/ts_kosu1.txt`, 58 dk).
Ana depoda **4 test kaldı; dördü de zamanlamadan**, hiçbiri hesap hatasından değil:

| Test                                                                                | Doğrulama                                       | Ölçülen         | Kopyalarda*              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- | --------------- | ------------------------ |
| `src/hooks/usePlayer.test.ts:119-144` "düzenli sorgunun konumu … ortasına bağlanır" | konum hatası < 0,5 ms (gerçek `setTimeout(10)`) | **8,05 ms**     | 2/4 kaldı                |
| `src/hooks/usePlayer.test.ts:146-176` "saat kayması konumu kaydırmaz"               | < 3 ms (gerçek `setTimeout(2)`/`(60)`)          | **3,92 ms**     | 4/4 kaldı (3,90–3,93 ms) |
| `src/components/components.test.tsx:483-499` "çizim yükü"                           | gerçek 600 ms'de `frames > 20`                  | **19**          | 1/4 kaldı                |
| `src/lib/photoScene.test.ts:567` "sınır çubukları gereksiz kısaltmaz"               | saf hesap, varsayılan 5 sn zaman aşımı          | **zaman aşımı** | 4/4 kaldı                |

\* Depoda `.claude/worktrees/` altında üç ajan çalışma kopyası vardı; vitest onları da topladı
(B11), böylece aynı testler dört kez koşmuş oldu. Kopyaların kodu ana depoyla birebir aynı
olmayabilir (**belirsiz**), ama aynı testler aynı biçimde kaldı.

Yorum: "saat kayması" testinin dört kopyada da 3,9 ms ile kalması, bunun rastlantı değil, yük
altındaki Windows zamanlayıcı çözünürlüğünün (`setTimeout(2)` gerçekte birkaç ms) testin varsaydığı
gidiş-dönüş süresini aşması olduğunu gösterir: 3 ms sınırı, tahmin edilen fark gidiş-dönüşün
yarısıyla sınırlı olduğundan, zamanlayıcının söz verdiği süreye bağlıdır. CI'da (boş makine)
geçiyor olmaları bu testleri güvenilir yapmaz; proje sahibinin `npm run check`'i de meşgul
bilgisayarda kalabilir.

Rust tarafında iki tek iş parçacıklı koşu (aynı meşgul işlemcide) temiz geçti; git geçmişinde
kararsız test düzeltmesi bulunmadı (`git log --grep` "kararsız|flaky|ara sıra|yarış"). Rust'ta
yine de riskli olanlar:

| Yer                                                                      | Doğrulama                                                               | Risk                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `milkdrop/shader.rs:1272-1279` `sonuclar_bellekte_saklanir` (satır 1278) | ikinci çevirinin süresi **< 5 ms** (duvar saati)                        | meşgul Windows'ta kesilen bir iş parçacığı onlarca milisaniye bekleyebilir (zamanlayıcı adımı varsayılan 15,6 ms); önbelleğin varlığını süreyle değil, çevirici çağrı sayısıyla ya da `Arc::ptr_eq` ile ölçmek gerekir. **En yüksek risk.** |
| `analysis/lyrics_worker.rs:849-857`                                      | `stop()` **< 100 ms**                                                   | yük altında orta                                                                                                                                                                                                                            |
| `audio/player/tests.rs:2020-2026`                                        | `SystemTime` tabanlı `unix_micros` 2 ms uykudan sonra **artmış olmalı** | NTP saati geri alırsa kalır; çok düşük                                                                                                                                                                                                      |
| `audio/player/tests.rs:188-196` `wait_until`                             | koşul tabanlı yoklama, 5 sn                                             | iyi tasarım (sabit uyku değil)                                                                                                                                                                                                              |

Düzeltme önerisi:

- `usePlayer.test.ts` saat testleri: `vi.useFakeTimers({ toFake: ["setTimeout", "performance"] })`
  ile zaman elle ilerletilir; beklenen hata analitik olarak 0 (orta nokta tam simetrik) ya da
  gidiş-dönüşün yarısı olur; tolerans 1e-6 sn. Projede 5 test dosyası zaten sahte zamanlayıcı
  kullanıyor.
- `components.test.tsx:483-499`: gerçek 600 ms beklemek yerine `requestAnimationFrame` sahte
  sürülür (ör. 30 kare elle çağrılır) ve "panelin yeniden çizim sayısı = 0, konum gösterenin = 30"
  doğrulanır; kare sayısı süreye değil girdiye bağlanır.
- `photoScene.test.ts:567`: ağır saf hesap; ya çözünürlük düşürülür (640×360 zaten; ölçülmeli) ya
  da teste açık bir zaman aşımı (`it(..., 30_000)`) verilir — ikincisi doğrulamayı zayıflatmaz.
- Rust'ta süre doğrulamaları olay/sayaç doğrulamasına çevrilir (ör. önbellek için çevirici çağrı
  sayacı); olmuyorsa sınır ölçülen değerin en az 10 katı ve Windows zamanlayıcı adımının (15,6 ms)
  birkaç katı olur.

### B1 — Orta: Tepe ve raf süzgeçlerinin Q'su hiçbir testte bağımsız olarak sabitlenmemiş

Kulaklık düzeltmesi (AutoEq) ve parametrik EQ'nun asıl süzgeçleri tepe (PK) ve raflardır (LS/HS).
Varsayılan tasarım yöntemi RBJ'dir (`src-tauri/src/audio/peq.rs:144-150`).

Kanıt:

- `biquad.rs:947-968` `tasarimlar_beklenen_egriyi_verir` rafı yalnızca üç noktada sınar: 20 Hz
  (±0,3 dB), köşe frekansı 100 Hz (±0,2) ve 2 kHz (±0,05). RBJ rafı köşe frekansında **her Q için**
  tam G/2'den geçer; uçlarda da Q'nun etkisi küçüktür. Bağımsız hesap
  (`denetim2/biquad_duyarlilik_sonuc.txt`): Q 0,707 yerine **1,0 ya da 1,4** olsaydı bu test
  **geçerdi** (20 Hz: 9,18 / 9,28 dB; 100 Hz: 4,500; 2 kHz: −0,012 / −0,017). Oysa 50 Hz'te fark
  1,2–2,2 dB'dir.
- `peq.rs:1488-1503` `filtreler_istenen_egriyi_verir` aynı kalıpta: LS 100 Hz +8 dB, ön kazanç −8;
  20 Hz'te ±0,3. Hesap (`raf_q_sonuc.txt`): Q **2,0'a kadar** geçer (0,298 dB).
- Tepe süzgeci yalnızca merkez frekansta (Q'dan bağımsız) ve 30 Hz'te (≈0) sınanır
  (`biquad.rs:955-956`, `peq.rs:1482-1486`).
- `src/lib/parametric.test.ts:89-97`: arayüzün analog eğrisi de yalnızca f0, 10 Hz ve 20 kHz'te;
  `toBeCloseTo(-6, 0)` ±0,5 demektir.
- Katsayı düzeyinde "Equalizer APO ile aynı" testi (`biquad.rs:1002-1027`
  `rbj_equalizer_apo_ile_ayni`) yalnızca BP, NO ve AP'yi kapsar; PK/LS/HS yok.
- Eşlenmiş tasarım testleri (`biquad.rs:1090-1124`) eşlenmişi `Spec::analog`'a göre ölçer; aynı
  fonksiyon tasarımın da hedefidir (`biquad.rs:352`, `473`): **paylaşılan kâhin**. RBJ ile
  karşılaştırmalar tek yönlüdür (`e_m <= e_r + 1.0`, `avg_m < avg_r * 0.7`): RBJ'de bir hata RBJ
  hatasını büyütür ve bu doğrulamaları **daha kolay** geçirir.

Bu denetimde formüller RBJ yemek kitabıyla satır satır karşılaştırıldı ve doğru bulundu
(`biquad.rs:110-133`, `192-238`); yani bugün hata yok, ama bir gerileme (ör. Q yerine S, ya da
`alpha` yanlış) hiçbir testte yakalanmaz.

Düzeltme önerisi (beklenen değerler `raf_q_sonuc.txt`, RBJ yemek kitabı ve analog H(s) ile
bağımsız; RBJ ile analog 48 kHz'te bu noktalarda 1e-4 dB içinde):

| Test                                            | Girdi                                                   | Beklenen                                   | Tolerans |
| ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ | -------- |
| `biquad::tasarimlar_beklenen_egriyi_verir`'e ek | LS 100 Hz +9 dB Q 0,707 @48 kHz, 50 Hz                  | 8,3901 dB                                  | 0,01     |
| aynı                                            | aynı, 200 Hz                                            | 0,6098 dB                                  | 0,01     |
| yeni                                            | PK 1 kHz +6 dB Q 1,0 @48 kHz, 500 Hz / 2 kHz            | 1,8794 / 1,8660 dB (RBJ)                   | 0,01     |
| yeni                                            | HS 8 kHz −6 dB Q 0,707 @48 kHz, 4 kHz / 16 kHz          | −0,2850 / −5,9209 dB (RBJ)                 | 0,01     |
| yeni, `Spec::analog` için                       | PK 1 kHz +6 Q 1 analog, 500 Hz                          | 1,8838 dB                                  | 1e-3     |
| `rbj_equalizer_apo_ile_ayni`'ye ek              | PK, LS, HS için katsayılar                              | yemek kitabındaki formülle elle (`b0..a2`) | 1e-15    |
| yeni (çapraz uygulama)                          | Rust `Spec::analog` ↔ TS `analogDb`, 8 tür × birkaç Q/f | iki bağımsız yazımın farkı                 | 1e-6 dB  |

Son satır, crossfeed'de zaten yapılan çapraz denetimin (`crossfeed.rs` `durum_egrisi_analog_formulle_uyusur`)
eşidir.

### B3 — Orta: Kalite hedeflerinin ikisi ve gerçek müzikteki beat hedefi otomatik teste bağlı değil

CLAUDE.md: "Kalite hedefleri ölçülebilir testlere bağlanır: beat F-ölçüsü ≥ 0,80; senkron ±20 ms;
1080p dahili GPU'da 60 fps; 1 saat çalmada sıfır takılma."

- **60 fps** ve **1 saat sıfır takılma** için CI'da test yok; yalnızca elle cihaz listesi var
  (`docs/DOGRULAMA.md:228-231` B7, `:377`). Oynatıcı testleri kısa sanal çıkışlarda
  `underruns == 0` doğrular (ör. `audio/player/tests.rs:541`), uzun süre değil.
- **Beat F ≥ 0,80**: CI'daki testler yalnızca sentetik davul kayıtlarında ölçer ve orada F > 0,95
  ister (`analysis/beats.rs:780-818`); gerçek müzikteki hedef yalnızca elle çalıştırılan
  `examples/koy_isi.rs` ve sahibin işaretleriyle ölçülür. Sentetik veri "yapım gereği doğru" bir
  kâhindir (iyi), ama zorluğu gerçek müziğin çok altındadır: bu testler hedefi değil, hatasız
  çalışmayı kanıtlar.
- **±20 ms senkron**: sentetik kayıtta 44,1 kHz'te en büyük hata < 20 ms doğrulanır
  (`beats.rs:809-814`); diğer hızlarda < 30 ms (`beats.rs:950-953`, gerekçesi yorumda yazılı).

Öneri: (a) sanal çıkışla, gerçek zamandan hızlı bir "uzun çalma" testi (ör. 60 dakikalık sentetik
şarkı, EQ + crossfeed + eşitleme açık, ayar değişiklikleri ve sarmalarla; beklenen `underruns == 0`
ve örnek sayısı korunur). Sanal çıkışın gerçek zaman hızında mı çalıştığını bu denetimde
doğrulamadım (**belirsiz**); öyleyse süre kısaltılmalı. (b) Lisansı uygun, işaretli küçük bir
gerçek-müzik beat veri setiyle (ör. telif sorunu olmayan, projenin kendi ürettiği çok enstrümanlı
kayıtlar) F ≥ 0,80'i CI'da sınayan bir test; ses dosyası depoya giremeyeceği için kayıtlar
`tests/data/` kuralına uygun sentetik üretilmeli.

### B4 — Düşük-Orta: Ses yüksekliği ölçerinin gerçek tepesi yalnızca tek frekans/tek fazda sınanıyor

- `loudness.rs:421-434` yalnızca fs/4'te 45° fazlı sinüsü (sınır −0,3 … +0,2 dBTP) ve 997 Hz'i
  sınar.
- Kodun ölçeri (4×, faz başına 12 katsayı, Blackman) aynen taklit edilerek hesaplandı
  (`denetim2/gercek_tepe_sonuc.txt`; kesin değer 0 dBTP):
  fs/4 45°: **−0,173**; 12 kHz: −0,173; 18 kHz: −0,212; **20 kHz: −0,301 dBTP**; ±1'e kırpılmış
  9 kHz (44,1 kHz; kesin +2,543 dBTP, periyodik FFT ara değeriyle): +2,305 (**−0,237 dB**).
  Hepsi EBU Tech 3341'in gerçek tepe toleransı (+0,2/−0,4 dB) içinde; yani bugün hata yok, ama
  test aralığı yalnızca bir noktayı tutuyor: yüksek frekanslarda ölçerin bozulması (ör. faz sayısı
  2'ye inse) yakalanmaz.
- Belge hatası: `limiter.rs:386` yorumu kırpılmış 9 kHz girişin gerçek tepesini "+1,7 dBTP" diye
  yazar; bağımsız kesin değer **+2,54 dBTP**. Testin doğrulaması (`> 1.0`) yine doğru çalışır.

Düzeltme: `gercek_tepe_yuksek_frekanslarda_tolerans_icinde`: 48 kHz, tam ölçek, 12/15/18/20 kHz,
her biri 9 faz (0…π); her durumda `-0.4 <= dbtp <= 0.2` (kaynak: EBU Tech 3341 gerçek tepe
toleransı; kesin değer 0 dBTP). Kırpılmış 9 kHz için kesin değer +2,543 dBTP, aynı tolerans.

### B6 — Düşük: Gerekçesiz geniş toleranslar (gerçek değer ile sınır arasındaki pay)

Bağımsız hesapla gerçek değer bulundu; "kullanılan pay" = |gerçek − beklenen| / tolerans.

| Test                                      | Beklenen ± tolerans | Gerçek (bağımsız)                             | Kullanılan pay | Öneri                                                                                        |
| ----------------------------------------- | ------------------- | --------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `biquad.rs:947` LS 20 Hz                  | 9,0 ± 0,3           | 8,983                                         | %6             | 8,983 ± 0,01                                                                                 |
| `biquad.rs:951` HS 20 kHz                 | −6,0 ± 0,5          | −5,996                                        | %1             | −5,996 ± 0,01                                                                                |
| `biquad.rs:956` LP 20 Hz                  | 0 ± 0,05            | −0,0033                                       | %7             | yeterli                                                                                      |
| `bass.rs:773` bas 40 Hz                   | 9,0 ± 0,5           | rafın kendisi 8,737 (48 kHz, 100 Hz, Q 0,707) | %53            | beklenen yanlış yuvarlanmış: 8,74 ± 0,05 (işlemcide raftan başka süzgeç yoksa; **belirsiz**) |
| `src/lib/vu.test.ts:57-59` VU aşma        | %0,5 … %2,5         | %1,338                                        | —              | IEC 60268-17'nin aralığı **%1,0 … %1,5**                                                     |
| aynı, %99'a ulaşma                        | 260 … 340 ms        | 300,0 ms                                      | —              | standart 270 … 330 ms                                                                        |
| `src/lib/flash.test.ts:12-15` yavaş dalga | ≥ 2 parlama         | 400 karede ~3,2 periyot → 3                   | —              | `toBe(3)`                                                                                    |
| `src/lib/parametric.test.ts:96-97`        | −6 ± 0,5            | —                                             | —              | tam değer ± 0,01                                                                             |

VU ibresi kodu (`src/lib/vu.ts:61-80`, ζ = 0,8, ω = 13,1) standardı karşılıyor
(`denetim2/vu_sonuc.txt`); yalnızca test sınırları standarttan iki kat geniş: bir gerileme
yakalanmayabilir: ör. ζ = 0,78 olsa sürekli zamanda aşma ~%2,0 olur (standarda aykırı, test geçer).

Toleransı yerinde olanlar da vardır: EBU 3341 ±0,1 (standardın kendisi), sınırlayıcının +0,1 dB
payı (başvuru ölçerin hatası 0,003 dB'den küçük: B-iyi-1), örnekleme dönüşümünde −100 dB bozulma
ve 140 dB yansıma bastırma, crossfeed'de %1 göreli hata.

### B7 — Düşük: Ton ilişkisi "MIREX sınıfları" diye anılıyor, ama beşli ilişkisi iki yönlü

- `analysis/key.rs:118-158`: "beşli komşusu" Camelot çarkında iki yan (`step == 1 || step == 11`).
  Test `key.rs:629-651` `isaretle_karsilastirma_mirex_siniflari` (satır 636-638): La minörün Re minör (7A) ile ilişkisi
  `Fifth`.
- mir_eval'in `key.weighted_score`'u (MIREX puanı) varsayılan olarak yalnızca **yukarı** beşliyi
  sayar (`allow_descending_fifths=False`); bu bilgi bellekten, **sürüm ayrıntısı belirsiz**.
- Program için Camelot komşuluğu (DJ uyumu) makul bir karardır; sorun adlandırmadır: test ve
  belge "MIREX" der, kâhin MIREX değildir. Ölçülen isabet oranı MIREX puanıyla karşılaştırılırsa
  yanıltır.

Öneri: belge ve test adında "Camelot komşuluğu (MIREX'ten geniş)" denmesi; MIREX puanı istenirse
ayrı bir `mirex_score` (aynı 1,0; yukarı beşli 0,5; paralel/göreli 0,3; aynı tonik 0,2) ve onun
mir_eval'in belgelenmiş örnekleriyle testi.

### B8 — Düşük (karar sorusu): Bit-perfect testleri ilk 10 ms'yi karşılaştırmanın dışında tutuyor

- `audio/render.rs:859-863` ve `audio/player/tests.rs:1638-1688` (dosyadan çıkışa uçtan uca
  bit-perfect testi): "Açılış geçişinden (10 ms) sonrası" bit bit karşılaştırılır.
- Yani bit-perfect kipte şarkının ilk 10 ms'si yumuşak açılışla değiştiriliyor ve testler bunu
  bilerek dışarıda bırakıyor. Testler kodla tutarlı, ama "bit-perfect" tanımından bir sapmayı
  örtüyor. Proje sahibine sorulacak bir ürün kararı: açılış geçişi bit-perfect'te de olsun mu?
  Olacaksa belgeye ve DOGRULAMA'ya yazılmalı; olmayacaksa testten `skip(fade)` kalkmalı.

### B10 — Düşük: Analog prototipin kendisi için bağımsız test yok

`Spec::analog` (`biquad.rs:110-133`) sekiz türün analog H(s)'ini verir ve hem eşlenmiş tasarımın
hedefi hem testlerin ölçütüdür (B1). Bu denetimde formüller RBJ yemek kitabıyla karşılaştırıldı ve
bilinen noktalar bağımsız hesaplandı (`biquad_pay_sonuc.txt`: tepe f0'da tam G; raf DC'de G ve
f0'da G/2; Butterworth köşede −3,0103 dB). Öneri: bu noktaları ve B1'deki Q'ya duyarlı noktaları
`Spec::analog` için ayrı bir testte sabitlemek (beklenen değerler tabloda).

### B11 — Düşük: Yerel `npm test` ajan çalışma kopyalarını da topluyor

`vite.config.ts`'de `test.include`/`exclude` yok; vitest'in varsayılan dışlama listesinde
`.claude/` bulunmaz. Bu denetimde `D:\Lyraska\.claude\worktrees\` altında 6 klasör vardı; vitest
ana depodaki 92 dosyanın yanında üç kopyanın dosyalarını da çalıştırdı (`ts_kosu1.txt`:
"388 dosya, 3400 test"). Sonuç: yerel `npm test`/`npm run check` hem ~4 kat uzun sürer hem de
başka bir oturumun yarım işinin testleri yüzünden kalabilir. CI'yı etkilemez (orada kopya yok).
Düzeltme: `test.exclude`'a `"**/.claude/**"` eklemek (varsayılanları koruyarak:
`configDefaults.exclude`).

### B9 — Düşük: Birkaç zayıf kâhin

- `milkdrop/shader.rs:1366-1381` `kucuk_sabit_donguler_cevrilir`: yalnızca `is_ok()`; çeviri
  çıktısının doğruluğu bu testte denetlenmiyor (diğer çeviri testleri çıktı metnine bakıyor:
  dosyada 26 içerik doğrulaması). Kabul kuralının testi olarak yeterli; en az bir örnekte döngünün
  GLSL'de korunduğu (`for (int`) doğrulanabilir.
- Belirlenimcilik doğrulamaları tek başına zayıftır (`src/lib/cover.test.ts:6`,
  `albumCovers.test.ts:99`, `lyricMotion.test.ts:167`: aynı girdi → aynı çıktı); dosyalarda başka
  doğrulamalarla birlikteler.
- `analysis/evaluate.rs:201-212`: F-ölçüsü sınırları 60 ms (içinde) ve 80 ms (dışında) ile sınanır;
  tam 70 ms sınırı (mir_eval'de `<=`) sınanmaz. Öneri: 0,07 kaymada F = 1,0 ve 0,0701'de F = 0.
  Kayan nokta nedeniyle `t + 0.07` tam sınırda olmayabilir; 0,0699/0,0701 kullanılmalı.
- `analysis/evaluate.rs:121-159` açgözlü eşleştirme, mir_eval'in en büyük iki parçalı eşleştirmesiyle
  bu testlerde aynıdır (vuruş aralığı > 2 × 70 ms); 140 ms'den sık işaretlerde (ör. 16'lık) farklı
  sonuç verebilir. Sınanmamış; **belirsiz** etki.

---

## 4. İyi yazılmış test örnekleri (dengeli hüküm için)

1. **Sınırlayıcının gerçek tepe testleri** (`audio/limiter.rs:279-406`): sınırlayıcının kendi ara
   değerleyicisinden bağımsız, daha ince bir başvuru ölçer (8×, 64 katsayı, Hann) kullanır. Bu
   başvuruyu bağımsız kesin değerle sınadım (`gercek_tepe_sonuc.txt`): fs/4'te hata +0,0003 dB,
   kırpılmış 9 kHz'te −0,002 dB. Yani testteki +0,1 dB pay gerçekten anlamlı. "Sınırın altında bit
   bit aynı" testi `assert_eq!` ile dizinin tamamını karşılaştırır.
2. **EBU 3341 ve BS.1770 katsayıları** (`audio/loudness.rs:338-393`): beklenen değerler doğrudan
   standarttan; tolerans standardın kendisi. Bağımsız BS.1770 uygulamam durum 1/2/3/5'te
   −22,993 / −32,993 / −23,014 / −22,979 verdi. Düşünce mutasyonu: K süzgeci örnekleme hızına
   uyarlanmasaydı 44,1 kHz'te 1 kHz sinüs −22,78 LUFS ölçülürdü (`k_hiz_sonuc.txt`);
   `her_ornekleme_hizinda_ayni_sonuc` (±0,1) bunu **yakalar**.
3. **Crossfeed** (`audio/crossfeed.rs:389-655`; ör. `ornek_tepesi_siniri_dogru` 524, `durum_egrisi_analog_formulle_uyusur` 608): kâhin tasarımdan bağımsız analitik hedef
   ρ = r0/(1 + jf/fc); örnek tepesi sınırı dürtü yanıtının mutlak toplamıyla kanıtlanıp kare
   dalgayla sınanır; ortadaki sesin bit bit aynı kaldığı her örnekte `assert_eq!`. Gecikme 227,4 µs
   = 1/(2π·700) (bağımsız: 227,36 µs). TS tarafı çekirdeğin hazır ayar listesini kaynak dosyadan
   okuyup karşılaştırır (`src/lib/crossfeed.test.ts:61-75`).
4. **Örnekleme hızı dönüşümü** (`audio/resample.rs:225-318`): bilinen frekansta sinüs uydurma,
   −100 dB bozulma, sınır üstü tonda 140 dB bastırma, darbenin yerinde kalması.
5. **Uçtan uca bit-perfect** (`audio/player/tests.rs:1638-1688` `bit_perfect_zinciri_dosyadaki_tamsayilari_aynen_aygita_verir`): WAV dosyası → çözücü → dönüştürücü
   → ses yolu (EQ +6 dB ve eşitleme açıkken bile) → 24 bit tamsayı; beklenen değer dosyadaki PCM.
   Tamsayı biçimi testi (`audio/output.rs`) sınırları (`i16::MIN`, `i16::MAX`, 24/32 bit) tek tek
   bayt düzeyinde doğrular.
6. **Ses yolunda bellek ayırma yok** (`audio/render.rs:410-…`): `allocation_counter` ile, EQ, kulaklık,
   parametrik, crossfeed, bas, eşitleme açık ve 250 blok boyunca ayarlar değişirken ölçer; ayar
   değişikliği çağrıları bile ölçümün içinde.
7. **Kodek testleri** (`tests/formats.rs`): ffmpeg'le üretilmiş, tarifi `tests/data/README.md`'de
   yazılı sentetik dosyalar; frekans, süre, etiket, sarma konumu ve boşluksuz çalma dolgusu
   (66 150 örnek tam) doğrulanır.
8. **Beat ve ton testleri**: kâhin yapım gereği doğru (üreteç vuruş anlarını ve tonu bilir);
   Krumhansl–Kessler profilleri literatürdeki değerlerle aynı (`key.rs:65-70`); Camelot eşlemesi
   standart çarkla aynı. Çift tempoda F = 2/3 gibi el hesabı sınamalar var.
9. **Eşik değişikliğinin doğru yapılışı**: `a608283` (Işık Ustası) — sahibin kararıyla Normal'deki
   eşik 0,85 → 0,5 indirilirken Çılgın için yeni üst doğrulama (> 1) ve iki yönlü sınır (0,3 … 0,5)
   eklenmiş; `c273661`'de tavan −1 dBTP'ye inince beklenenler el hesabıyla tam 1 dB kaydırılmış.
10. **Kararlılık için koşul tabanlı bekleme** (`audio/player/tests.rs:188-196` `wait_until`): sabit
    uyku yerine yoklama; meşgul işlemcide iki tek iş parçacıklı koşuda da 755/755 geçti (TS'deki
    gerçek zamanlayıcılı testlerle karşıtlık: B5).

---

## 5. git geçmişi: eşikler sonradan gevşetildi mi?

`esik_gecmisi.py` 442 commit'te 28 commit buldu (`denetim2/esik.txt`). Sınıflama:

| Tür                                                                     | Commit sayısı | Örnek                                                                         | Hüküm           |
| ----------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- | --------------- |
| Ürün değişikliğinin sayısal sonucu (sahne sayısı, kısayol, sürüm metni) | 11            | `d2eb33b` sahne 15 → 13                                                       | doğal           |
| Tasarım/karar değişikliği, beklenen el hesabıyla güncellenmiş           | 9             | `c273661` −1 dBTP tavanı: +6 → +7 dB; `ac70a61` 5,000 → 5,017 (= 5 + 1/60 sn) | gerekçeli       |
| Sıkılaştırma                                                            | 4             | `a4325cd` VU ışığı ≤ 3 → ≤ 1/sn; `a758097` kırmızı < 100 → < 40               | olumlu          |
| Gevşetme                                                                | 4             | aşağıda                                                                       | hepsi gerekçeli |

Gevşetmeler tek tek:

- `129efa3` `usePlayer.test.ts` konum hatası 0,5 ms → 3 ms: senaryo değişti (37 ms kaymış duvar
  saati ve NTP benzeri fark tahmini; ilk sorgular 2 ms gidiş-dönüşlü). Tahminin doğruluğu
  gidiş-dönüşün yarısıyla sınırlı olduğundan 3 ms tutarlı. Gerekçeli.
- `a608283` `lightShow.test.ts` 0,85 → 0,5 ve 0,5 → 0,3: sahibin kararı (30 Ekim), yerine daha sıkı
  karşı doğrulamalar eklendi. Gerekçeli.
- `5eae0d5` `spectrum.rs` `any > 0.5` → `any > 0.1`: çubuk modeli örnek videolardan ölçülen yeni
  eşlemeye geçti (doğrusal genlik, farklı ölçek); eşik yeni ölçeğe göre. Gerekçeli; ama `> 0.1`
  zayıf bir doğrulama, yeni modelin beklenen değeriyle (`FULL_AMPLITUDE`'a göre) değiştirilebilir.
- `c720691` `flashGuardMath.test.ts` "beyaz ekran < 3,8 sn" → "< 10,7 sn": parlaklık freninin
  güvenli moda taşınıp yavaşlatılması; süre uzaması güvenlik açısından daha sıkı bir fren demektir.
  Gerekçeli.

Ayrıca `git log -S` ile EQ eğrisi toleransı (`eq.rs` `error < 1.2`), sınırlayıcının +0,1 dB payı ve
EBU ±0,1'e bakıldı: ilk yazıldıkları günden beri aynı.

---

## Ek A — Otomatik tarama çıktıları

- `denetim2/koku.txt`: doğrulamasız / zayıf doğrulamalı test listesi (dosya:satır).
- `denetim2/esik.txt`: sayısal eşik değişiklikleri (commit, dosya, eski/yeni satır).
- Sihirli sayı taraması (`assert` satırında ≥ 5 ondalıklı sayı): yalnızca BS.1770 katsayıları
  (standart) ve iki önemsiz değer.

## Ek B — Çalıştırma sonuçları

- Rust, koşu 1 (`denetim2/rust_kosu1.txt`): `755 passed; 0 failed; 7 ignored; 63 filtered out`
  (filtrelenen 63: ts-rs `export_bindings_*`), 197,9 sn, tek iş parçacığı.
- Rust, koşu 2 (`denetim2/rust_kosu2.txt`): `755 passed; 0 failed; 7 ignored; 63 filtered out`, 171,2 sn. İki koşu aynı.
- TS (`denetim2/ts_kosu1.txt`, `npx vitest run --maxWorkers=1 --reporter=dot`, 57 dk 57 sn; ajan kopyaları dahil): `Test Files 9 failed | 379 passed (388)`, `Tests 11 failed | 3389 passed (3400)`. Ana depoda kalan 4 test ve kopyalardaki 7 test: B5 tablosu. jsdom'da `HTMLCanvasElement.getContext` yok uyarısı 1000'den fazla kez: sahnelerin çizimi vitest'te değil, gerçek tarayıcıdaki `check:scenes`'te sınanır.
- Denetim sonrası `git status --short` (`denetim2/git_durum_sonra.txt`): boş (depo değişmedi).

## Ek C — Bağımsız hesap betikleri

Hepsi `docs/arastirma/test-kalitesi/betikler/denetim-2/`
altında; `py -3.8 -I -X utf8 <betik>` ile çalışır.

| Betik                               | Ne hesaplar                                                                                 | Çıktı                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| `r128_bagimsiz.py`                  | BS.1770-4, standardın 48 kHz katsayılarıyla; EBU 3341 durum 1–5, tek kanal                  | `r128_sonuc.txt`              |
| (aynı betik, durum 6 ek koşusu)     | 5.0 kanal, BS.1770 ve Lyraska ağırlıklarıyla                                                | `r128_durum6.txt`             |
| `gercek_tepe.py`                    | Lyraska'nın gerçek tepe ölçeri ve sınırlayıcı testlerinin başvuru ölçeri, kesin değere göre | `gercek_tepe_sonuc.txt`       |
| `biquad_pay.py`                     | RBJ ve analog süzgeç noktaları, testlerin kullandığı pay                                    | `biquad_pay_sonuc.txt`        |
| `biquad_duyarlilik.py`              | raf Q'su yanlış olsa test geçer miydi                                                       | `biquad_duyarlilik_sonuc.txt` |
| `raf_q_onerisi.py`                  | önerilen Q'ya duyarlı testlerin beklenen değerleri                                          | `raf_q_sonuc.txt`             |
| `k_hiz_duyarlilik.py`               | K süzgeci hıza uyarlanmasaydı ses yüksekliği testi yakalar mıydı                            | `k_hiz_sonuc.txt`             |
| `vu_balistik.py`                    | VU ibresi (vu.ts aynen) ve IEC 60268-17 ölçütleri                                           | `vu_sonuc.txt`                |
| `koku_tarama.py`, `esik_gecmisi.py` | otomatik taramalar                                                                          | `koku.txt`, `esik.txt`        |
