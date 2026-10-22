# Güvenlik politikası

Lyraska tamamen çevrimdışı çalışan bir müzik çalardır; internete bağlanmaz, hesap ve telemetri
yoktur. Yine de bir güvenlik açığı bulduysanız (ör. bozuk bir ses dosyasının programı çökertmesi ya
da başka bir şey yaptırması, kurulum dosyasının ya da yayın hattının kötüye kullanılabilmesi)
lütfen **herkese açık bir hata kaydı açmadan** bildirin.

## Nasıl bildirilir

GitHub'da deponun **Security** sekmesindeki **Report a vulnerability** düğmesiyle özel bir bildirim
açın. Bildirim yalnızca proje sahibine görünür. Türkçe ya da İngilizce yazabilirsiniz.

Lütfen şunları ekleyin: sorunun ne olduğu, nasıl tekrar oluşturulacağı (gerekirse küçük bir örnek
dosya; telifli şarkı göndermeyin), hangi sürümde görüldüğü (Ayarlar → Program'daki "Sürüm … · …").

## Desteklenen sürüm

Yalnızca en güncel test sürümü desteklenir:
https://github.com/lahmacunveayran/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe

Kurulum dosyasının bu depodan derlendiği GitHub'ın derleme kanıtıyla doğrulanabilir:

```sh
gh attestation verify Lyraska-Kurulum.exe --repo lahmacunveayran/Lyraska
```

# Security policy (English)

Please report vulnerabilities privately via the repository's **Security → Report a vulnerability**
button, not as a public issue. Only the latest test build is supported.
