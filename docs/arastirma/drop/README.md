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

Dört ayrı set (aynı üreticiyle, farklı tohumlar; yükselişlerin yarısı kick rulosuyla biter):

- **geliştirme** (tohum 1–3, 33 şarkı): ayarlar bunda yapıldı;
- **doğrulama** (tohum 6–7) ve **ilk sınama** (tohum 8–9): hatalarına bakılıp düzeltme yapıldı (rulo, bölüm sınırı);
- **son sınama** (tohum 10–11, 22 şarkı): son değişiklikten sonra üretildi, ayar için kullanılmadı.

| Set        | Eski isabet | Eski yanlış alarm | Yeni isabet | Yeni yanlış alarm |
| ---------- | ----------- | ----------------- | ----------- | ----------------- |
| Geliştirme | 23/57       | 18                | 44/57       | 6                 |
| Doğrulama  | 14/38       | 15                | 26/38       | 9                 |
| İlk sınama | 18/38       | 10                | 30/38       | 5                 |
| Son sınama | 11/38       | 17                | 22/38       | 9                 |

İsabet: ekranda gösterilen (güven ≥ 0,6) drop, işaretliye ±1 sn içinde. İsabetlerde zaman hatası ortanca
5–8 ms, %90'ı 11–18 ms içinde.

**Seçim notu:** bir önceki sürüm (rulo yalnızca bölüm sınırıyla ayrılıyordu) son sınamada 25/38 · 7 yanlış alarm
ölçtü, yani bu sentetik sette biraz daha iyi. Bağımsız inceleme ise onun rulo düzeltmesinin yalnızca test değerlerinde
çalıştığını gösterdi: rulonun bası 0,65 yerine 0,66 olunca drop yine ruloya kayıyordu. Bu sürüm ruloyu ölçünün kendi
içindeki yükselişinden tanır ve rulo gücü değişince de doğru kalır (testli). Sentetik üretici gerçek müziği ancak
yaklaşık temsil ettiği için dayanıklı olan seçildi.

**Dürüstlük notu:** setlerin hepsi aynı üreticiden; doğru an basın döndüğü an olarak tanımlı ve yeni yöntem de onu
arıyor (zaman hatası bu yüzden iyimser). Gerçek şarkılarda, özellikle drop'u crash/kick'in ve basın bir vuruş sonra
geldiği şarkılarda, sonuç farklı olabilir; sahibinin şarkılarıyla doğrulanacak.

## Ne değişti (`analysis/structure.rs`)

1. **Aday:** bas ya da davul (kick) birden güçlü dönmeli. Sonrası: bu ölçünün ve sonraki iki ölçüden güçlü olanının
   küçüğü (drop süren bir düzeydir; droptan sonraki bir ölçülük nefes dropu geciktirmez). Öncesi: önceki dört ölçü;
   hemen önceki ölçü **kendi içinde yükseliyorsa** (rulo: ikinci yarısının bası ilkinden belirgin fazla) o ölçü
   sayılmaz, yoksa drop bir ölçü erkene, ruloya kayardı.
2. **Sıralama:** bas ve kick farkı ağır basar, enerji artışı az; kendi içinde yükselen ölçünün puanı kısılır; bölüm
   sınırındaki ölçü öne geçer; neredeyse aynı puandaki (%5) önceki ölçü seçilir (rulo değilse).
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
- **Rulo droptan güçlüyse** (yarım tempolu dubstep drop'u bas bantlarında rulodan zayıf) ve rulo kendi içinde az
  yükseliyorsa drop bir ölçü erken çıkabiliyor.
- **Vuruş ızgarası bozuksa** (ölçüler eşit uzunlukta değil; bir sentetik şarkıda görüldü) drop ölçüsü rulo ile drop'u
  birlikte içerir ve an kayar. Bu, vuruş bulmanın işi; ayrıca ele alınmalı.
- Ses dosyaları depoya girmez; üretilenler geçici klasörde kalır.
