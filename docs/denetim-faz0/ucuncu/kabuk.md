# Uygulama kabuğu — bağımsız denetim raporu (Faz 0)

Denetlenen: `kod` kopyası, commit `4d09cb9` (sürüm 0.0.62). Önek: KAB. Önceki denetim raporları okunmadı; koddaki
bulgu kodlarına (KAB-06, ISK-07, G13 vb.) kanıt gözüyle bakılmadı, her iddia koddan ya da Tauri/wry/tao
kaynağından doğrulandı.

## 1. Özet

- **Puan (a) depodaki kod ve yapılandırma: 8/10.** Kabuk sağlam: CSP sıkı, izinler en dar, ağ kodu yok,
  tek örnek kilidi, açılış çökmesinde uyarı kutusu, bölünmez ayar yazımı, Roaming/Local ayrımı doğru. Kusurlar
  orta ve düşük düzeyde: en önemlisi güvenlik kapısının (`check:rules`) kolayca aşılabilmesi.
- **Puan (b) GitHub ayarları ve satın alınacaklar dahil: 7/10.** `main` kural kümesiyle korunuyor (PR + 5 zorunlu
  CI denetimi). Kurulum dosyası ve program kod imzasız: SmartScreen uyarısı veriyor. İmzasız bir programın
  PowerShell başlatması da virüs programlarının şüphelendiği bir davranış.
- KAB-01 (Orta, Kanıtlandı): `check:rules` "izinler en dar, CSP sıkı" diyor ama `tauri.conf.json` içine yazılan
  bir izin tanımını, `script-src`'ye eklenen `data:`/`blob:`'u, silinen `default-src`'yi, `withGlobalTauri`'yi,
  `dangerousDisableAssetCspModification`'ı ve sürümde geliştirici araçlarını açan `devtools` özelliğini görmüyor.
  Altı değişikliğin altısında da kapı yeşil kaldı.
- KAB-02 (Düşük): kütüphane açılışı ve yarım kalan oturumdan sonraki `quick_check`, pencere açıldıktan sonra **ana
  iş parçacığında** yapılıyor. Büyük kütüphanede pencere birkaç saniye donuyor ve Windows onu "Yanıt vermiyor"
  diye işaretleyebiliyor.
- KAB-03 (Düşük): uygulama komutlarına özel bir izin tanımı (ACL, `AppManifest`) yok. 58 komutun hepsi yerel
  pencereye açık, aralarında herhangi bir dosyayı okuyan komutlar da var. İzin listesi bu yüzeyi kapsamıyor.
- KAB-04 (Düşük): açılış tamamlandıktan sonraki bir çökmede pencere sessizce kayboluyor. Sonraki açılış oturumun
  yarım kaldığını biliyor ama kullanıcıya söylemiyor.
