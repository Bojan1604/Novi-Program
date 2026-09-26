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
$Radna = Join-Path $Mapa "radna"

function Zastiti([string]$putanja) {
  # samo SYSTEM i administratori (vlasnik Administrators) — obični korisnik ne smije čitati token
  # ni podmetnuti datoteke (MSI, Wi-Fi) u mapu koju agent koristi pod SYSTEM-om
  $acl = if (Test-Path $putanja -PathType Container) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
  $acl.SetOwner([System.Security.Principal.NTAccount]"BUILTIN\Administrators")
  $acl.SetAccessRuleProtection($true, $false)
  $nasljedi = if (Test-Path $putanja -PathType Container) { "ContainerInherit,ObjectInherit" } else { "None" }
  foreach ($tko in @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators")) {
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($tko, "FullControl", $nasljedi, "None", "Allow")))
  }
  Set-Acl -Path $putanja -AclObject $acl
}

New-Item -ItemType Directory -Force -Path $Mapa | Out-Null
Zastiti $Mapa
New-Item -ItemType Directory -Force -Path $Radna | Out-Null
Zastiti $Radna
# nasumičan naziv u zaštićenoj mapi (ne u C:\Windows\Temp gdje korisnik može unaprijed stvoriti datoteku)
function Privremena([string]$nastavak) { Join-Path $Radna ("{0}{1}" -f [guid]::NewGuid().ToString("N"), $nastavak) }

function Zapisi([string]$razina, [string]$poruka) {
  $red = "{0} [{1}] {2}" -f (Get-Date -Format o), $razina, $poruka
  Add-Content -Path $ZapisnikDat -Value $red -Encoding UTF8
  $script:ZaSlanje += , @{ razina = $razina; poruka = $poruka; vrijeme = (Get-Date).ToUniversalTime().ToString("o") }
}
$script:ZaSlanje = @()

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
  # SYSTEM (sesija 0) ne vidi zaslon: jednokratni zadatak u sesiji prijavljenog korisnika snima u njegovu mapu,
  # SYSTEM zatim šalje snimku. Korisnik može podmetnuti samo sliku vlastitog zaslona — nema povećanja prava.
  $korisnik = (Get-CimInstance Win32_ComputerSystem).UserName
  if (-not $korisnik) { throw "Nitko nije prijavljen — nema zaslona za snimku." }
  $profil = (Get-CimInstance Win32_UserProfile | Where-Object { $_.Loaded -and $_.LocalPath -and (Split-Path $_.LocalPath -Leaf) -eq ($korisnik -split "\\")[-1] } | Select-Object -First 1).LocalPath
  if (-not $profil) { throw "Profil prijavljenog korisnika nije pronađen." }
  $slikaPut = Join-Path $profil ("AppData\Local\Temp\erp-mdm-zaslon-{0}.png" -f [guid]::NewGuid().ToString("N"))
  $skripta = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;`$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;`$s=New-Object System.Drawing.Bitmap `$b.Width,`$b.Height;[System.Drawing.Graphics]::FromImage(`$s).CopyFromScreen(`$b.Left,`$b.Top,0,0,`$s.Size);`$s.Save('$slikaPut',[System.Drawing.Imaging.ImageFormat]::Png)"
  $kodirano = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($skripta))
  $ime = "ERP-WMS MDM zaslon " + [guid]::NewGuid().ToString("N")
  $akcija = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -EncodedCommand $kodirano"
  $tko = New-ScheduledTaskPrincipal -UserId $korisnik -LogonType Interactive
  Register-ScheduledTask -TaskName $ime -Action $akcija -Principal $tko -Force | Out-Null
  try {
    Start-ScheduledTask -TaskName $ime
    for ($i = 0; $i -lt 30 -and -not (Test-Path $slikaPut); $i++) { Start-Sleep -Seconds 1 }
    if (-not (Test-Path $slikaPut)) { throw "Snimka nije nastala (zaključan zaslon?)." }
    Start-Sleep -Milliseconds 500
    $bajtovi = [System.IO.File]::ReadAllBytes($slikaPut)
    Invoke-RestMethod -Method POST -Uri ($script:Konf.adresa.TrimEnd("/") + "/api/mdm/zaslon") -Headers @{ Authorization = "Bearer $($script:Konf.token)"; "X-Naredba" = $naredbaId } -Body $bajtovi -ContentType "image/png" -UseBasicParsing | Out-Null
  } finally {
    Unregister-ScheduledTask -TaskName $ime -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item $slikaPut -Force -ErrorAction SilentlyContinue
  }
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
      $msi = Privremena ".msi"
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
<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>$([System.Security.SecurityElement]::Escape($p.wifiSsid))</name>
<SSIDConfig><SSID><name>$([System.Security.SecurityElement]::Escape($p.wifiSsid))</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode>
<MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>$([System.Security.SecurityElement]::Escape($p.wifiLozinka))</keyMaterial></sharedKey></security></MSM></WLANProfile>
"@
    $dat = Privremena ".xml"
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
