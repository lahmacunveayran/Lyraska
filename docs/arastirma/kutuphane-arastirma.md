# Tam ekran kütüphane araştırması (23 Ekim 2026)

Amaç: Lyraska'nın tam ekran kütüphanesini (sol menü: Şarkılar, Albümler, Sanatçılar, Klasörler) tasarlamadan önce,
iyi örneklerin ne yaptığını, kullanıcıların neyi sevip neye kızdığını ve Lyraska'ya özgü fırsatları toplamak.

**Yöntem ve sınırlar.** Kaynaklar web aramasıyla bulundu. Ortamda bazı sitelere doğrudan erişilemedi (manual.mixxx.org,
macstories.net, musicbee.fandom.com, community.roonlabs.com sayfaları DNS hatası verdi); bu yüzden bu sitelerdeki bilgiler
arama sonucundaki özetlerden alındı. Bunların çoğu kullanıcı forumu ya da eski incelemedir; sürüm farkı olabilir.
Kaynağa bağlanamayan her yorum **[çıkarım]** diye işaretlidir. "Bulamadım" yazan yerde uydurma bilgi yoktur.

---

## 1. Örnek programlar kütüphaneyi nasıl kuruyor

| Program                      | Gezinme                                                                                                                                                                                                         | Öne çıkan                                                                                                                                                                                                                                  | Zayıf yan / şikâyet                                                                                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Apple Music (macOS)**      | Sol kenar çubuğu: Son Eklenenler, Sanatçılar, Albümler, Şarkılar; kullanıcı hangi öğelerin görüneceğini "Edit" ile seçer [A1].                                                                                  | Sıra: "Play Next / Play Later"; sıra kapatınca saklanır; sıradaki bir albümü tek seferde temizleme [A2]. Derlemeler için "Group Compilations" ve "Use Album Artists" seçenekleri (Görünüm > Column Browser altında, bulması zor) [A3, A4]. | 80 000–100 000+ şarkıda dönen imleç, yavaş açılış, eski iTunes'un daha hızlı olduğu yorumları [A5, A6].                                                                                                                                                                  |
| **Spotify (masaüstü)**       | Kütüphane sol kenar çubuğunda; "View as": Kompakt (yalnız yazı), Liste, Izgara [S1]. Filtre ve sıralama tercihleri kapatıp açınca korunur [S2].                                                                 | Klavye: Ctrl/Cmd+K arama, Ctrl/Cmd+F süzme [S3].                                                                                                                                                                                           | 2023 yeniden tasarımında "masaüstü alanını verimsiz kullanıyor", "kapaklar çok yer kaplıyor", "daraltılamıyor/genişletilemiyor", "kütüphane eskisi gibi tam sayfa olsun" şikâyetleri [S4, S5].                                                                           |
| **foobar2000 (+Columns UI)** | Kullanıcının kurduğu paneller: Album List (hiyerarşik ağaç) [F1], Facets/ReFacets (sütun sütun süzgeç: Albüm Sanatçısı → Klasör → Albüm, altında çalma listesi) [F2, F3].                                       | 2.0'da kütüphane SQLite'a geçti: "büyük kütüphanede çok daha hızlı açılış, çok daha az bellek" [F2].                                                                                                                                       | Her şey elle kurulur; güzel görünüm kullanıcının emeğine kalır [çıkarım].                                                                                                                                                                                                |
| **MusicBee**                 | "Album and Tracks" görünümü: kapak + şarkı listesi, gruplama ayarı ayrı panelde [M1]. Otomatik ve kurallı listeler, sanal etiketler [M2, M3].                                                                   | Büyük kütüphanede hızlı güncelleme [M3]; çok özelleştirilebilir.                                                                                                                                                                           | Öğrenmesi zaman alıyor [M2]. Derlemeler için yerleşik bir çözüm yok; kullanıcılar Albüm Sanatçısı'na elle "Various Artists" ya da "Compilations" yazıyor, etiketsizler sıralamada en üste düşüyor [M4].                                                                  |
| **Roon**                     | Albümler, Sanatçılar, Şarkılar, Besteciler; her görünümde "Focus" süzgeci (tür, yıl, sanatçı, en çok çalınan…) [R1, R2]. Sanatçı sayfasında diskografi albüm/kayıt arasında geçer ve kendi süzgeci vardır [R2]. | Kapak ağırlıklı, "dergi" havası [çıkarım]. Ekranların anında açıldığı övülüyor [R6].                                                                                                                                                       | Sanatçıya inince Focus sıfırlanıyor [R3]; sıralama tercihi korunmuyor [R4]; "çok yer harcıyor, kompakt mod istiyoruz", "dev başlık pencerenin büyük kısmını kaplıyor" [R5, R6]; büyük derleme arşivlerinde "Various Artists" sorunu için kullanıcı önerisi açılmış [R7]. |
| **Plexamp**                  | Sanatçılar, Albümler, Şarkılar; huni simgesiyle süzgeç, VE/VEYA kuralları, süzgeç açıkken simge renk değiştirir [P1].                                                                                           | Sese dayalı benzerlik: Şarkı/Albüm radyosu, iki şarkı arasında "sonik yolculuk", "Guest DJ" modları [P2, P3].                                                                                                                              | Albüm sıralaması başka Plex uygulamalarıyla tutarsız diye şikâyet [P4].                                                                                                                                                                                                  |
| **Doppler (macOS)**          | Albümler kapak ızgarası, Şarkılar tablo, Sanatçılar dikey liste; sanatçı seçince albümleri [D1].                                                                                                                | "Albüm ve sanatçı odaklı" dinleme deneyimi övülüyor; çok diskli albümleri birleştirme [D1, D2].                                                                                                                                            | "Hâlâ oldukça basit" [D3].                                                                                                                                                                                                                                               |
| **Swinsian**                 | iTunes'a benzer klasik tarayıcı.                                                                                                                                                                                | Arama "en hızlılardan", yazdıkça bütün görünümleri birlikte süzüyor [W1]; büyük koleksiyonda hızlı [W2].                                                                                                                                   | Görünüşü sade, "kişiliği az" [W2].                                                                                                                                                                                                                                       |
| **Vox**                      | Minimal.                                                                                                                                                                                                        | —                                                                                                                                                                                                                                          | Etiketsiz düğmeler kafa karıştırıyor; işlevden çok görünüşe odaklı [V1, V2].                                                                                                                                                                                             |
| **Dopamine (Windows)**       | Solda alfabetik sanatçılar, sağda kapaklı albümler; kurulumda tema/vurgu rengi seçimi [O1].                                                                                                                     | Kapak vurgusu ve büyük koleksiyonda hız övülüyor [O2, O3].                                                                                                                                                                                 | Bellek kullanımı yüksek yorumları [O4].                                                                                                                                                                                                                                  |
| **Winamp/WACUP**             | Klasik "Local Library" (sol ağaç, üstte süzgeç, altta tablo).                                                                                                                                                   | Son sürümlerde süzgeç/görünüm seçimi korunuyor [K1].                                                                                                                                                                                       | Bağımsız kullanılabilirlik incelemesi **bulamadım**.                                                                                                                                                                                                                     |
| **Strawberry/Clementine**    | Sol "Koleksiyon" ağacı, "group by" menüsüyle Albüm Sanatçısı/Yıl/Albüm gruplama; yıl ön eki [T1].                                                                                                               | Kurallı akıllı listeler [T1].                                                                                                                                                                                                              | Aynı adlı iki albümü ayırmak zor; kapak ızgarası isteği [T1, T2]. Clementine'e özgü güncel kaynak **bulamadım**.                                                                                                                                                         |

