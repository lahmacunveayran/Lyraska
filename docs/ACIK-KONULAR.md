# Açık konular

Her oturumda `CLAUDE.md` ve `BILGI-BIRIKIMI.md`'den sonra okunur. Yalnızca **şu an açık** olanlar durur: iş bitince
satır silinir (ayrıntısı devir notunda kalır), yeni iş ya da soru gelince eklenir. Sınır 60 satır (`check:docs`).

## İş sırası (proje sahibinin kararı, 29 Ekim 2026)

Birleşmemiş işlerin kodu ve iş tanımları: `docs/arastirma/is-tanimlari/README.md` (yedek dallar).

1. Sözleri sese otomatik hizalama (dokunarak zamanlamanın yerine; sahibi elle yapamıyor): iki irdeleme bitti
   (`docs/arastirma/soz-hizalama/`), sahibi kararları verdi (BILGI §7); sıra RAPOR §8 + DENETIM önerileri, küçük
   PR'lar: hazırlıktan arayüze, Lyra görünümüne (#165) ve paketin test sürümü sayfasında korunmasına (#167) kadar
   birleşti; paket test sürümü sayfasında (1 Kasım, SHA denetlendi) → sahibinin 5–10 Türkçe şarkı denemesi.
2. Ses motoru denetimi: RTS-01 (#211, #217) ve #56 bitti; genel taramanın bulguları sırada: WASAPI Raw modu ve
   Media kategorisi, özel modda dither, albüm modu ses yüksekliği, ABX gücü (`genel-tarama/SENTEZ.md` §5).
3. Kaynak ayrıştırma (6 Kasım kararı: bütün modeller yalnızca sahibinin bilgisayarında, harmanlanabilir): ölçü aleti
   #226; MUSDB18-HQ'da HTDemucs, SCNet XL IHF, BS-RoFormer ve harman karşılaştırması sürüyor (SDR + başlangıç F1 +
   zarf), sonra kazananın yolu (tract ya da RTX 4050 için GPU: sahibine sorulur). HRPS (#222) klasik yedek.
4. Sahneler v2, sonra Otomatik DJ. Işık Ustası sahibinin kararıyla kaldırıldı (30 Ekim, "sıkıcı"); yeni sahne
   fikri önce sahibine seçenek + önizlemeyle sorulur.
5. En son: drop v2, karar **B** (ikisi programda, varsayılan eski, İşaretle'de yan yana; sahibinin işaretiyle seçim;
   `-yedek-drop` dalındaki `docs/arastirma/drop/DURUM.md`); önce DnB temposu (sürekli sub bas
   kick kanıtını örtüyor, `tempo.rs`) ve hip-hop drop'u; maksumda yanlış aksak (`meter.rs`).

## Proje sahibinden beklenenler

- ZFTurbo'nun MIT ayrıştırma kodunu bu bulut makinesinde çalıştırma izni (otomatik denetim "dış kod" diye durdurdu):
  mod seçiciden "Accept edits", sonra komutun onay kartı.
- Bit-perfect yeniden denensin (DOGRULAMA B6, B11; sesi kısık): zamanlama artık ölçülüyor (5 Kasım, vızıltı).
- DOGRULAMA A7–A11 sonuçları (0.0.64) ve A12 (0.0.65: `.opus`/`.webm`); A13–A14 klasör izleme (0.0.72); A15 drop
  kendi şarkılarında (0.0.73).

## Ele alınmayı bekleyen geri bildirim ve bulgular

- Şarkı kapağı (0.0.82) küçükleri: kütüphaneden çıkan şarkının kapağı `kapaklar/`'da kalır (temizlik yok); arama
  süzgeci açıkken "sıradaki" kapağı albümsüz anahtarla okunur, şarkı başlayınca bir kez daha okunur.
- Güvenlik uyarıları (Scorecard): SAST (CodeQL eklendi), Branch-Protection (sahibinin kuralı) ve Pinned-Dependencies
  (#13, #14: söz hizalama betiğinin `pip install`'ları karmalı istek dosyasından) bir sonraki taramada kapanmalı;
  Code-Review ve Binary-Artifacts sahibi "Won't fix" ile kapattı; Maintained zamanla kapanır; Vulnerabilities
  (Linux'a özgü GTK bağımlılığı), Fuzzing, CII-Best-Practices sonra.
- Sahne denetiminin ara sıra düşmeleri (yavaş Windows CI): `ERR_CONNECTION_REFUSED` (iki kez; #220'den beri adres
  yazıyor) ve "Resim seç…" tıklaması 5 sn'yi aşıyor (#229, #230; ana iş parçacığını kilitlemek yeniden üretmedi;
  #232 yanıt süresini yazıyor). Yinelenirse iletideki kanıta göre düzeltilir.
- Rust `arayuzdeki_ekolayzer_korumasi_aygitin_hizinda` bir kez düştü (5 Kasım; tek başına 5/5); yinelenirse yakala.
- Test kalitesi: tam mutasyon taraması bitti (%81,0; 1 656 kaçan, `claude/mutasyon-*` dalları); ayıklama sürüyor
  (sırada `structure.rs`, `biquad.rs` `matched`, `bass.rs` `process_frame`); eskimiş 4 yedek dal sahibine soruluyor.
- Genel tarama (#228): en büyük açık, analizin standart setlerde ölçülmemesi; adımlar `genel-tarama/SENTEZ.md` §5.
- Kütüphane taslakları: Gökyüzü onaylandı ("fena olmuş"); kapak ve sanatçı levhalarının renk düzeyi soruldu, cevap
  yok. Araştırma `docs/arastirma/kutuphane-arastirma.md`.
- symphonia'nın kanal sırası (EBU uyumunun bağımsız incelemesi, 6 Kasım; doğrulanmadı): ALAC 6.1/7.1 eşlemesi ffmpeg'den
  farklı görünüyor; CAF'ın kanal tanımlı (`Custom`) düzeni ve FLAC'ın kanal maskesi etiketi okunmuyor. Nadir; bakılacak.
- WebM: şarkı adı (Matroska Segment Title) okunmuyor, sondaki Opus dolgusu (≤ 20 ms) atılmıyor; ikisi küçük.
- Köy işi (sahibinin 656 şarkısı, 1 Kasım; araç `examples/koy_isi.rs`): hızlı türlerde yarım tempo
  düzeltildi (eşit nabız, #171; `docs/arastirma/tempo/`). 3:2'nin dördü düzeldi (üç vuruşta iki, #173); açık: Armin, Discobitch, DnB/Skillet
  2× (vuruş arası oranı 0,5–0,73), ölçü güveni şarkıların yarısında < 0,5, söz "oturmadı" hükmü fazla temkinli
  (43'ün 9'u aslında iyi). Veriler ve sayılar `docs/arastirma/koy-isi/`.
- Drop (sahibi, 23 Ekim): sentetik ölçümle iyileşti (`docs/arastirma/drop/`), sahibinin şarkılarıyla doğrulanacak
  (A15). "Dubstep 128" üretilemedi. Açık (öncelikli): maksumda, Türk pop'unda, swing'li hip-hop'ta ve breakbeat'te
  yanlış aksak (2+3, 3+2) bulunuyor, tempo yarıya düşüyor (`meter.rs`).
