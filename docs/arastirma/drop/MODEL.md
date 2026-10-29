# Drop modeli, 2. sürüm (29 Ekim 2026)

Proje sahibi: "Drop falan tam net yakalanmıyordu. Drop yakalama için gereken nihai mühendislik ve matematiksel hesap
kitabı yap." Bu çalışma drop bulmayı baştan kurar. Kanıtlar vuruş düzeyinde ölçülür ve iki aşamalı lojistik modelle
birleştirilir. Ağırlıklar ölçülerek, geliştirme setinden uydurulur. Kod `src-tauri/src/analysis/drop.rs`'tedir. 1.
sürümün (ölçü düzeyinde kurallar) ölçümü [README.md](README.md)'de.

## Özet

İsabet, ekranda gösterilen (güven ≥ 0,6) bir drop'un işaretli drop'a ±1 vuruş içinde düşmesidir. Yanlış, hiçbir
işaretli drop'a ±1 vuruş içinde düşmeyen gösterilen drop'tur. Eski ve yeni yöntem aynı analiz karelerinde, aynı araçla
ölçüldü (`examples/drop_olcum.rs` ikisini birden yazar).

| Set (şarkı / drop)                        | Yöntem | ±1 vuruş | ±50 ms | Yanlış drop | Dropsuz şarkıda yanlış | Sahte drop sayıldı | Hata ortanca / %90 |
| ----------------------------------------- | ------ | -------- | ------ | ----------- | ---------------------- | ------------------ | ------------------ |
| Geliştirme (60 / 93; ağırlıklar bundan)   | eski   | 60       | 60     | 38          | 12 (6/12 şarkıda)      | 0/3                | 4 / 1846 ms        |
|                                           | yeni   | 77       | 75     | 1           | 1 (1/12)               | 0/3                | 4 / 11 ms          |
| Doğrulama (60 / 93)                       | eski   | 56       | 54     | 41          | 12 (6/12)              | 0/3                | 3 / 1857 ms        |
|                                           | yeni   | 77       | 72     | 1           | 0                      | 0/3                | 3 / 14 ms          |
| Son sınama (60 / 93; kod bittikten sonra) | eski   | 55       | 55     | 34          | 12 (6/12)              | 0/3                | 4 / 1032 ms        |
|                                           | yeni   | 69       | 67     | 3           | 1 (1/12)               | 0/3                | 4 / 11 ms          |
| Karşı örnek: crash/impact yok (40 / 62)   | eski   | 41       | 40     | 22          | 6 (4/8)                | 1/2                | 4 / 1663 ms        |
|                                           | yeni   | 48       | 46     | 2           | 0                      | 1/2                | 4 / 11 ms          |

Hata: ±1 ölçü içinde gösterilen droplarda |bulunan − doğru|. Eskinin %90'ı bir ölçüdür: drop sık sık bir ölçü erken
(yükselişin sonundaki ruloda) ya da geç bulunuyordu.

**Kısaca:** yanlış drop 34–41'den 1–3'e indi. Dropsuz şarkılardaki yanlış alarm şarkı başına ~1'den neredeyse sıfıra
indi. İsabet 55–60'tan 69–77'ye çıktı. Kalan kayıpların çoğu bulunmamış drop değil, yerinde bulunmuş ama güveni
0,6'nın altında kalmış droptur (aşağıda "Kalanlar").

## Deneme seti (`uret2.py`)

Gerçek şarkılar oturumda yok (ses dosyası depoya girmez). Bu yüzden drop anı **milisaniyesine bilinen** sentetik
şarkılar üretildi. Üretim numpy/scipy ile yapılır, çıktı 44,1 kHz FLAC'tır (ffmpeg). Her şarkı 1,5–3 dakikadır.
Tınılar şarkıya özgüdür: kick perdesi ve sönümü, snare, clap, hi-hat, crash, darbuka düm/tek. Bas türleri: offbeat,
sekizlik, wobble, 808, reese, uzun nota. Müzik: pad, pluck, lead, piyano, distorsiyonlu ve temiz gitar, akustik
tıngırtı, saz, yaylılar. Ses formant sentezidir (ünlüler a/e/i/o/u, vibrato). Yükseliş riser (süzgeci açılan gürültü
ve perdesi yükselen testere), sıklaşan trampet, kick rulosu ve ters crash ile yapılır. Yankı vardır. Kayıtlar
tanh ile sıkıştırılır (sürüş şarkıya göre değişir), −72 dB gürültü eklenir.

