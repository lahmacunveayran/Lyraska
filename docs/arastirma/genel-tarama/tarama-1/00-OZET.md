# Genel tarama 1 — özet (6 Kasım 2026)

Proje sahibinin isteği: projenin tamamı için, farklı dillerde, forum / video / makale / üniversite arşivi / dergi
taraması; en iyi projelerin irdelenmesi. Çerçeve: **yeni karar (6 Kasım 2026)** — Lyraska ticari değil, yalnızca sahibinin
kişisel kullanımı; ticari olmayan (NC) ya da araştırma lisanslı **model ağırlıkları ve veri setleri** yalnızca sahibinin
bilgisayarında yerel paket olarak kullanılabilir; kod GPL-3.0 uyumlu kalır; lisansı yazılmamış model alınmaz.

Dosyalar: [A müzik analizi](A-muzik-analizi.md) · [B kaynak ayrıştırma](B-kaynak-ayristirma.md) · [C sözler ve
vokal](C-soz-ve-vokal.md) · [D ses ve DSP](D-ses-ve-dsp.md) · [E görselleştirme](E-gorsellestirme.md) · [F çalarlar ve
topluluklar](F-kutuphane-ve-deneyim.md) · [G mühendislik](G-muhendislik.md) · [H ölçüm setleri](H-olcum-setleri.md).

**Kanıt düzeyleri** (bütün dosyalarda): **[birincil]** kaynak bu oturumda okundu (makale PDF'i, depo dosyası, model kartı,
standart sayfası); **[özet]** yalnızca arama motoru özeti, doğrulanmadı; **[kod]** Lyraska'nın kendi kodunda bakıldı;
**[bilgim]** genel alan bilgisi, bu oturumda doğrulanmadı; **[tahmin]** benim hesabım.

**Diller:** İngilizce (ana), Japonca (beat, söz hizalama, çalarlar), Çince (beat/yapı, ayrıştırmanın hızı), Korece
(KAIST yapı analizi), Rusça (MVSep/ayrıştırma), Almanca (AudioLabs gerçek zamanlı beat), Fransızca (ayrıştırma tezleri;
yeni bulgu yok), Portekizce/İspanyolca (samba/Latin ritim, LatinMIR 2024), Türkçe (usul, makam). Arama motoru çoğu dilde
İngilizce kaynaklara döndü; yerel forumların kendisi (Zhihu, Habr, J-STAGE) doğrudan okunmadı.

## 1. En önemli 23 bulgu

**Müzik analizi**

1. **Beat This! (JKU Linz, ISMIR 2024): kod ve ağırlıklar MIT**; beat + ölçü başı; GTZAN'da beat F1 89,1, ölçü başı 78,3;
   küçük model (~2 M parametre, 8,1 MB) 88,8 / 77,2 [birincil: makale Tablo 2, README]. Hazır ONNX dönüşümü de MIT
   [birincil: HF kartı]. En büyük tek kazanç adayı. (A §0.1)
2. **Beat This'in zayıf yanı Lyraska'nın güçlü yanı:** süreklilik ölçüleri (CMLt) Hung ve ark.'nın altında; yazarlar
   "ağ periyodik olmayan vuruşlar üretiyor" diyor [birincil]. Lyraska'nın dinamik programlaması periyodikliği zorlar →
   **sinir ağı olasılığı + Lyraska'nın DP'si ve tempo/aksak kuralları** birleşimi önerilir. (A §1.2)
3. **"Beat F ≥ 0,80" hedefi gerçek müzikte hiç ölçülmedi** (yalnızca sentetik). Beat This'i vekil doğru yapıp sahibinin
   656 şarkısında ilk gerçek ölçek ölçümü yapılabilir. (A §7, H §2)
4. **Türk aksak usulleri:** Holzapfel ve ark. (ISMIR 2014) — usul bilinince aksak 9/8'de ölçü başı F 88,6; bilinmeyince
   65,1 [birincil: Tablo 1]. Arama özetinin "%69,6 ölçü başı doğruluğu" dediği sayı aslında **usul tanıma** oranı
   (düzeltme). Ders: zor olan "hangi usul" kararı; Lyraska'nın maksum/Türk pop'unda yanlış aksak sorunu da bu. Öneri:
   vurgu kalıbına ek olarak **ölçü süresi** kanıtı. (A §2)
