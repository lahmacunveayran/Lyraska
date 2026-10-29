# Drop modeli, 2. sürüm (29 Ekim 2026)

Proje sahibi şöyle dedi: "Drop falan tam net yakalanmıyordu. Drop yakalama için gereken nihai mühendislik ve
matematiksel hesap kitabı yap." Bu çalışma drop bulmayı baştan kurar:

- Kanıtlar vuruş düzeyinde ölçülür.
- İki aşamalı, **işaret kısıtlı** bir lojistik modelle birleştirilir.
- Kanıtlar ve eşik, **tür dışarıda bırakılarak** yapılan çapraz doğrulamayla (leave-one-genre-out) seçilir. Bu
  doğrulamada her tür, hiç görülmeden ölçülür.

Kod `src-tauri/src/analysis/drop.rs`'tedir. 1. sürümün (ölçü düzeyinde kurallar) ölçümü [README.md](README.md)'de.

Model bağımsız bir incelemeden geçti ve bir kez düzeltildi; ayrıntısı aşağıda, "Bağımsız inceleme ve düzeltmeler"
bölümünde.

## Özet

**İsabet:** ekranda gösterilen (güven ≥ 0,6) bir drop'un, işaretli drop'a ±1 vuruş içinde düşmesi. **Yanlış:**
gösterilen ama hiçbir işaretli drop'a ±1 vuruş içinde düşmeyen drop.

Eski ve yeni yöntem aynı analiz karelerinde, aynı araçla ölçüldü (`examples/drop_olcum.rs` ikisini birden yazar).
Eski yöntem kendi gösterme eşiğiyle (0,6) ölçüldü.

| Set (şarkı / drop)                                                | Yöntem | ±1 vuruş | ±50 ms | Yanlış | Dropsuzda yanlış | Hata ortanca / %90 |
| ----------------------------------------------------------------- | ------ | -------- | ------ | ------ | ---------------- | ------------------ |
| Geliştirme, 1–3 (84 / 135; ağırlıklar bundan)                     | eski   | 78       | 78     | 42     | 12 (6/12 şarkı)  | 4 / 1841 ms        |
|                                                                   | yeni   | 92       | 90     | 6      | 1 (1/12)         | 4 / 10 ms          |
| Doğrulama, 11–13 (84 / 135)                                       | eski   | 75       | 73     | 47     | 12 (6/12)        | 3 / 1857 ms        |
|                                                                   | yeni   | 85       | 83     | 8      | 1 (1/12)         | 3 / 15 ms          |
| Son sınama, 21–23 (84 / 135; ilk incelemede görüldü)              | eski   | 77       | 77     | 36     | 12 (6/12)        | 4 / 19 ms          |
|                                                                   | yeni   | 82       | 82     | 7      | 1 (1/12)         | 3 / 9 ms           |
| **Yeni son sınama, 51–53** (84 / 135; kod bittikten sonra)        | eski   | 75       | 75     | 41     | 12 (6/12)        | 3 / 1358 ms        |
|                                                                   | yeni   | 77       | 75     | 13     | 0                | 3 / 345 ms         |
| Karşı örnek, crash/impact yok (40 / 62)                           | eski   | 41       | 40     | 22     | 6 (4/8)          | 4 / 1663 ms        |
|                                                                   | yeni   | 32       | 31     | 6      | 0                | 2 / 1198 ms        |
| **İncelemecinin karşı seti** (30 / 44; yalnızca en sonda bir kez) | eski   | 36       | 36     | 6      | 3 (2/6)          | 1 / 3 ms           |
|                                                                   | yeni   | 28       | 28     | 2      | 1 (1/6)          | 1 / 3 ms           |

Tür dışarıda bırakılarak yapılan çapraz doğrulama (geliştirme seti, eşik 0,6): **88/135 isabet, 21 yanlış.**

**Kısaca:**

- Yanlış drop her sette 4–7 kat azaldı.
- Dropsuz şarkılarda yanlış alarm şarkı başına ~1'den neredeyse sıfıra indi.
- Toplam isabet üreteç setlerinde eşit ya da biraz daha iyi.
- **Ama yeni model bazı türlerde eskinin altında.** Bunlar hip-hop'ta bas girişi, trap, drum and bass, crash'siz
  yükselişte kick rulosu ve incelemecinin setindeki drop'ların bir kısmı. Tür tür tablo "Sonuçlar" bölümünde; neden
  oldukları "Kalanlar"da.

## Deneme seti (`uret2.py`)

