# Przepisuje zawartosc schowka jako wartosc NAZWA= w pliku na pulpicie. Wartosci nie wypisuje.
#   powershell -ExecutionPolicy Bypass -File scripts/migracja/wpisz-ze-schowka.ps1 NAZWA [plik]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$File = "$env:USERPROFILE\Desktop\sekrety-do-uzupelnienia.txt"
)
$v = Get-Clipboard -Raw
if ($null -eq $v) { Write-Output "$Name : schowek pusty"; exit 1 }
$v = $v.Trim()
if ($v.Length -lt 4) { Write-Output "$Name : schowek za krotki (dlugosc $($v.Length))"; exit 1 }
if ($v.Contains("`n")) { Write-Output "$Name : schowek ma wiele linii, pomijam"; exit 1 }
$lines = @(Get-Content -LiteralPath $File -Encoding UTF8)
$found = $false
$out = foreach ($l in $lines) {
  if ($l -match ("^" + [regex]::Escape($Name) + "=")) { $found = $true; "$Name=$v" } else { $l }
}
if (-not $found) { $out += "$Name=$v" }
Set-Content -LiteralPath $File -Value $out -Encoding UTF8
Set-Clipboard -Value " "
$kind = if ($v -match '^[A-Za-z0-9_\-\.:]+$') { "token" } else { "tekst" }
$extra = if ($found) { "" } else { ", nowa linia" }
Write-Output "$Name : zapisano ($kind, dlugosc $($v.Length))$extra"
