# LYRASKA GÖREV KİTABI: BÖLÜM II (Otomatik DJ)

Önce `00-CEKIRDEK.md` dosyasını oku. Bu dosya §6–§9 bölümlerini içerir ve yalnızca sahibi açıkça "Bölüm II'ye geç"
dediğinde okunur.

<dj>

# BÖLÜM II: OTOMATİK DJ

## 6. Çerçeve

**Başlama koşulu.** Yalnızca sahibi açıkça "Bölüm II'ye geç" derse başlar; her aşama ayrı oturumda yürür. Aşama A–D
**ürün koduna dokunmaz**: yalnızca `docs/dj/` altında belge, `docs/dj/hesap/` altında ölçüm betiği üretir. Aşama E
yalnızca plandır; uygulaması `özellik`tir ve ayrıca açık onay ister. Yeni oturum önce son devir notunu ve `docs/dj/`
altındaki önceki çıktıları okur.

**Rolün.** Lyraska'nın baş araştırmacısı ve baş mühendisi: müzik bilgisi çıkarımı (MIR), sayısal sinyal işleme,
optimizasyon, müzikoloji ve ürün tasarımı birlikte gerekiyor. Sesi dinleyemezsin: algısal yargı gerektiren her şeyi
(bir geçişin "güzel" olması) ölçülebilir vekil göstergelerle ve insan dinleme testleriyle ele al, "kulağıma iyi geldi"
tipinde iddia kurma.

**Vizyon (sahibinin sözleriyle).** Lyraska, kütüphanedeki çok sayıda şarkıdan, tamamen çevrimdışı ve kendi başına,
dünyanın en iyi DJ'lerinin zanaatına yaklaşan (mümkünse onların yapamadığını yapan) bir set çalsın. Sıralamayı program
seçer, geçişleri program yapar; kullanıcı yalnızca yönlendirir (başlangıç, süre, ruh hâli, kilitle/atla). Sahibi
uzun yıllık emeğe ve her çabaya hazır.

"Çığır açmak" sınanabilir bir hedeftir, slogan değildir: kör dinleme testinde (Aşama D) deneyimli dinleyiciler Lyraska
setlerini insan DJ setlerinden ve basit otomatik karışımlardan ayıramıyor ya da tercih ediyor olmalı. Bunu garanti
etme; ulaşılabilir olup olmadığını kanıtla ya da çürüt. İlk iş, ideal sistemin uçtan uca bir senaryosunu yaz (bir
kullanıcı, 40.000 şarkılık kütüphane, "cumartesi gecesi, 3 saat, ısınmadan zirveye"), sonra geriye doğru çalış:
bunun için hangi bilimsel soru çözülmeli, hangisi bugün çözülmüş, hangisi araştırma gerektiriyor. Bilinmeyen yolları
araştırma programı olarak yaz.

**ROADMAP ile ilişki** (✔ `docs/ROADMAP.md`): Faz 6 (Akıllı Geçiş) iki desteli çalma, geçiş planlayıcı (8/16/32 ölçü
hizası), EBU R128 eşitleme, güvenlik kuralı (tempo farkı varsayılan olarak %8'den büyükse, tempo şarkı içinde
değişiyorsa ya da beat güveni düşükse hizalama yapılmaz, kısa düz geçiş), perdeyi bozmadan tempo eşitleme, geçiş
stilleri ve kalite hedefi "iki şarkının vuruşları arasındaki fark en fazla 10 ms" içerir. Faz 7 (Otomatik DJ) BPM
(varsayılan en fazla %6 fark; yarım/çift tempo sayılır), Camelot (aynı, komşu, paralel), enerji eğrisi (ısınma →
zirve → iniş), açıklanabilir seçim ve "elle seçmiş gibi" bulunan geçiş oranını hedefler. Bu bölüm onları genişletir;
`ROADMAP.md`'yi onaysız değiştirme.

## 7. Dürüstlük ve araştırma düzeni

