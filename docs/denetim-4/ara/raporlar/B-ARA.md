# Arayüz, erişilebilirlik ve görsel güvenlik — Bağımsız Faz 1 denetim raporu

Denetçi: B-ARA. Kaynak: main @ 94bc3d6 (0.0.56). Tarih: 22 Ekim 2026 (ölçümler 23 Ekim'e sarktı).

## 1. Kapsam ve yöntem

**İncelenen dosyalar (tamamı okundu):** `src/main.tsx`, `App.tsx`; `components/PlayerScreen.tsx`, `Dock.tsx`,
`SeekBar.tsx`, `NowPlaying.tsx`, `InfoStack.tsx`, `LibraryPanel.tsx`, `EqualizerPanel.tsx`, `SettingsPanel.tsx`,
`DotMatrix.tsx`, `SpectrumView.tsx`, `SpectrumDemo.tsx`, `VuMeter.tsx`, `VuScene.tsx`, `SkyScene.tsx`,
`SceneStage.tsx`, `ErrorBoundary.tsx`, `DropOverlay.tsx`; `hooks/usePlayer.ts`, `usePlayback.ts`, `useLibrary.ts`,
`useEqualizer.ts`, `useDropToLibrary.ts`, `useCover.ts`, `useVisualFeed.ts`, `useIdle.ts`, `useVisualSafe.ts`,
`useDrawer.ts`, `useScene.ts`, `useKeyboardFocus.ts`, `useSongMap.ts`, `useSongKey.ts` (ve `useAbx.ts`,
`useMarker.ts` yalnızca Faz 1 yollarına etkisi için); `lib/backend.ts`, `clock.ts`, `queue.ts`, `gl.ts`,
`skyRenderer.ts`, `skyFallback.ts`, `sky.ts`, `stageLight.ts`, `flash.ts`, `sceneClock.ts`, `vu.ts`, `meter.ts`,
`scene.ts`, `virtual.ts`, `errorReporting.ts`, `usePrefersReducedMotion.ts`; `styles/global.css` (3 723 satır;
ilgili bölümler); `scripts/check-scenes.mjs`, `check-commands.mjs`; `src-tauri/tauri.conf.json`,
`src-tauri/src/commands.rs` (komut listesi), `.github/workflows/ci.yml` (sahne denetimi adımları). Toplam
arayüz kaynağı ≈ 22 500 satır (testler dahil).

**Standartlar:** WCAG 2.2 (2.1.1 klavye, 2.4.3 odak sırası, 2.4.7 odak görünür, 1.4.3 / 1.4.11 kontrast, 2.5.8 hedef
boyutu, 4.1.2 ad/rol/değer), WCAG 2.3.1 ve ITU-R BT.1702 (genel ve kırmızı parlama), WAI-ARIA 1.2 (grid, slider,
tab örüntüleri), `prefers-reduced-motion`.

**Çalıştırılan deneyler** (hepsi kendi kopyamda, `/home/user/denetim-bagimsiz/calisma/B-ARA/kopya`; `npm run build`
ile derlenen arayüz `vite preview` + Playwright 1.63 + Chromium 141 (headless, ANGLE/SwiftShader yazılımsal WebGL2)
ile açıldı; Tauri yerine `check-scenes.mjs`'ten türetilmiş **durumlu** bir sahte çekirdek kuruldu —
`denetim/harness.mjs`):

| Deney | Betik | Kanıt dosyası |
| --- | --- | --- |
| E1 Faz 1 akışları: kütüphane (Türkçe arama, klavye), çal/duraklat/durdur, sarma (ok tuşları, tıklama, sürükleme), sahneler 1–5, çekmece/sekmeler, ekolayzer, ayarlar, sinema görünümü, otomatik geçiş, pencere boyutu | `denetim/akis.mjs` | `kanit/akis.log` |
| E2 Parlama ölçümü: her sahne sanal zamanda (20 kare/sn, 3 sn) kare kare ekran görüntüsü; 8×8 piksel bloklarda bağıl parlaklık; WCAG 2.3.1 / BT.1702 ölçütleri (≥ %10 zıt değişim çifti, koyu taraf < 0,80, 341×256 CSS px pencerede ≥ %25 alan, 1 sn'de > 3); kırmızı parlama; güvenli mod ve `prefers-reduced-motion` öykünmesi; en kötü veri (4 Hz kare dalgası: bantlar 0↔1, RMS −60↔0 dBFS, ruh hâli/açılım 0↔1) ve drop profili | `denetim/parlama.mjs` | `kanit/parlama.txt`, `kanit/parlama.json`, `kanit/kare-*.png` |
| E3 Erişilebilirlik: axe-core 4.10.3 (WCAG 2.x A/AA + best-practice) açılışta, çalarken ve altı panelde; Tab sırası ve odak halkası; 24×24 hedef boyutu; kontrast (ekran görüntüsünden arka plan örnekleme) | `denetim/erisilebilirlik.mjs` | `kanit/erisilebilirlik.log` |
| E4 Kaynak sızıntısı: 50 tur gök→VU→spektrum→gök; WebGL bağlam sayısı (getContext kancası), canlı tuval (WeakRef), kare başına rAF geri çağrısı, pencere dinleyicileri, JS yığını (`--enable-precise-memory-info`, `gc()`); `WEBGL_lose_context` kaybı/geri gelişi; pencere boyutu; kare aralığı | `denetim/sizinti.mjs`, `denetim/sizinti2.mjs` | `kanit/sizinti.log`, `kanit/sizinti2.log` |
| E5 Kanıt testi (Vitest) | `src/hooks/B-ARA.denetim.test.ts` | `kanit/vitest-okTusu.txt` |
| Teşhis betikleri | `denetim/debug1-6.mjs` | çıktılar bu raporda alıntılandı |

Ayrıca `npm run check:commands` (komut sözleşmesi) çalıştırıldı.

**Ortam sınırı:** makinede ekran kartı yok; WebGL2 SwiftShader ile yazılımsal çizilir ve tam pencere sahnede bir
kare 300–700 ms sürer. Bu yüzden (a) parlama ölçümü `check-scenes.mjs`'teki gibi **sanal zamanla** yapıldı (her
kare tam 50 ms ilerler; makinenin hızından bağımsız), (b) kare süresi / 60 fps hedefi ölçülemedi (bkz. §6).

## 2. Genel değerlendirme

**Puan: 7/10.**

En güçlü yan: arayüz–çekirdek sözleşmesi (üretilen tipler + `check:commands`), hata sınırları, tek görsel döngü,
hız sınırlı parlaklık tasarımı ve bunu CI'da gerçek tarayıcıda ölçen sahne denetimi; Faz 1 akışları gerçek
tarayıcıda sıfır konsol hatasıyla çalıştı, 50 sahne geçişinde sızıntı yok, parlama ölçümünde hiçbir sahne eşiğe
yaklaşmadı.

En zayıf yan: klavye ve ekran okuyucu erişilebilirliği "dekor" düzeyinde kalmış — ARIA ızgara yapısı geçersiz
(axe iki *critical*), kütüphanede ok tuşları şarkıyı sarıyor, bazı denetimler 24×24 px altında ve odak halkasız.

Bir numaralı risk: klavyeyle kütüphanede gezinen bir kullanıcının ← / → tuşlarıyla farkında olmadan şarkıyı
sarması (B-ARA-01) — görme engelli ya da yalnız klavye kullanan herkes bunu ilk dakikada yaşar.

## 3. Bulgular (önem sırasıyla)

### [B-ARA-01] Kütüphane listesi odaklıyken ← / → tuşları şarkıyı 5 sn sarıyor

- Önem: **Orta** · Güven: **kanıtlandı**
- Yer: `src/hooks/usePlayer.ts:278-301` (genel klavye dinleyicisi), `src/components/LibraryPanel.tsx:85-104`
  (liste yalnızca ↑/↓/PageUp/PageDown/Home/End/Enter'ı ele alır), `LibraryPanel.tsx:280-291` (liste `tabIndex={0}`
  bir `div`).
- Kanıt (kod): `usePlayer.ts`
  ```ts
  const interactive = target?.closest("button, input, select, textarea, [contenteditable]");
  …
  } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !interactive && statusRef.current.track) {
    event.preventDefault();
    void seek(positionNow() + direction * SEEK_STEP_SECONDS);
  ```
  Kütüphane listesi `div[tabindex=0]` olduğu için `interactive` boş kalır; liste ←/→'ı ele almadığından olay
  pencereye kadar çıkar ve sarma yapılır.
- Kanıt (çalıştırıldı, `denetim/debug6.mjs`):
  ```
  kütüphane listesinde → : konum 5.7 → 11.0 (seek_playback çağrısı: 1)
  ```
  Kanıt testi `src/hooks/B-ARA.denetim.test.ts` (Vitest, geçti — hatayı belgeler):
  ```ts
  it("odak kütüphane listesindeyken (tabindex'li div) → tuşu şarkıyı 5 sn sarar", async () => {
    const { result } = renderHook(() => usePlayer(["flac"]));
    await act(async () => { await result.current.openPath("C:/Müzik/gece.flac"); });
    const list = document.createElement("div"); list.tabIndex = 0; list.setAttribute("aria-label", "Şarkılar");
    const grid = document.createElement("div"); grid.setAttribute("role", "grid"); grid.appendChild(list);
    document.body.appendChild(grid); list.focus(); seeks.length = 0;
    await act(async () => { pressOn(list, "ArrowRight"); });
    expect(seeks).toHaveLength(1); expect(seeks[0]).toBeCloseTo(15, 0);   // 10 s + 5 s
  });
  ```
  Çıktı: `Tests 2 passed (2)` (`kanit/vitest-okTusu.txt`).
- Etki: Klavyeyle (ya da ekran okuyucuyla) kütüphanede gezinen kullanıcı, ızgara alışkanlığıyla ← / →'a basınca
  çalan şarkı her basışta 5 sn atlar; sebebini anlamaz. Aynı durum çekmecedeki diğer odaklanabilir
  `div`'ler için de geçerli (ör. `.seekbar` dışındaki `tabindex` taşıyan kapsayıcılar).
- Önerilen düzeltme: `usePlayer`'daki `interactive` denetimine `[role=grid], [role=listbox], [role=slider],
  [role=tab], [role=tablist]` ve `[tabindex]` eklemek; sarma kısayolu yalnızca odak gövdede ya da sahnedeyken
  çalışsın. Alternatif: `LibraryPanel.onListKey` ←/→'ı `preventDefault()` ile yutsun.
- Hatayı yakalayacak test: yukarıdaki test, beklentisi `expect(seeks).toEqual([])` olarak çevrilerek.

### [B-ARA-02] Kütüphane ızgarasının ARIA yapısı geçersiz: `aria-activedescendant` rolsüz `div` üzerinde, `grid`'in çocukları izin verilen rol değil

- Önem: **Orta** · Güven: **kanıtlandı**
- Yer: `src/components/LibraryPanel.tsx:262-291`:
  ```tsx
  <div className="library__table" role="grid" aria-rowcount={tracks.length}>
    <div className="library__row library__row--head" role="row">…</div>
    <div ref={listRef} className="library__list" tabIndex={0} … aria-label="Şarkılar"
         aria-activedescendant={selected >= 0 && tracks[selected] ? rowId(tracks[selected].id) : undefined}>
      … <div role="row" aria-rowindex aria-selected …>
  ```
- Kanıt (axe-core 4.10.3, `kanit/erisilebilirlik.log`):
  ```
  - [critical] aria-allowed-attr: Elements must only use supported ARIA attributes
      · .library__list — <div class="library__list" tabindex="0" aria-label="Şarkılar" aria-activedescendant="library-row-1">
        ARIA attribute is not allowed: aria-activedescendant="library-row-1"
  - [critical] aria-required-children: Certain ARIA roles must contain particular children
      · .library__table — <div class="library__table" role="grid" aria-rowcount="300">
        Element has children which are not allowed: div[aria-label]
  ```
  (Açılışta ve kütüphane paneli açıkken tekrarlandı; diğer beş panelde axe ihlali yok.)
- Etki: Ekran okuyucu için seçili satır bildirimi (`aria-activedescendant`) rolsüz bir öğeden geldiği için
  tarayıcılar onu yok sayar: klavyeyle ↓/↑ ile gezinirken hangi şarkının seçili olduğu okunmaz; ızgaranın
  satır/sütun sayımı da bozulur. Sanal liste (yalnız görünen satırlar) zaten `aria-rowcount/rowindex` ile
  doğru kurulmuş — tek eksik rollerin doğru öğede olması.
- Önerilen düzeltme: `role="grid"`, `aria-rowcount`, `aria-label` ve `aria-activedescendant`'ı kaydırılan
  `.library__list` öğesine taşımak (odak alan öğe = ızgara); başlık satırını ve sanal satırları
  `role="rowgroup"` altına almak; ya da ızgara yerine daha basit `role="listbox"` + `role="option"`.
- Hatayı yakalayacak test: `LibraryPanel` için jsdom'da `axe-core` (ya da `jest-axe`) çalıştıran bir test
  (`aria-allowed-attr`, `aria-required-children` kuralları 0 ihlal).

### [B-ARA-03] "Kütüphaneden çıkar" düğmesi 18×18 px ve görünür odak halkası yok

- Önem: **Düşük** · Güven: **kanıtlandı**
- Yer: `src/styles/global.css:2044-2060`:
  ```css
  .chip button { … width: 18px; height: 18px; … }
  .chip button:hover, .chip button:focus-visible { color: var(--accent); background: rgba(255,255,255,0.1); outline: none; }
  ```
  `src/components/LibraryPanel.tsx:150-160` (klasör çipindeki `<button aria-label="Kütüphaneden çıkar: …">`).
- Kanıt (E3): Tab sırası 21. öğe `button "Kütüphaneden çıkar: C:/Müzik" 18×18 halka=YOK (outline=none 0px,
  shadow=yok)`; 24×24 altındaki hedefler listesi: `button "Kütüphaneden çıkar: C:/Müzik" 18×18` (arama kutusunun
  `536×18` kaydı yanlış alarm: tıklama alanı `label.library__search` ile 34 px).
- Etki: WCAG 2.5.8 (AA, 24×24) sağlanmıyor; dokunmatik/trackpad kullanıcısı klasörü yanlışlıkla çıkarabilir ya da
  isabet ettiremez. Klavye kullanıcısı için odak yalnızca %10 beyaz bir arka planla belli olur (WCAG 2.4.7 /
  2.4.11 sınırda).
- Önerilen düzeltme: düğmeyi 24×24'e büyütmek (çipin yüksekliği 24 px zaten yetiyor) ve diğer düğmelerle aynı
  `outline: 2px solid var(--ink)` halkasını vermek.
- Hatayı yakalayacak test: E3'teki hedef-boyutu taraması (24×24 altı etkileşimli öğe = 0) CI sahne denetimine
  eklenebilir.

### [B-ARA-04] Çekmece kendiliğinden kapanınca klavye odağı `body`'ye düşüyor

- Önem: **Düşük** · Güven: **kanıtlandı**
- Yer: `src/components/PlayerScreen.tsx:214-226` (odak yönetimi: `drawerTrigger.current?.focus()`), `:147-153`
  (`playAndReveal` → `closeDrawer()`), `src/hooks/useDrawer.ts:32` (çekmece açık başlar).
- Kanıt (E1): kütüphanede ↓↓↓ + Enter ile şarkı çalınıp çekmece kapandığında
  `odak (çekmece kapanınca): BODY`. Üst çubuk düğmesiyle açılıp Esc ile kapanınca ise odak doğru döner
  (`Esc: … odak=Ekolayzer`).
- Etki: Açılışta çekmece bir düğmeyle değil kendiliğinden açıldığından `drawerTrigger` boştur; Enter ile çalan
  klavye kullanıcısı bir sonraki Tab'da belgenin başından başlar (WCAG 2.4.3). Ekran okuyucu "boş" bir yerde
  kalır.
- Önerilen düzeltme: `drawerTrigger` boşsa odağı çal/duraklat düğmesine (`.play-button`) ya da ilgili üst çubuk
  düğmesine (`button[aria-label="Kütüphane"]`) vermek.
- Hatayı yakalayacak test: `PlayerScreen` testi — Enter ile çalma sonrası `document.activeElement` `body`
  olmamalı.

### [B-ARA-05] Ekolayzer sürgüsü odaklıyken 1–5 tuşları sahneyi değiştiriyor

- Önem: **Düşük** · Güven: **kanıtlandı**
- Yer: `src/hooks/useScene.ts:14-24` (yalnızca `input, textarea, select, [contenteditable]` dışlanır),
  `src/components/EqualizerPanel.tsx:56-75` (`role="slider"` olan `div`; `0` tuşu sıfırlar, `1–9` ele alınmaz).
- Kanıt (E1): `EQ sürgüde "1" tuşu: sahne sky` (önce VU seçiliydi).
- Etki: Sürgüde `0` sıfırlarken `1` sahneyi değiştirir; ayar yaparken ekran beklenmedik biçimde değişir
  (işitsel/görsel bağlam kopması). Aynı şey `.seekbar` ve kütüphane listesi için de geçerli ama orada rakam tuşu
  beklenmediğinden daha az rahatsız edici.
- Önerilen düzeltme: `useScene`'in dışlama listesine `[role=slider], [role=grid], [role=listbox]` eklemek ya da
  sahne kısayollarını yalnızca odak gövdedeyken/sahnedeyken işletmek.
- Hatayı yakalayacak test: `useScene` testi — hedefi `role="slider"` olan `keydown "1"` sahneyi değiştirmemeli.

### [B-ARA-06] İlerleme çubuğu (`role="slider"`) Home/End/PageUp/PageDown'ı desteklemiyor

- Önem: **Düşük** · Güven: **kanıtlandı**
- Yer: `src/components/SeekBar.tsx:66-79` — öğe `role="slider"`, `tabIndex`, `aria-valuemin/max/now/text` taşır ama
  hiçbir `onKeyDown`'ı yoktur; ←/→ yalnızca genel kısayol (`usePlayer`) sayesinde çalışır.
- Kanıt (E1/debug6): `seekbar Home: 12.0 → 12.4 · End: 12.4 → 12.7 · PageUp: 12.7 → 13.0` (yalnızca zamanın
  akışı; konum değişmedi), `ArrowRight: 13.0 → 18.3`.
- Etki: WAI-ARIA slider örüntüsü Home/End'i zorunlu sayar; ekran okuyucu "kaydırıcı" deyip bu tuşları önerir,
  çalışmaz. Uzun şarkıda başa/sona gitmenin klavye yolu yok (Durdur hariç).
- Önerilen düzeltme: `SeekBar`'a `onKeyDown` (Home → 0, End → süre, PageUp/Down → ±30 sn, ←/→ → ±5 sn) ve
  ok tuşları için `stopPropagation()`.
- Hatayı yakalayacak test: `SeekBar` bileşen testi — odaklı çubukta `Home` → `onSeek(0)`.

### [B-ARA-07] Sürükle-bırak dinleyicisi her sekme değişiminde sökülüp yeniden kuruluyor

- Önem: **Düşük** · Güven: **kanıtlandı**
- Yer: `src/hooks/useDrawer.ts:47-50` (`close` `panel`'e bağlı: her sekme değişiminde yeni kimlik) →
  `PlayerScreen.tsx:147-153` (`playAndReveal` → `closeDrawer`'a bağlı) → `:161` (`onTracks`) →
  `useDropToLibrary.ts:27-41` (`handleDropped`) → `:52-67` (`useEffect(…, [handleDropped])` Tauri olayını
  `unlisten` + yeniden `listen`).
- Kanıt (E1, çekirdeğe yazılan hata günlüğü): sahte çekirdekte Tauri pencere nesnesi olmadığından her kurulum
  `"Sürükle-bırak dinlenemedi: TypeError …"` yazdı — **8 kez**, tam olarak testteki sekme/çekmece değişimi
  sayısı kadar (`log_frontend_error: 8`). Gerçek programda hata değil, 8 kez gereksiz `unlisten/listen` IPC'si
  olur.
- Etki: `onDragDrop` asenkron (`await import(...)` + `listen`); sökme ile yeni dinleyici arasında bırakılan
  dosyalar sessizce kaybolur (küçük pencere, ama kullanıcı tam sekme değiştirirken bırakırsa). Ayrıca yarım
  kalan kurulum `cancelled` ile doğru kapatılmış (iyi).
- Önerilen düzeltme: `handleDropped`'ı bir `ref` üzerinden çağırmak (dinleyici bir kez kurulur), ya da
  `useDrawer.close`'u `panel`'i `ref`'ten okuyacak biçimde kararlı yapmak.
- Hatayı yakalayacak test: `useDropToLibrary` testi — `onTracks` kimliği değişince `onDragDrop` yeniden
  çağrılmamalı.

### [B-ARA-08] Şarkı haritası / ton sorguları bir IPC hatasından sonra bir daha denenmiyor; ton için şarkı başına 120 sorgu

- Önem: **Düşük** · Güven: **kesin**
- Yer: `src/hooks/useSongMap.ts:19-32`, `src/hooks/useSongKey.ts:24-37`:
  ```ts
  getSongMap().then((map) => { … else if (++tries < MAX_TRIES) timer = window.setTimeout(ask, POLL_MS); })
    .catch(() => { /* Analiz yoksa harita gösterilmez. */ });
  ```
- Kanıt (E1 komut sayımı): ~60 sn'lik oturumda `song_key: 65` çağrı (sahte çekirdek `null` döndürüyor: ton yok);
  gerçek programda güveni düşük tonlu bir şarkıda 2 dakika boyunca saniyede bir sorgu. Hata (`reject`) gelirse
  (`player.lock()` hatası — `commands.rs:696`) `catch` tekrar planlamaz: harita şeridi ve drop sayacı o şarkı
  için hiç gelmez.
- Etki: Geçici bir çekirdek hatası (kilit) şarkının haritasını kaybettirir; kullanıcı "şeridi yok" sanır.
  Faz 1 vaadi "şarkı haritası şeridi" etkilenir. Ton sorgusunun 120 denemesi önemsiz yük ama gereksiz.
- Önerilen düzeltme: `catch` içinde de `tries < MAX_TRIES` ise yeniden planlamak; çekirdekten "ton yok, bitti"
  bilgisi (`Option<Option<KeyMap>>` ya da durum bayrağı) gelince sorguyu durdurmak.
- Hatayı yakalayacak test: `useSongMap` testi — ilk `getSongMap` reddedilir, ikincisi harita döndürür; hook
  haritayı göstermeli.

### [B-ARA-09] Ekolayzer görünüm sekmeleri (`Grafik / Parametrik`) eksik ARIA sekme örüntüsü

- Önem: **Düşük** · Güven: **kesin**
- Yer: `src/components/EqualizerPanel.tsx:339-361`: `role="tablist"` + `role="tab"` var; `aria-controls`,
  `id`, `role="tabpanel"`, ok tuşu gezintisi ve `tabIndex` yönetimi yok (çekmece sekmeleri `PlayerScreen.tsx`'te
  doğru yapılmış; burada kopyalanmamış).
- Kanıt (kod; E1'de `[role=tab][aria-selected=true]` iki öğeye çözüldü, panel ilişkisi yok).
- Etki: Ekran okuyucu "sekme 1/2" der ama panelini bulamaz; ok tuşları çalışmaz (bu sekmelerdeki ok tuşu
  genel kısayola düşer — B-ARA-01 ile aynı sorun burada `button` olduğu için oluşmaz).
- Önerilen düzeltme: `PlayerScreen.onTabsKey` örüntüsünü paylaşılan bir `useTabList` kancasına çıkarıp iki yerde
  kullanmak.

### [B-ARA-10] Kapak önbelleği sınırsız boyutlu `data:` adresleri tutuyor

- Önem: **Düşük** · Güven: **olası**
- Yer: `src/hooks/useCover.ts:4-16` (`CACHE_LIMIT = 24`, modül düzeyi `Map<string, string>`),
  `src-tauri/src/audio/decode.rs:440` (`MAX_COVER_BYTES = 8 MiB`), `commands.rs:178-183` (`data_url()`).
- Kanıt (kod): kapak 8 MiB'a kadar kabul edilir → base64 ≈ 10,7 MB'lık JS dizesi; 24 kayıt → kuramsal 256 MB
  yığın; her şarkıda (ve "sıradaki" kartı için ikinci şarkıda) bu dize IPC'de JSON olarak taşınır. Olağan
  kapaklar (100 KB–1 MB) için sorun yok.
- Etki: Büyük gömülü kapaklı (ör. 3000×3000 PNG) bir kütüphanede bellek kullanımı ve şarkı geçişinde IPC
  takılması; ölçülemedi (gerçek dosya yok).
- Önerilen düzeltme: çekirdekte kapağı küçültüp (ör. 600 px JPEG) göndermek ya da önbelleği toplam bayta göre
  sınırlamak.

## 4. Doğrulanan güvenceler

- **Faz 1 akışları, gerçek tarayıcı (E1, `kanit/akis.log`):** 300 şarkılık sanal kütüphane; Türkçe duyarlı arama
  ("çığlık" → 43, "SEZEN" → 200); klavyeyle listede gezinme (`aria-activedescendant` güncellenir) ve Enter ile
  çalma; çekmece kapanır; Boşluk çal/duraklat; ←/→ sarma (+15/−5 sn); çubuğa tıklama (91,5/182) ve sürükleme
  (ipucu "00:45", bırakınca 45,8 sn; sürükleme sırasında şarkı değişirse sarmama korumasının kodu da var);
  1–5 tuşları ve düğmelerle beş sahne (`aria-pressed` doğru, WebGL `data-webgl=on`); üst çubuk düğmesi çekmeceyi
  açar ve odak seçili sekmeye gider; sekmelerde ←/→/Home/End; sekmedeyken Boşluk çal/duraklat'ı tetiklemez;
  EQ sürgüsünde ↑↓ (0,5 dB adım), ←/→ komşu banda geçer ve şarkıyı sarmaz, çift tık sıfırlar, 12 hızlı basışta son
  değer çekirdeğe ulaşır (`gainsDb[2]=6`, istek birikmez); hazır ayar ve EQ ışığı; güvenli mod düğmesi ve "Güvenli
  mod" bilgi kartı; Esc çekmeceyi kapatır (`aria-hidden`, `inert`), arama kutusundayken kapatmaz; arama kutusuna
  "1 2" yazmak sahneyi değiştirmez/çalmayı durdurmaz; Sonraki/Önceki/Durdur ve "Sıradaki" kartı; şarkı sonunda
  sıradakine geçiş; sinema görünümü (4 sn sonra `is-cinema`, Tab ile geri gelir — debug1); 720×560 ve 1920×1080'de
  yatay/dikey kaydırma yok. **Konsol hatası ve yakalanmamış istisna: 0.**
- **Parlama (E2):** [E2-SONUC]
- **Erişilebilirlik (E3):** axe: sahne + cam katmanlar (çalarken, çekmece kapalı) 0 ihlal; ekolayzer, işaretleme,
  senkron, kör test, ayarlar panelleri 0 ihlal (yalnızca kontrast "belirsiz": yarı saydam cam arka plan, elle
  ölçüldü). Tab sırası mantıklı (sahne düğmeleri → üst çubuk → çubuk → taşıma → çekmece); çekmece kapalıyken
  içine odak girmiyor (`inert`); 22 odaklanabilir öğenin 21'inde görünür halka (`outline 2px` / `box-shadow`), arama
  kutusunda `label:focus-within` kenarlığı. Kontrast (gerçek ekran görüntüsünden arka plan örneklenerek):
  sütun başlıkları 5,0:1, seçili olmayan sekme 4,6:1, bilgi kartı 7,7:1, sahne düğmeleri 9,5:1, durum satırı 5,0:1,
  süre 9,5:1, çip 7,1:1 — hepsi 4,5:1 üstünde. Hedef boyutu: tek ihlal B-ARA-03.
- **Kaynak sızıntısı (E4, `kanit/sizinti.log`):** 50 tur gök→VU→spektrum→gök: 51 WebGL2 bağlamı yaratıldı,
  canlı tuval hep 1 (eskiler çöp toplayıcıya gidiyor), bağlam kaybı olayı 0 (Chromium'un 16 bağlam sınırına
  takılma yok), kare başına rAF geri çağrısı sabit 2 (görsel döngü + akıcı konum), pencere dinleyicileri sabit
  (`keydown 4, pointermove 1, …`), JS yığını 6,7 → 6,5 MB. (Kesintiye uğrayan oturumda otoyol/sürüş turu tamamlanamadı; ilk 50 tur yeterli kanıt.)
  **Bağlam kaybı (`kanit/sizinti2.log`):** gece göğünde `WEBGL_lose_context.loseContext()` → `isContextLost=true`,
  çizim durur (ortalama parlaklık 0,115 → 0,055, CSS yedek göğü), konsol hatası 0; `restoreContext()` → gölgelendirici
  yeniden derlenir, çizim sürer (0,129 → 0,132, kıpırdıyor), `data-webgl=on`; bağlam kayıpken sahne değiştirip
  geri dönmek de temiz (`dispose` `isContextLost` denetimiyle). **Pencere boyutu:** 720×560 → tuval 360×280
  (dpr 0,5), 2560×1440 → 1280×720 (`MAX_CANVAS_PIXELS` sınırı), kaydırma çubuğu yok, hata 0.
- **Komut sözleşmesi:** `npm run check:commands` → "54 komut, arayüzde 54 çağrı; adlar ve argümanlar eşleşiyor".
  Tipler `bindings/` altından (ts-rs) geliyor; sahte çekirdeğin eksik alanı (`abx_status: null`) hook'ta
  `TypeError` verdi ve **kök hata sınırı** ("Lyraska bir hatayla karşılaştı") bütün ekranı kapattı — yani
  `PlayerScreen` içindeki hook'lar panel sınırlarının dışında; ama çekirdek sözleşmeye uyduğu sürece bu yol
  açılmaz (yarım reddedilen `invoke`'lar `catch`'le ele alınıyor, `useAbx.ts:84-95`).
- **Hata sınırları:** sahne, üst çubuk, çalma denetimleri ve altı panel ayrı `ErrorBoundary`; sahne döngüsündeki
  hata `useVisualFeed` ile bir sonraki çizimde fırlatılıp sahne sınırına ulaşıyor (`failed` bayrağı aynı hatayı
  her karede tekrarlamıyor); `installErrorReporting` yakalanmamış istisna/promise'leri tekrar süzgeciyle günlüğe
  yazıyor.
- **Güvenlik (arayüz):** `innerHTML`/`dangerouslySetInnerHTML`/`eval` yok; CSP `default-src 'self'`, `img-src
  data: blob:`, `connect-src ipc:`; lisans metni `iframe`'i aynı kaynaktan; dosya yolları yalnızca metin olarak
  (`title`) gösteriliyor.
- **Görsel tasarım kuralları (kod):** parlaklığı değiştiren tüm değerler `slew` ile ≤ 1,2/sn (güvenli modda 0,6/sn)
  — `sky.ts:181-200`, `stageLight.ts:103-110`; VU kırmızı lambası ≥ 0,5 sn yanık kalır (`vu.ts:95-98`: ≤ 2/sn,
  alanı < %0,1); sahne saatleri katlanır (`sceneClock.ts`), sarmada sıçrama yok; `prefers-reduced-motion`'da
  gösteri spektrumu durur, gök yavaşlar, kırpışma ve ölçü dalgası kapanır; gece göğü için 2D yedek çizim aynı
  `SkyState`'ten.

## 5. Şüpheler (kanıtlanamayanlar, güven "olası")

- **Eski durum yanıtı yeni şarkının üstüne (usePlayer):** `open_track` cevabı uygulandıktan sonra, ondan önce
  gönderilmiş bir `playback_status` yanıtı gelirse `applyStatus(next, false)` `trackChanged` görüp çapayı eski
  şarkıya kurar; 250 ms sonra düzelir. `seekInFlight` sarma için bu korumayı yapıyor, açma için yok
  (`usePlayer.ts:98-116`). Çekirdek komutları seri işliyorsa oluşmaz; sahte çekirdekle üretilemedi.
- **Her karede yeniden çizilen cam katman:** `LiveChrome` her karede `NowPlaying`, `InfoStack`, `Dock/SeekBar`'ı
  (bölüm `span`'ları iki katman halinde) yeniden çiziyor (`PlayerScreen.tsx:466-507`). Büyük kütüphane listesini
  bu döngüden çıkarmışlar (iyi); kalan maliyet 1080p dahili GPU'da 60 fps hedefini etkileyebilir — bu makinede
  ölçülemez.
- **Sahne değişince ilk 1–2 sn karanlık spektrum:** yazılımsal GL'de kare 500 ms sürdüğünden sahne değişiminden
  sonra 2 sn boyunca `visual_frame` hiç gelmedi (debug4: `vf` 0,0,0,0,1,2). Gerçek GPU'da kare 16 ms olduğundan
  görünmez; ama tam ekran gölgelendirici + SVG `drop-shadow` filtreleri zayıf bir makinede aynı "donma"yı
  verebilir.

## 6. Denetlenemeyenler ve sınırlar

- Gerçek ses, gerçek Tauri penceresi, WebView2 (Edge) motoru, Windows sürükle-bırak olayları — sahte çekirdek ve
  Chromium ile denendi. Sürükle-bırak yalnızca kodla incelendi (B-ARA-07).
- 60 fps / kare süresi / "1 saat takılmasız" hedefi: makinede GPU yok (SwiftShader, kare 300–700 ms); ölçüm
  anlamsız olduğu için yapılmadı. Parlama ölçümü sanal zamanla GPU'dan bağımsızdır.
- Kontrast "belirsiz" sonuçları: axe yarı saydam cam arka planı çözemez; elle örnekleme yalnızca gece göğü
  sahnesinde, orta parlaklıkta yapıldı. Daha parlak bir sahne (ör. karlı vadi, drop) üstünde beyaz olmayan
  metinlerin (sütun başlıkları 5,0:1, sekmeler 4,6:1) 4,5:1'in altına inmesi olasıdır; `glass-fill` 0,46 opaklık.
- Ekran okuyucu (NVDA/Narrator) ile gerçek okuma yapılmadı; ARIA yapısı axe ve kodla değerlendirildi.
- Highway ve Drive sahneleri (Faz 2) parlama ölçümünün "lite" turunda atlandı; CI'daki `check-scenes` onları
  ölçüyor.

## 7. Önerilen öncelik sırası

1. **B-ARA-01** — `usePlayer` kısayol süzgecine `[role=grid]`/`[tabindex]` eklemek (tek satır; klavye
   kullanıcısının ilk dakikasını kurtarır).
2. **B-ARA-02** — ızgara rollerini doğru öğeye taşımak ve `LibraryPanel` için axe testi eklemek.
3. **B-ARA-03 + B-ARA-04 + B-ARA-05 + B-ARA-06** — küçük erişilebilirlik düzeltmeleri (birlikte bir PR).
4. **B-ARA-08** — harita/ton sorgusunda hata sonrası yeniden deneme (Faz 1 vaadi "şarkı haritası şeridi").
5. **B-ARA-07, B-ARA-09, B-ARA-10** — bakım.