- Temiz bulunanlar arasında şunlar öne çıkıyor: `check:commands` (4 değişikliğin 4'ünü yakaladı), Tauri'nin uzak
  adresten gelen komut çağrısını reddetmesi, WebView2'nin SmartScreen ağ denetiminin wry'de kapalı olması,
  Windows kapanışında da `RunEvent::Exit`'in çalışması.

## 2. Kapsam ve yöntem

**Okunan dosyalar:** `src-tauri/src/{lib.rs, main.rs, diagnostics.rs, data_dirs.rs, atomic_file.rs,
file_manager.rs, settings.rs, commands.rs}`, `src-tauri/{build.rs, Cargo.toml, clippy.toml, tauri.conf.json,
windows-app-manifest.xml, deny.toml ([bans])}`, `src-tauri/capabilities/default.json`, `src/main.tsx`,
`src/lib/{browserGuard.ts, errorReporting.ts, backend.ts}`, `index.html`, `scripts/{check-rules.mjs,
check-commands.mjs, webview2-imzasi.ps1}`, `scripts/check-scenes.mjs` (CSP bölümü). Bir iddiayı sınamak için
şunlara da kısmen bakıldı: `library/{db.rs, service.rs}`, `analysis/{background.rs, annotation.rs, map_file.rs}`,
`audio/peq.rs`, `useEqualizer/useParametric/useCrossfeed/useSync` hook'ları, `.github/ISSUE_TEMPLATE/hata-kaydi.yml`
ve README.

**Bağımlılık kaynağı (kilit dosyasındaki sürümler, `~/.cargo/registry`):** tauri 2.12.1 (`app.rs` setup sırası,
`webview/mod.rs` ACL kapısı), tauri-runtime-wry 2.12.1, wry 0.57.0 (WebView2 varsayılan argümanları), tao 0.37.1
(`WM_ENDSESSION`), tauri-build 2.7.1 (varsayılan manifest).

**Deneyler** (yalnızca kendi klasörümde, `is-kabuk/repo` git kopyasında; Rust derlemesi yapılmadı):

- `check-rules.mjs` üzerinde 9 değişiklik denendi (M1–M9; 2 olumlu kontrol). Sonuçlar KAB-01'de.
- `check-commands.mjs` üzerinde 4 değişiklik denendi (M10–M13). Hepsi kırmızı oldu, ayrıntı §5'te.
- 200 MB'lık bir SQLite dosyasında `PRAGMA quick_check(1)` süresi ölçüldü (Python sqlite3): 0,83 sn. Ölçüm hızlı
  bir sanal makinede yapıldı, önbelleğin sıcak mı soğuk mu olduğu belirsiz.
- `gh api repos/lahmacunveayran/Lyraska/rules/branches/main` ile herkese açık kural kümesi okundu.
- `cargo tree -i rfd --offline` çalıştırıldı (yalnızca okur).

**Sınırlar:** Windows'ta gerçek çalışma denenmedi (açılış süresi, PowerShell kutusu, WebView2 davranışı).
Önem değerlendirmeleri kod okumasına ve kaynak kodu okunan Tauri/wry/tao davranışına dayanıyor. Not: `kod`
klasöründe izlenmeyen bir `node_modules` sembolik bağı vardı; onu ben oluşturmadım ve dokunmadım.

## 3. Bulgular

### KAB-01 — `check:rules` güvenlik yapılandırmasının yalnızca bir kısmını denetliyor; altı zayıflatma yeşil geçiyor

- Önem: Orta · Güven: Kanıtlandı · Standart: Tauri 2 güvenlik modeli (capabilities, CSP); OWASP ASVS V14.4
  (HTTP güvenlik başlıkları/CSP); ISO/IEC 25010 bakım kolaylığı (test edilebilirlik)
- Yer: `scripts/check-rules.mjs:100-143`
- Kanıt: Kapı izinleri yalnızca `src-tauri/capabilities/` klasöründeki JSON dosyalarından okuyor
  (`readdirSync(join(ROOT, "src-tauri/capabilities"))`, satır 133). CSP'de yalnızca şu beş sözcüğü yasaklıyor:
  `'unsafe-eval'`, `'unsafe-inline'`, `*`, `https:`, `http:` (satır 106). Ayrıca üç yönergenin varlığını
  denetliyor (satır 109). Kopyada yapılan değişiklikler ve sonuçları:
  ```
  M1 tauri.conf.json app.security.capabilities içine {windows:["*"], permissions:["core:default",
     "dialog:default","core:webview:allow-create-webview-window"]}          exit=0 (yeşil)
  M2 script-src 'self' 'wasm-unsafe-eval' data: blob:                       exit=0 (yeşil)
  M3 "default-src 'self';" silindi                                           exit=0 (yeşil)
  M4 withGlobalTauri=true, dangerousDisableAssetCspModification=true         exit=0 (yeşil)
  M5 capabilities/default.json'a remote.urls ["https://*"]                   exit=0 (yeşil)
  M6 Cargo.toml: tauri features = ["devtools"] (sürümde geliştirici araçları) exit=0 (yeşil)
  M7 (kontrol) 'unsafe-eval'                                                 exit=1 (kırmızı)
  M8 (kontrol) "fs:default" izni                                             exit=1 (kırmızı)
  M9 capabilities/ek.toml                                                    exit=1 (kırmızı; betik JSON çözerken çöküyor)
  ```
  Tauri 2'de `app.security.capabilities` tanımlanırsa klasördeki dosyaların yerine bu liste kullanılır. M1'deki
  `core:webview:allow-create-webview-window` izni, arayüzün uzak bir adresi açan yeni bir pencere kurmasına izin
  verir. Bu da "program internete bağlanmaz" sözünü kodda tek satırla bozar.
- Senaryo ve etki: Kodu yapay zekâ oturumları yazıyor ve proje sahibi kodu okumuyor. Bir oturum bir özellik için
  izni klasör yerine `tauri.conf.json` içine ekler ya da bir kütüphane "çalışmıyor" diye CSP'ye `blob:`/`data:`
  koyar. CI yeşil kalır ve değişiklik birleşir. Bugün bir açık yok, ama "CSP sıkı, izinler en dar" sözü CI
  tarafından güvenceye alınmış değil. `check:scenes` gerçek CSP'yi Edge'de uyguluyor; ancak yalnızca `eval`'in
  engellendiğini sınıyor, `data:` betiğini sınamıyor.
- Öneri: `check-rules.mjs`'e şunlar eklenmeli: (1) `app.security.capabilities` tanımlıysa hata ver; (2)
  capabilities klasöründe JSON dışında dosya varsa açık bir mesajla hata ver; (3) her capability'de `remote`
  alanı varsa hata ver, `windows` yalnızca `["main"]` olsun; (4) CSP'yi yönergelere ayır: `default-src` ve
  `script-src` yalnızca `'self'` (+ `'wasm-unsafe-eval'`) içersin, `data:`/`blob:` yalnızca `img-src`'de olsun;
  (5) `withGlobalTauri`, `dangerousDisableAssetCspModification`, `dangerousRemoteDomainIpcAccess` ve
  `Cargo.toml`'da `devtools` özelliği yasak olsun. Her kural için `scripts/*.test.mjs` içinde bir değişiklik
  testi bulunsun.

### KAB-02 — Kütüphane açılışı ve bütünlük denetimi pencere açıldıktan sonra ana iş parçacığında yapılıyor

- Önem: Düşük · Güven: Kesin (ana iş parçacığında çalışması); Olası (süre kütüphanenin boyutuna bağlı) ·
  Standart: ISO/IEC 25010 güvenilirlik/zaman davranışı
- Yer: `src-tauri/src/lib.rs:76-112`; Tauri `app.rs:2688-2699` ve `app.rs:1442-1444`
- Kanıt: Tauri önce yapılandırmadaki pencereyi kurar, kullanıcının setup fonksiyonunu ondan sonra çağırır:
  ```rust
  // tauri-2.12.1/src/app.rs:2691
  for window_config in app.config().app.windows.iter().filter(|w| w.create) {
    WebviewWindowBuilder::from_config(app.handle(), window_config)?.build()?;
  }
  ...
  (setup)(app)
  ```
  Bu fonksiyon `RuntimeRunEvent::Ready` içinde, olay döngüsünün ana iş parçacığında çağrılıyor. Lyraska'nın
  setup'ı da aynı yerde `LibraryService::open_checked(&dir.join("library.sqlite3"), unclean)` çalıştırıyor.
  Oturum yarım kaldıysa bu çağrı `PRAGMA quick_check(1)` (`library/db.rs:132`) ve göçleri yapıyor. Ardından
  `AnalysisCache::open` aynı dosyada göçleri bir kez daha çalıştırıyor. 200 MB'lık denemede `quick_check` 0,83 sn
  sürdü. Analiz önbelleği kütüphaneyle birlikte büyüdüğü için GB düzeyinde ve HDD'de bu süre saniyeleri bulur.
- Senaryo ve etki: Elektrik kesintisi ya da çökme sonrasında, büyük kütüphanesi olan kullanıcı programı açar.
  Pencere boş (koyu) kalır ve WebView2 sayfası yüklenemez. 5 saniyeden uzun sürerse Windows pencereyi "Yanıt
  vermiyor" diye işaretler. Kullanıcı programı kapatırsa oturum işareti yerinde kalır ve bir sonraki açılışta
  aynı bekleme yeniden yaşanır. Veri kaybı yok, ama kullanıcı programın donduğunu sanabilir. Sürüm güncellemesinde
  ağır bir göç de aynı yolda çalışıyor.
- Öneri: `open_checked(.., verify=true)` adımını setup'tan çıkarın. Kütüphaneyi `verify=false` ile hemen açın,
  `quick_check`'i taramadan önce arka plan tarama iş parçacığında yapın; bozukluk çıkarsa mevcut "kenara al"
  yolunu orada çalıştırın. Ya da `LibraryState`'i `OnceLock` ile arka planda doldurun. Arayüz zaten "kütüphane
  hazırlanıyor" durumunu taşıyabiliyor.

### KAB-03 — Uygulama komutları izin sisteminin dışında: 58 komut, dosya okuyanlar dahil, yerel pencereye açık

- Önem: Düşük · Güven: Kesin · Standart: Tauri 2 güvenlik modeli (komut erişimi, App ACL manifest); OWASP ASVS
  V1.4 (erişim denetimi mimarisi)
- Yer: `src-tauri/build.rs:94` (`tauri_build::Attributes::new()`, `app_manifest` yok); `commands.rs:562-577`
  (`headphone_import(path: String)` → `std::fs::read_to_string(path)`), `commands.rs:656-668`
  (`parametric_import`), `commands.rs:203-225` (`track_cover`, `track_lyrics`), `commands.rs:330-340`
  (`library_add_folder`)
- Kanıt: Tauri'nin kapısı (`webview/mod.rs:2080`): `if (plugin_command.is_some() || has_app_acl_manifest ||
!is_local) && invoke.acl.is_none() { reject }`. Uygulamanın bir ACL manifesti olmadığı için yerel kaynaktan
  gelen her uygulama komutu izin denetimine girmeden geçiyor. `capabilities/default.json`'daki üç izin yalnızca
  eklenti ve çekirdek komutlarını sınırlıyor. Komutlar yolu arayüzden alıyor ve yolun dosya seçme penceresinden
  gelip gelmediğini denetlemiyor. Bir istisna: `milkdrop_load` yolu seçilen klasörle sınırlıyor. Kayıt yolu ise
  çekirdekte soruluyor (`ask_save_path`, satır 673), bu yüzden rastgele bir yere dosya yazılamıyor.
- Senaryo ve etki: Bugün sayfada betik çalıştırma açığı yok: `innerHTML`/`dangerouslySetInnerHTML`/`eval`
  kullanılmıyor, CSP sıkı, uzak adres yok. Bu yüzden risk uzak. Yine de günün birinde ikinci bir pencere ya da
  `iframe` eklenirse, ya da etiket/söz/preset işlenirken bir enjeksiyon olursa, saldırgan kullanıcının bütün
  dosyalarını okuyabilir. Ayrıştırıcı hataları içeriği de geri döndürür: `peq.rs:380`, 80 karaktere kadar
  satır. "İzinler en dar" sözü asıl yetki yüzeyini kapsamıyor.
- Öneri: `build.rs`'te `.app_manifest(tauri_build::AppManifest::new().commands(&[...58 ad...]))` tanımlayın ve
  `default.json`'a `allow-<komut>` izinlerini ekleyin. Liste `check:commands` ile eşleştirilebilir. Ek savunma
  olarak dosya okuyan komutlar yalnızca kütüphanedeki, bırakılan ya da seçilen yolları kabul edebilir.

### KAB-04 — Açılıştan sonraki çökme sessiz; sonraki açılış kullanıcıya bir şey söylemiyor

- Önem: Düşük · Güven: Kesin · Standart: ISO/IEC 25010 güvenilirlik (kurtarılabilirlik), kullanılabilirlik
- Yer: `diagnostics.rs:184-186`, `lib.rs:66-71`, `lib.rs:160`
- Kanıt: Uyarı kutusu yalnızca `!STARTED` iken açılıyor. `mark_started()` setup'ın sonunda çağrılıyor. Sürümde
  `panic = "abort"` (`Cargo.toml:40`) var. Sonraki açılışta `unclean` değeri yalnızca `quick_check` yapmak ve
  günlüğe "Önceki oturum düzgün kapanmamış" yazmak için kullanılıyor. Arayüzde genel bir "program beklenmedik
  biçimde kapandı" bildirimi yok (`grep -rn "kapandı\|çöktü" src` yalnızca MilkDrop'a özgü iletileri buluyor).
- Senaryo ve etki: Bir şarkı çalarken çözücüde bir panik olur ve pencere hiçbir ileti göstermeden kaybolur.
  Kullanıcı yeniden açtığında da bir şey görmez. Hata kaydı açmayı ve günlüğü eklemeyi bilmez. Program test
  sürümü olarak dağıtıldığı için bu, hata bildirimlerinin kaybolmasına yol açar.
- Öneri: `begin_session` sonucunu (ve günlükte son `[ÇÖKME]` satırının zamanını) `app_info` ya da ayrı bir
  komutla arayüze verin. Karşılama ekranında bir kez "Lyraska geçen sefer beklenmedik biçimde kapandı ·
  Hata günlüğünü göster" notu gösterin (`open_log` zaten var).

### KAB-05 — Pencere dışı ileti kutuları PowerShell ile açılıyor; kısıtlı makinede kutu çıkmıyor, virüs programları şüphelenebilir

- Önem: Düşük · Güven: Yüksek (Windows ortamına bağlı) · Standart: ISO/IEC 25010 taşınabilirlik/güvenilirlik
- Yer: `diagnostics.rs:210-244`, `diagnostics.rs:68-87` (`cmd /C ver` her açılışta)
- Kanıt: `powershell.exe -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; ..."`.
  Metin ortam değişkeniyle geçiriliyor, bu yüzden komut enjeksiyonu yok (temiz). Kodun kendi yorumu kurumsal
  makinede PowerShell'in engelli olabileceğini kabul ediyor. Constrained Language Mode'da `Add-Type`
  çalışmıyor. Oysa `rfd` 0.16.0 zaten bağımlılık ağacında (`cargo tree -i rfd` → `tauri-plugin-dialog` →
  `lyraska`) ve pencere olmadan, `unsafe` kullanmadan ileti kutusu açabiliyor.
