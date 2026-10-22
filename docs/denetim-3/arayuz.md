# Faz 1 arayüzü ve üç Faz 1 sahnesi (ARA) — Denetim 1 raporu

Kaynak: main @ 94bc3d6 (0.0.56). Karşılaştırma tabanı: dbfb3e4 (0.0.50). Tarih: 22 Ekim 2026.

## 1. Kapsam ve yöntem

**Dosyalar:** `src/hooks/{usePlayback,usePlayer,useLibrary,useEqualizer,useDropToLibrary,useCover,useVisualFeed,useIdle,useDrawer,useScene,useVisualSafe}.ts`;
`src/components/{PlayerScreen,Dock,SeekBar,NowPlaying,InfoStack,LibraryPanel,EqualizerPanel,SettingsPanel,DotMatrix,SpectrumView,VuMeter,VuScene,SkyScene,SceneStage,ErrorBoundary,DropOverlay}.tsx`;
`src/lib/{queue,format,meter,dotFont,vu,sky,skyRenderer,skyFallback,gl,cover,flash,stageLight,errorReporting,backend,virtual}.ts`;
`src/styles/global.css`. Faz 1 yollarını etkileyen sonradan eklenenler de okundu: `LyricsOverlay.tsx`,
`useLyrics.ts`, `lib/lyrics.ts` (0.0.56), `useSongMap.ts`/`useSongKey.ts` (0.0.55 değişikliği),
`EqualizerPanel` görünüm sekmeleri (0.0.53), `SpectrumDemo.tsx`, `useKeyboardFocus.ts`, `lib/scene.ts`,
`scripts/check-scenes.mjs`, `main.tsx`. Çekirdekte yalnızca kanıt için: `audio/player.rs` (`playing_at`,
`song_map`, `open_next`), `visual_bridge/mod.rs` (`DISPLAY_LEAD_SECONDS`), `director/mod.rs` (güvenli mod).

**Yöntem:** `git diff dbfb3e4..HEAD` ile alandaki değişiklikler karşıt gözle okundu; DENETIM-2 A.1'deki
U2/U4/U5/U7/U8/U9/U10 ve `docs/denetim-2/arayuz.md`'deki ARA-01…17 + şüpheler bugünkü kodda tek tek yeniden
denendi; her efektin temizliği, yarışlar (eski yanıt yeni durumu eziyor mu), RAF döngüleri ve WebGL yaşam döngüsü
satır satır izlendi.

**Çalıştırılanlar (salt okunur):**

