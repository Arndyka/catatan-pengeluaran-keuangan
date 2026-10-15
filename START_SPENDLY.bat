@echo off
cd /d "%~dp0"
echo Spendly: http://127.0.0.1:4173
echo Demo: http://127.0.0.1:4173/?demo=1
node tools\serve.mjs
pause
