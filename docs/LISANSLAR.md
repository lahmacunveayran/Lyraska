# Dışarıdan alınan varlıklar ve lisansları

Programa kod dışında eklenen veri ve varlıkların (yazı tipleri, profiller, görseller) kaynağı ve lisansı burada
kayıtlıdır. Her yeni varlığın lisansı eklenmeden önce doğrulanır ve buraya yazılır (bkz. `CLAUDE.md`, lisans
kuralları). Kod bağımlılıklarının lisanslarını CI denetler (`npm run check:licenses`, `cargo deny`).

## Kod bağımlılıklarının bildirimleri (üçüncü taraf lisansları)

- **Ne için:** programa giren açık kaynak kütüphanelerin (Rust crate'leri: symphonia, rubato, rusqlite, tauri vb.;
  npm: React, Tauri API, Inter) lisansları MIT, BSD, Apache-2.0, ISC gibi lisanslardır; bunlar ikili dağıtımda
  telif ve izin metninin verilmesini şart koşar.
- **Dosya:** `public/lisanslar/UCUNCU-TARAF.txt` programla paketlenir; Ayarlar > Lisanslar'dan açılır. Her paket
  için ad, sürüm, lisans ifadesi, kaynak deposu ve telif satırları; sonda bütün lisans metinleri (aynı metin tek
  kez).
- **Üretim:** `npm run notices` (`scripts/third-party-notices.mjs`). Rust tarafı Windows hedefinde çalıştırılabilir
  dosyaya giren crate'lerdir (`cargo tree`, yalnızca normal bağımlılıklar; derleme betikleri ve proc-macro'lar
  programa girmediği için hariç); metinler crate'in kendi paketinden (`~/.cargo/registry/cache`) okunur. npm tarafı
  `package-lock.json`'daki dev olmayan paketlerdir. Çıktı belirlenimcidir; CI `npm run check:notices` ile
  depodakiyle karşılaştırır.
- **Sınır:** lisans dosyası taşımayan birkaç crate (ör. `realfft`, `webview2-com`) için lisans ifadesi ve kaynak
  deposu yazılır; metin aynı deponun başka paketindeyse ona yollanır.

## Inter yazı tipi

- **Ne için:** arayüzün yazı tipi (başlıklar, düğmeler, paneller). Büyük boyutlarda yazı tipinin "Display"
  kesimi (optik boyut ekseni) kendiliğinden devreye girer.
- **Kaynak:** The Inter Project Authors, <https://github.com/rsms/inter>
- **Paket:** `@fontsource-variable/inter` 5.3.0 (npm). Yalnızca `opsz.css` kullanılır: düz stil, ağırlık ve
  optik boyut eksenleri. Yazı tipi dosyaları programın içine paketlenir; çalışırken internete bağlanılmaz.
- **Lisans:** SIL Open Font License 1.1 (OFL-1.1). Ticari kullanıma açıktır. Yazı tipi programla birlikte
  dağıtılabilir; tek başına satılamaz. Inter'in ayrılmış yazı tipi adı (Reserved Font Name) yoktur. Lyraska,
  Fontsource'un alt kümelere ayrılmış woff2 dosyalarını olduğu gibi kullanır.
- **Lisans metni:** programla birlikte dağıtılır: `public/lisanslar/Inter-OFL-1.1.txt` (paketteki `LICENSE`
  dosyasının kopyası).
- **Doğrulama ve onay:** paketin `package.json` lisans alanı ve `LICENSE` dosyası OFL-1.1; AGPL ya da ticari
  kullanım yasağı yok. OFL-1.1 izin listesinde olmadığı için proje sahibine soruldu, 8 Ekim 2026'da onaylandı;
  `src-tauri/deny.toml` izin listesine eklendi.

## Bricolage Grotesque ve JetBrains Mono yazı tipleri

- **Ne için:** kütüphanenin büyük başlıkları (Bricolage Grotesque; proje sahibi bağımsız denetçinin dört önerisi
  arasından seçti, 23 Ekim 2026) ve listedeki sayılar (JetBrains Mono: tempo, süre, sayaçlar).
