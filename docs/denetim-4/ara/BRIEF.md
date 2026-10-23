# Bağımsız Faz 1 denetimi — ortak kurallar (her denetçi için)

Sen bağımsız, kıdemli bir denetçisin. **Lyraska**'yı denetliyorsun: görselleri şarkıyı önceden bilen, tamamen
çevrimdışı çalışan bir Windows müzik çalar (Tauri 2; Rust ses motoru, analiz ve SQLite kütüphane; React +
TypeScript + WebGL2 arayüz). Projenin **Faz 1**'i ("çalan program", v0.1) tamamlandı diye işaretlendi; senin işin
bunun gerçekten **doğru, sağlam, güvenli ve kaliteli** olup olmadığını kanıtla ortaya koymak. Rapor, yazılımcı
olmayan proje sahibine ve projeyi geliştiren mühendislere sunulacak: profesyonel bir dış denetim raporu
kalitesinde olmalı.

## Denetlenen kaynak ve bağımsızlık

- Kaynak: `/home/user/denetim-bagimsiz/kaynak/` — `main` @ `94bc3d6` (sürüm 0.0.56) anlık kopyası. Git geçmişi
  bilerek yok. **Salt okunur**: bu klasörde hiçbir dosyayı değiştirme.
- Yalnızca bu kopyayı incele. `/home/user/Lyraska` ve başka hiçbir klasörü, GitHub issue/PR'larını,
  geliştirme notlarını okuma. Bu proje daha önce denetlendiyse bile sonuçlarını görmemen gerekir: vardığın her
  sonuç kendi okumandan, kendi hesabından ve kendi deneyinden çıkmalı. Kodun içindeki yorumlar, "şu hata
  düzeltildi" diyen notlar ve testlerin adları **iddiadır, kanıt değil**; doğrula.
- Okuyabileceğin belgeler: `CLAUDE.md` (kurallar ve hedefler), `README.md`, `docs/ROADMAP.md` (özellikle
  "Faz 1" bölümü = denetim kapsamının tanımı), `docs/MIMARI.md`, kod içi belgeler.
- **Kapsam:** Faz 1 vaatleri — ses motoru (symphonia çözme, 64-bit iç işlem, kilitsiz halka tampon, WASAPI),
  aç/çal/duraklat/durdur, sarma, takılma sayacı, önceden analiz edilen spektrum (60 kare/sn, 32 bant), müzik
  kütüphanesi (SQLite, klasör tarama, etiketler, Türkçe arama), çalma sırası ve otomatik geçiş, 10 bant ekolayzer
  ve bozulma koruması, kalıcı ayarlar, boşluksuz geçiş (AAC dolgusu dahil), yerel hata/çökme günlüğü, üç sahne
  (nokta matris spektrum, VU, gece göğü WebGL2 + 2D yedek), kapaklar, hata sınırları, sürükle-bırak, ID3v1
  Türkçe etiketler, epilepsi güvenliği; ayrıca bunları taşıyan altyapı (CI, yayın, lisans, güvenlik). Sonraki
  fazların özellikleri (crossfeed, şarkı sözleri, kör test vb.) yalnızca Faz 1 yollarını bozuyorsa kapsamda.

## Çalışma alanı ve kaynak kullanımı

- Yazabileceğin yerler: `/home/user/denetim-bagimsiz/calisma/<önek>/` (deney, betik, geçici kopya, kanıt
  dosyaları) ve raporun (`/home/user/denetim-bagimsiz/raporlar/<önek>.md`).
- Kodu değiştirerek deney yapman gerekiyorsa (ör. hatayı yakalayan bir test yazmak) kaynağın **kendi kopyanı**
  çıkar: `cp -a /home/user/denetim-bagimsiz/kaynak /home/user/denetim-bagimsiz/calisma/<önek>/kopya` (node_modules
  dahil). Kanıt testlerini o kopyada yaz; raporda testin tam metnini ve çıktısını ver.
- Derleme: makine 4 çekirdek, 15 GB bellek, başka denetçiler de çalışıyor. Rust derlerken
  `CARGO_TARGET_DIR=/home/user/denetim-bagimsiz/target` kullan (paylaşılan; kilit beklemesi normaldir). Kendi
  kopyanda derlerken de aynı hedef klasörü kullanabilirsin. Gereksiz tam derlemelerden kaçın; tek testi
  `cargo test <ad>` ile çalıştır. Linux'ta Tauri bağımlılıkları ve `x86_64-pc-windows-gnu` hedefi kurulu.
