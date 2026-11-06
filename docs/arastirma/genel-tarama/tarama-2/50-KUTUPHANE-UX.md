# 50 — Kütüphane ve kullanıcı deneyimi (AS12)

Depodaki `kutuphane-arastirma.md` (23 Ekim) dokuz çaların gezinme düzenini ve kullanıcı yakınmalarını topladı; burada
tekrar edilmez. Bu dosya, **analize dayalı özellikler** açısından en iyi çaların bugün nerede olduğunu ekler.

## 1. Bulgular

| Bulgu                                                                                                                                                                                                                                                            | Kaynak                                    | Kanıt |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----- |
| **Apple Music AutoMix** (iOS 26, Haziran 2025): şarkılar arasında **vuruş eşleme + zaman germe** (perde korunarak) ile DJ tarzı geçiş; Apple'a göre geçiş anı aygıt üzerindeki ton ve tempo analizine göre seçiliyor; iPhone 11 ve sonrası                       | MusicTech, 9to5Mac, MacRumors (B)         | B     |
| Spotify'ın yanıtı: çalma listelerini kesintisiz geçişli "DJ setine" çevirme                                                                                                                                                                                      | MusicRadar (B)                            | B     |
| **Plexamp sonic analysis**: sinir ağıyla şarkı/albüm/sanatçıları N boyutlu uzaya yerleştirme (~50 parametre ağırlıklı), "sonik olarak benzer" radyo, karışımlar; analiz sunucuda önce yapılır, büyük kütüphanede günler–haftalar sürebiliyor; ARM desteklenmiyor | Plex blog/destek sayfası, Plex forumu (B) | B     |
| Kullanıcı istekleri forumlarda: başka çalarlara "Plexamp gibi sonik analiz" isteği (Innuos geri bildirim panosu)                                                                                                                                                 | Innuos geri bildirim panosu (K5)          | B     |

## 2. Lyraska'nın yeri

- Lyraska'nın Faz 6 (Akıllı Geçiş) ve Faz 7 (Otomatik DJ) planı (A, ROADMAP) artık **ana akımın yaptığı şey**:
  Apple AutoMix 2025'ten beri telefonda aynı fikri (tempo, ton, vuruş eşleme, zaman germe) uyguluyor. Lyraska'nın
  farkı olabilecek şeyler: (a) **açıklanabilirlik** ("124 BPM, 8A → 9A"; ROADMAP Faz 7), (b) **güvenlik kuralı**
  (şüphede düz geçiş), (c) **ölçü/cümle hizalaması** (8/16/32 ölçü), (d) **görsel koreografinin geçişi de bilmesi**.
  (c) ve (d) ölçü başı doğruluğuna bağlı — bugün kütüphanenin yarısında ölçü güveni düşük (bkz. 10). Bu, Faz 6'nın
  önündeki asıl teknik engel.
- Lyraska'da "benzer şarkı" yok. Otomatik DJ'nin seçim ölçütleri (BPM, ton, enerji; ROADMAP) **tını ve tür
  benzerliğini** içermiyor: aynı tempo ve tonda bir metal parçası ile bir house parçası ardışık seçilebilir.

## 3. Öneriler

**Ö-U1: Benzerlik gömmesi (yerel paket).** Şarkı başına küçük bir gömme vektörü (Essentia Discogs-EffNet, NC; ya da
MuQ-MuLan, NC; bkz. 13) SQLite'ta saklanır; Otomatik DJ'nin seçim puanına "tını/tür yakınlığı" terimi eklenir;
kütüphanede "buna benzeyenler". Çevrimdışı ve yerel. CPU (C): şarkı başına birkaç saniye, kütüphane bir kez; 656
şarkıda ~30–60 dk arka planda. Ölçüm: sahibinin "bu ikisi birbirine benziyor mu" 30 çiftlik yargısı ile gömme
mesafesinin sıra ilintisi (Spearman ρ ≥ 0,5).

**Ö-U2: Faz 6'nın ön koşulunu yol haritasına yaz:** "Akıllı Geçiş, ölçü başı F ≥ 0,70 (Ö-R1 düzeneğinde) ve şarkının
ölçü güveni ≥ 0,5 olmadan cümle hizalaması yapmaz." Bu zaten güvenlik kuralının ruhu; sayıya bağlanır.

**Ö-U3: Analiz süresi kullanıcıya görünür.** Plexamp'ın "günler sürebilir" yakınması: Lyraska 656 şarkıyı ~11,5 dk'da
analiz ediyor (A, köy işi; ~195× gerçek zaman) — bu bir güç; isteğe bağlı paketler (ritim, yapı, gömme) eklenince
süre artacak. Paket başına "kalan süre" ve "duraklat" gösterilmeli; ölçüt: 1000 şarkılık kütüphanede bütün
paketlerle ≤ 2 saat (Ryzen 7 7435HS, 4 çekirdek).

## 4. Kaynaklar

MusicTech, 9to5Mac, MacRumors (AutoMix; B). MusicRadar (Spotify; B). Plex destek "Sonic analysis", Plex blog
"Super Sonic", TechCrunch 2021, Plex forumu (B). Innuos geri bildirim panosu (B). Depodaki
`kutuphane-arastirma.md`, `koy-isi/README.md`, `ROADMAP.md` (A).