- **Kaynak:** The Bricolage Grotesque Project Authors, <https://github.com/ateliertriay/bricolage>; The JetBrains
  Mono Project Authors, <https://github.com/JetBrains/JetBrainsMono>
- **Paket:** `@fontsource-variable/bricolage-grotesque` 5.3.0 (`standard.css`: ağırlık, genişlik, optik boyut) ve
  `@fontsource/jetbrains-mono` 5.3.0 (yalnızca 400, latin ve latin-ext). Dosyalar programın içine paketlenir;
  çalışırken internete bağlanılmaz.
- **Lisans:** SIL Open Font License 1.1 (OFL-1.1); paketlerin `package.json` lisans alanı ve `LICENSE` dosyası
  denetlendi. Ayrılmış yazı tipi adı (Reserved Font Name) yok; dosyalar değiştirilmeden kullanılır.
- **Lisans metni:** `public/lisanslar/BricolageGrotesque-OFL-1.1.txt`, `public/lisanslar/JetBrainsMono-OFL-1.1.txt`.

## Michroma yazı tipi

- **Ne için:** "Kendi resmin" sahnesinde şarkının adı ve süre (geniş, köşeli harfler; proje sahibinin gönderdiği
  örnek görünüme en yakın serbest yazı tipi, 24 Ekim 2026).
- **Kaynak:** The Michroma Project Authors, <https://github.com/googlefonts/Michroma-font>
- **Paket:** `@fontsource/michroma` 5.3.0 (yalnızca 400, latin ve latin-ext: Türkçe harfler dahil). Dosyalar
  programın içine paketlenir; çalışırken internete bağlanılmaz.
- **Lisans:** SIL Open Font License 1.1 (OFL-1.1); paketin `package.json` lisans alanı ve `LICENSE` dosyası
  denetlendi. Ayrılmış yazı tipi adı (Reserved Font Name) yok; dosyalar değiştirilmeden kullanılır.
- **Lisans metni:** `public/lisanslar/Michroma-OFL-1.1.txt`.

## Yıldız atlası: HYG kataloğu ve Stellarium takımyıldız çizgileri

- **Ne için:** Sanatçılar görünümünde her sanatçının "basılı yıldız atlası levhası" (adı gökyüzünde sabit bir yere
  düşer; o yerin gerçek yıldızları ve takımyıldız çizgileri çizilir).
- **Kaynaklar:**
  - **HYG yıldız kataloğu v4.0**, David Nash (astronexus), <https://github.com/astronexus/HYG-Database>
    (`hyg/CURRENT/hygdata_v40.csv.gz`; açılmış CSV'nin SHA-256'sı
    `80152c797783b53449458b675eee65656f1404225481e766f8dab21c00ad3c69`).
  - **Stellarium "modern" gök kültürü** (IAU takımyıldızlarının çizgileri), Stellarium geliştiricileri,
    <https://github.com/Stellarium/stellarium> (`skycultures/modern/index.json`, commit `ad4960210accd4e8ec2178e36db9cd570e6d5084`;
    SHA-256 `1f2f5ffd6c9e25a7d0dcfdbf1f756e2db03dd3b8ed4ec016a2839b09f6b0fe1e`). Yalnızca çizgiler (HIP numaraları) alınır; çizimler (Free Art License) alınmaz.