- Senaryo ve etki: (1) WebView2 bozuk bir kurumsal makinede açılış çöker. Kullanıcıya gösterilmek istenen tek iz
  (neden + günlük yolu) PowerShell engelli olduğu için hiç görünmez. (2) İmzasız bir exe'nin her açılışta
  `cmd.exe` başlatması ve çökme anında `powershell -Command Add-Type` çalıştırması EDR/virüs programlarının
  sezgisel kurallarına takılabilir.
- Öneri: `notice_dialog` içinde `rfd::MessageDialog::new().set_title("Lyraska").set_description(text)
.set_level(..).show()` kullanın. `rfd`'yi `Cargo.toml`'a doğrudan ekleyin; aynı sürüm, yeni paket gelmez.
  PowerShell'i yalnızca bunun yedeği olarak tutun ya da tamamen kaldırın.

### KAB-06 — `atomic_file::write`: ad değiştirme başarısız olursa `.tmp` dosyası kalıyor, geçici kilide karşı yeniden deneme yok

- Önem: Düşük · Güven: Kesin (artık dosya); Olası (sıklık) · Standart: ISO/IEC 25010 güvenilirlik
- Yer: `src-tauri/src/atomic_file.rs:22-26`
- Kanıt: Yazma hatasında geçici dosya siliniyor (satır 22-24), ama `std::fs::rename(&temp, path)` (satır 26)
  başarısız olursa silinmiyor. Windows'ta hedef dosyayı paylaşmadan açık tutan bir işlem (virüs tarayıcısı,
  OneDrive/yedekleme, açık bir düzenleyici) `ERROR_ACCESS_DENIED` döndürür.
