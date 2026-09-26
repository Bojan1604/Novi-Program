<#
.SYNOPSIS
  ERP-WMS MDM agent za Windows 10/11 (protokol: agenti/PROTOKOL.md).
.DESCRIPTION
  Pokreće se kao zakazani zadatak pod SYSTEM-om svakih 5 minuta (instaliraj.ps1).
  Prvo pokretanje s -Adresa i -Kod upisuje uređaj; token se sprema u ProgramData (samo SYSTEM i administratori).
#>
param(
  [string]$Adresa,
  [string]$Kod,
  [string]$Naziv
)

$ErrorActionPreference = "Stop"
$VERZIJA = "1.0.0"
$Mapa = Join-Path $env:ProgramData "ERP-WMS-MDM"
$Postavke = Join-Path $Mapa "postavke.json"
$Stanje = Join-Path $Mapa "stanje.json"
$ZapisnikDat = Join-Path $Mapa "agent.log"
New-Item -ItemType Directory -Force -Path $Mapa | Out-Null

function Zapisi([string]$razina, [string]$poruka) {
  $red = "{0} [{1}] {2}" -f (Get-Date -Format o), $razina, $poruka
  Add-Content -Path $ZapisnikDat -Value $red -Encoding UTF8
  $script:ZaSlanje += , @{ razina = $razina; poruka = $poruka; vrijeme = (Get-Date).ToUniversalTime().ToString("o") }
}
$script:ZaSlanje = @()

function Zastiti([string]$putanja) {
  # samo SYSTEM i administratori smiju čitati token
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($tko in @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators")) {
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($tko, "FullControl", "Allow")))
  }
  Set-Acl -Path $putanja -AclObject $acl
}

function Api([string]$metoda, [string]$put, $tijelo, [string]$token) {
  $h = @{}
  if ($token) { $h["Authorization"] = "Bearer $token" }
  $p = @{ Method = $metoda; Uri = ($script:Konf.adresa.TrimEnd("/") + $put); Headers = $h; TimeoutSec = 60; UseBasicParsing = $true }
  if ($null -ne $tijelo) { $p["Body"] = [System.Text.Encoding]::UTF8.GetBytes(($tijelo | ConvertTo-Json -Depth 8 -Compress)); $p["ContentType"] = "application/json; charset=utf-8" }
  return Invoke-RestMethod @p
}

function Serijski {
  $s = (Get-CimInstance Win32_BIOS).SerialNumber
  if (-not $s -or $s -match "^(To be filled|Default|0+)") { $s = $env:COMPUTERNAME }
  return ($s -replace "\s", "").ToUpper()
}

# ——— upis ———
if ($Adresa -and $Kod) {
  $script:Konf = @{ adresa = $Adresa }
  $os = Get-CimInstance Win32_OperatingSystem
  $cs = Get-CimInstance Win32_ComputerSystem
  $r = Api "POST" "/api/mdm/upis" @{
    kod = $Kod; serijski = (Serijski); platforma = "WINDOWS"; naziv = ($(if ($Naziv) { $Naziv } else { $env:COMPUTERNAME }))
    model = "$($cs.Manufacturer) $($cs.Model)"; osVerzija = "$($os.Caption) $($os.Version)"; verzijaAgenta = $VERZIJA
  } $null
  @{ adresa = $Adresa; token = $r.token; uredajId = $r.uredajId } | ConvertTo-Json | Set-Content -Path $Postavke -Encoding UTF8
  Zastiti $Postavke
  Write-Output "Uređaj je upisan ($($r.uredajId))."
}

if (-not (Test-Path $Postavke)) { Write-Error "Uređaj nije upisan: pokrenite s -Adresa i -Kod."; exit 1 }
$script:Konf = Get-Content $Postavke -Raw | ConvertFrom-Json
$lokalno = if (Test-Path $Stanje) { Get-Content $Stanje -Raw | ConvertFrom-Json } else { [pscustomobject]@{ izvrsene = @(); profil = 0; aplikacije = @{} } }
if (-not $lokalno.aplikacije) { $lokalno | Add-Member -Force aplikacije ([pscustomobject]@{}) }

function Spremi-Stanje { $lokalno | ConvertTo-Json -Depth 6 | Set-Content -Path $Stanje -Encoding UTF8 }