- **Lisans:** ikisi de **CC BY-SA 4.0** (HYG deposunun `LICENSE`'ı; Stellarium'da `description.md`: "Text and data:
  CC BY-SA 4.0"). CC BY-SA 4.0 GPL-3.0 ile tek yönlü uyumludur. Proje sahibi atıfla kullanımı onayladı (23 Ekim 2026).
- **Lyraska'daki hali:** `src/lib/starAtlas.json`, `scripts/build-star-atlas.mjs` ile üretilir: çıplak göze görünen
  8 920 yıldız (V ≤ 6,5; konum, kadir, HIP) ve 88 takımyıldızın çizgileri. Bu türetilmiş veri de **CC BY-SA 4.0**
  altındadır; ham dosyalar depoya girmez.
- **Lisans metni:** `public/lisanslar/CC-BY-SA-4.0.txt` (SPDX lisans listesindeki metin). Atıf, değişiklik notu ve
  lisans metni programın içinde de görünür: Ayarlar → Lisanslar → `UCUNCU-TARAF.txt` ("GÖMÜLÜ VERİ" bölümü).

## MilkDrop sahnesi: Butterchurn ve kullanıcının kendi görselleri

- **Ne için:** galerideki MilkDrop sahnesi kullanıcının kendi `.milk` dosyalarını (MilkDrop görselleri,
  "preset") Butterchurn ile çizer.
- **Butterchurn** 3.0.0-beta.5 (npm, sürüm tam sabit): Jordan Berg, <https://github.com/jberg/butterchurn>,
  **MIT** ("Copyright (c) 2013-2018 Jordan Berg", paketteki `LICENSE`). Çalışma zamanı bağımlılıkları:
  - `eel-wasm` 0.0.16, <https://github.com/captbaritone/eel-wasm>: **MIT** (yalnızca `package.json` lisans alanı;
    pakette ve depoda `LICENSE` dosyası yok). Bildirim dosyasına lisans ifadesi ve kaynak deposu yazılır.
  - `@assemblyscript/loader` 0.17.14, <https://github.com/AssemblyScript/assemblyscript>: **Apache-2.0** (paket
    lisans ve `NOTICE` dosyası taşımıyor; Apache-2.0 metni bildirim dosyasında başka paketler için zaten var).
  - `ecma-proposal-math-extensions` 0.0.2, <https://github.com/tc39/proposal-math-extensions>: **MIT** (yalnızca
    `package.json`; global `Math`'e `clamp` vb. ekler).
    Dördü de izin listesinde; AGPL ya da ticari kullanım yasağı yok. `npm run notices` bildirimleri üretir.
- **Güvenlik:** Butterchurn yalnızca WebAssembly yoluyla kullanılır (`onlyUseWASM: true`); pakette 8 `new Function`
  vardır, hepsi bu ayarla hiç çağrılmayan `loadJSPreset` içindedir. CSP'ye yalnızca `'wasm-unsafe-eval'` eklendi
  (`'unsafe-eval'` yok); sahne denetimi programı bu CSP ile gerçek tarayıcıda çalıştırır.
- **Hazır görsel (preset) dağıtılmaz.** Yaygın paketlerin (`butterchurn-presets`, projectM "Cream of the Crop" vb.)
  yüzlerce yazarı lisans vermemiştir; paketleyicinin MIT'i yazarların eserlerini kapsamaz. Bu yüzden
  `butterchurn-presets` projeye eklenmez (otomatik lisans denetimi paketin "MIT" alanı yüzünden onu geçirirdi).
  Kullanıcı kendi bilgisayarındaki klasörü seçer; dosyalar kopyalanmaz, saklanmaz, yalnızca klasörün yolu ayarlarda
  hatırlanır. Arayüz "Lyraska hazır görsel içermez" der.
- **`.milk` → Butterchurn çevirisi** (`src-tauri/src/milkdrop/parse.rs`): anahtar eşlemesi ve varsayılanlar
  `milkdrop-preset-utils` 0.2.1'den (Jordan Berg, <https://github.com/jberg/milkdrop-preset-utils>, **MIT**,
  "Copyright (c) 2018") uyarlanmıştır; kod Rust'ta yeniden yazıldı, paket bağımlılık olarak eklenmedi. MIT bildirimi:

  > Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
  > documentation files (the "Software"), to deal in the Software without restriction, including without
  > limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
  > Software, and to permit persons to whom the Software is furnished to do so, subject to the following
  > conditions: The above copyright notice and this permission notice shall be included in all copies or
  > substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

