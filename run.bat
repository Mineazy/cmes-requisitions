@echo off
echo ============================================
echo Copperbelt Mining Requisitions Management System
echo ============================================
echo.

:: Check if Docker is available
docker info >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [1] Start with Docker (PostgreSQL + Backend)
    echo [2] Start backend only (standalone Node.js)
    echo [3] Open frontend (static HTML)
    echo.
    set /p choice="Select option (1-3): "
    
    if "%choice%"=="1" (
        echo Starting with Docker...
        cd /d "%~dp0"
        docker compose up -d --build
        echo Backend: http://localhost:3001
        echo Frontend: http://localhost:3001
        echo.
        echo Run seed: docker compose exec app node src/seed.js
        goto :eof
    )
    if "%choice%"=="2" (
        goto :standalone
    )
    if "%choice%"=="3" (
        goto :frontend
    )
) else (
    echo Docker not found. Starting standalone...
    goto :standalone
)

:standalone
cd /d "%~dp0backend"
if not exist "keys\ecdsa-private.pem" (
    echo Generating ECDSA crypto keys...
    node -e "const c=require('crypto'),f=require('fs');f.mkdirSync('keys',{recursive:true});const k=c.generateKeyPairSync('ec',{namedCurve:'P-384',publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});f.writeFileSync('keys/ecdsa-private.pem',k.privateKey);f.writeFileSync('keys/ecdsa-public.pem',k.publicKey);console.log('Keys generated')"
)
echo Starting backend on port 3001...
echo.
echo Make sure PostgreSQL is running and DATABASE_URL is set in .env
echo.
npm start
goto :eof

:frontend
echo Opening frontend in default browser...
cd /d "%~dp0"
start "" "index.html"
goto :eof
