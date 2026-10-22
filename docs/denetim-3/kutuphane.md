# Kütüphane, depolama, ayarlar, günlük ve komutlar (KUT) — Denetim 1 raporu

## 1. Kapsam ve yöntem

- Depo: `main` @ `94bc3d6` (0.0.56), salt okunur. Gerileme tabanı: `dbfb3e4` (0.0.50).
- Okunan dosyalar (bütünüyle ya da ilgili kısımlar): `src-tauri/src/library/{mod,db,scan,service}.rs`, `storage.rs`,
  `data_dirs.rs` (yeni), `settings.rs`, `diagnostics.rs`, `lib.rs`, `commands.rs` (Faz 1 komutları ve 0.0.53–0.0.56'da
  eklenen dosya okuyan/yazan komutlar), `audio/decode.rs` (etiket, ID3v1, kapak, gömülü sözler), `audio/lyrics.rs`
  (dosya boyutu sınırı), `analysis/cache.rs`, `analysis/spectrogram.rs` (yarım analiz), `analysis/background.rs`
  (önbellek sorgusunun sıklığı), `tauri.conf.json`, `capabilities/default.json`, arayüzde `src/hooks/useLibrary.ts`,
  `useEqualizer.ts`, `src/lib/backend.ts`; belgeler `README.md`, `docs/MIMARI.md`, `docs/DOGRULAMA.md`.
- Ayrıca symphonia 0.6.1 kaynağı (`symphonia-core/src/formats/probe.rs`, `meta.rs`) — kapak okumasında etiket
  revizyonlarının sırasını doğrulamak için; walkdir 2.5.0 (`follow_root_links`).
