# Kaçan mutantların sınıflandırması (5 Kasım 2026)

Kaynak kodu: `D:\Lyraska` (mutasyon aynaları `m1`/`m2` ile ilgili dosyaların satır numaraları aynı). Depoya dokunulmadı; cargo çalıştırılmadı. Sayısal kanıtlar saf Python ile (numpy yok),
`S\triage-araclari\` altındaki betiklerle üretildi; her betik ilgili Rust kodunun satır satır çevirisidir.

Sınıflar: **(a)** gerçek test açığı · **(b)** eşdeğer (davranış değişmez ya da ölçülemeyecek kadar küçük) ·
**(c)** test etmeye değmez (yalnızca ekran metni).
Önem: sesin kalitesini / kullanıcının duyduğunu etkiler mi (yüksek / orta / düşük).

## Yöntemle ilgili üç uyarı (sonuçları okurken)

1. Modül koşuları **örneklemdir**: `run_mut.sh` `--shard 0/n` ile her dosyanın mutantlarının yalnızca 1/n'ini
   denedi (ör. beats.rs için 1/30) ve testleri adla süzdü (ör. `audio::limiter audio::normalize audio::render`).
   Kaçanların listesi dosyanın bütün açıklarını göstermez.
2. Yeniden deneme (`recheck.sh`) `--cargo-arg=--lib` ile yapıldı: "bütün takım" = kütüphanenin birim testleri;
   `tests/formats.rs` gibi bütünleşme testleri dahil değil.
3. Modül listesinde olup recheck'e alınmayan 10 mutant yalnızca süzülmüş testlerle denendi; **bütün takımla
   yakalanıp yakalanmadıkları bilinmiyor** (aşağıda "recheck: yok" diye işaretli).

## Özet tablo

| #   | Mutant                                                       | Recheck | Sınıf         | Önem                         |
| --- | ------------------------------------------------------------ | ------- | ------------- | ---------------------------- |
| R1  | `render.rs:208:28` `*=` → `/=` (bit-perfect kazancı)         | kaçtı   | (a)           | **yüksek**                   |
| R2  | `normalize.rs:437:68` `/ n` → `* n` (sınır inişinde koruma)  | kaçtı   | (a)           | **yüksek**                   |
| R3  | `beats.rs:270:27` `2.0 / 3.0` → `2.0 % 3.0`                  | kaçtı   | (a)           | düşük                        |
| R4  | `beats.rs:349:34` `radius + 1` → `radius * 1`                | kaçtı   | (b)           | —                            |
| R5  | `beats.rs:542:27` `index - 1` → `index + 1` (kare altı tepe) | kaçtı   | (a)           | düşük (görsel senkron)       |
| R6  | `key.rs:261:53` `weight * c` → `weight + c`                  | kaçtı   | (a)           | düşük                        |
| R7  | `key.rs:428:32` `b <= a` → `b > a` (tepe koşulu)             | kaçtı   | (a)           | düşük                        |
| R8  | `structure.rs:184:26` `< 8` → `== 8`                         | kaçtı   | (a)           | düşük                        |
| R9  | `structure.rs:484:26` `start + window` → `start * window`    | kaçtı   | (a)           | düşük                        |
| R10 | `crossfeed.rs:342:9` `!self.stereo` → `self.stereo`          | kaçtı   | (a)           | düşük (üretimde çağıran yok) |
| R11 | `limiter.rs:245:32` `4π·n` → `4π/n` (pencere)                | kaçtı   | (a)           | düşük                        |
| R12 | `loudness.rs:192:57` `- 1 - t` → `/ 1 - t`                   | kaçtı   | (b)           | —                            |
| R13 | `loudness.rs:287:25` `>` → `==` (400 ms'den kısa ses)        | kaçtı   | (a)           | düşük                        |
| R14 | `controls.rs:35:9` `parametric_comparing` → `true`           | kaçtı   | (a)           | **yüksek**                   |
| R15 | `controls.rs:35:9` `parametric_comparing` → `false`          | kaçtı   | (a)           | orta                         |
| R16 | `controls.rs:35:33` `&&` → `\|\|`                            | kaçtı   | (a)           | **yüksek**                   |
| R17 | `controls.rs:88:9` `set_parametric_compare` → `()`           | kaçtı   | (a)           | orta                         |
| R18 | `controls.rs:93:9` `apply_parametric_compare` → `()`         | kaçtı   | (a)           | orta                         |
| N1  | `beats.rs:392:16` `<` → `<=`                                 | yok     | (b)           | —                            |
| N2  | `key.rs:308:31` `ma*ma*n` → `ma*ma/n`                        | yok     | (b)           | —                            |
| N3  | `key.rs:410:19` `<` → `<=`                                   | yok     | (b)           | —                            |
| N4  | `structure.rs:544:24` `>` → `>=`                             | yok     | (a)           | düşük                        |
| N5  | `structure.rs:804:33` `<` → `<=`                             | yok     | (b)           | —                            |
| N6  | `biquad.rs:379:41` `1 - a1 + a2` → `1 - a1 - a2` (çentik)    | yok     | (a)           | orta                         |
| N7  | `crossfeed.rs:203:24` `zero * pole` → `zero + pole`          | yok     | (b)           | —                            |
| N8  | `crossfeed.rs:205:16` `t > 0` → `t >= 0`                     | yok     | (b)           | —                            |
| N9  | `eq.rs:63:37` `2*BANDS - 1` → `2*BANDS + 1`                  | yok     | (b)           | —                            |
| N10 | `eq.rs:692:85` `< FLAT_DB` → `<= FLAT_DB`                    | yok     | (b)           | —                            |
| T1  | `crossfeed.ts:21` ipuçları → `{}`                            | —       | (c)           | —                            |
| T2  | `crossfeed.ts:111` seviye koşulu → `true`                    | —       | (a)           | düşük                        |
| T3  | `crossfeed.ts:118` `"227 µs"` → `""`                         | —       | (c)           | —                            |
| T4  | `lyrics.ts:4` kaynak yazıları → `{}`                         | —       | (c)           | —                            |
| T5  | `lyrics.ts:93` `"{}"` → `""`                                 | —       | (b)           | —                            |
| T6  | `lyrics.ts:207` `index + 2` → `index - 2`                    | —       | (a)           | düşük                        |
| T7  | `lyrics.ts:278` `!found` → `true`                            | —       | (b) (koşullu) | —                            |
| T8  | `parametric.ts:19` `"Yüksek geçiren"` → `""`                 | —       | (c)           | —                            |
| T9  | `parametric.ts:113` `q < 1` → `q >= 1` (Q yazısı)            | —       | (c)           | —                            |
| T10 | `parametric.ts:153` `>= 0.005` → `> 0.005`                   | —       | (b)           | —                            |
| T11 | `parametric.ts:167` `a[0] * b[1]` → `a[0] / b[1]`            | —       | (b)           | —                            |
| T12 | `parametric.ts:211` çentik `1 / q` → `1 * q`                 | —       | (a)           | düşük                        |
| T13 | `queue.ts:36` `{ paths: [path], index: 0 }` → `{}`           | —       | (a)           | düşük                        |
| T14 | `queue.ts:137` mulberry32 `t +` → `t -`                      | —       | (b)           | —                            |
| T15 | `sync.ts:43` `clicks.length === 0` → `false`                 | —       | (b)           | —                            |
| T16 | `sync.ts:53` `< MIN_TAPS` → `<= MIN_TAPS`                    | —       | (a)           | düşük                        |
| T17 | `sync.ts:60` `<= 40` → `< 40`                                | —       | (a)           | düşük                        |

Toplam: Rust 28 kaçan → (a) 18, (b) 10. Arayüz 17 kaçan → (a) 6, (b) 6, (c) 5.

### (a) sınıfı, önem sırasıyla

1. **R1** render.rs:208 — bit-perfect'te her açılış/devam/duraklatmada ~10 ms tam ölçek patlama (yüksek)
2. **R2** normalize.rs:437 — boşluksuz geçişte koruma patlar, NaN olur, oturumun geri kalanı sessiz (yüksek)
3. **R16** controls.rs:35 `||` — parametrik EQ açıkken hep atlanır (yüksek)
4. **R14** controls.rs:35 `true` — parametrik EQ açıkken hep atlanır (yüksek)
5. **N6** biquad.rs:379 — eşlenmiş çentik bütün bandı +3 dB'ye kadar yükseltebilir (orta)
6. **R18** controls.rs:93 — A/B düğmesi arayüzde değişir, ses değişmez (orta)
7. **R17** controls.rs:88 — A/B düğmesi hiçbir şey yapmaz (orta)
8. **R15** controls.rs:35 `false` — A/B hiç açılmaz (orta)
9. **R11** limiter.rs:245 — yüksek hızlarda gerçek tepe 0,3 dB'ye kadar kaçar (düşük)
10. **R13** loudness.rs:287 — 400 ms'den kısa ses ölçülmez, eşitlenmez (düşük)
11. **R5** beats.rs:542 — vuruş zamanları kareye yuvarlanır, ±8,3 ms (düşük; görsel senkron)
12. **R7** key.rs:428 — akort tahmini 5–18 sent kayar (düşük)
13. **R6** key.rs:261 — şarkı tonunun güveni şişer (düşük)
14. **R3** beats.rs:270 — 3:2 hızlanan bölüm "değişken tempo" sanılır (düşük)
15. **R9** structure.rs:484 — ölçü güveni yanlış hesaplanır (düşük)
16. **N4** structure.rs:544 — tekdüze müzikte her ölçü bölüm sınırı olur (düşük)
17. **R8** structure.rs:184 — tam 8 vuruşta harita yok, 4–7'de var (düşük)
18. **T13** queue.ts:36 — listede olmayan şarkı seçilince boş sıra (düşük)
19. **T6** lyrics.ts:207 — "sıradaki satır" önizlemesi yanlış satır (düşük)
20. **T2** crossfeed.ts:111 — hazır ayar adı yanlış eşleşir (düşük)
21. **T12** parametric.ts:211 — çentiğin önizleme eğrisi yanlış (düşük)
22. **T16** sync.ts:53 — tam 8 basışla ölçüm reddedilir (düşük)
23. **T17** sync.ts:60 — tam 40 ms dağınıklık güvenilmez sayılır (düşük)
24. **R10** crossfeed.rs:342 — yalnızca testlerin kullandığı doğrulayıcı bozuk (düşük)

---

## Ayrıntılar: Rust, recheck'te de kaçanlar

### R1 — `audio/render.rs:208:28` `*value *= self.gain` → `/=` · (a) · yüksek

**Kanıt.** Bit-perfect dalında (render.rs:205-209) örnek yalnızca duraklatma geçişinin kazancıyla çarpılır.
Kazanç oturum başında 0'dır (render.rs:105) ve 10 ms'de 1'e çıkar (`fade_step = 1/fade_frames`, :106, :235-240).
Mutantta ilk karede `x / 0 = ±∞`, `to_device` (:259-264) bunu ±1,0'a kırpar. Sonraki 9 karede `x/0,1 … x/0,9`
(10×–1,1× yükseltme); |x| > 0,1 olan her örnek tam ölçeğe kırpılır. Duraklatma inişi de aynı. Sınırlayıcı
bit-perfect'te atlandığı için (:123) bunu karşılayan bir şey yok. Sonuç: özel modda her çal/devam/sarma
(yeni oturum) ve duraklatmada ~10 ms tam ölçek, kırpılmış patlama. Mevcut `bit_perfect_ornekleri_aynen_gecirir`
testi açılış geçişini bilerek atlıyor (`let fade = 2 * 10;`, :861-863), bu yüzden yakalamıyor.

**Test önerisi** (`render.rs` testleri; `filled`, `RATE = 1000` (geçiş 10 kare), `Renderer::latency_frames`):

- Girdi: mono, `RenderControls { bit_perfect: true, ..RenderControls::default() }`, kaynak `[0.8; 20]`,
  `out = [0.0; 20 + d]`.
- Beklenen: `out[d + k] == 0.8 * k / 10` (k = 0..10, tolerans 1e-12), sonra 0,8; her yerde `|out| <= 0.8`.
  Ardından `render(.., paused = true)`: çıkış tekdüze azalan, hiçbir örnek 0,8'i aşmaz.
- Doğru cevabın kaynağı: el hesabı. Geçiş tanımı doğrusal, adım 1/10 (render.rs:52, :100, :235-240). Ayrıca
  değişmez bir kural var: geçiş kazancı [0, 1] aralığındadır, sesi yalnızca kısar. Bit-perfect olmayan
  `baslangicta_sesi_yumusakca_acar` testinin aynısı.

### R2 — `audio/normalize.rs:437:68` `(next_protect - protect) / n` → `* n` · (a) · yüksek

**Kanıt.** Boşluksuz geçişte sonraki şarkı daha kısık çalacaksa kazanç sınırdan 10 ms (480 kare) önce doğrusal
iner (normalize.rs:427-439). Mutantta koruma her karede `(hedef − koruma)·n` kadar değişir, n = 480…1. Mevcut
testler hep `boost = 0.0` ile koşar; o zaman iki şarkının koruması da 1'dir, fark 0 olduğundan mutant görünmez.
`crossfeed_normalize.py` şu durumu hesaplar: şarkı 1 `quiet()` (+6 dB eşitleme, 5 dB boşluk), şarkı 2 −14 LUFS /
−1 dBTP (0 dB, boşluk 0), ekolayzer +6 dB. Koruma −1 dB'den −6 dB'ye iner.

- Aslı: kazanç 1,775 → 0,5012 (= 10^(−6/20)), sonlu ve tekdüze.
- Mutant: ilk üç karenin kazancı −371, 177 827, −8,5·10⁷; 117. karede sonsuz/NaN.

`approach(NaN, …)` NaN döndürür (:468-475) ve korumayı sıfırlayan bir yol yok (`fresh` yalnızca ilk turda).
Sinyal NaN olunca `to_device` bunu 0 yapar. Yani 10 ms sınırlayıcıya çarpan gürültü, ardından yeni oturuma kadar
(sarma, yeni şarkı) **tam sessizlik**. Koşul gerçek kullanımda sık: ekolayzer ya da bas yükseltmesi boşluktan
büyük, art arda iki şarkının boşluğu farklı, ikincisi daha kısık.

**Test önerisi** (`normalize.rs` testleri; `render_blocks`, `TrackLevels`, `Loudness`, `quiet()`, `to_db`):

- Girdi: şarkı 0 `quiet()`; `levels.begin_track(RATE)`; şarkı 1
  `Loudness { integrated_lufs: -14.0, true_peak_dbtp: -1.0 }`; `render_blocks(.., 2 * RATE, true, 6.0)`.
- Beklenen: sınırdan 10 ms öncesine kadar her kazanç +5 dB; sınırda ve sonrasında −6 dB (±1e-9); her kazanç sonlu
  ve [10^(−6/20), 10^(5/20)] aralığında; inişte tekdüze azalan.
- Doğru cevabın kaynağı: el hesabı, programın tanımlarından:
  - Eşitleme kazancı = hedef − LUFS (loudness.rs:50-56): +6 ve 0 dB.
  - Boşluk = −1 − (tepe + kazanç) (normalize.rs:244): 5 ve 0 dB.
  - Koruma = −max(0, yükseltme − boşluk) (:332-335): −1 ve −6 dB.
  - Toplamlar: +5 ve −6 dB. Doğrusal iki rampanın çarpımı iki uç arasında kalır.

### R3 — `analysis/beats.rs:270:27` `2.0 / 3.0` → `2.0 % 3.0` (= 2,0) · (a) · düşük

**Kanıt.** Oktava katlanan parça periyodu [global/1,5, global·1,5] aralığındadır (:260-265). Bu yüzden 2,0 oranı
hiçbir zaman eşleşmez; asıl kayıp 2/3 oranının listeden düşmesidir. Oran [0,6667, 0,6867] aralığında kalan
(2/3 ± %3) bir parça artık "basit oranlı" sayılmaz ve gerçek tempo değişimi gibi işlenir. Mevcut
`yarim_tempo_kalibindaki_ara...` testi yalnızca 1,5 oranını (80 BPM davul, 120 BPM nabız) sınıyor.

**Test önerisi** (`beats.rs` testleri; `segment_periods` aynı modülde, doğrudan çağrılır). `beats_port.py` ile
sınandı:

- Girdi: `fps = 100`, 6000 kare (20 sn'lik 3 parça). Her yerde 66 karede bir 0,8'lik dürtü; orta parçada
  (2000–4000) ayrıca 45 karede bir 1,0'lık dürtü. `segment_periods(&strength, 100.0, 66.0)`.
- Beklenen: `None` (tempo değişmiyor). Python: aslı `None` (orta parça kestirimi 45,0, oran 0,6818; nabız
  belirginliği 0,273 ≥ 0,2); mutant `Some` (orta parça 45 kalır, 66/45 = 1,47 > 1,08).
- Doğru cevabın kaynağı: metamorfik ilişki. 3/2 ile 2/3 birbirinin tersi olan basit oranlardır; kodun belgesi
  (:266-268) ikisini aynı kabul eder; mevcut test 3/2 yönünü doğruluyor, bu test 2/3 yönünü.

### R4 — `analysis/beats.rs:349:34` `i + radius + 1` → `i + radius * 1` · (b)

**Kanıt.** Yerel ortalama penceresi [i−r, i+r] yerine [i−r, i+r) olur: 31 yerine 30 kare, yarım kare kayık.
Ortalamadaki fark = (m − x_{i+r})/(2r); en çok max/30 kadar. `beats_port.py` normalize → smooth → dinamik
programlama → kare altı tepe zincirini çevirir. 6 tempo (84–174 BPM) × 4 kesirli konum, gürültülü sentetik
başlangıç gücünde **vuruş zamanlarındaki en büyük fark 0,105 ms**, vuruş sayıları aynı. Bu, kare süresinin
(16,7 ms) %0,6'sı, senkron hedefinin (±20 ms) %0,5'i. Sınır: tempo kestirimi betikte sabit tutuldu; öz-ilintiye
etkisi ayrıca ölçülmedi (aynı büyüklükte bir değişim beklenir).

### R5 — `analysis/beats.rs:542:27` `values[index - 1]` → `values[index + 1]` · (a) · düşük (sese etkisi yok; görsel senkron)

**Kanıt.** `parabola(v[i+1], v[i], v[i+1])`: pay `0.5·(sol − sağ) = 0` olduğundan kayma her zaman 0'dır. Kare altı
düzeltme tamamen kalkar ve vuruş zamanları 60 fps ızgarasına yuvarlanır. `beats_port.py` sonuçları, 18 durumda:

- Aslı: ortalama hata 0,07–0,40 ms, en çok 0,90 ms.
- Mutant: ortalama 4,0–8,3 ms, en çok 8,4 ms.

Senkron hedefinin (±20 ms) yaklaşık yarısı harcanır. `track_period` (aksak ölçü) de bu işlevi kullanır.

**Test önerisi** (`beats.rs` testleri):

- `peak_offset(&[0.0, 1.0, 0.5], 1) == 1.0 / 6.0` ve aynalısı `peak_offset(&[0.5, 1.0, 0.0], 1) == -1.0 / 6.0`
  (tolerans 1e-12).
- Uçtan uca isterseniz: mevcut `impulses(bpm, offset, seconds)` ile tepeleri kare arasına (ör. +0,4 kare)
  düşen dürtüler. Bulunan vuruşların gerçeğe uzaklığının ortalaması < 2 ms olmalı (mutant ≈ 6,7 ms).
- Doğru cevabın kaynağı: el hesabı. (−1, 0), (0, 1), (1, 0,5) noktalarından geçen parabol
  y = −0,75x² + 0,25x + 1; tepesi x = 0,25/1,5 = 1/6.

### R6 — `analysis/key.rs:261:53` `weight * confidence` → `weight + confidence` · (a) · düşük

**Kanıt.** Bir tonun ilk oyunda güven toplamına w·c yerine w + c eklenir (w = sesli saniye, ~15). Son güven
toplam/w_toplam olduğundan (:270) yaklaşık w/total kadar şişer. Kullanım: `is_confident` eşiği (0,35;
`key_map`, cache.rs:281), işaretleme panelindeki gösterim ve harita dosyasına yazılan değer. Yani gösterilmemesi
gereken ton gösterilebilir. `key_vote.py`: aşağıdaki satır 30 sn tekrarlanınca pencere güveni 0,4539; şarkı
güveni aslında 0,4539, mutantta 0,7421.

**Test önerisi** (`key.rs` testleri; `song_key`, `estimate`, `sum_chroma`):

- Girdi: `row = [255, 105, 152, 106, 198, 175, 113, 185, 121, 217, 108, 139]` (Do majör + La minör profillerinin
  toplamı, 0..255'e ölçekli), `chroma = vec![row; 30]` (iki oy penceresi).
- Beklenen: `song_key(&chroma).unwrap().confidence` ile `estimate(&sum_chroma(&chroma[..15])).unwrap().confidence`
  arasındaki fark < 1e-6 (≈ 0,4539). Ton (0, majör).
- Doğru cevabın kaynağı: metamorfik ilişki. Aynı pencere tekrarlanınca oy payı 1'dir; güven, tanım gereği
  pencerenin güvenine eşittir (key.rs:234-236: "pencerelerinin ortalama güveni × oy payı").

### R7 — `analysis/key.rs:428:32` `b <= a` → `b > a` · (a) · düşük

**Kanıt.** Mutantın atlama koşulu `b <= floor || b > a || b < c` olur. Gerçek tepeler (b > a) atlanır; yalnızca
tepenin sağındaki iniş yamacının kutuları (a ≥ b ≥ c, yan loblar dahil) alınır. Parabol orada −0,5'e kırpıldığı
için frekans yarım ile bir buçuk kutu yukarı kayar. `key_port.py` (ChromaAnalyzer çevirisi; 22 050 Hz, 8192
noktalı FFT) saf sinüslerde akort kaymasını şöyle buluyor:

| Sinüs     | Gerçek kayma | Aslı        | Mutant      |
| --------- | ------------ | ----------- | ----------- |
| 220 Hz    | 0 sent       | −0,34 sent  | +17,87 sent |
| 440 Hz    | 0 sent       | +0,05 sent  | +5,11 sent  |
| 447,69 Hz | +30 sent     | +30,16 sent | +36,78 sent |
| 1 kHz     | +21,31 sent  | +21,30 sent | +27,65 sent |

Mevcut `akort_kaymasi_bulunur...` testi 5 sent tolerans tanıyor; akorlu sinyalde bu sapma içinde kalıyor.

**Test önerisi** (`key.rs` testleri; `analyze` yardımcısı, `RATE = 22_050`):

- Girdi: 3 sn, 0,5 genlikli, 440 Hz saf sinüs.
- Beklenen: `analysis.tuning.abs() < 0.01` yarım ton (1 sent). Python: aslı 0,05 sent, mutant 5,1 sent.
  İsterseniz 220 Hz ile aynısı (mutant 17,9 sent).
- Doğru cevabın kaynağı: standart, ISO 16 (La4 = 440 Hz). 440 Hz'in akort kayması tanım gereği 0'dır.

### R8 — `analysis/structure.rs:184:26` `beats.len() < 8` → `== 8` · (a) · düşük

**Kanıt.** Mutantta tam 8 vuruşta `None` döner; 4–7 vuruşta (track() en az 4 vuruş verir) harita çıkarılır.
Okudum, 0–7 vuruşta panik yolu görünmüyor: `bar_time` yalnızca sınır ya da drop varken çağrılıyor, ikisi de olmuyor.
Kısa (4–5 sn) ve yavaş kayıtlarda şarkı haritasının var/yok durumu tersine döner.

**Test önerisi** (`structure.rs` testleri):

- Girdi: `BeatGrid { bpm: 120.0, beats: (0..8).map(|i| 0.5 * i as f64).collect(), variable_tempo: false }`,
  `fps = 60`, 270 kare, `bands_per_frame = 32` (≥ `BASS_BANDS`), sabit bant 100 ve −20 dB.
- Beklenen: `map_song(..)` 8 vuruşta `Some`, 7 vuruşta `None`.
- Doğru cevabın kaynağı: sınır değer testi, kodun "en az 8 vuruş" (iki 4/4 ölçü) sözleşmesi. Bu sınır bir sabite
  (`MIN_BEATS`) ve belgeye yazılırsa test sözleşmeye bağlanır.

### R9 — `analysis/structure.rs:484:26` `(start + window)` → `(start * window)` · (a) · düşük

**Kanıt.** İlk pencere boş kalır (son = 0); ortalama 0, eşitlikte son faz kazanır. Sonraki pencereler `start`'tan
şarkının sonuna kadar uzar. Ölçü güveni (`meter_confidence`) değişir: kayan ölçü başında şişer, tutarlı şarkıda
bir pencere kadar düşer. `structure_port.py` ile doğrulandı.

**Test önerisi** (`structure.rs` testleri; `phase_agreement` doğrudan):

- Girdi: 128 vuruş, `score[i] = 1.0` (i < 64, i % 4 == 0) ve `2.0` (i ≥ 64, i % 4 == 2), geri kalanı 0;
  `phase_agreement(&score, 4, 0)`.
- Beklenen: 3/7 (± 1e-12). Python: aslı 0,428571; mutant 0,0. `phase = 2` için aslı 4/7, mutant 6/7.
- Doğru cevabın kaynağı: el hesabı. Pencere 32 vuruş, adım 16: [0,32) [16,48) [32,64) [48,80) [64,96) [80,112)
  [96,128). Faz 0 ilk üçünde kazanır; [48,80)'de faz 2'nin ortalaması 1,0, faz 0'ınki 0,5.

### R10 — `audio/crossfeed.rs:342:9` `!self.stereo || …` → `self.stereo || …` · (a) · düşük

**Kanıt.** `CrossfeedProcessor::is_bypass`'ı üretimde çağıran yok (grep: yalnızca crossfeed.rs:423 ve :602,
ikisi de test). Ses davranışı değişmez. Ama iki test bu işlevi doğrulayıcı olarak kullanıyor: mutantta stereo
işlemci her zaman `true` döner, `ayar_degisirken_ani_sicrama_olmaz` testindeki
`assert!(p.is_bypass(), "kapatınca geçiş bitti")` da boşa düşer.

**Test önerisi** (`crossfeed.rs` testleri; `processor`, `on`):

- `assert!(!processor(on(700.0, 6.0), 48_000).is_bypass())`.
- Mono işlemcide `is_bypass()` `true`.
- Doğru cevabın kaynağı: tanım. Açık süzgeç yan sinyali değiştirir: `[0.5, -0.5]` karesi işlendikten sonra
  girdiden farklıdır (metamorfik: aynı kareyle doğrulanabilir).
- Alternatif: işlev `#[cfg(test)]` yapılır.