Gerçek şarkılar oturumda yok (ses dosyası depoya girmez). Bu yüzden drop anı **milisaniyesine bilinen** sentetik
şarkılar üretildi. Üretim numpy/scipy ile yapılır, çıktı 44,1 kHz FLAC'tır (ffmpeg). Her şarkı 1,5–3 dakikadır.
Tınılar şarkıya özgüdür: kick perdesi ve sönümü, snare, clap, hi-hat, crash, darbuka düm/tek. Bas türleri: offbeat,
sekizlik, wobble, 808, reese, uzun nota. Müzik: pad, pluck, lead, piyano, distorsiyonlu ve temiz gitar, akustik
tıngırtı, saz, yaylılar. Ses formant sentezidir (ünlüler a/e/i/o/u, vibrato). Yükseliş riser (süzgeci açılan gürültü
ve perdesi yükselen testere), sıklaşan trampet, kick rulosu ve ters crash ile yapılır. Yankı vardır. Kayıtlar
tanh ile sıkıştırılır (sürüş şarkıya göre değişir), −72 dB gürültü eklenir.

**Türler** (ilk 20 tür):

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

**2. genişleme (bağımsız incelemeden sonra, 8 tür daha; tohum başına 28 şarkı):**

| Tür              | Drop                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `tiz_artan`      | yükseliş karanlık (alçak geçiren, riser yok); drop tizleri açar (açık hi-hat, lead)          |
| `riserisiz`      | riser'sız, kısık yükseliş: yalnızca pad ve hafif trampet                                     |
| `dnb_sub`        | drum and bass; girişte ve yükselişte de süren alt bas, drop reese ve davulu getirir          |
| `ritimsiz_giris` | 3–5 ölçü ritimsiz giriş (pad, ses), hemen drop: drop şarkının başında, ızgara drop'ta başlar |
| `future_bass`    | alt bassız drop: pompalanan geniş testere akorları, yarım tempo davul                        |
| `hiphop_drop`    | 84–96 BPM; piyano girişinden sonra boom bap davul ve 808                                     |
| `tempo_degisen`  | 100–112 BPM'lik girişten sonra 124–132 BPM'lik yükseliş ve drop                              |
| `kisa`           | ~40 sn'lik şarkı, drop ~15 sn'de                                                             |

**Doğru cevap** (`ad.json`):

- `drops`: drop bölümünün ilk örneği, yani basın ve davulun döndüğü an.
- `sahte`: sahte drop anları; bunları drop saymak hatadır.
- `belirsiz`: rock'ta kıta → nakarat geçişleri. Drop sayılıp sayılmaması tartışmalıdır, ne isabet ne yanlış sayılır.

**Crash yalnızca drop'un işareti değildir.** Dropların %60'ında crash vardır, ayrıca %60'ında impact. Davullu başka
bölümlerin %35'i de crash ile başlar.

**Setler:**

- geliştirme (tohum 1–3): ağırlıklar, kanıt seçimi ve eşik yalnızca bundan, tür dışarıda bırakılarak;
- doğrulama (11–13) ve ilk son sınama (21–23): ilk sürüm sırasında ve incelemede sonuçlarına bakıldı;
- **yeni son sınama (51–53):** bu sürümün kodu bittikten sonra üretildi, hiçbir seçimde kullanılmadı;
- karşı örnek (`--vurgusuz`, 31–32): crash ve impact hiç yok;
- **incelemecinin karşı seti** (`karsi.py`, bağımsız üreteç, 30 şarkı): ayar için kullanılmadı, en sonda bir kez
  ölçüldü.

```
python3 docs/arastirma/drop/uret2.py /tmp/drop/gel 1        # tohum başına 28 şarkı (~5 dk, ~200 MB FLAC)
cd src-tauri && cargo run --release --example drop_olcum -- /tmp/drop/gel [--ayrinti] [--oz /tmp/drop/oz]
python3 docs/arastirma/drop/uydur.py /tmp/drop/gel /tmp/drop/oz --cv   # ağırlıklar + tür dışarıda bırakılarak sınama
```

Ölçüm aracı her şarkının analiz karelerini `ad.kare`'ye yazar; ses dosyaları sonra silinebilir. Eski ve yeni yöntemin
tür tür tablosunu yazar.

## Ölçütler

Yalnızca **gösterilen** droplar sayılır. Yeni model için bu güven ≥ `DROP_CONFIDENCE_MIN` = 0,6 demektir, eski yöntem
için de kendi eşiği olan 0,6. Programda sayaç, şerit ve Görsel Yönetmen yalnızca bunları kullanır. Her işaretli drop'a
en çok bir bulunan drop eşlenir, o da en yakını.

