# Söz zamanlaması: hata bütçesi ve ölçüm (29–30 Ekim 2026)

Proje sahibinin isteği: sözler de drop gibi "tam net" olmalı. Bu çalışma **programın kendi payını** ölçer ve
düzeltir: dosyadaki zaman doğruysa, söz ekranda sesle aynı anda değişmeli. Dosyanın kendi hatası (yanlış zamanlı
`.lrc`) ve sözlerin sese otomatik hizalanması ayrı işlerdir (`docs/ACIK-KONULAR.md`).

## Nasıl ölçüldü

`npm run check:scenes` içindeki **söz zamanlaması denetimi** (`SCENE_ONLY=lyrics`; `scripts/check-scenes.mjs`,
`checkLyricsTiming`): gerçek tarayıcıda program açılır, sahte çekirdeğin konumu gerçek zamanla ilerler, yanıtları IPC
gibi gecikir. Her karede, **boyamadan hemen önce** (`ResizeObserver` anı) ekrana çıkacak sözler okunur: satırın ve
kelimelerin hesaplanmış saydamlığı (CSS geçişleri dahil) ve söylenen kelimenin ilerlemesi (`--p`). Karenin ekrana
çıktığı an **bir sonraki karenin başlangıcı** sayılır (tarayıcı kareyi o vsync'te gösterir); programın kendi tahmini
kullanılmaz. Karenin olması gereken söz zamanı = o anda duyulan an − ses aygıtı gecikmesi ayarı. Ölçülenler:

- **Söz saati:** söylenen kelimenin `--p` değerinden programın o karede kullandığı söz zamanı geri hesaplanır
  (milisaniye hassasiyeti), olması gerekenle karşılaştırılır.
- **Kelime:** kelimenin yandığı (saydamlık yarıyı geçtiği) ilk kare, kelimenin zamanı o kare ile bir önceki
  karenin arasında mı.
- **Satır:** satırın belirdiği ve söndüğü kare (saydamlık yarıyı geçer), `LYRIC_LEAD`/`LYRIC_TAIL`'e göre doğru
  karede mi.

Altı satır, 24 kelime; kelime süreleri düzensiz (0,17–0,31 sn: kelime başları kare ızgarasının farklı yerlerine
düşer). Değişkeler: ses gecikmesi ayarı 0 ve 100 ms (Bluetooth kulaklık gibi); kare bütçesine sığan ağır sahne
(her karede sözlerden önce 10 ms iş) + asimetrik IPC (gidiş 6, dönüş 1 ms, konum gidişin sonunda okunur);
"Kendi resmin" sözleri. Tolerans yarım kare (8 ms). Tarayıcı 50 kare/sn'nin altındaysa (ekran kartsız CI) kareler
düzensizdir; tek olaylar değil ortancalar denetlenir.

**Denetim kendini sınar (mutasyon):** programa kasıtlı hata eklenince düşmeli. Aynı karede çizim kaldırılınca söz
saati +17 ms, ekrana çıkış tahmini kaldırılınca +16 ms, sorgu ortası kaldırılınca +8,3 ms: üçü de yakalanıyor.
Dikkat: mutasyonlu derleme başarısız olursa denetim eski derlemeyi çalıştırır ve "geçti" der; derleme sonucu
denetlenir.

## Sonuç (60 Hz, gerçek tarayıcı; ms, + geç)

| Ölçüm                     | Önce                         | Sonra                       |
| ------------------------- | ---------------------------- | --------------------------- |
| Söz saati (324 kare)      | ortalama +39,9, en kötü 42,1 | ortalama +0,2, en kötü 2,2  |
| Kelimenin yanması (24)    | ortanca +137                 | 0 (hepsi doğru karede)      |
| Satırın belirmesi/sönmesi | ortanca +120                 | 0 (hepsi doğru karede)      |
| Ağır sahne + asimetrik    | —                            | ortalama −3,9, en kötü −4,4 |
| "Kendi resmin" kelimeleri | ortanca +96                  | 0                           |
| "Kendi resmin" satırları  | ortanca +145                 | 0                           |

Ekran kartsız makinede (kareler ~117 ms'de bir) önce: söz saati ortalama +105 ms; sonra ortancalar 0 (tek kareler
düzensiz: ±1 kare). Ses gecikmesi 100 ms iken sonuçlar aynı: sözler de 100 ms gecikiyor.

## Hata bütçesi (kaynak → bulgu)

| Kaynak                                           | Bulgu                                                         | Durum                                 |
| ------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------- |
| React çizimi (`useLivePosition`)                 | Karede okunan konum kare boyandıktan **sonra** yazılıyordu:   | Düzeltildi: `flushSync`, aynı karede  |
|                                                  | 1 kare geç (deneyle 60 karenin 0'ı aynı karede)               | (60/60)                               |
| Karenin ekrana çıkış anı                         | Sözlerde hiç hesaba katılmıyordu (görsellerde sabit 1/60 sn)  | Düzeltildi: ölçülen kare süresi       |
|                                                  |                                                               | (`FrameClock`, `displayTime`; 144 Hz, |
|                                                  |                                                               | ağır karede de), an geri gitmez       |
| CSS saydamlık geçişleri (0,12–0,18 sn)           | Her karede yeniden başlayan geçiş ~geçiş süresi kadar gecikme | Varsayılan modda kaldırıldı; güvenli  |
|                                                  | süzgeci; satır ve kelime ~100+ ms geç                         | modda aynen duruyor                   |
| IPC (konum sorgusu)                              | Saat yanıtın geldiği ana bağlanıyordu: dönüş yolu kadar geç   | Düzeltildi: kısa sorguda istek ile    |
|                                                  |                                                               | yanıtın ortası (`replyTime`)          |
| Uzun sorgu (çekirdek meşgul, 150 ms)             | Orta nokta saati 74 ms öne iterdi (bağımsız inceleme)         | 40 ms'den uzun sorguda yanıtın anı    |
| Sorgu sürerken biten sarma                       | Orta nokta sarmadan eski kalıp saati 132 ms öne iterdi        | An, son bağlantıdan eski olamaz       |
| Ses aygıtı gecikmesi ayarı                       | Doğru: sözlerde de duyulan andan düşülüyor                    | Değişmedi (denetimle doğrulandı)      |
| Oynatma saati: sarma, duraklatma, şarkı değişimi | Sarma ekranı hemen taşır, duraklatmada saat durur, şarkı      | Değişmedi                             |
|                                                  | değişince kesin konum alınır (`usePlayer`)                    |                                       |
| LRC ayrıştırma                                   | Salise/milisaniye, `mm:ss:xx`; `[offset:+ms]` sözü **erken**  | Doğru (standart; `lyrics.rs` testi)   |
|                                                  | gösterir                                                      |                                       |
| Kelime zamanı olmayan satır                      | Kelimeler hece sayısına göre dağıtılır ("tahmini")            | Yaklaşık; sese hizalama ayrı iş       |
| Gömülü zamanlı sözler (ID3 SYLT)                 | Okunmuyor (USLT içindeki LRC okunuyor)                        | Açık (küçük iş)                       |
| Aşırı yüklü kare (iş > kare süresi)              | Ana iş parçacığı dolu: sorgu yanıtı bir kare geç işlenir;     | Açık: sıradaki PR (çekirdek konumu    |
|                                                  | 22 ms işte söz saati ~17 ms geç (en kötü ~47)                 | okuduğu anı ortak saatle bildirir)    |
| Çekirdeğin "duyulan" konumu (WASAPI)             | Ses aygıtı her dönemde (~10 ms) bir güncelleniyor: ortalama   | Açık: aynı PR (görselleri de etkiler) |
|                                                  | ~5 ms bayat; ölçmek için Windows gerekir                      |                                       |

`LYRIC_LEAD` (satır 0,25 sn önce belirmeye başlar) ve `LYRIC_TAIL` (0,4 sn'de söner) bilerek konmuş paylardır,
hata değildir; denetim satırın bunlara göre doğru karede belirip söndüğünü ölçer.

Görseller hâlâ sabit 1/60 sn ekran payı kullanır (`visual_bridge::DISPLAY_LEAD_SECONDS`): 144 Hz'de ~10 ms erken,
ağır karede geç. Ölçülen kare süresi görsellere de taşınabilir (ayrı iş).

## Bağımsız inceleme (30 Ekim 2026)

Kendi karşı örneklerini yazan bir ajan inceledi (`docs/arastirma/sozler/inceleme/`; testler
`src/hooks/usePlayer.review.test.ts`, `src/lib/clock.review.test.ts`). Bulgular: uzun sorgu ve sarmada orta nokta
saati öne itiyordu; kare anı gerçek Chromium damgalarında geri gidiyor ve ağır karede sözü geç gösteriyordu;
denetim kendi sabitlerini (1/60, simetrik IPC, düzenli kelimeler) ölçüyordu. Hepsi önce testle yakalanıp
düzeltildi (yukarıdaki tablo).

## Kalanlar

- Çekirdeğin konumu okuduğu an (ortak saat, sorgu aralığına kırpılarak) ve WASAPI dönemi bayatlığı: ses motorunda,
  Windows'ta denenir. Aşırı yüklü kare değişkesi (22 ms) o PR'da sıkı denetime girer.
- "Kendi resmin" sözleri (yedek dal): aynı zaman yolunu kullanır; kendi CSS geçişleri de ölçülüp düzeltildi.