function Izvjestaj {
  $os = Get-CimInstance Win32_OperatingSystem
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'"
  $bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
  $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
  $apl = @()
  foreach ($p in $lokalno.aplikacije.PSObject.Properties) { $apl += @{ paket = $p.Name; verzijaKod = [int]$p.Value } }
  return @{
    racunalo = $env:COMPUTERNAME; korisnik = (Get-CimInstance Win32_ComputerSystem).UserName; os = "$($os.Caption) $($os.Version)"
    slobodnoGB = [math]::Round($disk.FreeSpace / 1GB, 1); ukupnoGB = [math]::Round($disk.Size / 1GB, 1)
    ramGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1); baterija = $(if ($bat) { $bat.EstimatedChargeRemaining } else { $null })
    ip = $ip; pokrenutOd = $os.LastBootUpTime.ToString("o"); verzijaAgenta = $VERZIJA; aplikacije = $apl
  }
}

function Preuzmi([string]$put, [string]$sha, [string]$odrediste) {
  Invoke-WebRequest -Uri ($script:Konf.adresa.TrimEnd("/") + $put) -Headers @{ Authorization = "Bearer $($script:Konf.token)" } -OutFile $odrediste -UseBasicParsing -TimeoutSec 600
  $h = (Get-FileHash -Algorithm SHA256 -Path $odrediste).Hash.ToLower()
  if ($h -ne $sha.ToLower()) { Remove-Item $odrediste -Force; throw "SHA-256 ne odgovara ($h)." }
}

function Snimi-Zaslon([string]$naredbaId) {
  # snimka radi samo u sesiji prijavljenog korisnika — zadatak SYSTEM-a pokreće pomoćni zadatak u toj sesiji
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $slika = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($slika)
  $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $slika.Size)
  $ms = New-Object System.IO.MemoryStream
  $slika.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  Invoke-RestMethod -Method POST -Uri ($script:Konf.adresa.TrimEnd("/") + "/api/mdm/zaslon") -Headers @{ Authorization = "Bearer $($script:Konf.token)"; "X-Naredba" = $naredbaId } -Body $ms.ToArray() -ContentType "image/png" -UseBasicParsing | Out-Null
}

function Izvrsi($n) {
  switch ($n.vrsta) {
    "ZAKLJUCAJ" { & rundll32.exe user32.dll, LockWorkStation; return "Zaslon zaključan." }
    "PONOVNO_POKRENI" { shutdown.exe /r /t 60 /c "Ponovno pokretanje (MDM)"; return "Ponovno pokretanje za 60 s." }
    "PORUKA" { & msg.exe * /TIME:600 $n.parametri.tekst; return "Poruka prikazana." }
    "POSALJI_ZAPISNIK" {
      Get-Content $ZapisnikDat -Tail 200 -ErrorAction SilentlyContinue | ForEach-Object { $script:ZaSlanje += , @{ razina = "INFO"; poruka = $_ } }
      return "Zapisnik poslan."
    }
    "SNIMI_ZASLON" { Snimi-Zaslon $n.id; return $null }  # rezultat bilježi sama snimka
    "INSTALIRAJ" {
      $a = $script:Odgovor.aplikacije | Where-Object { $_.id -eq $n.parametri.aplikacijaId } | Select-Object -First 1
      if (-not $a) { throw "Aplikacija nije u popisu dodijeljenih." }
      $msi = Join-Path $env:TEMP "$($a.paket)-$($a.verzijaKod).msi"
      Preuzmi $a.adresa $a.sha256 $msi
      $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
      Remove-Item $msi -Force -ErrorAction SilentlyContinue
      if ($p.ExitCode -notin 0, 3010) { throw "msiexec izlaz $($p.ExitCode)." }
      $lokalno.aplikacije | Add-Member -Force $a.paket $a.verzijaKod
      return "Instalirano $($a.paket) $($a.verzija)."
    }
    "DEINSTALIRAJ" {
      $p = Start-Process msiexec.exe -ArgumentList "/x $($n.parametri.paket) /qn /norestart" -Wait -PassThru
      if ($p.ExitCode -notin 0, 1605, 3010) { throw "msiexec izlaz $($p.ExitCode)." }
      $lokalno.aplikacije.PSObject.Properties.Remove($n.parametri.paket)
      return "Uklonjeno $($n.parametri.paket)."
    }
    "OBRISI_PODATKE" {
      # vraćanje na tvorničke postavke (Windows Reset); zahtijeva Windows 10 1709+
      Start-Process systemreset.exe -ArgumentList "-factoryreset" -Wait
      return "Pokrenuto vraćanje na tvorničke postavke."
    }
    default { throw "Nepoznata naredba $($n.vrsta)." }
  }
}

