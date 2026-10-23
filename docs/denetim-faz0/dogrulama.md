# Doğrulama turu — Faz 0 denetim bulguları (Bölüm A + Bölüm B)

Denetlenen commit: `94bc3d6`. Deneyler `dogrulama/` altındaki kopyada yapıldı. Depoya yazılmadı, depoda derleme
yapılmadı. Uygulamanın tam derlemesi için derleme önbelleğini (8,2 GB) kopyalama adımı reddedildi. Bu yüzden
ISK-02'deki tetik adayı çalıştırılmadı; kod ve hesapla gösterildi.

Kararlar şunlardır. **Doğrulandı**: iddia doğru. **Kısmen**: iddia gerçek ama abartılı ya da senaryosu dar.
**Çürütüldü**: iddia yanlış. **Doğrulanamadı**: Windows ya da GitHub ayarı gerekiyor.

## Özet tablo

| Bulgu kodları                                | Karar                                           | Önerilen önem                      | Tek cümle                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0-01, YAY-01, KAP-01                        | Doğrulandı (mekanizma); son halka Doğrulanamadı | **Yüksek** (Kritik değil)          | `branches` süzgeci yalnızca dal adına bakıyor ve olay türü ya da depo denetimi yok. Sömürmek için ilk katkı onayı ya da daha önce birleşmiş bir katkı gerekiyor.  |
| YAY-02                                       | Kısmen                                          | Orta (G1 kapanınca Düşük)          | Tek başına sömürülemez. G1'in kalıcılaştırıcısıdır: etiket taşıma reddedilse bile zehirli önbellek sonraki meşru sürüme girer. Önerilen `save-if: false` yetmez.  |
| F0-02, YAY-06, BEL-01                        | Kısmen                                          | **Orta**                           | 301 yönlendirmesi ve hesap adının değiştiği kanıtlı. Adın boşta olup olmadığı ve depo adının emekliye ayrılıp ayrılmadığı doğrulanamadı.                          |
| F0-03, YAY-04                                | Doğrulandı                                      | Orta                               | `main` korumasız (`Branch not protected`, rulesets `[]`). Windows işi push'ta çalışmıyor. Uygulamada 60 PR'ın 60'ı yeşil birleşmiş.                               |
| F0-04, KAB-03, BEL-02, ISK-08 (klasör kısmı) | Doğrulandı                                      | Düşük–Orta (Orta kabul)            | `com.lyraska.app` hiçbir zaman gerçek klasör adı olmadı. "Ikisi de güvenle silinebilir" sözü işaretleri ve klasör listesini kaybettirebilir.                      |
| BEL-03                                       | Doğrulandı                                      | Düşük                              | A0 adımı Roaming klasörünü tarif ediyor. Local'da kütüphane varken geri yüklenen yedek hiç açılmaz.                                                               |
| YAY-03 (+F0-05)                              | Kısmen                                          | Düşük                              | Belge doğru ("Last commit on default branch"). Başarılı bir yayında ayrışma penceresi çok dar. Yalnızca iptal edilmiş bir çalıştırmada görüldü.                   |
| YAY-05, KAB-05                               | Doğrulandı                                      | Düşük                              | İmza ve provenance yok, ama bu durum belgelenmiş ve kabul edilmiş. Yazılımcı olmayan sahip attestation doğrulaması da yapmaz.                                     |
| KAB-01                                       | Doğrulandı                                      | Düşük (Orta değil)                 | Deneyde `{}` biçimi yalnızca `<unknown>` yazdı, `{:#}` biçimi adresleri yazdı. Ancak panik mesajı ve `dosya:satır` zaten günlüğe yazılıyor.                       |
| KAB-02                                       | Doğrulandı                                      | Orta                               | Pencere kullanıcının `setup`'ından önce açılıyor ve hata `panic!` oluyor. `lib.rs`'teki Err dalı pencere ya da WebView2 hatası için hiç çalışmaz.                 |
| KAB-04 (+F0-09, ISK-11)                      | Doğrulandı                                      | Düşük                              | Tek örnek koruması yok ve son yazan kazanıyor. Ama iki pencere görünür durumda ve zarar geri alınabilir.                                                          |
| KAP-02, YAY-08, F0-13                        | Doğrulandı                                      | Düşük                              | Elle başlatma her daldan, CI'siz yayımlıyor. Bunun için yazma yetkisi gerekiyor.                                                                                  |
| KAP-03, BEL-04, F0-10                        | Doğrulandı                                      | Orta                               | Kendi mutasyon denemem: `GPL-2.0-only`, `(MIT OR Apache-2.0) AND BUSL-1.1`, `""` ve `Proprietary` çıkış kodu 0 verdi; AGPL çıkış kodu 1 verdi.                    |
| KAP-04, F0-11                                | Doğrulandı                                      | Düşük                              | Betik yalnızca HEAD'deki dosya adlarına bakıyor. Ama `.gitignore` aynı uzantıları zaten engelliyor. Kazara eklemek için `-f` gerekir.                             |
| KAP-05                                       | Doğrulandı                                      | Düşük (tek satır, hemen yapılmalı) | `npx eslint . --max-warnings 0` bugün **çıkış kodu 0** veriyor: kural eklenince hiçbir şey kırmızıya dönmüyor.                                                    |
| KAP-06                                       | Doğrulandı                                      | Düşük                              | `indexing_slicing` kapalı, `unsafe_code` ise `deny` düzeyinde ve `#[allow]` ile aşılabiliyor. Ses yolunda indeksleme lint'i açmak çok satır değiştirir.           |
| BEL-05, F0-07                                | Kısmen                                          | Düşük                              | README eskimiş ("crossfeed planned", "five WebGL2 scenes"). Ama ROADMAP Faz 2'yi "tamamlandı" diye işaretlemiyor, yani programdaki "Faz 2" yazısı savunulabilir.  |
| BEL-06                                       | Doğrulandı                                      | Düşük                              | README'deki blokta `npm run build` ve `cargo fetch --target` yok. İkinci `cd src-tauri` de aynı kabukta çalışmaz.                                                 |
| BEL-07, F0-08                                | Doğrulandı                                      | Düşük                              | `CLAUDE.md` içinde `data_dirs.rs` geçmiyor (`grep` boş).                                                                                                          |
| BEL-08                                       | Doğrulandı                                      | Düşük                              | Açılış satırı yalnızca `windows x86_64` yazıyor, derleme kodu yok. Form ise "Windows sürümü dosyada var" diyor.                                                   |
| ISK-01                                       | Kısmen                                          | Düşük                              | Kilit altında yapılan iş gerçek. Ama kullanıcının fark edeceği tek durum çalarken parametrik EQ sürüklemesi (her adımda fsync). Diğer durumlarda ses zaten kesik. |
| ISK-02                                       | Kısmen                                          | Orta                               | Mekanizma doğru. Yeni bir **tetik adayı** buldum: `sample_rate = 0xFFFFFFFF` olan bir WAV, analizde yaklaşık 8,6 GB'lık ayırmaya yol açar. Çalıştırılmadı.        |
| ISK-03                                       | Doğrulandı (deneyle)                            | Düşük–Orta                         | Vitest taklidinde arayüzde 12 işaret vardı, diskte 8 kaldı, ekran "kayıtlı" dedi. Kayıp ancak ölçümden sonra hiç değişiklik yapılmazsa kalıcı olur.               |
| ISK-04                                       | Kısmen                                          | Düşük                              | Kapı tür denetimi vaat etmiyor. Tür hatası, komut ilk çağrıldığında görünür bir hata olarak çıkar.                                                                |

