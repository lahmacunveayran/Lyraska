# Açık şarkı haritası biçimi (sürüm 1)

Lyraska'nın şarkı haritası (vuruşlar, ölçü, bölümler, droplar, enerji, ton) bu belgede tanımlanan JSON dosyası olarak
dışa ve içe aktarılır. Biçim açıktır: başka programlar da okuyup yazabilir. Kod: `src-tauri/src/analysis/map_file.rs`
(biçim), `src-tauri/src/analysis/fingerprint.rs` (parmak izi).

## İlkeler

- **Ses ve şarkı sözü yoktur** (telif): yalnızca zamanlar ve sayılar, şarkının adı, sanatçısı ve süresi. Dosya yolu da
  yoktur; dosya başkasının bilgisayarına gidebilir.
- **Ses parmak iziyle eşleşir:** harita, dosya adına ya da etikete göre değil, sesin kendisine göre uygulanır. Aynı
  kaydın MP3'ü, FLAC'ı, AAC'si eşleşir; canlı kayıt, remaster ya da başka şarkı eşleşmez. Parmak izi programda,
  çevrimdışı hesaplanır; dış kütüphane yoktur.
- **İnsanların düzelttiği haritalar paylaşılır:** işaretleme aracıyla işaretlenmiş vuruşlar, droplar ve ton dışa
  aktarılırken programın analizinin yerine geçer (`"source": "edited"`).
- **İçe aktarılan harita analizin önüne geçer:** görseller (Görsel Yönetmen), bilgi kartı (BPM, ölçü, ton, drop sayacı)
  ve şarkı haritası şeridi onu kullanır. Analiz önbelleğine yazılmaz; harita kaldırılınca programın kendi analizi geri
  gelir. Şarkı dosyası değişirse (yeniden kodlama, etiket düzenleme) harita artık uygulanmaz.
- Program **hiçbir zaman internete bağlanmaz**; paylaşım dosya iledir.

## Dosya

Uzantı önerisi: `Sanatçı - Başlık.harita.json`. Kodlama UTF-8. En büyük boyut 8 MB (4 saatlik bir şarkının haritası
~1,5 MB). Zamanlar saniye cinsindendir, mikrosaniyeye yuvarlanır.

```json
{
  "format": "lyraska-sarki-haritasi",
  "version": 1,
  "appVersion": "0.0.55",
  "savedAt": "2026-10-22 10:00:00 UTC",
  "track": { "title": "Gece", "artist": "Lyraska Test", "durationSecs": 214.5 },
  "fingerprint": { "method": "lyraska-pi1", "bands": "00000038a1f2…", "chroma": "910910212…" },
  "source": "analysis",
  "tempo": { "bpm": 124.0, "variable": false },
  "beats": [0.48, 0.964, 1.448],
  "meter": { "beatsPerBar": 4, "firstDownbeat": 0, "grouping": [], "confidence": 0.92 },
  "downbeats": [0.48, 2.416],
  "sections": [{ "start": 0.0, "end": 31.2, "energy": 0.35, "label": 0 }],
  "drops": [{ "time": 62.4, "confidence": 0.81 }],
  "energy": [0.21, 0.24],
  "key": { "tonic": 9, "minor": true, "confidence": 0.62 }
}
```

### Alanlar

| Alan                     | Tür                       | Anlamı                                                                                         |
| ------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `format`                 | metin                     | Her zaman `"lyraska-sarki-haritasi"`                                                           |
| `version`                | tam sayı                  | Biçim sürümü (bu belge: 1)                                                                     |
| `appVersion`, `savedAt`  | metin                     | Dosyayı yazan programın sürümü ve zamanı (yalnızca bilgi)                                      |
| `track.title`, `.artist` | metin ya da `null`        | Gösterim için; eşleşmede kullanılmaz                                                           |
| `track.durationSecs`     | sayı                      | Şarkının süresi (0 < süre ≤ 4 saat)                                                            |
| `fingerprint`            | nesne                     | Ses parmak izi (aşağıda)                                                                       |
| `source`                 | `"analysis"` / `"edited"` | Programın analizi mi, bir insanın düzelttiği mi                                                |
| `tempo.bpm`              | sayı                      | Tempo (20–400). Tempo değişen şarkıda yaklaşık                                                 |
| `tempo.variable`         | mantıksal                 | Tempo şarkı boyunca belirgin değişiyor mu                                                      |
| `beats`                  | sayı dizisi               | Vuruşlar, artan (en fazla 60 000)                                                              |
| `meter.beatsPerBar`      | tam sayı                  | Ölçüdeki vuruş sayısı (1–16); aksak ölçüde grup sayısı (9/8 = 2+2+2+3 → 4)                     |
| `meter.firstDownbeat`    | tam sayı                  | İlk tam ölçünün başladığı vuruşun sırası (0 … beatsPerBar−1)                                   |
| `meter.grouping`         | tam sayı dizisi           | Aksak ölçünün sekizlik gruplaması (her biri 2–4); düzenli ölçüde boş                           |
| `meter.confidence`       | sayı (0–1)                | Ölçü başlarının güveni; düşükse Lyraska ölçü başını vurgulamaz                                 |
| `downbeats`              | sayı dizisi               | Ölçü başları, artan                                                                            |
| `sections`               | nesne dizisi              | Bölümler: `start` < `end`, sıralı, üst üste binmez; `energy` 0–1; benzer bölümler aynı `label` |
| `drops`                  | nesne dizisi              | Drop anları (`time`, artan) ve güvenleri (`confidence`, 0–1)                                   |
| `energy`                 | sayı dizisi               | Saniye başına enerji (0–1)                                                                     |
| `key`                    | nesne ya da `null`        | Ton: `tonic` 0 = Do (C) … 11 = Si (B), `minor`, `confidence` (0–1)                             |

