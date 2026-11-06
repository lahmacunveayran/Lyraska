# 85 — Fırsatlar: "önceden bilme" avantajı (AS14)

Gerçek zamanlı görselleştiriciler (MilkDrop, AVS, akıllı ampuller) yalnızca **geçmişi** bilir: bir vuruşa ancak
olduktan sonra, gecikmeyle ve nedensel süzgeçlerle tepki verir. Lyraska şarkının **tamamını** çalmadan önce bilir.
Bu bir hesaplama sınıfı farkıdır: nedensel (causal) değil, nedensel olmayan (non-causal) ve küresel (global)
yöntemler kullanılabilir. Aşağıdaki fırsatlar literatürde ya da sektörde dayanağı olanlardır.

## 1. Dayanaklar (literatür ve sektör)

| Fikir                                                                                                | Kim yapıyor                                                                                                                                                                                                               | Kanıt                 |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Önceden çözümle + kullanıcı düzeltsin + aygıtları eşle                                               | AIST Songle (yapı, vuruş, melodi, akor; kullanıcı düzeltmesi) ve Songle Sync (100+ aygıt, onlarca ms)                                                                                                                     | B (Japonca kaynaklar) |
| Türe özgü yapı önseli: "cümleler 8 ölçünün katı, bölümler tam sayıda cümle"                          | Vande Veire & De Bie, EURASIP JASMP 2018, DnB için otomatik DJ: bu önsellerle şarkıların **%91'i tamamen doğru** (tempo, vuruş, ölçü başı, yapı); ölçü başı isabeti %95,3; vuruş %98,2–99,4; 18 DnB hayranıyla öznel test | A (PDF okundu)        |
| Ses → koreografi **öğrenme**: ritim oyunu adım şemalarını sesten üretmek ("learning to choreograph") | Donahue, Lipton, McAuley, "Dance Dance Convolution", ICML 2017                                                                                                                                                            | A (özet)              |
| Ses → ışık tonu/yoğunluğu, ışıkçılardan öğrenilmiş                                                   | Skip-BART, ICLR 2026 (Apache-2.0 ağırlık)                                                                                                                                                                                 | A (özet + lisans)     |
| Beklenti → zevk: build-up ve drop en zevkli; drop'ta fizyolojik tepki                                | Solberg & Jensenius; Solberg & Dibben 2019                                                                                                                                                                                | B                     |
| Bilgilendirilmiş ölçü takibi: usul biliniyorsa ölçü başı F 0,65 → 0,89                               | Holzapfel ve ark. 2014                                                                                                                                                                                                    | A                     |
| Zaman çizelgesinde anahtar kareli senkron (demoscene)                                                | Rocket sync tracker                                                                                                                                                                                                       | B                     |
| Ana akım çalarlar analizi geçişte kullanıyor                                                         | Apple AutoMix (2025), Plexamp sonic analysis                                                                                                                                                                              | B                     |

## 2. Lyraska'ya özgü on fırsat (öncelik sırasıyla)