- **İsabet ±1 vuruş** ve **isabet ±50 ms** ayrı ayrı sayılır. Vuruş, şarkının drop'taki doğru temposundandır.
- **Kaçan:** ±1 vuruşta gösterilen drop yok.
- **Yanlış:** gösterilen ama işaretli drop'a ±1 vuruşta eşlenmeyen drop. Sahte drop'a denk gelen ayrı sayılır.
  Belirsiz geçişe ±1 sn içinde denk gelen hiç sayılmaz.
- **Zaman hatası:** ±1 ölçü içinde gösterilen droplarda |bulunan − işaretli| (ortanca ve %90).
- **Güvenin kalibrasyonu:** güven aralıklarına göre adayların gerçekten drop olma oranı, ve Brier puanı. Brier
  puanı, (güven − gerçek)² ortalamasıdır; sabit tahminle (bütün adaylara aynı oran) karşılaştırılır.

## Model

### Aday: her vuruş

1. sürüm adayları ölçü başlarıydı. Ölçü fazı yanlış bulununca (yarım tempolu dubstep, sessizlikten sonra kayan
   ızgara) drop ölçünün ortasına düşüyor ve program bir sonraki ölçü başını seçiyordu.

2. sürümde **her vuruş** adaydır. Ölçü başı yalnızca bir kanıttır (`downbeat`, ölçü güveniyle). Seçilen vuruşun bir
   vuruş öncesinde ya da sonrasında bas kısa pencerede açıkça (6 dB) daha çok dönüyorsa, drop o vuruştur. Böylece drop
   ölçü başı sanılan vuruşa kaymaz (test `olcu_basi_kanittir_yapistirilmaz`).

**Adaylık kuralları:**

- **Kapı:** bas, yakın (8 vuruş) ya da uzak (12–4 vuruş önce) öncesine göre en az 3 dB dönmelidir. Drop bir şeyden
  "düşer". Kapı olmayınca pop'ta nakaratın başı gibi her doruk bölüm başı ~%50 güven alıyordu. 3 dB, tür dışarıda
  bırakılarak denenen 3, 6 ve 9 dB arasından seçildi.
- **Şarkının başlangıcı drop değildir:** aday, şarkının duyulur ilk vuruşundan en az 12 vuruş sonra olmalıdır.
- **Izgaradan önceki kısım** (ritimsiz giriş, sessizlik) 16 uydurulan vuruşla doldurulur. Vuruş ızgarası drop'ta
  başlasa da drop'un öncesi ölçülür, şarkının başındaki drop da aday olur. İlk sürümde böyle bir drop hiç aday
  olamıyordu.

### Kanıtlar

B bas (bant 0–7, ~30–150 Hz), H tiz (bant 24–31, ~4–16 kHz), S 32 bant demektir. Hepsi vuruş ortalamasıdır ve dB
cinsindendir. `[a, b)` adaya göre vuruş aralığıdır, adayın vuruşu 0'dır.

| Kanıt       | Tanım                                            | Yön | Neyi ölçer                                              |
| ----------- | ------------------------------------------------ | --- | ------------------------------------------------------- |
| `bass_jump` | B[0,8) − B[−8,0)                                 | +   | bas döndü                                               |
| `bass_far`  | B[0,8) − B[−12,−4)                               | +   | son ölçüden öncesine göre bas dönüşü (son ölçüde rulo)  |
| `accent`    | H[0,4) − H[4,8)                                  | +   | ilk ölçü vurgulu (crash, impact)                        |
| `full`      | min(0, H[0,8) − Hᵦ)                              | +   | sonrası tam, boğuk değil                                |
| `level`     | min(0, B[0,8) − B₉₀)                             | +   | sonrası şarkının en güçlü bası                          |
| `sustain`   | B[0,32)'nin B[0,4) − 6 dB üstünde kalan payı     | +   | drop sürüyor (sahte drop iki vuruşta biter)             |
| `downbeat`  | ölçü güveni × (ölçü başıysa 0,75, değilse −0,25) | +   | ölçü başı; ölçü güveni yoksa nötr                       |
| `inhomog`   | orta bantlarda ortalama \|S[0,4) − S[4,12)\|     | −   | ilk ölçü sonrakilere benzemiyor (rulo, yükselişin sonu) |

- **Hᵦ:** şarkının bası güçlü vuruşlarındaki (bas %70 yüzdeliğin üstünde) ortanca tiz. İlk sürümde bütün vuruşların
  %80 yüzdeliğiydi. Parlak bir riser bu ölçüyü yükseltiyor ve yükselişi parlak şarkıda drop "boğuk" sayılıyordu.
- **B₉₀:** vuruşlardaki bas düzeyinin %90 yüzdeliği.
- Yüzdelikler yalnızca gerçek vuruşlardan hesaplanır, uydurulanlar hariç.

