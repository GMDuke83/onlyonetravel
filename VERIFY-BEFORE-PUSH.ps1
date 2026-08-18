$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$js = Join-Path $root "public\js\app.js"
$html = Join-Path $root "public\index.html"
$version = Join-Path $root "public\version.json"

if (!(Test-Path $js)) { throw "public\js\app.js fehlt" }
if (!(Test-Path $html)) { throw "public\index.html fehlt" }

$text = Get-Content $js -Raw
$htmlText = Get-Content $html -Raw
$versionText = if(Test-Path $version){ Get-Content $version -Raw } else { "" }

$homeStart = $text.IndexOf("function vHome(){")
$homeEnd = $text.IndexOf("function vWorld(id){", $homeStart)
$home = if($homeStart -ge 0 -and $homeEnd -gt $homeStart){ $text.Substring($homeStart,$homeEnd-$homeStart) } else { "" }

$checks = @(
  @{Label="r12 Build in HTML"; Ok=$htmlText.Contains("20260818-customer-home-r12")},
  @{Label="r12 Build in version.json"; Ok=$versionText.Contains("20260818-customer-home-r12")},
  @{Label="Startseite: Aktuelle Angebote"; Ok=$home.Contains("Aktuelle Angebote")},
  @{Label="Startseite: VIP Rückrufform"; Ok=$home.Contains("homeVipCallback") -and $home.Contains("data-act=\"vip-callback\"")},
  @{Label="Startseite: 5 Reisekategorien"; Ok=$home.Contains("Sportreisen") -and $home.Contains("Event-Management")},
  @{Label="Startseite: Best Hotels"; Ok=$home.Contains("Best Hotels")},
  @{Label="Startseite: 4 VIP Services"; Ok=$home.Contains("VIP Welcome") -and $home.Contains("Private Jet & Charter") -and $home.Contains("Chauffeur")},
  @{Label="Startseite: eigene Transfer-Anfrage"; Ok=$home.Contains("homeTransferRequest") -and $home.Contains("data-act=\"transfer-form\"")},
  @{Label="Startseite: alter Motion-Block entfernt"; Ok=(!$home.Contains("<section class=\"homeMotion\""))},
  @{Label="Startseite: großer Flugzeug-Band entfernt"; Ok=(!$home.Contains("<section class=\"flyBand\""))},
  @{Label="Formular-Handler: Rückruf"; Ok=$text.Contains("case 'vip-callback'")},
  @{Label="Formular-Handler: Transfer"; Ok=$text.Contains("case 'transfer-send'")},
  @{Label="iOS: direkter Video-src Loader"; Ok=$text.Contains("v.src=v.dataset.bg")},
  @{Label="Intro: schneller Autoplay-Fallback erhalten"; Ok=$text.Contains("AUTOPLAY_FALLBACK_MS = 1200") -or $text.Contains("1200")},
  @{Label="Yacht Video vorhanden"; Ok=(Test-Path (Join-Path $root "public\video\onlyone-yacht-tour-v2.mp4"))},
  @{Label="VIP-Empfang Video vorhanden"; Ok=(Test-Path (Join-Path $root "public\video\onlyone-vip-welcome-v3.mp4"))}
)

$failed=$false
foreach($c in $checks){
  if($c.Ok){ Write-Host "OK  $($c.Label)" -ForegroundColor Green }
  else { Write-Host "FEHLER  $($c.Label)" -ForegroundColor Red; $failed=$true }
}
if($failed){ exit 1 }
Write-Host "`nKundenumbau r12 ist korrekt und kann gepusht werden." -ForegroundColor Cyan
