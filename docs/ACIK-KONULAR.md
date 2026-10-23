# Açık konular

Her oturumda `CLAUDE.md` ve `BILGI-BIRIKIMI.md`'den sonra okunur. Yalnızca **şu an açık** olanlar durur: iş bitince
satır silinir (ayrıntısı devir notunda kalır), yeni iş ya da soru gelince eklenir. Sınır 60 satır (`check:docs`).

## İş sırası (proje sahibinin kararı, 23 Ekim 2026)

1. Kütüphanenin tam ekran, baştan tasarımı; dört küçük PR:
   1. Çekirdek: albüm/sanatçı sorguları (PR açık; 20 000 şarkıda ≤ 25 ms). Tek tek eklenen şarkıların tek
      grupta toplanması 4. parçaya kaldı.
   2. Tam ekran kütüphane + Şarkılar görünümü (sol menü, sıralama, akıcı kaydırma).
   3. Albümler (kapak ızgarası) ve Sanatçılar.
   4. Klasörler ve uyarılar (kutucuklar kalkar).
2. Davul/bas/vokal ayrıştırma: Spleeter; önce eğitimsiz iyileştirmeler ölçülür.
3. Otomatik DJ (Bölüm II), Aşama A'dan; her aşama ayrı oturumda (`docs/gorev/20-BOLUM-II-DJ.md`).

## Proje sahibinden beklenenler

- DOGRULAMA A7–A11 sonuçları (0.0.64) ve A12 (0.0.65: `.opus`/`.webm`).

## Ele alınmayı bekleyen geri bildirim ve bulgular

- Sahneler "yavan" (sahibi, 23 Ekim): tepki zayıf, detay az, tekrar ediyor, renkler cansız. Araştırma
  `docs/arastirma/gorsel-vay-arastirma.md`: ortak son işlem zinciri, şarkı haritasıyla koreografi, tondan palet.
  Kütüphaneden sonra.
- Kütüphane taslakları (Şarkılar, Albümler, albüm sayfası, Sanatçılar, Klasörler, Gökyüzü) sahibin onayını bekliyor;
  araştırma `docs/arastirma/kutuphane-arastirma.md`.

- WebM'de şarkı adı okunmuyor (Matroska Segment Title; symphonia okumuyor) ve sondaki Opus dolgusu (≤ 20 ms)
  atılmıyor (DiscardPadding). İkisi de küçük; istenirse kendi küçük EBML okuyucusuyla.

- Drop hesabı sorunlu (sahibi, 23 Ekim): bazen yanlış yerde buluyor, bazen hiç bulmuyor. BPM için yalnızca "his";
  önce gerçek şarkılarda işaretle–ölç (`evaluate.rs`). Kütüphaneden sonra, sahnelerden önce.
- Görev kitabındaki durum dosyalarının adı: kitap `BULGULAR.json`/`KAPILAR.md` der, depoda `FINDINGS.json`/`GATES.md`.
- Görev kitabındaki test linki eski hesap adını taşıyor; doğrusu `CLAUDE.md`'deki.
