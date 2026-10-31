# Sözleri sese otomatik hizalama (30 Ekim 2026)

Proje sahibi elle zamanlama (dokunarak) yapamayacağını söyledi; istek: yapıştırılan düz metin sözler program
tarafından kendiliğinden sese oturtulsun (satır, mümkünse kelime), çevrimdışı, Türkçede iyi. Sahibinin isteğiyle
konu iki kez irdelendi; ikincisi birincinin sonuçlarını görmeden kendi planını yazan bağımsız, üst düzey denetim.

| Dosya                                    | İçerik                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| [RAPOR.md](RAPOR.md)                     | Birinci irdeleme: seçenekler, deneme setleri, ölçümler, öneri, ürüne giriş planı |
| [denetim/00-PLAN.md](denetim/00-PLAN.md) | İkinci irdelemenin raporu okumadan önce yazılmış denetim planı                   |
| [denetim/DENETIM.md](denetim/DENETIM.md) | İkinci irdeleme: hükümler, karşı örnekler, güven ölçüsü, nihai öneri             |
| `betikler/`, `denetim/betikler/`         | Ölçüm betikleri (Python; yeniden çalıştırma RAPOR.md §10)                        |
| `model-sha256.txt`                       | Ölçülen model dosyasının SHA-256'sı                                              |

**Sonuç (iki irdelemenin ortak hükmü):** Omnilingual ASR CTC 300M v2 (Meta; kod ve ağırlık Apache-2.0, sherpa-onnx
int8, 366 MB) ile CTC Viterbi zorlanmış hizalama, şarkının kendi sesi üzerinde; vokal ayrıştırma gerekmez. İkinci
denetimin eklediği zorunlu parçalar: metin ön işleme ("[Nakarat]", "(x2)", başlıklar, rakamlar), satır atlamalı
hizalama, ileri-geri güven ölçüsü (büyük hatayı AUROC 0,97 ile ayırır; düşük güvenli satır "tahmini"), model
çıktısının önbelleği (söz düzeltilince yeniden hizalama < 1 sn), çalıştırıcı `tract` (tek iş parçacığı, düşük
öncelik, 10 sn pencere). Açık risk: gerçek Türk pop, arabesk ve rap ölçülemedi (doğru zamanlı set yok).

Notlar: belgelerdeki `/tmp/claude-0/...` yolları o oturumun geçici bilgisayarındaydı. Ses dosyaları, model
ağırlıkları, şarkı sözleri ve ölçüm çıktıları (JSON) depoya konmadı; deneme setlerinin kaynağı ve lisans notları
RAPOR.md §3 ve DENETIM.md'de.

## Model çalıştırıcı: pencere boyu ve ürün ölçümleri (30 Ekim 2026, söz hizalama 4/6)

Denetimin "pencere boyu doğrulukla birlikte bir kez ölçülsün" önerisi, yalnızca geliştirme setinde (Jamendo + makam +
vekil, 1043 satır; onnxruntime, satır atlamalı yerleşim):

| Pencere / adım | ≤0,3 sn | Ortalama hata |
| -------------- | ------- | ------------- |
| 30 / 20 sn     | %94,15  | 0,55 sn       |
| 15 / 10 sn     | %94,15  | 0,53 sn       |
| 10 / 6 sn      | %92,33  | 0,74 sn       |

10 sn pencere satırları ve (bağımsız incelemeye göre) güven ölçüsünü bozuyor; üründe araştırmanın uçtan uca ölçtüğü
30 / 20 sn. Bağımsız inceleme tract'ın emisyonunu onnxruntime'la kare kare karşılaştırdı: argmax uyuşması %99,4,
fark int8 modelin kendi oynaklığı kadar. Uçtan uca (`examples/soz_hizalama.rs`, Kinematic – Peyote, 183 sn, bu
sunucu): model 5,6 sn'de açılır, emisyon 87 sn (iki iş parçacığı, gerçek zamanın 0,47 katı), yerleşim 0,8 sn;
14 satırın 13'ü 0,3 sn içinde, hüküm "iyi". Windows'ta hız ölçümü sıradaki işte.

## Windows'ta hız: tamsayı çarpımları ondalıklı (31 Ekim 2026)