- Senaryo ve etki: Kullanıcı ekolayzeri ayarlar ve tam o anda virüs programı `settings.json`'ı tarıyordur. Ayar
  kaydedilemez, arayüz "Ekolayzer ayarı kaydedilemedi" gösterir ve klasörde `settings.json.tmp` kalır. Ayar
  bellekte geçerlidir ama yeniden açılışta eski değer gelir. Bir sonraki değişiklik dosyayı düzeltir.
- Öneri: Ad değiştirme hatasında 3 kez kısa aralıklarla (ör. 50 ms) yeniden deneyin. Yine olmazsa
  `remove_file(&temp)` çağırın. `atomic_file::tests`'e bir test eklenebilir: hedefin yerine bir klasör koyup
  ad değiştirmenin başarısız olduğu durumda `.tmp` kalmadığını sınayın.

### KAB-07 — Ayar dosyası alanlarının listesi üç yerde elle tutuluyor; uyumu denetleyen test yok

- Önem: Bilgi · Güven: Kesin · Standart: ISO/IEC 25010 bakım kolaylığı
- Yer: `settings.rs:44-53` (`KNOWN_FIELDS`), `settings.rs:161-175` (`parse_lenient`), `settings.rs:82-94` (`open`)
- Kanıt: Bugün 8 alan üç yerde de tutarlı. Ama yeni bir alan `Settings`'e eklenip `KNOWN_FIELDS`'e eklenmezse,
  yumuşak okuma yolunda alan hem varsayılana döner hem de `unknown` haritasına kopyalanır. `#[serde(flatten)]`
  ile yazılınca JSON'da aynı anahtar iki kez geçer.
