# Elle eklenen lisans metinleri

Bazı crate'ler paketlerinde lisans dosyası taşımaz. MIT gibi lisanslar ikili dağıtımda telif
satırının ve izin metninin verilmesini şart koştuğu için metin buraya konur;
`scripts/third-party-notices.mjs` bunları pakette lisans dosyası olmayan crate'ler için kullanır.

| Dosya                      | Crate'ler                          | Kaynak                                                                                                                               |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `webview2-com.LICENSE.txt` | `webview2-com`, `webview2-com-sys` | https://github.com/wravery/webview2-rs/blob/HEAD/LICENSE (aynen)                                                                     |
| `realfft.LICENSE.txt`      | `realfft`                          | Yukarı akış deposunda lisans dosyası yok; `Cargo.toml`'da `license = "MIT"`, `authors = ["HEnquist …"]`. Standart MIT metni bu adla. |