**Türler** (her tohumda 20 şarkı):

| Tür                  | Drop                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `yukselis`           | riser + sıklaşan trampet + filtre açılması (yarısında kick rulosu)                                                                        |
| `sessizlik`          | yükselişin son 1, 2 ya da 4 vuruşu sessiz (kimisinde sesin yankısı kalır)                                                                 |
| `bas_donusu`         | davul ve müzik sürer, bas yüksek geçirenle ince (alt bas yok); drop'ta tam bas                                                            |
| `filtre`             | bütün karışım alçak geçirenle boğuk, süzgeç açılır, son 1–2 ölçü davulsuz                                                                 |
| `vokal_cagri`        | yükselişin sonunda "drop" çağrısı; son 2–4 vuruşta yalnızca ses                                                                           |
| `sahte_drop`         | 2, 4 ya da 8 vuruşluk patlama, sonra 4 ölçü daha yükseliş, sonra asıl drop                                                                |
| `ikinci_drop`        | iki drop, biri "hafif" (alt bassız, orta bas)                                                                                             |
| `dubstep`            | 140, yarım tempo, wobble; kimisinde çağrı ve bir vuruş boşluk                                                                             |
| `trap`               | 136–150, 808, hi-hat rulosu, clap 3'te                                                                                                    |
| `dnb`                | 170–176, reese bas, iki adım                                                                                                              |
| `house`              | yalnızca kick → groove → davulsuz ara → kısa filtre yükselişi → drop (kick döner)                                                         |
| `turk_remix`         | darbuka ve saz; darbuka rulosu ile yükseliş; drop'ta dört vuruş kick ve bas                                                               |
| `rock`               | temiz gitar girişinden sonra grubun girişi (drop); kıta → nakarat geçişleri "belirsiz"; ara ve davul dolgusundan sonra son nakarat (drop) |
| `melodik`            | yükselişte bas uzun notalarla tam sürer, drop davulu ve ritmik bası getirir                                                               |
| `yuksek_yukselis`    | sıkıştırılmış kayıt: yükseliş droptan yüksek                                                                                              |
| `uzun_giris`         | 24 ölçü ambiyans, yükselişsiz drop; sonra yükselişli ikinci drop                                                                          |
| `pop` (dropsuz)      | kıta / ön nakarat / nakarat / köprü; davul baştan sona                                                                                    |
| `balad` (dropsuz)    | piyano ve ses, yaylılar; ikinci kıtada yumuşak davul ve bas girer                                                                         |
| `akustik` (dropsuz)  | akustik gitar, ses, shaker; ikinci kıtada bas                                                                                             |
| `turk_pop` (dropsuz) | darbuka, saz, bas, ses baştan sona; nakaratta yaylılar                                                                                    |

**Doğru cevap** (`ad.json`): `drops` drop bölümünün ilk örneğidir (basın ve davulun döndüğü an). `sahte` sahte drop
anlarıdır: drop sayılmaları hatadır. `belirsiz` geçişler rock'ta kıta → nakarattır: drop sayılıp sayılmaması
tartışmalıdır, ne isabet ne yanlış sayılır.

