# Denetim 1 kanıt testleri

Denetim sırasında geçici olarak koda eklenip çalıştırılan, sonra geri alınan testler (hepsi `main` @ `5805853`'te
kırmızı yanar ya da ölçüm yazdırır):

- `peq_kanit.rs`: `src-tauri/src/audio/peq.rs` dosyasının sonuna eklenir.
- `render_kanit.rs`: `src-tauri/src/audio/render.rs` dosyasının sonuna eklenir.
  Çalıştırma: `cd src-tauri && cargo test --lib denetim1_kanit -- --nocapture --test-threads=1`
- `arayuz.test.tsx.txt`: `src/__denetim1/kanit.test.tsx` olarak kopyalanır; `npx vitest run src/__denetim1`.

Testlerdeki çalışma etiketlerinin rapordaki karşılığı: D1-a → D1-01, D1-c → D1-02, D1-d → D1-03, D1-o → D1-04,
D1-f → D1-05, D1-e → D1-06, D1-b ve D1-i → D1-07 ve "Bilgi".
