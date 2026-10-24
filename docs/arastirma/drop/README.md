# Drop bulma ölçümü (24 Ekim 2026)

Proje sahibi (23 Ekim): "drop bazen yanlış yerde buluyor, bazen hiç bulmuyor". Gerçek şarkılar oturumda yok
(ağ yalnızca GitHub'a açık, ses dosyası depoya girmez); bu yüzden drop anı **tam bilinen** sentetik deneme
şarkılarıyla ölçüldü. Sahibinin şarkılarıyla doğrulama ayrıca yapılacak (İşaretle panelinde `D`).

## Araçlar

- `uret.py`: deneme şarkıları üretir (numpy; 44,1 kHz mono WAV + doğru drop anları JSON). On bir tür, bilinen zor
  durumları kapsar: klasik (bassız yükseliş), bas süren yükseliş (alt bas süzülür), droptan önce kısa sessizlik
  (ızgara kayar), yükselişin droptan yüksek olduğu sıkıştırılmış kayıt, dubstep yarım tempo, drum and bass, rock'ta
  sakin girişten sonra grubun girişi, sahte drop, uzun sakin giriş, melodik drop (bas yükselişte uzun notalarla
  sürer, drop davulu getirir), dropsuz şarkı.
- `src-tauri/examples/drop_olcum.rs`: klasördeki şarkıları programın analiziyle çözümler; işaretli droplarla
  eşleşmeyi (±1 sn, güven ≥ 0,6: ekranda gösterilenler) ve yanlış alarmları yazar.

```
python3 docs/arastirma/drop/uret.py /tmp/drop 1        # tohum 1; 4 ve 5 doğrulama seti
cd src-tauri && cargo run --example drop_olcum -- /tmp/drop
```

## Sonuç

| Set                                         | Eski isabet | Eski yanlış alarm | Yeni isabet | Yeni yanlış alarm |
| ------------------------------------------- | ----------- | ----------------- | ----------- | ----------------- |
| Geliştirme (tohum 1–3, 33 şarkı)            | 31/57       | 11                | 49/57       | 3                 |
| Doğrulama (tohum 4–5, 22 şarkı, görülmemiş) | 21/38       | 7                 | 32/38       | 2                 |

Bulunan dropların zamanı: ortanca 6 ms, %90'ı 14 ms içinde (senkron hedefi ±20 ms).

## Ne değişti (`analysis/structure.rs`)

1. **An:** drop artık ölçü başına yapışmaz; ölçü başının bir ölçü öncesiyle bir ölçü sonrası arasında basın döndüğü
   kareye (bas + basın kareden kareye oynaması) oturur. Vuruş ızgarası kaymış şarkılarda (yarım tempo, sessizlikle
   kayan faz) eskiden 1–2,5 sn erken/geç çıkıyordu.
2. **Davulun dönüşü:** bas yükselişte sürüyorsa drop'u kick'in gelmesi belli eder; aday olmak için bas ya da kick
   sıçraması yeter.
3. **Sakin giriş:** "öncesi sessiz olmamalı" kuralı şarkıya göre enerjiye (0,05) bakıyordu; çok sakin bir gitar
   girişinden sonra grubun girişi kaçıyordu. Artık mutlak ses yüksekliğine bakılır (öncesindeki hiçbir ölçü
   −50 dBFS'ten sessiz olmamalı).
4. **Sıkıştırılmış kayıt:** yükselişin sonu droptan yüksekse sonraki enerji eşiği (0,65) tutmuyordu ve güven düşük
   çıkıyordu. Eşik şarkının ortanca ölçü enerjisini geçmez; güvende "yükseliş" ya enerji artışından ya da önceki dört
   ölçüdeki tırmanıştan gelir.

## Kalanlar

- **Bas süren yükseliş** (davul ve bas yükselişte de tam sürüyor, yalnızca alt bas süzülüyor): bulunmuyor ya da bir
  ölçü erken ve güveni düşük. Alt uçta neredeyse değişiklik yok; gerçek şarkılarda ne kadar sık olduğu sahibinin
  şarkılarıyla görülecek.
- **Dropsuz şarkıda** sakin aradan sonra grubun dönüşü drop sayılıyor. Bu, kurala göre bir drop (bas ve enerji
  sakin kısımdan sonra birden dönüyor); ayırmak için yükseliş belirtisi şart koşulursa uzun sakin girişten sonraki
  gerçek droplar kaçar. Sahibinin şarkılarıyla karar verilecek.
- Ses dosyaları depoya girmez; üretilenler geçici klasörde kalır.
