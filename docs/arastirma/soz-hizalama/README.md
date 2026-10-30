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
