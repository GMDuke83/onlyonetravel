$ErrorActionPreference = "Stop"
$js = Join-Path $PSScriptRoot "public\js\app.js"
if (!(Test-Path $js)) { throw "public\js\app.js fehlt" }
$text = Get-Content $js -Raw
$checks = @(
  @{Label="Ausflüge: Kappadokien vor Pamukkale"; Ok=($text.IndexOf("{id:'cappadocia', img:EXC_IMG+'exc-cappadocia.webp'") -lt $text.IndexOf("{id:'pamukkale', img:EXC_IMG+'exc-pamukkale.webp'"))},
  @{Label="Motion: Yacht vorhanden"; Ok=$text.Contains("id:'yacht'")},
  @{Label="Motion: VIP-Empfang vorhanden"; Ok=$text.Contains("id:'welcome'")},
  @{Label="Motion: Yacht vor Kappadokien"; Ok=($text.IndexOf("{ id:'yacht'") -lt $text.IndexOf("{ id:'groups'"))}
)
$failed=$false
foreach($c in $checks){
  if($c.Ok){ Write-Host "OK  $($c.Label)" -ForegroundColor Green }
  else { Write-Host "FEHLER  $($c.Label)" -ForegroundColor Red; $failed=$true }
}
if($failed){ exit 1 }
Write-Host "`nProjektstand ist korrekt und kann gepusht werden." -ForegroundColor Cyan