- Öneri: Bir test eklenmeli: `serde_json::to_value(Settings::default())` sonucunun anahtarları `KNOWN_FIELDS`
  ile aynı küme olmalı.

## 4. Olası riskler (kanıtı yetmeyenler)

- **Kapanışta takılma + tek örnek kilidi:** `RunEvent::Exit` (`lib.rs:252-262`) arka plan analizinin iş
  parçacığını bekliyor (`background.rs:272-278`, `thread.join()`). Kod iptali destekliyor (`target.cancel()`),
  ama bir zaman sınırı yok. Bir gün bu bekleme takılırsa pencere kapanmış ama süreç açık kalır. Kilit
  bırakılmadığı için kullanıcı "Lyraska zaten açık. Görev çubuğundaki pencereye geçin" iletisini görür, ama
  geçebileceği bir pencere yoktur. Öneri: Exit'in başında, 3 sn sonra `std::process::exit(0)` çağıran bir bekçi
  iş parçacığı başlatmak.
- **WebView2 içerik süreci çökmesi:** wry 0.57 ve tauri-runtime-wry 2.12.1'de `ProcessFailed` işleyicisi yok
  (`grep` sonucu boş). WebGL/MilkDrop ağırlıklı bir arayüzde içerik sürecinin çökmesi pencereyi boş bırakır.
  Bu durum günlüğe de yazılmaz; ses çekirdekte çalmayı sürdürür. `unsafe` yasağı yüzünden doğrudan çözümü
  pahalı. Arayüzün düzenli aralıklarla çekirdeğe "hayattayım" demesi ve çekirdeğin bu sinyal kesilince
  günlüğe not düşmesi ucuz bir iz olurdu.
