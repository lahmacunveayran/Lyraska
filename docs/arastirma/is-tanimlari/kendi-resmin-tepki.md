# "Kendi resmin" çubuklarının tepkisi — iş tanımı (araştırma + uygulama)

Proje sahibi (29 Ekim 2026): "Daha tepkisel... bizimkinde bazı yerler oynamıyor, bunda gelen bir tepki var, biraz pasif
kalmış. Sanki şarkıya daha da uyumlu, o ruhu, notaları hissettiriyor." Sonra: "Gerekirse baştan kur, üstün, nihai bir
mühendislik ve matematiksel çözüm istiyorum."

## Malzeme

- Önceki ters mühendislik: `docs/arastirma/kendi-resmin/README.md` ve betikleri (aynı klasör). Sonuç: doğrusal 20 Hz–2 kHz
  eksen, tek frekans okuma, 4096 Hann, doğrusal genlik, ağırlık yok, sönme ≤ 20 ms; aynı sesle havuz ilintisi ~0,9.
  Uygulaması: `src-tauri/src/audio/spectrum.rs` (200 çubuk), `src/lib/spectrumBars.ts`, `src/components/PhotoScene.tsx`,
  `src/lib/photoScene.ts` (geometri, güvenli mod parlama modeli — dokunurken dikkat).
- Örnek videolar (sesli; kayıt kenarlarında boşluk var, video alanı 2168×1220 civarı):
  `/root/.claude/uploads/9835f28f-d1ce-5ff7-89cd-1c5dc1aa8e06/ade1f17f-Screenrecorder-2026-10-24-14-22-57-575.mp4` (a,
  Flying High 0:38–0:42), `.../cfbbbc1b-...-14-23-18-239.mp4` (b, Moonlight Shadow; ikinci yarısında YouTube arayüzü
  üstte — maskele ya da o kareleri at), `.../3d4c7fea-...-17-51-22-222.mp4` (c, Moonlight Shadow 0:20–0:23).
- **Yeni:** sahibinin Lyraska'dan kaydı (Windows, 1920×1080, 60 fps, sesli, 4,4 sn; Flying High 0:24–0:27, dosya adı
  "DCX - Flying High (DJ Splash Remix) - Hoang Giang Pham (128K)" — 128 kbps kopya):
  `/root/.claude/uploads/9835f28f-d1ce-5ff7-89cd-1c5dc1aa8e06/b0fdf588-2026-10-29_12-48-05_online-video-cutter.com.mp4`.
  Pencere başlık çubuğu ve görev çubuğu var; çizgi y≈534.
- Benim kaba ölçümüm (`/tmp/claude-0/-home-user-Lyraska/9835f28f-d1ce-5ff7-89cd-1c5dc1aa8e06/scratchpad/ref/prof.py`,
  medyandan sapan piksel, 10 dilim): soldan sağa "hareketli kare %": bizim 60 26 10 1 3 2 1 1 9 21; örnek a 62 34 29 14 6
  7 5 2 10 28; örnek c 31 15 15 21 18 12 14 10 16 23. Orta bölge bizde 2–10 kat ölü. DİKKAT: şarkının farklı anları;
  kesin sonuç değil.

## Yapılacaklar

### 1. Teşhis (önce bu; tahmin değil ölçüm)

- Sahibinin kaydında çubuk boylarını çubuk çubuk ölç (önceki betiklerin `olc.py` yolu). Kaydın sesini (sistem sesi;
  eşitleme sonrası olabilir — ölç) `spectrum.rs` modelinden geçir: uygulama modeli doğru mu uyguluyor (ilinti, eğim,
  gecikme, kare düşmesi, −14 LUFS kazancı gerçekten uygulanıyor mu — eşitleme ayarı kapalıyken ne oluyor, analiz
  bitmeden ne oluyor; `player.rs` `visual_spectrum`, `spectrum_at`, `waveform.rs`)? Uygulama hatası varsa bul ve kanıtla.
- Aynı şarkının iki farklı anı olduğu için: örnek a'nın sesini ve sahibinin kaydının sesini aynı modelden geçirip
  bölge bölge enerji karşılaştır (o bölümde orta sesler gerçekten az mı?).
- Sonuç: pasifliğin kök nedeni(leri), sayılarla.

### 2. Model (gerekirse baştan)

Hedef yalnızca örneği taklit değil: **şarkıyı hissettiren** çubuklar — her bölge müzikte bir şey olunca oynar, notalar
ve vuruşlar görünür, sessizlik sakin kalır; bas soldaki vuruşları göstermeye devam eder (sahibi örneğin bu yanını
seviyor). Matematiksel olarak gerekçelendir ve ölç. Düşünülecekler (seç, ölçerek karar ver):