**Kanıt seçimi.** 14 aday kanıtla başlandı:

- yukarıdakiler,
- `gain` (yeni bantların dolması),
- `hi_jump` (tiz artışı),
- `gap` (hemen önce boşluk),
- `spec_step` (kısa adım),
- `peak_bass`, `peak_loud` (şarkının doruğuna uzaklık).

Geriye doğru eleme yapıldı. Ölçüt, tür dışarıda bırakılarak isabet − yanlıştı (eşik 0,5). Elenenlerin ağırlığı işaret
kısıtında zaten sıfıra iniyordu ya da ölçütü düşürüyordu. `inhomog` rulo sorununun çözümüdür. Yükselişin son
ölçüsündeki kick rulosu bas bantlarında drop kadar güçlüdür, ama orta bantları sonraki droptan farklıdır (4,5–6 dB);
drop'un ilk ölçüsü ise sonrakilere benzer (~2 dB).

### İki aşama ve işaret kısıtı

1. **Sıralama.** z = b + Σ wⱼ·xⱼ, vuruş düzeyinde bir lojistik modeldir ("drop tam bu vuruşta mı"). Pozitif örnek,
   işaretli drop'a en yakın vuruştur. Onun ±2 vuruş komşuları eğitime girmez. Birbirine 32 vuruştan (8 ölçü) yakın
   adaylardan puanı en yüksek olan kalır.