### R11 — `audio/limiter.rs:245:32` `4.0 * PI * n` → `4.0 * PI / n` · (a) · düşük

**Kanıt.** n = 0'da `4π/0 = ∞`, `cos(∞) = NaN`; yalnızca 0. faz NaN olur. `f64::max` NaN'ı yok saydığı için o faz
sessizce devre dışı kalır. n ≥ 1'de üçüncü terim ≈ +0,08 sabittir, yani pencere Blackman yerine yaklaşık Hann'dır.
`interp.py` (interpolator + true_peak çevirisi, ısınma atlanarak, 24 başlangıç fazında en kötüsü) kaçırmayı
ölçüyor:

| Hız / frekans       | Aslı         | Mutant       |
| ------------------- | ------------ | ------------ |
| 44,1 kHz, 11 025 Hz | 0,040 dB     | 0,031 dB     |
| 44,1 kHz, 13 230 Hz | 0,008 dB     | 0,039 dB     |
| 44,1 kHz, 17 640 Hz | 0,155 dB     | 0,113 dB     |
| 96 kHz, 24 kHz      | 0,167 dB     | 0,301 dB     |
| 96 kHz, 28,8 kHz    | 0,027 dB     | 0,104 dB     |
| **192 kHz, 24 kHz** | **0,018 dB** | **0,301 dB** |
| 192 kHz, 48 kHz     | 0,686 dB     | 1,249 dB     |

