# Faz 0 kalite ve hata denetimi — 22 Ekim 2026

Proje sahibinin isteği: "Faz 0'a kalite ve hata denetimi yap. İki kere denetle. İkinci denetim bağımsız ve daha üstün,
daha profesyonel, daha nitelikli olsun." Ardından: "İşine yarayacak GitHub reposu varsa kullan; hepsini en kötü 9
yapmalıyız, olabildiğince 10."

Denetlenen kod: `main` @ `94bc3d6` (sürüm 0.0.56). **Faz 0 — Temel**, yol haritasındaki beş maddedir: proje iskeleti
(Tauri 2 + React + TypeScript, Rust modülleri), karşılama ekranı, CI, Windows kurulum dosyası ve sabit indirme linki,
CLAUDE.md / README / hata kaydı formu. Bu temeller bugünkü kodda denetlendi: hâlâ sağlam mı, sözlerini tutuyor mu?
Ses motoru, analiz algoritmaları ve DSP matematiği kapsam dışıdır (16 Ekim denetimleri: `DENETIM.md`, `DENETIM-2.md`).

## 0. Yönetici özeti (proje sahibi için)

- **Program sağlam bir temelde, ama yayın hattında bir delik var.** Bütün kalite kapıları bu makinede yeşil geçti
  (bölüm 2). Gizli anahtar sızıntısı, kullanılmayan bağımlılık, bilinen güvenlik açığı ve depoda ses dosyası yok.
  Hiçbir bulgu tamamen çürütülmedi.
- **En önemli bulgu.** İki denetim bunu birbirinden habersiz buldu. Biri projenin kopyasından (fork) `main` adlı bir
  dalla değişiklik önerirse ve testleri geçerse, "Test sürümü" iş akışı o kişinin kodunu derleyip **sizin sabit
  linkinize** koyabilir (G1). Düzeltmesi iş akışında iki koşul.
- **İkinci önemli bulgu.** Sabit link ve programdaki "kaynak kodu" adresi eski hesap adınızı (`gozlemesevdalisi`)
  kullanıyor. Şu an yalnızca GitHub'ın yönlendirmesiyle çalışıyor (G3).
- **Bağımsız denetçilerin puanları:**

  | Alan                         | Puan    |
  | ---------------------------- | ------- |
  | Yayın hattı                  | 5/10    |
  | Kalite kapıları              | 6/10    |
  | Belgeler ve karşılama ekranı | 6/10    |
  | Uygulama kabuğu              | 7/10    |
  | Mimari iskelet               | 7/10    |
  | **Ortalama**                 | **6,2** |

  Puanı düşüren kusurların çoğu birkaç satırlık düzeltmeler. Hedef her alanda en az 9: düzeltme durumu bölüm 9'da.

- **Sizin kararınızı ya da düğmenize bağlı olanlar** bölüm 8'de: `main` dalını koruma kuralı, fork'tan gelen
  önerilerin onayı, kod imzalama.

## 1. Kapsam ve yöntem

Denetim üç katmanlıdır. Her katman bir öncekinin kör noktasına karşı kuruldu.

| Katman                      | Kim                          | Ne yaptı                                                                                                                                                                              |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — ilk denetim**         | Oturumun ana denetçisi       | Faz 0 dosyalarını satır satır okudu, kapıları çalıştırdı, GitHub'daki gerçek durumu (Release, dallar, hesap adı) sorguladı, iddiaları GitHub belgesinin kaynak metniyle karşılaştırdı |
| **B — bağımsız denetim**    | Beş ayrı uzman denetçi       | Yayın hattı ve tedarik zinciri; uygulama kabuğu ve Windows kurulumu; kalite kapıları; belgeler, lisans ve karşılama ekranı; mimari iskelet                                            |
| **C — karşıt doğrulama**    | Ayrı bir kuşkucu doğrulayıcı | A ve B'nin Orta ve üstü her bulgusunu kodda, belgede ya da deneyle yeniden kurup **çürütmeye** çalıştı; önemleri yeniden tarttı                                                       |
| **D — açık kaynak araçlar** | Ana denetçi                  | Sektörde yaygın kullanılan GitHub araçları (bölüm 7)                                                                                                                                  |

