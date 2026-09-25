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
  echo Datoteka .env ne postoji - radim je iz .env.example.
  copy /y ".env.example" ".env" >nul
  if errorlevel 1 (
    echo Nije uspjelo kopiranje .env.example u .env.
    goto :greska
  )
)

echo [1/5] Baza podataka (Docker)...
docker compose up -d --wait baza
if errorlevel 1 (
  echo Baza se nije pokrenula. Provjerite Docker Desktop i je li port 5432 slobodan.
  goto :greska
)

echo.
echo [2/5] Instalacija paketa (npm install)...
call npm install
if errorlevel 1 (
  echo npm install nije uspio.
  goto :greska
)

echo.
echo [3/5] Migracije baze...
call npx prisma migrate deploy
if errorlevel 1 (
  echo Migracije baze nisu uspjele.
  goto :greska
)

echo.
echo [4/5] Izgradnja programa (build)...
call npm run build
if errorlevel 1 (
  echo Izgradnja programa nije uspjela.
  goto :greska
)

echo.
echo [5/5] Pokretanje. Program je na http://localhost:3000  (zaustavljanje: Ctrl+C)
echo.
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
