# Yeni oturum için devir istemi (30 Ekim 2026)

Bu oturumdan itibaren iş proje sahibinin kendi bilgisayarında sürer (Windows, RTX 4050). Buluttan Remote Control
Windows'ta çalışmadığı için Claude masaüstü uygulamasında **Code** sekmesinden **Lyraska** klasöründe (GitHub
Desktop'ın indirdiği klasör: `Documents\GitHub\Lyraska`) yeni bir oturum açılır ve aşağıdaki metin yapıştırılır.
Önceki istem (29 Ekim, bulut) git geçmişinde.

---

Lyraska'da önceki oturum 30 Ekim 2026'da bulutta bitti; bu oturum benim Windows bilgisayarımda. Kaldığın yerden devam et.

1. Önce şunları sırayla oku: `CLAUDE.md`, `docs/BILGI-BIRIKIMI.md`, `docs/ACIK-KONULAR.md`,
   `docs/devlog/2026-10-29-2.md` (30 Ekim oturumunun notu), `docs/arastirma/soz-hizalama/README.md`.
2. Benimle çalışma kuralların (değişmez):
   - Her zaman Türkçe, sade, adım adım. Ben yazılımcı değilim; bana yalnızca düğmeye basmak düşer (hangi sayfada /
     pencerede hangi düğme, tam yaz). Kurulumları ve komutları sen yaparsın; ben onay pencerelerine izin veririm.
   - Kullanım limitim az: aynı anda **tek ajan**; küçük işi ajansız yap; gereksiz bekleme yok.
   - **Mevcut testleri asla silme, atlama, gevşetme.** Yeni test yanlışsa düzelt ve nedenini söyle; mevcut bir test
     bozulursa değiştirmeden önce hangisi ve neden, bana söyle.
   - Ürün ve görsel kararları bana seçenek + önerinle sor; görsel işi önce önizleme videosuyla göster.
   - Küçük PR; her büyük işi bağımsız bir ajana incelet (inceleyen kendi karşı örnek üretecini yazsın), bulguları
     önce testle yakalayıp düzelt. PR'ları ben birleştiririm. `main`'e push yok; kendi dalında çalış. Yarım kalan iş
     oturum kapanmadan `-yedek-` adlı bir dala gönderilsin.
   - Tahminle değil ölçerek çalış: doğrusu bilinen deneme seti, geliştirme/doğrulama/son sınama ayrı, eskiyle yan
     yana tablo; Türk müziği sette mutlaka olsun.
   - İkinci beyni (BILGI-BIRIKIMI, ACIK-KONULAR) ve devir notunu her PR'da güncel tut.
3. **İlk iş: bilgisayarı geliştirmeye hazırla** (kendin kur, bana yalnızca izin pencereleri düşsün): Git (GitHub
   Desktop kurulu), Rust (rustup, `rust-toolchain.toml`'daki sürüm), Node.js (`.nvmrc`'deki sürüm),
   Visual Studio Build Tools (C++ masaüstü iş yükü), WebView2 (Windows 11'de var). Sonra `npm ci`, `npm run check`,
   `cd src-tauri && cargo test`. Bir sorun çıkarsa nedenini ve ne yaptığını bana kısaca yaz.
4. **Sıradaki iş: sözlerin sese otomatik oturtulması** (ACIK-KONULAR 1). Birleşenler: sözün hazırlığı
   (`analysis/lyrics_text.rs`), hizalayıcı (`lyrics_align.rs`); PR'da ya da birleşmiş: model çalıştırıcı
   (`lyrics_model.rs`, deneme aracı `examples/soz_hizalama.rs`). Kalanlar sırayla (`denetim/DENETIM.md` §10):
   - **Windows'ta hız ölçümü (önce bu, bu bilgisayarda yapılabiliyor):** modeli indir (k2-fsa/sherpa-onnx GitHub
     sürümü `asr-models`, dosya `sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-v2-int8-2026-02-05`; özetler
     `lyrics_model.rs`'teki `MODEL_SHA256`, `TOKENS_SHA256` ile aynı olmalı; depoya koyma), sonra
     `cargo run --release --example soz_hizalama -- <model klasörü> --sessiz 240` ve bir şarkıyla uçtan uca. Bulut
     sunucusunda 183 sn'lik şarkı 87 sn sürdü (iki iş parçacığı). İş parçacığı sayısını (`THREADS`) ölçüme göre seç.
   - Emisyon önbelleği (f16, yalnızca sözü olan şarkılar) + arka plan işi (düşük öncelik, iptal, süre/boyut ön
     denetimi; `analysis/background.rs` deseni).
   - "Söz paketi": sürüm sayfasında ayrı dosya, programda "Dosyadan ekle" (programa ağ kodu girmez; benim kararım).
   - Arayüz: emin olunmayan satır soluk + "tahmini", şarkı oturmadıysa uyarı (benim kararım); önce bana önizleme.
   - Benim denemem: 5–10 Türk pop / arabesk / rap şarkısında kayan satırları söylerim.
5. Sonra ACIK-KONULAR'daki sıra: "Kendi resmin" güvenli modda kırmızı resim, ses motoru denetimi, görev kitabı
   çelişkileri, Spleeter–Demucs, sahneler v2 (yeni fikir önce bana önizlemeyle), drop v2 (karar B).
6. Bu bilgisayarda yapabildiklerini kullan: programı gerçekten çalıştırıp dene (`npm run tauri dev`), Windows'a
   özel kodu ve gerçek ses aygıtını (`examples/ses_denemesi.rs`) dene, sahnelerin akıcılığını ölç. Sonuçları
   `docs/DOGRULAMA.md`'ye yaz.

---