**B'nin bağımsızlığı.** Denetçiler birbirinin ve A'nın bulgularını görmedi. Eski denetimleri (`DENETIM*.md`,
`denetim-2/`), devir notlarını ve GitHub tartışmalarını okumaları yasaktı. Yalnızca alan, dosya listesi, standartlar
ve rapor biçimi verildi. Ortak kural metni `docs/denetim-faz0/BRIEF.md`.

**B'nin 16 Ekim'deki ikinci denetimden üstün yanları:**

1. **Mutasyon sınaması zorunluydu.** "X'i denetler" diyen her kapı, kopya bir depoda X'i bozarak sınandı: yaklaşık
   80 mutasyon, tablo `denetim-faz0/kanit/kapi/mut-results.txt`.
2. **Her bulguda güven derecesi ayrı yazıldı.** Kanıtlandı / Kesin / Yüksek / Olası.
3. **Her Yüksek ve Kritik bulgu için "çürütme denemesi" zorunluydu.**
4. **Standartlara bağlandı:** OpenSSF Scorecard, SLSA v1.0, GitHub Security Lab, Tauri 2 güvenlik modeli,
   ISO/IEC 25010, WCAG 2.2, GPL-3.0.
5. **C katmanı yeni.** Her bulgu ikinci bir göz tarafından yeniden sınandı.

**Bulanıklaştırma (fuzzing).** symphonia'ya iki denetçi toplam 78 000 bozulmuş ses dosyası verdi; panik çıkmadı.

**Sınır.** Bütün denetçiler aynı model ailesinden (Claude), ayrı bağlamlarda çalıştı. Farklı bir ekip ya da insan
denetçi kadar bağımsız sayılmamalı. Denetim Linux'ta yapıldı: Windows davranışı kod ve belge okumasıyla değerlendirildi.
Windows'a özel kod Clippy ile Windows hedefine derlendi.

## 2. Sağlık (bu makinede çalıştırıldı, `94bc3d6`)

| Denetim                                                       | Sonuç                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `npm run format:check`, `lint`, `typecheck`                   | temiz                                                   |
| `npm test`                                                    | 40 dosya, 317 test geçti                                |
| `npm run build`                                               | 406 KB JS (gzip 127 KB)                                 |
| `npm run check:licenses` / `check:audio` / `check:commands`   | 242 paket / 340 dosya / 54 komut, 54 çağrı: temiz       |
| `npm run check:notices`                                       | güncel                                                  |
| `npm audit --omit=dev --audit-level=high`                     | 0 açık                                                  |
| `cargo fmt --check`, `cargo clippy --all-targets -D warnings` | temiz                                                   |
| `cargo clippy --target x86_64-pc-windows-gnu`                 | temiz                                                   |
| `cargo test --locked` + `src/lib/bindings` yeniden üretimi    | geçti; bağlamalar depodakiyle aynı                      |
| `cargo deny check licenses bans sources advisories`           | dördü de temiz                                          |
| `npm run check:scenes`                                        | Linux'ta tarayıcı açılmadı; CI'da Windows Edge'de yeşil |

## 3. Bölüm A — ilk denetim

Önem sütunu A'nın kendi kararıdır. C'nin düzelttiği önem bölüm 6'da.

