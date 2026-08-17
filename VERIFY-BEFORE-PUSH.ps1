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

$checks = @(
  @{Label="Ausflüge: Kappadokien vor Pamukkale"; Ok=($text.IndexOf("{id:'cappadocia', img:EXC_IMG+'exc-cappadocia.webp'") -ge 0 -and $text.IndexOf("{id:'cappadocia', img:EXC_IMG+'exc-cappadocia.webp'") -lt $text.IndexOf("{id:'pamukkale', img:EXC_IMG+'exc-pamukkale.webp'"))},
  @{Label="Motion: Yacht vorhanden"; Ok=$text.Contains("{ id:'yacht'")},
  @{Label="Motion: VIP-Empfang vorhanden"; Ok=$text.Contains("{ id:'welcome'")},
  @{Label="Motion: Yacht vor Pamukkale"; Ok=($text.IndexOf("{ id:'yacht'") -lt $text.IndexOf("{ id:'pamukkale'", $text.IndexOf("const CLIPS=")))},
  @{Label="iOS: direkter Video-src Loader"; Ok=$text.Contains("v.src=v.dataset.bg")},
  @{Label="iOS: Touch-Playback-Fallback"; Ok=$text.Contains("addEventListener('touchstart',bgTouchHandler")},
  @{Label="Intro: Countdown Playback Guard"; Ok=$text.Contains("keepIntroRolling()")},
  @{Label="Build r4 in HTML"; Ok=$htmlText.Contains("20260817-1924-motion5-r4")},
  @{Label="Build r4 in version.json"; Ok=$versionText.Contains("20260817-1924-motion5-r4")},
  @{Label="Yacht Video vorhanden"; Ok=(Test-Path (Join-Path $root "public\video\onlyone-yacht-tour-v2.mp4"))},
  @{Label="VIP-Empfang Video vorhanden"; Ok=(Test-Path (Join-Path $root "public\video\onlyone-vip-welcome-v3.mp4"))}
)

$failed=$false
foreach($c in $checks){
  if($c.Ok){ Write-Host "OK  $($c.Label)" -ForegroundColor Green }
  else { Write-Host "FEHLER  $($c.Label)" -ForegroundColor Red; $failed=$true }
}
if($failed){ exit 1 }
Write-Host "`nProjektstand ist korrekt und kann gepusht werden." -ForegroundColor Cyan