---

## G1 — Fork'tan gelen PR resmî test sürümünü değiştirebilir (F0-01, YAY-01, KAP-01)

**Kanıt (kendim yeniden kurdum):**

- `test-surumu.yml:13-16` iş akışını `workflow_run` ile `branches: [main]` üzerine bağlıyor. `:35` yalnızca
  `conclusion == 'success'`'e bakıyor. `:48-52` `workflow_run.head_sha`'yı checkout ediyor. `:141` etiketi zorla
  `$SHA`'ya taşıyor. `ci.yml:12` `pull_request` olayını süzgeçsiz dinliyor.
- GitHub belgesi (`events.md:1201`): _"specify what branches the triggering workflow must run on"_.
  `secure.md:123`: _"must not explicitly check out untrusted code, including from pull request forks"_.
  `events.md:1240`'daki belge örneği, fork PR'ından tetiklenen `workflow_run` kalıbının ta kendisi.
- Deponun kendi API verisi: `CI pull_request ccr-d3f9d699-drmntz` çalıştırmaları (39830344872, `success`)
  `Test sürümü`'nü **tetiklemedi**. Tetiklenen `workflow_run` çalıştırmalarının `head_branch` değeri hep `main`.
  Yani süzgeç kaynak dalın adına bakıyor. Depo bilgisi ayrı bir alanda (`head_repository`) duruyor.