| Kod   | Bulgu                                                                                                                                                                                                                                                                                                                                                        | Önem   | Güven       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------- |
| F0-01 | **Fork'tan gelen kod resmî kurulum dosyası olarak yayımlanabilir.** `test-surumu.yml`, `workflow_run` + `branches: [main]` ile tetiklenir. Bu süzgeç yalnızca tetikleyen çalıştırmanın dal adına bakar. Fork'unun `main` dalından PR açan birinin CI'si yeşil biterse, `derle` işi onun commit'ini derler; `yayinla` işi sabit linke koyar ve etiketi taşır. | Kritik | Yüksek      |
| F0-02 | **Sabit link ve programdaki kaynak kodu adresi eski hesap adında.** Depo `lahmacunveayran/Lyraska`'da. `gozlemesevdalisi/...` linki yalnızca 301 yönlendirmesiyle çalışıyor (`curl` ile denendi). GitHub kullanıcı aramasında bu adda hesap yok.                                                                                                             | Yüksek | Kanıtlandı¹ |
| F0-03 | `main` korumasız (`protected: false`). "CI yeşil olmadan birleştirme yapılmaz" kuralı teknik olarak zorlanmıyor. Windows işi yalnızca PR'da çalışıyor.                                                                                                                                                                                                       | Orta   | Kesin       |
| F0-04 | README ve `MIMARI.md` veri klasörünü `com.lyraska.app` diye yazıyor; gerçek ad `io.github.gozlemesevdalisi.lyraska`. `library/mod.rs:11` kütüphaneyi hâlâ Roaming'de sanıyor.                                                                                                                                                                                | Orta   | Kesin       |
| F0-05 | `build.rs` derleme kodunu `GITHUB_SHA`'dan alıyor. Bu değer `workflow_run`'da "varsayılan dalın son commit'i"dir; derlenen commit olmayabilir.                                                                                                                                                                                                               | Düşük  | Kesin       |
| F0-06 | `rust-version = "1.85"`; Tauri 2.12 en az 1.90 istiyor (`cargo metadata`).                                                                                                                                                                                                                                                                                   | Düşük  | Kesin       |
| F0-07 | README durumu eski ("Phase 2 in progress", crossfeed "planned"); programda sabit "Faz 2" yazıyor.                                                                                                                                                                                                                                                            | Düşük  | Kesin       |
| F0-08 | CLAUDE.md mimari ağacında `data_dirs.rs` ve 9 hook/lib dosyası yok; depo adı yanlış.                                                                                                                                                                                                                                                                         | Düşük  | Kesin       |
| F0-09 | Tek örnek koruması yok: iki kopya aynı ayar dosyasına, veritabanına ve ses aygıtına gider.                                                                                                                                                                                                                                                                   | Düşük  | Kesin       |
| F0-10 | npm lisans denetimi yasak listesi, Rust'taki (`deny.toml`) izin listesi. `GPL-2.0-only` npm'de geçer.                                                                                                                                                                                                                                                        | Düşük  | Kesin       |
| F0-11 | `check:audio` yalnızca uzantıya bakıyor; listesi `.gitignore`'la aynı değil.                                                                                                                                                                                                                                                                                 | Düşük  | Kesin       |
| F0-12 | Dependabot yok; Rust sürümü iki iş akışında ayrı ayrı yazılı.                                                                                                                                                                                                                                                                                                | Düşük  | Kesin       |
| F0-13 | `test-surumu` elle başlatılınca herhangi bir daldan, CI beklenmeden yayımlar.                                                                                                                                                                                                                                                                                | Düşük  | Kesin       |
| F0-14 | Yayın adımı notları dosyadan önce yeniliyor; yükleme düşerse not eski dosyayı yanlış anlatır.                                                                                                                                                                                                                                                                | Düşük  | Kesin       |
| F0-15 | Karşılamadaki gösteri spektrumu güvenli moddan habersiz (~2 vuruş/sn; parlama sınırını aşmıyor).                                                                                                                                                                                                                                                             | Düşük  | Kesin       |
| F0-16 | GPL metninin kendisi programla kurulmuyor (yalnızca kurulumdaki lisans sayfasında var).                                                                                                                                                                                                                                                                      | Bilgi  | Kesin       |
| F0-17 | WebView2 yoksa kurulum internetten indirir. README bunu dürüstçe yazıyor.                                                                                                                                                                                                                                                                                    | Bilgi  | Kesin       |