- **Arayüz hiç yüklenmezse iz kalmıyor:** `installErrorReporting` paketin içinde. Paket yüklenemezse (bozuk
  kurulum) günlüğe hiçbir satır düşmez. `check:scenes` CSP uyumunu sınıyor, bu yüzden CSP kaynaklı bir
  yüklenememe olasılığı düşük.
- **Günlüğe sahte satır eklenebilir:** `log_frontend_error` (`commands.rs:946-951`) satır sonlarını
  temizlemiyor. Arayüzden gelen bir mesaj `[ÇÖKME]` gibi görünen bir satır üretebilir. Yalnızca hata
  ayıklamayı yanıltır.
- **`panic = "abort"` tasarımı:** Bozuk bir ses dosyasında çözücünün paniklemesi bütün oturumu kapatır. Tarama
  ve analiz için CrashGuard var; doğrudan çalma için böyle bir koruma yok (kullanıcı aynı dosyayı yeniden
  çalarsa program yine kapanır). Bu bilinçli bir seçim, CLAUDE.md'de de yazılı. Kapsamı ses denetimine giriyor.

## 5. Temiz bulunanlar

- **CSP** (`tauri.conf.json:25`): `default-src 'self'`; `script-src` içinde `unsafe-eval` ya da
  `unsafe-inline` yok (yalnızca MilkDrop için `wasm-unsafe-eval` var); `object-src`/`base-uri`/`form-action`/
  `frame-ancestors 'none'`; `connect-src` yalnızca `'self' ipc: http://ipc.localhost`. Arayüzde
  `innerHTML`/`dangerouslySetInnerHTML`/`eval`/`new Function`/`window.open`/dış bağlantı yok (grep sonucu boş).
  `check:scenes` CSP'yi gerçek Edge'de uyguluyor ve `eval`'in engellendiğini doğruluyor
  (`check-scenes.mjs:789-808`).