- Fork PR'larında `head_branch` değerinin fork'taki dalın düz adı olduğu GitHub'ın bilinen davranışıdır. Burada
  deneyle doğrulanamadı: depoda hiç fork yok (`forks: 0`) ve oturum başka depoları sorgulayamıyor.
- `actions/checkout`'un SHA ile fork commit'ini çekmesi, bilinen `pull_request_target` + `head.sha` kalıbıyla aynı
  mekanizmadır. PR commit'leri taban depoda `refs/pull/N/head` altında tutulur.
- Etiket API'sinin fork commit'ini kabul edip etmediği **doğrulanamadı**. Reddedilirse `set -euo pipefail` yayını
  durdurur ve exe değişmez. **Ancak** `derle` işinde saldırganın `build.rs`'i ve npm betikleri yine de çalışır.
  Bu kod Actions önbelleğine (varsayılan dal kapsamı) yazabilir ve zehir bir sonraki **meşru** yayına girer (G2).
  Yani etiket taşımanın reddedilmesi zinciri kırmaz, yalnızca geciktirir.
- Fork PR'ı için onay ayarı okunamadı (vekil sunucu `actions/permissions/*` için 403 döndü). Varsayılan ayarda ilk
  katkı onay ister.

**Önem: Yüksek.** Etki kritik: resmî linkten yabancı kod dağıtılır ve ilk kurban sahibin kendisidir. Ama olasılığı
iki şey sınırlıyor: bir insanın "Approve and run" düğmesine basması (ya da saldırganın daha önce birleşmiş bir
katkısı olması) ve deponun hiç fork'u olmayan küçük bir proje olması. Kötü niyet gerekmeyen bir yol da var: fork'unun
`main` dalından iyi niyetli PR açan biri, birleşmemiş kodunu resmî linke koymuş olur.

**Düzeltmenin değerlendirmesi:** `workflow_run.event == 'push'` ve
`head_repository.full_name == github.repository` koşulları doğru ve yeterli. Ek olarak `$SHA`'nın `main`
geçmişinde olduğu denetlenmeli (compare API). Bu denetim "Re-run" ile eski bir sürümün geri yayımlanmasını
engellemez. Daha sağlam yol, `$SHA`'nın `main`'in ucuna eşit olmasını istemektir. Yan etkisi yok. Düzeltmeden sonra
Actions önbelleğindeki `derle` girdileri bir kez silinmeli.

## G2 — Yayın derlemesi önbellekle yapılıyor (YAY-02)

**Kanıt:** API'den alınan adım süreleri (10 başarılı yayın):

- Önbellek tam isabet ettiğinde `tauri build` 235–335 sn sürüyor. Bu çalıştırmalarda `Post rust-cache` 0 sn.
- Önbellek kaydedilen (kısmi ya da önekle geri yüklenen) çalıştırmalarda 451–642 sn sürüyor ve `Post` 33–40 sn.

Bu sayılar önek eşleşmesiyle geri yüklemenin gerçekte yaşandığını gösteriyor.

**Gerekçe:** Tek başına sömürü yolu yok: PR önbellekleri `main` kapsamına geçmez. G1'in kalıcılaştırıcısıdır.

**Düzeltmenin değerlendirmesi:**

- Önerilen `save-if: false` **yetmez**. `derle` işinde çalışan herhangi bir kod (`ACTIONS_RUNTIME_TOKEN` ile) önbelleğe
  kendisi yazabilir. Asıl koruma, yayın işinde **geri yüklemeyi** kaldırmaktır.
- Maliyeti, ölçülen değerlere göre yayın başına yaklaşık +5–8 dk (soğuk derleme 10–12 dk tahmini). Kabul edilebilir.
- `setup-node cache: npm` daha az risklidir, çünkü `npm ci` paketleri kilit dosyasındaki `integrity` özetiyle
  doğrular.