- Deneyler (python3 + sqlite3 3.45.1; şema `storage.rs`'teki V1–V7 adımlarından birebir çıkarıldı), betikler:
  `/tmp/claude-0/-home-user-Lyraska/ff7ef590-e2e9-5d59-b985-b6cbad3a113b/scratchpad/d1/kutuphane/`
  - `bench_k2.py`, `q_k2.py`: 3 000 ve 10 000 şarkılık, gerçekçi blob boyutlu (şarkı başına ~165 KB) veritabanında
    kütüphane sorgularının süresi ve okunan bayt (K2).
  - `kut01_guard.py`: `scan.rs:157-167` koruma mantığının birebir karşılığı.
  - `k10_nfd.py`: `search_key` + `LIKE` ile NFD arama ve LIKE kaçışı.
  - `kut02_midpage.py`: sayfa ortasında bozulmuş veritabanının açılış denetiminden geçmesi.
- Ağır derleme yapılmadı. Rust testleri koordinatörün bildirdiğine göre hepsi geçiyor.

## 2. Önceki bulguların durumu

| Kod          | Konu                                        | Bugünkü durum                       | Kanıt                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| KUT-01       | Boş görünen kök bütün şarkıları siler       | **kısmen**                          | `scan.rs:163` "hepsi kayıp" koruması var ve testli (`bos_gorunen_kok_sarkilari_silmez`). Ama atlanan/okunamayan yoldaki tek bir eski kayıt korumayı devre dışı bırakıyor → **D1-KUT-02**                                                                                       |
| KUT-02 / K7  | Bozuk veritabanından kurtulma               | **kısmen**                          | `db.rs:435-470` kenara alma çalışıyor, ama yalnızca açılışta hata veren bozulmayı yakalıyor (başlık ya da göç). Dosyanın ortasındaki bozulma açılıştan geçiyor, sonra her sorgu "malformed" veriyor (deney) → **D1-KUT-05**                                                    |
| KUT-03       | Büyük veri Roaming'de                       | **kısmen**                          | `data_dirs.rs` + `lib.rs:37-43` kütüphaneyi ve günlükleri taşıyor. Kalanlar: diskler arası `rename` hep başarısız oluyor (klasör yönlendirmesi tam da hedeflenen durum), hiçbir şey günlüğe yazılmıyor; `kalibrasyon/` hâlâ Roaming'de (`commands.rs:366-370`) → **D1-KUT-06** |
| KUT-05       | Geri dönüşüm kutusu ve sistem klasörleri    | **kısmen / aşırı**                  | `scan.rs:265-273`: ad listesi var; Windows gizli/sistem özniteliğine bakılmıyor. Nokta ile başlayan **her** klasör atlanıyor; bu, gerçek albüm klasörlerini de dışarıda bırakıyor → **D1-KUT-03**                                                                              |
| KUT-06 / K6  | Okunamayan ayar dosyasının üstüne yazma     | **birleşti (doğrulandı)**           | `settings.rs:49-63`: `NotFound` dışındaki hatada `path: None`, günlüğe yazılıyor; test `okunamayan_dosya_ustune_yazilmaz`. Kalan küçük nokta: kullanıcıya söylenmiyor (D1-KUT-11)                                                                                              |
| K3 / KUT-09  | Tam tarama klasör klasör                    | **kısmen**                          | `service.rs:277,296`: `scanning` bayrağı artık klasörler arasında düşmüyor. Ama `scan_folder` her klasörde `begin` ile `found`/`processed`'i sıfırlıyor (`scan.rs:94-96`): ilerleme yine klasör başına sıfırdan başlıyor. Bayrağın sürekliliği için test yok → **D1-KUT-08**   |
| KUT-08       | Şarkı açma kilit altında                    | **birleşti**                        | `commands.rs:164-172`: `begin_transition` → `spawn_blocking(prepare)` → `install`                                                                                                                                                                                              |
| K2           | Analiz tablosu sorguları yavaşlatıyor mu    | **geçerli, ölçüldü**                | Her sorgu analiz blob'larının bütününü okuyor: 10 000 şarkıda 660–720 ms, 3 000 şarkıda dosyanın tamamı (496 MB) okunuyor → **D1-KUT-01**                                                                                                                                      |
| K8           | OneDrive yer tutucuları indiriliyor         | açık                                | `scan.rs:276-306`: öznitelik denetimi yok (`FILE_ATTRIBUTE_RECALL_*` aranmıyor)                                                                                                                                                                                                |
| K9           | Sembolik bağ sessizce atlanıyor             | açık                                | `scan.rs:282` `follow_links(false)`; alt bağlar ne sayılıyor ne bildiriliyor (kök bağı izleniyor: walkdir 2.5.0 `follow_root_links: true`)                                                                                                                                     |
| K10          | NFD Türkçe arama                            | **açık (deneyle doğrulandı)**       | `mod.rs:69-96` normalleştirme yapmıyor. NFD "Şebnem Ferah" kaydı ne "sebnem" ne de "Şebnem" aramasıyla bulunuyor (`k10_nfd.py`: 0 sonuç)                                                                                                                                       |
| K11 / KUT-04 | Liste sınırsız isteniyor                    | açık                                | `backend.ts:374-375` `invoke("library_search", { query })`: `limit` yok → `MAX_RESULTS` 50 000; `useLibrary.ts:85-95` her `trackCount` değişiminde yeniden istiyor                                                                                                             |
| K12          | Günlükte kullanıcı adı                      | açık                                | maskeleme yok. Yeni satırlar da tam yol yazıyor: `db.rs:81-84` (kenara alma), `commands.rs:280` (bırakılanlar), `settings.rs:56`                                                                                                                                               |
| K13          | Tek kopya koruması                          | açık                                | `Cargo.toml`'da yalnızca `tauri-plugin-dialog`; yeni bir sonucu var: göç yarışı (D1-KUT-06 b)                                                                                                                                                                                  |
| K14          | UTF-8 olmayan yollar                        | açık (taşma kısmı birleşti)         | `scan.rs:155`, `db.rs:` `to_string_lossy` sürüyor                                                                                                                                                                                                                              |
| K15          | `indexing_slicing` lint'i                   | açık                                | `Cargo.toml:47-51`: yalnızca `unwrap_used`, `expect_used`, `panic`                                                                                                                                                                                                             |
| A12 / KUT-15 | Saniye çözünürlüğünde mtime                 | açık                                | `cache.rs:139` `d.as_secs() as i64`                                                                                                                                                                                                                                            |
| U7           | Yoklama, sürmekte olan isteği izlemiyor     | açık; K2 ile birleşince ağırlaşıyor | `useLibrary.ts:101,109` `setInterval(() => void refreshStatus(), …)`, sürmekte olan istek denetimi yok → **D1-KUT-04**                                                                                                                                                         |
| KUT-07       | Test boşlukları                             | kısmen                              | (a) boş kök ve (c) SQLite olmayan dosya testli; iptal, eşzamanlı ayar, sayfa ortası bozulma, göç yarıda kesilmesi, `data_dirs` geri alma yolu test edilmiyor                                                                                                                   |
| KUT-10       | Kilit zehirlenmesi "Query is not read-only" | açık                                | `service.rs:94-96`, `scan.rs:318-321` hâlâ `rusqlite::Error::InvalidQuery`                                                                                                                                                                                                     |
| KUT-11       | Veri klasörü hatası "Klasör okunamadı"      | açık, genişledi                     | `db.rs:69` ve yeni `move_corrupt_aside` içindeki `rename` (`db.rs:458`) de `LibraryError::Io` → "Klasör okunamadı: …"                                                                                                                                                          |
| KUT-12       | Günlük döndürme / UTC                       | açık                                | `diagnostics.rs:96-101` değişmedi                                                                                                                                                                                                                                              |
| KUT-13       | Komut girişleri                             | kısmen                              | (c) birleşti: `annotation.rs:90` `retain(is_finite && >= 0)`. (a) `headphone_import` (`commands.rs:437`) ve yeni `parametric_import` (`commands.rs:527`) boyut sınırı olmadan `read_to_string` yapıyor. (b) `add_folder` göreli yolu hâlâ kabul ediyor (`service.rs:119-125`)  |
| KUT-14       | Harf farklı aynı yol                        | açık                                | değişmedi                                                                                                                                                                                                                                                                      |
| KUT-16       | WAL denetim noktası, VACUUM yok             | açık                                | `grep` sonucu: `optimize`, `VACUUM`, `wal_checkpoint` yok                                                                                                                                                                                                                      |
| KUT-17       | CSP `'unsafe-inline'`                       | açık                                | `tauri.conf.json` `style-src 'self' 'unsafe-inline'`                                                                                                                                                                                                                           |

## 3. Gerileme denetimi (0.0.50 → 0.0.56)

Alandaki farklar: `data_dirs.rs` (+103), `db.rs` (+115), `scan.rs` (+114), `service.rs` (+47), `settings.rs` (+80),
`lib.rs` (+57/−), `commands.rs` (+200), `decode.rs` (+30, gömülü sözler), `cache.rs` (sürüm artışları),
`capabilities/default.json` (`dialog:allow-save`). `storage.rs` değişmedi: göç listesi hâlâ V1–V7. Sıra ve geri
alınamazlık kuralları korunmuş, yeni adım eklenmemiş.

Değişiklik değişiklik "bu neyi bozmuş olabilir?":

- **KUT-01 koruması (`scan.rs:157-167`):** Koruma `removed.len() == known.len()` koşuluna bağlı. KUT-05 ile gelen
  `skipped` listesi `untouched`'a katıldığı için, atlanan bir klasörün altındaki tek bir eski kayıt bile eşitliği bozuyor
  ve korumayı kapatıyor. İki düzeltme birbirini zayıflatıyor → **D1-KUT-02**. Ayrıca "kuşkulu" durumda yabancı diskteki
  dosyalar yine `to_read` ile kütüphaneye ekleniyor ve arka planda analiz ediliyor (`scan.rs:168-176`). Disk geri gelince
  bunlar silinir; veri kaybı yok ama boşa giden analiz saatleri olabilir.
- **KUT-05 atlama (`scan.rs:265-273`):** Nokta ile başlayan klasörleri atlamak Unix alışkanlığı. Windows'ta gizlilik bir
  özniteliktir, ad değil. Gerçek albüm ve sanatçı klasörleri atlanıyor; önceden kütüphanede olanlar da "untouched"
  sayıldığı için bir daha ne güncelleniyor ne siliniyor → **D1-KUT-03**.
- **KUT-02 kenara alma (`db.rs:66-93`):** Hatalı bağlantı `init` içinde düşürülüyor, sonra `rename` yapılıyor; Windows'ta
  dosya tutamağı açıkken taşıma sorunu yok (doğru). SQLite 0 baytlık yeni dosyada eski `-wal`'ı siliyor; test bunu
  doğruluyor. `Newer` (daha yeni şema) hatası bozulma sayılmıyor, kenara alınmıyor (doğru). Yanlış pozitif yolu bulunamadı.
  Boşluk: sayfa ortasındaki bozulma (D1-KUT-05). `-wal` taşınamazsa ana dosya kenara alınmış ama işlem hata dönmüş
  oluyor (`db.rs:466` `?`). Bir sonraki açılışta boş kütüphane kuruluyor ve bildirim çıkmıyor. Nadir.
- **KUT-03 taşıma (`data_dirs.rs:20-51`):** Kütüphane dosyası taşınamazsa geri alma yolu doğru. Ama (a) diskler arası
  `rename` hiçbir zaman çalışmıyor, sessizce Roaming'de kalınıyor; (b) iki kopya aynı anda açılırsa geri alma, öteki
  kopyanın taşıdığı dosyayı geri götürebiliyor (K13 ile) → **D1-KUT-06**. Taşıma `diagnostics::init`'ten önce koştuğu
  için ne başarısı ne başarısızlığı günlükte (`lib.rs:37-46`).
- **KUT-06 (`settings.rs`):** Doğru. Yeni alanlar (`parametric`, `crossfeed`) alan alan okumaya eklenmiş ve testli
  (`crossfeed_alani_bozuksa_…`). Gerileme yok.
- **KUT-09 (`service.rs:262-298`):** Bayrak düzeldi; sayaçlar düzelmedi (D1-KUT-08). Gerileme yok.
- **Yeni komutlar (0.0.53–0.0.56):** `song_map_import` (`map_file.rs:303-309`) ve `.lrc` okuma (`lyrics.rs:107-116`)
  boyut sınırlı (iyi). `parametric_import` sınırsız (KUT-13a'nın yeni örneği). `apply_parametric`
  (`commands.rs:545-550`), `settings.json`'u `sync_all` ile diske yazarken oynatıcı kilidini tutuyor → D1-KUT-10.
  `parametric_export` / `song_map_export` arayüzden gelen herhangi bir yola yazıyor; tehdit modeli (yerel arayüz, sıkı CSP,
  `innerHTML` yok — `grep` boş) içinde kabul edilebilir.
- **Spektrum 1→2, ritim 3→4 (`cache.rs:60-64`):** Kurala uygun, yalnızca ilgili parçalar arttırılmış. Spektrum artışı
  bütün kütüphaneyi yeniden analiz ettiriyor; bu, 0.0.52'de bilerek verilmiş bir karar.

## 4. Yeni bulgular (önem sırasıyla)

### [D1-KUT-01] Analiz tablosundaki sürüm sütunları blob'ların arkasında: her kütüphane sorgusu bütün analiz verisini diskten okuyor (K2'nin yanıtı)

- **Önem:** Yüksek (büyük kütüphanede sürekli disk G/Ç, takılma, pil; "1 saat çalmada sıfır takılma" ve 60 fps hedefleriyle çelişiyor)
- **Güven:** kesin (ölçüm)
- **Yer:** `storage.rs:57-69` (V1: `levels`, `meters`, `onset` blob'ları), `storage.rs:96-101` (V5: sürüm sütunları
  `ALTER TABLE ADD COLUMN` ile kaydın **sonuna**), `db.rs` `VALID_ANALYSIS_JOIN` / `FULLY_CURRENT` (`analyzed_count`,
  `search_with`), `cache.rs:336-345` (`pending_library_tracks`), `background.rs:26` (`IDLE_POLL` = 15 s).
- **Kanıt:** SQLite bir sütuna ulaşmak için kaydın taşma sayfası zincirini baştan yürür. `spectrum_version` (= 2) ve
  `rhythm_version` (= 4) 1 baytlık gövde taşıdığı için blob'lardan sonra, taşma sayfalarında duruyor. 0 ve 1 değerleri
  gövdesiz olduğundan `loudness/bass/key_version` ucuz. Ölçüm (`q_k2.py`, sıcak önbellek):

  | sorgu                                                       | 3 000 şarkı (494 MB) | 10 000 şarkı (1,65 GB) | 3 000, kapsayan indeksle |
  | ----------------------------------------------------------- | -------------------- | ---------------------- | ------------------------ |
  | `analyzed_count` (`library_status` her çağrıda)             | 144 ms               | 689 ms                 | 2,6 ms                   |
  | `search` boş sorgu (liste)                                  | 150 ms               | 717 ms                 | 15 ms                    |
  | `pending_library_tracks` (arka plan, boştayken 15 s'de bir) | 141 ms               | 657 ms                 | 2,2 ms                   |

  Tek sütun karşılaştırması (10 000): `SUM(file_size)` 2,0 ms, `SUM(spectrum_version)` 564 ms. Bir `pending`
  sorgusunda `/proc/self/io` `rchar`: **496 MB okundu, dosya 494 MB**: her sorgu dosyanın tamamını okuyor.

- **Etki:**
  - Bütün analizler bitmiş olsa bile arka plan analizi her 15 saniyede bir bütün analiz verisini okuyor. 20 000 şarkıda bu
    ~3,3 GB. RAM'i yetmeyen makinede (8 GB) her seferinde diskten okunur: müzik çalarken sürekli disk G/Ç, HDD'de
    takırtı, dizüstünde pil.
  - Sorgu süresince `AnalysisCache` kilidi tutuluyor: o anda şarkı açılırsa önbellekten okuma bekler.
  - `library_status` ve `search` aynı maliyetle `Library` kilidini tutuyor: tarama yazıcısı da bekliyor. U7 ile birleşince
    istek birikiyor (D1-KUT-04).
  - Maliyet doğrusaldan hızlı büyüyor (3 000 → 10 000: 4,8×).
- **Önerilen test:** `storage.rs`'te `EXPLAIN QUERY PLAN` ile `analyzed_count`, `search_with` ve `pending_library_tracks`
  sorgularının analiz tablosunu `COVERING INDEX` ile taradığını doğrulayan test. İsteğe bağlı olarak 2 000 satırlık,
  100 KB blob'lu ölçüm: `< 20 ms`.
- **Önerilen düzeltme:** Sona eklenecek **V8** göç adımı:
  `CREATE INDEX IF NOT EXISTS analyses_current ON analyses(path, file_size, modified, spectrum_version, rhythm_version, loudness_version, bass_version, key_version, bpm, camelot);`
  (deneyde 55× hızlanma; satır başına ~100 bayt). `rebuild_cache` bu indeksi de yeniden kurar, çünkü `sqlite_master`
  `tbl_name = 'analyses'` olanları kopyalıyor. Ek olarak boştaki 15 s yoklamasını uyandırma olayına (tarama bitti,
  önbelleğe yazıldı) bağlamak.

### [D1-KUT-02] KUT-01 koruması, atlanan ya da okunamayan yolda tek bir eski kayıt varsa kapanıyor: bütün kütüphane yine silinebiliyor

- **Önem:** Orta (veri kaybı sınıfı, koşullu)
- **Güven:** kesin (mantık + birebir benzetim)
- **Yer:** `scan.rs:158-167`
  ```rust
  let untouched: Vec<PathBuf> = unreadable.iter().chain(skipped.iter()).cloned().collect();
  let mut removed = removal_candidates(known.keys(), &on_disk, &untouched);
  let suspicious = if !known.is_empty() && removed.len() == known.len() { … }
  ```
- **Kanıt:** `untouched` altındaki bilinen yollar `removed`'dan çıkarılıyor; karşılaştırma ise `known.len()` ile yapılıyor.
  Bilinen tek bir kayıt atlanan bir klasörün altındaysa eşitlik hiçbir zaman tutmuyor. `kut01_guard.py`:
  0.0.50'de `E:\` kökü olarak eklenmiş (KUT-05 hatası yüzünden çöp kutusundan 3 kayıt içeren) 1 000 şarkılık kütüphane;
  `E:` harfini kendi `$RECYCLE.BIN` klasörü olan başka bir USB bellek alınca → **1 000 şarkı silindi, suspicious = 0**.
  Aynı disk çöp kutusuz olsaydı → silinen 0, suspicious = 1 003. KUT-05'in eski kayıtları bir daha hiç silinmediği için
  bu koşul kalıcıdır. `$RECYCLE.BIN` ise bir kez dosya silinmiş her NTFS/FAT USB bellekte bulunur. Aynı şey okunamayan
  bir alt klasörün altındaki eski kayıtlar ve D1-KUT-03'teki nokta klasörleri için de geçerli.
- **Etki:** KUT-01'in tam olarak kapatmak istediği senaryoda (sürücü kökü + harf değişimi) bütün şarkılar ve tetikleyiciyle
  analizleri silinebiliyor.
- **Önerilen test:** `bos_gorunen_kok_sarkilari_silmez`'in yanına
  `atlanan_klasorde_eski_kayit_varken_bos_kok_yine_silmez`: kütüphaneye `$RECYCLE.BIN/x.mp3` kaydını elle ekle, şarkıları
  taşı, `$RECYCLE.BIN` klasörünü bırak, yeniden tara → `removed == 0`, `suspicious > 0`.
- **Önerilen düzeltme:** Ölçüt "silinmeye aday olanların sayısı" değil "bilinenlerden **hiçbiri** diskte bulunmadı"
  olmalı: `let found_any = known.keys().any(|k| on_disk.contains(k)); if !known.is_empty() && !found_any && !removed.is_empty() { suspicious = removed.len(); removed.clear(); }`.
  Daha güvenlisi, DENETİM-2'nin önerdiği eşik: silinecekler bilinenlerin %50'sinden fazlaysa silme. Ek olarak çöp kutusu
  altındaki eski kayıtları bir kez temizleyen bir göç düşünülebilir.

### [D1-KUT-03] Nokta ile başlayan her klasör atlanıyor: gerçek albüm/sanatçı klasörleri hiç taranmıyor, eski kayıtları donuyor

- **Önem:** Orta (temel vaat: klasör tarama; sessiz)
- **Güven:** kesin (davranış); yaygınlığı olası
- **Yer:** `scan.rs:262-273`
  ```rust
  name.starts_with('.') || SKIPPED_DIRS.iter().any(|s| s.eq_ignore_ascii_case(name))
  ```
- **Kanıt:** Ölçüt yalnızca ada bakıyor. Gerçek örnekler: sanatçı `.38 Special`, Metallica'nın
  `...And Justice for All` albümü (`Metallica\...And Justice for All\`), `.Arşiv` gibi kullanıcı adları. Windows'ta bu
  klasörler gizli değildir (gizlilik `FILE_ATTRIBUTE_HIDDEN`'dır). Atlanan yollar `untouched`'a girdiği için 0.0.50'den
  kalan kayıtlar ne güncelleniyor (etiket değişikliği görünmez) ne de dosya silinince çıkarılıyor. Kullanıcıya hiçbir şey
  söylenmiyor: `ScanSummary`'de atlanan sayısı yok.
- **Etki:** Yeni kullanıcıda bu albümler kütüphaneye hiç girmez; eski kullanıcıda kayıtları donar. Ayrıca D1-KUT-02'yi
  tetikleyebilir.
- **Önerilen test:** `nokta_ile_baslayan_album_klasoru_taranir` (`...And Justice for All/a.mp3` bulunur);
  `.stfolder`/`.Trash-1000` gibi bilinen adlar yine atlanır.
- **Önerilen düzeltme:** Nokta kuralını kaldırıp bilinen adlar listesini genişletmek (`.Trash-*`, `.stfolder`,
  `.stversions`, `.snapshot`, `.@__thumb`, `#recycle`); Windows'ta `MetadataExt::file_attributes()` ile
  HIDDEN **ve** SYSTEM birlikte olan klasörleri atlamak. Atlanan sayısını günlüğe yazmak.

### [D1-KUT-04] Yoklama, sürmekte olan isteği beklemiyor ve kütüphane komutları async iş parçacığını engelliyor: büyük kütüphanede istekler birikip görsel kareleri bekletebilir (U7 + K2)

- **Önem:** Orta
- **Güven:** olası (parçaları kesin; birleşik etki ölçülmedi)
- **Yer:** `useLibrary.ts:97-111`; `commands.rs:245-248`, `:304-311` (`async fn` içinde `std::sync::Mutex`);
  `service.rs:94-112`
- **Kanıt:**
  - Arayüz tarama sürerken 600 ms'de bir, analiz sürerken 3 s'de bir `getLibraryStatus` çağırıyor; bir önceki çağrının
    bitmesini beklemiyor (`setInterval(() => void refreshStatus(), …)`).
  - Açılışta her zaman tam tarama koşuyor (`lib.rs:48`); 20 000 şarkıda dosya yürüyüşü saniyeler sürer.
  - D1-KUT-01'e göre bu kütüphanede bir `library_status` ~1 s sürer ve `Library` kilidini tutar. Gelen istek hızı
    (1,67/sn) hizmet hızından (~1/sn) büyük olduğundan kuyruk büyür.
  - Tauri `async` komutları tokio çalışanlarında koşar (çalışan sayısı = çekirdek sayısı). `self.lock()` ise çalışanı
    engelleyen `std::sync::Mutex`. Kilit bekleyen birkaç `library_status` bütün çalışanları tutabilir; aynı havuzu
    kullanan `visual_frame` (saniyede 60) ve `playback_status` bekler.
- **Etki:** Büyük kütüphanede açılıştan sonraki tarama boyunca sahne ve ilerleme çubuğu takılır, istek kuyruğu tarama
  bitene kadar erimez.
- **Önerilen test:** Vitest: `useLibrary` için "yanıt gelmeden ikinci durum isteği gönderilmez" (sahte zamanlayıcı,
  çözülmeyen promise). Rust: `status()` süresini ölçen, D1-KUT-01'in indeksiyle birlikte koşan test.
- **Önerilen düzeltme:** Arayüzde istek uçuştayken yeni istek göndermemek (EQ'daki `inFlight` deseni:
  `useEqualizer.ts:84-101`). `library_status`, `library_search`, `library_add_*` komutlarında işi `spawn_blocking` içine
  almak. `analyzed` sayısını sayaçtan vermek (KUT-04 önerisi).

### [D1-KUT-05] KUT-02 yalnızca açılışta görünen bozulmayı yakalıyor: dosyanın ortasındaki bozulmada kütüphane yine her açılışta kapalı

- **Önem:** Düşük–Orta
- **Güven:** kesin (deney)
- **Yer:** `db.rs:66-93` (`open`), `db.rs:435-447` (`is_corruption`), `storage.rs:164-210` (göç, güncel dosyada tabloları
  okumaz)
- **Kanıt:** `kut02_midpage.py`: 3 000 şarkılık, şeması güncel (sürüm 7) dosyada `tracks` ağacının bir yaprak sayfası
  bozuldu. Açılıştaki adımlar (`journal_mode`, `foreign_keys`, `BEGIN IMMEDIATE`, `user_version`,
  `pragma_table_info('analyses')`) **hatasız** geçiyor; dolayısıyla `Library::open` başarılı olur ve kenara alma
  tetiklenmez. Sonra `SELECT COUNT(*) FROM tracks` (= `track_count`, her `status()`) → "database disk image is malformed".
  `PRAGMA quick_check` sorunu açıkça buluyor ("Tree 6 page 24: btreeInitPage() ret…").
- **Etki:** Disk/antivirüs kaynaklı en olası bozulma biçiminde kullanıcı yine İngilizce SQLite hatasıyla kalıyor;
  KUT-02'nin "kullanıcı elle dosya silmesin" amacı yarım.
- **Önerilen test:** `db.rs`: dosyanın ortasındaki bir sayfayı boz → `Library::open` kenara alır ya da `quick_check`
  bildirimi döner.
- **Önerilen düzeltme:** `init`'ten sonra `PRAGMA quick_check(1)` çalıştırmak; sonuç `ok` değilse aynı kenara alma yolu.
  Büyük dosyada açılışı yavaşlatırsa arka planda çalıştırıp çalışma sırasındaki ilk `DatabaseCorrupt` hatasında bir
  sonraki açılış için işaret bırakmak.

### [D1-KUT-06] Veri klasörü taşıma: diskler arasında hep başarısız ve sessiz; iki kopya aynı anda açılırsa kütüphane öksüz kalabilir

- **Önem:** Düşük
- **Güven:** (a) kesin, (b) olası
- **Yer:** `data_dirs.rs:28-50`; `lib.rs:37-46`
- **Kanıt:**
  - (a) `std::fs::rename` farklı birimler arasında çalışmaz (std belgesi: "will not work if the new name is on a
    different mount point"; Windows'ta `MOVEFILE_COPY_ALLOWED` yok). KUT-03'ün asıl hedefi olan kurumsal profillerde
    Roaming sık sık ağ paylaşımına yönlendirilir; orada taşıma her açılışta başarısız olur ve Roaming kullanılmaya devam
    eder. Taşıma `diagnostics::init`'ten önce koştuğu için hiçbir iz kalmaz.
  - (b) Tek kopya koruması yok (K13). İki kopya ilk açılışta aynı anda `rename(library.sqlite3)` yaparsa biri başarılı
    olur, öteki başarısız olur ve geri alma döngüsü (`data_dirs.rs:35-40`) Local'deki — ötekinin az önce taşıdığı —
    dosyayı Roaming'e geri götürür. İlk kopya Local'de dosya bulamaz, boş kütüphane kurar ve taşıdığı `-wal`'ı SQLite
    siler (0 baytlık dosya). Sonraki açılışlarda Local'deki boş kütüphane kullanılır; asıl kütüphane Roaming'de öksüz
    kalır.
- **Etki:** (a) KUT-03 düzeltmesi hedef kitlesinde etkisiz; (b) nadir, ama olursa kullanıcı kütüphanesini "kaybolmuş"
  görür.
- **Önerilen test:** `data_dirs`: yerel hedef yazılamazken (salt okunur klasör) Roaming döner ve sonuç bir değerle
  bildirilir; `-wal` taşınamazsa ana dosya geri gelir.
- **Önerilen düzeltme:** `rename` hatasında (ör. `CrossesDevices`) kopyala → `sync_all` → doğrula → eskiyi sil. Taşıma
  sonucunu döndürüp günlük açıldıktan sonra yazmak. Tek kopya eklentisi (K13).

### [D1-KUT-07] Belgeler yanlış veri klasörünü gösteriyor; README işaretleri "güvenle silinebilir" sayıyor

- **Önem:** Düşük (yanlış yönlendirme; kullanıcı verisi kaybına götürebilir)
- **Güven:** kesin
- **Yer:** `README.md:48-50`, `docs/MIMARI.md:214-215`, `docs/devlog/2026-10-22.md:137` (`com.lyraska.app`);
  `tauri.conf.json:5` (`"identifier": "io.github.gozlemesevdalisi.lyraska"`); `library/mod.rs:11` ve
  `docs/DOGRULAMA.md:31` (kütüphane için hâlâ `%APPDATA%`)
- **Kanıt:** Tanımlayıcı hiçbir zaman `com.lyraska.app` olmadı: `git log -S` bu adı ilk kez 0.0.51 belgesinde gösteriyor.
  README "Both can be deleted safely" diyor. Oysa `%APPDATA%` altında `isaretler/` (proje sahibinin elle işaretlediği
  beat/drop'lar, saatlerce emek) ve `haritalar/` var; bunlar yeniden üretilemez.
- **Etki:** Proje sahibi ya da destek isteyen kullanıcı yanlış klasöre bakar. "Güvenle silinir" sözü işaretlerin
  kaybına yol açabilir. DOGRULAMA A0'daki adımlar 0.0.51'den sonra artık işe yaramıyor (Local'de kütüphane varken
  Roaming'e konan yedek okunmaz).
- **Önerilen düzeltme:** Adı her yerde `io.github.gozlemesevdalisi.lyraska` yapmak; README'de "Local klasörü silinebilir,
  Roaming'deki `isaretler/` sizin emeğinizdir" demek; `mod.rs:11` ve DOGRULAMA A0'ı güncellemek. Bir `scripts/` denetimi
  belgelerdeki tanımlayıcıyı `tauri.conf.json` ile karşılaştırabilir.

### [D1-KUT-08] KUT-09 yarım: tarama ilerlemesi klasör başına sıfırlanıyor; bayrağın sürekliliği test edilmiyor

- **Önem:** Düşük
- **Güven:** kesin
- **Yer:** `scan.rs:93-101` (`begin`: `found = 0`, `processed = 0`), `scan.rs:146-147`, `:180`; `service.rs:277-296`
- **Kanıt:** `run_scan` her klasör için `scan_folder` çağırıyor; `scan_folder` ilk iş `state.begin` ile sayaçları
  sıfırlıyor. `ScanProgress`'te toplam klasör ya da şarkı sayısı yok. Eski `scan_folders` artık yalnızca testlerde
  kullanılıyor (`scan.rs:360`, `:536`) ve kendi `set_scanning(false)`'ı ile üretim yolundan farklı davranıyor.
- **Etki:** "1200/1200 → 3/8000" sıçraması sürüyor; toplam ilerleme gösterilemiyor.
- **Önerilen test:** `service`: iki klasörlü tam taramada `progress().scanning` ilk klasörün sonunda `false` olmaz.
- **Önerilen düzeltme:** `begin`'i tarama başına bir kez çağırmak, sayaçları biriktirmek; `ScanProgress`'e
  `folder_index/folders` eklemek; ölü kalan `scan_folders`'ı kaldırmak ya da üretim yolu yapmak.

### [D1-KUT-09] "Kuşkulu" durum kalıcı: bilerek boşaltılmış klasör ve tek şarkılık kaynakta eski kayıtlar ve uyarı hiç bitmiyor

- **Önem:** Düşük
- **Güven:** kesin
- **Yer:** `scan.rs:163-167`, `scan.rs:144-146`; `service.rs:279-284`
- **Kanıt:** Kullanıcı bir kaynağın bütün şarkılarını gerçekten taşırsa ya da silerse (tek şarkılık kaynakta dosyayı
  silmek de bu durum: `FolderMissing`) kayıtlar sonsuza dek kalır. Her açılışta "…hiçbiri bulunamadı…" ya da
  "Bulunamadı…" uyarısı çıkar. Mesaj ne yapılacağını söylemiyor ("kaynağı kaldırın").
- **Önerilen düzeltme:** Mesaja "Bilerek boşalttıysanız kaynağı Kütüphane > Klasörler'den çıkarın" eklemek; ya da
  aynı durum N tam tarama ve M gün sürdüyse silmek.

### [D1-KUT-10] Ayar kaydı (fsync) oynatıcı kilidi altında; yeni içe aktarma komutunda boyut sınırı yok

- **Önem:** Düşük
- **Güven:** kesin
- **Yer:** `commands.rs:540-551` (`apply_parametric`: `let mut player = player.lock()?;` tutulurken
  `store.update` → `settings.rs:174-187` `sync_all`); `commands.rs:522-529` (`parametric_import` `read_to_string`)
- **Kanıt:** Öteki ayar komutları geçici kilidi bırakıp sonra kaydediyor (`equalizer_set` `commands.rs:326-330`).
  `apply_parametric` ise kaydetme boyunca oynatıcı kilidini tutuyor: HDD'de ya da ağ profilinde onlarca ms boyunca
  `visual_frame` bekler. `parametric_import` 2 GB'lık yanlış dosyayı belleğe okur (KUT-13a ile aynı sınıf;
  `map_file.rs:303-309` ve `lyrics.rs:107-111` ise sınırlı).
- **Önerilen düzeltme:** Kilidi `set_parametric` sonrası bırakmak; içe aktarmalara `MAX_FILE_BYTES` benzeri bir sınır
  koymak (AutoEq dosyası < 10 KB).

### [D1-KUT-11] Küçük sağlamlık boşlukları

- **Önem:** Düşük
- **Güven:** kesin
- (a) Ayar dosyası okunamayınca oturum boyunca kayıt yapılmıyor ama arayüze bildirilmiyor (`settings.rs:53-61`):
  kullanıcı ekolayzeri ayarlar, program kapanınca kaybolur.
- (b) `settings.json.bozuk` sabit ad (`settings.rs:118`): ikinci bozulma ilk yedeği ezer.
- (c) Kenara alınan `library.sqlite3.bozuk-*` dosyaları (GB'larca olabilir) hiç temizlenmiyor; aynı saniyedeki ikinci
  kenara alma (Windows'ta `rename` üzerine yazar) öncekini ezer (`db.rs:451-459`).
- (d) `move_corrupt_aside` ve veri klasörü hataları "Klasör okunamadı" metniyle dönüyor (KUT-11'in genişlemesi).
- (e) Analiz satırları yalnızca kütüphaneden silinen şarkı için siliniyor (`storage.rs:69-70`): kütüphane dışı açılan
  dosyaların (kalibrasyon kaydı, "Dosya aç") analizleri birikiyor; `VACUUM`/`optimize` olmadığından dosya hiç küçülmüyor
  (KUT-16).

## 5. Şüpheler

- **Ş1 — Tarama sırasında analiz önbelleği ile kütüphane arasında kilit beklemesi:** `pending_library_tracks` WAL'da
  okuyucu olduğu için yazıcıyı engellemiyor; ama 5 s'lik `busy_timeout` (`db.rs:119`, `cache.rs:178`) yazarken iki
  bağlantının birbirini beklemesi durumunda büyük kütüphanede aşılabilir mi? Ölçülemedi.
- **Ş2 — İçe aktarma doğrulaması oynatıcı kilidi altında:** `song_map_import` → `Player::import_song_map`
  (`player.rs:1145-1181`): `saved()` blob'ların kopyasını çıkarıyor ve parmak izi karşılaştırması yapıyor; bunlar
  `PlayerState` kilidi tutulurken yapılıyor. Süre ölçülmedi (ANL alanıyla sınırda).
- **Ş3 — 8 MB'a kadar kapak `data:` adresi olarak IPC'den geçiyor** (`decode.rs:440-447`): base64 ile ~11 MB dize her
  şarkı değişiminde (önbellek arayüzde varsa sorun yok). Ölçülmedi.
- **Doğrulanıp elenen aday:** Kapak okumasının `skip_to_latest()` ile yalnızca son revizyonu okuması (`decode.rs:454`)
  ID3v2 + ID3v1 dosyasında kapağı kaçırır mı? symphonia 0.6.1 `probe.rs:436-446` önce sondaki etiketleri (ID3v1/APE),
  sonra baştaki ID3v2'yi sıraya koyuyor; son revizyon ID3v2'dir. Kapak bulunur, hata yok.

## 6. Güçlü yanlar (kanıtla)

- **SQL enjeksiyonu yok:** bütün değerler bağlı parametre; `LIMIT` tamsayıdan biçimleniyor ve `MAX_RESULTS` ile
  kırpılıyor. LIKE kaçışı doğru (`escape_like`, `ESCAPE '\'`); `k10_nfd.py` ile `100%`, `a_b`, `c\d` yalnızca kendini
  buluyor.
- **Göçler sağlam:** `BEGIN IMMEDIATE` + savepoint, `Newer` şemada açmama (bozulma sayılmıyor, kenara alınmıyor);
  önbellek ile kütüphane ayrımı (`storage.rs:164-210`); V1–V7 değişmemiş.
- **Ayar yazımı:** geçici dosya + `sync_all` + `rename` (`settings.rs:174-187`); alan alan okuma; okunamayan dosyanın
  üstüne yazmama (testli).
- **Üst klasör eklemek analizleri silmiyor:** `replace_folders` şarkıları taşıyor (`db.rs` `UPDATE tracks SET folder_id`).
- **Kaynak çıkarılırken süren tarama yazmıyor** (`scan.rs:217-222`, `:226-228`).
- **Yeni okuyucular sınırlı:** `.lrc` (`lyrics.rs:107-111`) ve harita dosyası (`map_file.rs:303-309`) boyut denetimli;
  işaretlerde `is_finite` süzgeci (`annotation.rs:90`).
- **Güvenlik yüzeyi dar:** CSP `default-src 'self'`; izinler `core:default`, `dialog:allow-open`, `dialog:allow-save`;
  arayüzde `innerHTML` / `dangerouslySetInnerHTML` / `eval` yok (`grep` boş); `shell`/`fs`/`http` eklentisi yok.
- **ID3v1 Türkçe okuma** (`decode.rs:347-381`): UTF-8, 30 baytta kesilmiş UTF-8 ve Windows-1254 ayrımı testli; ID3v2
  öncelikli.
- **Yarım analiz saklanmıyor** (`spectrogram.rs:163-166`, `:607-612`, `:759-764`): A2 düzeltmesi tam ve yenileme
  yolunda da uygulanıyor.
