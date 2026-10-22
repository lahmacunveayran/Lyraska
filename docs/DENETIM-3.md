# Faz 1 kalite ve hata denetimi — birinci denetim (22 Ekim 2026)

Proje sahibinin isteği: "Faz 1 bitti. Faz 1'e kalite ve hata denetimi yap. İki kere denetle. İkinci denetim bağımsız ve
daha üstün, daha profesyonel, daha nitelikli olsun." Bu belge **birinci denetimdir**. İkinci, bağımsız denetim ayrı
belgede: [`DENETIM-4.md`](DENETIM-4.md).

Denetlenen kod: `main` @ `94bc3d6` (sürüm **0.0.56**). Hiçbir kod değiştirilmedi; bulgular düzeltme listesidir.
Tam raporlar `docs/denetim-3/` altında (ses, kütüphane, arayüz), deney betikleri `docs/denetim-3/betikler/`.

## 0. Proje sahibi için özet

- **Bütün kalite kapıları yeşil** (bölüm 2): 435 Rust testi + 4 kodek testi, 317 arayüz testi, Clippy (Linux ve
  Windows hedefi), biçim, tür, komut sözleşmesi (54 komut), lisanslar, güvenlik uyarıları.
- **Faz 1'in vaat ettiği her özellik kodda var ve çalışıyor.** Önceki iki denetimin (16 Ekim) yüksek önemli
  bulgularının çoğu gerçekten düzeltilmiş; bu denetim onları tek tek kodda doğruladı.
- **Ama 0.0.50'den bu yana yapılan düzeltmelerin bir kısmı yeni hatalar doğurmuş.** Bu denetimin ana bulgusu bu:
  1. **Yayın hattında güvenlik açığı (Kritik, D1-YAY-01).** Başka birinin kopyaladığı depodan açılan bir PR, dalının
     adı `main` ise, sabit test linkindeki kurulum dosyasını kendi derlediği dosyayla değiştirebilir. 0.0.48'deki
     "CI'yi bekle" düzeltmesiyle geldi. Düzeltmesi iki satır.
  2. **Kulaklık çıkarılınca şarkı kaybolabiliyor (Yüksek, D1-SES-01).** Tek ses aygıtı olan bilgisayarda aygıt
     kopunca otomatik toparlama başarısız olursa "çal" artık hiçbir şey yapmıyor. 0.0.50'de bu durumda "çal" kaldığı
     yerden sürüyordu: 0.0.52'nin aygıt değişimi düzeltmesinin gerilemesi.
  3. **Büyük kütüphanede her sorgu bütün analiz verisini diskten okuyor (Yüksek, D1-KUT-01).** 10 000 şarkıda bir
     sorgu ~0,7 sn; arka plan analizi her şey bitmiş olsa bile 15 saniyede bir yineliyor. Tek bir veritabanı
     indeksi 55 kat hızlandırıyor (ölçüldü).
  4. **Kütüphaneyi silme koruması kapanabiliyor (Orta, D1-KUT-02)** ve **adı nokta ile başlayan albüm klasörleri
     (`...And Justice for All`, `.38 Special`) hiç taranmıyor (Orta, D1-KUT-03)**: 0.0.51'in iki düzeltmesi
     birbirini zayıflatıyor.
- **Kararınızı bekleyen bir konu:** sınırlayıcının tavanı (D1-SES-04, bölüm 5).

## 1. Kapsam ve yöntem

- **Kapsam:** `docs/ROADMAP.md` Faz 1 maddeleri: ses motoru (çözme, 64-bit iç işlem, halka tampon, WASAPI), aç/çal/
  duraklat/durdur, sarma, spektrum, kütüphane, Türkçe arama, çalma sırası, 10 bant ekolayzer, boşluksuz geçiş, hata
  günlüğü, üç sahne, kapaklar, hata sınırları, sürükle-bırak, ID3v1 Türkçe etiketler; ayrıca bunları taşıyan CI ve
  yayın. Sonraki fazların işleri (crossfeed, sözler, şarkı haritası) yalnızca Faz 1 yollarını etkiledikleri yerde.
- **Bu denetim bağımsız değildir.** Önceki denetimleri (`DENETIM.md`, `DENETIM-2.md`) bilen bir koordinatör ve üç alan
  denetçisi (ses motoru; kütüphane ve çekirdek; arayüz ve sahneler) çalıştı. Üç görev vardı:
  1. Önceki denetimlerin "açık" ve "kısmen" maddelerinin bugünkü durumu (kodla kanıt).
  2. **Gerileme denetimi:** 0.0.50'den (`dbfb3e4`) bu yana Faz 1 yollarındaki değişikliklerin karşıt gözle okunması:
     "bu düzeltme neyi bozmuş olabilir?"
  3. Yeni bulgular.
