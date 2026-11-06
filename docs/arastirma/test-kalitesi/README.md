# Test kalitesi denetimi (5–6 Kasım 2026)

Proje sahibinin sorusu: "Yapay zekâ testleri öylesine, geçsin diye yazar" doğru mu? Doğruysa düzeltilsin. İki denetim
yapıldı; ikincisi birincinin sonuçlarını görmeden, başka bir yöntemle ve bağımsız olarak.

## Hüküm

- **İddia bu depo için büyük ölçüde doğru değil.**
  - Mutasyon testinde çekirdekteki 10 modülden örneklenen 160 bozmanın 135'i (%85) yakalandı. Eşdeğerler
    çıkarılınca bu oran ~%93.
  - Arayüzde 80 bozmanın 63'ü (%79) yakalandı; eşdeğerler ve ekran yazıları çıkarılınca ~%89.
  - Literatürde bildirilen puanlar: yapay zekâ testleri %43–55, insan testleri %45–69. Bozma türleri ve örneklem
    farklı olduğu için doğrudan kıyaslanmaz.
- **Doğrulamanın gücü (ikinci denetim):**
  - CI'da hiçbir şey doğrulamayan test yok.
  - ~160 Rust testinde beklenen değerin kaynağı: %10 standart, %30 bağımsız ya da analitik hesap, %30 yapım gereği
    doğru sentetik veri, %25 el hesabı, %5'ten azı kodun kendi çıktısı.
  - 30'dan fazla beklenen değer NumPy ile bağımsız olarak yeniden üretildi.
  - Geçmişte gevşetilen eşiklerin dördü de gerekçeli.
- **İddianın doğru olduğu yerler:** 24 gerçek test açığı (ayıklama: `AYIKLAMA.md`). Önemlileri:
  - bit-perfect geçiş kazancı;
  - boşluksuz geçişte taşma koruması;
  - parametrik EQ'nun A/B bağlantısı (5 bozmanın hiçbiri yakalanmadı);
  - eşlenmiş çentik süzgeci.
- **Bulunan gerçek ürün hatası:** 5 kanallı seste ses yüksekliği yanlış ölçülüyordu (EBU Tech 3341 durum 6: −23,39 LUFS;
  standart −23,0 ±0,1).
  - Üç ayrı yoldan bulundu: kod okuma, ikinci denetimin bağımsız hesabı ve gerçek kodla ölçüm.
  - Düzeltmenin bağımsız incelemesi ayrıca symphonia'nın kanal sayısından düzen uydurduğunu buldu; bkz. `claude/ebu-uyum`.

## Yöntem (sonuçlardan önce sabitlendi)

1. **Mutasyon testi** asıl ölçüdür: Rust'ta `cargo-mutants`, arayüzde Stryker'ın bozma listesinden elle örneklem.
   - Kaçan her bozma tek tek sınıflanır: (a) gerçek açık, (b) eşdeğer (davranış değişmiyor; kanıtla), (c) test
     edilmesi anlamsız (ekran yazısı).
   - Puan (b) ve (c) çıkarıldıktan sonra yazılır.
2. **Doğrulamanın gücü:** "Doğru cevabı kim söylüyor?" Kabul edilen kaynaklar sırasıyla: standardın sayısı, bağımsız
   başvuru hesabı, metamorfik ilişki, el hesabı. Kodun kendi çıktısı kabul edilmez.
3. **Test kokuları:** doğrulamasız testler, totolojiler, atlanan testler, git geçmişinde gevşetilen eşikler.
4. **Kararsızlık:** yüklü makinede tekrar tekrar koşma.
5. **Kapsama** yalnızca hiç sınanmayan kodun haritasıdır, etkinliğin ölçüsü değildir.

Kabul ölçütü:

- Her yeni test, bozmayla (ya da düzeltmeden önceki kodda) **düşerek** değerini gösterir, sonra geçer.
- Mevcut bir test yalnızca proje sahibinin onayıyla değişir.

## Sonuçların düzeltilmesi (PR'lar)

- #190: arayüzün 6 açığı. #191: Vitest'in ajan çalışma kopyalarını koşması (776 dosya yerine 97).
- #192: zamana bağlı 4 test sahte saate geçti. Sahibinin onayıyla; sınırlar aynı, yüklü makinede 10 koşuda 0 düşüş.
- Rust test açıkları (bit-perfect kazancı, eşitleme inişi, A/B, yarım tempo, DSP, analiz), tolerans daraltma
  (sahibinin onayı) ve EBU uyumu: ayrı PR'lar; durumu günün devir notunda.

## Sınırlar

- Rust örneklemi olası ~3 987 bozmanın 160'ı (%4); toplam puanın belirsizliği ~±6 puan.
- Stryker 8 projenin Vitest 5'iyle çalışmıyor. Stryker 9 geçersiz sonuç verdi (%5; elle yakalanan bozmayı "kaçtı"
  saydı). Bu yüzden arayüz bozmaları elle uygulandı.
