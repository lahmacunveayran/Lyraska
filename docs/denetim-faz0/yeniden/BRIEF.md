# Faz 0 bağımsız denetimi — ortak kural metni (BRIEF)

Bu metin her bağımsız denetçiye aynen verilir. Denetçiye ayrıca yalnızca kendi alanı ve dosya listesi verilir;
hiçbir bulgu, hipotez ya da öncelik verilmez.

## Proje

Lyraska: Tauri 2 (Rust çekirdek + React/TypeScript arayüz) ile yazılmış, tamamen çevrimdışı çalışan bir Windows
müzik çalar. GPL-3.0-only. Proje sahibi yazılımcı değildir; kodu yapay zekâ oturumları yazar, sahibi test eder.
Sahibine ve kullanıcılara her `main` güncellemesinde sabit bir linkten Windows kurulum dosyası verilir.

**Denetlenen faz: Faz 0 — Temel.** Yol haritasındaki tanımı (`docs/ROADMAP.md`):

- Tauri 2 + React + TypeScript iskeleti; Rust tarafı modüllere ayrılmış
- Karşılama ekranı (ilk açılış, şarkı yokken görülen ekran)
- CI: her push ve PR'da Rust + TypeScript testleri, lint, lisans denetimi
- Windows kurulum dosyası ve sabit "test-surumu" indirme linki
- CLAUDE.md, README, Türkçe hata kaydı formu

Faz 0 bugün projenin **temeli** olarak denetlenir: bu temeller bugünkü kodda (sürüm 0.0.61) hâlâ sağlam mı, sözünü
tutuyor mu, üstüne kurulan her şeyi taşıyabiliyor mu? Ses motoru, analiz algoritmaları, DSP matematiği ve sahnelerin
görsel içeriği **kapsam dışıdır** (başka denetimlerin konusu); onlara ancak temelin bir sözünü (ör. "CI şunu denetler",
"program internete bağlanmaz") sınamak için bakılır.