5. **Beat This'in eğitim setlerinde Türk/aksak verisi yok** [birincil: 16 setin listesi]; Latin Amerika çalışmaları
   (LatinMIR 2024) 4/4 ağırlıklı modellerin 2/4 sambada genellemediğini ve veri artırımının yardım ettiğini gösteriyor
   [özet]. Yeni kararla yerelde ince ayar mümkün (büyük iş, ölçüm gösterirse). (A §8)
6. **Gerçek zamanlı PLP (AudioLabs Erlangen, TISMIR 2024; kod MIT)**: sıfır gecikmeli beat, "beat kararlılığı" ve ileriye
   bakış [birincil]. ROADMAP Faz 5'teki **"Sistem sesi modu"** (önceden analiz imkânsız) için doğru temel. (A §8)
7. **Yapı/etiket modelleri ağır:** SongFormer HarmonixSet'te HR.5F 0,703 / ACC 0,795; All-In-One 0,596 / 0,740 [birincil:
   SongFormer tablosu]. SongFormer MuQ (CC-BY-NC) + MusicFM ister, All-In-One Demucs ister. Lyraska için daha ucuz ve
   güçlü işaret: **tekrar eden söz satırları** (sözler zaten zamanlanıyor). EDM'de "build/drop/breakdown" etiketleri
   pop etiketlerinden anlamlı. (A §3)
8. **Ton:** sinir ağı modelleri klasiğin çok önünde değil — GiantSteps MIREX puanı madmom 71,0, S-KEY 72,1 [birincil].
   EDM için Faraldo profilleri ve libKeyFinder (GPL-3.0; Mixxx) karşılaştırma temeli. (A §5)
9. **Duygu/tür:** uyarılma (enerji) kolay, değerlik (mutlu/hüzünlü) zor (PMEmo R² ~0,46–0,57 değerlik, ~0,64–0,73
   uyarılma) [özet]. MTG/Essentia ONNX modelleri (CC BY-NC-SA) yerelde **Essentia kodu olmadan** (AGPL) tract ile
   çalıştırılabilir; tür önseli tempo oktav hatalarına yardım edebilir. (A §6)

**Kaynak ayrıştırma**

10. **Yeni kararla tablo tersine döndü:** ZFTurbo **BS-RoFormer 4 kanal** ağırlığı yazarın beyanıyla MIT (veri MUSDB18-HQ);
    MUSDB test 9,65 dB (davul 11,61, bas 8,48) [birincil]; Spleeter ~5,9. **Düzeltme:** Kimberley Jensen Mel-RoFormer
    vokal ağırlığı HF kartında **MIT** (önceki rapor "lisanssız" demişti); All-In-One ağırlıkları da MIT [birincil: HF API].
    (B §1)
11. **SDR Lyraska için yanlış ölçü:** ayrılmış ses çalınmıyor; zarf ve başlangıç saklanıyor. Doğru ölçü kick/trampet
    onset F1, bas zarfı ilintisi, vokal etkinliği. **CPU maliyeti belirleyici:** Mini-BS-RoFormer 30 sn için 8 343 GFLOP
    [birincil] → sahibinin Ryzen'inde 4 dk şarkı ~11 dk [tahmin]; sahibinin **RTX 4050**'si ile saniyeler. tract (yalnızca
    CPU) kararının yeniden düşünüleceği tek yer burası. (B §0, §3)
12. **Söz zamanı vokal etkinliğini zaten veriyor:** ayrıştırmadan yalnızca davul ve bas istenirse maliyet düşer. (B §4)

**Sözler**

13. **Lyraska'nın kelime isabeti dünya düzeyinde:** PCO %94,1; Spotify'ın (Durand ve ark. 2023) %94'ü ve AAE 0,18 sn
    [birincil]. Fark ortalamada değil **birkaç şarkının kaymasında** (Lyraska ortalama 1,09 sn). Sıradaki iş daha iyi model
    değil, kaymayı bulmak (güven) ve düzeltmek (tekrar eden nakarat). (C §0)
14. **"Ayrıştırma hizalamaya yardım etmiyor" ölçümü literatürle uyumlu:** Gupta ve ark. 2020'de ayrılmış vokalle Mauch'ta
    3,62 sn, karışımla 0,25 sn [birincil]. (C §0.2)

**Ses**

15. **WASAPI RAW modu istenmiyor** [kod]; Microsoft belgesi: Raw mod akışa hiçbir sinyal işleme uygulanmamasını sağlar,
    sürücüler Raw ya da Default'u desteklemek zorunda [birincil]. Windows iyileştirmeleri (ses yüksekliği eşitleme, sanal
    surround) Lyraska'nın sesini değiştirebilir; **#25 "müzikler garip geliyor" ile ilgili olabilir.** Küçük iş, yüksek
    değer. (D §0.1)