2. **Karar.** Güven p = σ(c₀ + c_z·z + Σ cⱼ·xⱼ). Bu lojistik model yalnızca seçilen adaylarla uydurulur ("bu aday
   gerçek bir drop mu"); pozitifi ±1 vuruşta işaretli drop'tur.

Uydurmanın kuralları:

- **İşaret kısıtı:** her ağırlık kanıtın fiziksel yönündedir ya da sıfırdır (sınırlı L-BFGS-B).
- **Ölçüsü bilinmeyen şarkı:** her eğitim satırı bir kez de `downbeat` = 0 ile, yani ölçü güveni 0 ile eğitime girer.
- **Ceza:** L2 cezası 1. aşamada 1, 2. aşamada 3.
- **Kaynak:** yalnızca geliştirme seti kullanılır (`uydur.py`).

Rust'taki sabitler standartlaştırması geri alınmış katsayılardır. Standart etki, ağırlık × kanıtın standart
sapmasıdır (logit cinsinden).

| Kanıt                | Yön | 1. aşama ağırlığı | standart etki | 2. aşama ağırlığı | standart etki |
| -------------------- | --- | ----------------- | ------------- | ----------------- | ------------- |
| `bass_jump`          | +   | 0,219             | +1,59         | 0                 | 0             |
| `bass_far`           | +   | 0                 | 0             | 0,056             | +0,70         |
| `accent`             | +   | 0,213             | +1,06         | 0,008             | +0,06         |
| `full`               | +   | 0,352             | +2,53         | 0,208             | +1,30         |
| `level`              | +   | 0,076             | +1,00         | 0,160             | +1,82         |
| `sustain`            | +   | 1,961             | +0,43         | 5,340             | +0,99         |
| `downbeat`           | +   | 2,841             | +1,13         | 0,184             | +0,04         |
| `inhomog`            | −   | −1,167            | −2,45         | −0,638            | −0,69         |
| `z` (1. aşama puanı) | +   | –                 | –             | 0,215             | +1,13         |
| sabit                |     | −6,173            |               | −3,893            |               |

### An

Drop anı, seçilen vuruşun yarım vuruş öncesiyle sonrası arasındaki karedir: bir vuruşluk pencerelerle bas düzeyi
farkının en büyük olduğu kare (`refine_drop`, 60 kare/sn). Fark vuruştakini ≈ 5 dB geçmiyorsa vuruş kalır. Zaman
hatasının ortancası 3–4 ms'dir. Yeni son sınamanın %90'ı (345 ms) tempo oktavı yanlış bulunan dnb şarkılarından gelir.

### Eşik ve kalibrasyon

Eşik tür dışarıda bırakılarak seçildi; ölçüt isabet − yanlıştır.

| Eşik | İsabet | Yanlış |
| ---- | ------ | ------ |
| 0,3  | 98/135 | 32     |
| 0,4  | 96/135 | 30     |
| 0,5  | 92/135 | 27     |
| 0,6  | 88/135 | 21     |
| 0,7  | 76/135 | 13     |

0,6 en iyisi oldu: 0,5'e göre 4 isabet daha az, 6 yanlış daha az. Bu yüzden `DROP_CONFIDENCE_MIN` değişmedi. Güvenin
kalibrasyonu iki biçimde ölçüldü: tür dışarıda bırakılarak (geliştirme setinin 141 adayı) ve hiç görülmemiş yeni son
sınamada (123 aday).

| Güven   | Tür dışarıda: aday | gerçekten drop | Yeni son sınama: aday | gerçekten drop |
| ------- | ------------------ | -------------- | --------------------- | -------------- |
| 0,2–0,4 | 11                 | %27            | 10                    | %30            |
| 0,4–0,6 | 17                 | %47            | 23                    | %57            |
| 0,6–0,8 | 39                 | %62            | 21                    | %52            |
| 0,8–1   | 70                 | %91            | 69                    | %96            |

Brier: tür dışarıda 0,160 (sabit tahmin 0,203), yeni son sınamada 0,129 (sabit tahmin 0,184). İlk sürümde (0,2–0,4
aralığı gerçekte %55, 0,4–0,6 aralığı %77 drop) güven olduğundan düşüktü. Bu sürümde 0,6–0,8 aralığı biraz iyimserdir
(%52–62).

## Bağımsız inceleme ve düzeltmeler

İlk sürüm bağımsız bir incelemede "birleştirilmez" kararı aldı. İncelemecinin karşı setinde yeni model 17/44, eski
yöntem 36/44 buldu. Bulgular ve düzeltmeleri:

1. **`hi_jump` sızıntısı.** `uret2.py`'deki riser ve rulo yüzünden setlerde drop'ta tiz düşüyordu, ağırlık bu yüzden
   negatif çıktı. Gerçek müzikte tiz çoğunlukla artar (rock'ta +25 dB). Düzeltme: bütün ağırlıklar işaret kısıtlı
   uyduruluyor. `hi_jump` kısıtla sıfıra indi ve elendi. Aynı sızıntı `gain` için de vardı (serbest uydurmada −0,84;
   tür dışarıda bırakılınca rock 0/6).
2. **Ölçü güveni 0 olunca drop bastırılıyordu**, çünkü sabit terim ölçü başı kanıtını yutmuştu. Düzeltme: eğitimde
   ölçü güveni 0 olan kopya kullanılıyor (test `olcu_guveni_yokken_drop_bastirilmaz`).
3. **Güven kalibre değildi.** Düzeltme: karar modeli karışık sette (28 tür) yeniden uyduruldu. Kalibrasyon tür
   dışarıda bırakılarak ve yeni son sınamada ölçüldü (tablo yukarıda).
4. **Şarkının başındaki drop aday olamıyordu.** Düzeltme: ızgara öncesi uydurulan vuruşlar, şarkı başlangıcı kuralı
   ve tür `ritimsiz_giris` (testler `izgaradan_hemen_sonraki_drop_aday_olur`,
   `ritimsiz_giristen_sonraki_ilk_drop_bulunur`).
5. **`full`/`level` yüzdelikleri** parlak yükselişi ve kısa şarkıyı cezalandırıyordu. Düzeltme: Hᵦ ve tür `kisa`
   (kısa şarkı 0–1/3'ten 2–3/3'e).
6. **Arayüz.** Panelde her drop'un farkı, güveni düşük (gösterilmeyen) aday için de "güven 0,45, gösterilmiyor" ile
   yazılıyor. Parmak gecikmesi düşümü beat F-ölçüsüne bağlı: gecikme düzeltilince F ≥ %80 ise uygulanıyor.
7. **Üreteç genişletildi** (8 tür). Kanıtlar ve eşik tür dışarıda bırakılarak seçiliyor.
8. **Değerlendirme.** İncelemecinin seti en sonda bir kez ölçüldü. Yeni son sınama seti (51–53) kod bittikten sonra
   üretildi.
9. **Drum and bass temposu** (`tempo.rs`, sürekli reese/sub bas kick kanıtını maskeliyor): bu dalda düzeltilmedi,
   ACIK-KONULAR'da ayrı iş.

**Denenip bırakılanlar.** Hepsi tür dışarıda bırakılarak ölçüldü ve hiçbiri seçilen modeli geçmedi:

- eski yöntemin güvenini ek kanıt yapmak (75/135, 22 yanlış);
- eski ve yeni yöntemin "ikisi de buldu" birleşimi (birkaç isabet artı, birkaç yanlış artı; hip-hop'u düzeltmedi);
- yalnızca puandan karar (Platt ölçeklemesi; 69/135, 30 yanlış);
- daha güçlü L2;
- kısıtsız uydurma (89/135, 10 yanlış ama rock 0/6: sızıntı).

## Sonuçlar (tür tür, eski → yeni, ±1 vuruş)

| Tür              | Gel.                            | Doğ.                            | Son (21–23)                     | Yeni son (51–53)                 | Vurgusuz                      | İnceleme                     |
| ---------------- | ------------------------------- | ------------------------------- | ------------------------------- | -------------------------------- | ----------------------------- | ---------------------------- |
| akustik          | yanlış 6 → 1                    | yanlış 6 → 1                    | yanlış 6 → 0                    | yanlış 6 → 0                     | yanlış 4 → 0                  |                              |
| arabesk          |                                 |                                 |                                 |                                  |                               | yanlış 3 → 1                 |
| balad            | yanlış 6 → 0                    | yanlış 6 → 0                    | yanlış 6 → 0                    | yanlış 6 → 0                     | yanlış 2 → 0                  |                              |
| bas_donusu       | 1/6 → 4/6 (2 → 1 yanlış)        | 0/6 → 5/6 (3 → 1 yanlış)        | 0/6 → 4/6 (2 → 0 yanlış)        | 3/6 → 4/6 (0 → 1 yanlış)         | 0/4 → 0/4 (2 → 0 yanlış)      |                              |
| canli            |                                 |                                 |                                 |                                  |                               | yanlış 0 → 0                 |
| dnb              | 6/6 → 6/6 (0 → 0 yanlış)        | 4/6 → 2/6 (2 → 2 yanlış)        | 4/6 → 0/6 (2 → 1 yanlış)        | 1/6 → 0/6 (5 → 4 yanlış)         | 2/4 → 0/4 (2 → 1 yanlış)      |                              |
| dnb_sub          | 0/6 → 0/6 (0 → 0 yanlış)        | 0/6 → 0/6 (0 → 0 yanlış)        | 0/6 → 0/6 (0 → 0 yanlış)        | 0/6 → 0/6 (0 → 0 yanlış)         |                               |                              |
| dnb_tam          |                                 |                                 |                                 |                                  |                               | 4/4 → 0/4 (0 → 0 yanlış)     |
| dubstep          | 2/6 → 6/6 (4 → 0 yanlış)        | 5/6 → 6/6 (1 → 0 yanlış)        | 5/6 → 5/6 (1 → 0 yanlış)        | 5/6 → 5/6 (1 → 0 yanlış)         | 1/4 → 2/4 (3 → 1 yanlış)      |                              |
| filtre           | 0/6 → 0/6 (3 → 0 yanlış)        | 0/6 → 0/6 (3 → 0 yanlış)        | 0/6 → 0/6 (3 → 0 yanlış)        | 0/6 → 0/6 (3 → 0 yanlış)         | 0/4 → 0/4 (2 → 0 yanlış)      |                              |
| future_bass      | 0/6 → 0/6 (0 → 0 yanlış)        | 0/6 → 0/6 (0 → 0 yanlış)        | 0/6 → 0/6 (0 → 0 yanlış)        | 0/6 → 0/6 (0 → 0 yanlış)         |                               | 4/4 → 3/4 (0 → 0 yanlış)     |
| hiphop_drop      | 6/6 → 2/6 (0 → 0 yanlış)        | 6/6 → 0/6 (0 → 0 yanlış)        | 6/6 → 3/6 (0 → 0 yanlış)        | 6/6 → 0/6 (0 → 0 yanlış)         |                               | 2/4 → 0/4 (0 → 0 yanlış)     |
| house            | 3/3 → 3/3 (1 → 2 yanlış)        | 3/3 → 3/3 (1 → 1 yanlış)        | 3/3 → 3/3 (1 → 3 yanlış)        | 3/3 → 3/3 (1 → 1 yanlış)         | 2/2 → 2/2 (1 → 1 yanlış)      |                              |
| ikinci_drop      | 3/6 → 4/6 (3 → 0 yanlış)        | 4/6 → 5/6 (2 → 0 yanlış)        | 2/6 → 3/6 (4 → 0 yanlış)        | 4/6 → 3/6 (2 → 1 yanlış)         | 2/4 → 0/4 (2 → 0 yanlış)      |                              |
| kisa             | 1/3 → 3/3 (0 → 0 yanlış)        | 1/3 → 3/3 (2 → 0 yanlış)        | 0/3 → 3/3 (0 → 0 yanlış)        | 0/3 → 2/3 (0 → 1 yanlış)         |                               | 2/2 → 2/2 (0 → 0 yanlış)     |
| limiter_edm      |                                 |                                 |                                 |                                  |                               | 4/4 → 4/4 (0 → 0 yanlış)     |
| melodik          | 0/6 → 0/6 (3 → 0 yanlış)        | 0/6 → 0/6 (3 → 0 yanlış)        | 0/6 → 0/6 (2 → 0 yanlış)        | 0/6 → 0/6 (2 → 0 yanlış)         | 2/4 → 0/4 (0 → 0 yanlış)      |                              |
| metal            |                                 |                                 |                                 |                                  |                               | 2/4 → 2/4 (1 → 1 yanlış)     |
| pop              | yanlış 0 → 0                    | yanlış 0 → 0                    | yanlış 0 → 1                    | yanlış 0 → 0                     | yanlış 0 → 0                  |                              |
| riserisiz        | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)         |                               |                              |
| ritimsiz_giris   | 4/6 → 6/6 (2 → 0 yanlış)        | 2/6 → 4/6 (3 → 1 yanlış)        | 5/6 → 5/6 (1 → 0 yanlış)        | 1/6 → 5/6 (5 → 1 yanlış)         |                               |                              |
| rock             | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)         | 4/4 → 4/4 (0 → 0 yanlış)      |                              |
| rock_giris       |                                 |                                 |                                 |                                  |                               | 2/4 → 2/4 (2 → 0 yanlış)     |
| sahte_drop       | 3/6 → 5/6 (3 → 0 yanlış)        | 1/6 → 5/6 (5 → 1 yanlış)        | 3/6 → 3/6 (3 → 1 yanlış)        | 3/6 → 3/6 (3 → 1 yanlış)         | 2/4 → 2/4 (1 → 2 yanlış)      |                              |
| sessiz_giris     |                                 |                                 |                                 |                                  |                               | 2/4 → 2/4 (0 → 0 yanlış)     |
| sessizlik        | 5/6 → 6/6 (0 → 0 yanlış)        | 5/6 → 6/6 (0 → 0 yanlış)        | 5/6 → 6/6 (0 → 0 yanlış)        | 5/6 → 6/6 (0 → 0 yanlış)         | 4/4 → 4/4 (0 → 0 yanlış)      |                              |
| tempo_degisen    | 1/3 → 2/3 (2 → 0 yanlış)        | 2/3 → 2/3 (1 → 0 yanlış)        | 2/3 → 2/3 (1 → 0 yanlış)        | 3/3 → 3/3 (0 → 0 yanlış)         |                               | 2/2 → 1/2 (0 → 0 yanlış)     |
| tiz_artan        | 0/6 → 2/6 (0 → 0 yanlış)        | 2/6 → 2/6 (0 → 0 yanlış)        | 3/6 → 4/6 (0 → 0 yanlış)        | 0/6 → 0/6 (0 → 0 yanlış)         |                               |                              |
| trap             | 6/6 → 4/6 (0 → 0 yanlış)        | 6/6 → 4/6 (0 → 0 yanlış)        | 6/6 → 2/6 (0 → 0 yanlış)        | 6/6 → 5/6 (0 → 0 yanlış)         | 4/4 → 4/4 (0 → 0 yanlış)      |                              |
| turk_pop         | yanlış 0 → 0                    | yanlış 0 → 0                    | yanlış 0 → 0                    | yanlış 0 → 0                     | yanlış 0 → 0                  |                              |
| turk_pop_nakarat |                                 |                                 |                                 |                                  |                               | yanlış 0 → 0                 |
| turk_remix       | 5/6 → 6/6 (3 → 0 yanlış)        | 4/6 → 6/6 (3 → 0 yanlış)        | 0/6 → 6/6 (2 → 0 yanlış)        | 3/6 → 6/6 (3 → 0 yanlış)         | 4/4 → 4/4 (2 → 0 yanlış)      |                              |
| uzun_giris       | 6/6 → 5/6 (0 → 0 yanlış)        | 6/6 → 4/6 (0 → 1 yanlış)        | 4/6 → 4/6 (1 → 1 yanlış)        | 4/6 → 6/6 (2 → 0 yanlış)         | 2/4 → 2/4 (1 → 1 yanlış)      |                              |
| vals_drop        |                                 |                                 |                                 |                                  |                               | 4/4 → 4/4 (0 → 0 yanlış)     |
| vokal_cagri      | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)         | 4/4 → 4/4 (0 → 0 yanlış)      |                              |
| yalniz_vokal     |                                 |                                 |                                 |                                  |                               | 4/4 → 4/4 (0 → 0 yanlış)     |
| yuksek_yukselis  | 6/6 → 6/6 (0 → 0 yanlış)        | 4/6 → 4/6 (2 → 0 yanlış)        | 5/6 → 5/6 (1 → 0 yanlış)        | 6/6 → 5/6 (0 → 0 yanlış)         | 4/4 → 4/4 (0 → 0 yanlış)      |                              |
| yukselis         | 2/6 → 4/6 (4 → 2 yanlış)        | 2/6 → 6/6 (4 → 0 yanlış)        | 6/6 → 6/6 (0 → 0 yanlış)        | 4/6 → 3/6 (2 → 3 yanlış)         | 4/4 → 0/4 (0 → 0 yanlış)      |                              |
| yukselissiz      |                                 |                                 |                                 |                                  |                               | 4/4 → 4/4 (0 → 0 yanlış)     |
| Toplam           | 78/135 → 92/135 (42 → 6 yanlış) | 75/135 → 85/135 (47 → 8 yanlış) | 77/135 → 82/135 (36 → 7 yanlış) | 75/135 → 77/135 (41 → 13 yanlış) | 41/62 → 32/62 (22 → 6 yanlış) | 36/44 → 28/44 (6 → 2 yanlış) |