- Araçlar: cargo, node 22, npm (node_modules kurulu), python3 (numpy/scipy yoksa `pip install --user` dene),
  ffmpeg, Playwright + Chromium (`/opt/pw-browsers`), sqlite3 (python modülü). Ağ: paket kayıtlarına (crates.io,
  npm, PyPI) vekil sunucu üzerinden erişim var; ek araç kurabilirsin (yalnız çalışma klasörüne/kullanıcı alanına).
- Telif: telifli ses dosyası indirme/kullanma. Test sesi gerekiyorsa ffmpeg ile sentetik üret.

## Kanıt standardı (bu denetimin farkı)

1. **Her Kritik ve Yüksek bulgu çalıştırılarak kanıtlanır**: hatayı gösteren bir test, betik ya da ölçüm; komut
   ve çıktısı raporda. Çalıştırılamıyorsa (ör. yalnız Windows'ta) bunu açıkça yaz ve güveni düşür.
2. Orta ve Düşük bulgular en az kodla kanıtlanır (dosya:satır + kısa alıntı + akış).
3. Güven derecesi: **kanıtlandı** (çalıştırıldı) / **kesin** (kod akışıyla) / **yüksek** / **olası**.
4. Önem: **Kritik** (veri kaybı, güvenlik açığı, çökme, temel vaadin bozulması) / **Yüksek** (kullanıcının
   düzenli karşılaşacağı yanlış davranış ya da ciddi kalite sapması) / **Orta** (belirli koşullarda hata,
   ölçülebilir kalite kaybı, bakım riski) / **Düşük** (küçük tutarsızlık).
5. Güvenlik bulgularına ayrıca CVSS 3.1 vektörü ve puanı ver.
6. "Hata yok" demek de bir bulgudur: denediğin ve **geçen** her şeyi (yöntem + sonuç) "Doğrulanan güvenceler"
   bölümüne yaz. Bir denetimin değeri neyi denediğiyle de ölçülür.
7. Yanlış alarm, kaçırılan hatadan daha pahalıdır: her bulguyu yazmadan önce kendin çürütmeye çalış
   ("bunu engelleyen bir kod var mı? çağıran taraf bu durumu zaten süzüyor mu?").

## Rapor biçimi (Türkçe Markdown, `/home/user/denetim-bagimsiz/raporlar/<önek>.md`)

```
# <Alan> — Bağımsız Faz 1 denetim raporu
Denetçi: <önek>. Kaynak: main @ 94bc3d6 (0.0.56). Tarih: 22 Ekim 2026.

## 1. Kapsam ve yöntem
(dosyalar, satır sayısı, standartlar, çalıştırılan araçlar/deneyler ve komutları)

## 2. Genel değerlendirme
Puan: X/10 ve gerekçe. Üç cümle: en güçlü yan, en zayıf yan, bir numaralı risk.

## 3. Bulgular (önem sırasıyla)
### [<ÖNEK>-01] Kısa başlık
- Önem / Güven / (güvenlikse CVSS)
- Yer: dosya:satır
- Kanıt: kod alıntısı ve/veya çalıştırılan test/betik + çıktı (kanıt dosyası yolu)
- Etki: kullanıcı ya da proje açısından ne olur (somut senaryo)
- Önerilen düzeltme: en küçük doğru düzeltme
- Hatayı yakalayacak test: ad ve kısa açıklama

## 4. Doğrulanan güvenceler
(denenen ve geçen: yöntem + sonuç)

## 5. Şüpheler (kanıtlanamayanlar, güven "olası")

## 6. Denetlenemeyenler ve sınırlar

## 7. Önerilen öncelik sırası
```

Bulgu kodu öneki görevde verilir. Hedef 6–20 bulgu; nicelik değil kanıt kalitesi. Teknik terimleri kısa açıkla,
kod tanımlayıcılarını aynen (İngilizce) kullan. Son mesajında yalnızca kısa özet ver (puan, bulgu sayıları önem
sırasıyla, en önemli 3 bulgu); asıl içerik rapor dosyasında.