- `npx vitest run src/hooks/useVisualFeed.test.ts src/lib/gl.test.ts src/lib/lyrics.test.ts src/hooks/usePlayback.test.ts src/hooks/usePlayer.test.ts` → 5 dosya, 25 test geçti.
- `npx vitest run src/components/components.test.tsx` → 89 test geçti (57 sn).
- Deney (yalnızca scratchpad'de): `d1/arayuz/selection.test.tsx` + `d1/arayuz/vitest.config.mts` — kütüphane
  seçiminin liste değişince başka şarkıya kaydığını kanıtlar (D1-ARA-01). **Geçti** (yani hata gerçek).
- Koordinatörün notu: tam vitest, lint, tsc, prettier temiz.
- `npm run build` / `check:scenes` çalıştırılmadı (gerçek tarayıcı yok); WebGL davranışı kodla ve CI betiğiyle değerlendirildi.

## 2. Önceki bulguların durumu

| Kod          | Konu                                                                                                                                          | Bugünkü durum             | Kanıt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U2           | Boşluksuz olmayan geçiş 250 ms yoklamaya bağlı                                                                                                | **açık**                  | `usePlayer.ts:18` `POLL_MS = 250`, `:238` `setInterval`; `onEnded` yalnızca yoklamadan (`:100-106`). Çekirdek uyumsuz sıradakini kendisi açmaz: `player.rs` `open_next` kanal/hız farkında `None` döner ("şarkı normal biçimde biter"). Arayüzde olay dinleyicisi yok (`grep listen` → yalnızca sürükle-bırak). Küçültülmüş pencerede WebView2 zamanlayıcı kısılması hâlâ geçişi geciktirir.                                                                                                                                                            |
| U4 / ARA-03  | Arama sonrası eski seçim; Enter `undefined`                                                                                                   | **kısmen**                | Liste dışı seçim düşüyor (`LibraryPanel.tsx:57`), Enter korumalı (`:98-103`), test var (`components.test.tsx:984`). Ama seçim **sıra numarasıyla** tutuluyor: liste değişip uzunluk yetince seçim başka şarkıya kayar ve Enter onu çalar → **D1-ARA-01** (deneyle kanıtlı).                                                                                                                                                                                                                                                                             |
| U5 / ARA-06  | Çekmecede odak yönetimi                                                                                                                       | **kısmen**                | Açılışta odak sekmeye, kapanışta açan düğmeye (`PlayerScreen.tsx:218-228`), sekmelerde ←/→/Home/End (`:230-244`), roving `tabIndex` (`:405`); test `components.test.tsx:1016`. Kalan: `drawerTrigger` yalnızca üst çubuk düğmesinde atanır (`:255`) → **D1-ARA-07**. 0.0.53 ekolayzer görünüm sekmeleri örüntüye uymuyor → **D1-ARA-05**.                                                                                                                                                                                                               |
| U7           | Kütüphane yoklaması uçuştaki isteği izlemiyor                                                                                                 | **açık**                  | `useLibrary.ts:101` ve `:109` `setInterval(() => void refreshStatus(), …)`; `refreshStatus` (`:61-67`) sıra/uçuş denetimi yok. Yavaş bir eski yanıt (`scanning: true`) sonuncusundan sonra gelirse tarama yoklaması yeniden başlar; `removeFolder` sonucu eski bir durumla bir tur ezilebilir (kendini düzeltir).                                                                                                                                                                                                                                       |
| U8           | Harita/ton sorgusu tek hatada vazgeçer; kısayol "1–4"; EQ yüklenemezse ilk dokunuş kayıtlı ayarı siler; sürükle-bırak dinleyicisi sık kurulur | **kısmen**                | Kısayol düzeldi (`SettingsPanel.tsx:23` "1 – 5"). Açık: `useSongMap.ts:28-30` / `useSongKey` `.catch` yeniden denemez; `useEqualizer.ts:65-82` yükleme hatasında `INITIAL` kalır, `touched` (`:63`, `:112`) yüklemeyi atar ve ilk dokunuş `setEqualizer` ile düz eğri + tek değişikliği kaydeder (kayıtlı ayar ezilir); sürükle-bırak → ARA-13 satırı.                                                                                                                                                                                                  |
| U9           | Güvenli modda VU lambası 2/sn; şerit hızı                                                                                                     | **kısmen**                | Otoyol: güvenli modda çift hız yok (`highway.ts:149`), lamba 1/sn (`:164`) — 0.0.50'de de böyleydi. **VU lambası hâlâ güvenli modu bilmez:** `vu.ts:334-337` `stepLamp(remaining, needle, dt)`; `VuScene.tsx:36` `safe` geçirmez → güvenli modda da ~2 yanma/sn (sınır 3'ün altında, ama "güvenli modda ≤1" vaadinin dışında).                                                                                                                                                                                                                          |
| U10 / ARA-01 | Boşta tam hız çizim, zayıf GPU koruması                                                                                                       | **kısmen**                | (a) Boşta ≤15 çizim/sn: `useVisualFeed.ts:57,107-110`, test `useVisualFeed.test.ts:78-89`. (b) `failIfMajorPerformanceCaveat` + yazılımsal GL'de 960×540: `gl.ts:20-35,157-187`, test `gl.test.ts:69`. (c) Kare süresi bekçisi **yok**. (d) 2D yedek çizim değişmedi: tam 1080p, şerit 3 px, kare başına ~1 900 `fillRect` (`skyFallback.ts:106-110,159-178`; `canvasScale` yazılımsal sınırı almıyor). Yan etki → **D1-ARA-02**.                                                                                                                       |
| U3 / ARA-02  | Görsel veri 2–3 akış                                                                                                                          | **birleşti (doğrulandı)** | Tek paylaşımlı döngü (`useVisualFeed.ts:66-144`), uçuşta tek istek (`:111`), ≤60 istek/sn; gizli Senkron panelinin göstergesi yalnızca görünürken çalar (`SyncPanel.tsx:110` `playing && visible`).                                                                                                                                                                                                                                                                                                                                                     |
| U6           | Sahne döngüsü hatası sınıra ulaşmıyor                                                                                                         | **birleşti (doğrulandı)** | `useVisualFeed.ts:28-29,36,137-142`: hata durum olarak saklanıp çizimde fırlatılır.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ARA-04       | Üst çubuk/çalma denetimleri hata sınırı dışında                                                                                               | **birleşti (doğrulandı)** | `PlayerScreen.tsx:300-338` ve `:353-386`; test `components.test.tsx:1050` (InfoStack hatasında sahne ve çekmece ayakta). Not: 0.0.56'da sözler de bu sınırın içine girdi → D1-ARA-06.                                                                                                                                                                                                                                                                                                                                                                   |
| ARA-05       | Grid semantiği, odak göstergesi                                                                                                               | **kısmen**                | `role="gridcell"` eklendi (`LibraryPanel.tsx:313-347`), odak halkası 2 px `--vfd` (`global.css:2124-2131`). Kalan ARIA hataları → **D1-ARA-04**.                                                                                                                                                                                                                                                                                                                                                                                                        |
| ARA-07       | Parlama güvencesinin ölçmediği yollar; yorum–kod çelişkisi                                                                                    | **kısmen**                | Birim testlerine güvenli mod + azaltılmış hareket girdi (`sky.test.ts:193-216`, `highway.test.ts:178-200`). Yorum çelişkisi aslında doğru: çekirdek güvenli modda vurgu göndermez (`director/mod.rs:216-217` `(&self.safe_pulses, &[][..])`), `stageLight.ts:108` yorumu bu yüzden doğru — ama bağımlılık yazılı değil. Açık: `check:scenes` hâlâ yalnızca iki durağan uç (`check-scenes.mjs:323-350`), `visual_safe_get: false` sabit (`:62`), azaltılmış hareket, 2D yedeğin parlaması ve 0.0.56 sözleri (`track_lyrics` → `null`, `:68`) ölçülmüyor. |
| ARA-08       | Kısayol "1–4"                                                                                                                                 | **birleşti**              | `SettingsPanel.tsx:23`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ARA-09       | Soluk metin kontrastı                                                                                                                         | **açık**                  | `global.css:22` `--text-muted … 0.5`, `:27` `--ink-3 … 0.48` (değişmedi). 0.0.56 `.lyrics__next` de `--ink-3` kullanır (gölgeyle hafifletilmiş).                                                                                                                                                                                                                                                                                                                                                                                                        |
| ARA-10       | Çip "çıkar" düğmesi 18×18                                                                                                                     | **açık**                  | `global.css:2044-2048`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ARA-11       | Tuval boyutu her karede yerleşim okunarak                                                                                                     | **açık**                  | `gl.ts:177-188` `canvas.clientWidth` her `draw`'da; `skyFallback.ts:108-110` aynı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ARA-12       | `dispose` bağlamı bırakmaz                                                                                                                    | **açık**                  | `skyRenderer.ts:390-397`; depoda `loseContext` yok. Etki düşük (en eski bağlam ayrık tuvale aittir), bellek GC'ye kalır.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ARA-13       | Sürükle-bırak dinleyicisi sık yeniden kurulur                                                                                                 | **açık**                  | `useDropToLibrary.ts:47-62` `[handleDropped]`; zincir `onTracks → playAndReveal → closeDrawer` (`PlayerScreen.tsx:141-157`), `useDrawer.close` `[panel, onLeave]` (`useDrawer.ts:38-41`) → her sekme değişiminde sök/kur.                                                                                                                                                                                                                                                                                                                               |
| ARA-14 / K11 | Tarama sırasında tüm liste yeniden                                                                                                            | **açık**                  | `useLibrary.ts:84-95` bağımlılıkta `status.trackCount`; tarama yoklaması 600 ms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ARA-15       | Canlı bölge / gizli kartlar / çift duyuru                                                                                                     | **açık**                  | `.info` için `aria-hidden` yok (`InfoStack.tsx:56`); 0.0.56 söz düğmesi de `aria-pressed` + "Açık/Kapalı" deseni (`SettingsPanel.tsx:71-79`).                                                                                                                                                                                                                                                                                                                                                                                                           |
| ARA-16       | Test/tip hijyeni                                                                                                                              | **açık**                  | `useVisualFeed.test.ts:32,36` hâlâ `barBeat: null` + `as unknown as VisualFrame`; `jsx-a11y` yok; `webglcontextlost` yolu hiçbir testte tetiklenmiyor.                                                                                                                                                                                                                                                                                                                                                                                                  |
| ARA-17       | Kapak önbelleği sınırsız bayt                                                                                                                 | **açık**                  | `useCover.ts:5-15` `CACHE_LIMIT = 24` adet, bayt sınırı yok; geçici hata da `null` olarak önbelleğe girer (`:33-37`).                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ARA-Ş1       | `song_map` yola bağlı değil                                                                                                                   | **şüphe, risk düşük**     | Çekirdek "duyulan" şarkının haritasını verir (`player.rs:1568-1571` `now_playing()`), arayüz yolu değişince sorar (`useSongMap.ts:37`); yanlış etiketleme yalnızca istek ile yanıt arasında şarkı değişirse, o da bir sonraki yol değişiminde düzelir.                                                                                                                                                                                                                                                                                                  |
| ARA-Ş2       | Komuttan sonra gelen eski durum sorgusu                                                                                                       | **açık (şüphe)**          | `usePlayer.ts:241-242` yoklama yanıtı sıra numarasız uygulanır; `seenPath` mantığı (`usePlayback.ts:80-87`) sıranın kaymasını önler, ama başlık/düğme ≤250 ms geri dönebilir.                                                                                                                                                                                                                                                                                                                                                                           |

