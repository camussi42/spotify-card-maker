@echo off
chcp 65001 >nul
title Spotify Cards HD - Servidor
cd /d "%~dp0"

echo                                .....
echo                               C C  /
echo                              /^<   /
echo               ___ __________/_#__=o
echo              /(- /(\_\________   \
echo              \ ^) \ ^)_      \o     \
echo              /^|\ /^|\       ^|'     ^|
echo                            ^|     _^|
echo                            /o   __\
echo                           / '     ^|
echo                          / /      ^|
echo                         /_/\______^|
echo                        ^(   _(    ^<
echo                         \    \    \
echo                          \    \    ^|
echo                           \____\____\
echo                           ____\_\__\_\
echo                         /`   /`     o\
echo                         ^|___ ^|_______^|.. .
echo.
echo iniciando....
echo.

echo ============================================
echo   Spotify Cards HD
echo ============================================
echo.

REM --- Compila o site (frontend) sempre, para garantir versao atualizada ---
echo [1/2] Compilando o site...
cd /d "%~dp0web"
call npm run build
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao compilar o site. Verifique se o Node.js esta instalado.
    cd /d "%~dp0"
    pause
    exit /b 1
)
cd /d "%~dp0"

REM --- Abre o navegador depois de 3s sem travar esta janela ---
echo [2/2] Iniciando o servidor em http://127.0.0.1:8000
start "" powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:8000'"

echo.
echo  O navegador vai abrir sozinho em http://127.0.0.1:8000
echo  Para encerrar, feche esta janela (ou pressione Ctrl+C).
echo.

REM --- Roda o servidor (mantem a janela aberta mostrando os logs) ---
cd /d "%~dp0server"
python -m uvicorn main:app --host 127.0.0.1 --port 8000

echo.
echo Servidor encerrado.
pause