function Primijeni-Profil($p) {
  if (-not $p -or $p.verzija -eq $lokalno.profil) { return }
  if ($p.lozinkaMin) { net accounts /minpwlen:$($p.lozinkaMin) | Out-Null }
  if ($p.zakljucajNakonMin) {
    Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name InactivityTimeoutSecs -Value ([int]$p.zakljucajNakonMin * 60) -Type DWord
  }
  $kamera = if ($p.kameraDopustena) { 1 } else { 0 }
  New-Item -Force -Path "HKLM:\SOFTWARE\Policies\Microsoft\Camera" | Out-Null
  Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Camera" -Name AllowCamera -Value $kamera -Type DWord
  $usb = if ($p.usbDopusten) { 3 } else { 4 }
  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" -Name Start -Value $usb -Type DWord
  if ($p.wifiSsid -and $p.wifiLozinka) {
    $xml = @"
<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>$($p.wifiSsid)</name>
<SSIDConfig><SSID><name>$($p.wifiSsid)</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode>
<MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>$([System.Security.SecurityElement]::Escape($p.wifiLozinka))</keyMaterial></sharedKey></security></MSM></WLANProfile>
"@
    $dat = Join-Path $env:TEMP "erp-wifi.xml"
    Set-Content -Path $dat -Value $xml -Encoding UTF8
    netsh wlan add profile filename="$dat" user=all | Out-Null
    Remove-Item $dat -Force
  }
  $lokalno.profil = $p.verzija
  Zapisi "INFO" "Primijenjen profil v$($p.verzija)."
}

function Datoteke($lista) {
  foreach ($d in $lista) {
    $mapa = if ([System.IO.Path]::IsPathRooted($d.putanja)) { $d.putanja } else { Join-Path $env:PUBLIC $d.putanja }
    New-Item -ItemType Directory -Force -Path $mapa | Out-Null
    $cilj = Join-Path $mapa $d.naziv
    if ((Test-Path $cilj) -and ((Get-FileHash -Algorithm SHA256 $cilj).Hash.ToLower() -eq $d.sha256)) { continue }
    Preuzmi $d.adresa $d.sha256 $cilj
    Zapisi "INFO" "Datoteka $($d.naziv) spremljena u $mapa."
  }
}

# ——— javljanje ———
try {
  $script:Odgovor = Api "POST" "/api/mdm/javi" @{ izvjestaj = (Izvjestaj) } $script:Konf.token
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) { Zapisi "GRESKA" "Uređaj je blokiran ili više nije upisan."; exit 2 }
  throw
}
try { Primijeni-Profil $script:Odgovor.profil } catch { Zapisi "GRESKA" "Profil: $($_.Exception.Message)" }
try { Datoteke $script:Odgovor.datoteke } catch { Zapisi "GRESKA" "Datoteke: $($_.Exception.Message)" }
foreach ($n in $script:Odgovor.naredbe) {
  if ($lokalno.izvrsene -contains $n.id) { continue }
  try {
    $poruka = Izvrsi $n
    if ($null -ne $poruka) { Api "POST" "/api/mdm/rezultat" @{ naredbaId = $n.id; uspjeh = $true; poruka = $poruka } $script:Konf.token | Out-Null }
    Zapisi "INFO" "$($n.vrsta): $poruka"
  } catch {
    Api "POST" "/api/mdm/rezultat" @{ naredbaId = $n.id; uspjeh = $false; poruka = $_.Exception.Message } $script:Konf.token | Out-Null
    Zapisi "GRESKA" "$($n.vrsta): $($_.Exception.Message)"
  }
  $lokalno.izvrsene = @($lokalno.izvrsene + $n.id | Select-Object -Last 500)
  Spremi-Stanje
}
Spremi-Stanje
if ($script:ZaSlanje.Count) { Api "POST" "/api/mdm/zapisnik" @{ zapisi = $script:ZaSlanje } $script:Konf.token | Out-Null }
