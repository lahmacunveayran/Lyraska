# Sözler her şarkıya elle mi girilecek? LRCLIB kapsamı (7 Kasım 2026)

Proje sahibinin sorusu: "Her şarkı için tek tek mi yazacağım, ne gibi çözüm üretebiliriz?" Bu klasör bir seçeneği
ölçer: [LRCLIB](https://lrclib.net), ücretsiz, hesapsız, açık bir söz arşivi (çoğu kaydı zamanlı LRC).

**Karar sahibinin:** 30 Ekim kararı "program söz indirmez, programa ağ kodu girmez" (`BILGI-BIRIKIMI.md` §7). Bu ölçüm
yalnızca seçeneği tartmak için; programa bir şey eklenmedi.

## Nasıl ölçüldü

- Sahibinin kütüphanesinden (köy işi verisi, `../../koy-isi/sonuclar-ilk.jsonl`, 656 şarkı) tohumlu rastgele
  **80 şarkı** ([`lrclib_olc.py`](lrclib_olc.py), tohum 7).
- Sorgu dosya adından: baştaki sıra numarası, uzantı, parantez içleri ("Official Video" vb.) atılır.
- **Eşleşme şartı süre:** LRCLIB kaydının süresi şarkınınkinden en çok ±5 sn farklı. Zamanlı kayıt öne alınır.
- Ham sonuç: [`sonuc-2026-11-07.json`](sonuc-2026-11-07.json). Bulunanların hepsine **elle** bakıldı (aşağıda).

## Sonuç

| Sonuç                                     | Şarkı | Not                                                                                      |
| ----------------------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| Söz bulundu, eşleşme doğru görünüyor      | 35    | 34'ü zamanlı                                                                             |
| Söz bulundu, eşleşme yanlış ya da şüpheli | 12    | 11'inde dosya adında sanatçı yok ("You", "Wild", "La La La", "My Girl")                  |
| LRCLIB'de "enstrümantal" işaretli         | 6     | sözsüz parça: doğru sonuç                                                                |
| Bulunamadı                                | 27    | aralarında trance/EDM, Çince/Japonca adlar, "sped up" sürümler; sözsüz olanlar sayılmadı |

- **80 şarkının 35'inde (%44) doğru söz kendiliğinden bulunuyor**; 6'sı zaten sözsüz.
- Yanlış eşleşmeler aynı adlı başka şarkılar ve başka remiksler; süre şartı tek başına yetmiyor. Lyraska'nın kendi
  hizalaması burada süzgeç olabilir: başka şarkının sözü sese oturmaz ("çoğu oturmadı" hükmü). Ama bu hükmün yanlış
  şarkıyı ne kadar yakaladığı **ölçülmedi**; bilinen şu: doğru sözde fazla temkinli (köy işinde 43'ün 9'u).
- Türkçe örnek: "Gülben Ergen – Şıkır Şıkır" LRCLIB'de zamanlı var (220 sn).
- Yanlış/şüpheli sayılan 12: I'm Good, Wild, My Girl (Dj Sledge Hammer Remix), La La La, You, In And Out Of Love
  (Slowed), Weekend!, I'm a Mess, Trance - My World, Sail Away, MYBAD!, Kate Linn - Your Love (başka remiks).
- Sınırlar: 80 şarkı, tek tohum; eşleşmelerin doğruluğu elle ve dosya adına bakılarak değerlendirildi (sözler sesle
  karşılaştırılmadı).