44,1/48 kHz'te duyulur bantta fark ≤ 0,03 dB ve yön karışık. Yüksek hızlarda mutant gerçek tepeyi 0,3 dB'ye kadar
düşük okur; −1 dBTP tavanı −0,7 dBTP'ye kayar. 0 dBFS'e hâlâ 0,7 dB pay var: duyulur bozulma beklenmez, ama
belgelenen 0,1 dB toleransı aşılır.

**Test önerisi** (`limiter.rs` testleri; `run`, `true_peak_8x`, `dbtp`):

- Girdi: 192 kHz, 24 kHz (fs/8) sinüs, genlik 1,4 (+2,9 dBTP), 16 başlangıç fazı, her biri 1 sn.
- Beklenen: çıkışın gerçek tepesi (ilk ¼ sn atlanarak) ≤ −1 + 0,1 dBTP. Aslının en kötü kaçırması 0,018 dB (geçer),
  mutantın 0,301 dB (−0,70 dBTP, düşer).
- Doğru cevabın kaynağı: standart tanım. Sinüsün gerçek tepesi genliğidir (ITU-R BS.1770-4 Ek 2); bağımsız
  başvuru olarak testteki 8× / 64 katsayılı `true_peak_8x`. Mevcut `ornekler_arasi_tepe_tavani_asmaz` testinin
  yüksek hızdaki eşi. 44,1/48 kHz'te bu mutantı öldüren bir sinüs yok.