- Frekans ekseni ve çözünürlük (doğrusal / logaritmik / karma; bas çubuk sayısı), sabit-Q ya da çok çözünürlüklü
  pencere (bas için uzun, orta/tiz için kısa pencere: zamanda keskinlik).
- Bant başına uyarlanır kazanç / beyazlatma (uzun vadeli bant ortalamasına göre normalize; yavaş AGC) — orta ve tiz
  bölgelerin "ölü" kalmamasının ilkeli yolu; sessizlikte gürültüyü büyütmemek için taban (ses yüksekliği kapısı).
- Genlik eğrisi (doğrusal / güç / sıkıştırma), başlangıç vurgusu (spectral flux: nota ve vuruş anında sıçrama),
  saldırı/sönme zarfları, komşu çubuk yumuşatması.
- Metrikler (tanımla, uygula, raporla): bölge başına hareketlilik dağılımının düzgünlüğü, beat/onset ile ilinti
  (projede beat analizi var: `analysis/`), sessizlikte durgunluk, örnek videolarla ilinti (eski model ile yeni model
  yan yana — örneğe benzerlik kaybını sayıyla göster), şarkılar arası kararlılık (sentetik test sesleri:
  `src-tauri/tests/data/`; telifli ses depoya girmez).
- Gerçek zamanlı kısıtlar: komut iş parçacığında, ses yoluna dokunmadan; `visual_spectrum` her karede çağrılıyor —
  maliyeti ölç (ms). Ses çıkış yolunda bellek ayırma yok kuralı geçerli.
- Güvenli mod: `photoScene.ts`'in güvenli moddaki parlama sınırları (çubuk boyu üst sınırı, değişim payı) aynen
  korunmalı; mevcut güvenli mod testleri ve `check:scenes` photo denetimleri geçmeli.

### 3. Uygulama

- Rust (`spectrum.rs` + gerekiyorsa player) ve arayüz (`spectrumBars.ts`); testler: bilinen sentetik sinyallerle
  (sinüs → doğru çubuk, vuruş → başlangıç sıçraması, sessizlik → durgun, uyarlanır kazanç sınırları), Vitest ve cargo.
  Analiz önbelleğine dokunmuyorsa sürüm artmaz (bu canlı spektrum; önbellekte değil — doğrula).
- `docs/arastirma/kendi-resmin/` altına yeni bölüm/dosya: teşhis, model, metrikler, kararlar; betikler orada.
- Önizleme: sahibinin kaydının sesiyle (ve örnek a'nın sesiyle) eski model / yeni model yan yana video (1280×720,
  30 fps, sesli; aynı resim ya da kayıttaki görüntüye benzer koyu kırmızı bir zemin — telifli resim kullanma) +
  bölge hareketliliği grafiği. Dosyalar: `/tmp/claude-0/-home-user-Lyraska/9835f28f-d1ce-5ff7-89cd-1c5dc1aa8e06/scratchpad/foto-tepki/`.
  (Bu önizleme videoları sahibine gösterilecek, depoya girmez; içlerindeki ses sahibinin şarkısı: depoya, docs'a koyma.)

## Kurallar

- Çalışma kopyası: `/tmp/claude-0/wt-foto` (dal `foto-sanatci`; önce `git log` — üstünde başka commit'ler olabilir; yeni
  commit'lerini en üste ekle, dal değiştirme). `node_modules` sembolik bağ, commit etme.
- CLAUDE.md'yi oku ve uy. Mevcut testleri silme, atlama, gevşetme; bir mevcut test bozulursa (ör. spectrum.rs'in eski
  modeli sabitleyen testleri) DEĞİŞTİRME — hangisi, neden, ne olması gerektiğini raporla; o kısmı ayrı commit'e bırak
  ya da onay bekleyen bir yama dosyası olarak scratchpad'e koy.
- Sürüm ve devlog'a dokunma. Push yok, PR yok. Commit sonu:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MSR815DdatTxFiKf1jVGuf
- Kapılar: `npm run check`; `npm run build` + `npm run check:scenes`; `cd src-tauri && cargo fmt --check`, `cargo clippy
--all-targets -- -D warnings` (yerel ve `--target x86_64-pc-windows-gnu`), tam `cargo test`. Ortam:
  `CARGO_TARGET_DIR=/home/user/Lyraska/src-tauri/target CARGO_INCREMENTAL=0`. Disk sınırlı: "No space left" olursa
  `/home/user/Lyraska/src-tauri/target/debug` altında 1 saatten eski dosyaları sil.

## Rapor

Kök neden(ler), seçilen model ve gerekçesi, metrik tablosu (eski/yeni/örnek), commit'ler, kapılar, bozulan mevcut
testler (varsa), önizleme dosyalarının tam yolları, açık sorular.