- İki denetim aynı açıkları farklı yoldan buldu: 5.0 ses yüksekliği, tepe/raf süzgecinin Q'su, A/B bağlantısı. Biri
  ötekinin kör noktasını kapattı: ikinci denetim zamana bağlı kararsız testleri ve geniş toleransları, birinci
  denetim bağlantı kodunun (geçiş kazancı, eşitleme inişi) hiç sınanmadığını gösterdi.

## Açık işler

Sıra önem sırasıdır. Her biri ayrı küçük PR.

1. **Tam mutasyon taraması (bulutta):** yerelde 4 çekirdekle günler sürer. Bulutta `cargo mutants --shard k/n` ile
   parçalara bölünür, her parça ayrı oturumda; kaçanlar `AYIKLAMA.md` gibi sınıflanır. Sahibine soruldu, cevap yok.
2. **EBU uyumu** (`claude/ebu-uyum`): incelemenin bulguları düzeltiliyor; uydurma kanal düzeni "bilinmiyor"
   sayılacak, stereo/mono şarkılar yeniden çözülmesin diye göç, durum 20–23'ün sınırı üretecin kendi tepesine göre.
3. **CI'da sınanmayan kalite hedefleri** (Denetim-2 B3): 1080p dahili GPU'da 60 fps, 1 saat sıfır takılma, vuruş
   F-ölçüsü ≥ 0,80. Bugün yalnızca yerel araçlarla (`examples/`) ölçülüyor.
4. **Zayıf doğrulamalar** (B9, B10): `shader.rs:1367` beklenen değeri kodun çıktısı; F-ölçüsü 70 ms sınırında `<`
   ile `<=` ayrımı sınanmıyor; eşleştirme açgözlü, `mir_eval` en iyi eşleştirmeyi yapar (aynı girdide aynı sonuç
   verdiği sınanmalı).
5. **Ton ilişkisi adlandırması** (B7): MIREX'in "beşli" ilişkisi yönlü; bizimki yönsüz olabilir, başvuru koduyla
   karşılaştırılmalı.
6. **Kararsız testler:** `check:scenes` "Söz zamanlaması (Kendi resmin)" yavaş makinede 137,9 ms geç (#190'da bir
   kez); `shader.rs:1278` duvar saatine bağlı; `PlaylistPage` çift tıklaması (`playRef` `useEffect`'te, önerilen
   `useLayoutEffect`; önce yakalayan test).
7. **Bit-perfect ilk 10 ms** (B8): özel modda başlangıç geçişi bit bit aynı değil. Sahibinin kararı (5 Kasım):
   "kalsın, belgeye yaz". Yapıldı (6 Kasım): `MIMARI.md`, `DOGRULAMA.md` B6 ve Ayarlar'daki bit-perfect yazısı.
8. **Saat farkı ±5 ms:** durum sorgusu hiç 10 ms'den hızlı bitmezse ses–görüntü saat farkı ancak ±5 ms bilinir
   (`ClockOffset` tasarım payı); senkron hedefi ±20 ms olduğundan şimdilik yeter.
9. **Denetim-3'ün kalan test bulguları:** TST-01, TST-06, TST-07b/c, TST-08 (`DENETIM-1.md` son bölüm).

## Dosyalar

- `DENETIM-1.md`: mutasyon testi (yöntem, modül başına sonuçlar, Denetim-3 TST bulgularının durumu).
- `AYIKLAMA.md`: kaçan 45 bozmanın sınıflanması, kanıtı ve öldüren test önerisi.
- `DENETIM-2.md`: bağımsız denetim (doğrulama kaynakları, kokular, eşik geçmişi, bağımsız hesaplar).
- `betikler/`: betikler. `denetim-1/` mutasyon koşusu ve yeniden sınama (`CALISMA` ortam değişkeni çalışma
  klasörüdür), `ayiklama/` Rust kodunun Python'a satır satır çevirileri, `denetim-2/` bağımsız hesaplar.

## Kaynaklar

- Inozemtseva, Holmes. Coverage Is Not Strongly Correlated with Test Suite Effectiveness. ICSE 2014.
- Just ve ark. Are Mutants a Valid Substitute for Real Faults in Software Testing? FSE 2014.
- Petrović, Ivanković, Fraser, Just. Does Mutation Testing Improve Testing Practices? ICSE 2021. arXiv 2103.07189
- Foster ve ark. Mutation-Guided LLM-based Test Generation at Meta. FSE Companion 2025. arXiv 2501.12862
- Do LLMs Generate Useful Test Oracles? ASE 2025.
- Ouédraogo ve ark. Test Smells in LLM-Generated Unit Tests. arXiv 2410.10628
- Siddiq ve ark. Using Large Language Models to Generate JUnit Tests. arXiv 2305.00418
- Barr ve ark. The Oracle Problem in Software Testing: A Survey. IEEE TSE 2015.
- McKeeman. Differential Testing for Software. Digital Technical Journal 10(1), 1998.
- Segura ve ark. A Survey on Metamorphic Testing. IEEE TSE 2016.
- Luo ve ark. An Empirical Analysis of Flaky Tests. FSE 2014.
- EBU Tech 3341 (2023), Tablo 1. ITU-R BS.1770-5 (11/2023). RBJ Audio EQ Cookbook. IEC 60268-17.
- cargo-mutants: https://mutants.rs/
