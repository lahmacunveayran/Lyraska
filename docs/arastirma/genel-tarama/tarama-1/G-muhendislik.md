# G. Mühendislik: gerçek zamanlı Rust ses, Tauri performansı, test, CI

Tarama 1, 6 Kasım 2026. İşaretler: **[birincil]** kaynak bu oturumda okundu; **[özet]** arama özeti; **[kod]** Lyraska'nın
kodunda bakıldı; **[tahmin]** çıkarımım. Lyraska'nın bu alanda zaten çok güçlü güvenceleri var (ses yolunda bellek ayırma
testi, Clippy ile unwrap/panic yasağı, ts-rs ile üretilen tipler, komut sözleşmesi denetimi, mutasyon ölçümü
`test-kalitesi/`). Bu dosya yalnızca **eksik kalan** yerleri ve dünyadaki iyi uygulamayla farkı yazıyor.

## 0. Kısa sonuç

1. **Doğrusu bilinmeyen analizi sınamanın yolu metamorfik testtir ve Lyraska'nın en büyük test açığı burada.** Beat, ton,
   bölüm, drop için gerçek şarkıda doğru cevap yok (ses depoya girmez); ama "girişi şöyle değiştirirsem çıkış şöyle
   değişmeli" ilişkileri doğrusuz da sınanabilir: sesi Δ kadar kaydır → vuruşlar Δ kayar; 44,1 ↔ 48 kHz → aynı BPM; ±6 dB
   → aynı vuruşlar ve ton; tersine kutup (polarite) → aynısı; MP3 128 kbps'e kodla → tempo aynı, vuruşların ≥ %95'i ±20
   ms; yarım ton yukarı perde kaydırma → ton bir yarım ton (Camelot +7) kayar. BILGI §5 metamorfik ilişkiyi kabul edilen
   beklenen değer kaynağı olarak sayıyor; ama analiz modüllerinde sistematik bir takım görmedim [kod: `analysis/` testleri
   sentetik doğrulu]. **Öneri G-1.**
2. **Bulanık sınama (fuzzing) yok** [kod: CI'da ve `Cargo.toml`'da fuzz/proptest yok]; Scorecard'ın açık "Fuzzing" maddesi
   de bu (ACIK-KONULAR). Dışarıdan gelen dosya ayrıştırıcıları (`.milk`, EEL, `.lrc`, şarkı haritası JSON'u, `.m3u8`,
   etiketler) tam bulanık sınama hedefi. **Öneri G-2.**
3. **Ses yolunda bellek ayırma yalnızca testte ölçülüyor** (`allocation-counter`, `ses_yolu_bellek_ayirmaz` [kod]).
   `assert_no_alloc` (Windfisch) gerçek çalmada, hata ayıklama derlemesinde ses iş parçacığına konan ayırıcı: ayırma olursa
   durdurur ya da uyarır [özet: docs.rs]. Testin kapsamadığı yollar (aygıt değişimi, nadir dal) için tamamlayıcı.
   **Öneri G-3** (yalnızca debug; sürümde yok).
4. **Ayar aktarımında yırtık okuma (torn read) ince bir nokta:** `peq.rs` ayarları atomiklerle yazıp sonra sürüm sayacını
   artırıyor; okuyucu sürümü tasarımdan **önce** okuyor (kod yorumunda gerekçesi var: değişiklik kaçırılmaz) [kod]. Yazma
   tam o anda sürerken okuyucu eski/yeni karışık bir filtre takımıyla bir geçiş (~40 ms) tasarlayabilir, sonra düzelir.
   Sonuç sınırlı (taşma koruması var, yumuşak geçiş var) ama kanıtlanmış değil. Seqlock (yazıcı önce tek, sonra çift
   sürüm; okuyucu tek ya da değişmiş sürümde bu turu atlar) bunu sıfırlar ve gerçek zamanlıda döngü gerektirmez
   [tahmin]. **Öneri G-4** (düşük öncelik, `loom` ile sınanır).
5. **Tauri IPC:** Lyraska ham dalga ve ince spektrumu zaten ham bayt (`tauri::ipc::Response`) ile gönderiyor; `visual_frame`
   her karede JSON [kod]. Üçüncü taraf bir ölçüm (tauri-conduit) 1 KB'ta JSON'lu `invoke`'u 8,1 µs, ham yolu 1,0 µs
   ölçüyor ve maliyetin %82'sinin JSON olduğunu söylüyor [özet; yöntem açıklanmamış]. 60 karede 0,5 ms/sn — önemsiz;
   değiştirmeye gerek yok, ama 144 Hz ve ağır sahnede ana iş parçacığındaki `JSON.parse` ölçülmeli.

## 1. Gerçek zamanlı ses güvenliği: dünyadaki kurallar ve Lyraska

