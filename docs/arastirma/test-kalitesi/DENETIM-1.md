# Test denetimi 1: Testler gerçekten bir şey sınıyor mu?

Tarih: 5 Kasım 2026. Kaynak: `claude/bit-perfect-ses` @ 0665069 (main'in güncel hâli + bit-perfect işi).
Depoda hiçbir dosya değiştirilmedi. Bütün denemeler scratchpad'deki depo kopyalarında yapıldı (`git status` temiz).

## Hüküm (kısaca)

- **"Testler öylesine, geçsin diye yazılmış" iddiası bu depo için büyük ölçüde yanlış.** Kodu bilerek bozdum (mutasyon
  testi): çekirdek ses ve analiz kodunda **160 bozmanın 135'ini testler yakaladı (%85)**. Kaçan 23 bozmanın 13'ü
  davranışı değiştirmeyen ya da ürüne etkisiz "eşdeğer" bozmalar; bunlar çıkarılınca oran **%93**.
- Arayüz hesaplarında (5 dosya) 80 bozmanın 63'ü yakalandı (%79); eşdeğer ve yalnızca yazı/etiket bozmaları
  çıkarılınca **%89**.
- Sahte test kalıpları yok denecek kadar az: hiçbir şey doğrulamayan test yok, atlanan 7 testin hepsinin gerekçesi yazılı,
  test eşikleri sessizce gevşetilmemiş (bulunan gevşetmeler gerekçeli, biri sahibinin onaylı).
- **Ama iddianın doğru olduğu bir yer var:** oynatıcının parametrik ekolayzer A/B karşılaştırması bağlantısı hiç test
  edilmiyor. Bu bağlantıyı silen 5 bozmanın **5'i de bütün 824 testten geçti** (önceki denetimin TST-04 bulgusu hâlâ açık).
- Toplam 10 gerçek test boşluğu (çekirdek) ve 8 küçük boşluk (arayüz) buldum; en ciddisi bit-perfect modda
  duraklatma geçişi ve boşluksuz geçişte taşma korumasının inişi. Hepsi birkaç satırlık testle kapatılabilir.

## Yöntem

1. **Rust mutasyon testi** (`cargo-mutants 27.1.0`). Her dosyanın bütün olası bozmalarından eşit aralıklı bir örneklem
   alındı (`--shard 0/n --sharding round-robin --no-shuffle`: kaynak sırasında her n'inci bozma). Bozma başına ilgili
   modülün ve onu kullanan modüllerin testleri çalıştı (örn. limiter için `audio::limiter`, `audio::normalize`,
   `audio::render`). **Kaçan her gerçek-boşluk adayı ayrıca bütün kütüphane testleriyle (824 test) yeniden denendi:
   18'in 18'i yine kaçtı**, yani sonuç süzgeçten kaynaklanmıyor.
2. **Arayüz mutasyon testi.** Stryker 8 kurulumu çalıştı ama projenin vitest 5 sürümüyle uyumsuz (`project.server`
   hatası). Stryker 9 çalıştı fakat sonucu **geçersiz**: %5 skor verdi; denetim için elle uyguladığım bir bozmayı
   (`queue.ts:149`, `>` → `>=`) "kaçtı" diye yazdı, oysa test onu yakalıyor. Bu yüzden Stryker'ın ürettiği bozma
   listesinden dosya başına 16 örnek alıp her birini elle uyguladım ve modülün kendi test dosyasını çalıştırdım.
   `flashGuardMath.ts` dışarıda kaldı: testleri ağır benzetim (tek test 60 sn'yi aşıyor), mutasyon başına çok uzun.
   Not: yalnızca modülün kendi test dosyası çalıştı; bileşen testleri bazı etiket bozmalarını yakalayabilir.
3. **El ile tarama:** iddiasız testler, `#[ignore]`/`it.skip`, eşik gevşetmeleri (`git log -p`, 553 commit), mock kullanımı.
4. Önceki denetimin (`docs/denetim-3/TST.md`) bulgularının bugünkü durumu.

**Sınırlar:** Örneklem 3 987 olası Rust bozmasının 160'ı (%4); toplam skorun belirsizliği yaklaşık ±6 puan. Makinede
başka bir oturumun 61 GB bellek tutan işi vardı; bağlayıcı bellek yetmeyince ilk denemeler bozuldu, sonuçlar bundan
sonraki temiz koşudan. Bellek yüzünden 2 bozma bulunmadı: "derlenmeyen" 2 bozma gerçek derleme hatası (denetlendi).

## Rust: modül başına mutasyon sonuçları

| Modül                                            | Denenen            | Yakalanan | Kaçan  | Kaçanların eşdeğeri | Gerçek boşluk | Ham skor | Eşdeğersiz skor |
| ------------------------------------------------ | ------------------ | --------- | ------ | ------------------- | ------------- | -------- | --------------- |
| audio/limiter.rs                                 | 16                 | 15        | 1      | 1                   | 0             | %94      | %100            |
| audio/loudness.rs                                | 16                 | 14        | 2      | 1                   | 1             | %88      | %93             |
| audio/normalize.rs                               | 15                 | 14        | 1      | 0                   | 1             | %93      | %93             |
| audio/eq.rs                                      | 17                 | 15        | 2      | 2                   | 0             | %88      | %100            |
| audio/biquad.rs                                  | 16 (+1 derlenmedi) | 14        | 1      | 1                   | 0             | %93      | %100            |
| audio/crossfeed.rs                               | 17                 | 14        | 3      | 3                   | 0             | %82      | %100            |
| audio/render.rs                                  | 15                 | 14        | 1      | 0                   | 1             | %93      | %93             |
| analysis/beats.rs                                | 16                 | 12        | 4      | 1                   | 3             | %75      | %80             |
| analysis/structure.rs                            | 16                 | 12        | 4      | 2                   | 2             | %75      | %86             |
| analysis/key.rs                                  | 16 (+1 derlenmedi) | 11        | 4      | 2                   | 2             | %73      | %85             |
| **Toplam**                                       | **160**            | **135**   | **23** | **13**              | **10**        | **%85**  | **%93**         |
| Ek: player/controls.rs (A/B bağlantısı, hedefli) | 5                  | 0         | 5      | 0                   | 5             | %0       | %0              |

Ses yolu (limiter, eq, biquad, crossfeed, normalize, render) çok iyi korunuyor. Analiz (beat, bölüm, ton) daha zayıf:
testler sentetik şarkılarda _sonucu_ doğru buluyor, ama sonucu değiştirmeyen iç adımları (alt-kare düzeltme, tepe
seçimi, güven hesabı) bozunca fark etmiyor. `peq.rs` ve `library/db.rs` zaman yetmediği için denenmedi.

## Doğrulanmış zayıf testler (ciddiyet sırasıyla)

### 1. Oynatıcının A/B karşılaştırma bağlantısı hiç test edilmiyor (Orta-Yüksek)

- Yer: `src-tauri/src/audio/player/controls.rs:34-36` (`parametric_comparing`), `:87-97` (`set_parametric_compare`,
  `apply_parametric_compare`).
- Kaçan bozmalar (bütün 824 testle): `parametric_comparing` → hep `true`; → hep `false`; `&&` → `||`;
  `set_parametric_compare` gövdesi silindi; `apply_parametric_compare` gövdesi silindi. **5/5 kaçtı.**
  `set_parametric_compare` hiçbir testte çağrılmıyor (grep ile doğrulandı).
- Neden önemli: A/B düğmesi tamamen çalışmasa ya da ekolayzersiz taraf yanlış seviyede çalsa hiçbir test kırmızı yanmaz.
  Önceki denetimin TST-04'ü; o zamandan beri yalnızca "yükseltme bildirimi" kısmına test eklenmiş (`player/tests.rs:1327-1345`).
- Önerilen test: sanal çıkışla bir `Player` kur, +6 dB'lik parametrik ayar ver, `set_parametric_compare(true)` çağır;
  `parametric_control`'ün karşılaştırma durumunun açık ve telafi kazancının `+loudness_db_at(hız)` olduğunu, `false` ile
  kapandığını, ekolayzer kapalıyken açılamadığını doğrula.

### 2. Bit-perfect modda duraklatma/başlatma geçişi testsiz (Orta)

- Yer: `src-tauri/src/audio/render.rs:206-210`.
- Kaçan bozma: `*value *= self.gain` → `*value /= self.gain`. Çalarken kazanç 1 olduğu için fark yok; ama duraklatma ve
  başlatma geçişinde kazanç 0'a yaklaşırken bölme örnekleri dev büyütür, `to_device` ±1'e kırpar: özel modda
  **tam ölçekli patlama**. `bit_perfect_ornekleri_aynen_gecirir` yalnızca kararlı çalmayı ölçüyor.
- Önerilen test: bit-perfect açık renderer'da çalarken duraklat; geçiş boyunca her çıkış örneğinin mutlak değerinin
  girişinkini aşmadığını ve kazancın tekdüze azaldığını doğrula (aynısı başlatma için).

### 3. Boşluksuz geçişte taşma korumasının inişi testsiz (Orta)

- Yer: `src-tauri/src/audio/normalize.rs:437` (`Leveler::next_gain`, sınırdan önceki iniş).
- Kaçan bozma: `self.protect += (self.next_protect - self.protect) / n` → `* n`. İniş sırasında koruma kazancı
  yüzlerce kat sıçrar. Testlerdeki boşluksuz geçişlerde iki şarkının koruması hep aynı; yalnızca eşitleme kazancı değişiyor.
- Önerilen test: ekolayzer +6 dB açıkken boşluk payı farklı iki şarkı arasında geçiş; son 10 ms'de `gain*protect`'in
  tekdüze indiğini, adım başına değişimin küçük olduğunu ve sınırda yeni değere vardığını doğrula.

### 4. Yarım tempo koruması testten geçmiyor (Orta)

- Yer: `src-tauri/src/analysis/beats.rs:270` (`segment_periods`).
- Kaçan bozma: `let ratio = period / global` → `period % global`. Bu, "yarım tempo kalıbı sabit tempo sayılsın"
  korumasını fiilen kapatır. Tam bunu sınadığını söyleyen `yarim_tempo_kalibindaki_ara_sabit_tempoyu_degisken_yapmaz`
  (beats.rs:833) yine geçiyor: test, korumanın devreye girdiği durumu kurmuyor.
- Önerilen: testteki ara bölümün parça kestirimi gerçekten 2/3 tempoya kaysın (hi-hat'i zayıflat ya da kick'i
  güçlendir); önce bu bozmayla kırmızı yandığını göster.

### 5. Vuruş zamanının alt-kare düzeltmesi ölçülmüyor (Düşük-Orta)

- Yer: `src-tauri/src/analysis/beats.rs:542` (`peak_offset`).
- Kaçan bozma: `values[index - 1]` → `values[index + 1]`: parabol düzeltmesi hep 0 olur, vuruşlar en yakın kareye
  yuvarlanır (60 kare/sn'de ±8 ms'ye kadar hata). Senkron testi yalnızca ortalama hatayı (< 5 ms) ve en kötüyü (< 30 ms)
  ölçüyor; yuvarlama hatası ortalamada sıfırlanıyor.
- Önerilen test: vuruşları kesirli kare konumlarına düşen tıklama dizisi; ortalama mutlak hatanın < 3 ms olduğunu iste.

### 6. Başlangıç gücünde yerel ortalamanın çıkarılması ölçülmüyor (Düşük-Orta)

- Yer: `src-tauri/src/analysis/beats.rs:345` (`normalize`, önek toplamı).
- Kaçan bozma: `prefix.last() + x` → `*`: önek toplamı hep 0, yerel ortalama çıkarılmaz. Sentetik davul testleri temiz
  olduğu için fark etmiyor; gerçek müzikte (sürekli bas, pad) etkisi büyük olabilir.
- Önerilen test: üstüne yavaş değişen yüksek bir zemin eklenmiş davul kaydında tempo ve F-ölçüsünün korunduğunu ölç.

### 7. Ton analizinde spektrum tepe seçimi testsiz (Düşük-Orta)

- Yer: `src-tauri/src/analysis/key.rs:428` (`ChromaAnalyzer::process`).
- Kaçan bozma: `b <= a` → `b > a`: tepeler yerine iniş yamaçlarındaki kutular seçilir. Akor testleri yine doğru tonu
  buluyor (komşu kutu çoğu zaman aynı perde sınıfında).
- Önerilen test: 440 Hz tek sinüs → kromanın A'da tepe yaptığını ve akort kaymasının 0 ± 5 cent bulunduğunu doğrula.

### 8. Ton güveninin değeri sabitlenmemiş (Düşük)

- Yer: `src-tauri/src/analysis/key.rs:261` (`song_key`): `weight * confidence` → `weight + confidence` kaçtı. Testler
  güvenin yalnızca "var/yok" olduğuna bakıyor. Önerilen: bilinen bölüm ağırlıklarıyla beklenen güven değerini assert et.

### 9. Ölçü fazı uyumu ve kısa vuruş listesi (Düşük)

- `src-tauri/src/analysis/structure.rs:484` (`phase_agreement`): döngü koşulu `+` → `*` kaçtı (pencere sayısı azalıyor,
  oran sabitlenmemiş). `structure.rs:184` (`map_song`): `< 8` → `== 8` kaçtı (8'den az vuruşta koruma testsiz).
- Önerilen: yarısı tutarsız ölçülü bir kayıtta uyum oranını (≈ 0,5) assert et; 5 vuruşluk girdide `None` bekle.

### 10. 400 ms'den kısa sesin ses yüksekliği (Düşük)

- `src-tauri/src/audio/loudness.rs:287`: `>` → `==` kaçtı; 0,4 sn'den kısa ses hiç ölçülmüyor. Önerilen: 0,2 sn'lik −20 dBFS
  sinüs için LUFS değeri bekle.

### Arayüz (TypeScript) boşlukları (hepsi Düşük)

- `src/lib/parametric.ts:167` (karmaşık çarpımın sanal kısmı `*` → `/`) ve `:211` (bant geçiren payı `1/q` → `q`):
  sürüklerken çizilen önizleme eğrisi yanlış olur, test yakalamıyor. Önerilen: her süzgeç türü için birkaç frekansta
  önizlemeyi çekirdeğin `analog` formülünün bilinen değerleriyle karşılaştır.
- `src/lib/lyrics.ts:207` (`lines[index + 2]` → `index - 2`: sıradaki satır yanlış), `:278` (`lyricPan`).
- `src/lib/queue.ts:36` (seçilen şarkı listede yoksa yedek sıra; hiç çalışmıyor), `src/lib/sync.ts:53` ve `:60`
  (en az vuruş sayısı ve dağılım sınırında eşitlik durumu).
- `src/lib/parametric.ts:113` (`formatQ` basamak sayısı, hiç çalışmıyor).

## Eşdeğer ya da ürüne etkisiz bozmalar (zayıf test sayılmadı)

| Yer                                                            | Bozma                                 | Neden eşdeğer                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| crossfeed.rs:203                                               | `zero * pole` → `+`                   | Önceki denetimle aynı: ön bükme noktası kayar, fark < %1, duyulmaz                                                             |
| crossfeed.rs:205                                               | `t > 0` → `>=`                        | t = 0'a ulaşılamaz (kesim ≥ 300 Hz)                                                                                            |
| crossfeed.rs:342                                               | `is_bypass`'te `!` silindi            | Bu işlev ürün kodunda hiç çağrılmıyor, yalnızca testlerde                                                                      |
| limiter.rs:245                                                 | Blackman penceresinde `4π` → `4/π`    | Pencere Hann'a benzer olur; tepe kaçırma 0,1 dB toleransın içinde kalıyor (bkz. önceki TST-01)                                 |
| loudness.rs:192                                                | geçmiş indeksi bir kayar              | 12 katsayının uçtaki birinde hata; EBU 3341'in ±0,2 dB toleransının çok içinde                                                 |
| biquad.rs:379                                                  | çentiğin Nyquist adayı bozuldu        | İki aday arasından iyisi seçiliyor; bozuk aday elenir                                                                          |
| eq.rs:63                                                       | `MAX_POINTS` 1 fazla                  | Yalnızca dizi kapasitesi                                                                                                       |
| eq.rs:692, key.rs:410, beats.rs:392, structure.rs:544, :804    | `<` ↔ `<=`                            | Kayan sayıda tam eşitlik pratikte oluşmaz                                                                                      |
| key.rs:308                                                     | düz kroma eşiği `ma*ma*n` → `ma/ma*n` | Eşik zaten 1e-9 düzeyinde; sonuç değişmez                                                                                      |
| TS: lyrics.ts:93, queue.ts:137, sync.ts:43, parametric.ts:153  | —                                     | JSON hatası zaten yakalanıyor; rastgele sayı üreticisi yine belirlenimci; boş liste sonradan eleniyor; kazanç 0,1 dB'e yuvarlı |
| TS: crossfeed.ts:21, :111, :118, lyrics.ts:4, parametric.ts:19 | —                                     | Yalnızca ekrandaki açıklama/etiket metni ya da hazır ayar vurgusu                                                              |

## El ile tarama sonuçları

- **Hiçbir şey doğrulamayan test:** 771 Rust ve 811 TS testinde assert'siz test aradım. Bulunan 6 Rust testinin 3'ü
  `#[ignore]`'lu ölçüm aracı, 2'si bilerek "bozuk girdide çökme yok" denetimi, 1'i (`library/service.rs:1212`)
  `wait_until` ile koşulu bekleyip doğruluyor. TS'te bulunan 4'ü tarayıcımın yanlış okuması (hepsinde `expect` var).
- **Atlanan testler:** TS'te hiç `skip/only/todo` yok. Rust'ta 7 `#[ignore]`, hepsinin gerekçesi yazılı (ffmpeg, gerçek
  söz modeli, MilkDrop arşivi gerekir ya da belge tablosu üretir).
- **Kendini doğrulayan test:** Örnek incelemede bulmadım. Sınırlayıcı testleri ürünün ara değerleyicisinden bağımsız
  64 katsayılı bir ölçerle ölçüyor (`limiter.rs:279`); ses yüksekliği testleri EBU 3341 durumlarını kullanıyor. Mutasyon
  sonuçları da bunu destekliyor (totolojik testler bozmaları yakalayamazdı).
- **Gevşetilmiş eşikler:** Geçmişte test eşiğini değiştiren ~60 satırı inceledim. Gerçek gevşetmeler gerekçeli:
  söz saati sınırı (0afd7ae, "Mevcut testi gevşettiği için sahibi onayladı" diye yazılı), oynatma saati 0,5 → 3 ms
  (129efa3; senaryo zorlaştı, hedef ±20 ms'nin çok içinde), spektrum testi 0,5 → 0,1 (5eae0d5; model değişti), drop
  flaşı 0,5 → 0,3 (a608283; davranış bilerek yumuşatıldı). Kırmızı testi susturmak için gizlice gevşetme görmedim.
- **Aşırı mock:** Arayüz testleri Rust köprüsünü (`backend`) taklit ediyor; Tauri'siz çalıştıkları için kaçınılmaz.
  Sözleşme `check:commands` ve üretilen veri tipleriyle korunuyor. Ama bu, arayüz testlerinin çekirdekteki bağlantı
  hatalarını (1. bulgu gibi) göremeyeceği anlamına gelir.

## Önceki denetimin (TST.md, 22 Ekim) bulguları bugün

| Bulgu                                                              | Durum                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| TST-01 sınırlayıcı 48 kHz'te tavanı aşıyor, test yalnızca 44,1 kHz | **Açık.** Kod ve test değişmemiş (`limiter.rs:385-402` hâlâ `rate = 44_100`); yeniden ölçülmedi            |
| TST-02 dar tepe taraması                                           | **Düzeldi** (85e0f10; `peq.rs:1524` testi)                                                                 |
| TST-03 çizilen eğri ≠ duyulan                                      | **Düzeldi** (3d53833; `peq.rs:1983` testi)                                                                 |
| TST-04 A/B bağlantısı testsiz                                      | **Yarısı açık:** yükseltme bildirimi test edildi, A/B karşılaştırması hâlâ testsiz (bu raporun 1. bulgusu) |
| TST-05 kararsız bileşen testi                                      | **Kısmen:** zaman aşımı 10 sn'ye çıkarılmış; test hâlâ gerçek saatle 4 sn bekliyor                         |
| TST-06 doğruluk tablosu assert'siz, `avg_m < avg_r*0,7`            | **Açık** (`biquad.rs:1108`, `:1117`, `:1174`)                                                              |
| TST-07b görseller parametrik EQ'yu yansıtıyor mu, testsiz          | **Açık** (`player/tests.rs:1250` parametrik EQ kurmuyor)                                                   |
| TST-07c ses yolu gürültü testi parametrik EQ kapalı                | **Açık** (`render.rs:788` `parametric: Arc::default()`)                                                    |
| TST-08 arayüz önizleme formülleri                                  | **Benzer boşluk sürüyor** (`parametric.ts:167`, `:211`); önceki P10/X12 bozmaları örnekleme düşmedi        |
| TST-07a/d/e, TST-09                                                | Denetlenmedi                                                                                               |

## Öneri sırası

1. A/B bağlantısı için oynatıcı testi (1).
2. Bit-perfect duraklatma geçişi testi (2) ve boşluksuz geçişte koruma inişi testi (3).
3. Yarım tempo testinin korumayı gerçekten tetiklemesi (4).
4. TST-01: sınırlayıcı testlerini 48/96/192 kHz'e yaymak.
5. Analizin iç adımları (5-9) ve arayüz önizleme formülleri: her biri tek testlik iş.
6. Mutasyon testini ara ara tekrarlamak: `cargo mutants --in-place -f <dosya> --shard 0/n --sharding round-robin`
   (bir dosya ~15 dk). Arayüz için Stryker şimdilik vitest 5'le güvenilir değil.

## Ham veriler (scratchpad)

- Rust sonuçları: `scratchpad/mut/<modül>/mutants.out/` (caught/missed/unviable.txt, her bozmanın günlüğü ve farkı),
  tam takımla yeniden sınama: `scratchpad/mut/recheck/`.
- Arayüz elle mutasyon: `scratchpad/mut/ts_manual.out` (80 satır; `queue.ts:42` satırı sonsuz döngüye girdi ve ana
  oturum tarafından elle durduruldu: "zaman aşımı (elle durduruldu)", yakalanmış sayıldı). Stryker 9 raporu:
  `scratchpad/m3/reports/mutation.json` (geçersiz, bkz. Yöntem 2).
- Betikler: `scratchpad/tools/` (depoda `betikler/denetim-1/`) (`run_mut.sh`, `recheck.sh`, `ts_mut.py`, `noassert.py`, `thresholds.py`).

## Ek: ham kaçan listeleri (ayrı ajanın sınıflaması için)

Yukarıdaki eşdeğer/gerçek ayrımı ön sınıflamadır; kesin sınıflamayı ayrı ajan yapacak.

### Rust: modül süzgeciyle kaçan 23 bozma

```
src/analysis/beats.rs:270:27: replace / with % in segment_periods
src/analysis/beats.rs:349:34: replace + with * in normalize
src/analysis/beats.rs:392:16: replace < with <= in estimate_period_with_strength
src/analysis/beats.rs:542:27: replace - with + in peak_offset
src/analysis/key.rs:261:53: replace * with + in song_key
src/analysis/key.rs:308:31: replace * with / in correlation
src/analysis/key.rs:410:19: replace < with <= in ChromaAnalyzer::process
src/analysis/key.rs:428:32: replace <= with > in ChromaAnalyzer::process
src/analysis/structure.rs:184:26: replace < with == in map_song
src/analysis/structure.rs:484:26: replace + with * in phase_agreement
src/analysis/structure.rs:544:24: replace > with >= in section_boundaries
src/analysis/structure.rs:804:33: replace < with <= in refine_drop
src/audio/biquad.rs:379:41: replace + with - in Biquad::matched
src/audio/crossfeed.rs:203:24: replace * with + in SideFilter::design
src/audio/crossfeed.rs:205:16: replace > with >= in SideFilter::design
src/audio/crossfeed.rs:342:9: delete ! in CrossfeedProcessor::is_bypass
src/audio/eq.rs:63:37: replace - with +
src/audio/eq.rs:692:85: replace < with <= in Design::is_flat
src/audio/limiter.rs:245:32: replace * with / in interpolator
src/audio/loudness.rs:192:57: replace - with / in TruePeak::add
src/audio/loudness.rs:287:25: replace > with == in LoudnessMeter::finish
src/audio/normalize.rs:437:68: replace / with * in Leveler::next_gain
src/audio/render.rs:208:28: replace *= with /= in Renderer::render
```

Derlenmeyen (gerçek derleme hatası): `key.rs:238:5 song_key -> Some(Default::default())`, biquad.rs'te 1.

### Rust: bütün kütüphane testleriyle (824 test) yeniden sınama: 18 bozma, 18'i kaçtı, 0 yakalandı

```
src/analysis/beats.rs:270:27: replace / with % in segment_periods
src/analysis/beats.rs:349:34: replace + with * in normalize
src/analysis/beats.rs:542:27: replace - with + in peak_offset
src/analysis/key.rs:261:53: replace * with + in song_key
src/analysis/key.rs:428:32: replace <= with > in ChromaAnalyzer::process
src/analysis/structure.rs:184:26: replace < with == in map_song
src/analysis/structure.rs:484:26: replace + with * in phase_agreement
src/audio/crossfeed.rs:342:9: delete ! in CrossfeedProcessor::is_bypass
src/audio/limiter.rs:245:32: replace * with / in interpolator
src/audio/loudness.rs:192:57: replace - with / in TruePeak::add
src/audio/loudness.rs:287:25: replace > with == in LoudnessMeter::finish
src/audio/normalize.rs:437:68: replace / with * in Leveler::next_gain
src/audio/render.rs:208:28: replace *= with /= in Renderer::render
src/audio/player/controls.rs:35:9: replace Player::parametric_comparing -> bool with true
src/audio/player/controls.rs:35:9: replace Player::parametric_comparing -> bool with false
src/audio/player/controls.rs:35:33: replace && with || in Player::parametric_comparing
src/audio/player/controls.rs:88:9: replace Player::set_parametric_compare with ()
src/audio/player/controls.rs:93:9: replace Player::apply_parametric_compare with ()
```

### TS: kaçan 17 bozma (+1 zaman aşımı, elle durduruldu)

```
MISSED	src/lib/crossfeed.ts:21	ObjectLiteral	'{\n  Hafif: "Jan Meier\'in devresi: sahne biraz daralır, kulak' -> '{}'
MISSED	src/lib/crossfeed.ts:111	ConditionalExpression	'Math.abs(p.levelDb - settings.levelDb) < 0.05' -> 'true'
MISSED	src/lib/crossfeed.ts:118	StringLiteral	'`${Math.round(us)} µs`' -> '``'
MISSED	src/lib/lyrics.ts:4	ObjectLiteral	'{\n  file: ".lrc dosyasından",\n  embedded: "şarkının içinden"' -> '{}'
MISSED	src/lib/lyrics.ts:93	StringLiteral	'"{}"' -> '""'
MISSED	src/lib/lyrics.ts:207	ArithmeticOperator	'index + 2' -> 'index - 2'
MISSED	src/lib/lyrics.ts:278	ConditionalExpression	'!found' -> 'true'
MISSED	src/lib/parametric.ts:19	StringLiteral	'"Yüksek geçiren"' -> '""'
MISSED	src/lib/parametric.ts:113	EqualityOperator	'q < 1' -> 'q >= 1'
MISSED	src/lib/parametric.ts:153	EqualityOperator	'Math.abs(band.gainDb) >= 0.005' -> 'Math.abs(band.gainDb) > 0.005'
MISSED	src/lib/parametric.ts:167	ArithmeticOperator	'a[0] * b[1]' -> 'a[0] / b[1]'
MISSED	src/lib/parametric.ts:211	ArithmeticOperator	'1 / q' -> '1 * q'
MISSED	src/lib/queue.ts:36	ObjectLiteral	'{ paths: [path], index: 0 }' -> '{}'
timeout	src/lib/queue.ts:42	EqualityOperator	'i > 0' -> 'i <= 0'
MISSED	src/lib/queue.ts:137	ArithmeticOperator	't + Math.imul(t ^ (t >>> 7), t | 61)' -> 't - Math.imul(t ^ t >>> 7, t | 61)'
MISSED	src/lib/sync.ts:43	ConditionalExpression	'clicks.length === 0' -> 'false'
MISSED	src/lib/sync.ts:53	EqualityOperator	'offsets.length < MIN_TAPS' -> 'offsets.length <= MIN_TAPS'
MISSED	src/lib/sync.ts:60	EqualityOperator	'spreadMs <= MAX_RELIABLE_SPREAD_MS' -> 'spreadMs < MAX_RELIABLE_SPREAD_MS'
```

TS ham sayılar: crossfeed 16 (13 yakalandı, 3 kaçtı), lyrics 16 (12/4), parametric 16 (11/5), queue 16 (13/2, 1 zaman aşımı), sync 16 (13/3). Toplam 80: 62 yakalandı + 1 zaman aşımı, 17 kaçtı. Bu 80 bozmanın 69'unu Stryker 9 "kaçtı" saymıştı; elle uygulayınca 54'ü yakalandı (Stryker sonucunun geçersizliğinin kanıtı). Örneklem tamamlandı, kesilmedi.
