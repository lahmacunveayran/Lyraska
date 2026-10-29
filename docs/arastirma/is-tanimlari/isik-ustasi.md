# Işık Ustası — ilk dikey dilim (iş tanımı)

## Bağlam ve kararlar (proje sahibi, 24–29 Ekim 2026)

- Eski sahneler "çok sıradan ve sıkıcı"; hepsi yenileriyle değiştirilecek (yeniler hazır olunca). Hedef: bakınca
  "oha, vay be" dedirten ışık şovu.
- Araştırma: `docs/arastirma/sahneler-v2/README.md`; bağımsız uzman denetimi:
  `docs/arastirma/sahneler-v2/BAGIMSIZ-DENETIM.md`. İkisini de dikkatle oku; denetimin "önce düzeltilmeli" maddeleri
  (özellikle: güvenli mod sahnenin içine kurulur, fren yalnızca test kâhini; dropsuz şarkı için doruk olayı; analiz
  hazır değilken canlı mod; zaman/sarma/duraklatma kuralları; piksel sayısıyla çözünürlük sınırı; belirlenimci tohum)
  bu dilime uygulanır.
- İlk sahne **Işık Ustası**, uzmanın önerdiği kapsamla: yalnızca huzmeler — sis (haze), ışık huzmeleri ve konileri,
  ıslak/yansıtan zemin, kamera huzmelerin içinde. Kalabalık, LED duvar, truss YOK (dizüstünde ucuz görünür).
- **Yoğunluk ayarı**: "Sakin / Normal / Çılgın" (kalıcı ayar; varsayılan Normal).
- **Sözler sahnenin içinde** ışık olarak görünecek — bu dilimde DEĞİL, sonraki PR.
- **Epilepsi**: varsayılan modda parlama sınırı YOK (strobe, flaş, hızlı lazer serbest). "Epilepsi güvenli modu"
  açıkken sahne kendi sakin varyantını oynar: saniyede en fazla 1 parlama/nabız, yavaş parlaklık; `check:scenes`
  güvenli modda ≤ 1/sn ölçer. "Animasyonları azalt" tercihine uyulur.
- Sahibinin ekran kartı **NVIDIA GeForce RTX 4050 Laptop** (güçlü). Yine de entegre ekran kartında (Iris Xe sınıfı)
  1080p'de akıcı kalmalı: iki kalite katmanı (Yüksek / Düşük) yeter; CI'daki yazılımsal çizimde (WARP/SwiftShader)
  Düşük katmanla denetlenir.

## Var olan malzeme

- Ortak son işlem zinciri (bloom, ton eşleme, mavi gürültü, dinamik çözünürlük) eski bir dalda: yerel dal
  `sahne-sonislem` (commit 5a8a980, 1934023; GitHub yedeği `claude/clever-euler-pmhee7-yedek-sonislem`). 0.0.77
  tabanlı; bugünkü koda taşınması gerekir (galeri sahneleri değişti, iki sahne kaldırıldı, parlama sınırları yalnızca
  güvenli modda).
- Kurgu defteri (CueSheet) taslağı: yerel dal `deepseek-kurgu` (commit c23b324; başka bir yapay zekânın, sahibin
  izni olmadan açtığı ve sahibin kapattığı #132). Kodu ve 25 testi saf TS; denetleyerek kullanılabilir — eleştirel
  oku (uzman denetimindeki eksikler: bas vuruşları ve boşluklar SongMap'te yok; dropsuz şarkıda doruk olayı).

## Bu dilimin kapsamı (küçük, ayrı commit'ler; her biri kendi testleriyle)

1. Son işlem zincirini bugünkü koda modül olarak taşı (yeni sahnelerin kullanacağı; galeri sahnelerine de uygulanıyorsa
   davranışı koru). GPU süresi ölçümü için gizli bir ms göstergesi (ör. bir geliştirici tuşu ya da `?debug`).
2. Kurgu defteri: `deepseek-kurgu`'daki taslağı incele, düzelt, eksik olanları ekle (dropsuz şarkıda doruk = nakarat
   girişi / enerji sıçraması / son bölüm; analiz yoksa canlı mod). Rust `song_timeline` bu dilimde gerekmiyorsa
   ekleme; gerekiyorsa ayrı commit ve CLAUDE.md kurallarına uy (ts-rs bağlamaları, `check:commands`).
3. Işık Ustası sahnesi (WebGL2): yeni sahne olarak sahne listesine eklenir (eski sahneler şimdilik kalır). Kurgu:
   giriş/kıta sakin huzmeler ve sis; kurulumda huzmeler toplanır, drop'a 8 ölçü kala her ölçüde bir huzme söner
   (8→1); drop'tan hemen önceki boşlukta karanlık; drop anında çok sayıda huzme birden açılır ve (varsayılan modda)
   vuruşa kilitli strobe; kırılmada yavaş tarama; son bölümde finale. En az 3 çekim (kamera kompozisyonu) + final;
   çekim seçimi şarkıya göre belirlenimci. Renk paleti şarkının tonundan (yoksa kapaktan ya da tema). Yoğunluk ayarı
   huzme sayısını, strobe'u ve kamera hızını ölçekler. Güvenli mod varyantı sahnenin içinde.
4. Testler: saf mantık (kurgu, palet, yoğunluk, güvenli mod kuralları) Vitest; `check:scenes`'e sahne girişi:
   çiziliyor mu, güvenli modda ≤ 1 parlama/sn, varsayılan modda gerçekten ışık şovu (parlamalar ölçülür, frenlenmez).
5. Önizleme videosu: sahte çekirdekle (check-scenes'in sahte çekirdeği gibi; drop'lu bir şarkı haritası ve hareketli
   spektrum) ~30 sn'lik kayıt: giriş → kurulum (geri sayım) → boşluk → drop → kırılma. 1280×720, 30 fps, MP4
   (ffmpeg var). Normal ve Çılgın yoğunlukta birer video + birkaç kare PNG. Dosyalar:
   `/tmp/claude-0/-home-user-Lyraska/9835f28f-d1ce-5ff7-89cd-1c5dc1aa8e06/scratchpad/isik-ustasi/`.

## Kurallar

- CLAUDE.md'ye uy (Türkçe yorum/commit, İngilizce tanımlayıcı, Prettier 100, renkler `:root` değişkenlerinden, `any`
  yok, hesap saf fonksiyonlarda ve test edilir). Lisans: başkasının gölgelendirici kodu alınmaz (Shadertoy varsayılan
  CC BY-NC-SA kullanılamaz); her şey özgün.
- Mevcut testleri silme, atlama, gevşetme. Bir mevcut test bozulursa değiştirme; raporla.
- Push yok, PR yok. Commit sonu:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MSR815DdatTxFiKf1jVGuf
- Sürüm numarasına dokunma.
- Kapılar (hepsi geçmeli): `npm run check`; `npm run build` + tam `npm run check:scenes`; Rust değiştiyse
  `cargo fmt --check`, `cargo clippy --all-targets -D warnings` (yerel ve `x86_64-pc-windows-gnu`), tam `cargo test`.
  Ortam: `CARGO_TARGET_DIR=/home/user/Lyraska/src-tauri/target CARGO_INCREMENTAL=0`. Disk sınırlı: "No space left"
  olursa `/home/user/Lyraska/src-tauri/target/debug` altında 1 saatten eski dosyaları sil.
