# İkinci (bağımsız) Faz 1 denetimi — ara kayıt (23 Ekim 2026)

Proje sahibinin isteğiyle ("Şimdilik dur. Çalışmaların kaybolmasın diye kayıt et") denetim yarıda durduruldu.
Bu klasör o andaki bütün çalışmayı saklar: geçici çalışma alanı (`/home/user/denetim-bagimsiz/`) oturum kapanınca
kaybolur. Asıl belge (`docs/DENETIM-4.md`) henüz yazılmadı.

## Düzen

- `BRIEF.md` — denetçilere verilen ortak kurallar (bağımsızlık, kanıt standardı, rapor biçimi). Denetlenen kaynak:
  `main` @ `94bc3d6` (0.0.56); denetçiler önceki denetimleri, devir notlarını ve git geçmişini görmedi.
- `raporlar/` — biten raporlar (taslak; doğrulama aşamasından geçmedi):
  - `B-ARA.md` arayüz, erişilebilirlik ve görsel güvenlik — 7/10, 10 bulgu. Not: gerçek tarayıcıdaki parlama
    ölçümü (kare dizisi) rapordan sonra sürüyordu; sonucu rapora işlenmemiş olabilir (`calisma/B-ARA/kanit/parlama.*`).
  - `B-DSP.md` sinyal işleme ve ölçüm — 8/10, 7 bulgu; bağımsız ölçümler (EQ, sınırlayıcı, yeniden örnekleme, R128,
    spektrum, VU). B-DSP-02, birinci denetimin D1-SES-04'ünü (nötr ayarda da −1 dBTP sınırlaması) habersizce yeniden buldu.
  - `B-SUR.md` test kalitesi, yayın, tedarik zinciri, lisans — 6/10, 16 bulgu. B-SUR-01, birinci denetimin
    D1-YAY-01'ini (çatal PR'ı sabit linke yayımlanabilir) habersizce yeniden buldu.
- `calisma/<önek>/` — denetçilerin betikleri, ölçüm çıktıları ve günlükleri; `kopya-farki.patch` = denetçinin kendi
  kopyasında kaynağa eklediği kanıt testleri/koşumları (kaynağa uygulanmaz, `git apply` ile yalnızca deney kopyasına).
  Ses dosyaları, veritabanı dosyaları ve bulanıklaştırma mutantları alınmadı (`check:audio` kuralı; yeniden üretilir).
- `DEPOLAR.md` — denetim için indirilen 34 GitHub deposu (adres, commit, lisans) ve kurulan araçlar;
  `araclar-betikler/` axe ve sahne kaydı betikleri.

## Raporu bitmeyen denetçiler ve kaldıkları yer

| Önek  | Alan                       | Kaldığı yer                                                                                                                                                                                                                          |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-GUV | Dayanıklılık ve güvenlik   | Bulanıklaştırma koşumu (`calisma/B-GUV/fuzz.py`, `kopya-farki.patch` içinde `examples/b_guv_fuzz.rs`) 2 541 MKA mutantında **1 panik** buldu: `audio/decode.rs` `next_chunk`, kanal sayısı akış ortasında değişince tampon `info.channels` ile dilimleniyor → sınır dışı dilim (sürüm derlemesinde program kapanır). **Kanıtlandı:** hatayı gösteren test (`b_guv_kanal_sayisi_uyusmayan_dosya_panik_yapmaz`) düzeltmeden önce düşüyor (`test_kanal_once.log`), yamadaki düzeltmeyle geçiyor (`test_kanal_sonra.log`). Rapor yazılmadı. |
| B-SES | Ses motoru doğruluğu       | ffmpeg farklılık testi, sarma testi ve boşluksuz albüm testi bitti (`calisma/B-SES/kanit/*.txt`); rapor yazılıyordu.                                                                                                                  |
| B-VER | Veri bütünlüğü             | Göç (V1–V7 her sürümden), ölçek (`olcek-*.txt`), veri klasörü/WAL deneyleri yapıldı; kendi deney modülü (`bver_denetim.rs`) koşuyordu. Rapor yazılmadı.                                                                                |
| Depo  | GitHub depo araştırması    | 34 depo indirildi, zizmor/actionlint/pyloudnorm/IRIS/axe kuruluyordu; `KATALOG.md` yazılmadı (yerine `DEPOLAR.md`).                                                                                                                  |

## Sürdürmek için

1. Kaynağı aynı commit'ten yeniden kur: `git archive 94bc3d6 | tar -x -C <kaynak>`; önceki denetimleri, `devlog/`,
   `DOGRULAMA.md` ve `docs/denetim-*`'i kopyadan sil (bağımsızlık).
2. Kalan denetçileri (`B-GUV`, `B-SES`, `B-VER`) aynı `BRIEF.md` ile, buradaki ara çıktıları vererek sürdür.
3. Doğrulama aşaması: Kritik/Yüksek/Orta her bulgu ayrı bir doğrulayıcıyla çürütülmeye çalışılır.
4. `docs/DENETIM-4.md`: birleşik bulgular, birinci denetimle (`DENETIM-3.md`) örtüşme ve yakalama–yeniden yakalama
   (Lincoln–Petersen) ile bulunmamış hata tahmini, öncelik sırası.