16. **Özel modda 16 bite indirgemede dither yok** [kod] (24 bit şarkı ya da kayıplı şarkı, 16 bit aygıt). (D §0.2)
17. **Albüm modu ses yüksekliği yok** [kod]; AES TD1008 ve Plexamp albüm bağlamını korur [özet]. (D §0.3, F §0.3)
18. **ABX gücü:** 16 denemede p < 0,05 için 12 doğru gerekir; gerçek isabeti 0,7 olan dinleyici bunu %45 olasılıkla geçer;
    50 denemede %86 [hesap]. "Fark yok" yerine "kanıtlanamadı + güç" yazılmalı. (D §5)

**Görseller ve güvenlik**

19. **Senkron eşikleri asimetrik:** ITU-R BT.1359: ses önde +45 ms, ses geride −125 ms fark edilir [özet]; müzikte beat–ışık
    penceresi 120 BPM'de ~150 ms [özet]. ±20 ms hedefi çok sıkı (iyi); belirsizlikte görüntü **geç değil hafif erken**
    olmalı; ayrıca titreme (jitter) hedefi eklenmeli. (E §1)
20. **Standartlar güncel:** ITU-R **BT.1702-3 (11/2023)** yürürlükte; WCAG 2.2'nin kırmızı tanımı ISO 9241-391'den
    (R/(R+G+B) ≥ 0,8, Δu′v′ > 0,2) [birincil]. Lyraska'nın freni bunlara dayanıyor; açıklar: MilkDrop'ta kırmızı kanal
    sınırsız, HDR ekranda bağıl eşik yorumu. (E §2)
