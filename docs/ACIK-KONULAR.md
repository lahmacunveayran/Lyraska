# Açık konular

Her oturumda `CLAUDE.md` ve `BILGI-BIRIKIMI.md`'den sonra okunur. Yalnızca **şu an açık** olanlar durur: iş bitince
satır silinir (ayrıntısı devir notunda kalır), yeni iş ya da soru gelince eklenir. Sınır 60 satır (`check:docs`).

## İş sırası (proje sahibinin kararı, 23 Ekim 2026)

1. Kütüphanenin baştan tasarımı; küçük PR'lar:
   1. Albüm sayfası (0.0.75, PR açık); karışık çal (0.0.76) ve sanatçı sayfası (0.0.77) hazır, sırada.
2. Davul/bas/vokal ayrıştırma: Spleeter; önce eğitimsiz iyileştirmeler ölçülür.
3. Otomatik DJ (Bölüm II), Aşama A'dan; her aşama ayrı oturumda (`docs/gorev/20-BOLUM-II-DJ.md`).

## Proje sahibinden beklenenler

- DOGRULAMA A7–A11 sonuçları (0.0.64) ve A12 (0.0.65: `.opus`/`.webm`); A13–A14 klasör izleme (0.0.72); A15 drop
  kendi şarkılarında (0.0.73).

## Ele alınmayı bekleyen geri bildirim ve bulgular

- Sahneler "yavan" (sahibi, 23 Ekim): tepki zayıf, detay az, tekrar ediyor, renkler cansız. Araştırma
  `docs/arastirma/gorsel-vay-arastirma.md`: ortak son işlem zinciri, şarkı haritasıyla koreografi, tondan palet.
  Kütüphaneden sonra.
- Kütüphane taslakları: Gökyüzü onaylandı ("fena olmuş"); kapak ve sanatçı levhalarının renk düzeyi soruldu, cevap
  yok. Araştırma `docs/arastirma/kutuphane-arastirma.md`.

- WebM'de şarkı adı okunmuyor (Matroska Segment Title; symphonia okumuyor) ve sondaki Opus dolgusu (≤ 20 ms)
  atılmıyor (DiscardPadding). İkisi de küçük; istenirse kendi küçük EBML okuyucusuyla.

- Drop ve tempo (sahibi, 23 Ekim): 0.0.73–0.0.74'te sentetik ölçümle iyileşti (`docs/arastirma/drop/`); sahibinin
  şarkılarıyla doğrulanacak (A15). Açık: yarım tempolu dubstep 128 bulunuyor, drum and bass çoğu zaman 87 (oktav).
- Görev kitabındaki durum dosyalarının adı: kitap `BULGULAR.json`/`KAPILAR.md` der, depoda `FINDINGS.json`/`GATES.md`.
- Görev kitabındaki test linki eski hesap adını taşıyor; doğrusu `CLAUDE.md`'deki.
