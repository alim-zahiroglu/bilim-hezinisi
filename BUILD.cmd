@echo off
echo.
echo ============================================
echo   Bilim Hezinisi v2.5.0 - Build Script
echo ============================================
echo.
echo [1/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)
echo      Done.
echo.
echo [2/4] Setting up pdf.js...
call node setup-pdfjs.js
echo      Done.
echo.
echo [3/4] Creating source code ZIP...
call node make-source-zip.js
echo      Done.
echo.
echo [4/4] Building Windows installer and portable .exe ...
call npx electron-builder --win --x64
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)
echo.
echo ============================================
echo   BUILD COMPLETE!
echo.
echo   Installer:  dist\Bilim Hezinisi Setup 2.5.0.exe
echo   Portable:   dist\BilimHezinisi-Portable-2.5.0.exe
echo   Source ZIP:  BilimHezinisi-Source-2.5.0.zip
echo ============================================
echo.
pause