### R12 — `audio/loudness.rs:192:57` `head + TAPS - 1 - t` → `head + TAPS / 1 - t` · (b)

**Kanıt.** Dizin bir örnek kayar: t ≥ 1 katsayıları bir örnek sonrasına (yalnızca zaman kayması, tepe aynı),
t = 0 katsayısı pencerenin en eski örneğine gider. Hata ≤ 2·|c_p[0]|·tepe. Blackman penceresi kenarda ~0
olduğundan |c_p[0]| en çok 3,63·10⁻⁴ (48 kHz), 2,96·10⁻⁴ (96 kHz), 8·10⁻¹⁹ (192 kHz). `interp.py` ölçümü:

| Hız     | Sinyaller                             | En büyük fark |
| ------- | ------------------------------------- | ------------- |
| 48 kHz  | 997 Hz, 5 kHz, fs/4, 0,45·fs × 24 faz | 0,0004 dB     |
| 96 kHz  | aynı                                  | 0,00006 dB    |
| 192 kHz | aynı                                  | 0             |

fs/4 45° sinyalinde (EBU Tech 3341 gerçek tepe sinyali gibi) iki sürüm de −6,1933 dBTP okuyor. Tech 3341'in
gerçek tepe toleransı +0,2 / −0,4 dB, yani fark bundan ~500 kat küçük.