¹ Yönlendirme kanıtlı. Kötüye kullanılabilirliği belirsiz: GitHub, çok klonlanan depo adlarını emekliye ayırabilir
(C katmanı, bölüm 6).

## 4. Bölüm B — bağımsız denetim

Tam raporlar `docs/denetim-faz0/` altında, kelimesi kelimesine (yalnızca Prettier biçimi uygulandı).

| Alan ve rapor                                     | Puan | Kritik | Yüksek | Orta | Düşük | Bilgi | Denetçinin tek cümlesi                                                                                        |
| ------------------------------------------------- | ---- | ------ | ------ | ---- | ----- | ----- | ------------------------------------------------------------------------------------------------------------- |
| Yayın hattı ([yayin.md](denetim-faz0/yayin.md))   | 5    | 1      | 1      | 4    | 6     | 1     | Hijyen iyi (SHA sabitleme, en az izin), ama yayın kapısının ana güvenlik varsayımı yanlış                     |
| Kalite kapıları ([kapi.md](denetim-faz0/kapi.md)) | 6    | 0      | 1      | 5    | 4     | 1     | 84 mutasyonun ana sınıflarında kapılar kırmızı; yayın kapısı, npm lisans ve ses kapısı yazılı politikadan dar |
| Belgeler ([belge.md](denetim-faz0/belge.md))      | 6    | 0      | 1      | 7    | 5     | 2     | Teknik belgeler ayrıntılı, ama kullanıcıya giden temel bilgiler (link, klasör, faz) yanlış ya da eski         |
| Kabuk ([kabuk.md](denetim-faz0/kabuk.md))         | 7    | 0      | 0      | 5    | 5     | 1     | İzinler en dar, uzak içerik yok; iki teşhis sözü (çökme izi, açılış hatası) tutmuyor                          |
| İskelet ([iskelet.md](denetim-faz0/iskelet.md))   | 7    | 0      | 0      | 4    | 6     | 3     | Göç çerçevesi, atomik ayar yazımı, tek köprü örnek düzeyde; kilit disiplini, çökme yalıtımı, işaret kaybı     |

**A ile B'nin örtüşmesi.** A'nın 17 bulgusunun 17'sini de B en az bir denetçide habersizce yeniden buldu (fork
yayını, eski ad, korumasız `main`, klasör adı, derleme kodu, MSRV, eski README, CLAUDE.md ağacı, tek örnek, lisans ve
ses kapıları, Dependabot, elle başlatma, yayın adımı sırası, gösteri spektrumu, GPL metni, WebView2). İki denetim
birbirini doğruluyor. B'de olup A'nın kaçırdıkları daha önemli:

- önbellek zehirlenmesi (YAY-02);
- açılış hatasının günlüğe hiç ulaşmaması (KAB-02);
- çökme izinin okunamaması (KAB-01);
- çökme döngüsü (ISK-02);
- işaret kaybı (ISK-03);
- lint uyarılarının CI'yi kırmaması (KAP-05);
- günlükte derleme kodunun olmaması (BEL-08).

Bu, B'nin gerekçesini doğruluyor: A, Faz 0'ı yazan tarafın gözüyle baktı.

## 5. Birleşik bulgular (C'nin doğruladığı önemlerle)

Aynı sorunu anlatan bulgular tek kodda toplandı (G = grup).