**Crash yalnızca drop'un işareti değil:** dropların %60'ında crash vardır (ayrıca %60'ında impact). Davullu başka
bölümlerin %35'i de crash ile başlar. İlk sette her dropta crash vardı. Model crash'i en güçlü kanıt yaptı ve crash'siz
karşı sette 62 droptan yalnızca 11'ini buldu (aşağıda "Nasıl seçildi"). Bu yüzden üreteç düzeltildi ve bütün setler
yeniden üretildi.

**Setler:**

- geliştirme (tohum 1–3): ağırlıklar yalnızca bundan uyduruldu;
- doğrulama (tohum 11–13): kanıt seçimi sırasında iki kez sonuçlarına bakıldı (aşağıda);
- son sınama (tohum 21–23): kod ve ağırlıklar bittikten sonra üretildi, hiçbir seçimde kullanılmadı;
- karşı örnek (`--vurgusuz`, tohum 31–32): crash ve impact hiç yok. Model drop'un vurgusuna fazla mı dayanıyor, bunu
  ölçer.

```
python3 docs/arastirma/drop/uret2.py /tmp/drop/gel 1        # tohum başına 20 şarkı (~4 dk, ~150 MB FLAC)
cd src-tauri && cargo run --release --example drop_olcum -- /tmp/drop/gel [--ayrinti]
```

Araç her şarkının analiz karelerini `ad.kare`'ye yazar (ses dosyaları sonra silinebilir). Eski ve yeni yöntemin tür
tür tablosunu yazar. `--ayrinti` şarkı başına bulunan dropları güvenleriyle yazar.

## Ölçütler

Yalnızca **gösterilen** droplar sayılır (güven ≥ `DROP_CONFIDENCE_MIN` = 0,6). Programda sayaç, şerit ve Görsel
Yönetmen bunları kullanır. Her işaretli drop'a en çok bir bulunan drop eşlenir, en yakını.

- **İsabet ±1 vuruş** ve **isabet ±50 ms** ayrı ayrı sayılır. Vuruş, şarkının doğru temposundan hesaplanır. ±1 sn eski
  ölçüttür, tabloda yine de vardır.
- **Kaçan:** ±1 vuruşta gösterilen drop yok.
- **Yanlış drop:** hiçbir işaretli drop'a ±1 vuruş içinde eşlenmeyen gösterilen drop. Sahte drop'a denk gelen ayrı
  sayılır. Belirsiz geçişe ±1 sn içinde denk gelen hiç sayılmaz.
- **Dropsuz şarkıda yanlış:** dropsuz türlerdeki yanlış droplar ve bunların görüldüğü şarkı sayısı.
- **Sahteyi drop sayma:** sahte drop'a ±1 vuruş içinde gösterilen drop.
- **Zaman hatası:** ±1 ölçü içinde gösterilen droplarda |bulunan − işaretli| (ortanca ve %90).

## Model

### Aday: her vuruş

1. sürüm adayları ölçü başlarıydı. Ölçü fazı yanlışsa (yarım tempolu dubstep'te snare 3'te, sessizlikten sonra kayan
   ızgara) drop ölçünün ortasına düşüyordu ve program bir sonraki ölçü başını seçiyordu. Eski yöntemin dubstep'teki 1,3
   sn'lik hataları buydu. 2. sürümde **her vuruş** adaydır. Ölçü başı yalnızca bir kanıttır (`downbeat`), ölçü güveniyle
   ağırlıklandırılır. Ölçü başına yapıştırma yoktur. Ölçü başı kanıtı dışındaki puanı komşu vuruşta 1 logit (e kat
   olasılık oranı) yüksekse drop o vuruştur. Böylece ölçü fazı güvenle ama yanlış bulunduğunda drop, ölçü başı sanılan
   vuruşa kaymaz (test `olcu_basi_kanittir_yapistirilmaz`).

### Kanıtlar

B bas (bant 0–7, ~30–150 Hz), H tiz (bant 24–31, ~4–16 kHz), L ses yüksekliği (dBFS), S 32 bant. Hepsi vuruş
ortalamasıdır ve dB cinsindendir. `[a, b)` adaya göre vuruş aralığıdır, adayın vuruşu 0'dır. H₈₀ ve B₉₀, şarkının
vuruşlarındaki tiz ve bas düzeylerinin %80 ve %90 yüzdelikleridir.

| Kanıt       | Tanım                                            | Neyi ölçer                                                   |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `bass_jump` | B[0,8) − B[−8,0)                                 | bas döndü (bas bantları kick'i de içerir)                    |
| `bass_far`  | B[0,8) − B[−12,−4)                               | son ölçüden önceki kısma göre bas dönüşü (son ölçüdeki rulo) |
| `gain`      | bantlarda ortalama max(0, S[0,8) − S[−8,0))      | yeni bantlar doldu (filtre açılması, yeni çalgılar)          |
| `hi_jump`   | H[0,8) − H[−8,0)                                 | tizler arttı                                                 |
| `gap`       | max(0, L[−8,−2) − min(L₋₂, L₋₁))                 | hemen önce boşluk ya da kısılma (çağrı, sessizlik)           |
| `accent`    | H[0,4) − H[4,8)                                  | ilk ölçü vurgulu (crash, impact)                             |
| `full`      | min(0, H[0,8) − H₈₀)                             | sonrası tam, boğuk değil                                     |
| `level`     | min(0, B[0,8) − B₉₀)                             | sonrası şarkının en güçlü bası                               |
| `sustain`   | B[0,32)'nin B[0,4) − 6 dB üstünde kalan payı     | drop sürüyor (sahte drop iki vuruşta biter)                  |
| `downbeat`  | ölçü güveni × (ölçü başıysa 0,75, değilse −0,25) | ölçü başı; ölçü güveni yoksa nötr                            |
| `inhomog`   | orta bantlarda ortalama \|S[0,4) − S[4,12)\|     | ilk ölçü sonrakilere benzemiyor (rulo, yükselişin sonu)      |
| `spec_step` | bantlarda ortalama \|S[0,2) − S[−2,0)\|          | değişim tam bu vuruşta (an)                                  |

`inhomog` rulo sorununun çözümüdür. Yükselişin son ölçüsündeki kick rulosu bas bantlarında drop kadar güçlüdür
(geliştirme setinde 25–30 dB'lik bas dönüşü rulonun başında, drop'ta neredeyse sıfır). Ama rulo ölçüsünün orta
bantları sonraki droptan farklıdır (ortalama 4,5–6 dB). Drop'un ilk ölçüsü ise sonrakilere benzer (~2 dB). Drop,
**sürecek bir durumun başlangıcıdır**.

### İki aşama

1. **Sıralama.** z = b + Σ wⱼ·xⱼ, vuruş düzeyinde bir lojistik modeldir ("drop tam bu vuruşta mı"). Eğitimde pozitif
   örnek, işaretli drop'a en yakın vuruştur (yarım vuruş içinde). Onun ±2 vuruş komşuları eğitime girmez, çünkü aynı
   olayın kaymış hâlleridir. 14 372 vuruş vardır, 90'ı pozitiftir. Birbirine 32 vuruştan (8 ölçü) yakın adaylardan
   puanı en yüksek olan kalır (NMS).
2. **Karar.** Güven p = σ(c₀ + c_z·z + Σ cⱼ·xⱼ). Bu lojistik model yalnızca NMS'ten geçen adaylarla uydurulur ("bu aday
   gerçek bir drop mu"). 340 aday vardır; pozitif, ±1 vuruşta işaretli drop'tur. Tek aşamalı modelin güveni kalibre
   değildi. Vuruşların %99'u kolay negatiftir ve model onlara göre ayarlanır. İkinci aşama aynı kanıtları, yalnızca
   gerçekten yarışan adaylar arasında tartar. p, seçilen adayın drop olma olasılığıdır.

Uydurma L2 cezalı en büyük olabilirlikle yapılır (Newton yöntemi, özellikler standartlaştırılarak; 1. aşamada λ = 1, 2. aşamada λ = 3). Betik: `uydur.py`. Rust'taki sabitler standartlaştırması geri alınmış katsayılardır. Standart etki,
ağırlık × kanıtın standart sapmasıdır (logit). Kanıtın tipik bir değişiminin puana katkısıdır.

| Kanıt                | 1. aşama ağırlığı | standart etki | 2. aşama ağırlığı | standart etki |
| -------------------- | ----------------- | ------------- | ----------------- | ------------- |
| `bass_jump`          | 0,174             | +1,23         | 0,043             | +0,52         |
| `bass_far`           | −0,026            | −0,24         | 0,063             | +0,88         |
| `gain`               | −0,091            | −0,20         | 0,097             | +0,44         |
| `hi_jump`            | −0,142            | −0,90         | −0,112            | −1,24         |
| `gap`                | −0,013            | −0,03         | 0,011             | +0,09         |
| `accent`             | 0,186             | +0,91         | 0,080             | +0,56         |
| `full`               | 0,281             | +2,07         | 0,122             | +0,70         |
| `level`              | 0,144             | +1,95         | 0,138             | +0,92         |
| `sustain`            | 5,042             | +1,13         | 3,570             | +0,47         |
| `downbeat`           | 3,838             | +1,54         | 2,307             | +0,41         |
| `inhomog`            | −1,118            | −2,43         | −0,312            | −0,29         |
| `spec_step`          | 0,368             | +0,83         | −0,014            | −0,09         |
| `z` (1. aşama puanı) | –                 | –             | 0,226             | +1,16         |
| sabit                | −11,64            |               | −6,419            |               |

**Okuma:** Sıralamada en güçlü kanıtlar şunlardır: sonrasının tam ve şarkının en güçlü bası olması (`full`, `level`),
ilk ölçünün sonrakilere benzemesi (`inhomog`, rulo elemesi), ölçü başı ve bas dönüşü. `hi_jump`'ın negatif olması
şunu söyler: bas ve doluluk aynıyken yalnızca tizlerin artması yükselişin (riser) belirtisidir, drop'un değil. `gap`
ve `gain` sıralamada neredeyse etkisizdir. Sessizlikten sonraki drop'u zaten `bass_jump`, `spec_step` ve `full`
taşır. Kararda `level`, `bass_far` ve `full` öne çıkar. Yükselişten sonra mı (yükseliş bassızdır, son ölçüdeki rulo
dahil), sonrası şarkının doruğu mu, sorusudur.

### An

Seçilen vuruşun yarım vuruş öncesiyle sonrası arasında, bir vuruşluk pencerelerle bas düzeyi farkının en büyük olduğu
kare drop anıdır (`refine_drop`, 1. sürümden; 60 kare/sn). Fark vuruştakini 0,08'den (≈ 5 dB) az geçiyorsa vuruş
kalır. Bas sürekliyse ya da filtre açılıyorsa belirgin bir an yoktur. Zaman hatası ortanca 3–4 ms, %90'ı 11–14 ms'dir.
±50 ms'nin dışında kalan isabetlerin çoğu tempo oktavı yanlış bulunan dnb ve dubstep şarkılarıdır (vuruş ızgarası
iki kat seyrek). Seçilen vuruş orada bir gerçek vuruş kaymıştır.

### Eşikler

- Gösterilen drop: güven ≥ 0,6 (`DROP_CONFIDENCE_MIN`, arayüzle aynı). Geliştirme setinde eşik ile isabet/yanlış
  dengesi şöyledir (ince ayarsız):

  | Eşik | İsabet (±1 vuruş) | Yanlış |
  | ---- | ----------------- | ------ |
  | 0,4  | 82/93             | 8      |
  | 0,5  | 79/93             | 4      |
  | 0,6  | 75/93             | 3      |
  | 0,7  | 73/93             | 3      |
  | 0,8  | 70/93             | 3      |

- 0,2–0,6 arasındaki adaylar haritada güvenleriyle durur. Gösterilmezler, ama dışa aktarılan haritada ve ölçümde
  görünürler. 0,2'nin altındakiler listelenmez.

## Nasıl seçildi (dürüstlük notu)

1. İlk sette (eski üreteç) her dropta crash vardı. O sette kanıtlar denendi: ölçü yerine vuruş adayı, `inhomog`,
   bölüm sınırı, yükselişin tizinin bitişi. Bu aşamada doğrulama setine bir kez bakıldı.
2. Birim testi taslağı (yükselişten sonra bir ölçü yalnızca ses) "yükselişin tizi bitti" kanıtının drop'u dört vuruş
   erkene çektiğini gösterdi. İncelenince kanıtın işe yarayan kısmının drop'un ilk ölçüsündeki crash olduğu
   anlaşıldı (`accent`). Sette her dropta crash olduğu için model ona dayanıyordu. Crash'siz karşı sette o model 62
   droptan 11'ini buldu. Üreteç düzeltildi: crash olasılıklı, başka bölümlerde de var. Geliştirme ve doğrulama
   setleri aynı tohumlarla, düzeltilmiş üreteçle yeniden üretildi. Eski setlerin ölçümleri atıldı.
3. Yeni geliştirme setinde kısa adımlı kanıt (`spec_step`) eklendi. İki aşamalı karar kuruldu. İşareti anlamsız ya
   da etkisiz kanıtlar çıkarıldı: `loud_jump`, `boundary` (bölüm sınırı: geri kalan kanıtlarla birlikte ağırlığı
   negatifti), kısa bas/ses adımları. Çıkarılmaları geliştirme setinde tohum dışarıda bırakılarak yapılan çapraz
   doğrulamaya göre seçildi (70 → 71/93). Doğrulama setine bu seçimden sonra bir kez daha bakıldı (68 → 73/93).
   Bunlar doğrulama sonucunu biraz iyimser yapabilir. Son sınama hiçbir seçimde kullanılmadı.
4. Daha geniş an araması (±1 vuruş) ve daha kısa pencere denendi. Geliştirme setinde kötüleştirdi, bırakıldı.

## Kalanlar

- **Filtre açılması** (`filtre`): drop'u bas değil, tizlerin açılması getiriyorsa güven 0,3–0,5'te kalıyor.
  Gösterilmiyor ama yeri doğru, ±1 vuruşta. Eski yöntem bunun yerine boğuk bölümün başlangıcını drop sayıyordu
  (yanlış alarm).
- **Rock'ta grubun girişi:** yeri doğru, ama son sınamada güveni 6 droptan 4'ünde 0,6'nın altında. Eski yöntem rock'u
  6/6 buluyordu. Yükseliş belirtisi olmayan girişin drop olup olmadığı sahibinin şarkılarıyla görülecek.
- **Bas dönüşü ve melodik drop:** ilk drop'un güveni çoğu kez 0,6'nın altında; ikinci drop bulunuyor.
- **Tempo oktavı yanlışsa** (sentetik dnb'nin çoğunda 86 bulunuyor) vuruş ızgarası iki kat seyrek olur. Drop iki
  ızgara vuruşunun arasına düşer, an bir vuruşa kadar kayabilir (son sınamada dnb 1/6). Bu tempo bulmanın işidir
  (`tempo.rs`, ayrı iş).
- **Setlerin hepsi aynı üreteçten.** Gerçek şarkılarda kanıtların ağırlığı farklı olabilir. Asıl sınama sahibinin
  işaretleridir (DOGRULAMA A15). Model 12 kanıtlı, açık katsayılı bir lojistik modeldir. Sahibinin işaret
  dosyalarıyla `uydur.py` yeniden çalıştırılabilir. Bunun için `drop_olcum` sahibinin şarkı + işaret klasörünü de
  okuyacak biçime getirilir.
- 1. sürüm (`structure.rs`, `find_drops`) programda kullanılmaz. Ölçüm aracı yeni modeli aynı karelerde onunla
     karşılaştırsın diye ve testleriyle birlikte korunur.

## Sahibiyle doğrulama

İşaretle panelinde şarkıyı dinlerken drop anlarında `D`'ye basılır, sonra **Doğruluğu ölç**'e basılır. Panel iki şey
yazar: **Drop isabeti** (±1 sn içinde bulunan / işaretlenen) ve **Drop anı farkı (program − siz)**. İkincisi her drop
için ms cinsindendir: eksi değer programın işaretten önce bulduğunu gösterir, "bulunamadı" ise ±1 sn'de drop yok
demektir. Beat'ler de işaretlendiyse parmak gecikmesi düşülmüş fark da yazılır. Parmak gecikmesi, beat'lerdeki
ortanca kaymadır: `D` tuşu da Boşluk kadar geç basılır. İşaret dosyalarının biçimi değişmedi.