### R13 — `audio/loudness.rs:287:25` `to_lufs(z) > ABSOLUTE_GATE_LUFS` → `==` · (a) · düşük

**Kanıt.** 400 ms'den kısa seste (hiç blok yok, :281-287) ölçüm yalnızca tam −70 LUFS'te bir değer verir; başka
her durumda `None` döner. `None` "sessiz" sayılır (normalize.rs:249: kazanç 0, boşluk 0), yani kısa dosyalar
eşitlenmeden kendi düzeyinde çalar.

**Test önerisi** (`loudness.rs` testleri; `measure(RATE, channels, freq, &[(sn, dBFS)])`):

- Girdi: `measure(RATE, 2, 1000.0, &[(0.3, -23.0)])`.
- Beklenen: `|L + 23,0| < 0,1` LUFS. Python (`loudness_short.py`, K-ağırlık çevirisi): −22,994 LUFS. Mutantta
  `measure` içindeki `expect("ses var")` düşer.
- Doğru cevabın kaynağı: standart, EBU Tech 3341 Tablo 1 durum 1 (1 kHz, kanal başına −23 dBFS → −23,0 ±0,1 LUFS).
  Kısaltılmış sürenin süzgeç geçişi etkisi 0,006 LU.

### R14–R18 — `audio/player/controls.rs` (parametrik A/B karşılaştırması) · (a)

**Kanıt.** `parametric_comparing()` iki yere gider: `apply_parametric_compare` → `PeqControl::set_compare`
(peq.rs:1019) ve görsellerdeki eğri (visuals.rs:196). Karşılaştırma açıkken `design` filtreleri atlar, yalnızca
telafi kazancı uygular (peq.rs:1041-1047). Mutantlar:

- **R14** `→ true` (yüksek): EQ açılınca her zaman karşılaştırma kipinde olur. Kullanıcının parametrik EQ'su
  hiç duyulmaz, ama arayüz açık gösterir.
- **R16** `&& → ||` (yüksek): `compare || is_active()`, yani EQ etkinken her zaman atlanır. R14 ile aynı sonuç.
- **R15** `→ false` (orta): A/B hiç açılmaz. EQ duyulur, ama karşılaştırma düğmesi işlemez.
- **R17** `set_parametric_compare → ()` (orta): bayrak hiç değişmez, düğme hiçbir şey yapmaz.
- **R18** `apply_parametric_compare → ()` (orta): bayrak değişir, arayüz "karşılaştırma açık" der, ses yolu
  değişmez. Aynı zamanda `set_parametric` sonrasında telafi kazancı da güncellenmez.

Mevcut testler `PeqControl::set_compare`'i doğrudan sınıyor (peq.rs:1919, :2053); oynatıcı katmanını sınayan
test yok.

**Test önerisi** (`audio/player/tests.rs`; `Player::new()`, `player.parametric_control` (modül içinden
erişilir), `PeqProcessor::new`, `crate::audio::test_util::sine`). Beşini birden öldürür:

1. Ayar: `ParametricSettings { enabled: true, bands: vec![ParametricBand { kind: FilterKind::Peaking,
freq_hz: 1000.0, gain_db: 6.0, q: 1.0, enabled: true }], design: DesignMethod::Rbj }`,
   `player.set_parametric(...)`.
2. `assert!(!player.parametric_comparing())`: R14 ve R16 düşer.
3. `player.set_parametric_compare(true); assert!(player.parametric_comparing())`: R15 ve R17 düşer.
4. Ses yolu: `PeqProcessor::new(Arc::clone(&player.parametric_control), 1, 48_000)` ile 1 kHz ve 100 Hz
   sinüslerin RMS kazancı ölçülür.
   - Karşılaştırma açıkken iki kazanç eşit olmalı (fark < 0,01 dB).
   - Kapalıyken (`set_parametric_compare(false)` + yeni işlemci) 1 kHz − 100 Hz farkı 6 dB'ye yakın olmalı
     (RBJ'de merkez kazancı tam 6,00 dB; 100 Hz'te ~0,05 dB).

   R18 burada düşer: mutantta karşılaştırma açıkken de süzgeç uygulanır ve fark ~6 dB kalır.

