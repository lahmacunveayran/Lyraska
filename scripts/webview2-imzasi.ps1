# Kurulum dosyasına gömülen Microsoft Edge WebView2 önyükleyicisinin Microsoft imzasını denetler.
# Tauri bu dosyayı derleme sırasında Microsoft'un sunucusundan karma (hash) denetimi olmadan
# indirir ve kuruluma gömer; gömülen dosya geçerli bir Microsoft Authenticode imzası taşımalı.
# Tauri dosyayı kendi araç klasörüne (%LOCALAPPDATA%\tauri) koyar; derleme klasörü de aranır.
# Kullanım (Windows, `npm run tauri build` sonrası): pwsh scripts/webview2-imzasi.ps1
$ErrorActionPreference = "Stop"
$roots = @("$env:LOCALAPPDATA\tauri", "src-tauri\target") | Where-Object { Test-Path $_ }
$files = Get-ChildItem -Path $roots -Recurse -File -Filter "MicrosoftEdgeWebview2Setup.exe" -ErrorAction SilentlyContinue
if (-not $files) {
  throw "WebView2 önyükleyicisi bulunamadı ($($roots -join ', ')); Tauri'nin indirme yeri değişmiş olabilir."
}
foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -FilePath $file.FullName
  $subject = $signature.SignerCertificate.Subject
  if ($signature.Status -ne "Valid" -or $subject -notmatch "O=Microsoft Corporation") {
    throw "WebView2 önyükleyicisinin imzası geçersiz: $($file.FullName) ($($signature.Status); $subject)"
  }
  Write-Host "WebView2 önyükleyicisi Microsoft imzalı: $($file.FullName)"
}