## 3. Gerileme denetimi (0.0.50 → 0.0.56)

Alandaki değişiklikler: `useVisualFeed` (boşta seyrek çizim), `gl.ts` (yazılımsal GL algılama), `PlayerScreen`
(odak yönetimi, iki yeni hata sınırı, sözler, parametrik/crossfeed/harita dosyası), `LibraryPanel` (ARA-03/05),
`EqualizerPanel` (görünüm sekmeleri, crossfeed şeridi), `SettingsPanel` (sözler, derleme kodu), `useSongMap/Key`
(`revision`), yeni `LyricsOverlay`/`useLyrics`/`lyrics.ts`, CSS'te sözler.

- **Boşta seyrek çizim (0.0.52):** Doğru ve testli; ama kısma "kimse çalmıyor" koşuluna bağlı olduğundan
  duraklatma/durdurma/şarkı sonundaki _sönme_ animasyonları da 15 kare/sn'ye düşer → D1-ARA-02. Uçuştaki bir istek
  duraklatmadan sonra dönerse `latest` eski kareyle dolar (`useVisualFeed.ts:119`), sürdürmede ilk 1–2 karede
  duraklatma öncesi kare görünür (şüpheler).
- **`getWebGl2` iki kez `getContext` (0.0.52):** HTML belirtimine göre başarısız `getContext` tuvalin bağlam kipini
  değiştirmez, ikinci çağrı geçerli. CI'daki ekran kartsız Windows Edge işi `data-webgl="on"` beklediği ve yeşil
  olduğu için yol pratikte de çalışıyor. Ancak `check:scenes` `data-gpu-caveat`'ı raporlamıyor: CI'nın hangi
  çözünürlükte ölçtüğü belli değil (şüpheler).