5. `enabled: false` ile `set_parametric`: `!parametric_comparing()` (etkisiz EQ'da karşılaştırma yok).

Doğru cevabın kaynağı: RBJ "Audio EQ Cookbook" (tepe süzgecinin f0'daki kazancı = gain_db) ve metamorfik ilişki
(süzgeçsiz yol frekanstan bağımsızdır).

## Ayrıntılar: Rust, recheck'e alınmayanlar (bütün takımla durumu bilinmiyor)

### N1 — `beats.rs:392:16` `clarity < MIN_RHYTHM_STRENGTH` → `<=` · (b)

Fark yalnızca `acf[sharp]/energy` tam 0,08'e (f64 olarak bayt bayt) eşitken çıkar. Öz-ilinti oranı sürekli bir
büyüklük. Eşikte iki karar da keyfidir; ölçülebilir davranış farkı yok.

### N2 — `key.rs:308:31` `1e-9·ma²·n` → `1e-9·ma²/n` · (b)

Düzlük eşiği n² = 144 kat küçülür. Fark yalnızca göreli varyansı saa/(n·ma²) ∈ (6,9·10⁻¹², 10⁻⁹] olan, yani
değişim katsayısı 2,6·10⁻⁶ ile 3,2·10⁻⁵ arasında kalan kromalarda çıkar.

- Kroma u8 saniyelerin toplamıdır. Tamsayı adımlarla bu bölgeye düşmek için her perde en az ~9000 birim
  (≥ 35 sn tam ölçek) ve neredeyse tam eşit olmalı.
- Davul/gürültü kromasında saniye başına ±5–25 birimlik oynama olur: 300 sn'de bile değişim katsayısı ~10⁻³,
  bölgenin 30 kat üstünde.

Pratikte erişilemez. Sentetik bir girdiyle (ör. `[1e4; 12]`, bir perde 1e4 + 0,5) ayrışır ama orada da "doğru"
cevap sözleşmede tanımlı değil.

### N3 — `key.rs:410:19` `rms_db < SILENCE_DB` → `<=` · (b)

Fark yalnızca RMS tam −55,000… dB'ye eşitken çıkar (sürekli büyüklük); eşikte karar keyfi.

### N4 — `structure.rs:544:24` `novelty[k] > threshold` → `>=` · (a) · düşük

**Kanıt.** Bütün ölçü özellikleri aynıysa z-puanları 0, uzaklıklar 0, yenilik her yerde 0 ve eşik
0 + 0,5·0 = 0 olur. Mutantta her k için `0 >= 0` doğrudur, komşuluk koşulu da sağlanır: her ölçü bölüm sınırı
sayılır. `structure_port.py`: 40 düz ölçüde aslı `[]`, mutant `[4, 5, …, 36]`. Tekdüze döngü / test tonu gibi
seste bölüm haritası her ölçüde bölüm değiştirir.

**Test önerisi** (`structure.rs` testleri; `section_boundaries`):

- Girdi: `vec![vec![1.0; 5]; 40]`.
- Beklenen: boş liste.
- Doğru cevabın kaynağı: tanım / metamorfik. Değişmeyen özelliklerde Foote yeniliği sıfırdır, sınır yoktur.

### N5 — `structure.rs:804:33` `gain < DROP_REFINE_MIN_GAIN` → `<=` · (b)

Fark yalnızca kazanç farkı tam 0,08'e eşitken çıkar. Değerler u8/255 ortalamalarından çıkan rasyoneller;
0,08 rasyonel olarak erişilebilir, ama sonucun 0,08 sabitiyle bayt bayt aynı yuvarlanması gerekir. Eşikte iki karar
da (ölçü başında kalmak ya da bas dönüşüne oturmak) tasarım gereği kabul edilebilir.

### N6 — `audio/biquad.rs:379:41` `(1 - a1 + a2)` → `(1 - a1 - a2)` · (a) · orta

**Kanıt.** Eşlenmiş (Matched) çentikte "Nyquist'te 1" adayı yanlış ölçeklenir. Aday seçimi ızgara hatasına göre
yapıldığından yanlış ölçekli aday bazen DC'ye göre ölçekli adayı yener. `notch_matched.py` taraması (32 508 ayar:
6 hız, 10 Hz–0,49·fs, Q 0,05–50; `matched`, `Grid`, `error` çevirisi):

- Aslının seçimi: dc 30 811, nyquist 1285, rbj 412.
- Mutantta sonucu değişen ayar 851 (4 hızda).
- Mutant ızgara metriğine göre çoğunlukla "daha yakın" seçer. Ama `notch_gain.py`'ye göre aslı hiçbir ayarda
  0 dB'yi aşmazken (+0,0000 dB) mutant aşar:

| Hız      | Mutantın en büyük kazancı | Ayar             |
| -------- | ------------------------- | ---------------- |
| 44,1 kHz | +2,96 dB                  | 18 531 Hz, Q 1,5 |
| 48 kHz   | +1,17 dB                  | 19 621 Hz, Q 1,5 |
| 96 kHz   | +0,08 dB                  | —                |

Örnekler (aslı → mutant):

| Ayar             | 1 kHz kazancı     | DC kazancı   |
| ---------------- | ----------------- | ------------ |
| 18 531 Hz, Q 1,5 | −0,009 → +2,95 dB | 0 → +2,96 dB |
| 12 304 Hz, Q 1   | −0,03 → +0,89 dB  | —            |

Yani bir çentik bütün müziği ~3 dB yükseltir. Duyulur bir düzey sıçraması olur; yükseltme korumaya da bildirilir
ve ses kısılabilir.

**Test önerisi** (`biquad.rs` testleri):

- Girdi: `Biquad::matched(&Spec { kind: Kind::Notch, freq_hz: 18_531.0, gain_db: 0.0, q: 1.5 }, 44_100.0)` ve bir
  tarama (f0 20 Hz–0,45·fs, Q 0,3–30, 44,1/48 kHz).
- Beklenen: her ayarda `response_db(w) <= 1e-6` (w ∈ [0, π], 2000 nokta); 18 531 Hz örneğinde
  `response_db(2π·1000/44100)` ≈ 0 (±0,05).
- Doğru cevabın kaynağı: analog prototip (RBJ cookbook, biquad.rs:128). H(s) = (s²+1)/(s²+s/Q+1); jω'da pay ve
  paydanın gerçek kısmı aynı, paydaya ω/Q sanal kısmı eklenir, dolayısıyla |H| ≤ 1 her frekansta. Ayrıca
  H(0) = H(j∞) = 1.

Yan bulgu: mutantın bazen ızgara metriğinde daha iyi çıkması, ölçeğin (k) iki uca sabitlenmek yerine en küçük
karelerle seçilmesinin eğriyi analog eğriye yaklaştırabileceğini gösteriyor. Ancak |H| ≤ 1 şartı korunmalı.

### N7 — `crossfeed.rs:203:24` `sqrt(zero * pole)` → `sqrt(zero + pole)` · (b)

Ön bükme frekansı ~600 Hz (geometrik orta) yerine ~14 Hz olur; pratikte ön bükmesiz çift doğrusal dönüşüm.
Çift doğrusal dönüşüm DC ve Nyquist değerlerini korur. `crossfeed_normalize.py`: 4 hız (44,1–192 kHz), 4 hazır ayar
ve 3 uç ayar, 20 Hz–20 kHz'te en büyük kulak düzeyi farkı **0,0205 dB**, 2 kHz altında kulaklar arası zaman
farkındaki en büyük değişim **0,31 µs**. Duyma eşikleri ~0,5 dB ve ~10 µs; bunların çok altında.

### N8 — `crossfeed.rs:205:16` `t > 0.0` → `t >= 0.0` · (b)

Fark yalnızca t = 0'da çıkar. t = wm/(2·fs); `sanitized` (crossfeed.rs:100-109, hem `Stage::new` hem
`CrossfeedState::new` çağırıyor) kesimi ≥ 300 Hz ve r0 ≤ 0,999 yapar. Böylece wm ≥ 2π·300·√(1−0,999²) ≈ 84 rad/s

> 0. Erişilemez.

### N9 — `eq.rs:63:37` `MAX_POINTS = 2*BANDS - 1` → `+ 1` · (b)

Yalnızca dizi kapasitesi 19'dan 21'e çıkar. Bütün döngüler `layout.points = 2·bands − 1 ≤ 19` ile sınırlı
(eq.rs:537, :550, :645, :712, :722, :724); fazladan elemanlar hiç okunmaz. Tam eşdeğer.

### N10 — `eq.rs:692:85` `preamp_db.abs() < FLAT_DB` → `<=` · (b)

Bütün süzgeçler birim süzgeçken |preamp| tam 1e-3 olamaz. İki yol var:

- Düz yol (:640-641): preamp = −max(0, en büyük sürgü) ve bütün |sürgü| < 1e-3 olduğundan |preamp| < 1e-3 kesin.
- Diğer yol (:670): preamp = −tepe; tepe birim süzgeçlerin boş çarpımı = 1, yani 0 dB.

Erişilemez, eşdeğer.

## Ayrıntılar: arayüz (Stryker, elle örneklem)