| Grup | Konu                                                                                                                                                                                                                                                                                                                                               | Kaynak kodlar                         | C kararı           | Önem          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------ | ------------- |
| G1   | Fork'tan `main` dalıyla açılan PR resmî test sürümünü değiştirebilir                                                                                                                                                                                                                                                                               | F0-01, YAY-01, KAP-01                 | Doğrulandı         | **Yüksek**    |
| G2   | Yayın derlemesi önceki çalıştırmaların önbelleğiyle yapılıyor (G1'i kalıcı kılar)                                                                                                                                                                                                                                                                  | YAY-02                                | Kısmen             | Orta          |
| G3   | Sabit link, programdaki kaynak adresi ve belgeler eski hesap adında                                                                                                                                                                                                                                                                                | F0-02, YAY-06, BEL-01                 | Kısmen             | Orta          |
| G4   | `main` korumasız; Windows işi `main` push'unda çalışmıyor; oturum anahtarı yönetici yetkili                                                                                                                                                                                                                                                        | F0-03, YAY-04                         | Doğrulandı         | Orta          |
| G5   | Veri klasörü adı yanlış; "ikisi de güvenle silinebilir" işaretleri kaybettirir; DOGRULAMA A0 yanlış klasör                                                                                                                                                                                                                                         | F0-04, KAB-03, BEL-02, BEL-03, ISK-08 | Doğrulandı         | Orta          |
| G6   | WebView2/pencere açılamazsa program iz bırakmadan kapanıyor                                                                                                                                                                                                                                                                                        | KAB-02                                | Doğrulandı         | Orta          |
| G7   | npm lisans kapısı yasak listesi (GPL-2.0-only, Proprietary, `AND BUSL` geçiyor)                                                                                                                                                                                                                                                                    | F0-10, KAP-03, BEL-04                 | Doğrulandı         | Orta          |
| G8   | `panic = "abort"` ile çökme döngüsü; bozuk örnekleme hızlı WAV somut tetik adayı                                                                                                                                                                                                                                                                   | ISK-02 (+C)                           | Kısmen             | Orta          |
| G9   | İşaretleme: ölçüm sürerken kaydedilen işaretler geri alınıyor, ölçüm eski kümeye ait                                                                                                                                                                                                                                                               | ISK-03                                | Doğrulandı (deney) | Düşük–Orta    |
| G10  | Çökme günlüğündeki yığın izi okunamıyor; `.pdb` saklama boşa                                                                                                                                                                                                                                                                                       | KAB-01                                | Doğrulandı         | Düşük         |
| G11  | Tek örnek koruması yok                                                                                                                                                                                                                                                                                                                             | F0-09, KAB-04, ISK-11                 | Doğrulandı         | Düşük         |
| G12  | Kod imzası ve provenance yok                                                                                                                                                                                                                                                                                                                       | YAY-05, KAB-05                        | Doğrulandı         | Düşük         |
| G13  | Programdaki derleme kodu derlenen commit olmayabilir                                                                                                                                                                                                                                                                                               | F0-05, YAY-03                         | Kısmen             | Düşük         |
| G14  | Elle başlatma ve "Re-run" CI'sız/eski sürüm yayımlar                                                                                                                                                                                                                                                                                               | F0-13, KAP-02, YAY-08                 | Doğrulandı         | Düşük         |
| G15  | Ses kapısı: geçmiş, izinli klasör ve 14 uzantı                                                                                                                                                                                                                                                                                                     | F0-11, KAP-04                         | Doğrulandı         | Düşük         |
| G16  | ESLint uyarıları CI'yi kırmıyor (CLAUDE.md tersini söylüyor)                                                                                                                                                                                                                                                                                       | KAP-05                                | Doğrulandı         | Düşük         |
| G17  | "Panik yok", "`unsafe` yalnızca WASAPI'de" kuralları lint ile tam korunmuyor                                                                                                                                                                                                                                                                       | KAP-06                                | Doğrulandı         | Düşük         |
| G18  | README/CLAUDE.md eskimiş; denetim listeleri CI ile birebir değil; README'deki blok temiz klonda çalışmıyor                                                                                                                                                                                                                                         | F0-07, F0-08, BEL-05/06/07, KAP-10    | Doğrulandı         | Düşük         |
| G19  | Hata günlüğünde derleme kodu ve Windows sürümü yok; form tersini söylüyor                                                                                                                                                                                                                                                                          | BEL-08                                | Doğrulandı         | Düşük         |
| G20  | Oynatıcı kilidi altında yavaş iş (parametrik EQ sürüklemesinde her adımda fsync)                                                                                                                                                                                                                                                                   | ISK-01                                | Kısmen             | Düşük         |
| G21  | Komut sözleşmesi denetimi türleri görmüyor; bazı biçimleri kaçırıyor                                                                                                                                                                                                                                                                               | ISK-04, KAP-07                        | Kısmen             | Düşük         |
| G22  | Diğer düşük bulgular: MSRV, Dependabot/SECURITY.md, CSP yönergeleri, sağ tık/F5, birimler arası taşıma, atlanan testler, betiklerin lint dışı kalması, MIT bildirimleri, GPL metni, gösteri etiketi, form seçenekleri, atomik yazma kopyaları, ayar ileri uyumu, TS aynaları, veritabanı bozulma denetimi, `npm audit` kapsamı, yayın adımı sırası | ilgili raporlarda                     | Doğrulandı         | Düşük / Bilgi |

Tamamen **çürütülen** bulgu yok. C, A ve B'nin önemlerini çoğunlukla bir kademe düşürdü:

- G1 Kritik'ten Yüksek'e indi. Olasılığı iki şey sınırlıyor: bir insanın "Approve and run" onayı gerekiyor ve depoda
  hiç fork yok. Kötü niyet gerekmeyen bir yol da var: iyi niyetli bir katkıcı, birleşmemiş kodunu resmî linke koyar.
- G3 Yüksek'ten Orta'ya indi: eski depo adı emekliye ayrılmış olabilir.

## 6. Karşıt doğrulamanın bulduğu yeni şeyler

Tam metin: `docs/denetim-faz0/dogrulama.md`.

1. **Oturum anahtarı depoda yönetici yetkisi taşıyor.** Yapay zekâ oturumları dal korumasını kapatıp doğrudan
   `main`'e itebilir. Koruma kuralı "kimse atlayamaz" ayarıyla kurulmalı.
2. **Önbellek için önerilen `save-if: false` yetmez.** İşte çalışan kod önbelleğe kendisi yazabilir; yayın işinde
   önbellek hiç kullanılmamalı. Bedeli yayın başına yaklaşık 5–8 dakika.
3. **Çökme döngüsü için somut tetik adayı.** Örnekleme hızı alanı `0xFFFFFFFF` olan bir WAV, analizde yaklaşık
   8,6 GB'lık ayırmaya ve programın kapanmasına yol açabilir; kütüphanede kalırsa her açılışta tekrar eder.
4. **KAB-02 düzeltmesinin yan etkisi.** Günlük erken açılırsa eski Roaming `logs/` klasörü taşınmaz; düzeltme bunu
   hesaba katmalı.
5. **ISK-03 kalite ölçümünü de yanıltıyor.** Ekrandaki F-ölçüsü eski işaret kümesine ait.

## 7. Bölüm D — açık kaynak araçlarla tarama

Çıktılar `docs/denetim-faz0/kanit/araclar/` altında.

| Araç (GitHub)                                                                                                | Ne bakar                                    | Sonuç                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [zizmor](https://github.com/zizmorcore/zizmor) 1.31.1                                                        | GitHub Actions güvenlik denetimi            | 1 yüksek: `workflow_run` "dangerous-triggers" (G1); 1 düşük (yazma izninde açıklama yorumu); 3 bilgi (`dtolnay/rust-toolchain` yerine `rustup`)                                       |
| [actionlint](https://github.com/rhysd/actionlint) 1.7.12                                                     | İş akışı sözdizimi ve kabuk betikleri       | temiz                                                                                                                                                                                 |
| [gitleaks](https://github.com/gitleaks/gitleaks) 8                                                           | Bütün git geçmişinde gizli anahtar          | 122 commit, sızıntı yok                                                                                                                                                               |
| [cargo-machete](https://github.com/bnjbvr/cargo-machete)                                                     | Kullanılmayan Rust bağımlılığı              | yok                                                                                                                                                                                   |
| [knip](https://github.com/webpro-nl/knip) 5                                                                  | Kullanılmayan TypeScript dosyası/dışa verim | kullanılmayan dosya yok; 40 sabit ve 51 tip gereksiz yere `export` (zararsız, temizlik)                                                                                               |
| [typos](https://github.com/crate-ci/typos)                                                                   | Kodda yazım hatası                          | kodda yok (belgelerdeki uyarılar Türkçe sözcüklerin İngilizce sanılması)                                                                                                              |
| git geçmişi taraması                                                                                         | Geçmişte hiç ses dosyası girdi mi           | yalnızca `src-tauri/tests/data/` sentetik sesleri                                                                                                                                     |
| [osv-scanner](https://github.com/google/osv-scanner), [OpenSSF Scorecard](https://github.com/ossf/scorecard) | Açık veritabanı, depo puanı                 | bu ortamın ağ kuralı `api.osv.dev` ve `api.github.com`'u engelledi; aynı veritabanı `cargo deny advisories` ve `npm audit` ile tarandı (temiz). Scorecard CI'ya eklenebilir (bölüm 9) |

## 8. Proje sahibinin kararı ya da düğmesi gereken konular

1. **`main` dalını korumak (G4).** GitHub'da bir kural:
   - `main`'e yalnızca PR ile girilir;
   - CI'nin işleri yeşil olmadan birleştirilemez;
   - kimse atlayamaz.

   Önerim: açılsın. Bu oturumun anahtarı yönetici yetkili olduğu için kuralı ben de kurmayı deneyebilirim; olmazsa
   hangi sayfada hangi düğmeye basılacağını yazarım.

2. **Fork'tan gelen önerilerin onayı (G1).** Ayarlar → Actions → General → "Fork pull request workflows from outside
   collaborators" → "Require approval for all outside collaborators". Önerim: açılsın. G1 kod tarafında kapatılıyor;
   bu ikinci bir kilit olur.
3. **Kod imzalama (G12).** Windows'un "bilinmeyen yayımcı" uyarısını kaldırır. Yol haritasında Faz 4 işi.
   Seçenekler:
   - SignPath Foundation: açık kaynak projelere ücretsiz, başvuru gerekir;
   - Azure Trusted Signing: aylık ücretli.

   Önerim SignPath başvurusu. İmza gelene kadar her test sürümüne GitHub'ın ücretsiz "derleme kanıtı"
   (attestation) eklenir.

## 9. Düzeltme durumu

PR #100 (sürüm 0.0.61). "Düzeldi" demek: kod değişti, hatayı yakalayan test ya da kapı eklendi, bütün kapılar yeşil.

| Grup | Durum        | Nasıl ve hangi kapıyla                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1   | düzeldi      | Yayın yalnızca bu deponun `main` push'unun başarılı CI'siyle (`event == push`, `head_repository == repository`); zizmor CI'da                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G2   | düzeldi      | Yayın derlemesi önbelleksiz (npm ve Rust)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| G3   | düzeldi      | Bütün linkler `lahmacunveayran/Lyraska`; `check:docs` eski ada giden linki reddeder. Program kimliği veri kaybolmasın diye aynı (README'de açıklandı)                                                                                                                                                                                                                                                                                                                                                                                                      |
| G4   | kısmen       | Windows Clippy ve testler artık `main` push'unda da çalışıyor. **Dal koruması proje sahibinin düğmesi** (bölüm 8)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| G5   | düzeldi      | README, MIMARI, DOGRULAMA, `library/mod.rs`; `check:docs` klasör adlarını program kimliğiyle karşılaştırır                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| G6   | düzeldi      | Günlük ve çökme yakalayıcı Tauri'den önce; açılışta çökmede uyarı kutusu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| G7   | düzeldi      | `deny.toml` izin listesi + SPDX ayrıştırıcı; testleri denetimdeki kaçakları içerir                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G8   | düzeldi      | Çözücü geçersiz hız/kanalı reddeder (test); programı iki kez kapatan dosya analizde atlanır (test)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G9   | düzeldi      | Çekirdek ölçüm sonucunu ancak işaretler değişmediyse yazar; arayüz değişmiş işaretlerin sonucunu göstermez (iki tarafta test)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G10  | düzeldi      | Yığın izi adresli (`{:#}`), açılış satırında başvuru adresi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| G11  | düzeldi      | Tek örnek kilidi (işletim sistemi dosya kilidi; test); kapanışta ses kısılır                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| G12  | kısmen       | Her kurulum dosyasına derleme kanıtı (attestation). **Kod imzası proje sahibinin kararı** (bölüm 8)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| G13  | düzeldi      | `LYRASKA_COMMIT` (derlenen commit), `GITHUB_SHA` kullanılmaz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| G14  | düzeldi      | Elle başlatma yalnızca `main`; derlenen commit `main`'in ucu değilse yayın atlanır                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G15  | düzeldi      | Dosya imzası, bütün git geçmişi (CI `fetch-depth: 0`), test klasöründe tarif + boyut sınırı; `.gitignore` ile aynı liste (test)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| G16  | düzeldi      | `--max-warnings 0`; kapı betikleri de lint'te                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G17  | düzeldi      | `check:rules`: `allow(unsafe_code)` yalnızca WASAPI'de, gerekçesiz `#[ignore]` ve `.skip/.only` yok; her `#[allow]` gerekçeli (Clippy). Ses yolundaki dizi indekslemesi lint'le kapatılmadı: yüzlerce DSP satırı, testlerle sınırlı (bilinçli karar)                                                                                                                                                                                                                                                                                                       |
| G18  | düzeldi      | README, CLAUDE.md güncel; `check:docs` CLAUDE.md ağacını dosya ağacıyla karşılaştırır                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| G19  | düzeldi      | Günlükte derleme kodu ve Windows sürümü; hata formu güncel, sürüm zorunlu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| G20  | kısmen       | Durdur, çal, sarma ve parametrik EQ kaydı kilit dışında. Aygıt kurtarma hâlâ durum sorgusunun içinde (ses zaten kesik olduğundan etkisi kısa)                                                                                                                                                                                                                                                                                                                                                                                                              |
| G21  | düzeldi      | Komut sözleşmesi argüman ve dönüş türlerini karşılaştırır (55 komut); ayrıştırıcının testleri                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G22  | çoğu düzeldi | MSRV 1.90; Dependabot, SECURITY.md, haftalık tarama ve Scorecard; CSP sıkı ve Edge'de sınanıyor; tarayıcı kısayolları kapalı; birimler arası taşıma; GPL metni ve MIT bildirimleri programda; gösteri etiketli ve güvenli moda uyuyor; tek atomik yazma modülü; ayarlar ileriye uyumlu; TS sınırları Rust'la testle karşılaştırılıyor; bozuk veritabanı denetimi; `npm audit` derleme araçlarını da kapsıyor (Vite açıkları kapandı); yayın adımı sırası. Açık: komutların disk yolu sınırlaması (KAB-08; uzak içerik olmadığı için derinlemesine savunma) |

### 9.1 Düzeltmeler sırasında bulunanlar

- **Vite 8.3.2'de yüksek önemli açıklar** (geliştirme sunucusu): `npm audit` yalnızca pakete girenlere bakıyordu.
  Kapsam genişletilince ortaya çıktı; 8.3.5'e geçildi.
- **`main`'den gelen yeni komutun dönüş türü** (`visual_waveform`, ham bayt): tür denetimli komut sözleşmesi ilk
  çalışmasında yakaladı; ayrıştırıcıya bu tür öğretildi.
- **Oturum işareti, klasör henüz yoksa yazılamıyordu:** testi yakaladı, düzeltildi.

### 9.2 Yeniden puanlama

Düzeltmelerden sonra kod, ilk denetimi görmemiş yeni bağımsız denetçilere aynı kural metniyle puanlatıldı. Sonuç
bölüm 10'da.