- **Hata sınırları (0.0.52):** Doğru yerde. Yan etki: üst çubuğun yedek görünümünde çekmece düğmeleri yok
  (`PlayerScreen.tsx:302-311`) → Ayarlar > Hata günlüğü'ne ulaşılamaz (kütüphane uyarısı dışında); düşük.
- **Odak yönetimi (0.0.52):** Ana yol doğru; kenar durumlar D1-ARA-07.
- **ARA-03 düzeltmesi:** Yalnızca liste dışı durumu kapatıyor; sıra kayması kaldı (D1-ARA-01).
- **0.0.53 ekolayzer görünüm sekmeleri:** `role="tablist"/"tab"` var ama sekme paneli, `aria-controls`, ok tuşu ve
  roving `tabIndex` yok; çekmece sekmelerinde düzeltilen örüntü burada yeniden açıldı (D1-ARA-05). 10 bantlı grafik
  ekolayzerin kendisi (sürgüler, klavye, `stopPropagation` ile ok tuşlarının şarkıyı sarmaması —
  `EqualizerPanel.tsx:63-83`) değişmedi, sağlam.
- **0.0.55 `revision`:** `useSongMap/useSongKey` efektine eklenmiş, temizlik ve `loaded.path === trackPath`
  koruması yerinde; gerileme yok.
