# Söz zamanlaması: hata bütçesi ve ölçüm (29 Ekim 2026)

Proje sahibinin isteği: sözler de drop gibi "tam net" olmalı. Bu çalışma **programın kendi payını** ölçer ve
düzeltir: dosyadaki zaman doğruysa, söz ekranda sesle aynı anda değişmeli. Dosyanın kendi hatası (yanlış zamanlı
`.lrc`) ve sözlerin sese otomatik hizalanması ayrı işlerdir (`docs/ACIK-KONULAR.md`).

## Nasıl ölçüldü

`npm run check:scenes` içindeki **söz zamanlaması denetimi** (`SCENE_ONLY=lyrics`; `scripts/check-scenes.mjs`,
`checkLyricsTiming`): gerçek tarayıcıda program açılır, sahte çekirdeğin konumu gerçek zamanla ilerler, yanıtları IPC
gibi gecikir (gidiş ve dönüş 8'er ms). Her karede, **boyamadan hemen önce** (`ResizeObserver` anı) ekrana çıkacak
sözler okunur: satırın ve kelimelerin hesaplanmış saydamlığı (CSS geçişleri dahil) ve söylenen kelimenin ilerlemesi
(`--p`). Karenin olması gereken söz zamanı = o karede duyulan an + 1 kare (kare ekrana bir kare sonra çıkar) − ses
aygıtı gecikmesi ayarı. Ölçülenler:

- **Söz saati:** söylenen kelimenin `--p` değerinden programın o karede kullandığı söz zamanı geri hesaplanır
  (milisaniye hassasiyeti), olması gerekenle karşılaştırılır.
- **Kelime:** kelimenin yandığı (saydamlık yarıyı geçtiği) ilk kare, kelimenin zamanı o kare ile bir önceki
  karenin arasında mı.
- **Satır:** satırın belirdiği ve söndüğü kare (saydamlık yarıyı geçer), `LYRIC_LEAD`/`LYRIC_TAIL`'e göre doğru
  karede mi.

Altı satır, 24 kelime; ses gecikmesi ayarı 0 ve 100 ms (Bluetooth kulaklık gibi). Tolerans yarım kare (8 ms).

## Sonuç (60 Hz, gerçek tarayıcı; ms, + geç)

| Ölçüm                     | Önce                         | Sonra                      |
| ------------------------- | ---------------------------- | -------------------------- |
| Söz saati (288 kare)      | ortalama +39,9, en kötü 42,1 | ortalama +0,2, en kötü 1,7 |
| Kelimenin yanması (24)    | ortanca +137                 | 0 (hepsi doğru karede)     |
| Satırın belirmesi/sönmesi | ortanca +120                 | 0 (hepsi doğru karede)     |

Ekran kartsız makinede (kareler ~117 ms'de bir) önce: söz saati ortalama +105 ms; sonra +0,5 ms (en kötü 5 ms).
Ses gecikmesi 100 ms iken sonuçlar aynı: sözler de 100 ms gecikiyor (ayar doğru işaretle uygulanıyordu).

## Hata bütçesi (kaynak → bulgu)

| Kaynak                                           | Bulgu                                                          | Durum                                |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------ |
| React çizimi (`useLivePosition`)                 | Karede okunan konum React'in sıradan güncellemesiyle kare      | Düzeltildi: `flushSync`, aynı karede |
|                                                  | boyandıktan **sonra** yazılıyordu: 1 kare geç (60 karenin 0'ı) | (deneyle 60/60)                      |
| Ekran gecikmesi                                  | Görseller 1 kare ileriden okunuyor (`DISPLAY_LEAD_SECONDS`),   | Düzeltildi: `lyricTime`, görsellerle |
|                                                  | sözler okunmuyordu: 16,7 ms geç                                | aynı kural                           |
| CSS saydamlık geçişleri (0,12 sn)                | Her karede yeniden başlayan geçiş ~120 ms'lik gecikme süzgeci; | Varsayılan modda kaldırıldı;         |
|                                                  | satır ve kelime ~100+ ms geç                                   | güvenli modda aynen duruyor          |
| IPC (konum sorgusu)                              | Saat yanıtın geldiği ana bağlanıyordu: dönüş yolu kadar geç    | Düzeltildi: istek ile yanıtın ortası |
|                                                  | (gerçek Tauri'de ~0,5–1 ms; denetimde 8 ms)                    | (görsellerle aynı)                   |
| Konumun okunduğu an                              | Kare başı yerine geri çağrının anı (önce sahne çizilir)        | Düzeltildi: karenin damgası          |
|                                                  | (birkaç ms erken)                                              | (`frameTime`)                        |
| Ses aygıtı gecikmesi ayarı                       | Doğru: sözlerde de duyulan andan düşülüyor                     | Değişmedi (denetimle doğrulandı)     |
| Oynatma saati: sarma, duraklatma, şarkı değişimi | Sarma ekranı hemen taşır, duraklatmada saat durur, şarkı       | Değişmedi                            |
|                                                  | değişince kesin konum alınır (`usePlayer`)                     |                                      |
| LRC ayrıştırma                                   | Salise/milisaniye, `mm:ss:xx`; `[offset:+ms]` sözü **erken**   | Doğru (standart; `lyrics.rs` testi)  |
|                                                  | gösterir                                                       |                                      |
| Kelime zamanı olmayan satır                      | Kelimeler hece sayısına göre dağıtılır ("tahmini")             | Yaklaşık; sese hizalama ayrı iş      |
| Gömülü zamanlı sözler (ID3 SYLT)                 | Okunmuyor (USLT içindeki LRC okunuyor)                         | Açık (küçük iş)                      |
| Çekirdeğin "duyulan" konumu (WASAPI)             | Ses aygıtı her dönemde (~10 ms) bir güncelleniyor: ortalama    | Açık: sıradaki PR (görselleri de     |
|                                                  | ~5 ms bayat; ölçmek için Windows gerekir                       | etkiler)                             |

`LYRIC_LEAD` (satır 0,25 sn önce belirmeye başlar) ve `LYRIC_TAIL` (0,4 sn'de söner) bilerek konmuş paylardır,
hata değildir; denetim satırın bunlara göre doğru karede belirip söndüğünü ölçer.

## Kalanlar

- Çekirdeğin duyulan konumu: güncellendiği an kaydedilip sorgu anına kadar geçen süre eklenecek (ya da WASAPI'nin
  `IAudioClock` konumu); ses motorunda, Windows'ta denenir.
- Şarkı başına söz kaydırma (dosyanın kendi hatası için, −2…+2 sn).
- "Kendi resmin" sözleri (yedek dal, sahibinin onayında): aynı zaman yolunu kullanır (bu düzeltmeler ona da geçer);
  kendi CSS geçişleri (kelime 0,16 sn, ışıltı 0,12 sn) dal birleşmeden önce aynı denetimle ölçülüp düzeltilecek.
