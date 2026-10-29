# Açık konular

Her oturumda `CLAUDE.md` ve `BILGI-BIRIKIMI.md`'den sonra okunur. Yalnızca **şu an açık** olanlar durur: iş bitince
satır silinir (ayrıntısı devir notunda kalır), yeni iş ya da soru gelince eklenir. Sınır 60 satır (`check:docs`).

## İş sırası (proje sahibinin kararı, 29 Ekim 2026)

1. Tempo oktav hataları (yarım tempolu dubstep 128, drum and bass 87).
2. Drop yakalama baştan: her drop türünü içeren, anı bilinen deneme seti; geliştirme/doğrulama ayrı; ±1 vuruş,
   yanlış ve kaçan drop oranı; sahibinin işaretleriyle doğrulama.
3. Söz zamanlaması: programın ve ses gecikmesinin payı ölçülür ve düzeltilir (hedef < 1 kare).
4. "Kendi resmin" çubuklarının tepkisi (iş tanımı: orta bölge 2–10 kat ölü; önce teşhis, gerekirse model baştan).
5. Ses motoru denetimi: 64-bit, EQ, AutoEq, EBU R128, bit-perfect, ABX (var mı, testi, matematiği) + birleşmemiş
   DENETIM-3 (dallar `ccr-a69bd749-djgi3v`, `ccr-a46535b3-m3v2i5`) + #56.
6. Görev kitabı (`docs/gorev/`) ile ROADMAP/ACIK-KONULAR çelişkileri: tek doğruluk kaynağı ROADMAP + ACIK-KONULAR.
7. Kaynak ayrıştırma: Spleeter ve Demucs karşılaştırması (kalite, hız, ağırlık lisansı birincil kaynaktan).
8. Sözlerin sese otomatik hizalanması (vokal ayrıştırmadan sonra).
9. Sahneler v2 (Işık Ustası hazır, sahibinin onayı bekleniyor; `docs/arastirma/sahneler-v2/`), sonra Otomatik DJ
   (Bölüm II, Aşama A'dan; her aşama ayrı oturumda).

## Proje sahibinden beklenenler

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
- `PlaylistPage` çift tıklama testi (`playlists.test.tsx`) yüklü makinede bir kez düştü: `playRef` `useEffect`'te
  güncelleniyor; `useLayoutEffect` önerildi (önce yakalayan test).
- Kütüphane taslakları: Gökyüzü onaylandı ("fena olmuş"); kapak ve sanatçı levhalarının renk düzeyi soruldu, cevap
  yok. Araştırma `docs/arastirma/kutuphane-arastirma.md`.

- WebM'de şarkı adı okunmuyor (Matroska Segment Title; symphonia okumuyor) ve sondaki Opus dolgusu (≤ 20 ms)
  atılmıyor (DiscardPadding). İkisi de küçük; istenirse kendi küçük EBML okuyucusuyla.

- Drop ve tempo (sahibi, 23 Ekim): 0.0.73–0.0.74'te sentetik ölçümle iyileşti (`docs/arastirma/drop/`); sahibinin
  şarkılarıyla doğrulanacak (A15). Açık: yarım tempolu dubstep 128 bulunuyor, drum and bass çoğu zaman 87 (oktav).
- Görev kitabındaki durum dosyalarının adı: kitap `BULGULAR.json`/`KAPILAR.md` der, depoda `FINDINGS.json`/`GATES.md`.
- Görev kitabındaki test linki eski hesap adını taşıyor; doğrusu `CLAUDE.md`'deki.
