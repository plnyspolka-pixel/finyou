# =====================================================================
#  install-block.ps1
#  Blokada wybranych domen przez plik hosts (przekierowanie na 0.0.0.0)
#  - sam prosi o uprawnienia administratora (UAC)
#  - przy pierwszym uruchomieniu ustawia haslo do odblokowania (SHA-256)
#  - oznacza wpisy sekcja # BLOCK-START / # BLOCK-END
#  - ustawia hosts jako read-only + zaostrza uprawnienia NTFS
#  - czysci cache DNS
# =====================================================================

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------
# 1. Self-elevate: jesli nie jestesmy adminem, uruchom ponownie z UAC
# ---------------------------------------------------------------------
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]$identity
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    try {
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"") `
            -Verb RunAs
    } catch {
        Write-Host 'Nie udzielono uprawnien administratora. Instalacja przerwana.' -ForegroundColor Red
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

# Domeny bazowe - kazda dostanie automatycznie warianty www. i m. (mobilne)
$BaseDomains = @(
    'snapchat.com',
    'telegram.org',
    't.me',
    'signal.org',
    'escort.pl',
    'erodate.pl',
    'pornhub.com'
)

# Dodatkowe konkretne hosty (wersje webowe komunikatorow)
$ExtraHosts = @(
    'web.snapchat.com',
    'accounts.snapchat.com',
    'web.telegram.org',
    'webk.telegram.org',
    'webz.telegram.org'
)

$AllHosts = @()
foreach ($d in $BaseDomains) {
    $AllHosts += $d
    $AllHosts += "www.$d"
    $AllHosts += "m.$d"
}
$AllHosts += $ExtraHosts
$AllHosts = $AllHosts | Select-Object -Unique

# ---------------------------------------------------------------------
# 2. Pierwsze uruchomienie: ustawienie hasla (hash SHA-256 w ukrytym pliku)
# ---------------------------------------------------------------------
if (-not (Test-Path $HashFile)) {
    Write-Host ''
    Write-Host '=== Ustawianie hasla do odblokowania ===' -ForegroundColor Cyan
    Write-Host 'To haslo bedzie wymagane przez uninstall-block.ps1, aby zdjac blokade.'
    Write-Host 'Haslo ustawia i zna wylacznie osoba pilnujaca blokady (Ania).'
    Write-Host ''

    while ($true) {
        $p1 = Read-PlainPassword 'Podaj nowe haslo'
        if ([string]::IsNullOrWhiteSpace($p1) -or $p1.Length -lt 6) {
            Write-Host 'Haslo musi miec co najmniej 6 znakow. Sprobuj ponownie.' -ForegroundColor Yellow
            continue
        }
        $p2 = Read-PlainPassword 'Powtorz haslo'
        if ($p1 -ne $p2) {
            Write-Host 'Hasla nie sa identyczne. Sprobuj ponownie.' -ForegroundColor Yellow
            continue
        }
        break
    }

    $hash = Get-Sha256Hex $p1
    $p1 = $null; $p2 = $null

    # zapis hasha + ukrycie pliku
    [System.IO.File]::WriteAllText($HashFile, $hash, [System.Text.Encoding]::ASCII)
    $item = Get-Item $HashFile -Force
    $item.Attributes = $item.Attributes -bor [System.IO.FileAttributes]::Hidden

    Write-Host 'Haslo zapisane (hash SHA-256, plik ukryty).' -ForegroundColor Green
} else {
    Write-Host 'Haslo do odblokowania jest juz ustawione - pomijam ten krok.' -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------
# 3. Modyfikacja pliku hosts
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '=== Aktualizacja pliku hosts ===' -ForegroundColor Cyan

# zdejmij read-only na czas zapisu
$hostsItem = Get-Item $HostsPath -Force
if ($hostsItem.IsReadOnly) { $hostsItem.IsReadOnly = $false }

# wczytaj aktualna zawartosc i usun ewentualna stara sekcje BLOCK
$lines = @(Get-Content -Path $HostsPath -ErrorAction SilentlyContinue)
$clean = New-Object System.Collections.Generic.List[string]
$inBlock = $false
foreach ($line in $lines) {
    if ($line.Trim() -eq $BlockStart) { $inBlock = $true;  continue }
    if ($line.Trim() -eq $BlockEnd)   { $inBlock = $false; continue }
    if (-not $inBlock) { $clean.Add($line) }
}

# dopisz swieza sekcje BLOCK
while ($clean.Count -gt 0 -and [string]::IsNullOrWhiteSpace($clean[$clean.Count - 1])) {
    $clean.RemoveAt($clean.Count - 1)
}
$clean.Add('')
$clean.Add($BlockStart)
foreach ($h in $AllHosts) {
    $clean.Add("0.0.0.0 $h")
}
$clean.Add($BlockEnd)

Set-Content -Path $HostsPath -Value $clean -Encoding Ascii
Write-Host ("Dodano {0} wpisow blokujacych." -f $AllHosts.Count) -ForegroundColor Green

# ---------------------------------------------------------------------
# 4. Zaostrzenie uprawnien NTFS na pliku hosts
#    (SYSTEM i Administratorzy: pelna kontrola; Uzytkownicy: tylko odczyt)
#    SID-y uzyte zamiast nazw, aby dzialalo na kazdej wersji jezykowej.
# ---------------------------------------------------------------------
icacls.exe $HostsPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' '*S-1-5-32-545:RX' | Out-Null
Write-Host 'Uprawnienia NTFS zaostrzone (modyfikacja wymaga podniesienia uprawnien).' -ForegroundColor Green

# ---------------------------------------------------------------------
# 5. Atrybut read-only + flush DNS
# ---------------------------------------------------------------------
(Get-Item $HostsPath -Force).IsReadOnly = $true
Write-Host 'Plik hosts oznaczony jako tylko-do-odczytu.' -ForegroundColor Green

ipconfig.exe /flushdns | Out-Null
Write-Host 'Cache DNS wyczyszczony.' -ForegroundColor Green

Write-Host ''
Write-Host 'BLOKADA ZALOZONA POMYSLNIE.' -ForegroundColor Green
Write-Host 'Aby ja zdjac, uruchom uninstall-block.ps1 (wymagane haslo).'
Write-Host ''
Read-Host 'Nacisnij Enter, aby zamknac okno'