- **İzinler:** yalnızca `core:event:allow-listen/unlisten` ve `dialog:allow-open` var, `windows: ["main"]`.
  Arayüz yalnızca `@tauri-apps/api/core`, `api/webview` (sürükle-bırak) ve `plugin-dialog`'u kullanıyor; bu
  izinlerle tutarlı. Kaydetme penceresini çekirdek açıyor (`ask_save_path`). `withGlobalTauri`, asset protokolü
  ve `devtools` özelliği kapalı.
- **Uzak adres:** Tauri, uzak kaynaktan gelen uygulama komutu çağrısını izin yoksa reddediyor
  (`webview/mod.rs:2076-2080`).
- **Çevrimdışı söz:** Çekirdekte ağ kodu yok (`check:rules`). `deny.toml [bans]` reqwest/hyper/ureq/
  tungstenite ile http/updater/websocket/upload/shell eklentilerini bütün bağımlılık ağacında yasaklıyor ve CI
  `cargo deny` çalıştırıyor. wry, WebView2'yi varsayılan olarak `--disable-features=...,msSmartScreenProtection`
  ile başlatıyor (`wry-0.57.0/src/webview2/mod.rs:303`), yani sayfa adresleri Microsoft'a sorulmuyor. Yazı tipi
  yerelde (`@fontsource`). Kurulum dosyasının WebView2 eksikse onu indirmesi README'de açıkça yazılı ("the
  player itself never connects"). WebView2 önyükleyicisinin Microsoft imzası CI'da denetleniyor
  (`webview2-imzasi.ps1`).
- **Arayüz–çekirdek sözleşmesi:** `check:commands` yapılan dört değişikliğin dördünü yakaladı: yanlış argüman
  adı (M10), yanlış komut adı (M11), `generate_handler!`'dan silinen komut (M12), çözülemeyen argüman türü
  (M13). Veri tipleri `ts-rs` ile üretiliyor.
- **Tek örnek:** İşletim sisteminin dosya kilidi kullanılıyor (`File::try_lock`), program çökünce kilit
  kendiliğinden kalkıyor. Kilit, göç, günlük ve oturum işaretinden önce alınıyor: ikinci kopya hiçbir dosyaya
  dokunmadan çıkıyor. Bunun bir testi var.
- **Veri klasörleri:** Küçük kullanıcı verisi Roaming'de, büyük ve yeniden üretilebilir veri ile günlükler
  Local'da. Bu, Windows uygulama verisi kurallarına uygun. Klasörler Tauri'nin kuralıyla aynı (bir testi var).
  Eski kütüphanenin taşınması ya hep ya hiç biçiminde; geri alma ve birimler arası kopyalama testli.
- **Kapanış:** `RunEvent::Exit` sırasıyla sesi durduruyor, taramayı iptal ediyor, analizi durdurup bekliyor ve
  oturum işaretini siliyor. tao 0.37.1, Windows kapanırken (`WM_ENDSESSION`) `loop_destroyed()` çağırıyor; bu da
  Tauri'de `RunEvent::Exit`'i tetikliyor. Yani bilgisayar kapanırken de kapanış düzgün yapılıyor.
- **Hata ve çökme günlüğü:** Pencereden önce açılıyor. Çökmede iş parçacığı, yer ve adresli yığın izi
  yazılıyor. Dosya 1 MB'ta döndürülüyor, döndürme başarısız olursa da yazmaya devam ediyor (testli).
  Açılıştaki çökme uyarı kutusuyla gösteriliyor. Ayrı `.pdb` CI'da saklanıyor. Arayüzdeki tekrarlayan hatalar
  süzülüyor (`createRepeatFilter`). Hata kaydı formu, günlükte kullanıcı adı ve yol geçebileceği konusunda
  kullanıcıyı uyarıyor.
