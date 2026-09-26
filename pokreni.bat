@echo off
rem ERP-WMS - pokretanje na Windowsu
rem Redom: provjere, baza (Docker), npm install, migracije, build, start.
rem Na prvoj gresci se zaustavlja i kaze sto nije uspjelo.

chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo === ERP-WMS: pokretanje ===
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nije instaliran. Instalirajte Node.js 22 LTS s https://nodejs.org i pokrenite ponovno.
  goto :greska
)

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker nije instaliran. Instalirajte Docker Desktop s https://www.docker.com i pokrenite ponovno.
  goto :greska
)

docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop nije pokrenut. Pokrenite Docker Desktop, pricekajte da se upali i pokrenite ponovno.
  goto :greska
)

if not exist ".env" (
  echo Datoteka .env ne postoji - radim je sa slucajnom lozinkom baze.
  powershell -NoProfile -Command "$l = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_}); (Get-Content '.env.example') -replace 'promijenite-me', $l | Set-Content -Encoding utf8 '.env'"
  if errorlevel 1 (
    echo Nije uspjelo napraviti .env.
    goto :greska
  )
)

rem kljuc za sifriranje tajni (SMTP lozinka, fiskalni certifikat, prijava u dva koraka): jednom, nikad se ne mijenja
findstr /r /c:"^TAJNI_KLJUC=\"..*\"" .env >nul 2>nul
if errorlevel 1 (
  echo Postavljam slucajni TAJNI_KLJUC u .env - spremite kopiju datoteke .env na sigurno mjesto.
  powershell -NoProfile -Command "$k = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_}); $s = Get-Content '.env'; if ($s -match '^TAJNI_KLJUC=') { $s = $s -replace '^TAJNI_KLJUC=.*$', ('TAJNI_KLJUC=\"' + $k + '\"') } else { $s += ('TAJNI_KLJUC=\"' + $k + '\"') }; $s | Set-Content -Encoding utf8 '.env'"
  if errorlevel 1 (
    echo Nije uspjelo postaviti TAJNI_KLJUC.
    goto :greska
  )
)

echo [1/6] Baza podataka (Docker)...
docker compose up -d --wait baza
if errorlevel 1 (
  echo Baza se nije pokrenula. Provjerite Docker Desktop i je li port 5432 slobodan.
  goto :greska
)

echo.
echo [2/6] Instalacija paketa (npm install)...
call npm install
if errorlevel 1 (
  echo npm install nije uspio.
  goto :greska
)

echo.
echo [3/6] Migracije baze...
call npx prisma migrate deploy
if errorlevel 1 (
  echo Migracije baze nisu uspjele.
  goto :greska
)

echo.
echo [4/6] Prvi administrator (samo ako jos nema korisnika)...
call npm run admin:prvi -- --ako-nema
if errorlevel 1 (
  echo Prvi administrator nije napravljen.
  goto :greska
)

echo.
echo [5/6] Izgradnja programa (build)...
call npm run build
if errorlevel 1 (
  echo Izgradnja programa nije uspjela.
  goto :greska
)

echo.
echo [6/6] Pokretanje. Program je na https://localhost:3000  (zaustavljanje: Ctrl+C)
echo       S mobitela u istoj mrezi: adrese su ispisane ispod (kamera za skeniranje radi samo preko https).
echo       Preglednik ce jednom upozoriti na certifikat - odaberite Napredno, pa Nastavi.
echo       Bez HTTPS-a: u datoteci .env promijenite HTTPS="1" u HTTPS="0".
echo.
findstr /b /c:"HTTPS=" .env >nul 2>nul || (echo.& echo HTTPS="1") >> .env
call npm run start
if errorlevel 1 (
  echo Program se zaustavio s greskom.
  goto :greska
)
exit /b 0

:greska
echo.
echo *** ZAUSTAVLJENO - pogledajte poruku iznad. ***
echo.
pause
exit /b 1
