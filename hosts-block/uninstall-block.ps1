# =====================================================================
#  uninstall-block.ps1
#  Zdjecie blokady domen z pliku hosts - WYMAGA HASLA.
#  - sam prosi o uprawnienia administratora (UAC)
#  - prosi o haslo, liczy SHA-256 i porownuje z zapisanym hashem
#  - TYLKO przy zgodnym hasle: usuwa sekcje BLOCK-START..BLOCK-END,
#    zdejmuje read-only, przywraca uprawnienia NTFS, czysci DNS
#  - bledne haslo lub brak hasla = zadnych zmian w pliku hosts
# =====================================================================

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------
# Self-elevate
# ---------------------------------------------------------------------
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]$identity
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    try {
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"") `
            -Verb RunAs
    } catch {
        Write-Host 'Nie udzielono uprawnien administratora. Przerwano.' -ForegroundColor Red
        Start-Sleep -Seconds 3
    }
    exit
}

# ---------------------------------------------------------------------
# Funkcje pomocnicze
# ---------------------------------------------------------------------
function Read-PlainPassword([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try     { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Get-Sha256Hex([string]$Text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $sha.Dispose()
    }
}

# ---------------------------------------------------------------------
# Konfiguracja
# ---------------------------------------------------------------------
$HostsPath  = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$HashFile   = Join-Path $PSScriptRoot '.block-password.hash'
$BlockStart = '# BLOCK-START'
$BlockEnd   = '# BLOCK-END'

# ---------------------------------------------------------------------
# 1. Weryfikacja hasla - jedyna droga zdjecia blokady
# ---------------------------------------------------------------------
if (-not (Test-Path $HashFile)) {
    Write-Host 'Nie znaleziono pliku z haslem (.block-password.hash).' -ForegroundColor Red
    Write-Host 'Bez ustawionego hasla nie mozna zweryfikowac uprawnien - brak akcji.'
    Read-Host 'Nacisnij Enter, aby zamknac okno'
    exit 1
}

$storedHash = ([System.IO.File]::ReadAllText($HashFile)).Trim().ToLowerInvariant()

Write-Host ''
Write-Host '=== Zdejmowanie blokady domen ===' -ForegroundColor Cyan
Write-Host 'Wymagane haslo ustawione przy instalacji (zna je Ania).'
Write-Host ''

$given = Read-PlainPassword 'Podaj haslo'
$givenHash = Get-Sha256Hex $given
$given = $null

if ($givenHash -ne $storedHash) {
    Write-Host ''
    Write-Host 'BLEDNE HASLO. Plik hosts nie zostal zmieniony.' -ForegroundColor Red
    Read-Host 'Nacisnij Enter, aby zamknac okno'
    exit 1
}

Write-Host 'Haslo poprawne.' -ForegroundColor Green

# ---------------------------------------------------------------------
# 2. Usuniecie sekcji BLOCK z pliku hosts
# ---------------------------------------------------------------------
# przywroc mozliwosc zapisu
icacls.exe $HostsPath /reset | Out-Null
$hostsItem = Get-Item $HostsPath -Force
if ($hostsItem.IsReadOnly) { $hostsItem.IsReadOnly = $false }

$lines = @(Get-Content -Path $HostsPath -ErrorAction SilentlyContinue)
$clean = New-Object System.Collections.Generic.List[string]
$inBlock = $false
$found = $false
foreach ($line in $lines) {
    if ($line.Trim() -eq $BlockStart) { $inBlock = $true; $found = $true; continue }
    if ($line.Trim() -eq $BlockEnd)   { $inBlock = $false; continue }
    if (-not $inBlock) { $clean.Add($line) }
}

while ($clean.Count -gt 0 -and [string]::IsNullOrWhiteSpace($clean[$clean.Count - 1])) {
    $clean.RemoveAt($clean.Count - 1)
}

if ($found) {
    Set-Content -Path $HostsPath -Value $clean -Encoding Ascii
    Write-Host 'Sekcja BLOCK usunieta z pliku hosts.' -ForegroundColor Green
} else {
    Write-Host 'Nie znaleziono sekcji BLOCK w pliku hosts (nic do usuniecia).' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------
# 3. Flush DNS
# ---------------------------------------------------------------------
ipconfig.exe /flushdns | Out-Null
Write-Host 'Cache DNS wyczyszczony.' -ForegroundColor Green

Write-Host ''
Write-Host 'BLOKADA ZDJETA.' -ForegroundColor Green
Write-Host 'Plik z hashem hasla zostal zachowany - ponowna instalacja uzyje tego samego hasla.'
Write-Host ''
Read-Host 'Nacisnij Enter, aby zamknac okno'