"Yanlış" sayıları parantezde. İncelemecinin setindeki türler o setin kendi adlarıdır.

## Kalanlar (eskinin altına düşen türler ve nedenleri)

- **Hip-hop drop'u** (piyano girişinden sonra boom bap ve 808): yeni modelde 0–3/6, eski yöntemde 6/6. Model drop'u
  doğru yerde buluyor ama güveni 0,2–0,5'te kalıyor. Nedeni: bu drop'larda crash yok (`accent` 0) ve ilk ölçü
  sonrakilere az benziyor (`inhomog` yüksek). Model bu kanıtları başka türlerden öğrendi; hip-hop dışarıda
  bırakıldığında bu tür drop'u tanımıyor. Eski yöntem bas ve kick dönüşüne bakar, bu yüzden bulur. Ama aynı kural
  baladda ve akustikte de yanlış alarm verir (eski: dropsuz şarkıların yarısında).
- **Trap** (2–5/6, eski 6/6) ve **drum and bass** (0–2/6, eski 1–6/6): dnb'de tempo yarıya iniyor (`tempo.rs`, ayrı
  iş). Vuruş ızgarası seyrekleşince an bir vuruş kayıyor ya da güven düşüyor. İncelemecinin `dnb_tam` türü de böyle:
  0/4, eski 4/4.