- **T1** `crossfeed.ts:21` — (c). `CROSSFEED_HINTS` düğmenin ipucu metni.
- **T2** `crossfeed.ts:111` seviye koşulu → `true` — (a), düşük. Eşleşme yalnızca kesim frekansıyla yapılır:
  700 Hz / 4,5 dB "Güçlü" iken ilk 700 Hz'lik "Orta" seçili görünür.
  - Test (`crossfeed.test.ts`, `on` yardımcısı): `matchCrossfeedPreset(on(700, 4.5), CROSSFEED_PRESETS)`
    → `"Güçlü"`; `on(700, 5)` → `null`.
  - Kaynak: hazır ayar tablosu (crossfeed.rs `PRESETS`).
- **T3** `crossfeed.ts:118` `formatDelayUs` → `""` — (c). Ekran metni (testsiz: NoCoverage).
- **T4** `lyrics.ts:4` `LYRICS_SOURCE_TEXT` → `{}` — (c). Ekran metni.
- **T5** `lyrics.ts:93` `?? "{}"` → `?? ""` — (b). `JSON.parse("")` SyntaxError fırlatır, `catch` `{}` döner;
  `JSON.parse("{}")` da `{}` (nesne, dizi değil) verir. Sonuç aynı.
- **T6** `lyrics.ts:207` `lines[index + 2]` → `lines[index - 2]` — (a), düşük. Sıradaki satır erken belirdiğinde
  önizleme olarak sonraki değil iki önceki satır (ya da hiç) gösterilir.
  - Test (`lyrics.test.ts`, `line` yardımcısı):
    `lines: [line(10,12,"bir iki"), line(12,14,"üç dört"), line(30,32,"beş"), line(32,34,"altı")]`;
    `lyricFrame(l, 30 - LYRIC_LEAD/2)`.
  - Beklenen: `.line.text === "beş"` ve `.next.text === "altı"` (mutantta `null`).
  - Kaynak: tanım (sıradaki satır = gösterilenden sonraki). Mevcut 3 satırlık örnekle ayrışmıyor, dördüncü satır
    gerekli.
- **T7** `lyrics.ts:278` `if (!found)` → `if (true)` — (b), koşullu. Sıralı kelime zamanlarında durumlar
  `sung* current? upcoming*` biçimindedir. `found` olduktan sonra yalnızca `upcoming` gelir ve o dal `before`'a
  dokunmaz: eşdeğer.
  - Ayrıştığı tek durum: dosyada sırasız `<mm:ss>` kelime etiketleri. `word_stamps` (lyrics.rs:405-440)
    sıralamıyor; `timed_words` yalnızca `end ≥ start` yapıyor.
  - O girdide "doğru" kaydırmayı sözleşme tanımlamıyor; test önerilmez. İsterseniz çekirdek kelimeleri sıralasın.
- **T8** `parametric.ts:19` `"Yüksek geçiren"` → `""` — (c). Ekran metni.
- **T9** `parametric.ts:113` `formatQ` basamak sayısı — (c). "0,707" yerine "0,71" yazar; ekran metni, ayarın
  kendisi değişmez (NoCoverage).
- **T10** `parametric.ts:153` `>= 0.005` → `> 0.005` — (b).
  - Arayüz kazancı 0,1 dB adımlarla yuvarlar (`roundGain`, :78-80), tam ±0,005 erişilemez.
  - Erişilse de fark 0,005 dB'lik bir süzgecin "etkisiz" görünmesidir: ölçülemeyecek kadar küçük.
- **T11** `parametric.ts:167` `a[0] * b[1]` → `a[0] / b[1]` — (b). `mul` yalnızca `s2 = mul(s, s)`'de kullanılır
  (s = [0, x]): 0·x = 0/x = 0, yeter ki x ≠ 0.
  - x = hz/freqHz; eğri frekansları ≥ 20 Hz (`PEQ_MIN_HZ`, :222-225), diğer çağrıda x = 1. x hiçbir zaman 0
    değil.
- **T12** `parametric.ts:211` çentik paydası `s/q` → `s·q` — (a), düşük. Tarayıcı önizlemesindeki çentik eğrisi
  Q ≠ 1'de yanlış çizilir; sese etkisi yok, programda eğriyi çekirdek hesaplar.
  - Test (`parametric.test.ts`, `band` yardımcısı):
    `analogDb(band({ kind: "notch", q: 2 }), 2000)` ≈ `10·log10(9/10)` = −0,4576 dB (mutant −4,437 dB).
  - Kaynak: RBJ analog prototipi |H(jx)|² = (1−x²)² / ((1−x²)² + (x/Q)²), x = 2. Rust `Spec::analog` ile aynı
    formül, `coreMirrors.test.ts`'e de eklenebilir.
- **T13** `queue.ts:36` `{ paths: [path], index: 0 }` → `{}` — (a), düşük (NoCoverage). `playList(paths, start)`
  listede olmayan bir `start` ile çağrılırsa sıra boş nesne olur ve `currentPath` çöker.
  - Test (`queue.test.ts`): `queueFrom(["a.flac", "b.flac"], "c.flac")` → `{ paths: ["c.flac"], index: 0 }`.
  - Kaynak: tanım (listede yoksa yalnızca o şarkı çalar).
- **T14** `queue.ts:137` mulberry32 adımı — (b). `seededRandom`'u üretimde çağıran yok (grep: yalnızca testler).
  Mutant da deterministik bir dizi üretir; testler belirli değerlere bağlı değil.
- **T15** `sync.ts:43` `clicks.length === 0` → `false` — (b). Tıklama yoksa `best = +∞` kalır,
  `|d| ≤ 0,28` süzgeci hepsini atar, `offsets.length = 0 < 8` olur ve sonuç yine `null`.
- **T16** `sync.ts:53` `< MIN_TAPS` → `<= MIN_TAPS` — (a), düşük. Tam 8 kullanılabilir basışla ölçüm reddedilir.
  - Test (`sync.test.ts`, `clicks`): `taps = clicks.slice(3, 11).map(c => c + 0.03)`.
  - Beklenen: `estimateAudioDelay(taps, clicks)` → `delayMs 30, used 8`.
  - Kaynak: tanım (`MIN_TAPS`: "en az" 8).
- **T17** `sync.ts:60` `spreadMs <= 40` → `< 40` — (a), düşük. `spreadMs` tamsayıya yuvarlandığı için tam 40
  erişilebilir.
  - Test: sapmalar `[-0.04, -0.04, -0.04, 0, 0, 0.04, 0.04, 0.04]` (her biri ayrı bir tıklamaya).
  - Beklenen: `spreadMs 40, reliable true`.
  - Kaynak: el hesabı. Ortanca 0; mutlak sapmalar sıralı `[0, 0, 0.04 × 6]`, çift sayıda olduğundan ortanca
    (4. + 5.)/2 = 0,04 s = 40 ms; sınır "en çok 40".

## Betikler (`S\triage-araclari\`, hepsi `python -I` ile)

| Betik                                                 | Ne ölçer                                                     | Çıktı                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `interp.py`                                           | R11, R12: limiter ve gerçek tepe ölçerin ara değerleyicileri | ekrana                                                  |
| `crossfeed_normalize.py`                              | N7: crossfeed ön bükmesi; R2: iniş rampasında koruma         | ekrana                                                  |
| `notch_matched.py`, `notch_stats.py`, `notch_gain.py` | N6: eşlenmiş çentik                                          | `notch_impact.txt`, `notch_stats.txt`, `notch_gain.txt` |
| `beats_port.py`                                       | R3, R4, R5                                                   | `beats_port.txt`                                        |
| `key_port.py`, `key_vote.py`                          | R6, R7                                                       | `key_port.txt`, `key_vote.txt`                          |
| `structure_port.py`                                   | R9, N4                                                       | `structure_port.txt`                                    |
| `loudness_short.py`                                   | R13: 0,3 sn Tech 3341 durum 1                                | ekrana                                                  |

