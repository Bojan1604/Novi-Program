<#
.SYNOPSIS
  Instalacija ERP-WMS MDM agenta: kopira agenta, upisuje uređaj i stvara zakazani zadatak (SYSTEM, svakih 5 min).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File instaliraj.ps1 -Adresa https://erp.firma.hr -Kod ABCD-EFGH-JKMN
#>
param([Parameter(Mandatory)] [string]$Adresa, [Parameter(Mandatory)] [string]$Kod, [string]$Naziv)
$ErrorActionPreference = "Stop"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Pokrenite kao administrator."
}
$cilj = Join-Path $env:ProgramFiles "ERP-WMS-MDM"
New-Item -ItemType Directory -Force -Path $cilj | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "erp-mdm-agent.ps1") $cilj
$agent = Join-Path $cilj "erp-mdm-agent.ps1"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agent -Adresa $Adresa -Kod $Kod -Naziv $Naziv
$akcija = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agent`""
$okidac = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
$pokretanje = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "ERP-WMS MDM agent" -Action $akcija -Trigger @($okidac, $pokretanje) -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Write-Output "Agent je instaliran i javlja se svakih 5 minuta."