Bütün zamanlar şarkının içinde olmalıdır (en fazla 0,5 sn taşabilir). Biçimi bozuk, sınır dışı ya da sırası bozuk
dosya bütünüyle reddedilir; kısmen uygulanmaz.

### Parmak izi (`lyraska-pi1`)

İki kanaldan oluşur; ikisi de tutmadıkça harita uygulanmaz.

**`bands`:** saniyede 15 kare, kare başına 24 bit (6 onaltılık rakam, art arda). Kaynak, Lyraska'nın analiz kareleridir:
60 kare/sn, 30 Hz–16 kHz arası 32 logaritmik bant, desibel ölçeğinde (−66…−6 dBFS → 0…255). Kareler 133 ms'lik
pencerelerle (8 analiz karesi, adım 4) ortalanır. 3–27. bantlar (~55 Hz–7,3 kHz) için Haitsma ve Kalker (2002) kuralı
uygulanır:

```text
bit(n, m) = 1  ⇔  (E[n, m] − E[n, m+1]) − (E[n−1, m] − E[n−1, m+1]) > 0      (m = 0…23)
```

Enerjiler desibel olduğu için ses düzeyi ve sabit ekolayzer eğimi bu farkta birbirini götürür; kodlayıcıların kestiği
tizlere dayanılmaz. Ortalama seviyesi 12/255'in altındaki (sessiz) kare `000000`'dır ve karşılaştırılmaz.

**`chroma`:** saniyede bir kelime, 12 bit (3 onaltılık rakam). Ton analizinin 12 perde sınıfından (Do … Si; o
saniyenin en güçlüsü 255) o saniyenin ortalamasının üstündekiler 1'dir. Bantlar davulun ritmini çok iyi görür; aynı
tempoda ve aynı davullu iki şarkıyı ancak akorlar ayırır.

### Eşleşme

1. **Süre:** dosyadaki süre yerel şarkınınkinden en fazla 2 sn (uzun şarkıda %1) farklı olabilir; bir "radio edit"in
   haritası albüm sürümüne uygulanmaz.
2. **Hizalama:** bant parmak izi ±10 sn kaydırılarak karşılaştırılır; yerel taraf dört başlangıç fazında hesaplanır,
   kayma 1/60 sn çözünürlükte bulunur. Yalnızca yerel şarkıda güvenilir olan bitler sayılır (farkın büyüklüğü
   ≥ 0,7 dB): sessize yakın bantlarda bitin işareti gürültüye bağlıdır.
3. **Karar:** bantlarda bit hata oranı ≤ 0,30 **ve** kromada ≤ 0,15 (en az 10 sn örtüşme). Kroma yoksa bantlarda
   ≤ 0,20.
4. **Kayma:** bulunan kayma bütün zamanlara eklenir (başka bir baskıda başa eklenmiş sessizlik gibi); şarkının dışına
   düşen zamanlar atılır.

Ölçülen bit hata oranları (0 = aynı, 0,5 = ilgisiz; sentetik şarkılarla):

| Durum                                        | Bantlar | Kroma | Sonuç                    |
| -------------------------------------------- | ------- | ----- | ------------------------ |
| Aynı kayıt, MP3 320 kbps (ffmpeg/LAME)       | 0,000   | 0,00  | eşleşir                  |
| Aynı kayıt, MP3 128 kbps                     | 0,001   | 0,00  | eşleşir                  |
| Aynı kayıt, MP3 64 kbps                      | 0,044   | 0,00  | eşleşir                  |
| Aynı kayıt, AAC 96 kbps                      | 0,023   | 0,00  | eşleşir                  |
| Aynı kayıt, Vorbis en düşük kalite (q0)      | 0,117   | 0,00  | eşleşir                  |
| Aynı kayıt, 22 kHz dosya                     | 0,22    | 0,00  | eşleşir                  |
| Başına 3 sn sessizlik eklenmiş baskı         | 0,000   | 0,00  | eşleşir, kayma +3,000 sn |
| Başka şarkı, aynı davul ve tempo             | 0,34    | 0,29  | eşleşmez                 |
| Aynı akorlar, başka tempo (canlı kayıt gibi) | > 0,35  | —     | eşleşmez                 |

Gerçek kodlayıcılarla ölçüm `cargo test --lib gercek_kodlayicilarla_olcum -- --ignored --nocapture` ile tekrarlanır
(ffmpeg gerekir). Gerçek şarkılarla ölçüm proje sahibinin denemesinde yapılacak (`DOGRULAMA.md`).

## Sürümler

- Biçim adı ve `version` önce okunur: daha yeni sürümün dosyası, alanları bilinmese de "daha yeni bir Lyraska
  sürümüyle kaydedilmiş" hatasıyla reddedilir.
- Bir alanın anlamı ya da adı değişirse sürüm artar; eski sürümlerin dosyaları okunmaya devam eder. Alan adlarını
  `map_file::tests::bicim_alanlari_sabit` sabitler.
- Parmak izi yöntemi değişirse `fingerprint.method` değişir (ör. `lyraska-pi2`); tanınmayan yöntemin dosyası
  anlaşılır bir hatayla reddedilir.

## Programda

- **İşaretleme** panelinde **Şarkı haritası dosyası**: **Haritayı dışa aktar** (çalan şarkının haritası; işaretleriniz
  varsa onlarla), **Harita içe aktar** (eşleşirse uygulanır; benzerlik ve kayma yazılır), **Kaldır**.
- İçe aktarılan haritalar uygulama veri klasöründe `haritalar/` altında saklanır (şarkı yolunun özetiyle adlandırılır,
  şarkı dosyasının boyutu ve değişme zamanıyla birlikte).