- **Deneme presetleri:** `src-tauri/tests/data/milkdrop/lyraska-*.milk` (ve onlardan üretilen `.json`) bu proje için
  yazıldı (GPL-3.0); yalnızca testlerde ve sahne denetiminde kullanılır, programla dağıtılmaz. Ölçümün parlamayı
  gördüğünü kanıtlamak için **bilerek parlar** (saniyede dört kez tersine dönme; `lyraska-golge` HLSL gölgelendiricisi
  ekranın yarısını saniyede dört kez beyaza çakar). `milkdrop/shader.rs` testlerindeki HLSL parçaları da özgündür.

## MilkDrop gölgelendirici çeviricisi (HLSL → GLSL)

- **Ne için:** MilkDrop 2 presetlerinin HLSL gölgelendiricilerini Butterchurn'ün GLSL ES 3.00 biçimine çevirmek
  (`src-tauri/src/milkdrop/shader.rs`). Çevirici WebAssembly'dir (`src-tauri/hlsl/hlslparser.wasm`), programın
  içine gömülür ve Rust'ta `wasmi` ile kum havuzunda çalışır.
- **hlslparser**, projectM'in çatalı: <https://github.com/projectM-visualizer/projectm/tree/master/vendor/hlslparser>,
  commit `349b7cc2db312d47cef6be24c6856ced6643a385` (10 Ekim 2026). Klasörün kendi `LICENSE`'ı **MIT**, "Copyright
  (c) 2013-2014 Unknown Worlds Entertainment, Inc." (üst kaynak Thekla/hlslparser ve Unknown Worlds'ün aynı MIT
  bildirimi); metin `src-tauri/vendor/hlslparser/LICENSE`. projectM'in geri kalanı LGPL-2.1-or-later'dır; ekibin bu
  klasördeki değişiklikleri hangi lisansla geldiği belirsiz, iki durumda da GPL-3.0-only ile uyumlu (LGPL kaynağı
  zaten depoda). Lyraska'nın yaması küçük ve `LYRASKA` yorumlu (`Engine.cpp`).
