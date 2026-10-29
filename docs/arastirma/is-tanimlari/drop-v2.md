# Drop yakalama — nihai mühendislik ve ölçüm (iş tanımı)

Proje sahibi (29 Ekim 2026): "Drop falan tam net yakalanmıyordu. Drop yakalama için gereken nihai mühendislik ve
matematiksel hesap kitabı yap." Gerekirse baştan; tahmin değil ölçüm.

## Başlangıç

- Bu iş tempo düzeltmesinin (#142, dal `tempo-oktav`, commit 2aafbce) üstüne kurulur (aynı analiz kodu):
  `git -C /home/user/Lyraska worktree add /tmp/claude-0/wt-drop 2aafbce -b drop-v2`. `node_modules` ana depoya
  sembolik bağ (commit etme). Önce CLAUDE.md, docs/BILGI-BIRIKIMI.md (§5: analiz dersleri, "drop ölçü başına
  yapıştırılmaz"), `docs/arastirma/drop/` (önceki çalışma: uret.py, ölçüm, 33 şarkılık set, 57 drop; geliştirme ve
  görülmemiş doğrulama ayrı), `docs/arastirma/tempo/README.md`.
- Kod: `src-tauri/src/analysis/structure.rs` (bölümler, droplar, enerji), `beats.rs`, `tempo.rs`, `meter.rs`,
  `evaluate.rs` (işaretlere göre ölçüm), `examples/drop_olcum.rs`, `analysis/annotation.rs` (sahibinin işaretleri),
  `cache.rs` (VERSIONS). Arayüzde drop gösterimi: `src/lib/drop.ts`, `useSongMap`, InfoStack drop sayacı.

## Yapılacak

1. **Kapsamlı deneme seti (önce):** gerçek müzikteki drop türlerinin hepsi, anı milisaniyesine bilinen: sessizlik/
   boşluk sonrası patlama; build-up (riser, snare roll sıklaşması, filtre açılması) sonrası; bas dönüşü (filtreli
   bas → tam bas); vokal kesip atma ("drop" çağrısı); sahte drop (kısa patlayıp geri dönen / yarım drop); ikinci
   drop (farklı yoğunluk); dropsuz şarkılar (pop, balad, akustik — yanlış alarm için); farklı türler (EDM, dubstep,
   trap, DnB, house, Türkçe pop/remix, rock nakaratı). Mevcut uret.py'yi genişlet ya da yeni üreteç; tohumlar:
   geliştirme / doğrulama / son sınama (son sınama yalnızca kod bittikten sonra üretilir, ayar için kullanılmaz).
   Telifli ses yok; ses depoya girmez.
2. **Ölçütler (tanımla, uygula):** drop başına isabet (±1 vuruş ve ±50 ms ikisi ayrı), kaçan drop oranı, yanlış
   drop (dropsuz şarkıda ve şarkı başına), zaman hatası dağılımı (ortanca, %90), sahte dropu drop sayma oranı.
   Eski algoritma aynı setlerde ölçülür (tablo).
3. **Model:** kanıtları birleştiren ilkeli bir model: enerji sıçraması (bant bazında, özellikle bas dönüşü),
   öncesindeki gerilim (spektral eğim/parlaklık artışı, başlangıç sıklaşması, filtre süpürmesi), hemen önceki boşluk/
   kısılma, sonrasındaki sürdürülme (sahte drop elemesi: en az N ölçü sürmeli), bölüm sınırı, ölçü başı uyumu
   (yapıştırma değil, olasılık). Her aday için güven puanı (0..1; mantıksal/logistic ya da Bayes birleşimi —
   ağırlıklar geliştirme setinden, açıkça yazılı). Drop anı: basın/enerjinin döndüğü kare (vuruşa göre ince ayar,
   ±1 kare). Matematiği ve gerekçesini `docs/arastirma/drop/` altında yeni bir bölümde yaz.
4. **Sahibiyle doğrulama:** `evaluate.rs` + İşaretle paneli zaten sahibinin işaretleriyle karşılaştırıyor; işaret
   dosyası formatını ve panelin gösterdiği hatayı (ms) koru/iyileştir; DOGRULAMA A15 maddesini güncelle (5–10 şarkıda
   `D` ile işaretleme, panelin farkı göstermesi).
5. Önbellek: ritim parçasının sürümü (yalnızca o) artar (#142 7'ye çıkardı; bu dal 8 yapar).
6. Testler: Rust birim testleri sentetik sinyallerle (her drop türü ve dropsuz şarkı), mevcut testler bozulmaz.

## Kurallar

- Mevcut testleri silme, atlama, gevşetme; bozulan mevcut test olursa DEĞİŞTİRME, raporla.
- Sürüm (package.json) ve devlog'a dokunma. Push yok, PR yok. Commit sonu:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MSR815DdatTxFiKf1jVGuf
- Kapılar: `CARGO_TARGET_DIR=/home/user/Lyraska/src-tauri/target CARGO_INCREMENTAL=0`; `cargo fmt --check`, `cargo
clippy --all-targets -- -D warnings` (yerel ve `--target x86_64-pc-windows-gnu`), tam filtresiz `cargo test`;
  `npm run check`. Disk sınırlı (`df -h /`): dolarsa `/home/user/Lyraska/src-tauri/target/debug` altında 1 saatten eski
  dosyaları, ve kendi ürettiğin büyük ara dosyaları sil.

## Rapor

Önce/sonra tablolar (geliştirme, doğrulama, son sınama; tür bazında), model ve matematiği, commit'ler, kapılar, kalan
riskler, sahibinin yapacağı doğrulama.