**DJ programları (yalnız desen; marka varlığı yok).**

- _Kasa (crate) / çalma listesi ayrımı_: liste sıralıdır, kasa sırasız topluluktur [X1].
- _Sorgu dili_: `bpm:140-150`, `~key:c#m` (C# minör ile **uyumlu tonlar**), `-` öneki ile olumsuzlama, alanları zincirleme; yazdıkça süzme [X1, X2].
- _Akıllı kasa_: BPM, ton, tür, sanatçı alanlarıyla kural; "hepsi/herhangi" seçeneği [X3]. Yeni sürümlerde kasa rengi, sabitleme, "bu şarkı hangi kasalarda" ve kasa altında toplam süre/şarkı sayısı [X4].
- _İlişkili şarkılar_: çalan şarkıya göre BPM+ton, aynı tür, aynı sanatçı ve "benzer ton, hız ve yapı" listeleri; BPM yüzde aralığı ve "aynı / 1 / 2 ton uzak" ayarları [X5, X6].
- _Listede dalga önizlemesi_: bir DJ programındaki "listede her şarkının küçük dalga şekli" başka programların kullanıcılarınca ısrarla isteniyor [X7].
- _Enerji 1–10_: içerikten hesaplanır, tempoya bağlı değildir; "aynı enerji = sabit hava, +1 = yumuşak yükseliş" önerisi [X8].
- _Camelot uyumu_: aynı numara (A↔B) ya da halkada ±1; ör. 8A → 7A, 9A, 8B. Ton tespiti araca göre %14–59 hatalı olabilir; kulakla kontrol önerilir [X9].

## 2. Kullanıcıların sevdiği ve kızdığı şeyler (tekrar eden)

**Sevilen**

1. **Hız**: anında açılan ekranlar, yazdıkça süzülen arama (Swinsian, Roon, foobar2000) [W1, R6, F2].
2. **Kapak odaklı albüm görünümü** ve albüm/sanatçı merkezli gezinme (Doppler, Dopamine) [D1, O2].
3. **Ayarların hatırlanması** (sıralama, süzgeç) [S2, K1].
4. **Kurallı listeler / akıllı kasalar** (MusicBee, Strawberry, DJ programları) [M2, T1, X3].
5. DJ'ler için **BPM/ton/enerji sütunları ve bunlarla süzme** [X1, X8].

**Kızılan**

1. **Büyük kütüphanede yavaşlık** (Apple Music) [A5, A6].
2. **Boşa harcanan alan**, ayarlanamayan kapak boyutu, kompakt mod olmaması (Spotify, Roon) [S4, R5].
3. **Bağlamın kaybolması**: süzgecin ya da sıralamanın bir sayfaya inince sıfırlanması (Roon) [R3, R4].
4. **Derlemeler / "Various Artists"**: sanatçı listesini dolduran tek şarkılık sanatçılar, gizli ayarlar [A3, M4, R7].
5. **Gizli ayarlar ve etiketsiz düğmeler** (Apple'ın derleme ayarı, Vox) [A3, V2].
6. Tutarsız sıralama (Plexamp) [P4].

## 3. "Premium" hissettiren görsel ilkeler

Bu bölümün çoğu tasarım genel bilgisidir; kaynağı olanlar işaretli.

- **Yazı ölçeği** [çıkarım]: az sayıda, belirgin basamak (ör. sayfa başlığı 28–32 px, bölüm 18–20, satır 14, ikincil 12). Roon'un dev başlığı eleştirildiği için başlık büyük ama yer kaplamayan olmalı [R5].
- **Yoğunluk seçeneği**: Spotify'ın Kompakt/Liste/Izgara üçlüsü ve Roon'a yöneltilen "kompakt mod" isteği, iki-üç yoğunluk düzeyinin beklendiğini gösteriyor [S1, R5]. Izgarada kapak boyutu kaydırıcısı [S5'ten çıkarım].
- **Kapak yoksa üretilmiş kapak** [çıkarım; yenilikçi değil]: albüm/sanatçı adının özetinden (hash) belirlenen renk ve basit geometrik desen + baş harfler. Lyraska'ya özgü daha iyi bir yol: **şarkının kendi analizinden** (ton → renk tonu, enerji → doygunluk, BPM → desen sıklığı) üretmek; böylece her kapaksız albüm kendi "ses parmak izine" benzer bir kapak alır. Bunun bir yerde yapıldığını **bulamadım** (yeni fikir).
- **Kapaktan renk çıkarma**: Android Palette API kapaktan altı renk profili çıkarır ve albüm kartı örneğini verir [C1]; web'de ColorThief benzeri kütüphaneler kullanılıyor [C2]. Lyraska'da bu hesap Rust'ta, kapak okunurken bir kez yapılıp önbelleğe yazılabilir [çıkarım]. Metin okunurluğu için kontrast kontrolü şart (Material 3 araçları WCAG kontrastını denetliyor) [C3].
- **Hareket**: kısa (150–250 ms), yalnız konum/opaklık; parlaklık sıçraması yok. WCAG 2.3.1 saniyede 3'ten fazla parlamayı yasaklar; 2.3.3 etkileşimden doğan gereksiz animasyonun kapatılabilmesini ister ve sistem tercihine uymak bunu karşılar [G1, G2]. Kapak ızgarası açılırken "yanıp sönme" yerine yumuşak belirme; `prefers-reduced-motion` açıkken hiç geçiş yok.
- **Boş durumlar**: NN/g'ye göre boş ekran üç iş yapar: sistem durumunu söyler, oraya ne geleceğini öğretir, sonraki adıma doğrudan yol verir [N1]. ("Henüz klasör yok → Klasör ekle", "Arama sonuç vermedi → yazımı Türkçe karaktersiz deneyin" gibi.)
- **Fare üstü / seçim**: satırda fare üstündeyken çal düğmesi ve "⋯" menüsü belirir; seçili satır vurgu rengiyle, klavye odağı ayrı ve görünür halkayla [çıkarım].
- **Çalan şarkı göstergesi**: listede, albüm kartında ve sol menüde aynı küçük işaret; Lyraska'da bu işaret basit bir çizgi yerine **o anki bölüm/beat'e göre çok hafif nabız** yapabilir (güvenli modda sabit) [çıkarım].

## 4. Lyraska'ya özgü fırsatlar (önceden analiz edilmiş şarkı haritası)

| Fikir                                                                                            | Durum                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| BPM ve ton (Camelot) sütunu, bunlarla sıralama ve süzme                                          | **Kanıtlanmış** (DJ programları, Mixxx sorgu dili) [X1, X2, X3]                                                                         |
| "Uyumlu tonlar" süzgeci (8A → 7A/8A/9A/8B)                                                       | **Kanıtlanmış** (`~key:` deseni) [X2, X9]                                                                                               |
| Çalan şarkıya göre "sıradaki için uyumlu": BPM ±%x, ton uyumlu, enerji benzer/+1                 | **Kanıtlanmış** desen (ilişkili şarkılar, enerji önerisi) [X5, X6, X8]; çevrimdışı müzik çalarda yaygın değil                           |
| Satırda **mini şarkı haritası**: enerji eğrisi + bölüm renkleri + drop işaretleri (dalga yerine) | Dalga önizlemesi DJ dünyasında **kanıtlanmış ve isteniyor** [X7]; "bölüm/drop/enerji" haritasını listede göstermek **yeni** (bulamadım) |
| Enerji 1–10 sütunu ve "sakin → yoğun" gezinme                                                    | Enerji puanı **kanıtlanmış** [X8]; müzik çalar kütüphanesinde ruh hâli/enerji ile gezinme Plexamp'ın "Mood Radio"suna yakın [P2]        |
| "Drop'a git" ile çalma: listeden şarkıyı ilk drop'tan başlatma                                   | **Yeni** (bulamadım)                                                                                                                    |
| Albüm sayfasında albümün **enerji yolculuğu** (şarkı şarkı enerji/BPM çizgisi)                   | **Yeni** (bulamadım)                                                                                                                    |
| İki şarkı arasında enerji/ton köprüsü kuran sıra ("sonik yolculuk" benzeri)                      | Plexamp'ta sese dayalı benzerlikle **kanıtlanmış** [P2]; Lyraska'da harita verisiyle yapılabilir (Otomatik DJ işine bağlanır)           |
| Analizden üretilmiş kapak (kapaksız albüm için)                                                  | **Yeni** (bulamadım)                                                                                                                    |
| Kütüphaneden görsellere tek tuş, seçili şarkının sahnesini önizleme                              | **Yeni** sayılır; zaten kararlaştırıldı                                                                                                 |

## 5. Öneri: öncelik sırası

### v1'de mutlaka olmalı

1. **Hız her şeyden önce**: 40 000 şarkıda kaydırma akıcı (sanal liste; `src/lib/virtual.ts` var), arama yazdıkça ≤ 50 ms
   sonuç [çıkarım; Swinsian/foobar2000 övgüsü W1, F2]. Kapaklar küçük boyutta önbellekten, görünür olanlar önce.
2. **Sol menü + tam ekran**: Şarkılar, Albümler, Sanatçılar, Klasörler; üstte tek arama kutusu, bulunduğu görünümde süzer
   (Swinsian gibi) ve Ctrl+F ile odaklanır [S3, W1].
3. **Türkçe duyarlı arama**: büyük/küçük harf ve aksan duyarsız, "İ/ı/i/I" doğru eşleşir (Türkçe büyük-küçük harf dönüşümü
   dile göre ayrı kural ister) [U1, U2]; "sarki" yazınca "Şarkı" bulunur. Mevcut çekirdekte Türkçe arama var (db.rs);
   arayüz ve sanatçı/albüm görünümleri de aynı kuralı kullanmalı.
4. **Şarkılar tablosu**: #, Başlık, Sanatçı, Albüm, Süre, BPM, Ton (Camelot, renkli rozet); sütun başlığından sıralama;
   sıralama ve görünüm tercihleri **hatırlanır** [S2; Roon'un tersine R4].
5. **Albümler ızgarası + albüm sayfası**: büyük kapak, ad, sanatçı, yıl, şarkı sayısı/süre, "Çal" ve "Karıştır"; kapaksızlara
   üretilmiş kapak. Izgara/liste geçişi ve kapak boyutu ayarı [S1, S4].
6. **Sanatçılar**: albüm sanatçısına göre; tek şarkılık "konuk" sanatçılar listeyi doldurmasın. **Derlemeler** ayrı ve görünür
   bir "Derlemeler" grubunda (ayar gizlenmesin) [A3, M4, R7]. **Etiketsiz** şarkılar "Bilinmeyen sanatçı/albüm"de, en
   alta; tek tek eklenen dosyalar "Tek şarkılar" grubunda (ACIK-KONULAR'daki 4. parçayla aynı).
7. **Sıra entegrasyonu**: her satırda ve kartta "Sıradakine ekle" ve "Sıranın sonuna ekle"; sağ tık menüsü ve kısayol
   [A2, S3].
8. **Klavye**: ok tuşları, Enter = çal, harfle atlama, Esc = aramayı temizle, görsellere tek tuş, odak halkası görünür.
9. **Çalan şarkı** her görünümde işaretli; "çalana git" kısayolu [çıkarım].
10. **Boş ve yükleniyor durumları** NN/g'nin üç işiyle; analiz sürerken BPM/Ton hücresinde sessiz "analiz ediliyor" işareti [N1].
11. **Güvenlik**: kütüphanede parlama yok, geçişler kısa, `prefers-reduced-motion`'a uyulur [G1, G2].

### Sonra (v1.x)

- Satır başına **mini şarkı haritası** sütunu (enerji eğrisi + bölüm + drop) — Lyraska'nın imzası olabilir; ama önce
  v1'in hızını bozmadığı ölçülmeli.
- **BPM aralığı / uyumlu ton / enerji süzgeç çubuğu** ve "çalana uyumlu" düğmesi [X2, X5].
- Enerji 1–10 sütunu, albüm enerji yolculuğu, "drop'tan başlat".
- Kapaktan renk çıkarma ile albüm sayfası arka planı [C1].
- Akıllı listeler / kasalar (kurallı; BPM, ton, enerji, tür, eklenme tarihi) [X3, X4].
- Yoğunluk seçeneği (Kompakt / Rahat) [S1, R5].

### Kaçınılacaklar

- Kapakları sabit büyük boyuta zorlamak, boş alan israfı, devasa başlıklar [S4, R5].
- Sayfa değişince süzgeç/sıralamayı sıfırlamak [R3, R4].
- Önemli ayarları menü derinliğine gizlemek (derleme gruplaması gibi) [A3].
- Etiketsiz simge düğmeler; her düğmenin ipucu ve Türkçe etiketi olmalı [V2].
- Ana iş parçacığında ağır sıralama/süzme; 40 000 satırı DOM'a basmak [çıkarım].
- Çevrimiçi kapak/etiket servisleri (proje kuralı) ve hiçbir markanın simge, yazı tipi, renk düzeninin kopyalanması.
- Ton bilgisini kesin gibi sunmak: analiz güveni düşükse göstermemek (çekirdek zaten böyle yapıyor) [X9].

---

## Kaynaklar

- [A1] https://support.apple.com/en-mt/guide/music/mus0cec331d6/mac
- [A2] https://support.apple.com/guide/music/musb1e6d1c76/mac
- [A3] https://support.apple.com/en-in/guide/music/mus3068723de/mac
- [A4] https://discussions.apple.com/thread/255674578
- [A5] https://discussions.apple.com/thread/256084962
- [A6] https://forums.macrumors.com/threads/music-app-feels-like-beta-software-not-worth-release.2275878/
- [S1] https://community.spotify.com/t5/Your-Library/Desktop-New-Your-Library-sidebar/m-p/5643517
- [S2] https://community.spotify.com/t5/Your-Library/Desktop-New-Your-Library-sidebar/td-p/5571384/page/2
- [S3] https://support.spotify.com/us/article/Keyboard-shortcuts/
- [S4] https://www.windowslatest.com/2023/04/29/spotifys-new-design-for-windows-11-is-here-but-users-arent-happy/
- [S5] https://community.spotify.com/t5/Idea-Submissions/Desktop-Your-Library-Go-Back-To-the-Old-Library-Layout-on/idi-p/5531380
- [F1] https://foobar2000.org/components/view/foo_uie_albumlist
- [F2] https://www.neowin.net/amp/foobar2000-20-beta-13/
- [F3] https://forums.whathifi.com/threads/foobar2000-ui-configuration-primer.26032/page-3
- [M1] https://musicbee.fandom.com/wiki/Album_and_Tracks_View
- [M2] https://alternativeto.net/software/musicbee/about
- [M3] https://www.ghacks.net/2015/04/21/musicbee-review-the-ultimate-music-player/
- [M4] https://forum.wiimhome.com/threads/organizing-my-music-on-my-usb-hard-drive.6585
- [R1] https://help.roonlabs.com/portal/en/kb/articles/albums
- [R2] https://help.roonlabs.com/portal/en/kb/articles/artists
- [R3] https://community.roonlabs.com/t/focus-feature-resets-when-drilling-down-into-artist-ref-swqtdb/319476
- [R4] https://community.roonlabs.com/t/collection-sort-options/45772
- [R5] https://community.roonlabs.com/t/add-option-for-compact-mode-for-roon-1-8/141231
- [R6] https://www.whatsbestforum.com/goto/post?id=347696
- [R7] https://community.roonlabs.com/t/proposal-improved-handling-of-large-scale-compilation-various-artists-archives/322283
- [P1] https://forums.plex.tv/t/how-to-plexamp-4-6-1/577024
- [P2] https://www.plex.tv/plexamp/
- [P3] https://www.soundandvision.com/content/plexamp-s-sonic-sage-uses-chatgpt-improved-discovery
- [P4] https://forums.plex.tv/t/plexamp-album-sorting-doesnt-match-other-apps/817091
- [D1] https://www.macstories.net/reviews/doppler-for-mac-offers-an-excellent-album-and-artist-focused-listening-experience-for-your-owned-music-collection/
- [D2] https://www.imore.com/popular-local-music-player-doppler-now-has-mac-app-wi-fi-sync-more
- [D3] https://mac.softpedia.com/get/Audio/Doppler-Music-Player.shtml
- [W1] https://www.techradar.com/news/software/applications/6-itunes-alternatives-reviewed-and-rated-1153827
- [W2] https://yewknee.com/blog/the-swinsian-switch
- [V1] https://www.imore.com/vox-mac-launches-your-lightweight-yet-powerful-itunes-alternative
- [V2] https://tidbits.com/2014/02/04/vox-2-0-a-minimalist-music-player-that-needs-work/
- [O1] https://www.techradar.com/reviews/dopamine
- [O2] https://routenote.com/blog/dopamine-a-free-stylish-music-player-to-replace-windows-media-player/
- [O3] https://www.neowin.net/software/dopamine-307/
- [O4] https://www.alternativeto.net/software/dopamine/about/
- [K1] https://www.neowin.net/software/wacup-1994723948-preview/
- [T1] https://forum.strawberrymusicplayer.org/topic/774/keeping-albums-with-same-names-apart/2
- [T2] https://forum.strawberrymusicplayer.org/topic/183/collection-view-bigger-covers-grid-view-advanced-grouping-by
- [X1] https://manual.mixxx.org/2.5/en/chapters/library
- [X2] https://manual.mixxx.org/2.5/de/chapters/library
- [X3] https://wearecrossfader.co.uk/blog/five-library-management-tips-serato-dj/
- [X4] https://musictech.com/news/gear/serato-dj-4-0-update/
- [X5] https://wearecrossfader.co.uk/blog/five-library-management-tips-in-rekordbox/
- [X6] https://community.algoriddim.com/t/full-blown-match-feature-like-related-tracks-in-rekordbox/23883
- [X7] https://community.native-instruments.com/discussion/47020/waveform-view-in-library-like-on-rekordbox
- [X8] https://mixedinkey.com/workflows/sort-songs-by-energy-level/
- [X9] https://digitaldjpool.com/blog/harmonic-mixing-camelot-wheel/
- [C1] https://developer.android.com/training/material/palette-colors
- [C2] https://www.mintlify.com/scoboslor/player2/features/dynamic-colors
- [C3] https://pub-web-s1.flutter-io.cn/documentation/adaptive_palette/latest
- [G1] https://www.getstark.co/wcag-explained/operable/seizures-and-physical-reactions/
- [G2] https://wcag.dock.codes/documentation/wcag-success-criteria/wcag233/
- [N1] https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/
- [U1] https://bugs.openjdk.org/browse/JDK-6208680
- [U2] https://unicode.org/mail-arch/unicode-ml/y2003-m12/0662.html
