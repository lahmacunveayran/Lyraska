# 30 — Çalma ve ses işleme (AS9)

Bu alan Lyraska'nın en güçlü yanı: iki bağımsız denetim matematiği yeniden türetip doğru buldu (A,
`DENETIM-2.md` §0: RBJ, BS.1770-4, rubato, binom testi); ses yolu ölçülerek −152 dB bozulma+gürültü, yeniden
örneklemede Nyquist üstü −195 dB (A, ROADMAP Faz 3); EBU Tech 3341 uyum durumları kanal ağırlıklarıyla düzeltildi
(A, BILGI §5). Bu yüzden bu dosya **eksik özelliklere ve varsayımlara** odaklanır.

## 1. Ses yüksekliği eşitleme

| Ne                                                                                                                                                                                                                                                          | Kaynak                                                                 | Kanıt |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----- |
| AES TD1008 (2021): müzik için **albüm eşitleme tercih edilir** (sanatçının albüm içi dinamik niyeti korunur); pratik değilse parça eşitlemesi **−16 LUFS'ten yüksek değil**; dinleme testinde deneklerin %80'i karışık sırada bile albüm eşitlemeyi yeğledi | Radio World, Production Advice özetleri (B; aes.org belgesi 403 döndü) |
| Servisler: çoğu −14 LUFS; Tidal albüm eşitlemesi, Deezer/Pandora parça                                                                                                                                                                                      | B                                                                      |
| ReplayGain 2.0 (foobar2000 vb.): parça ve **albüm** kazancı etiketi, −18 LUFS referans                                                                                                                                                                      | C (wiki.hydrogenaud.io 403; genel bilgi)                               |

**Lyraska (A, kod):** `audio/normalize.rs` yalnızca **parça** başına −14 LUFS (`TARGET_LUFS`); albüm modu yok;
dosyadaki ReplayGain/R128 etiketleri okunmuyor (`grep replaygain` boş). Sonuç: bir albümün sessiz girişi ya da
konser kaydının yavaş parçası, yüksek parçalarla aynı düzeye çekilir — TD1008'in tam olarak kaçınmayı önerdiği şey.

**Ö-A1:** Albüm modu (albümün en yüksek parçası −14 LUFS'e, diğerleri aynı kazançla) + "karışık sırada parça, albüm
sırasında albüm" kuralı (foobar2000/Plexamp'ın yaygın "akıllı" modu, C). Analiz zaten parça LUFS'unu saklıyor;
albüm LUFS'u parçaların enerji ortalamasından (BS.1770 kapılı ölçüm parçalar birleştirilerek değil, ama yaklaşık
olarak parçaların kapılı güç toplamından; tam doğruluk için blok güçleri saklanmalı, C). Modül `normalize.rs`,
`library/` (albüm grubu zaten var). Ölçüm: sentetik albüm testinde albüm içi farklar ±0,1 LU korunur.

## 2. Kulaklık düzeltmesi (EQ / hedef eğriler)

- Harman hedefi: Olive, Welti, McMullin (AES 2013) iki kulaklıkta hoparlör oda tepkisinden türeyen hedef en çok
  yeğlendi; kulak içi model hedeften sapmanın büyüklüğü/eğimiyle tercihi **r = 0,91** ile tahmin ediyor (2017); Acoustics
  Today (2022): dinleyicilerin **%64**'ü Harman hedefini yeğliyor — yani üçte biri başka bir şey istiyor (B).
- Forumlar (Head-Fi, B/K5): tek çizgilik hedefin kafa ve kulak kepçesi farklarını yok saydığı eleştirisi; AutoEq
  internetten toplanan farklı ölçüm düzeneklerinin bileşimi.
- AutoEq kodu MIT (A); ölçüm verilerinin lisansı README'de yazmıyor (A). 6 Kasım kararıyla sahibinin kendi indirdiği
  profil zaten içe aktarılabiliyor (A: ROADMAP 0.0.13).