**F1. Güvenli modda "zamanında" nabız: kısıtlı yörünge planlama.** Bugün güvenli modda parlaklık hız sınırlı (her
karede en çok r·dt değişir). Nedensel bir hız sınırlayıcı nabzın tepesini **geciktirir**. Şarkı bilindiği için
parlaklık yörüngesi önceden planlanabilir: "her vuruş tepesine olabildiğince yakın ol, |dL/dt| ≤ r, saniyede ≤ 1
tepe" kısıtıyla bir optimizasyon (dinamik programlama ya da dışbükey en küçük kareler; şarkı başına bir kez, milisaniyeler).
Rampa vuruştan önce başlar, tepe tam vuruşta olur. Güvenlik sınırları **aynen** korunur (kısıt olarak), yalnızca
zamanlama düzelir. Modül: `director/` (yeni planlayıcı), sahnelerin `sceneLevel` girdisi. Ölçüm: güvenli modda nabız
tepesinin vuruşa göre gecikmesi (ms; bugün ölçülüp yazılır) → hedef ortanca ≤ 20 ms; parlama testleri değişmeden geçer.
(C — Lyraska'da bugünkü gecikmenin ölçülmesi gerekir; yöntem kontrol kuramında standart.)

**F2. Yoğunluk bütçesi: doruğu sona sakla.** Şarkının enerji eğrisi ve droplar baştan bilindiği için "en parlak,
en hızlı, en geniş" görünüm yalnızca şarkının doruğuna ayrılır; ilk nakarat ikinciden sakin. Bu, sahne ışığı
tasarımının temel kuralı (görsel araştırmalardaki "kurgu defteri" ile uyumlu, A: `sahneler-v2` §3.4). Biçim:
bölümler üzerinde DP — her bölüme bir yoğunluk düzeyi, "monoton olmayan sıçrama cezası" + "doruk = en yüksek".
Ölçüm: Ö-G1 tercih testi.

**F3. Türe özgü yapı önseli (8 ölçülük cümle).** Vande Veire'nin bulgusu (A): EDM'de cümle = 8 ölçü varsayımı
tam doğru açıklama oranını %91'e çıkarıyor. Lyraska'nın Foote sınırları ve drop anı 8 ölçülük ızgaraya **önsel
olarak** (zorla değil) çekilir; tür tahmini/etiket EDM diyorsa önsel güçlü. Drop'un "ölçü başına yapıştırılmaz"
dersi (BILGI §5) korunur: önsel yalnızca adaylar arasında seçimde.

**F4. Önden haber veren görseller (ritim oyunu dili).** Gece otoyolunda yol çizgileri zaten vuruşa kilitli (A); bir
adım öte: gelecekteki vuruşlar/drop **yaklaşan nesneler** olarak görünür (ritim oyunlarının nota otoyolu; DDC'nin
konusu). Kullanıcı drop'un geldiğini **görür**. Drop sayacı (InfoStack) bunun metin hâli; sahneye taşınır.

**F5. Sıfır gecikmeli zarf (nedensel olmayan süzgeç).** Gerçek zamanlı görselleştiricilerin tepe izleyicileri
(attack/release) her zaman geride kalır. Lyraska zarfı ileri-geri (sıfır fazlı) süzgeçle ve başlangıç anına
hizalı hesaplayabilir: görsel tepe tam vuruşta. `visual_bridge` önceden analiz edilmiş kareyi okuduğu için altyapı
hazır; spektrum karelerinin kendisi sıfır fazlı yumuşatılabilir (yalnızca görseller için; parmak izi değişmez →
spektrum sürümü artmaz, yeni bir "görsel zarf" parçası). Ölçüm: vuruş anı ↔ görsel tepe farkı (ms).

**F6. Sözlerin önceden yerleşimi (kinetik tipografi).** Satırlar ve kelime zamanları baştan bilindiği için satır
kırılımı, kelime büyüklüğü (vurgulu hece, uzun nota) ve geçiş önceden planlanır (AIST'in TextAlive'ı — 2015'te
kamuya açıldı; sözün söylenme zamanlarını ve nakarat bilgisini otomatik kestirip kullanıcıya hareketli söz
yaptırıyor; 2023'te "lyric app" adıyla her çalışta farklı söz sunumu yapan Web API'si — Japonca kaynaklar, B;
AIST PDF'leri bu ortamdan açılmadı). Uzun tutulan nota (vokal etkinliğinden) kelimeyi
büyütür; nakarat ikinci kez geldiğinde aynı yerleşim (yapı bilgisi).

**F7. Yapı bilgisiyle söz hizalama** (bkz. 21, Ö-S1): nakarat metni tekrar ediyorsa, aynı etiketli bölümlere
oturmalı; tutarsızlık hata algılayıcısıdır. Gerçek zamanlı bir sistem bunu yapamaz.

**F8. Bilgilendirilmiş ölçü ve ton.** Kullanıcının bir şarkıya verdiği tek bilgi ("bu 9/8", "bu La minör") ya da
dosyanın tür etiketi, karar önselini değiştirir (bkz. 11 Ö-M1, Holzapfel A). İşaretleme aracının yükü azalır: bütün
vuruşlar değil, tek etiket.

**F9. Kütüphane düzeyinde küresel planlama (Faz 7).** Otomatik DJ sırası, şarkı başına açgözlü seçim yerine set
boyunca hedef enerji eğrisine (ısınma → doruk → iniş) uyan bir yol araması (DP / ışın araması): bütün kütüphanenin
haritası önceden var. Vande Veire'nin sistemi de bütün kütüphaneyi önceden çözümlüyor (A).

**F10. Geçişin koreografisi (Faz 6).** İki şarkının haritası birlikte bilindiği için geçiş sırasında görseller iki
şarkının bölüm temaları arasında **ölçü başında** harmanlanır; gelen şarkının drop'u geçişten sonra geliyorsa
beklenti geçiş boyunca kurulur. Gerçek zamanlı hiçbir çalar bunu yapamaz.

## 3. Ölçülebilir başarı ölçütleri (özet)

| Fırsat     | Ölçüt                                                               | Hedef                                  |
| ---------- | ------------------------------------------------------------------- | -------------------------------------- |
| F1         | Güvenli modda nabız tepesi – vuruş farkı (ortanca)                  | ≤ 20 ms, parlama testleri aynen geçer  |
| F2, F4, F6 | Sahibinin A/B tercihi (Bradley–Terry)                               | kazanma ≥ %70                          |
| F3         | Harmonix/sahibinin EDM şarkılarında bölüm sınırı HR3F; drop isabeti | taban çizgisinden +0,10 / gerileme yok |
| F5         | Vuruş anı – görsel zarf tepesi (ortanca)                            | ≤ 1 kare                               |
| F7         | Jamendo son sınama şarkı başına ortalama satır hatası               | 1,33 → ≤ 0,40 sn                       |
| F8         | Aksak yanlış pozitif (maksum, Türk pop'u)                           | 0                                      |
| F9, F10    | Sahibinin "elle seçmiş gibi" oranı (ROADMAP Faz 7)                  | ≥ %70                                  |