- **Ayarlar:** Bölünmez yazma (`sync_all` + ad değiştirme). Bozuk tek alan yalnızca kendisini varsayılana
  döndürüyor. JSON olmayan dosya `.bozuk` adıyla saklanıyor. Okunamayan dosyanın üstüne yazılmıyor. Daha yeni
  sürümün tanımadığı alanlar korunuyor (hepsi testli). Arayüz ayar yazımlarını sıraya koyuyor (EQ/PEQ/crossfeed
  hook'larında `inFlight/pending`, senkron için zamanlayıcı).
- **Dosya gezgini ve süreçler:** `explorer`/`cmd`/`powershell` tam sistem yoluyla çağrılıyor
  (`system_program`); aynı adlı bir program PATH'ten ya da program klasöründen yüklenemiyor. `/select,"…"`
  argümanı testli. Derleme kodu `LYRASKA_COMMIT`'ten alınıyor ve doğrulanıyor (`build.rs:110-114`).
- **Rust kuralları:** `unsafe_code = "deny"`; `unwrap/expect/panic/todo/unimplemented/dbg_macro` uyarı, CI'da
  `-D warnings`; gerekçesiz `#[allow]` uyarı veriyor. Clippy Windows hedefi için de çalışıyor. Konsol penceresi
  yalnızca sürümde kapalı (`main.rs:2`). Manifest Tauri'nin varsayılanıyla aynı içerikte ve test programlarına
  da gömülüyor.
- **Tarayıcı davranışları:** Sürümde F5/Ctrl+R/P/F/U, geri/ileri ve sağ tık kapalı; metin kutularında sağ tık
  çalışıyor; yakınlaştırma erişilebilirlik için açık bırakılmış.
- **Proje sahibinin ayarına bağlı (b):**
  - `main` kural kümesi (25703689) silmeyi ve zorla push'u engelliyor, PR zorunlu, beş zorunlu denetim var
    (Arayüz, Çekirdek, Güvenlik uyarıları, Sahneler, Windows). `check:rules` ve `check:commands` "Arayüz" işinde
    çalışıyor. Onay sayısı 0; tek kişilik projede bu beklenen bir durum.
  - **Kod imzası yok** (`signtool`/`signCommand` yok; README SmartScreen uyarısını anlatıyor). Bu bir satın
    alma ya da kayıt işi (OV sertifikası, Azure Trusted Signing veya SignPath Foundation açık kaynak programı).
    KAB-05'teki PowerShell/cmd başlatma davranışı imzasız exe'de virüs programı yanlış alarmı riskini artırıyor.

## 6. Öncelikli düzeltme sırası

1. KAB-01: `check-rules.mjs`'e inline capability, `remote`, CSP yönergesi (`default-src`/`script-src` yalnızca
   `'self'`), `withGlobalTauri`/`dangerous*` ve `devtools` denetimlerini ekleyin; her biri için değişiklik testi
   yazın.
2. KAB-02: `quick_check` ve kütüphane açılışını ana iş parçacığından arka plana alın.
3. KAB-04: "Geçen sefer beklenmedik biçimde kapandı · Günlüğü göster" notunu ekleyin.
4. KAB-05: ileti kutusunu PowerShell yerine `rfd` ile açın (zaten bağımlılık ağacında).
5. Olası risk: Exit'e 3 sn'lik bir bekçi ekleyin; kapanış takılırsa kilit sonsuza dek tutulmasın.
6. KAB-03: `AppManifest` ile uygulama komutlarını izin sistemine alın.
7. KAB-06: `atomic_file`'da ad değiştirmeyi yeniden deneyin ve hata olursa `.tmp`'yi silin.
8. KAB-07: `KNOWN_FIELDS` uyum testini ekleyin.
9. (b) Kod imzası: SignPath Foundation (açık kaynak için ücretsiz) ya da Azure Trusted Signing'e başvurun.