## G3 — Eski hesap adı (F0-02, YAY-06, BEL-01)

**Kanıt:**

- `curl -sSI …/gozlemesevdalisi/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe` → **301** →
  `lahmacunveayran/…`.
- Aynı e-postayla GitHub'ın kendi merge commit'leri 14 Ekim'e kadar `gozlemesevdalisi`, 16 Ekim'den sonra
  `lahmacunveayran` adını taşıyor. Bir e-posta tek bir hesaba bağlı olabildiği için bu, hesabın yeniden
  adlandırıldığını gösteriyor.
- `users/gozlemesevdalisi`, `github.com/gozlemesevdalisi` ve kullanıcı araması vekil sunucuda 403 döndü. F0-02'nin
  "hesap yok, ad boşta" sözü bu oturumda **doğrulanamadı**.

**Önem: Orta.** Ad alınıp aynı adla bir `Lyraska` deposu açılırsa link saldırganın exe'sini sunar. Ama bunun için o
adı özellikle hedefleyen biri gerekir. Ayrıca CI her çalıştırmada depoyu klonladığı için, yeniden adlandırmadan önceki
hafta 100 klon eşiği büyük olasılıkla aşıldı ve depo adı emekliye ayrılmış olabilir.

**Düzeltmenin değerlendirmesi:** Doğru, birkaç satır. Bir engel var: `CLAUDE.md` "değişmesi gerekiyorsa önce proje
sahibine sorulur" diyor, linki değiştirmek için sahibin onayı gerekir. `identifier` (`tauri.conf.json:5`)
değiştirilmemeli. Eski adı boş bir hesapla geri almak en ucuz korumadır.

## G4 — `main` korumasız (F0-03, YAY-04)

**Kanıt:**

- `gh api repos/lahmacunveayran/Lyraska/branches/main/protection` → `404 Branch not protected`; `rulesets` → `[]`.
- `ci.yml:175` Windows işini yalnızca PR'da ve elle başlatmada çalıştırıyor.
- **Ek bulgu:** bu oturumun GitHub anahtarının yetkisi `admin: true`. Yapay zekâ oturumları ayarları değiştirebilir
  ve doğrudan `main`'e itebilir.

**Önem: Orta.** Bugün kural uygulamada çiğnenmiyor. Ama G1'in kapatılmasından sonra kalan tek yayın kapısı bu, ve
çalınmış bir oturum anahtarı ya da hatalı bir oturum incelemesiz yayın üretebilir.

**Düzeltmenin değerlendirmesi:** Ruleset doğru çözüm, ama ancak "bypass" listesi boşsa yönetici anahtarına karşı da
korur. Bunun için sahibe tam olarak hangi sayfada hangi düğmeye basacağı yazılmalı.

## G5 — Veri klasörü adı (F0-04, KAB-03, BEL-02, BEL-03)

**Kanıt:**

- `README.md:48-50`, `MIMARI.md:214-215`: `com.lyraska.app`.
- `tauri.conf.json:5`: `io.github.gozlemesevdalisi.lyraska`.
- `library/mod.rs:11`: kütüphaneyi hâlâ `%APPDATA%` altında gösteriyor.
- `data_dirs.rs:25`: Local'da kütüphane varsa Local döner, bu yüzden A0'da Roaming'e geri konan yedek yok sayılır.
- `lib.rs:76-105`: ayarlar, `haritalar/` ve `isaretler/` Roaming'de.
- Kütüphane veritabanı müzik klasörlerinin listesini de tutuyor. Bu yüzden "rebuilt from your music folders" sözü
  kendiliğinden gerçekleşmez; klasörleri yeniden eklemek gerekir.

**Önem:** README için Orta, A0 için Düşük. Veri kaybı için kullanıcının doğru klasörü README dışında bir yoldan
bulması ve "safely" sözüne güvenmesi gerekiyor.

**Düzeltmenin değerlendirmesi:** Doğru. Yan etkisi yok.

## G6 — `GITHUB_SHA` (YAY-03, F0-05)

