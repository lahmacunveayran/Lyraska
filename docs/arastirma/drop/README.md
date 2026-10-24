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
python3 docs/arastirma/drop/uret.py /tmp/drop 1        # tohum 1; geliştirme 1–3, doğrulama 6–7, son sınama 8–9
cd src-tauri && cargo run --example drop_olcum -- /tmp/drop
```

## Sonuç

Üç ayrı set (aynı üreticiyle, farklı tohumlar; yükselişlerin yarısı kick rulosuyla biter):

- **geliştirme** (tohum 1–3, 33 şarkı): ayarlar bunda yapıldı;
- **doğrulama** (tohum 6–7, 22 şarkı): bir tur hatalarına bakıldı (rulo, bölüm sınırı);
- **son sınama** (tohum 8–9, 22 şarkı): değişiklikler bittikten sonra üretildi, hiç bakılmadı.

| Set        | Eski isabet | Eski yanlış alarm | Yeni isabet | Yeni yanlış alarm |
| ---------- | ----------- | ----------------- | ----------- | ----------------- |
| Geliştirme | 23/57       | 18                | 46/57       | 4                 |
| Doğrulama  | 14/38       | 15                | 30/38       | 5                 |
| Son sınama | 18/38       | 10                | 30/38       | 5                 |

İsabet: ekranda gösterilen (güven ≥ 0,6) drop, işaretliye ±1 sn içinde. İsabetlerde zaman hatası ortanca
6–8 ms, %90'ı 12–13 ms içinde. **Dürüstlük notu:** setlerin hepsi aynı üreticiden; doğru an basın döndüğü an olarak
tanımlı ve yeni yöntem de onu arıyor (zaman hatası bu yüzden iyimser). Gerçek şarkılarda, özellikle drop'u
crash/kick'in ve basın bir vuruş sonra geldiği şarkılarda, sonuç farklı olabilir; sahibinin şarkılarıyla
doğrulanacak.

## Ne değişti (`analysis/structure.rs`)

1. **Aday:** bas ya da davul (kick) birden güçlü dönmeli. Önce/sonra farkında sonrası iki ölçünün **en zayıfı**
   (drop süren bir düzeydir), öncesi iki pencerenin küçüğü: önceki dört ölçü ya da hemen önceki ölçüyü saymayan dört
   ölçü (yükselişin son ölçüsündeki rulo drop kadar güçlü olabilir; sayılsaydı drop bir ölçü erkene kayardı).
2. **Sıralama:** bas ve kick farkı ağır basar, enerji artışı az; bölüm sınırındaki ölçü öne geçer; neredeyse aynı
   puandaki (%5) önceki ölçü seçilir (değişimin başladığı ölçü).
3. **Sessizlik:** öncesindeki ölçülerden biri −50 dBFS'ten sessizse ya da şarkıya göre enerjisi neredeyse yoksa
   (eski kayıtta cızırtı tabanı) şarkının başıdır. Eskiden "öncesi 0,05'ten sessiz olmasın" kuralı çok sakin bir
   gitar girişinden sonra grubun girişini kaçırıyordu.
4. **Sıkıştırılmış kayıt:** sonraki enerji eşiği (0,65) şarkının ortanca ölçü enerjisini geçmez; güvende
   "yükseliş" enerji artışından ya da (yarı payla) önceki dört ölçüdeki tırmanıştan gelir; yalnızca kick dönüşü
   %70 payla sayılır (pop'ta seyrek ön nakarattan nakarata geçiş de böyledir).
5. **An:** ölçü başının yarım ölçü öncesiyle sonrası arasında basın döndüğü kareye oturur; bas farkı ölçü
   başındakini açıkça (0,08) geçmiyorsa ölçü başı kalır (sürekli alt bas, rulo). Drop'un başlattığı bölüm de drop
   anında başlar (MilkDrop iki kez geçiş yapmasın).

## Kalanlar

- **Bas süren yükseliş** (davul ve bas yükselişte de tam sürüyor, yalnızca alt bas süzülüyor): yeri çoğunlukla doğru
  ama güveni 0,6'nın altında (gösterilmiyor). Alt uçta neredeyse değişiklik yok; gerçek şarkılarda ne kadar sık olduğu sahibinin
  şarkılarıyla görülecek.
- **Dropsuz şarkıda** sakin aradan sonra grubun dönüşü drop sayılıyor. Bu, kurala göre bir drop (bas ve enerji
  sakin kısımdan sonra birden dönüyor); ayırmak için yükseliş belirtisi şart koşulursa uzun sakin girişten sonraki
  gerçek droplar kaçar. Sahibinin şarkılarıyla karar verilecek.
- **Sahte drop** (yükseliş → kısa sessizlik → yine sakin → yeni yükseliş → drop): son sınamada ikisinde de drop bir
  ölçü erken (rulolu ölçü) bulundu.
- Ses dosyaları depoya girmez; üretilenler geçici klasörde kalır.
