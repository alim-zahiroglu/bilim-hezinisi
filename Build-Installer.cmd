@echo off
cd /d "%~dp0"
echo ============================================
echo   Bilim Hezinisi - Building installer .exe
echo   (this takes a few minutes, please wait)
echo ============================================
call npm run dist
echo.
echo DONE. Open the "dist" folder and run the Setup .exe to install.
pause
