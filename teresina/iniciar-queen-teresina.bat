@echo off
setlocal EnableExtensions
title Queen Real - Teresina

echo ============================================================
echo  QUEEN REAL - TERESINA
echo  Usa o modelo queen_v1_base treinado hoje
echo ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo Python nao foi encontrado neste PC.
  echo Instale Python 3.11 ou 3.12 e marque "Add Python to PATH".
  pause
  exit /b 1
)

set "MODEL="

for %%P in (
  "C:\Queen\queen_v1_base"
  "%USERPROFILE%\Downloads\queen_v1_base"
  "%USERPROFILE%\Desktop\queen_v1_base"
  "G:\Meu Drive\Queen\queen_v1_base"
  "G:\My Drive\Queen\queen_v1_base"
  "H:\Meu Drive\Queen\queen_v1_base"
  "H:\My Drive\Queen\queen_v1_base"
) do (
  if exist "%%~P\config.json" set "MODEL=%%~P"
)

if not defined MODEL (
  echo Nao encontrei queen_v1_base automaticamente.
  echo Baixe/sincronize a pasta Queen\queen_v1_base do seu Google Drive.
  echo.
  set /p "MODEL=Cole aqui o caminho completo da pasta queen_v1_base: "
)

if not exist "%MODEL%\config.json" (
  echo.
  echo ERRO: config.json nao encontrado em:
  echo %MODEL%
  pause
  exit /b 1
)

set "ROOT=%LOCALAPPDATA%\QueenTeresina"
if not exist "%ROOT%" mkdir "%ROOT%"

echo.
echo Preparando ambiente local...
python -m venv "%ROOT%\.venv"
call "%ROOT%\.venv\Scripts\activate.bat"

python -m pip install --upgrade pip
python -m pip install "torch>=2.5" "transformers==5.20.2" "accelerate==1.15.0" "safetensors>=0.6" "fastapi>=0.115" "uvicorn>=0.32"

copy /Y "%~dp0queen-local-server.py" "%ROOT%\queen-local-server.py" >nul

echo.
echo Iniciando Queen real...
start "Queen Backend" "%ROOT%\.venv\Scripts\python.exe" "%ROOT%\queen-local-server.py" --model "%MODEL%" --port 8765

echo Aguardando o servidor local...
timeout /t 4 /nobreak >nul

echo Abrindo Teresina com o Queen real...
start "" "http://127.0.0.1:8765"

echo.
echo Se a primeira pagina ainda estiver carregando, aguarde alguns segundos e atualize.
echo O Queen carrega os pesos somente quando voce fizer a primeira pergunta.
pause