- **Deneyler:** sınırlayıcının birebir python kopyası ve bağımsız gerçek tepe ölçümü; ffmpeg ile test seslerinin örnek
  sayısı karşılaştırması; 3 000 ve 10 000 şarkılık gerçekçi boyutta SQLite veritabanında sorgu süresi ve okunan bayt;
  silme korumasının birebir benzetimi; NFD Türkçe arama; sayfa ortası bozuk veritabanı; kütüphane seçiminin kaymasını
  gösteren arayüz testi. Betikler `docs/denetim-3/betikler/`.
- **Sınır:** Linux'ta yapıldı; WASAPI ve gerçek aygıt davranışı yalnızca kod okumasıyla. Denetçiler aynı model ailesinden.

## 2. Kalite kapıları (bu makinede, `main` @ `94bc3d6`)

| Denetim                                                         | Sonuç                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `npm run build`                                                 | temiz                                                  |
| `npm run lint`, `typecheck`, `format:check`                     | temiz                                                  |
| `npm test`                                                      | 40 dosya, 317 test geçti                               |
| `npm run check:commands`                                        | 54 komut, 54 çağrı, eşleşiyor                          |
| `npm run check:licenses`                                        | 242 paket, yasak lisans yok                            |
| `npm run check:audio`                                           | 340 dosya, ses dosyası yok                             |
| `npm run check:notices`                                         | güncel                                                 |
| `cargo fmt --check`                                             | temiz                                                  |
| `cargo clippy --all-targets -- -D warnings`                     | temiz                                                  |
| `cargo clippy --target x86_64-pc-windows-gnu --all-targets ...` | temiz (WASAPI ve MMCSS kodu dahil)                     |
| `cargo test`                                                    | 424 + 4 kodek (+ 7 diğer) geçti, 3 yoksayıldı, 0 düştü |
| `src/lib/bindings` üretimi                                      | depodakiyle aynı                                       |
| `cargo deny check licenses bans sources` / `advisories`         | temiz / temiz                                          |
| `npm run check:scenes` (Chromium 141, WebGL2 ve 2D yedek)       | geçti (bölüm 2.1)                                      |

### 2.1 Sahne denetimi