| Kural (Bencina "Real-time audio programming 101: time waits for nothing", 2011 [bilgim]; Doumler, CppCon/ADC konuşmaları [bilgim]) | Lyraska                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geri çağrıda bellek ayırma yok                                                                                                     | CLAUDE.md kuralı + test [kod]                                                                                                                                    |
| Kilit bekleme yok; tek üretici–tek tüketici halka                                                                                  | `rtrb` [kod]                                                                                                                                                     |
| Dosya/ağ/günlük yok                                                                                                                | kural; günlük ayrı iş parçacığında [CLAUDE.md]                                                                                                                   |
| Ayarlar kilitsiz ve tutarlı                                                                                                        | atomik + sürüm sayacı; tutarlılık "yakınsak" (G-4)                                                                                                               |
| Serbest bırakma (drop) ses iş parçacığında olmasın                                                                                 | geçişte oturum kilit dışında hazırlanıyor (`transition.rs`) [kod]; ses iş parçacığında `Arc` son referansı düşürülüyor mu bakılmalı → `basedrop` deseni [tahmin] |
| İş parçacığı önceliği                                                                                                              | MMCSS "Pro Audio" (0.0.52) [ROADMAP]                                                                                                                             |
| Kayan noktada denormal sayılar                                                                                                     | Var: `biquad::flush` her doldurma turunda çok küçük süzgeç durumlarını sıfırlıyor ("işlemci denormal sayılarda çok yavaşlar") [kod: `biquad.rs` 926, `bass.rs`]  |

**Öneri G-5 (küçük, mevcut önlemin ölçümü):** denormal sınaması — 10 dakikalık sessizlik sonrası EQ + crossfeed + bas yolunun blok başına süresi;
ölçüt: sessizlikteki blok süresi müzikteki blok süresinin ≤ 1,5 katı.

## 2. Öneriler

- **G-1 Metamorfik takım (analiz).** Modüller: `analysis/beats.rs`, `tempo.rs`, `key.rs`, `structure.rs`,
  `fingerprint.rs`; test verisi sentetik + `tests/data/`. İlişkiler §0.1. Kapı ölçütleri: kaydırma için vuruşların
  ≥ %98'i Δ ± 2 ms; hız değişimi için BPM ± %0,5; düzey için vuruşların ≥ %99'u aynı; MP3 için ≥ %95 ±20 ms; perde için ton
  tam +1 yarım ton. Mutasyon ölçümüyle (cargo-mutants) yeni testlerin kaç bozmayı yakaladığı raporlanır. CPU: CI'da
  saniyeler (60 kare/sn karelerden ritim ~50 ms).
- **G-2 Bulanık sınama.** `cargo-fuzz` (libFuzzer; nightly ister) ya da kararlı Rust'ta `proptest` ile rastgele girdi;
  hedefler: `milkdrop/parse.rs`, `milkdrop/eel.rs`, `audio/lyrics.rs` (LRC + kodlamalar), `analysis/map_file.rs`,
  `library/playlist_file.rs`. Ölçüt: her hedefte 10 dakikada çökme/sonsuz döngü/bellek patlaması yok; bulunan her girdi
  kalıcı teste dönüşür. CI'da günlük 5 dk'lık ayrı iş (PR'ı yavaşlatmaz).
- **G-3 `assert_no_alloc` hata ayıklama derlemesinde** (lisansı eklemeden önce doğrulanır; yalnızca `debug_assertions`).
- **G-4 Seqlock + `loom`** (`audio/peq.rs`, `eq.rs`, `crossfeed.rs`, `normalize.rs`'in ayar blokları).
- **G-6 Performans gerilemesi:** analiz süresi (şarkı başına) ve ses yolu süresi (blok başına) için CI'da kaba sınır;
  bugün yalnızca yerel araçlarla ölçülüyor (ROADMAP). Köy işinin "gerçek zamanın ~195 katı" değeri temel çizgi.
- **G-7 Model çalıştırma kararı:** tract (saf Rust, CPU) ile ONNX Runtime (`ort` crate, MIT; CUDA) arasında karar B dosyası
  §3'teki ölçümle; Beat This ve söz modeli tract'ta kalabilir, ağır ayrıştırma için ORT isteğe bağlı.

## 3. Mevcut kararlarda gördüğüm sorunlar

1. **Kalite hedeflerinin üçü CI'da değil** (F-ölçüsü, 60 fps, takılmasızlık; ROADMAP). F-ölçüsü için Beat This'i vekil
   doğru olarak kullanmak (A dosyası §7) ilk kez gerçek müzikte sayı verir; CI'da ses olmadığı için yerel kalır, ama
   metamorfik takım (G-1) CI'da gerilemeyi yakalar.
2. **"Stryker kullanılamıyor"** (BILGI §4) → arayüz mutasyonu elle; bu doğru bir çözüm. Ek olarak arayüzün saf hesap
   dosyalarında (`lib/*.ts`) özellik tabanlı test için `fast-check` (MIT) düşünülebilir [bilgim].