**Kanıt:** `build.rs:5` önce `GITHUB_SHA`'yı okuyor. `events.md:1145`'e göre `workflow_run`'da bu değer "Last commit on
default branch". CI'de push için `cancel-in-progress: true` var. Ayrışma ancak CI'nin bitişi ile yayının tetiklenmesi
arasındaki saniyelerde gelen bir push'ta oluşur. PR kurulum dosyasında görünen kod ise (`ci.yml:208`) geçici
birleştirme commit'idir. Bu doğru ve bugün de geçerli.

**Önem: Düşük.**

**Düzeltmenin değerlendirmesi:** `git rev-parse HEAD`'i öne almak yeterli: iki iş akışında da checkout edilen commit
derlenen commit'tir. Yan etkisi yok.

## G7 — İmza ve provenance (YAY-05, KAB-05)

**Önem: Düşük.** README ve release notu durumu dürüstçe anlatıyor ve imzalama yol haritasında (Faz 4).
Attestation'ı yazılımcı olmayan sahip doğrulamaz. Asıl koruma G1 ve G4'te.

## KAB-01 — Yığın izi

**Deney:** `dogrulama/bt/` altında küçük bir program. Ayarlar projeyle aynı: `panic=abort`,
`debug=line-tables-only`, `split-debuginfo=packed`, `strip=none`. rustc 1.97.0.