1. Her önemli cümleye bir etiket koy: `[KAYNAKLI]` (kaynak + bağlantı), `[ÖLÇÜLDÜ]` (betik + veri sürümü),
   `[HESAPLANDI]` (denklem + doğrulama betiği), `[ÇIKARIM]` (kısa gerekçe ve dayandığı veri), `[HİPOTEZ]` (sınanacak).
   Etiketsiz olgu cümlesi yazma.
2. Sayı uydurma. Bulamadıysan "bulamadım" yaz; tahmin gerekiyorsa aralık ve gerekçe ver.
3. Kaynak sınıfı: (a) hakemli (ISMIR, DAFx, NIME, TISMIR, müzikoloji dergileri), (b) kitap ve akademik tez, (c) DJ'lerin
   kendi röportaj ve ders kayıtları, (d) basın, (e) blog ve forum. (e) tek başına hiçbir sonucu taşımaz. Zanaat iddiaları
   (enerji dalgaları, kitle okuma, fraz bilgisi) büyük ölçüde (e) düzeyindedir: daha güçlü kaynakla doğrula ya da düşür.
4. Gerçek kişiler hakkında yalnızca kamuya açık, kaynaklı, zanaatla ilgili bilgi yaz. Özel yaşam, söylenti, kişilik
   çıkarımı yok. Bir DJ'nin "bilerek yaptığını" ancak kendi sözüyle destekle; ses verisinden yalnızca "yaptığı
   gözlendi" denir.
5. **Hukuk ve etik.** Mix ve set kayıtlarını yalnızca açık lisanslı, sahibinin yasal olarak sahip olduğu ya da kullanım
   şartları açıkça izin verenlerden al. Site kazımadan önce şartları ve lisansı doğrula; izin yoksa yapma, yayımlanmış
   veri setlerini kullan. Ses dosyaları depoya girmez, yalnızca çıkarılmış sayılar (zamanlar, eğriler, istatistikler).
   Ürün içinde gerçek DJ adı kullanılmaz: stiller adsız **arketiplerdir**; hedef DJ'leri taklit etmek değil, onlardan
   ilke çıkarmaktır.
6. Her aşamanın sonunda **"Bilmediklerim ve yanılabileceğim yerler"** tablosu ver ve her aşamanın sonunda **tek bir çürütme turu** yap:
   yalnızca en güçlü 3–5 sonucu çürütmeyi dene, çürütemediklerini işaretle. Bu bir araştırma yöntemidir, kendi işini
   yeniden kontrol etmek değil.

**Mekanik denetim.** Etiket disiplinini koda bağla:

- `docs/dj/kaynaklar.json`: kaynak kimliği, sınıf (a–e), bağlantı, erişim tarihi, lisans notu.
- `docs/dj/iddialar.jsonl`: her satır bir iddia: `{"id":"I-014","metin":"...","etiket":"KAYNAKLI","kaynaklar":["K-03"],
"guven":"yüksek"}`. `ÖLÇÜLDÜ` ve `HESAPLANDI` için `betik` alanı gerekir.
- `docs/dj/hesap/iddia_denetimi.py`: etiketi olmayan iddia, kaynaksız `KAYNAKLI` ya da betiksiz `ÖLÇÜLDÜ` varsa hata
  verir. Her aşama özetinden önce çalıştır.
- `docs/dj/arastirma-defteri.md`: hipotez ağacı ve güven düzeyleri; düzenli aralıklarla kendi yaklaşımını eleştir.

## 8. Doğrulanmış girdiler (18 Ekim 2026)