**Ö-E1: Tercih ayarı.** Hedef eğriye "bas rafı" ve "tiz eğimi" kaydırıcıları (Harman'ın kendi çalışmalarında
dinleyicilerin bas tercihi en büyük değişken; B). Ses yolunda zaten raf süzgeçleri var; yalnızca arayüz. Ölçüm:
sahibinin ABX'i değil, **tercih** testi (MUSHRA benzeri, eşit yükseklikte; `peq.rs`'in A/B'si zaten eşit yükseklikte).

## 3. Crossfeed ve sanal hoparlör

- Lyraska'nın crossfeed'i (A): orta ses bit bit aynı, yan kanal hiçbir frekansta yükselmez. Bauer/Linkwitz ailesi.
- Bir adım ötesi: **kişisel BRIR** (iki kulak mikrofonuyla kendi hoparlörünü ölçmek): Impulcifer (MIT, A, LICENSE) —
  HeSuVi/Equalizer APO dünyasında yaygın (K5). Genel HRTF veritabanları (SOFA biçimi) ikinci seçenek.
- **Ö-C1 (düşük öncelik):** SOFA/WAV BRIR dosyası içe aktarma + bölünmüş evrişim (FFT, kanal başına 2 evrişim). Ses
  yolu bellek ayırmaz kuralı: evrişim tamponları önceden ayrılır; `ses_yolu_bellek_ayirmaz` testine eklenir.

## 4. Zaman germe (Faz 6)

ROADMAP: "Signalsmith Stretch (MIT); Rubber Band GPL olduğu için ikinci seçenek". **Düzeltme (A):** Rubber Band
README: "GPL; either version 2 of the License, or (at your option) any later version" → GPL-3.0-only programla
**uyumlu**; ticari lisans yalnızca GPL dışı kullanımda gerekiyor. Lisans bir engel değil; seçim kalite ve hızla
yapılmalı (Rubber Band R3 motoru ↔ Signalsmith). Ö-G1: ikisini aynı perde/geçici tepki testiyle ölç (tempo %±8,
davul vuruşlarının bulanıklığı = başlangıç gücü tepe genişliği; vokal perdesi).

## 5. Yeniden örnekleme, sınırlayıcı, bit-perfect, ABX

- Yeniden örnekleme: rubato (FFT ve sinc; A, README); ölçüm −195 dB (A). Ek iş gerekmez.
- Gerçek tepe sınırlayıcı (−1 dBTP, 8× ara değer): BS.1770'in 4× önerisinden sıkı (C). Yeterli.
- Bit-perfect: sahibinde "ses kısık/vızıltı" bildirimi açık (A, ACIK-KONULAR). Dünya pratiği (C): WASAPI özel modda
  aygıtın "biçim" listesi ile gerçek desteklediği farklı olabilir; ASIO yok. Ölçüm planı: DOGRULAMA B6/B11.
- ABX: sonucun yalnızca sonda verilmesi (A: ROADMAP) sabit deneme sayılı testle uyumlu; Hydrogenaudio tartışması
  "her denemeden sonra sonuca bakmak" p değerini bozar (B). Lyraska doğru yapıyor. **Ö-X1:** sonuçta güven aralığı
  (Clopper–Pearson) da gösterilsin; "fark yok" ile "ayırabiliyorum ama zor" ayrılır (Hydrogenaudio önerisi, B).

## 6. Kaynaklar

Radio World ve Production Advice'ın TD1008 özetleri (B). Olive, Welti, McMullin AES 2013; Olive ve ark. 2017/2018;
Acoustics Today Spring 2022 (B). jaakkopasanen/AutoEq README ve LICENSE (A). jaakkopasanen/Impulcifer LICENSE (A).
breakfastquay/rubberband README (A). HEnquist/rubato README (A). Hydrogenaudio ABX başlıkları (B). Depodaki
`DENETIM-2.md`, `ROADMAP.md`, `BILGI-BIRIKIMI.md` (A).