- **0.0.56 sözler (Faz 1 ekranına etkisi):**
  - Sözler `LiveChrome` içinde, yani "Çalma denetimleri" hata sınırının içinde (`PlayerScreen.tsx:577`): sözlerde
    bir çizim hatası çal/duraklat/sarma bölümünü de kapatır (D1-ARA-06a).
  - Zaman tabanı: sözler "duyulan − ses gecikmesi" ile okunur (`PlayerScreen.tsx:377,577`), görseller "duyulan +
    1/60 sn − ses gecikmesi" (`visual_bridge/mod.rs:26,38-40`); yorum "görsellerle aynı zaman" diyor
    (`LyricsOverlay.tsx:9`). Fark ~17 ms (±20 ms bütçesinin neredeyse tamamı); aynı katmandaki drop sayacı ve
    şerit ise ses gecikmesini hiç düşmez (D1-ARA-06b).
  - Parlama: sözlerin parlaklığı yalnızca saydamlıkla, 0,12–0,25 sn geçişle değişir (`global.css:366-394`,
    `lyrics.ts:4-8`). Kaba hesap: 1920 px'te WCAG penceresi ≈ 640×480; 58 px kalın satırın mürekkep örtüsü ≈ %20–25
    → pencerenin ≈ %3'ü; beyaz yazı 0,34→1 saydamlıkta Δ ≈ 0,66 × 0,03 ≈ 0,02 < 0,10. Hızlı rap satırlarında da
    parlama eşiğinin çok altında. Azaltılmış harekette dönüşüm ve geçiş kapalı (`global.css:410-419`). Sorun yok,
    ama ölçüm yalnızca hesapla (CI'da söz yok).
  - Performans: her karede `lyricFrame` (ikili arama + kelime eşlemesi) ve kelime başına `--p` değişkeni; büyük
    `text-shadow` (18 px bulanıklık) olan metin her karede stil hesabına girer. Ölçülmedi; düşük.

## 4. Yeni bulgular (önem sırasıyla)

### [D1-ARA-01] Kütüphane seçimi sıra numarasıyla tutuluyor: liste değişince seçim başka şarkıya kayar, Enter yanlış şarkıyı çalar

- **Önem:** Orta · **Güven:** kesin (deneyle)
- **Yer:** `src/components/LibraryPanel.tsx:54-57`, `:98-103`, `:309`; tetikleyiciler `src/hooks/useLibrary.ts:84-95` (yazı, `trackCount`, analiz anahtarı değişince liste yeniden gelir), `:101` (taramada 600 ms'de bir durum).
- **Kanıt:** `const [selectedIndex, setSelected] = useState(-1)` · `const selected = selectedIndex < tracks.length ? selectedIndex : -1` · satıra tıklama `setSelected(index)` · Enter `const track = tracks[selected]; … onPlay(track, tracks)`. Deney `d1/arayuz/selection.test.tsx`: [Alfa, Beta, Gama] listesinde Beta seçilir, tazelemede listeye Ayva girer ([Alfa, Ayva, Beta, Gama]); Enter **Ayva**'yı çalar, vurgu da Ayva'ya geçer (test geçti).
- **Etki:** Klasör taranırken (ya da sürükle-bırakla ekleme sürerken) klavyeyle şarkı seçen kullanıcının vurgusu her 600 ms'lik tazelemede başka şarkıya kayabilir; Enter başka şarkıyı çalar. Aramada da yazıdan önceki seçim, yeni sonuç listesinde rastgele bir satırı vurgular. ARA-03 düzeltmesi bu durumu kapatmıyor. `aria-activedescendant` da yanlış satırı bildirir.
- **Önerilen test:** Deneydeki senaryo (`components.test.tsx`'e): seçimden sonra araya şarkı giren liste → Enter seçilen şarkıyı çalmalı; ayrıca sorgu değişince seçim düşmeli.
- **Önerilen düzeltme:** Seçimi `track.id` ile tut (`selectedId`); sıra numarası çizimde `tracks.findIndex(t => t.id === selectedId)` ile bulunur; yoksa −1. Sorgu değişince seçimi sıfırla.

### [D1-ARA-02] Boşta seyrek çizim duraklatma/durdurma sonrası sönme animasyonlarını da 15 kare/sn'ye indiriyor (ibreler ve çubuklar takılarak düşer)

- **Önem:** Düşük · **Güven:** kesin (kod); görsel etki yüksek olasılıkla fark edilir
- **Yer:** `src/hooks/useVisualFeed.ts:105-110`; `src/components/VuScene.tsx:60-67`, `src/components/SpectrumView.tsx:44-59`, `src/lib/vu.ts:303-322`, `src/lib/meter.ts` (`RELEASE_PER_SECOND = 2.4`).
- **Kanıt:** `for (const s of subscribers) playing ||= s.playing && !s.failed; if (!playing) { latest = null; if (now - lastTickAt < IDLE_TICK_INTERVAL_MS) return; }`. Kısma "kimse çalmıyor" koşuluna bağlı; sahnenin hâlâ hareket edip etmediğine bakmıyor. Duraklatınca VU ibresi (ω = 13,1 rad/s; ~0,3–0,5 sn'de dinlenmeye iner) bu sürede yalnızca 5–7 kare çizilir; spektrum çubukları tam ölçekten ~0,4 sn'de (6 kare) iner; tepe noktaları da öyle.
- **Etki:** Faz 1'in "yumuşak geçişli duraklatma" hissi görselde bozulur: duraklat/durdur/şarkı sonu anında ibreler ve noktalar kesik kesik düşer. Ses etkilenmez.
- **Önerilen test:** `useVisualFeed.test.ts`: çalan bir abone duraklatılınca, abone "hâlâ hareketli" bildirdiği sürece (ör. `tick` `true` döndürür) kare hızı 60'ta kalmalı; durgunlaşınca 15'e inmeli.
- **Önerilen düzeltme:** `tick` dönüş değeriyle ("hâlâ hareket ediyorum") ya da duraklatmadan sonra ~1 sn tam hız penceresiyle kısmayı geciktir; VU/spektrum zaten `still/idle` hesaplıyor (`VuScene.tsx:65-66`, `SpectrumView.tsx:57`), bunu döngüye bildirmek yeter.

### [D1-ARA-03] WebGL bağlam kaybı günlüğe yazılmaz; bağlam geri gelmezse gece göğü kalıcı olarak boş/donuk kalır, 2D yedeğe geçilmez

- **Önem:** Düşük · **Güven:** kesin (kod); sıklık olası (Windows'ta sürücü sıfırlaması/uykudan dönüş)
- **Yer:** `src/lib/skyRenderer.ts:350-360`, `:363`; `src/components/SkyScene.tsx:40-65`.
- **Kanıt:** `onLost = (event) => { event.preventDefault(); lost = true; }` — `reportSceneProblem` çağrılmaz; `draw` `if (lost || !resources) return;`. `onRestored` gelmezse (Chromium GPU süreci art arda çökünce sayfada WebGL'i kapatır) sahne hiç çizilmez; 2D yedek yalnızca ilk kurulumda seçilir (`SkyScene.tsx:50-60`). Hiçbir test `webglcontextlost` göndermez (ARA-16).
- **Etki:** Kullanıcı siyah/donuk bir gök görür, hata günlüğünde iz yoktur; ancak sahne değiştirip dönmek düzeltir (yeni bağlam ya da yedek). Proje sahibinin "Hata günlüğü" ile bildirebileceği bir şey kalmaz.
- **Önerilen test:** jsdom'da sahte bağlamla `canvas.dispatchEvent(new Event("webglcontextlost"))` → `logFrontendError` çağrılmalı; belirli süre (ör. 3 sn) `webglcontextrestored` gelmezse yedek çizime geçilmeli.
- **Önerilen düzeltme:** Kayıpta `reportSceneProblem(canvas, SCENE_NAME, "bağlam kaybedildi")`; zaman aşımında `SkyScene` 2D yedeğe geçsin (ya da hata sınırına "Sahne çizilemedi" düşsün, kullanıcı yeniden seçebilsin).

### [D1-ARA-04] Kütüphane grid'inin ARIA yapısı hâlâ hatalı: odak ve `aria-activedescendant` rolsüz öğede; satır sayımı başlığı saymıyor; görünmeyen satıra işaret edebiliyor

- **Önem:** Düşük · **Güven:** kesin (yapı); ekran okuyucu etkisi yüksek olasılıkla
- **Yer:** `src/components/LibraryPanel.tsx:254`, `:280-290`, `:305`.
- **Kanıt:** `role="grid" aria-rowcount={tracks.length}` dış kapsayıcıda; odaklanan öğe içerideki `div.library__list` (`tabIndex={0}`), rolü yok, `aria-activedescendant` bunun üzerinde. ARIA 1.2'ye göre `aria-activedescendant` yalnızca bileşik (grid, listbox…) ya da textbox/group/application rollerinde desteklenir; rolsüz `div`'de NVDA/Narrator görmezden gelebilir. Başlık satırı da bir satırdır: `aria-rowcount` `tracks.length + 1` olmalı, veri satırları `aria-rowindex={index + 2}`; şu an veri satırı 1 ile başlık çakışıyor. Liste sanal: fareyle kaydırınca seçili satır DOM'dan çıkar, `aria-activedescendant` olmayan `id`'ye işaret eder.
- **Etki:** ARA-05'in amacı (seçili satırın ekran okuyucuya bildirilmesi) büyük olasılıkla gerçekleşmiyor; testler yalnızca `gridcell` sayısını denetliyor.
- **Önerilen düzeltme:** `role="grid"`, `tabIndex`, `onKeyDown` ve `aria-activedescendant`'ı aynı öğeye (kaydırılan liste) taşı, başlığı `aria-hidden` olmayan ayrı bir `rowgroup` yap ya da sayımı düzelt; seçili satır görünmüyorsa `aria-activedescendant`'ı kaldır (ya da seçili satırı her zaman çiz). Alternatif: `listbox/option`.

### [D1-ARA-05] 0.0.53 ekolayzer görünüm sekmeleri ARIA sekme örüntüsünü eksik uyguluyor (ARA-06 düzeltmesinin tersine)

- **Önem:** Düşük · **Güven:** kesin
- **Yer:** `src/components/EqualizerPanel.tsx:364-385`.
- **Kanıt:** `role="tablist"` + `role="tab" aria-selected` var; `aria-controls`, `role="tabpanel"`, `id`, ←/→ gezinme ve roving `tabIndex` yok; iki sekme de Tab sırasında. Çekmece sekmelerinde aynı örüntü 0.0.52'de düzeltilmişti (`PlayerScreen.tsx:396-415`). Ayrıca ←/→ bu düğmelerde şarkıyı sarmaz (düğme "etkileşimli" sayılır, `usePlayer.ts:271`), yani tuş hiçbir şey yapmaz.
- **Etki:** Ekran okuyucu "sekme listesi" duyurur ama alışılmış tuşlar çalışmaz; tutarsızlık.
- **Önerilen düzeltme:** Çekmecedeki `onTabsKey` desenini ortak bir yardımcıya çıkar ve burada da kullan; içeriği `role="tabpanel" aria-labelledby` ile sar. Ya da iki durumlu seçim için `role="radiogroup"`/`aria-pressed` düğmeler.

### [D1-ARA-06] 0.0.56 sözleri Faz 1 ekranına iki yerden bağlanıyor: (a) çalma denetimlerinin hata sınırında, (b) zaman tabanı görsellerden ve aynı katmandaki drop sayacından farklı

- **Önem:** Düşük · **Güven:** kesin (kod); (b)'nin algılanabilirliği olası
- **Yer:** `src/components/PlayerScreen.tsx:353-386`, `:376-377`, `:577`; `src/components/LyricsOverlay.tsx:9`; `src/components/InfoStack.tsx:44-47`; `src-tauri/src/visual_bridge/mod.rs:26,38-40`; `src-tauri/src/audio/player.rs:114-141`.
- **Kanıt:** (a) `<LyricsOverlay …/>` `LiveChrome` içinde; `LiveChrome` "Çalma denetimleri" `ErrorBoundary`'sinde. İsteğe bağlı bir Faz 2+ özelliğindeki çizim hatası çal/duraklat düğmelerini, sarma çubuğunu ve şarkı adını birlikte kapatır. (b) Durumdaki konum "duyulan an"dır (`now_playing() = playing_at(0.0)`); sözler `position − audioDelaySecs` ile okunur; görseller `heard + DISPLAY_LEAD_SECONDS (1/60) − delay`. Yorum "positionSecs görsellerle aynı zamandır" diyor; fark ~17 ms. Aynı katmanda drop sayacı (`InfoStack.tsx:46`) ve şerit (`Dock` → `SeekBar`) ses gecikmesini hiç düşmez: 250 ms Bluetooth ayarında sözler doğru, sayaç 250 ms erken sıfırlanır.
- **Etki:** (a) dayanıklılık kaybı; (b) ±20 ms bütçesinin çoğu sözlerde baştan harcanmış, ekranın üç zaman öğesi üç farklı zaman tabanında.
- **Önerilen test:** `LyricsOverlay`'i hata fırlatacak biçimde enjekte et → Dock düğmeleri ayakta kalmalı. Saf bir `displayTime(heard, delayMs)` yardımcısı ve sözler/sayaç/şerit için aynı fonksiyonun kullanıldığını gösteren test.
- **Önerilen düzeltme:** Sözleri kendi `ErrorBoundary`'sine al (yedek: hiçbir şey); tek bir "ekran zamanı" yardımcısı (`heard + 1/60 − delay`) tanımlayıp sözler, drop sayacı ve şeridin oynatma konumunda kullan (sarma hedefi değişmeden duyulan an kalır).

### [D1-ARA-07] Odak dönüşü kenar durumlarda kaybolur: açılışta açık çekmece ve "Ayrıntılar" uyarısıyla açılan çekmece

- **Önem:** Düşük · **Güven:** kesin
- **Yer:** `src/components/PlayerScreen.tsx:218-228`, `:255`, `:347`; `src/hooks/useDrawer.ts:43-44`.
- **Kanıt:** `drawerTrigger.current` yalnızca üst çubuk düğmesinin `onClick`'inde atanır. Program çekmece açık başlar (`useState(true)`), `wasOpen` başta `true` → ilk kapanışta `drawerTrigger.current?.focus()` `null`'dur. Kütüphaneden Enter ile çalmak (`playAndReveal → closeDrawer`) ya da Esc, odağı `inert` olan çekmecenin içinde bırakır → tarayıcı odağı `body`'ye düşürür. Kütüphane uyarısındaki "Ayrıntılar" (`:347`) da tetikleyiciyi atamaz; kapanışta odak eski bir düğmeye ya da hiçbir yere döner.
- **Etki:** Klavye kullanıcısı ilk şarkıyı Enter'la başlatınca odağı kaybeder (ilk kullanımın tam ortası); ayrıca odak `body`'de olduğu için 4 sn sonra sinema görünümü gelir, düğmeler kaybolur.
- **Önerilen test:** Açılışta listeye odaklan → Enter → `document.activeElement` Kütüphane düğmesi olmalı.
- **Önerilen düzeltme:** Tetikleyici yoksa Kütüphane düğmesine (ya da çalma düğmesine) dön; `drawer.toggle` çağrılan her yerde tetikleyiciyi `document.activeElement`'ten al.

## 5. Şüpheler

- **[D1-ARA-Ş1] Sürdürmede eski görsel kare.** Duraklatmadan hemen önce gönderilen `visual_frame` isteği duraklatmadan
  sonra dönerse `latest = frame` (`useVisualFeed.ts:119`) duraklatma yolundaki `latest = null`'ı (`:109`) geçersiz
  kılar; sonraki çalmada ilk yanıta kadar (1–2 kare) eski an, 0,25 sn ileri alınarak gösterilir. İstek kimliğiyle
  (`playing` dönemini sayan bir sayaç) önlenir. Görünür etkisi büyük olasılıkla yok.
- **[D1-ARA-Ş2] CI'daki sahne ölçümünün çözünürlüğü.** Ekran kartsız CI'da `getWebGl2` büyük olasılıkla yazılımsal
  yola düşer ve tuval 960×540'a iner (`gl.ts:157-187`); parlama ölçümü (`check-scenes.mjs:323-350`) o zaman
  kullanıcının gerçek ekran kartlı çözünürlüğünde değil. `data-gpu-caveat` betikte raporlanmadığı için doğrulanamadı.
- **[D1-ARA-Ş3] Küçük pencerede sözler büyük başlığın altında kalabilir.** 720×560'ta (`tauri.conf.json` en küçük boyut)
  `.lyrics` üstten %16'da başlar, iki satırlık söz + çeviri + sıradaki ≈ 125 px tutar; `.lower` (`z-index: 4`) büyük
  başlıkla birlikte ~200 px'e kadar yükselebilir, sözler (`z-index: 3`) camın altında kalır. Gerçek boyutlar
  ölçülmedi.
- **[D1-ARA-Ş4] `setNextTrack` sıralaması.** `usePlayback.ts:91-95` her `upcoming` değişiminde iptalsiz komut gönderir;
  Tauri komutları eşzamanlı yürüyebildiği için art arda iki değişiklikte eski olanın sonra uygulanması kuramsal olarak
  mümkün (çekirdekte kilitli tek alan). Görülmedi.
- **[D1-ARA-Ş5] Uykudan dönüşte tema rengi sıçraması.** `stepPalette` `dt`'yi sınırlamaz (`sky.ts:255-262`; enerji
  adımları 0,25 sn ile sınırlı): uzun bir sekme uykusundan sonra tema geçişi tek karede tamamlanır. Parlaklıktan çok
  renk değişimi; parlama riski düşük.

## 6. Güçlü yanlar (kanıtla)

- **Tek görsel veri döngüsü ve hata yolu sağlam:** `useVisualFeed.ts:66-144` tek RAF, uçuşta tek istek, ≤60 istek/sn,
  `dt` eksiye düşmez (`:102`), hata sınırına taşınır (`:28-29,137-142`); boşta 15 çizim/sn testli
  (`useVisualFeed.test.ts:78-89`).
- **Çalma sırası yarışları bilinçli kapatılmış:** `seenPath` ile sıra yalnızca çalan şarkı gerçekten değişince ve
  sıranın şarkısı çalıyorduysa ilerler (`usePlayback.ts:76-87`), eski yoklama yanıtının A→B→A titremesi sırayı
  kaydırmaz; açılamayan şarkı otomatik geçişte atlanır (`:50-61`); komutlar tek uçuşta, bekleyen açılışta yalnızca
  sonuncusu (`usePlayer.ts:126-171`); sarma hedefleri birleşir (`:189-227`).
- **Parlama güvencesi katmanlı:** model hız sınırları her sahnede `dt ≤ 0,25` ile (`sky.ts:167-168`,
  `stageLight.ts:94-95`, `meter.ts`, `vu.ts:304`); birim testleri artık güvenli mod ve azaltılmış hareket
  bileşimlerinde de ≤ 2 parlama/sn ölçüyor; çekirdek güvenli modda vurgu göndermiyor (`director/mod.rs:216-217`);
  0.0.56 sözleri hesapla eşiğin ~5 katı altında (Bölüm 3).
- **Hata sınırları gerçek kapsamda:** sahne (`key` ile sahne değişince yeniden dener), üst çubuk, çalma denetimleri ve
  altı panel ayrı (`PlayerScreen.tsx:272-523`), kök sınırda yeniden başlatma (`main.tsx`), yakalanmamış hatalar tekrar
  süzgeciyle günlüğe (`errorReporting.ts:29-63`).
- **Efekt temizlikleri tutarlı:** her asenkron efekt `cancelled` bayrağı ya da sıra numarasıyla korunuyor
  (`useCover`, `useLyrics`, `useSongMap/Key`, `useEqualizer`, `useVisualSafe`, `useLibrary` arama `searchSeq`,
  `useDropToLibrary` geç gelen `unlisten`); zamanlayıcı ve dinleyiciler temizleniyor (`useIdle`, `useScene`,
  `useDrawer`, `usePlayer`).
- **Yazılımsal GPU koruması eklendi** ve birim testli (`gl.ts:20-35`, `gl.test.ts:69`); CI'daki ekran kartsız Edge işi
  WebGL yolunu gerçekten açıyor.
- **Ses yolu arayüzden etkilenmiyor:** sözler, kapaklar ve harita yalnızca IPC sorgusu; gerçek zamanlı yola dokunan
  arayüz kodu yok.