- **Crash'siz yükselişte kick rulosu** (karşı örnek seti, `yukselis`: 0/4, eski 4/4): drop bir ölçü erkene, ruloya
  kayıyor. `inhomog` ruloyu crash varken eliyor, yokken yetmiyor.
- **Filtre açılması, alt bassız future bass, sürekli sub baslı dnb, melodik drop:** iki yöntem de bulamıyor (0/6).
  Drop'u bas değil, tizlerin ya da davulun dönüşü getiriyor. Kapı (3 dB bas dönüşü) bunları aday yapmıyor.
- **Baladda yumuşak grup girişi** (bas +4 dB, şarkının doruğu, sürüyor): grubun büyük girişinden ayrılamıyor, drop
  sayılabiliyor. Sentetik baladlarda nadir (0–1 yanlış), birim testinde not olarak duruyor.
- **Bütün setler sentetik.** İncelemecinin bağımsız üretecinde yeni model 28/44, eski yöntem 36/44 (2 ve 6 yanlış).
  Asıl sınama sahibinin işaretleridir (DOGRULAMA A15). Sahibinin işaret dosyalarıyla `uydur.py` yeniden
  çalıştırılabilir. Bunun için `drop_olcum` sahibinin şarkı ve işaret klasörünü okuyacak biçime getirilir.
- **1. sürüm** (`structure.rs`, `find_drops`) programda kullanılmaz. Ölçüm aracı yeni modeli aynı karelerde onunla
  karşılaştırsın diye testleriyle birlikte korunur.

## Sahibiyle doğrulama

1. İşaretle panelinde şarkıyı dinlerken drop anlarında `D`'ye basın.
2. **Doğruluğu ölç**'e basın.

Panel iki şey yazar:

- **Drop isabeti:** işaretlenen droplardan kaçı ±1 sn içinde bulundu.
- **Drop anı farkı (program − siz):** her drop için en yakın adayın farkı, ms cinsinden. Eksi değer, programın
  işaretten önce bulduğunu gösterir. Aday gösterilmiyorsa güveni yazılır ("güven 0,45, gösterilmiyor"). ±1 sn'de
  aday yoksa "bulunamadı" yazar.

Beat'ler de işaretlendiyse ve gecikme düzeltilince beat F-ölçüsü en az %80 ise, parmak gecikmesi düşülmüş fark da
yazılır. İşaret dosyalarının biçimi değişmedi.
