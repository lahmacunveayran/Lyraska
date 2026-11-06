# 40 — Müziğe tepki veren görseller ve koreografi (AS10)

Depoda iki kapsamlı görsel araştırma var (`gorsel-vay-arastirma.md`, `sahneler-v2/README.md` + bağımsız denetimi):
işçilik ilkeleri, MilkDrop/AVS/Plane9, zaman kodlu şov pratiği, "kurgu defteri" (CueSheet), WebGPU/WebGL2. Bu dosya
onları tekrar etmez; **akademik dayanak, ölçüm yöntemi ve eksik kalan üç alanı** ekler.

## 1. Bulgular

| Bulgu                                                                                                                                                                                                                                                                                                                                                                                  | Kaynak                                                                                            | Dil                          | Kanıt                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| Japonya'da AIST'in **Songle / Songle Sync**'i: Songle şarkının yapısını (nakarat ve tekrar bölümleri), hiyerarşik vuruşları, melodiyi ve akorları **önceden** kestirir, kullanıcılar hataları düzeltir (2013 IPSJ dergisi; o dönemki isabet "~%80"); Songle Sync (2017) önceden çözümlenmiş vuruş/ölçü/nakarata göre 100+ aygıtı (ışık, robot, LED giysi) **onlarca ms** hatayla eşler | Goto ve ark., IPSJ 2013; Ogata, Inoue, Kato, Goto, SIGMUS 2018; AIST basın bülteni 2017; AV Watch | Japonca                      | B (AIST PDF'leri bu ortamdan açılmadı)             |
| "Önceden bil + kullanıcı düzeltsin" deseni Lyraska'nın şarkı haritası + işaretleme aracıyla **birebir aynı**; Songle'ın farkı düzeltmelerin paylaşılması (Lyraska'da şarkı haritası dosyası)                                                                                                                                                                                           | aynı                                                                                              | Japonca                      | C (karşılaştırma)                                  |
| **Skip-BART** (ICLR 2026): sahne ışığını bir **üretim** görevi olarak öğreniyor (ses → ışık tonu ve yoğunluğu, kare ızgarasında); ilk ışık veri seti RPMC-L²; insan değerlendirmesinde kural tabanlı yöntemlerden iyi, gerçek ışıkçılara "sınırlı fark". Ağırlık **Apache-2.0**, veri **CC BY 4.0** (Hugging Face etiketleri)                                                          | arXiv 2506.01482 özeti; HF API                                                                    | İngilizce (Çin'den yazarlar) | A (özet + lisans etiketi; makale gövdesi okunmadı) |
| Mevcut otomatik ışık çözümlerinin çoğu "müziği birkaç sınıfa ayırıp hazır kalıplara eşliyor → kalıplaşmış, tekdüze" (Skip-BART'ın kendi tespiti) — sahibinin Işık Ustası için "sıkıcı" yargısıyla örtüşüyor                                                                                                                                                                            | aynı                                                                                              | —                            | A (özet)                                           |
| Ticari: müzik özellik dosyasıyla (zaman işaretleri) eşgüdümlü ışık gösterisi patenti (US 12225648; EP 3839766 B1)                                                                                                                                                                                                                                                                      | patent metinleri                                                                                  | İngilizce                    | B                                                  |
| Ticari: gerçek zamanlı ışık cihazları ("ön analiz gerekmez") pazarlaması                                                                                                                                                                                                                                                                                                               | MaestroDMX                                                                                        | Almanca                      | B (K5)                                             |
| Demoscene: **Rocket** senkron izleyicisi — her değişken bir iz, satırlar zaman, anahtar kareler (adım, doğrusal, smoothstep); editör ya da dışa aktarılmış veriyle oynatma; Rust istemcisi var                                                                                                                                                                                         | rocket/rocket GitHub                                                                              | İngilizce                    | B (lisans dosyası okunamadı)                       |
| Algı: ses–görüntü eşzamanlılığı fark eşiği (yayın, konuşma) ses önde +45 ms, ses geride −125 ms (ITU-R BT.1359)                                                                                                                                                                                                                                                                        | yayın kaynakları                                                                                  | İngilizce                    | B                                                  |
| Müzisyenlerin çok duyulu birleştirme penceresi < 100 ms, müzisyen olmayanların ~200 ms (çift flaş yanılsaması)                                                                                                                                                                                                                                                                         | Exp. Brain Res. 2016 (Bidelman)                                                                   | İngilizce                    | B                                                  |
| EDM'de build-up ve drop dansçıların en zevkli bulduğu bölümler; drop'ta grup içi eşzamanlılık artıyor                                                                                                                                                                                                                                                                                  | Solberg & Jensenius 2016–17                                                                       | İngilizce (Norveç)           | B                                                  |
| Kore: şarkının duygusunu 1 sn'lik parçalarla LED ışığa ve animasyona çeviren KCI makalesi (duygu eşleşmesi > %60) — vuruş değil **duygu** odaklı                                                                                                                                                                                                                                       | KCI (Soongsil)                                                                                    | Korece                       | B                                                  |
| Rusça: dans ve müzik eşzamanlılığının spektrogram bindirmesiyle görsel analizi (VVGU)                                                                                                                                                                                                                                                                                                  | Rus üniversite dergisi                                                                            | Rusça                        | B                                                  |

## 2. Eleştirel değerlendirme

1. **Ses–görüntü hedefi (±20 ms) doğru seçilmiş**: algı eşiklerinin (BT.1359, müzisyen penceresi) içinde ve Songle
   Sync'in "onlarca ms"inden sıkı. Ölçüm altyapısı (CI'da senkron, kalibrasyon tıklaması) dünya pratiğinin üstünde.
   Zayıf yan: Bluetooth gecikmesi kullanıcıya kalıyor (A), bu herkeste aynı.
2. **Koreografi kural tabanlı.** Görsel Yönetmen'in üç katmanı el yapımı eşlemeler (A, `director/mod.rs`). Skip-BART'ın
   gözlemi tam bu tür sistemlere yönelik: kalıplar tanındıkça "tekdüze". Sahibinin dört sahneyi ve Işık Ustası'nı
   kaldırması (A, BILGI §7) yalnızca estetik değil, **çeşitlilik** sorunu da olabilir (C).
3. **Ölçüt yok.** "Vay be" ölçülmüyor; kararlar sahibinin tek seferlik izlenimiyle veriliyor (A). Bu iyi bir ürün
   kararı, ama zayıf bir **deney**: aynı koreografi farklı çizimle mi beğenilmedi, yoksa koreografi mi sıkıcıydı?
   Ayrılamıyor.
4. **Değerlik (hüzün/neşe) ve işlev etiketi yok** (bkz. 12, 13): atmosfer katmanı enerjiden türüyor.

## 3. Öneriler

**Ö-G1: Tercih ölçümü (sahibinin zamanını az alan).** Her yeni görsel fikir için 2 × 15 sn'lik A/B klipleri (aynı
şarkı anı); sahibi yalnızca "hangisi" der; sonuçlar Bradley–Terry puanıyla toplanır. İki eksen ayrı sınanır:
(a) aynı çizim, farklı koreografi; (b) aynı koreografi, farklı çizim. **Başarı ölçütü:** yeni sahnenin eskilere karşı
kazanma oranı ≥ %70 (en az 10 eşleşme).

**Ö-G2: Öğrenilmiş "atmosfer eğrisi" (araştırma).** Skip-BART (Apache-2.0) ses → ton/yoğunluk eğrisini çevrimdışı
üretir; Lyraska bunu yalnızca **atmosfer katmanının renk/yoğunluk önerisi** olarak alır; ritim katmanı ve güvenli mod
aynen Lyraska'nın kurallarında kalır (güvenli modda çıktı hız sınırlı değerlere kırpılır). CPU: BART boyutunda bir
model şarkı başına saniyeler–onlarca saniye (C; boyutu okunmadı). Ölçüm: Ö-G1.

**Ö-G3: Kurgu defterini düzenlenebilir yap (demoscene yaklaşımı).** `sahneler-v2` §3.4'teki CueSheet'i Rocket gibi
iz/anahtar kare biçiminde saklamak: kullanıcı (ya da topluluk) bir şarkının koreografisini elle düzeltebilir;
şarkı haritası dosyasının (SARKI-HARITASI.md) isteğe bağlı bir bölümü. Ses içermez (telif sorunu yok).

**Ö-G4: WebGPU'ya geçme** (şimdilik): WebView2'de WebGPU desteği kaynaklarda çelişkili (Tauri 2023: yalnızca kararsız
kanalda; Construct: WebView2'de destekli) (B). WebGL2'de kal; WebGPU yalnızca ölçülmüş bir darboğaz (ör. parçacık
simülasyonu) için ve yedekli.

## 4. Kaynaklar

Zhao ve ark., "Automatic stage lighting control: is it a rule-driven process or generative task?", arXiv 2506.01482
(özet API'den okundu, A); Hugging Face `RS2002/Skip-BART` (apache-2.0) ve `RS2002/RPMC-L2` (cc-by-4.0) (A). AIST
Songle/Songle Sync: researchmap, AIST ve JST basın bültenleri, AV Watch, ITmedia (Japonca, B). rocket/rocket (B).
Patentler US 12225648, EP 3839766 B1 (B). ITU-R BT.1359 özetleri (B). Bidelman 2016 (B). Solberg & Jensenius (B).
KCI ve Rus kaynakları (B). Depodaki görsel araştırmalar (A).
