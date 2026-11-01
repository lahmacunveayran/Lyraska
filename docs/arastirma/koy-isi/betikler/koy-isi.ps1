# Lyraska "köy işi": önce YouTube listesinin altyazılarını (yalnızca yazı, ses değil) indirir, sonra
# D:\DLP'deki her şarkıyı ölçer. Bilgisayar bu sürede uyumaz; pencere kapanınca uyku ayarı eski haline döner.
# Yarıda kalırsa yeniden çalıştırmak yeter: kaldığı yerden sürer.
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Lyraska köy işi"

$liste = "LISTE_ADRESI"  # YouTube listesinin adresi (depoda yazılmaz)
$ytdlp = Join-Path $env:USERPROFILE "Desktop\DLP\yt-dlp.exe"
$muzik = "D:\DLP"
$sonuc = "D:\LyraskaVeri\koy-isi\sonuc"
$paket = "D:\LyraskaVeri\soz-modeli\sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-v2-int8-2026-02-05"
$arac = "D:\LyraskaVeri\koy-isi\koy_isi.exe"

# Bu pencere açıkken bilgisayar uyumasın (ayar değişmez; yalnızca bu iş sürerken geçerli).
Add-Type -Namespace Lyraska -Name Uyku -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
[void][Lyraska.Uyku]::SetThreadExecutionState([uint32]"0x80000001")

if ($liste -ne "LISTE_ADRESI" -and (Test-Path $ytdlp)) {
    Write-Host "1/2 Altyazılar indiriliyor (yalnızca yazı; ses indirilmez)..."
    # Yalnızca özgün altyazı (otomatik çeviri değil); YouTube sık isteği keser (429): yavaş ve yeniden denemeli.
    & $ytdlp --js-runtimes node --skip-download --write-subs --write-auto-subs --sub-langs "en-orig,tr-orig" `
        --sub-format vtt --ignore-errors --no-overwrites --sleep-requests 3 --sleep-subtitles 10 `
        --retries 10 --retry-sleep 60 `
        -o "$muzik\%(playlist_index)s - %(title)s.%(ext)s" $liste
} else {
    Write-Host "1/2 Liste adresi yok: altyazı indirme atlandı."
}

Write-Host "2/2 Ölçüm başlıyor. Saatler sürebilir; pencereyi kapatmayın."
& $arac $muzik $sonuc $paket
Write-Host ""
Write-Host "Bitti. Rapor: $sonuc\rapor.md"
Read-Host "Kapatmak için Enter"