21. **Butterchurn durgun** (son beta 3.0.0-beta.5, npm'de son değişiklik 2025-07) [birincil]; projectM v4 etkin. WebGPU
    WebView2'de 2023'te bayrak istiyordu [birincil: Tauri #6381]; bugünkü durum 10 dakikalık `navigator.gpu` denemesiyle
    görülmeli. (E §0.3–0.4)

**Ürün ve mühendislik**

22. **Apple AutoMix (iOS 26) ve Spotify Mix (Ağustos 2025)** DJ gibi geçişi ana akıma taşıdı [özet]; Plexamp'ın Sweet
    Fades'i "~%80 çalışıyor" şikâyeti alıyor [özet]. Faz 6/7 doğru yönde; "şüphede düz geçiş" kuralı korunmalı, "kötü
    geçiş oranı" ayrıca ölçülmeli. (F §0)
23. **Test açığı: metamorfik testler ve bulanık sınama (fuzzing) yok** [kod]. Doğrusu bilinmeyen analiz modülleri
    "kaydır → vuruş kayar", "48 kHz → aynı BPM", "+1 yarım ton → ton +1" ilişkileriyle sınanabilir; dışarıdan gelen dosya
    ayrıştırıcıları (`.milk`, EEL, `.lrc`, harita, `.m3u8`) fuzz hedefi; Scorecard'ın "Fuzzing" maddesini de kapatır.
    (G §0)

## 2. Önerilen küçük adımlar (öncelik sırasıyla; her biri ölçülebilir)

| #   | Adım                                                                                                                                  | Modül                                                             | Başarı ölçütü                                                                                                              | Tahmini iş    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | **WASAPI RAW + Media kategorisi** (desteklenmezse eski yol; göstergeye satır)                                                         | `audio/output/wasapi.rs`                                          | Sahibinin bilgisayarında iyileştirmeler açıkken loopback kaydı ile giriş farkı ≤ −100 dB; #25 yeniden denenir              | küçük PR      |
| 2   | **Beat This ölçümü (kod değişmeden):** ONNX'i tract'ta 60 sn seste çalıştır; süre/bellek; sahibinin kütüphanesinde Lyraska ile uyuşma | `examples/` (geçici)                                              | tract'ta çalışıyor mu (log-mel grafiğin içinde; işlem desteği belirsiz); 4 dk şarkı ≤ 10 sn; uyuşma F listesi              | 1 oturum      |
| 3   | **Metamorfik test takımı (analiz)**                                                                                                   | `analysis/*` testleri                                             | kaydırma: vuruşların ≥ %98'i Δ ± 2 ms; 44,1↔48 kHz: BPM ± %0,5; ±6 dB: vuruşların ≥ %99'u aynı; +1 yarım ton: ton +1       | küçük PR      |
| 4   | **Söz satırı güveni** (serbest CTC çıktısı ↔ söz düzenleme uzaklığı)                                                                  | `lyrics_align.rs`, `lyrics_job.rs`                                | Köy işi 167 şarkıda ROC-AUC ≥ 0,90; yanlış "oturmadı" 9/43 → ≤ 3/43                                                        | küçük PR      |
| 5   | **Aksak kararına ölçü süresi kanıtı**                                                                                                 | `analysis/meter.rs`                                               | maksum + Türk pop'u sentetik ve karşı örnek setinde yanlış aksak 0; gerçek 9/8–7/8 isabeti korunur                         | küçük PR      |
| 6   | **Beat This olasılığı + Lyraska DP** (yeni analiz parçası, kendi sürümü)                                                              | `analysis/beats.rs`, yeni `beat_model.rs`                         | GTZAN beat F ≥ 0,80, ölçü başı F ≥ 0,65; hiçbir sentetik türde eskinin altına düşmemek; aksakta `meter.rs` isabeti korunur | orta (2–3 PR) |
| 7   | **Dither** (yalnızca biçim indirgenirken)                                                                                             | `audio/output.rs`                                                 | −90 dBFS sinüste harmonik yok; bit-perfect testleri değişmez                                                               | küçük PR      |
| 8   | **Albüm modu ses yüksekliği**                                                                                                         | `normalize.rs`, `normalization.rs`                                | sentetik 3 parçalı albümde iç farklar ±0,1 LU                                                                              | küçük–orta    |
| 9   | **Ayrıştırma ölçüm düzeneği** (AAM + Slakh + sentetik kanallar; onset/zarf ölçütleri)                                                 | `examples/`, `docs/arastirma/`                                    | HPSS, Spleeter, BS-RoFormer aynı tabloda; model yolu kick F1'de ≥ +0,05 değilse eklenmez                                   | orta          |
| 10  | **Fuzz hedefleri** (günlük 5 dk CI işi)                                                                                               | `milkdrop/`, `audio/lyrics.rs`, `map_file.rs`, `playlist_file.rs` | 10 dk'da çökme / sonsuz döngü yok; bulunan her girdi kalıcı test                                                           | küçük PR      |
| 11  | **ABX güç bilgisi**                                                                                                                   | `audio/abx.rs`, `AbxPanel`                                        | binom gücü birim testli                                                                                                    | küçük         |
| 12  | **WebGPU yoklaması** (`navigator.gpu`) ve ROADMAP notunun güncellenmesi                                                               | arayüz, tek satır                                                 | sonuç günlüğe                                                                                                              | çok küçük     |

Sonraki büyük adımlar (ölçümler olumlu çıkarsa): tür/ruh hâli modeli (Discogs-EffNet, yerel paket), GPU yolu (`ort` +
CUDA) ve BS-RoFormer davul/bas, Sistem sesi modu için gerçek zamanlı PLP, nakarat tekrarıyla söz kayması düzeltme,
sanal hoparlör (SADIE II, Apache-2.0), Beat This'in yerelde aksak ince ayarı.

## 3. Mevcut kararlarda gördüğüm hatalar ya da eskiyen noktalar

1. **Spleeter kararı** (23 Ekim) lisans kısıtına göre verildi; kısıt kalktı, karar ölçümle yeniden açılmalı (B §7).
2. **Önceki ayrıştırma raporu Mel-RoFormer'ı "lisanssız" sayıyor**; HF kartı MIT (B §0.2). Rapora düzeltme notu düşülmeli.
3. **ROADMAP Fikir havuzu** ("yapay zekâ ile beat/bölüm: ağırlıklar ticari kullanımı yasaklıyor") iki açıdan eski: Beat This
   MIT; NC artık yerelde serbest.
4. **Kalite hedeflerinin üçü gerçek veride ölçülmüyor** (beat F, 60 fps, takılmasızlık); H dosyası yerel ölçüm paketi öneriyor.
5. **`flashGuardMath.ts` BT.1702'ye sürüm yazmadan atıf yapıyor**; yürürlükteki -3 (2023) yazılmalı.
6. **ROADMAP "WebGPU: WebView2 desteği olgunlaşınca"** — 2023'ten beri bayrakla mümkün; bugünkü durum denenmeden bilinmiyor.
7. **AutoEq hazır listesi** beklemede; buna gerek yok (sahibi kendi kulaklığının dosyasını içe aktarabiliyor).

## 4. Riskler ve belirsizlikler

- **Doğrulanmamış sayılar:** "[özet]" işaretli her sayı (ör. BT.1359 eşikleri, DubSpot ton yüzdeleri, MER R²'leri,
  Waseda'nın AUC 0,963'ü) arama özetinden; birincil kaynak okunmadı. Karar vermeden önce okunmalı.
- **tract uyumluluğu:** Beat This ONNX'i log-mel ön ucunu grafiğin içinde taşıyor; tract'ın STFT/işlem desteği belirsiz.
  Olmazsa log-mel Rust'ta hesaplanıp ağ ayrı dışa aktarılır (sevagh/demucs.onnx'in STFT'yi dışarı alma yöntemi).
- **Yeni kararın geri dönüşü:** program bir gün paylaşılırsa NC ağırlıklar (MuQ, MERT, MMS, Essentia, Mini-BS-RoFormer)
  çıkarılmalı. Öneri: her yerel paket bir **lisans bildirimi** (kod / ağırlık / veri) taşısın; program "paylaşıma uygun
  değil" etiketini gösterebilsin.
- **Sahibinin kütüphanesine aşırı uyum:** 656 şarkılık, çoğu EDM kütüphane; ayar o kütüphaneye uyarsa başka türlerde bozulma.
  Dünya setleri (GTZAN, Harmonix, GiantSteps) bu yüzden şart; ayar türü dışarıda bırakan çapraz doğrulamayla (BILGI §5).
- **Hesap maliyeti:** ağır modeller arka plan analizini saatlere çıkarabilir; sahibinin makinesi en çok 4 çekirdek kuralı.
- **Kültürel boşluk:** dünya setlerinde Türk pop'u/arabesk/rap yok; Lyraska'nın kendi ölçümü her zaman gerekecek.
- **Topluluk görüşleri:** forum yazıları mutsuz kullanıcıya eğilimli; Reddit doğrudan okunamadı.

## 5. Erişim: hangi kaynaklar açıldı, hangileri açılmadı

**Açıldı (bu oturumda okundu):**

- `raw.githubusercontent.com` (depo dosyaları: README, LICENSE, sonuç tabloları), `pypi.org`, `registry.npmjs.org`.
- Oturum ortasında ağ genişletildikten sonra (`curl` ile): `arxiv.org` (okunan PDF'ler: 2407.21658 Beat This, 2310.01809
  Mel-RoFormer, 2501.12907 S-KEY, 1909.10200 Gupta ve ark., 2306.07744 Durand ve ark.), `huggingface.co` (model/veri kartı
  API'si), `zenodo.org` API (SADIE II, Hearpiece, AAM), `www.cp.jku.at` (Holzapfel ve ark. 2014 PDF'i), `www.w3.org` (WCAG 2.2
  Understanding 2.3.1), `www.itu.int` (BT.1702 sürüm sayfası), `learn.microsoft.com` (ses işleme modları),
  `www.audiolabs-erlangen.de` (gerçek zamanlı PLP sayfası).
- `github.com` sayfaları WebFetch ile (Tauri #6381).

**Açılmadı ya da kullanılmadı:**

- `api.github.com` / `gh api`: bu oturuma eklenmemiş depolar için 403 (ham dosyalar yerine okundu).
- Reddit JSON araması: otomatik istemci reddedildi; tarayıcı kimliği taklidi uygun görülmediği için denenmedi. Reddit,
  Hydrogenaudio, Roon/Plex forumları yalnızca arama özetinden.
- WebFetch aracının kendi izin listesi `curl`'den dar: arXiv ve AudioLabs WebFetch'te açılmadı, `curl` ile açıldı.
- Koordinatörün bildirdiği kapalılar: `cdn-lfs.huggingface.co`, `web.archive.org`, `www.elibrary.ru`, `www.music-ir.org`
  (MIREX sonuç sayfaları).
- Doğrudan denenmeyenler (yalnızca arama özeti üzerinden): J-STAGE, CiNii, Zhihu, Bilibili, Habr, CNKI, KCI/DBpia, HAL,
  theses.fr, YÖK Tez Merkezi, DergiPark, ResearchGate, AES e-kütüphanesi (ücretli), ISO (ücretli), EBU teknik belgeleri.
- Bağımsız ikinci tarama (tarama-2) okunmadı (talimat gereği).
