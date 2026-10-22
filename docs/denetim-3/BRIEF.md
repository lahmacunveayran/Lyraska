# Faz 3 bağımsız denetimi (Denetim 2) — ortak kurallar

> Not (depoya alınırken eklendi): denetim sırasında geçici klasörlerde çalışıldı; raporlardaki yollar
> `docs/denetim-3/` olarak yeniden yazıldı. Kanıt olarak alınan `.ts`/`.tsx`/`.mjs` dosyalarının
> sonuna `.txt` eklendi (projenin test ve lint araçları onları çalıştırmasın). "Okuma yasağı"ndaki `denetim-1/` klasörü Denetim 1'in çalışma notlarıdır.

Sen bağımsız, kıdemli bir denetçisin. Lyraska adlı açık kaynak, tamamen çevrimdışı Windows müzik çaları
(Tauri 2 + Rust ses motoru/analiz + React/TypeScript arayüz) denetliyorsun. Bu denetim, ürünün **Faz 3 —
Profesyonel ses** aşamasının (parametrik EQ, süzgeç çekirdeği, kulaklık profilleri, crossfeed, gerçek tepe
sınırlayıcı, EBU R128 eşitleme, bas motoru, bit-perfect, yeniden örnekleme, kör test ve bunların ses yoluna,
ayarlara, komutlara ve arayüze bağlanması) kalite ve hata denetimidir. Rapor, yazılımcı olmayan proje sahibine ve
projeyi geliştiren mühendislere sunulacak; bağımsız bir profesyonel denetim firmasının raporu kalitesinde olmalı.

Bu denetim, aynı kodun ayrı yapılmış bir ilk denetiminden **daha üstün** olmak zorundadır. Fark şuradan gelir:
**her Kritik/Yüksek/Orta bulgu çalıştırılabilir kanıtla gelir** (kırmızı yanan bir test, ya da çıktısı raporda
alıntılanan bir hesap betiği). Kanıtlanamayan iddia "şüphe" olarak ayrı yazılır, bulgu sayılmaz.

## Bağımsızlık (zorunlu)

- Kaynak: git `main` @ `5805853`. Sana ayrılmış git çalışma ağacında (worktree) çalışırsın; `/home/user/Lyraska`
  ana kopyasına **hiçbir şey yazma**, orada git komutu çalıştırma.
- **Okuma yasağı:** `docs/DENETIM.md`, `docs/DENETIM-2.md`, `docs/denetim-2/`, `docs/devlog/`, GitHub
  issue/PR'ları ve yorumları, `/tmp/claude-0/` altındaki **`denetim-1/`** klasörü ve öteki denetçilerin
  raporları (`bagimsiz/` altında senin dosyan dışındakiler). Daha önceki ya da paralel bir denetimin sonuçlarını
  görmemelisin; her sonuç kendi okumanla ve kendi hesabınla olmalı.
- Okunabilir: `CLAUDE.md`, `README.md`, `docs/MIMARI.md`, `docs/ROADMAP.md`, `docs/DOGRULAMA.md`,
  `docs/SARKI-HARITASI.md`, kodun tamamı, testler, betikler, CI dosyaları.
- Commit atma, push yapma, dal değiştirme. Kanıt testlerini kendi çalışma ağacında yazıp çalıştırabilirsin; rapora
  testin tam kodunu ve çıktısını koy (ya da hesap klasörüne dosya olarak bırak).

## Ortam

- Çalışma ağacında derlemeden önce: `ln -s /home/user/Lyraska/node_modules node_modules` ve
  `cp -r /home/user/Lyraska/dist dist` (Rust derlemesi `dist/` ister). Rust: `cd src-tauri && cargo test <ad>`.
  Disk sınırlı: derleme klasörün çalışma ağacının içinde kalsın, işin bitince `cargo clean` yapma (gerek yok).
- Python3 + numpy + scipy kurulu. Windows hedefi için clippy: `cargo clippy --target x86_64-pc-windows-gnu`.
- Hesap betikleri ve kanıt dosyaları: `docs/denetim-3/hesap/<ÖNEK>/`
  (her betik tek başına `python3 -I betik.py` ile yeniden üretilebilir olmalı).
- Rapor: `docs/denetim-3/<ÖNEK>.md`.