Proje sahibinin bilgisayarında (AMD Ryzen 7 7435HS, 8 çekirdek / 16 iş parçacığı, AVX2 + FMA, AVX-512 ve VNNI yok;
Windows 11, MSVC) ilk ölçüm: 240 sn sessiz ses **3709 sn** (gerçek zamanın 15,5 katı; bulut sunucusunda 0,47 kat).
Katman katman süre (`tract`'ın `run_plan_with_eval`'ı, 5 sn ses, tek iş parçacığı): toplam 128 sn, %97,5'i
`OptMatMul`; en yavaşları tamsayı çarpımları, çekirdek `avx2_mmm_i32_8x8`. İleri besleme katmanı
(m 4096 × k 1024 × n 249 = 2,09 G işlem) 1,7 sn → **1,2 G işlem/sn**; aynı makinede f32 çekirdeği
(`fma_mmm_f32_16x6`, öznitelik çıkarıcının 12,6 G işlemlik evrişimi 0,127 sn) **~99 G işlem/sn**. Önbellek boyu
(`TRACT_LLC_BYTES=16M`) bir şey değiştirmedi; `TRACT_CPU_ISA=-avx2` çarpımı 12 kat hızlandırdı ama Softmax'ı 0,07 →
17 sn yavaşlattı. Bulut sunucusu büyük olasılıkla AVX-512 VNNI çekirdeğini kullanıyordu (bu çekirdek Windows
derlemesinde yok); tract'ın kendi ölçümüne göre AVX2 int8 çekirdeğinin tavanı ~8 G/sn, VNNI bunun 9–13 katı
([sonos/tract#2303](https://github.com/sonos/tract/pull/2303)); VNNI'siz x86'da int8'in f32'den yavaş olduğu
bağımsız ölçümlerle de uyumlu. Yani çekirdek düzeltilse bile bu işlemcilerde f32 daha hızlı kalır.

Çözüm (`lyrics_model.rs`, `dequantize_matmuls`): açılışta, yalnızca bellekte, onnxruntime'ın dinamik nicemleme
kalıbı (`DynamicQuantizeLinear → MatMulInteger → Cast → Mul`) `y = x · W` olur, `W = (W_q − z_w)·s_w`. Gerçek
modelde 146 çarpımın 146'sı çevrilir. Eski yolla fark yalnızca girdinin nicemlenmemesi:
`|Δy_j| ≤ (s_x/2)·Σ_k |W_kj|` (test). Ölçümler (240 sn sessiz ses, `examples/soz_hizalama.rs --sessiz 240`):

| Yol              | İş parçacığı | Süre    | Gerçek zamanın | En yüksek bellek |
| ---------------- | ------------ | ------- | -------------- | ---------------- |
| Tamsayı (eski)   | 2            | 3709 sn | 15,45 kat      | —                |
| Ondalıklı (yeni) | 1            | 278 sn  | 1,16 kat       | 2,6 GB           |
| Ondalıklı        | 2            | 161 sn  | 0,67 kat       | 2,6 GB           |
| Ondalıklı        | 3            | 119 sn  | 0,50 kat       | 2,6 GB           |
| Ondalıklı        | 4            | 91 sn   | 0,38 kat       | 2,8 GB           |
| Ondalıklı        | 6            | 73 sn   | 0,30 kat       | 3,6 GB           |

İş parçacığı sayısı artık sabit değil: mantıksal çekirdeklerin yarısı, en çok 4 (`window_threads`). En yüksek
bellek açılıştadır (ONNX tanımı ve tract'ın tensörleri bir an birlikte); ağırlıklar 366 MB yerine 1,2 GB.
Ölçüm araçları (geçici, depoda değil): katman profili `run_plan_with_eval` ile, f32 kopyası Python `onnx` ile.

Doğruluk (eski tamsayı yoluyla aynı seste; `gercek_modelde_iki_yol_ayni_sonucu_verir`, elle çalıştırılır; ölçüt
ölçümden önce yazıldı: uyuşma ≥ %98, araştırmada int8'in kendi oynaklığı %99,4; satır başları ≤ 1 kare). Ses:
Windows'un konuşma sentezleyicisiyle sözü bilinen 17 sn İngilizce konuşma, 6 satır (868 kare). Kare başına en olası
simge uyuşması **%98,96** (eskinin blank dışı dediği 242 konuşma karesinde %98,35); log-olasılıkta en büyük fark
11,1 (olasılığı çok düşük simgelerde); 6 satırın başlangıcı **iki yolda birebir aynı** (fark 0,000 sn), hüküm ikisinde
de "iyi". Süre: eski 830 sn, yeni 20,5 sn. Açık: gerçek Türkçe şarkıyla karşılaştırma (sahibinin 5–10 şarkılık
denemesi).

## Emisyon önbelleği: yalnızca gereken sütunlar, f16 (31 Ekim 2026)

Denetim emisyonları "~60 sütun, şarkı başına ~0,7–1,4 MB" varsaymıştı; ölçüm başka çıktı: modelin saklanan harfleri
(Latin, Yunan, Kiril küçük harf) **410 sütun**, f16 ile dakikada 2,46 MB (deflate 1,88; 4 dk şarkı ~7,5 MB). Çözüm
(`analysis/lyrics_cache.rs`): blank, ayırıcı, Türkçe + İngilizce alfabe ve sözün harfleri saklanır (~38 sütun).
Kayıpsızdır (log-olasılıklar bütün simgelere göre normalleşmiş gelir); söze saklanmamış harf girerse model yeniden
çalışır. Ölçümler (31 Ekim; konuşma kaydı temiz ve gürültülü, 17 sn; gerçek şarkı 173 sn, sözsüz yalnızca boyut):

| Biçim                                      | Dakikada |
| ------------------------------------------ | -------- |
| 410 sütun, f16, deflate                    | 1,88 MB  |
| 38 sütun, f16, deflate                     | 0,181 MB |
| 38 sütun, f16, üst/alt bayt ayrı + deflate | 0,145 MB |

f16 yuvarlamasının en büyük hatası 0,0078 nat (−28 nat'ta); 6 satırın başı, kelimeleri, güveni ve hüküm f32 ile
birebir aynı. Yuvarlama saklamadan önce yapılır: yeni hesaplanan ve önbellekten okunan emisyon aynı sonucu verir.