| İddia                                                                                                                                                                                                                                                                                                                                                                     | İşaret | Kaynak / not                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DJ Mag Top 100 DJs 2026 sonuçları 6 Ekim 2026'da [UNVRS] Ibiza'da açıklandı; halk oylaması, 234 bölgeden rekor oy; David Guetta rekor altıncı kez 1.; dal birincileri: Charlotte de Witte (techno), FISHER (house), Armin van Buuren (trance), Sara Landry (hard), Indira Paganotto (psy), Dimitri Vegas & Like Mike (grup). Popülerliği ölçer, zanaat kalitesini ölçmez. | ✔      | djmag.com haberleri, 7 Ekim 2026                                                                                                                                                                    |
| **Raveform** (TISMIR, Nisan 2026, CC BY 4.0): 4.902 DJ mix bağlantısı, 56.873 parça bağlantısı, 1.423 parçada üç uzmanın elle yaptığı yapı notasyonu; EDM'ye özgü yapı sözlüğü; segment uzunluğu, akış ve alt-bant enerjisi analizi; veri ve modeller `mir-aidj.github.io/raveform/` adresinde.                                                                           | ✔      | Bu belgede önceki sürümde yoktu; birincil veri ve yöntem adayı. Ses içerip içermediğini ve erişim biçimini ? doğrula.                                                                               |
| **UnmixDB** (IRCAM, Zenodo 1422385): Creative Commons lisanslı dans parçalarından otomatik üretilmiş, gerçek değer etiketli mix'ler; her çalma listesi 3 parça, vuruş eşzamanlı çapraz geçiş, `sox` ile 12 işlem varyantı; üretim kodu `Ircam-RnD/unmixdb-creation`.                                                                                                      | ✔      | Yöntem doğruluğunu bilinen gerçeğe karşı ölçmek için. Lisans sürümünü ? doğrula.                                                                                                                    |
| Kim ve ark., ISMIR 2020 gerçek DJ mix veri seti (~1,5 bin mix, ~15 bin parça). Raveform makalesi bu veri setinin **kamuya açık olmadığını** söylüyor.                                                                                                                                                                                                                     | ◐      | `mir-aidj/djmix-dataset` deposunun tam olarak ne içerdiğini (yalnızca metaveri mi), lisansını ve 1001Tracklists kullanım şartlarını ? doğrula; kazıma yapma.                                        |
| `mir-aidj/transition-analysis`, NIME 2021 ve DAFx 2022 (fader ve EQ eğrisi kestirimi).                                                                                                                                                                                                                                                                                    | ?      | Varlığını, lisansını ve yayın bilgilerini doğrula.                                                                                                                                                  |
| **Beat This!** (ISMIR 2024): kod ve yayımlı ağırlıklar MIT; 50 kare/sn, DBN yok. `final` modelleri ~20,3 M parametre ve ~80 MB, `small` ~2,1 M parametre ve ~10 MB; ONNX dönüşümleri ve MIT lisanslı bir Rust portu (`beat-this` crate'i) var.                                                                                                                            | ◐      | Üçüncü taraf model kartlarından; birincil depodan (`CPJKU/beat_this`) ? doğrula, eğitim verisi telif notunu ? oku. ONNX çalışma zamanı bağımlılığı ve kurulum boyutu sahibine karar olarak sunulur. |
| **Signalsmith Stretch**: MIT; yazar zaman esnetmenin 0,75×–1,5× arasında en iyi sesi verdiğini söylüyor; Rust bağlayıcısı `ssstretch` 0.1.0 (MIT, `cxx` ile C++14 derleyici ister).                                                                                                                                                                                       | ✔ / ◐  | GitHub README ve lib.rs; crate'in bakım durumunu ? doğrula.                                                                                                                                         |
| **Rubber Band**: GPL ve ticari seçenek; tam SPDX ifadesi ?. `deny.toml` izin listesinde GPL-2.0-or-later yok.                                                                                                                                                                                                                                                             | ?      | Kullanılacaksa önce sahibine sor.                                                                                                                                                                   |
| `analysis/beats.rs:182`: `bpm = (600.0 / mean_interval).round() / 10.0` (0,1 BPM çözünürlük). 128 BPM'de iki şarkı en kötü durumda ±0,05 BPM ters yönde yuvarlanırsa 60 sn üst üste binmede yaklaşık 47 ms kayma.                                                                                                                                                         | ✔      | Kod okundu; 0,1/128 × 60 sn = 0,0469 sn aritmetik.                                                                                                                                                  |
| Tek küresel tempo (ANL-04); gerçek müzikte ölçüm yok (ANL-07); mevcut beat doğruluğu ölçütü F-ölçüsü ±70 ms, DJ için yetersiz (CLAUDE.md'nin senkron hedefi ±20 ms).                                                                                                                                                                                                      | ✔      | `docs/denetim-2/analiz.md`, `CLAUDE.md`                                                                                                                                                             |
| `player.rs`: tek çözücü, tek "sıradaki"; iki deck ve zaman esnetme yok; geçiş zamanlaması arayüzde (`usePlayback.ts`), denetim U2 ile uyumsuz.                                                                                                                                                                                                                            | ◐      | Planlayıcı Rust'ta ve örnek-hassas olmalı. Bölüm I N10 ve SES-02 bu tasarımla birlikte düşünülür.                                                                                                   |
| Ton tespiti sektörde bile sınırlı doğrulukta (yayımlı karşılaştırmalarda ~%67–77).                                                                                                                                                                                                                                                                                        | ?      | Kaynağını bul ya da düşür; ton sert süzgeç değil yumuşak puan olmalı.                                                                                                                               |

## 9. Aşamalar

### Aşama A: "En iyi DJ'leri en iyi yapan nedir?" (zanaat modeli)

Soru: zirvedeki DJ'leri ortalamadan ayıran şey nedir ve bunun hangi kısmı ölçülebilir?

1. Literatürü tara ve özetle. Başlangıç noktaları: Raveform ✔ ve atıf yaptığı çalışmalar; UnmixDB (Schwarz, Fourer) ✔;
   Kim ve ark. ISMIR 2020 ◐; fader/EQ kestirimi çalışmaları ?; cue-noktası kestirimi, otomatik DJ sistemleri ve
   ardışıklık modelleri (pekiştirmeli öğrenme dahil); 2024–2026 yayınlarını sen ara; müzikoloji (Butler, _Playing with
   Something That Runs_ ve _Unlocking the Groove_; Brewster & Broughton, _Last Night a DJ Saved My Life_: varlığını ve
   içeriğini ? doğrula, ezberden alıntı yapma); DJ'lerin kendi röportaj ve ders kayıtları. Rakip sistemleri (Mixxx,
   VirtualDJ, rekordbox, Serato, djay, Apple AutoMix, Spotify DJ) belgelerinden karşılaştır; bulamadığına "yok" değil
   "bulamadım" de.
2. Çıktı `ZANAAT-MODELI.md`: bir **zanaat taksonomisi**. Her boyut için bir satır: tanım · gözlenebilir göstergeler ·
   Lyraska'da hesaplanabilirlik (`bugün var` / `yeni analiz gerekir` / `bilinmiyor`) · kaynak · güven. Başlangıç
   boyutları (genişlet, birleştir, çürüt): seçim (repertuar derinliği, sürpriz/tanıdık, tür köprüleri); enerji
   programlaması (dalgalar, nefes, bitiş); gerilim–boşalma (mikro ve makro); fraz ve cümle bilgisi (8/16/32 ölçü,
   vokal üstüne karışmama); geçiş teknikleri repertuarı (EQ/bas takası, filtre, yankı çıkışı, loop, sert kesme, çift
   drop, acapella katmanı, üç deck, scratch); harmonik bilinç ve kuralı bilinçli bozma; tempo yönetimi (rampa,
   yarım/çift tempo köprüsü); ses seviyesi ve spektral denge (bas çakışması); risk ve toparlanma; mikro-zamanlama ve
   groove; **kitle okuma** (Lyraska'da karşılığı yok: telemetrisiz, cihaz içi vekil sinyaller öner: atla/kilitle/beğen,
   dinleme süresi, günün saati, kullanıcının verdiği ortam bilgisi; ne kadarının yerini tutabileceğini tart); türe özgü
   normlar (uzun harmanlı house/techno ile kesme ağırlıklı hip-hop aynı "iyi"yi paylaşmaz: evrenselleri türe özgülerden
   ayır).
3. "Bir DJ'yi en iyi yapan şey" için tek cümlelik iddia yazma; hangi boyutların hangi türlerde belirleyici olduğunu
   kanıt düzeyiyle göster.

<karar_kapisi>
**KARAR KAPISI K0 (Aşama A sonunda, sahibine).** Aşama B'ye geçmeden önce şunu değerlendir: hukuka uygun veri gerçekten
ne kadar var (Raveform, UnmixDB, açık lisanslı kayıtlar), 20 DJ'lik tam analiz maliyetine değer mi, daha küçük bir
alternatif (ör. veri seti düzeyinde 8–12 DJ) aynı soruyu cevaplar mı. Seçenekleri ve önerini sahibine sun.
</karar_kapisi>

### Aşama B: DJ analizi

**B0: Veri keşfi ve hukuk** (sahibine sunulur, onay olmadan B1'e geçme). Her aday DJ için hangi veri (tracklist, kayıt)
hangi lisansla, hangi erişim yoluyla mevcut; nihai listeyi gerekçe ve veri erişim planıyla sun.

- DJ Mag Top 100 bir halk oylamasıdır (§8): yalnızca bir girdi olarak kullan, tek ölçüt yapma.
- Ölçütler: meslektaş ve eleştirmen itibarı; uzun-format ustalığı; **tür ve teknik çeşitliliği** (house, techno, trance,
  drum & bass, hip-hop/turntablism, disco/funk selector geleneği, eklektik, global bass, arena/festival pop-dans;
  **Türkiye ve Doğu Akdeniz sahnesinden en az 2 isim**); tarihî öncüler (kayıt varsa); veri erişilebilirliği; en az 5
  isim popülerlik listelerinde yüksek olmayan "zanaat otoriteleri".
- Başlangıç uzun listesi (öneri, doğrulanmamıştır; doğrula, ele, ekle): Carl Cox, Jeff Mills, Richie Hawtin, Sven
  Väth, Laurent Garnier, Ricardo Villalobos, Dixon, Sasha & John Digweed, Solomun, Black Coffee, Honey Dijon, Charlotte
  de Witte, Amelie Lens, Peggy Gou, Gilles Peterson, Floating Points, Four Tet, Ben UFO, Andy C, Q-Bert, A-Trak, DJ
  Premier, Jazzy Jeff, Grandmaster Flash, Larry Levan, Frankie Knuckles, David Guetta, Calvin Harris, Martin Garrix.
- Hedef 20 isimdir; veri yetersizse en az 8 ile başla ve nedenini yaz. Sayı amaç değil, soruyu cevaplamak amaç.

**B1: Veri seti ve tracklist düzeyi.** Önce yöntemlerin doğruluğunu UnmixDB'de (bilinen gerçek) ölç, sonra gerçek mix'lere
uygula. Tracklist'teki parçalar kullanıcının kütüphanesinde varsa Lyraska'nın kendi analizini (ızgara, ölçü, bölüm,
enerji, ton) kullan; yoksa mix sesinden çıkarılabilenle yetin. Hangi sonucun hangi veri düzeyinden geldiğini işaretle.

**B2: Ses düzeyi.** Yalnızca §7'deki hukuki koşulları sağlayan kayıtlarla; her DJ için mümkünse ≥10 uzun-format kayıt,
yoksa tracklist düzeyinde kal ve profilde belirt.

**Ölçümler** (her biri denklemle tanımlanır, `docs/dj/hesap/` altında betikle doğrulanır, birim ve belirsizlikle):

1. Geçiş süresi (ölçü cinsinden) dağılımı ve geçiş konumu (bölüm sınırına ve fraz fazına göre).
2. Tempo: parçalar arası fark, rampa eğrisi, set boyunca BPM yörüngesi ve türevi.
3. EQ/fader yörüngeleri (bas takası zamanlaması, filtre süpürmeleri), bant başına.
4. Harmonik hareket: komşu parçalar arası kroma/ton uzaklığı; "uyumlu" ve "bilinçli uyumsuz" oranı.
5. Enerji yörüngesi: ortalama, varyans, otokorelasyon, tepe sıklığı, giriş/çıkış eğimi.
6. Parça kullanım biçimi: parçanın ne kadarı, kısaltma/loop, üst üste ≥3 kaynak, tekrar.
7. Çeşitlilik: tür/dönem/sanatçı (yalnızca kaynaklı veriyle).
8. Ses seviyesi ve spektral çakışma: geçişte bas bandında maskeleme, yükseklik sıçraması.

İstatistik: güven aralıkları, çoklu karşılaştırma düzeltmesi, DJ-içi ve DJ-arası varyans ayrımı, yeterli örnek
büyüklüğü hesabı. **Stil gerçekten ayırt edilebilir mi?** (çapraz doğrulamalı sınıflandırma). Edilemiyorsa açıkça söyle;
"her DJ'nin imzası var" varsayımını sınamadan kabul etme.

**Çıktılar** (`DJ-PROFILLERI.md`): her DJ için en çok iki sayfalık profil (veri düzeyi, bulgular, güven, ham sayı
tablosu, "gözlenen" ile "kaynaklı beyan" ayrımı); çapraz sentez: evrenseller, imzalar, kural ihlalleri kataloğu (ne
zaman, ne kadar, hangi bağlamda), türe göre farklar; kullanılan her veri setinin sürümü ve sağlama toplamı; analiz
yeniden üretilebilir. Geniş ve gerçekten bağımsız taramalarda en çok 3 alt ajan kullanabilirsin (§2.8).

### Aşama C: Yaratıcı sentez

Aşama A ve B bulgularından **en az 8 özgün, sınanabilir tez** üret (`SENTEZ-TEZLERI.md`). Her tez: fikir (3 cümle) ·
neden yeni olabilir (kaynaklı karşılaştırma; bulamıyorsan "bulamadım") · matematiksel formülasyon · gereken veri/analiz
· deney tasarımı · **öldürme ölçütü** · risk ve lisans notu · **en ucuz çürütme deneyi** · Bölüm I'den hangi ön koşulu
gerektirdiği. Tohum fikirler (zorunlu değil; sahiplen, değiştir ya da çürüt):

- **T1 Küresel set optimizasyonu.** Seti bir çizge yolu problemi yap: düğüm = (parça, giriş noktası, çıkış noktası),
  kenar = öğrenilmiş geçiş maliyeti; amaç = hedef enerji yayına uyum + gerilim bütçesi + çeşitlilik − geçiş riski.
  Çözüm: ışın araması, dinamik programlama ya da tamsayılı programlama; 40.000 parçada dakikalar içinde biten bir
  planlama için karmaşıklık ve yaklaşım ver. (İnsan DJ gerçek zamanlı ve sınırlı belleğle seçer; Lyraska bütün
  kütüphaneyi ve her parçanın geleceğini önceden bilir.)
- **T2 Gerilim bütçesi:** parça içi gerilim–boşalma eğrisi (bas dönüşü, drop güveni, enerji eğimi, filtre süpürmesi
  benzeri spektral işaretler); geçişin bir boşalmanın üstüne gelmesini cezalandır, kuruluşa oturmasını ödüllendir.
- **T3 Sürekli harmonik uzaklık:** Camelot etiketi yerine kroma korelasyonu, ±n yarım ton en iyi hizada. Hipotez, ölç.
- **T4 Adsız stil arketipleri:** Aşama B verisinden birkaç arketip; kullanıcıya 2–3 sezgisel kaydırıcı (uzun harman ↔
  kesmeli, sakin ↔ sert, tanıdık ↔ sürpriz).
- **T5 Cihaz içi zevk öğrenimi:** atla/kilitle/dinleme süresinden Bayesçi tercih modeli (bandit); telemetri yok,
  tamamen yerel, sıfırlanabilir, açıklanabilir.
- **T6 Katmanlı (stem) karışım:** davul/bas/vokal ayrıştırma (ROADMAP fikir havuzunda; kod ve model ağırlığı lisansı
  ve CPU/kalite araştırması gerekir), çevrimdışı ve önceden hesaplanarak.
- **T7 "Çalmadan önce dinleyen DJ":** planlanan her geçişi arka planda sentezleyip otomatik denetle (vuruş hizası hatası
  ms, bas maskeleme skoru, yükseklik sıçraması, kırpma); eşik altındaysa planı değiştir ya da güvenli geçişe düş.
- **T8 Groove korunumu:** katı ızgara "makine gibi" ses riskini taşır; DJ'lerin bilinçli kaymalarını ölç.
- **T9 Açıklanabilir DJ:** her seçim ve geçiş için insan-okunur gerekçe ve müdahale ayarları.

Tez seçimi için sahibine seçenekler ve önerinle gel.

### Aşama D: Ölçüm ve doğrulama protokolü (`OLCUM-PROTOKOLU.md`)

1. **Nesnel ölçümler:** ızgara konum hatası (medyan ve %95, ms); tempo hatası (ppm); ölçü başı doğruluğu (yarım
   vuruş/ölçü kayması dahil); geçişte iki kaynağın vuruş farkı (ROADMAP hedefi ≤ 10 ms; algı eşiği literatürünü ?
   doğrula); bas çakışması skoru; LUFS sıçraması; kırpma ve tepe için Bölüm I MAT-01'deki dBTP tanımı. Mevcut F-ölçüsü
   ±70 ms DJ için yetersiz: yeni metrik tanımla.
2. **Gerçek müzikle doğruluk betiği (ANL-07):** sahibinin kütüphanesi ve işaretleme dosyalarıyla (`docs/ISARETLEME.md`),
   depoya ses sokmadan; Opus dosyaları da kapsansın (Bölüm I Faz 3 bittiyse).
3. **Algısal test:** çiftli/üçlü kör dinleme (İnsan DJ · Lyraska · basit crossfade). Dinleyici sayısı için güç analizi
   yap (etki büyüklüğü varsayımını açıkça yaz), katılımcı onayı ve gizlilik protokolü yaz; mevcut ABX aracını (Kör test)
   nerede yeniden kullanabileceğini belirt. Başarısızlık dahil açıkça raporla.
4. **Regresyon:** her ses ya da analiz değişikliğinden sonra aynı set çalıştırılıp sayılar karşılaştırılır; CI'ya
   girmeyen ağır ölçümler yerel betik olur.

### Aşama E: Çok yıllık mühendislik programı (yalnızca plan; `YOL-HARITASI-DJ.md`)

Sonuçları `docs/ROADMAP.md` Faz 6 ve Faz 7 ile uzlaştır: neyin değişmesi, neyin eklenmesi gerektiğini gerekçeli bir
**öneri** olarak yaz. Bilinen engeller §8'de; yeniden doğrula. Teknoloji adayları: zaman esnetme için Signalsmith
Stretch (önce MIT ✔; Rust bağlayıcısı ve CPU ağırlığı için kör testle gerçek şarkılarda karşılaştır) ve Rubber Band
(lisans onayı gerekir); beat modeli için Beat This! (CPU hızını ölç, varsayma; çıkışı 20 ms olduğundan ızgara
uydurmasıyla inceltilmeli; model boyutu ve çalışma zamanı kurulum kararı sahibinde); ton için yumuşak puan.
Kütüphanede giriş/çıkış, cümle sınırı ve vokal bilgisi yok ve kütüphane yalnızca metin arıyor: bellek içi özellik
tablosu gerekir (Bölüm I N7 ve ölçek işleri ile uyumlu).

<karar>
**Zorunlu karar: çıkış modu.** Otomatik karışım ses işler (kazanç, EQ, zaman esnetme, çapraz geçiş); özel
(bit-perfect) mod işlemeyi atladığı için orada karışım yapılamaz. Aşama E, Otomatik DJ'nin hangi çıkış modlarında
çalışacağını açıkça tanımlamalı. Öneri: karışım paylaşımlı yolda; özel modda yalnızca ardışık, boşluksuz çalma. Özel
modda karışım istenirse dither ve DSP kuralı (Bölüm I §4.3) yeniden değerlendirilir. Sahibine karar olarak sun.
</karar>

**İstenen çıktı:** zaman çizelgesiyle (ilk 90 gün · ilk yıl · 2–3 yıl) bağımlılık grafı, her fazın sayısal kabul
ölçütleri, risk kaydı, lisans etkisi (`deny.toml` ve `UCUNCU-TARAF.txt`), CI/test planı, ses yolu kuralları (bellek
ayırma yok) üzerindeki etki ve her faz sonunda yapılacak Aşama D ölçümü. Fazlar ses riski taşımayanlardan başlasın:
ölçüm düzeneği → ızgara 2.0 → özellik kartı → sessiz seçici prototipi → iki deck (Bölüm I Faz 4B ön koşul) →
esnetme → birleşik sistem.

### Teslimler (Türkçe, `docs/dj/` altında)

| Dosya                                                      | İçerik                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `ZANAAT-MODELI.md`                                         | Aşama A: taksonomi, kaynaklar, güven düzeyleri                 |
| `DJ-PROFILLERI.md`                                         | Aşama B: profiller, çapraz sentez, yöntem, veri sürümleri      |
| `SENTEZ-TEZLERI.md`                                        | Aşama C: tezler, formülasyonlar, öldürme ölçütleri             |
| `MATEMATIK.md` + `hesap/*.py`                              | Denklemler ve bağımsız doğrulama betikleri                     |
| `OLCUM-PROTOKOLU.md`                                       | Aşama D                                                        |
| `YOL-HARITASI-DJ.md`                                       | Aşama E: çok yıllık program ve ROADMAP uzlaştırma önerisi      |
| `BILINMEYENLER.md`                                         | Bilmediklerim, yanılabileceğim yerler, kırmızı takım sonuçları |
| `kaynaklar.json`, `iddialar.jsonl`, `arastirma-defteri.md` | Araştırma düzeni (§7)                                          |

Teslim uzunluğunu işin gerektirdiğine uydur: dolgu bölüm, yinelenen özet ve kalıp metin yok; DJ profili en çok iki sayfa,
tez en çok bir sayfa (§2.1).

### Çalışma düzeni (Bölüm II)

- Onay noktaları: K0, B0 listesi, Aşama C tez seçimi, Aşama E'nin uygulanması, çıkış modu kararı.
- Her aşamanın sonunda en çok bir sayfalık özet: bulunanlar · belirsizlikler · önerin · karar gerektirenler.
- Küçük commit'ler, PR (`main`'e doğrudan push yok), her PR'dan sonra devir notu.
- Kitabın bir yerini yanlış, çelişkili ya da uygulanamaz bulursan açıkça söyle ve gerekçeli alternatif öner. Amaç
  kitabı harfiyen uygulamak değil, gerçeğe en yakın ve en yaratıcı sonucu üretmek.

</dj>

<ornekler_dj>

<example>
**İddia defteri satırı (Bölüm II, `docs/dj/iddialar.jsonl`)**

```json
{
  "id": "I-014",
  "metin": "DJ Mag Top 100 DJs 2026, 234 bölgeden gelen halk oylamasıyla belirlendi.",
  "etiket": "KAYNAKLI",
  "kaynaklar": ["K-03"],
  "guven": "yüksek"
}
```

</example>

</ornekler_dj>