- **wasi-sdk 30.0** (<https://github.com/WebAssembly/wasi-sdk>, araç: Apache-2.0 WITH LLVM-exception) yalnızca derleme
  aracıdır; `.wasm`'a giren kitaplıkları: **wasi-libc** (Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR **MIT**;
  içindeki musl MIT "Copyright © 2005-2020 Rich Felker, et al.", cloudlibc BSD-2-Clause "Copyright (c) 2015-2017
  Nuxi", dlmalloc CC0) ve **libc++/libc++abi** (LLVM, Apache-2.0 WITH LLVM-exception). Metinler
  `src-tauri/hlsl/lisanslar/` altında (wasi-libc `wasi-sdk-30` etiketinden, libc++ `llvmorg-21.1.0`'dan).
- **wasmi** 2.0.0 (crates.io, <https://github.com/wasmi-labs/wasmi>): **MIT OR Apache-2.0**; bağımlılıkları
  `wasmparser` 0.228 (Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT), `spin`, `libm`, `hashbrown`,
  `foldhash`, `string-interner` (MIT ya da MIT/Apache-2.0). Hepsi `deny.toml` izin listesinde; `cargo deny` denetler.
- **Hazırlık kodu** (`shader.rs`'te `prepare`/`PREAMBLE` ve Butterchurn biçimine getirme): `milkdrop-preset-utils`
  0.2.1'in `prepareShader` ve `processUnOptimizedShader` işlevlerinden (yukarıdaki MIT bildirimi) uyarlandı; Rust'ta
  yeniden yazıldı.
- Bildirimler: `npm run notices` bu üç gömülü kitaplığı (hlslparser, wasi-libc, libc++) `UCUNCU-TARAF.txt`'e "Gömülü
  C/C++ kütüphaneleri" başlığıyla ekler; metinler depodaki dosyalardan okunur.
- **AGPL ya da ticari kullanım yasağı yok.** projectM'in preset setleri **kullanılmadı ve dağıtılmaz**; çeviri oranı
  yalnızca geliştiricinin bilgisayarında ölçüldü (bkz. ROADMAP).

## Ton profilleri (Krumhansl ve Kessler, 1982)

- **Ne için:** ton tespiti (`src-tauri/src/analysis/key.rs`): her tonda 12 perdenin ne kadar "yerinde" duyulduğunu
  gösteren 24 sayılık iki profil (majör ve minör).
- **Kaynak:** C. L. Krumhansl ve E. J. Kessler, "Tracing the dynamic changes in perceived tonal organization in a
  spatial representation of musical keys", _Psychological Review_ 89 (1982). Sayılar dinleyici deneylerinin
  yayımlanmış sonuçlarıdır.
- **Lisans:** yayımlanmış ölçüm sonuçları (bilimsel olgu); bir kod, veri seti ya da model dosyası alınmadı. Lisans
  gerektirmez; kaynak burada ve kodda belirtilir.

## Programa girmeyen araştırma dosyaları

### LAME 3.100 ölçüm yaması

- **Ne için:** Veritas araştırmasında kodlayıcının nicemlediği katsayıları ölçmek
  ([VERITAS.md](VERITAS.md), [arastirma/veritas/](arastirma/veritas/)).
- **Dosya:** `docs/arastirma/veritas/lame-3.100-veritas-dump.patch`. LAME kodu depoya girmez; yama yalnızca
  `libmp3lame/encoder.c`'nin birkaç bağlam satırını içerir. Yamalı LAME depo dışında, yalnızca ölçüm için derlenir;
  programla derlenmez, paketlenmez, dağıtılmaz.
- **Kaynak:** The LAME Project, <https://lame.sourceforge.io> (`lame-3.100.tar.gz`, sha256
  `ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e`)
- **Lisans:** GNU LGPL 2.0 ya da sonrası (`COPYING`: Library General Public License, Version 2; dosya başlıkları "or
  (at your option) any later version"). GPL-3.0 projeyle uyumlu; AGPL ya da ticari kullanım yasağı yok.

### R1 deney müziği ve algısal ölçü

- **Ne için:** Veritas R1 ölçümleri (gerçek enstrüman örnekleriyle çalınan deney müziği; algısal kalite ölçüsü).
  Programa girmez, dağıtılmaz; çalışma klasöründe kurulur ve üretilir.
- **FluidR3_GM ses bankası:** Frank Wen ve katkıda bulunanlar; Ubuntu paketi `fluid-soundfont-gm` 3.1. Lisans: MIT
  (paketin `copyright` dosyası: "I hereby release Fluid under the MIT license"). Parçalar `beste.py` ile programla
  yazılır; hiçbir hazır şarkı kullanılmaz.
- **FluidSynth:** Ubuntu paketi `fluidsynth` 2.3.4; LGPL-2.1 ya da sonrası. Yalnızca çalıştırılır.
- **Zimtohrli:** Google, PyPI `zimtohrli` 0.2.1; Apache-2.0 (kaynak dosya başlığı). Yalnızca ölçüm için.

### R2 öğrenmeli önsel araştırması

- **Ne için:** Veritas R2 ([VERITAS.md](VERITAS.md) bölüm 8): delik katsayıları için koşullu yoğunluk ve akış
  örnekleyici eğitimi. Programa girmez, dağıtılmaz; yalnızca araştırma betiklerinde (`r2_model.py`,
  `r2_degerlendir.py`) kullanılır.
- **PyTorch:** PyPI `torch` 2.14.1 (işlemci kullanımı); lisans BSD-3-Clause (`LICENSE`), paket üst verisi bileşenler
  için Apache-2.0, MIT, BSD-2-Clause ve BSL-1.0 da sayar. AGPL ya da ticari kullanım yasağı yok.
- **Eğitim müziği:** `r2_beste.py` ile programla yazılan rastgele parçalar, yine FluidR3_GM (MIT) ile çalınır. Hazır
  şarkı, MUSDB18, MoisesDB ya da telifli kayıt kullanılmadı. Eğitilen ağırlıklar depoya konmadı (kapı geçilmedi).