Bu makinede Playwright'ın beklediği tarayıcı sürümü kurulu değildi (ortam sorunu, kod değil). Kurulu Chromium 141
`SCENE_BROWSER_PATH` ile verilerek yeniden çalıştırıldı: beş sahne ekran kartı yolunda çizildi; sessizden tam sese en
büyük parlaklık farkı 0,030–0,089 (WCAG parlama eşiği 0,10'un altında); WebGL kapalıyken gece göğü 2D yedekle ve Lyra
ile göründü. Not: bu denetim yalnızca iki durağan ucu karşılaştırır, zaman içindeki parlama sayısını ölçmez (ARA-07;
ikinci denetim kare dizisiyle ölçer).

## 3. Önceki bulguların durumu (özet)

Alan raporlarındaki tablolar her maddeyi dosya:satır kanıtıyla veriyor. Özet:

| Alan                  | Düzeltildiği doğrulanan                       | Kısmen                                                          | Hâlâ açık                                                                      |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ses motoru            | S1, S2, S3, SES-03 (MMCSS), SES-11            | SES-01, SES-02, SES-04, MAT-01, SES-10, S6                      | S5, S7, S8, S9, S10, S11, U2, SES-05, SES-06, SES-07, SES-09, SES-12, SES-13   |
| Kütüphane ve çekirdek | KUT-06/K6, KUT-08, KUT-13(c)                  | KUT-01, KUT-02, KUT-03, KUT-05, KUT-09/K3, KUT-07, KUT-13(a, b) | K2 (ölçüldü: geçerli), K8–K15, A12/KUT-15, U7, KUT-10, -11, -12, -14, -16, -17 |
| Arayüz                | U3/ARA-02, U6, ARA-04, ARA-07 (yorum), ARA-08 | U4/ARA-03, U5/ARA-06, U8, U9, U10/ARA-01, ARA-05, ARA-07        | U2, U7, ARA-09…ARA-17, ARA-Ş2                                                  |

"Kısmen" maddelerinin çoğunun kalan kısmı bu denetimin yeni bulgusu oldu (bölüm 4). SES-14b kötüleşti: her yeni
şarkıda dosya 3 değil 6 kez açılıyor (D1-SES-08).

## 4. Bulgular

Kodlar: **D1-** = bu denetim; **SES** ses motoru, **KUT** kütüphane/çekirdek, **ARA** arayüz, **YAY** yayın.
Güven: **kesin** = kod akışı ya da deney kanıtladı; **yüksek**; **olası**.

### 4.1 Kritik

#### [D1-YAY-01] Çatal (fork) PR'ı sabit test linkindeki kurulum dosyasını değiştirebilir

- **Önem:** Kritik · **Güven:** yüksek (iş akışı tanımıyla kesin; GitHub'da saldırı denenmedi) · CVSS 3.1
  `AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:H/A:H` ≈ 8,3
- **Yer:** `.github/workflows/test-surumu.yml:12-16, 35-50`; `.github/workflows/ci.yml:9-13`
- **Kanıt:**
  ```yaml
  # test-surumu.yml
  on:
    workflow_run:
      workflows: [CI]
      types: [completed]
      branches: [main] # tetikleyen çalışmanın DAL ADINA bakar, deposuna bakmaz
  ...
  if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
  ...
  HEAD_SHA: ${{ github.event.workflow_run.head_sha || github.sha }} # bu commit derlenir
  ```
  `ci.yml` her `pull_request`'te, çatallardan gelenler dahil, çalışır. `workflow_run`'ın `branches` süzgeci tetikleyen
  çalışmanın `head_branch` değerine bakar; çatalın kendi `main` dalından açılan PR'da bu değer `main`'dir. CI yeşil
  biterse `derle` işi çatalın commit'ini (`head_sha`) derler; `yayinla` işi `contents: write` yetkisiyle `test-surumu`
  etiketini o commit'e taşır ve `Lyraska-Kurulum.exe`'yi değiştirir. Koşulda `workflow_run.event == 'push'` ya da
  `head_repository.full_name == github.repository` denetimi yok. Ek olarak çatalın kodu varsayılan dalın bağlamında
  çalıştığı için `setup-node` ve `rust-cache` önbelleklerine yazabilir (sonraki gerçek yayınları zehirleme).
- **Etki:** Proje sahibinin ve testçilerin indirdiği sabit linkteki program, kimliği belirsiz birinin derlediği bir
  programla değişir. GitHub'ın "ilk kez katkı verenden onay iste" ayarı varsayılan olarak açıktır ve saldırıyı bir
  onaya bağlar; daha önce katkısı kabul edilmiş bir hesap için onay gerekmez.
- **Önerilen düzeltme:** `derle` işinin koşuluna
  `github.event.workflow_run.event == 'push' && github.event.workflow_run.head_repository.full_name == github.repository`
  eklemek. Yayın notunda zaten commit ve SHA-256 yazıyor; bu denetim sonrası gözle de doğrulanabilir.
- **Önerilen test:** iş akışı için bir `scripts/` denetimi: `workflow_run` kullanan her iş akışında bu iki koşulun
  bulunması (CI'da).
- **Not:** Bu açık, ilk denetimin C1 bulgusunu ("test sürümü CI'yi beklemiyor") düzelten 0.0.48 değişikliğiyle geldi.

### 4.2 Yüksek

| Kod       | Bulgu                                                                                                                                                                                                                                                                                                                                                                        | Yer                                                                                          | Güven         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------- |
| D1-SES-01 | Aygıt toparlaması başarısız olunca şarkı kaybolur, "çal" hiçbir şey yapmaz. `recover_device` eski oturumu `restart` ile alır; yeni oturum açılamazsa `session = None` kalır, `play()` oturumsuzken `Ok(())` döner. Tek çıkış aygıtlı masaüstünde kulaklık çıkarılıp geri takılınca ses gelmez. 0.0.50'de "çal" kaldığı yerden sürüyordu (gerileme); bu yolu sınayan test yok | `audio/player.rs:946-967, 782, 925-940, 1234-1238`                                           | yüksek        |
| D1-KUT-01 | Analiz tablosundaki sürüm sütunları göçle kaydın sonuna eklendiği için büyük veri bloklarının arkasında; `analyzed_count`, `search` ve `pending_library_tracks` her seferinde dosyanın tamamını okuyor. Ölçüm: 3 000 şarkıda 496 MB okuma / ~145 ms; 10 000'de 660–720 ms; arka plan analizi boştayken 15 sn'de bir. Kapsayan indeksle 2,6 ms                                | `storage.rs:57-69, 96-101`; `library/db.rs`; `analysis/cache.rs:336-345`; `background.rs:26` | kesin (ölçüm) |

### 4.3 Orta

| Kod       | Bulgu                                                                                                                                                                                                                                                            | Yer                                                               | Güven         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------- |
| D1-KUT-02 | Silme koruması (KUT-01) "silinecek = bilinen" eşitliğine bakıyor; atlanan ya da okunamayan bir klasörün altında tek eski kayıt varsa eşitlik hiç tutmuyor. Benzetim: sürücü harfi kendi `$RECYCLE.BIN`'i olan başka diske geçince 1 000 şarkının hepsi silindi   | `library/scan.rs:158-167`                                         | kesin         |
| D1-KUT-03 | Nokta ile başlayan her klasör atlanıyor (`.38 Special`, `...And Justice for All`); eski kayıtları da donuyor, kullanıcıya söylenmiyor. Windows'ta gizlilik bir özniteliktir, ad değil                                                                            | `library/scan.rs:262-273`                                         | kesin         |
| D1-KUT-04 | Kütüphane durum yoklaması önceki isteği beklemiyor (U7) ve komutlar `async` içinde bloklayan kilit kullanıyor; D1-KUT-01 ile birleşince büyük kütüphanede istekler birikip görsel kareleri bekletebilir                                                          | `useLibrary.ts:97-111`; `commands.rs:245-248, 304-311`            | olası         |
| D1-SES-02 | Şarkı açılırken arayüzün bildirdiği "sıra yok" yeni oturuma ulaşmıyor (`install` güncel `next_path`'i yazmıyor); tek dosya açıldığında ya da sıranın son şarkısı seçildiğinde, şarkı bitince eski sıradan bir şarkı çalar                                        | `player.rs:825, 392, 908-940, 1069-1076`; `usePlayback.ts:96-103` | yüksek        |
| D1-SES-03 | Aygıt toparlama sayacı başarılı toparlamadan sonra ve arayüzden şarkı açınca sıfırlanmıyor; "çal"a hiç basmayan kullanıcıda üçüncü kulaklık olayından sonra toparlama durur                                                                                      | `player.rs:687-689, 953-958, 748, 1235`                           | kesin         |
| D1-SES-04 | Sınırlayıcı tavanı −1 dBTP: ekolayzer düz, eşitleme kapalıyken bile tepesi yüksek her kayıt sınırlanıyor (tam ölçekli 40–50 Hz'te THD+N −48…−51 dB; 0.0.50'de bit bit geçiyordu). Ekolayzer korumasının boşluğu hâlâ 0 dBTP'ye göre. **Karar gerekir** (bölüm 5) | `limiter.rs:9-11, 36-38`; `normalize.rs:242`                      | kesin (deney) |
| D1-ARA-01 | Kütüphane seçimi sıra numarasıyla tutuluyor: tarama ya da aramayla liste değişince vurgu başka şarkıya kayıyor ve Enter o şarkıyı çalıyor (deneyde Beta seçildi, araya Ayva girdi, Enter Ayva'yı çaldı)                                                          | `LibraryPanel.tsx:54-57, 98-103`                                  | kesin (deney) |
| D1-KUT-05 | Bozuk veritabanını kenara alma (KUT-02) yalnızca açılışta hata veren bozulmayı yakalıyor; dosyanın ortasındaki bozulmada açılış geçiyor, sonra her sorgu "malformed". `PRAGMA quick_check` buluyor (Düşük–Orta)                                                  | `library/db.rs:66-93, 435-447`                                    | kesin (deney) |

### 4.4 Düşük

| Kod       | Bulgu (kısa)                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1-SES-05 | Erken ses yüksekliği tahmini (ilk 5 sn) sessiz girişli şarkıda sesi yükseltip sınırlayıcıyı birkaç saniye zorlayabilir; tahmin yalnızca kısmalı                                           |
| D1-SES-06 | Durdur, bitince/hatada "çal", bit-perfect değişimi, aygıt toparlama ve kör test hâlâ oynatıcı kilidi altında tam geçiş yapıyor (SES-02'nin kalanı)                                        |
| D1-SES-07 | Açma/sarma sürerken gelen duraklat, durdur, sar, bit-perfect komutları sessizce yok sayılıyor; üst üste iki hazırlık iki oturum açabiliyor                                                |
| D1-SES-08 | Her yeni şarkıda dosya 6 kez açılıyor; söz ve kapak komutları `async` içinde bloklayan dosya erişimi yapıyor                                                                              |
| D1-SES-09 | 96/192 kHz'te gerçek tepe kaçırma payı 0,3–0,7 dB (belgede 0,04); testler yalnızca 44,1/48 kHz. 0 dBTP hiç aşılmıyor                                                                      |
| D1-SES-10 | Küçük notlar: ayrık aygıt izleyici, "tek unsafe" belgesi (iki blok), kör test aygıt değişimini izlemiyor, toparlamada son 0,1–0,3 sn yeniden duyulur                                      |
| D1-KUT-06 | Veri klasörü taşıması diskler arasında hep başarısız ve günlüğe yazılmıyor; tek kopya koruması olmadığından iki kopya aynı anda açılırsa kütüphane öksüz kalabilir                        |
| D1-KUT-07 | README/MIMARI veri klasörünü `com.lyraska.app` diye gösteriyor (gerçek ad `io.github.gozlemesevdalisi.lyraska`); README elle yapılmış işaretlerin klasörünü "güvenle silinebilir" sayıyor |
| D1-KUT-08 | Tam tarama ilerlemesi klasör başına sıfırlanıyor; tarama bayrağının sürekliliği test edilmiyor                                                                                            |
| D1-KUT-09 | Bilerek boşaltılmış kaynakta "hiçbiri bulunamadı" uyarısı ve eski kayıtlar hiç bitmiyor; mesaj ne yapılacağını söylemiyor                                                                 |
| D1-KUT-10 | Parametrik EQ ayar kaydı (fsync) oynatıcı kilidi altında; `parametric_import` boyut sınırsız okuyor                                                                                       |
| D1-KUT-11 | Küçük sağlamlık boşlukları: okunamayan ayar dosyası kullanıcıya söylenmiyor, `.bozuk` yedekleri eziliyor/temizlenmiyor, VACUUM yok                                                        |
| D1-ARA-02 | Boşta seyrek çizim (0.0.52) duraklatma/durdurma anındaki ibre ve çubuk düşüşünü de 15 kare/sn'ye indiriyor: kesik kesik düşüş                                                             |
| D1-ARA-03 | WebGL bağlam kaybı günlüğe yazılmıyor; bağlam geri gelmezse gece göğü boş kalıyor, 2D yedeğe geçilmiyor                                                                                   |
| D1-ARA-04 | Kütüphane grid'inin ARIA yapısı hatalı (odak rolsüz öğede, satır sayımı başlığı saymıyor)                                                                                                 |
| D1-ARA-05 | 0.0.53 ekolayzer görünüm sekmeleri sekme örüntüsünü eksik uyguluyor                                                                                                                       |
| D1-ARA-06 | Sözler çalma denetimlerinin hata sınırında (sözlerdeki hata çal/duraklat'ı da kapatır); sözler, drop sayacı ve şerit üç ayrı zaman tabanında                                              |
| D1-ARA-07 | Açılışta açık gelen çekmeceden Enter ile çalınca odak sayfa gövdesine düşüyor                                                                                                             |

## 5. Proje sahibinin kararını bekleyen

- **D1-SES-04 — sınırlayıcının tavanı.** Bugün ses yolu her zaman −1 dBTP'de sınırlıyor; bu, ekolayzer ve eşitleme
  kapalıyken de yüksek kayıtları çok az değiştiriyor. Seçenekler:
  - **(a) Önerilen:** ses yolunda hiçbir yükseltme yokken (ekolayzer, bas, eşitleme kazancı ≤ 0) tavan 0 dBTP, yani
    kayıt olduğu gibi geçer; yükseltme varken −1 dBTP. Ekolayzer korumasının boşluk hesabı da tavana göre düzeltilir.
  - (b) Her zaman −1 dBTP (bugünkü hâl); yalnızca belgeye yazılır.

## 6. Önerilen öncelik sırası

1. **D1-YAY-01** (iki satır; hemen).
2. **D1-SES-01**, **D1-SES-03** (aygıt toparlama; gerileme, önce hatayı yakalayan test).
3. **D1-KUT-02**, **D1-KUT-03** (veri kaybı sınıfı).
4. **D1-KUT-01** + **D1-KUT-04** (V8 göç adımı: kapsayan indeks; yoklama uçuş denetimi).
5. **D1-SES-02**, **D1-ARA-01** (yanlış şarkı çalınması).
6. **D1-SES-04** (karar sonrası), **D1-KUT-05**.
7. Düşükler, alan alan.

İkinci (bağımsız) denetimin bulgularıyla birleşik öncelik sırası `DENETIM-4.md`'de.
