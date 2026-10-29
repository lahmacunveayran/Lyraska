# Tempo oktav hataları — iş tanımı

Proje sahibi ve ACIK-KONULAR: "yarım tempolu dubstep 128 bulunuyor (doğrusu ~140, yarım tempo hissi ~70), drum and
bass çoğu zaman 87 (doğrusu ~174)". Oktav hatası: algılanan tempo doğrunun 1/2, 2/3 ya da 2 katı.

## Başlangıç

- `git -C /home/user/Lyraska fetch origin main && git -C /home/user/Lyraska worktree add /tmp/claude-0/wt-tempo origin/main -b tempo-oktav`.
  `node_modules` için ana depoya sembolik bağ (commit etme). Önce CLAUDE.md, docs/BILGI-BIRIKIMI.md (§5: "Analiz, doğrusu
  bilinen seste ölçülmeden değiştirilmez"), `docs/arastirma/drop/` (uret.py: yeri bilinen deneme şarkıları; geliştirme
  ve görülmemiş doğrulama setleri ayrı tohumlar).
- Kod: `src-tauri/src/analysis/beats.rs` (başlangıç gücü, tempo, vuruşlar; dinamik programlama), `structure.rs`,
  `meter.rs`, `cache.rs` (`VERSIONS`: ritim parçasının sürümü).

## Yapılacak

1. **Ölçüm düzeneği (önce):** türleri taklit eden, temposu bilinen sentetik şarkılar üret (Python/numpy ya da ffmpeg;
   telifli ses yok, depoya ses girmez — `check:audio`; üreteç betiği `docs/arastirma/tempo/` altına): dubstep (140 BPM,
   kick 1'de, snare 3'te — yarım tempo hissi, wobble bas, hi-hat 1/8 ve 1/16 triplet), drum and bass (170–176 BPM,
   iki adımlı breakbeat, hızlı hi-hat, sub bas), house/techno 120–128 (four-on-the-floor), hip-hop 85–95 (swing),
   trap 140 (hi-hat roll'lü yarım tempo), Türk aksak (9/8, 7/8 — mevcut meter.rs ile uyum), yavaş balad 60–70. Her
   biri birkaç tohumla, değişen tını/gürültüyle; geliştirme ve görülmemiş doğrulama setleri ayrı.
   Mevcut algoritmanın sonucunu tablo halinde ölç: doğru / ½ / 2× / ⅔ / 3⁄2 / başka. Sahibinin bildirdiği hata
   yeniden üretilmeli (dubstep 128? DnB 87) — üretilmiyorsa sentetik setin neyi kaçırdığını düşün ve rapora yaz.
2. **"Doğru" tanımı:** DJ yazılımlarının ve müzisyenlerin kabulü: dubstep/trap 140 (70 değil), DnB 170–176 (87 değil),
   hip-hop 85–95 (170–190 değil), house 120–128. Yani oktav belirsizliği tür bağlamında çözülür. Kararı ve gerekçeyi
   (literatür: tempo öncelik eğrileri ~120 BPM merkezli log-normal, Moelants & McKinney; metrik seviye seçimi)
   `docs/arastirma/tempo/README.md`'ye yaz.
3. **Düzeltme:** ilkeli bir yöntem: ör. aday tempolar (T, 2T, T/2, 3T/2, 2T/3) için ölçü/vuruş seviyesinde kanıt
   (hi-hat yoğunluğu, kick/snare deseni: snare'in 2 ve 4'te mi 3'te mi olduğu, bas başlangıçlarının periyodu, tempo
   öncelik eğrisi) ile puanlama. Aşırı uyum yok: geliştirme setinde ayarla, doğrulama setinde ölç; eski algoritma da
   aynı setlerde ölçülsün. Gerçek kayıtlarda (yoksa) en az zarar: mevcut testler ve beat F-ölçüsü hedefi (≥ 0,80)
   bozulmamalı (`evaluate.rs`).
4. Değişiklik ritim hesabını değiştiriyorsa **yalnızca ritim parçasının** sürümünü artır (`cache::VERSIONS`;
   CLAUDE.md kuralı) — kütüphane yalnızca ritmi kareden yeniden hesaplar.
5. Testler: Rust birim testleri sentetik sinyallerle (test içinde üretilen; ya da `src-tauri/tests/data/`'ya küçük
   sentetik ses — ffmpeg ile, CLAUDE.md'deki istisna) — dubstep ve DnB benzeri desenlerde doğru tempo.

## Kurallar

- Mevcut testleri silme, atlama, gevşetme. Bozulan mevcut test olursa DEĞİŞTİRME; hangisi, neden, ne olmalı — raporla.
- Sürüm (package.json) ve devlog'a dokunma. Push yok, PR yok. Commit sonu:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MSR815DdatTxFiKf1jVGuf
- Kapılar: `CARGO_TARGET_DIR=/home/user/Lyraska/src-tauri/target CARGO_INCREMENTAL=0`; `cargo fmt --check`, `cargo
clippy --all-targets -- -D warnings` (yerel ve `--target x86_64-pc-windows-gnu`), tam filtresiz `cargo test`;
  `npm run check` (bindings değişirse). Önce `npm run build` gerekebilir (dist/). Disk dolarsa
  `/home/user/Lyraska/src-tauri/target/debug` altında 1 saatten eski dosyaları sil.

## Rapor

Önce/sonra tablo (tür × sonuç, geliştirme ve doğrulama ayrı), yöntem ve gerekçe, commit'ler, kapılar, bozulan mevcut
test (varsa), açık sorular (ör. sahibinin gerçek şarkılarıyla doğrulama: DOGRULAMA'ya eklenecek madde önerisi).