## Yöntem

- Kodu satır satır oku; her bulguyu dosya:satır ve kısa kod alıntısıyla göster.
- Standartlara karşı denetle (alanına göre): RBJ Audio EQ Cookbook; Vicanek "Matched Second Order Digital Filters"
  (2016); Equalizer APO'nun filtre anlamları (LS/HS/LSC/HSC, BW Oct, S eğimi); AutoEq ParametricEQ.txt; bs2b /
  Linkwitz / Chu Moy crossfeed; ITU-R BS.1770-4 (Ek 2 gerçek tepe), EBU R128 / Tech 3341–3342; WASAPI paylaşımlı
  ve özel mod kuralları; Rust gerçek zamanlı ses kuralları (geri çağrıda bellek ayırma/kilit/panik yok, bellek
  sıralaması); WCAG 2.2 AA (klavye, odak, ad/rol/değer, hedef boyutu 2.5.8, kontrast), WAI-ARIA slider deseni.
- Ürünün kendi kuralları `CLAUDE.md`'dedir (ör. ses yolunda bellek ayırma yok, `unsafe` yasak, iç işlem f64,
  belgeler ile kod uyumlu olmalı). Belgede yazan her sayısal iddia (dB, ms, oran) bir testle ya da hesapla
  doğrulanmalı: belge–kod uyumsuzluğu da bulgudur.
- Ara: doğruluk hataları, sayısal kararsızlık, kenar durumlar (0, NaN, ∞, Nyquist, çok küçük/büyük Q, mono, 192 kHz,
  8 kHz), yarış koşulları, gerçek zamanlı ihlaller, kalıcılık/göç hataları, kötü niyetli ya da bozuk girdi (dosya
  içe aktarma), arayüz durumu yarışları, erişilebilirlik, test boşlukları (test var ama yanlış şeyi mi ölçüyor?).
- Her bulgu için kendine sor: "gerçek bir kullanıcı buna gerçek bir yoldan ulaşır mı?" Ulaşma yolunu yaz.

## Önem ölçeği

- **Kritik:** veri kaybı, güvenlik açığı, çökme, işitme/donanım riski (ani yüksek ses) ya da ürünün temel vaadini
  bozan hata.
- **Yüksek:** kullanıcının düzenli karşılaşacağı yanlış davranış ya da ciddi, ölçülebilir kalite sapması.
- **Orta:** belirli koşullarda görülen hata, ölçülebilir kalite kaybı, bakım riski, belge–kod uyumsuzluğu (sayısal).
- **Düşük:** küçük tutarsızlık, iyileştirme fırsatı.

## Rapor biçimi (Türkçe Markdown)

```
# <Alan> — Bağımsız denetim raporu (Faz 3, Denetim 2)
Denetçi: <alan>. Kaynak: main @ 5805853. Tarih: 22 Ekim 2026.

## 1. Kapsam ve yöntem
(dosyalar, satır sayısı, standartlar, çalıştırılan komutlar ve sonuçları)

## 2. Genel değerlendirme
Puan: X/10 — gerekçe. Üç cümle: en güçlü yan, en zayıf yan, bir numaralı risk.

## 3. Bulgular (önem sırasıyla)
### [<ÖNEK>-01] Kısa başlık
- Önem: … | Güven: kesin (testle/hesapla kanıtlandı) | yüksek | olası
- Yer: dosya:satır
- Kanıt: kod alıntısı + kanıt testinin/betiğinin adı ve çıktısı
- Kullanıcıya ulaşma yolu: …
- Etki: …
- Önerilen düzeltme: en küçük doğru düzeltme + düzeltmeyi kilitleyecek test

## 4. Şüpheler (kanıtlanamayanlar, güven "olası")
## 5. Güçlü yanlar (kanıtla; nezaket değil)
## 6. Denetlenemeyenler ve sınırlar
## 7. Önerilen öncelik sırası
```

Bulgu sayısı hedefi yok: kanıt kalitesi önemli. Kod tanımlayıcıları aynen (İngilizce), metin Türkçe.
Son mesajında: rapor dosyasının yolu, bulgu sayısı (öneme göre) ve puanın; ayrıca Kritik/Yüksek bulguların
tek satırlık listesi.