Denetlenen kod: `/home/user/Lyraska`, commit `57f3e7b` (PR #100 dalı; sürüm 0.0.61).

## Yalıtım kuralları (zorunlu)

- **Okuma yasağı:** `docs/DENETIM.md`, `docs/DENETIM-2.md`, `docs/denetim-2/` ve `docs/denetim-faz0/` (bütün klasörler), `docs/DENETIM-FAZ0.md`, `docs/devlog/`
  (bütün klasör), GitHub issue/PR yorumları, bu denetimin başka denetçilerinin raporları ve kendi klasörün dışındaki
  geçici klasörler. Bu kaynaklar daha önceki denetimleri ve bulguları içerir; onları görmek bağımsızlığı bozar.
  Kodun içindeki yorumlarda geçen bulgu kodlarını (ör. "YAY-11", "DENETIM.md C1") gördüğünde onları kanıt sayma:
  her iddiayı kodun kendisinden doğrula.
- **Depoyu değiştirme.** `/home/user/Lyraska` içinde dosya yazma, `npm run build`, `cargo build/test/clippy`
  çalıştırma (başka bir iş aynı anda orada derliyor). Okuma ve yan etkisiz komutlar serbest (`git log`, `git show`,
  `cargo metadata`, `cargo tree`, `node scripts/...` gibi yalnızca okuyan betikler).
- Deney gerekirse kendi klasöründe kopya üzerinde yap: `git clone -q /home/user/Lyraska <kendi klasörün>/repo`
  (gerekirse `cp -r /home/user/Lyraska/node_modules <kopya>/`). Rust derlemesi gerekirse ayrı
  `CARGO_TARGET_DIR` kullan; makine 4 çekirdekli, derleme 5–15 dakika sürer: yalnızca bir iddiayı kanıtlamaya değecekse.
- İnternet: yalnızca kamuya açık belgeler (Tauri, GitHub Docs, RustSec, OpenSSF vb.) ve `github.com` üzerindeki
  bu deponun herkese açık sayfaları. Hiçbir yere veri gönderme, hesap açma, issue/PR/yorum yazma.

## Yöntem şartları

1. **Her bulgu kanıtlıdır:** `dosya:satır` + kod alıntısı, ya da çalıştırılan komut ve çıktısı. Kanıtsız sezgi
   "Olası risk" bölümüne yazılır, bulgu sayılmaz.
2. **Güven derecesi** her bulguda ayrı yazılır:
   - **Kanıtlandı:** deneyle gösterildi (komut/çıktı ya da küçük bir kopyada yeniden üretildi).
   - **Kesin:** kod okumasıyla tartışmasız (tek bir akış, yoruma yer yok).
   - **Yüksek:** kod okumasıyla güçlü, ama çalışma ortamına (Windows, GitHub ayarları) bağlı.
   - **Olası:** makul ama doğrulanamadı.
3. **Önem ölçeği:** Kritik (hemen durdur: güvenlik açığı, veri kaybı, kullanıcıya zararlı ikili) / Yüksek / Orta /
   Düşük / Bilgi. Önem, **gerçekçi** bir senaryoyla gerekçelendirilir (kim, ne yapınca, ne olur). Senaryo uzaksa önem
   düşürülür; bunu açıkça yaz.
4. **Kendini çürütmeye çalış:** her Yüksek ve Kritik bulgu için "bunu yanlış çıkaracak ne olurdu?" sorusunu sor ve
   denediğini yaz (ör. GitHub belgesi başka bir davranış söylüyor mu, başka bir yerde koruma var mı).
5. **Kalite kapılarının gerçekliği:** bir denetim betiği ya da CI adımı "X'i denetler" diyorsa, mümkünse X'i bozan
   küçük bir değişikliği kopyada yapıp kapının gerçekten kırmızı olduğunu göster (mutasyon sınaması). Yeşil kalıyorsa
   bulgudur.
6. **Standartlara bağla** (uygun olanı): OpenSSF Scorecard kontrolleri, SLSA v1.0 yapı düzeyleri, GitHub Actions
   güvenlik sertleştirme belgesi ve GitHub Security Lab'ın `workflow_run` / `pull_request_target` yazıları, Tauri 2
   güvenlik modeli (capabilities, CSP, komut erişimi), OWASP ASVS (uygun bölümleri), ISO/IEC 25010 (bakım
   kolaylığı, güvenilirlik), WCAG 2.2, GPL-3.0 dağıtım yükümlülükleri, SPDX, Semantic Versioning, Windows uygulama
   veri klasörü kuralları.
7. **Önerilen düzeltme küçük ve somut** olsun (hangi dosyada ne değişir). Kod yazma, depoya dokunma.
8. Doğru yapılanları da yaz: neyi denetledin ve temiz buldun (negatif sonuçlar da sonuçtur).

## Rapor biçimi (Türkçe; kod tanımlayıcıları İngilizce kalır)

Raporu yalnızca sana verilen dosya yoluna yaz (Markdown). Bölümler:

```
# <Alan> — bağımsız denetim raporu (Faz 0)
## 1. Özet            (5–8 madde; puan X/10 ve tek cümle gerekçe)
## 2. Kapsam ve yöntem (okunan dosyalar, çalıştırılan komutlar ve deneyler, sınırlar)
## 3. Bulgular        (önem sırasıyla; her biri aşağıdaki kalıpta)
## 4. Olası riskler   (kanıtı yetmeyenler)
## 5. Temiz bulunanlar (denetlenip sorunsuz çıkanlar)
## 6. Öncelikli düzeltme sırası (en fazla 10 madde)
```

Bulgu kalıbı:

```
### <ÖNEK>-NN — <kısa başlık>
- Önem: … · Güven: … · Standart: …
- Yer: `dosya:satır`
- Kanıt: (alıntı, komut, çıktı)
- Senaryo ve etki: (kim, ne yapınca, ne olur)
- Çürütme denemesi: (yalnızca Yüksek/Kritik)
- Öneri: (küçük, somut)
```

Puan ölçütü: 9–10 örnek gösterilecek düzeyde; 7–8 sağlam, birkaç orta kusur; 5–6 çalışıyor ama önemli açıklar
var; 3–4 temel sözlerinden biri tutmuyor; 1–2 kullanılmaz.

## Ek kurallar (bu tur)

- **Disk sınırlı:** Rust derlemesi yapma (`cargo build/test/clippy` yok; `cargo metadata`, `cargo tree` serbest).
  Arayüz kapılarını kopyada çalıştırabilirsin; `node_modules`'ı kopyalama, sembolik bağla
  (`ln -s /home/user/Lyraska/node_modules <kopya>/node_modules`). İşin bitince kopyanı sil.
- Kod yorumlarında `DENETIM-FAZ0`, `G1`, `ISK-03` gibi kodlar görebilirsin: önceki bir denetime atıftır, kanıt değildir.
- **Puanı iki biçimde ver:** (a) depodaki kod ve yapılandırma için; (b) deponun GitHub ayarları (dal koruması,
  fork PR onayı) ve satın alınması gereken şeyler (kod imzası sertifikası) dahil. Bu ikincilere bağlı maddeleri
  "Proje sahibinin ayarına bağlı" başlığında ayrıca yaz.