## Tam taramanın ayıklaması, 2. bölüm (7 Kasım 2026): biquad.rs, bass.rs, structure.rs

Tam taramanın (`claude/mutasyon-*`, 1 656 kaçan) üç dosyası. Taramanın commit'i ile bugünkü `main`'de bu dosyaların kod
bölgesi (test modülünden önceki satırlar) aynı: satır numaraları geçerli. Taramadan sonra eklenen testler bazı kaçanları
zaten yakalıyor (ör. bant geçirenin Q'su, `analog_prototip_kapali_bicimle_ayni`); kesin durum küçük kopya projede
yeniden sınamayla ([`betikler/ayiklama/kopya_mutasyon.py`](betikler/ayiklama/kopya_mutasyon.py)) yazılır.

### biquad.rs (165 kaçan)

- **(b) eşdeğer, analog eğride sanal terimin işareti** (116:37, 116:64, 119:25, 119:53, 123:29, 123:55, 125:42,
  126:45, 127:45, 128:48, 129:37, 129:58): `s` jω olduğu için `±s·k` terimi yalnızca sanal kısmın işaretini çevirir;
  `analog`'un yalnızca genliği (`norm_sqr`) kullanılır.
- **(b) `response` eşleniği** (526:43): `Biquad::response`'un yalnızca genliği kullanılır (yalnızca testte).
- **(b) sınır eşitlikleri** (141:52, 182:69 `< 1e-6`, 570:17, 599:13 ζ = 1'de iki kol aynı, 670:20 `>=` (|z| = 1'in
  yansıması kendisi), 780:56, 930:24).
- **(b) aday aramasının yedekliliği** (`matched` 358–449, `beyond_nyquist` 473–504, `Power::at`, `factor`,
  `Grid::fit`, `error_weight`, GRID sabitleri): eşlenmiş tasarım birkaç adayı dener, en iyisini seçer; bir adayın
  hesabı bozulunca başka aday aynı sapma sınırında kalıyor. Kullanıcıya etkisi testlerin sınırladığı sapma (≤ RBJ,
  `tipik_ayarlarda_eslenmis_tasarimin_sapmasi_kucuk`, `dogruluk_tablosu`); aday aday sınamak tasarımı kırılgan test
  eder. Bilinçli olarak bırakıldı.
- **(a) gerçek açık, testi yazıldı:**
  - 273:32, 284:32, 298:32 `sin / (2·Q)` → `sin / (2 + Q)`: katsayı testi yalnızca Q = 2'deydi ve orada ikisi aynı.
    `rbj_q_nun_her_degerinde_cookbook_ile_ayni` (Q 0,7 ve 5).
  - 258:47, 270:47, 279:35, 293:35, 343:58 Nyquist sınırı (`sample_rate * 0,49`): üstündeki frekans hiç
    sınanmıyordu. `nyquist_otesindeki_frekans_sinira_cekilir_ya_da_etkisiz`.
  - 560 `is_stable` (`true`, `<=`, `||`): yalnızca kararlı tasarımlarda çağrılıyordu. `kararlilik_ucgeni_el_hesabiyla`.
  - 565–576 `max_zero_radius`: `pay_sifirlarinin_yaricapi_el_hesabiyla`.
  - 663–672 `min_phase`: `en_kucuk_faz_disaridaki_sifiri_yansitir_genlik_ayni`.
  - 929 `flush` → `()`: `denormal_degerler_sifirlanir`.

### bass.rs (85 kaçan)

- **(a) ayar çalarken değişince** (584 `step` → `()`, 585–586, 600–605 `ramp`, 642 `update_left`, 643–653
  karışım/derinlik/vuruş rampası, 530–532): tek test "tık yok" diyordu; ayar hiç uygulanmasa da geçiyordu.
  `calarken_degisen_ayar_bastan_kurulanla_ayni_sese_ulasir` (dört ayar, 30–180 Hz, 0,05 dB) ve
  `karisim_derinlik_ve_vurus_rampayla_degisir` (örnek başına adım, iç alanlar).
- **(a) harmonik polinomları** (620–623): `chebyshev` ayrı fonksiyona alındı, `chebyshev_polinomlari_harmonik_uretir`
  (Tₙ(cos θ) = cos nθ).
- **(a) bas tepesi ölçümü oranları** (225 kanal ortalaması, 236 bant/ham oranı): testler tek kanallı ve tam ölçekliydi;
  `bas_tepesi_olcumu_seviyeden_ve_kanal_sayisindan_bagimsiz` (metamorfik: seviye ve kanal sayısı).
- **(b)** 219 `mono += x` → `-=` (işaret, genliğe girmez), 234 sınır.
- Kalan (Octaver 362–402, `begin_block` 558, `process_frame` 658–685): yeniden sınamadan sonra sınıflanacak (#225 alt
  oktavın bir kısmını yakaladı).

### structure.rs (166 kaçan)

- **(a) küçük yardımcılar, el hesabıyla:** `bar_beat` 159 (4/4'te faz 2 ile `−`/`+` aynı sonucu veriyor: 3/4 faz 1
  ayırır), `energy_at` 150, `section_at` 166, `gauss` 854, `std_dev` 866–867, `zscores` 873, `percentile_range` 882,
  `average` 601: `olcudeki_yer_enerji_ve_bolum_el_hesabiyla`, `sayisal_yardimcilar_el_hesabiyla`.
- Kalan (`map_song` 59, bölüm sınırları, drop bulma ve güveni): sezgisel hesaplar; birim test yerine ölçüm karnesi
  (drop ve bölüm setleri) ile sınanması doğru. Ayrı iş.

### abx.rs (74 kaçan) ve lyrics_text.rs (62 kaçan)

- **abx (a), ses yüksekliği eşitlemesinin yönü** (412–424): test yalnızca "eşitlenince ikisi aynı" diyordu; alçak
  olanı yükselten yanlış kod da aynı sonucu verir. Kural: yüksek olan kısılır, alçak aynen kalır.
  `esitleme_yalnizca_yuksek_olani_kisar` (iki yönde, kaynağın kendisiyle). Taşma sınırı (418–421):
  `esitlemeden_sonra_tasan_tepe_ikisini_birlikte_kisar`. Kalanlar (çalma, halka tampon, `position_secs`) #235 ve
  #240'ın testleriyle yeniden sınanacak.
- **lyrics_text (a):** ayrışık harflerin her kolu (127–141; testler yalnızca İ, ş, ö, ü'yü sınıyordu), görünmez
  boşluklar (152–153), "İ"nin küçültülmesi (208), İngilizce sayı / yıl / sıra (645–689), ondalık ayırıcı ve saat
  (767–783): `ayrisik_harflerin_hepsi_birlesir_gorunmez_bosluklar_bosluk_olur`, `dile_gore_kucuk_harf`,
  `ingilizce_sayi_yil_ve_sira_el_hesabiyla`, `ondalik_ve_saat_dile_gore`. **(b)** `('i', U+0307)` kolunun silinmesi
  (sonuç yine "i").