| İkili                                                    | `{}`                                                                                         | `{:#}`                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `.dwp` ile                                               | adlar ve satırlar var                                                                        | adlar, satırlar ve adresler var             |
| `.dwp` olmadan                                           | adlar ve satırlar var: Linux'ta satır tablosu ikilide kalıyor, bu Windows'un karşılığı değil | aynı                                        |
| `strip` sonrası (Windows'taki PDB'siz exe'nin karşılığı) | `0: <unknown> … 10: <unknown>`, **adres yok**                                                | `0x56047ec5aed7 - <unknown>` … adresler var |

Adresler her çalıştırmada değişiyor (`main` 0x559b… ve 0x5604…), yani ASLR etkin ve adresi çözmek için bir taban
adresi gerekir.

**Önem: Düşük.** Gerekçe: `diagnostics.rs:121-136` panik mesajını ve `dosya:satır`'ı yazıyor. Çoğu hata bundan
çözülür. Ama `.pdb` saklama hattının hiçbir işe yaramadığı doğru.

**Düzeltmenin değerlendirmesi:** `{backtrace:#}` ve bir başvuru adresi (`run as usize`) yeterli. Yığın izi PDB ile
`llvm-symbolizer` üzerinden çözülebilir. `unsafe` gerekmez.

## KAB-02 — Pencere açılamazsa sessiz kapanış

**Kanıt:**

- `tauri-2.12.1/src/app.rs:2688-2699`: `setup()` önce yapılandırmadaki pencereleri `build()?` ile açıyor, kullanıcının
  setup'ını sonra çağırıyor.
- `app.rs:1441-1444`: `Ready` anında gelen `Err` `panic!("Failed to setup app: {e}")`'ye dönüyor.
- `Builder::build` (`app.rs:2408-2617`) yalnızca şu hatalarda `Err` döndürüyor: çalışma ortamı (olay döngüsü)
  kurulamazsa, çekirdek eklenti ya da menü kaydı başarısızsa, eklenti başlatılamazsa (`initialize_plugins`).
  Dolayısıyla `lib.rs:173-180`'deki "Pencere ya da WebView2 açılamadı" dalı yanlış etiketlenmiş. Bu dal nadiren
  çalışır ve çalıştığında da günlük açık olmadığı için `diagnostics::error` hiçbir şey yazmaz.
- `panic = "abort"` ve `windows_subsystem` ile kullanıcı hiçbir ileti görmez.
- Küçük bir düzeltme: "iz bırakmadan" sözü tam doğru değil. Windows Olay Günlüğü'nde bir "Application Error" kaydı
  kalır. Ama sahip bunu bilemez.

**Önem: Orta.** Olasılık düşük (WebView2 bozuk ya da kaldırılmış olmalı), ama teşhis imkânı sıfır.

**Düzeltmenin değerlendirmesi:** `diagnostics::init`'i `Builder`'dan önce çağırmak doğru. **Yan etkisi:**
`logs` klasörü Local'da önceden oluşursa `data_dirs.rs:46` (`!local.join(dir).exists()`) eski Roaming günlüklerini
taşımaz. Ya taşıma init'ten önce yapılmalı ya da bu kabul edilmeli.

## KAB-04 — Tek örnek

**Kanıt:** `settings.rs:90-100` belleğe alınan bütün ayarları her değişiklikte dosyaya yazıyor. Geçici dosya adı
sabit (`json.tmp`). Bağımlılıklarda `single-instance` yok.

**Önem: Düşük.** İki pencere açıkça görünür ve kaybolan şey tek bir ayardır.

**Düzeltmenin değerlendirmesi:** Eklenti uygun (MIT/Apache). Eklendikten sonra `npm run notices` yeniden
çalıştırılmalı.

## KAP-02, YAY-08, F0-13 — Elle başlatma

**Kanıt:** `test-surumu.yml:17`, `:35`, `:48` (yukarıda okundu).

**Önem: Düşük.** Yetkili biri gerekir. Yapay zekâ oturumlarının vekil sunucusu Actions yollarını engelliyor (403).

## KAP-03, BEL-04, F0-10 — npm lisans kapısı

**Kanıt:** Kendi mutasyon denemem (`dogrulama/lisans/`, betik o klasörden çalıştırıldı):

| `license` değeri                   | Çıkış kodu |
| ---------------------------------- | ---------- |
| `GPL-2.0-only`                     | 0          |
| `(MIT OR Apache-2.0) AND BUSL-1.1` | 0          |
| `""`                               | 0          |
| `Proprietary`                      | 0          |
| `AGPL-3.0-only`                    | 1          |

Nedeni `check-licenses.mjs:58-60`: parantezler silinip yalnızca OR'a göre bölünüyor ve boş dize `BİLİNMİYOR`'a
düşmüyor.

**Önem: Orta.** Olasılık düşük: pakete giren yalnızca 5 doğrudan bağımlılık var. Ama sonuç bir lisans ihlali olur ve
CLAUDE.md kapıyı "izin listesi" olarak anlatıyor.

**Düzeltmenin değerlendirmesi:** İzin listesi yalnızca pakete girenlere (`--omit=dev`) uygulanmalı. Yoksa dev
araçlarındaki `CC-BY-4.0` ve `BlueOak-1.0.0` lisansları CI'yi hemen kırmızıya çevirir.

## KAP-04, F0-11 — Ses dosyası kapısı

**Kanıt:** `check-no-audio.mjs` yalnızca `git ls-files` (HEAD) ve bir uzantı listesine bakıyor. `.gitignore:22-45`
aynı uzantıları zaten engelliyor; yalnızca `mid`/`midi` eksik.

**Önem: Düşük.** Geçmişe ses dosyası sokmak için önce `git add -f` gerekir.

**Düzeltmenin değerlendirmesi:** PR aralığını taramak için `fetch-depth: 0` gerekir. CI süresine etkisi küçük.

## KAP-05 — ESLint uyarıları

**Kanıt:** Kopyada `npx eslint . --max-warnings 0` → **exit 0**. `package.json:13` `"lint": "eslint ."`.

**Önem: Düşük.** Değişiklik maliyetsiz ve bugün kırmızı üretmiyor. CLAUDE.md'nin "uyarı hata sayılır" sözünü gerçeğe
çevirir.

## KAP-06 — Lint kapsamı

**Kanıt:** `Cargo.toml:47-51` yalnızca `unwrap_used`, `expect_used` ve `panic` lint'lerini açıyor.
`clippy.toml`'daki `allow-indexing-slicing-in-tests` ayarı ölü, çünkü lint zaten açık değil.

**Önem: Düşük.**

**Düzeltmenin değerlendirmesi:** `allow(unsafe_code)` için bir grep satırı ucuz ve doğru. `indexing_slicing`'i açmak
yaklaşık 188 yerde değişiklik ister (ISK'nin sayımı). Bunun yerine CLAUDE.md'deki kuralı daraltmak daha gerçekçi.

## BEL-05, F0-07 — Eski README ve "Faz 2"

**Kanıt:**

- `README.md:3-6`: "Phase 2 … in progress", "five WebGL2 scenes".
- `README.md:30`: "crossfeed planned".
- `ROADMAP.md:23`: yalnızca Faz 1 başlığında "tamamlandı" yazıyor. Faz 2 başlığı (`:53`) böyle işaretlenmemiş.

**Kısmen.** README'deki crossfeed ve sahne sayısı sözleri yanlış. Programdaki "Faz 2" yazısı ise ROADMAP'e göre
savunulabilir.

**Önem: Düşük.**

## BEL-06 — README'deki denetim bloğu

**Kanıt:** `README.md:80-86`; CLAUDE.md'nin `dist/` notu.

**Önem: Düşük.** Okurları katkı yapacak kişiler; derleme hatası hemen ve açıkça görülür.

## BEL-07, F0-08 — CLAUDE.md'nin mimari ağacı

**Kanıt:** `grep -n "data_dirs\|usePlayer\b\|useKeyboardFocus" CLAUDE.md` boş çıkıyor.

**Önem: Düşük.** Oturumlar dosya ağacını `ls` ile görebiliyor. CLAUDE.md'yi değiştirmek için sahibin onayı gerekir.

## BEL-08 — Günlükte derleme kodu ve Windows sürümü

**Kanıt:**

- `diagnostics.rs:39-44`: açılış satırında yalnızca sürüm, `OS` ve `ARCH` var.
- `hata-kaydi.yml:88`: "Windows sürümü … vardır" diyor.
- `surum` alanında `required` yok.

**Önem: Düşük.**

**Düzeltmenin değerlendirmesi:** Açılış satırına `env!("LYRASKA_COMMIT")` eklemek tek satır.

## ISK-01 — Kilit altındaki iş

**Kanıt:**

- `commands.rs:213-219` (`stop_playback`): `player.stop()` kilit altında.
- `commands.rs:540-551` (`apply_parametric`): `store.update`, yani fsync, kilit altında.
- `player.rs:1502` ve `:1644`: `visual_now` ve `status` önce `recover_device` çağırıyor; o da `:966`'da `restart`
  yapıyor.
- `useParametric.ts:86-104`: sürükleme süresince istekleri birbiri ardına gönderiyor.

**Kısmen; önem Düşük.** Aygıt değişiminde, durdurmada ve yeniden çalmada ses zaten kesik olduğu için donma fark
edilmez. Fark edilecek tek yer çalarken parametrik EQ sürüklemesi. Küçük bir dosyanın fsync'i SSD'de birkaç ms sürer;
HDD'de ya da antivirüs taraması altında daha fazla.

**Düzeltmenin değerlendirmesi:** En ucuzu kilidi `set_parametric`'ten hemen sonra bırakmak.

## ISK-02 — `panic = "abort"` ve çökme döngüsü

**Kanıt:**

- `background.rs:124`: `skip` listesi yalnızca bellekte tutuluyor.
- `lib.rs:53`: tarama açılışta başlıyor. `catch_unwind` yok.
- **Yeni tetik adayı (çalıştırılmadı):**
  - symphonia'nın WAV okuyucusu `fmt` bölümündeki örnekleme hızını doğrulamıyor
    (`symphonia-format-riff-0.6.1/src/wave/chunks.rs:421`, `common.rs:439`).
  - `decode.rs:92-94` yalnızca değerin var olmasını istiyor, sınır koymuyor.
  - `spectrogram.rs:38-44` `fft_size(4_294_967_295)` için 268 435 456 döndürüyor (hesap: `python3`).
  - `BandAnalyzer::new` (`:842-871`) ile `analyze_source` (`:583`) pencere, Hann dizisi ve karmaşık tampon için en
    az yaklaşık 8,6 GB ayırıyor; buna FFT planı eklenir.
  - Ayırma başarısız olursa Rust panik değil **abort** yapar: arka plan analizi programı kapatır, her açılışta yeniden.
- Diğer kenar değerler savunmalı: `sample_rate = 0` için `LoudnessMeter` `max(1)` kullanıyor, `frame_end(0, 0) = 0`
  olduğu için hiç kare üretilmiyor, `BandAnalyzer` `clamp` kullanıyor.

**Önem: Orta.** Gerçekçi tetik bozuk ya da kötü niyetli bir dosya; olağan bir müzik kütüphanesinde düşük olasılık.

**Düzeltmenin değerlendirmesi:** "İşleniyor" işareti doğru ve yeterli. Ek olarak `decode.rs`'te örnekleme hızına bir
sınır konmalı (ör. 8 kHz–768 kHz), yoksa "desteklenmiyor" hatası dönmeli. Bu tek satır ve bu tetiği tamamen kapatır.

## ISK-03 — Ölçüm sırasında işaret kaybı

**Kanıt:**

- `commands.rs:664-689`: oku, birkaç saniye ölç, okunan işaretleri sonuçla yaz.
- `MarkerPanel.tsx:284`: düğme `recording` durumuna bakmıyor.
- `useMarker.ts`: klavye dinleyicisi `evaluating`'e bakmıyor.
- **Deney** (`dogrulama/repo/src/hooks/yaris.test.ts`): Rust'ın oku-ölç-yaz sırasını taklit eden bir backend ile
  8 işaret kaydedildi, ölçüm başlatıldı, ölçüm sürerken 4 işaret daha eklendi ve otomatik kaydedildi (diskte 12),
  sonra ölçüm bitti. Sonuç: diskte **8**, arayüzde 12, `savedFile` boş değil (arayüz "kayıtlı" diyor). Test geçti,
  yani kayıp yeniden üretildi.
- Ek etki: ekranda gösterilen F-ölçüsü eski 8 işarete ait, ama 12 işaretin sonucu gibi görünüyor.

**Önem: Düşük–Orta.** Sonraki herhangi bir işaret bütün listeyi yeniden kaydeder. Kayıp ancak ölçümden sonra hiç
değişiklik yapılmadan şarkı değiştirilirse kalıcı olur.

**Düzeltmenin değerlendirmesi:** "Yazmadan önce yeniden oku ve karşılaştır" adımının kendisinde de küçük bir yarış
kalır. `AnnotationStore`'a yol başına süreç içi bir kilit konmalı. Ayrıca arayüzde `evaluating` sürerken işaretleme
kapatılmalı.

## ISK-04 — Komut sözleşmesi türleri görmüyor

**Kanıt:** `check-commands.mjs:26-52` yalnızca argüman adlarını ve `Option<` bilgisini çıkarıyor.

**Kısmen.** Kapı tür denetimi vaat etmiyor. Tür hatası, komut ilk çağrıldığında görünür bir hataya dönüşür.

**Önem: Düşük.**

---

## Denetçilerin kaçırdığı

1. **Oturum anahtarı depoda yönetici yetkisi taşıyor.** `gh api repos/lahmacunveayran/Lyraska` →
   `"permissions":{"admin":true,…}`. Yapay zekâ oturumları dal korumasını kapatabilir ve doğrudan `main`'e itebilir.
   G4'teki ruleset bu yüzden "bypass yok" ayarıyla kurulmalı. YAY-04 ve YAY-08'in "olası risk" başlığı altında
   kalan sorusunun cevabı budur.
2. **YAY-02 için önerilen `save-if: false` yetmez.** Önbelleğe saldırganın kodu kendisi yazabilir. Yayın işinden
   geri yüklemeyi tamamen kaldırmak gerekir. Bu, G1'deki etiket taşıma reddedilse bile zincirin tamamlanmasını sağlar.
3. **ISK-02 için somut bir tetik adayı.** `sample_rate = 0xFFFFFFFF` olan bir WAV, analizde yaklaşık 8,6 GB'tan fazla
   ayırmaya ve abort'a yol açabilir; kütüphanede kalırsa her açılışta tekrar eder (kanıtlar ISK-02 bölümünde).
   Düzeltme: `decode.rs`'te örnekleme hızını sınırlamak. Not: çalıştırılarak doğrulanmadı, çünkü tam derleme için
   önbellek kopyalama izni verilmedi.
4. **KAB-02 düzeltmesinin yan etkisi.** Günlük Local'da erken açılırsa, eski Roaming `logs/` klasörü
   `data_dirs.rs:46` yüzünden artık hiç taşınmaz.
5. **ISK-03'ün ikinci etkisi.** Ölçüm sonucu ekranda yanlış işaret kümesine ait gösteriliyor. Bu projenin beat
   F-ölçüsü kalite hedefinin ölçümünü yanıltır.
6. **KAB-01 deneyine ince bir not.** Linux'ta `split-debuginfo=packed` ile `.dwp` silinse bile satır tablosu ikilide
   kalıyor ve iz çözülüyor. Windows'un karşılığı yalnızca sembolleri silinmiş ikilidir. Denetçinin deneyi doğru
   karşılaştırmayı yapmış.
