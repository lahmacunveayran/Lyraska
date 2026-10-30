# Denetim planı (RAPOR.md okunmadan önce yazıldı, 30 Ekim 2026)

Bildiklerim yalnızca görev metnindeki iddialar: Omnilingual ASR CTC 300M (sherpa-onnx int8), 366 MB, ~1,8 GB tepe
bellek, 4 dk şarkı 31 sn (ort, 4 iş parçacığı) / tract ~3,4 dk, JamendoLyrics + Dzhambazov Türk sanat müziği seti +
vekil Türkçe set (sentez konuşma + MIDI eşlik), güven ölçüsü hatalı satırı yakalayamıyor.

## Çürütme hipotezleri ve yöntem

H1 Lisans: ağırlık "Apache-2.0" değil ya da eğitim verisinde NC/kısıtlı bileşen var (ör. bazı korpuslar CC-BY-NC,
MMS'in eski CC-BY-NC 4.0 ağırlıkları gibi). Yöntem: GitHub'daki facebookresearch/omnilingual-asr deposunun
LICENSE, README, model kartı; sherpa-onnx deposunun dönüşüm betiği ve sürüm notu; PyPI paket meta verisi.
HF kapalı → model kartı HF'deyse "doğrulanamadı". Ayrıca: MMS-1B/MMS-300M ile karıştırılıp karıştırılmadığı.
H2 Çalıştırıcı lisansı: onnxruntime MIT ama Windows dağıtımında DirectML/VC++ çalışma zamanı, `ort` crate'in indirme
davranışı (derleme sırasında ağdan ikili indirme = "sources" denetimi, çevrimdışı derleme), tract MIT/Apache.
Yöntem: crates.io meta verisi, ort'un build.rs / özellikleri, deny.toml ile karşılaştırma.
H3 Veri sızıntısı: Omnilingual eğitim verisinde JamendoLyrics ya da Jamendo/FMA şarkıları, MLS/CommonVoice
üzerinden sentez seslerle aynı metin (vekil set TTS sesi eğitimde olabilir). Yöntem: eğitim verisi listesi
(birincil kaynak), JamendoLyrics lisansı (CC-BY-NC-SA? yalnızca yerel ölçüm için kabul edilebilir mi).
H4 Set ayrımı: geliştirme/doğrulama/son sınama dosya listeleri kesişiyor mu, son sınama kaç kez koştu (günlük
zaman damgaları, kod-dondurma md5'i ile betiklerin şimdiki md5'i).
H5 Ölçüt hesabı: AAE / ortanca hata / %X < 0,3 sn gibi ölçütleri JamendoLyrics resmî tanımıyla (kelime başı,
ortalama mutlak hata, "percentage of correct onsets" tolerans 0,3 sn) kendi bağımsız kodumla 2–3 şarkıda yeniden
hesapla, önbellekteki emisyonlardan (cache/em/*.npz) kendi Viterbi'mle hizalayıp sonuçları karşılaştır.
H6 Vekil Türkçe set temsil gücü: sentez konuşma şarkı değildir (melisma, vibrato, uzayan ünlü yok); sonuçlar
iyimser olmalı. Yöntem: vekil üreticiyi oku; Dzhambazov (gerçek şarkı) sonuçlarıyla farkı karşılaştır.
H7 Karşı örnekler (kendi üretecim, aynı emisyonlar üzerinde metin bozma + ses düzenleme): tekrar eden nakarat,
eksik/fazla/yer değiştirmiş satır, [Nakarat]/(x2) işaretleri, TR–EN karışık, sayılar/kısaltmalar, uzun
enstrümantal giriş ve ara (sessizlik/enstrüman ekleyerek), hızlı söz (zaman sıkıştırma), uzatılmış ünlü
(melisma; zaman germe), gömülü vokal (SNR düşürme), düet/geri vokal (iki ses üst üste). Her birinde satır
başı hatası ve güven sinyalinin hatayı ayırt edip etmediği (AUC).
H8 Ürün: 366 MB / 1,8 GB tepe / 31 sn — bölümleyerek (ör. 30 sn pencereler) belleği düşürme; iş parçacığı
sayısını 1–2'ye indirip çalmayla çakışmayı (ses çıkışı ayrı iş parçacığı, CPU çekişmesi) ölçme; tract vs ort.
H9 Daha iyi seçenek: MMS-300M/1B forced aligner (lisans CC-BY-NC → elenir mi), wav2vec2 XLSR Türkçe ince ayarlı
modeller (Apache/MIT ama Common Voice CC0), Whisper (MIT, whisper.cpp MIT) + DTW, NeMo/Parakeet, Vosk Türkçe,
daha küçük modelin (ör. int8 dinamik, budama) doğruluk farkı; satır başı düzeltme (vokal başlangıcı), güven
ölçüsü yeniden tasarımı (normalize edilmiş log-olasılık farkı, serbest dekodlama ile karşılaştırma, satır süre
olasılığı).
H10 Plan: PR bölümü, model dağıtım yolu (kurulum / ayrı paket / isteğe bağlı indirme) ve "internet zorunlu değil"
kuralı; sahibine sorulacak kararların eksiksizliği.
