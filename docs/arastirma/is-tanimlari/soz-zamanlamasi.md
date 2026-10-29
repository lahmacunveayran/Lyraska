# Söz zamanlaması — ölçüm ve düzeltme (iş tanımı)

Proje sahibi (29 Ekim 2026): drop gibi sözler de "tam net" olmalı; "nihai mühendislik ve matematiksel hesap". Bu iş
programın kendi payını ölçer ve düzeltir (dosyanın kendi hatası ve sese otomatik hizalama ayrı, sonraki iş).

## Başlangıç

- Çalışma kopyası: `git -C /home/user/Lyraska fetch origin main && git -C /home/user/Lyraska worktree add
/tmp/claude-0/wt-soz origin/claude/clever-euler-pmhee7-yedek-soz -b soz-zaman` ("Kendi resmin" sözleri dalı; henüz
  birleşmedi, sahibinin onayını bekliyor). Önce `git rebase origin/main` (çakışırsa çöz; sürüm/devlog'a dokunma).
  `node_modules` ana depoya sembolik bağ (commit etme). CLAUDE.md, docs/BILGI-BIRIKIMI.md oku.
- Kod: `src-tauri/src/audio/lyrics.rs` (LRC/gömülü sözler, kelime zamanları, ofset etiketi `[offset:]`),
  `src/lib/lyrics.ts` (`lyricFrame`, `LYRIC_LEAD`, `LYRIC_TAIL`), `src/components/LyricsOverlay.tsx`,
  `PhotoLyrics.tsx`, `PlayerScreen.tsx` (`LiveChrome`, `useLivePosition`, `audioDelaySecs`), `src/lib/clock.ts`
  (akıcı oynatma saati), `src/hooks/useSync.ts` + `visual_bridge` (ses aygıtı gecikmesi, ekran gecikmesi telafisi),
  senkron kalibrasyonu (`calibration.rs`, SyncPanel).

## Yapılacak

1. **Hata bütçesi (ölç, yaz):** sözün ekranda değiştiği an ile dosyadaki zaman arasındaki farkın bütün kaynakları:
   oynatma saatinin doğruluğu (clock.ts: çekirdek konumu + yerel tahmin; sarma/duraklatma/şarkı değişimi
   sonrası), ses aygıtı gecikmesi telafisi (görsellerle aynı mı uygulanıyor; `audioDelaySecs` sözlerde doğru işaretli
   mi), ekran gecikmesi (görsellerdeki ekran telafisi sözlere de uygulanıyor mu), kare kuantalanması (60 Hz: ≤16,7 ms;
   rAF'tan mı çiziliyor, React render gecikmesi), `LYRIC_LEAD`/`LYRIC_TAIL` ve kelime ilerlemesi (`--p`) hesabı,
   CSS geçişlerinin görünür gecikmesi (opacity 0,12 s — görünür anı kaydırıyor mu?), LRC ayrıştırma (centisaniye/
   milisaniye, `[offset:]` işareti: LRC standardında pozitif offset sözü ERKEN gösterir — doğrula), kelime zamanı
   olmayan satırda kelime yayma yöntemi, gömülü (SYLT/USLT) sözlerin zaman birimi.
2. **Testler (önce hata yakalayan):** her kaynak için saf fonksiyon testleri; uçtan uca: sahte çekirdek + sanal saatle
   (check-scenes benzeri ya da Vitest'te sahte saat) sözün DOM'da görünür olduğu an = LRC zamanı − lead ± 1 kare; ses
   gecikmesi 100 ms iken söz de 100 ms gecikmeli; sarma ve duraklatma sonrası doğru. Hedef: programın payı < 1 kare
   (16,7 ms) ve görsellerle aynı senkron (±20 ms kalite hedefi).
3. **Düzeltmeler:** bulunan her sapma; gerekiyorsa sözler görsellerle aynı saat/telafi yolundan beslenir.
4. **Kullanıcı ayarı (dosyanın kendi hatası için, küçük):** şarkı başına söz kaydırma (ör. −2…+2 sn, 50 ms adım;
   kısayol tuşuyla da) ve kalıcı (şarkının yoluna göre, ses içermeyen küçük bir kayıt; mevcut ayar/işaret deposu
   desenine uy). Arayüz çekmecede ya da sözlerin yanında küçük; Türkçe metin. (Bu, sese otomatik hizalama gelene kadar
   sahibinin elle düzeltebilmesi için.)
5. Belgeler: hata bütçesi ve sonuçlar `docs/arastirma/sozler/README.md` (yeni); DOGRULAMA'ya kısa madde (bilinen bir
   şarkıda sözlerin kaymadığını, kaydırma ayarının çalıştığını denemek); CLAUDE.md ağacı gerekiyorsa.

## Kurallar

- Mevcut testleri silme, atlama, gevşetme; bozulan mevcut test olursa DEĞİŞTİRME, raporla.
- Sürüm ve devlog'a dokunma. Push yok, PR yok. Commit sonu:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MSR815DdatTxFiKf1jVGuf
- Kapılar: `npm run check`; Rust değişirse `cargo fmt --check`, clippy (yerel + `x86_64-pc-windows-gnu`), tam
  `cargo test` (`CARGO_TARGET_DIR=/home/user/Lyraska/src-tauri/target CARGO_INCREMENTAL=0` — UNUTMA, disk dar);
  `npm run build` + ilgili `check:scenes` (SCENE_ONLY=photo; yerel ayarlar BILGI-BIRIKIMI §4).

## Rapor

Hata bütçesi tablosu (kaynak → ölçülen önce/sonra), düzeltmeler, commit'ler, kapılar, kalan riskler.
