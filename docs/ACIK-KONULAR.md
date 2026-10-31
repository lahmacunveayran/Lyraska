# Açık konular

Her oturumda `CLAUDE.md` ve `BILGI-BIRIKIMI.md`'den sonra okunur. Yalnızca **şu an açık** olanlar durur: iş bitince
satır silinir (ayrıntısı devir notunda kalır), yeni iş ya da soru gelince eklenir. Sınır 60 satır (`check:docs`).

## İş sırası (proje sahibinin kararı, 29 Ekim 2026)

Birleşmemiş işlerin kodu ve iş tanımları: `docs/arastirma/is-tanimlari/README.md` (yedek dallar).

1. Sözleri sese otomatik hizalama (dokunarak zamanlamanın yerine; sahibi elle yapamıyor): iki irdeleme bitti
   (`docs/arastirma/soz-hizalama/`), sahibi kararları verdi (BILGI §7); sıra RAPOR §8 + DENETIM önerileri, küçük
   PR'lar: hazırlık, hizalayıcı, model çalıştırıcı, Windows hızı, emisyon önbelleği, zamanlama işi (birleşti)
   → iş parçacığı → Söz paketi (birleşti) → arayüz (PR'da) → Lyra görünümü (`claude/soz-efekt`). Küçük iş: ölçülen kare süresi ve ortak saat görsellere de.
2. "Kendi resmin": çubuk ölçeği, yumuşak tavan, saf renk 0.0.98'de (`docs/arastirma/kendi-resmin/` "Tepki
   teşhisi"). Ayrı iş: güvenli modda kırmızı resimde çubuklar neredeyse kıpırdamıyor (`limitExtents`).
3. Ses motoru denetimi: 64-bit, EQ, AutoEq, EBU R128, bit-perfect, ABX + DENETIM-3 (dallar `ccr-a69bd749-djgi3v`,
   `ccr-a46535b3-m3v2i5`) + #56.
4. Görev kitabı (`docs/gorev/`) ile ROADMAP/ACIK-KONULAR çelişkileri (ROADMAP 30 Ekim'de güncellendi: kaldırılan
   sahneler, söz işleri, çıkış Faz 7'den sonra). Tek doğruluk kaynağı ROADMAP + ACIK-KONULAR.
5. Kaynak ayrıştırma: Spleeter ve Demucs karşılaştırması (kalite, hız, ağırlık lisansı birincil kaynaktan).
6. Sahneler v2, sonra Otomatik DJ. Işık Ustası sahibinin kararıyla kaldırıldı (30 Ekim, "sıkıcı"); yeni sahne
   fikri önce sahibine seçenek + önizlemeyle sorulur.
7. En son: drop v2, karar **B** (ikisi programda, varsayılan eski, İşaretle'de yan yana; sahibinin işaretiyle seçim;
   `-yedek-drop` dalındaki `docs/arastirma/drop/DURUM.md`); önce DnB temposu (sürekli sub bas
   kick kanıtını örtüyor, `tempo.rs`) ve hip-hop drop'u; maksumda yanlış aksak (`meter.rs`).

## Proje sahibinden beklenenler

- `usePlayer.test.ts` "çekirdek ölçüm anını bildirince…" Windows'ta hep düşüyor (zamanlayıcı ~15,6 ms adımlı;
  DOGRULAMA G1). Mevcut test: düzeltilsin mi (zamanı testin kendisi yönetsin, sınır aynı), sahibinin kararı.
- DOGRULAMA A7–A11 sonuçları (0.0.64) ve A12 (0.0.65: `.opus`/`.webm`); A13–A14 klasör izleme (0.0.72); A15 drop
  kendi şarkılarında (0.0.73).

## Ele alınmayı bekleyen geri bildirim ve bulgular

- Şarkı kapağı (0.0.82) küçükleri: kütüphaneden çıkan şarkının kapağı `kapaklar/`'da kalır (temizlik yok); arama
  süzgeci açıkken "sıradaki" kapağı albümsüz anahtarla okunur, şarkı başlayınca bir kez daha okunur.

- Güvenlik uyarıları (Scorecard): SAST (CodeQL eklendi) ve Branch-Protection (sahibinin kuralı) bir sonraki
  taramada kapanmalı; Code-Review ve Binary-Artifacts sahibi "Won't fix" ile kapattı; Maintained zamanla kapanır;
  Vulnerabilities (Linux'a özgü GTK bağımlılığı), Fuzzing, CII-Best-Practices sonra.
- `check:scenes`'teki "Resim seç…" tıklama denetimi #140'ta bir kez 5 sn'de tıklayamadı (yeniden çalıştırmada geçti);
  ayrıntılı neden artık günlüğe yazılıyor: yinelenirse günlükteki nedene göre düzeltilir.
- `components.test.tsx` "çizim yükü" testi bütün testler birlikte koşarken bir kez düştü (31 Ekim, Windows; tek
  başına 5/5 geçti). Yinelenirse önce yakalayan deneme, sonra sahibine.
- `PlaylistPage` çift tıklama testi (`playlists.test.tsx`) yüklü makinede bir kez düştü: `playRef` `useEffect`'te
  güncelleniyor; `useLayoutEffect` önerildi (önce yakalayan test).
- Kütüphane taslakları: Gökyüzü onaylandı ("fena olmuş"); kapak ve sanatçı levhalarının renk düzeyi soruldu, cevap
  yok. Araştırma `docs/arastirma/kutuphane-arastirma.md`.
- WebM'de şarkı adı okunmuyor (Matroska Segment Title; symphonia okumuyor) ve sondaki Opus dolgusu (≤ 20 ms)
  atılmıyor (DiscardPadding). İkisi de küçük; istenirse kendi küçük EBML okuyucusuyla.

- Drop ve tempo (sahibi, 23 Ekim): 0.0.73–0.0.74'te sentetik ölçümle iyileşti (`docs/arastirma/drop/`); sahibinin
  şarkılarıyla doğrulanacak (A15). Tempo oktavı (dnb 87, trap/dubstep 70, balad 2×) sentetik ölçümle düzeltildi
  (`docs/arastirma/tempo/`); sahibinin şarkılarıyla doğrulanacak. "Dubstep 128" sentetikte üretilemedi. Açık (öncelikli):
  maksumda, Türk pop'unda, swing'li hip-hop'ta ve breakbeat'te yanlış aksak (2+3, 3+2) bulunuyor, tempo yarıya düşüyor
  (`meter.rs`).
- Görev kitabı: durum dosyaları `BULGULAR.json`/`KAPILAR.md` der (depoda `FINDINGS.json`/`GATES.md`); test linki
  eski hesap adını taşıyor (doğrusu `CLAUDE.md`'deki).
