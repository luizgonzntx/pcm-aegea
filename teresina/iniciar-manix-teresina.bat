@echo off
setlocal EnableExtensions
title MANIX - Inteligencia de Manutencao

echo ============================================================
echo  MANIX - MODELO TREINADO LOCAL
echo  Teresina PCM
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
  "C:\Manix\queen_v1_base"
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
  echo Nao encontrei o modelo automaticamente.
  echo Aponte para a pasta queen_v1_base sincronizada do Google Drive.
  echo.
  set /p "MODEL=Caminho completo da pasta do modelo: "
)

if not exist "%MODEL%\config.json" (
  echo.
  echo ERRO: config.json nao encontrado em:
  echo %MODEL%
  pause
  exit /b 1
)

set "ROOT=%LOCALAPPDATA%\ManixTeresina"
if not exist "%ROOT%" mkdir "%ROOT%"

if not exist "%ROOT%\.venv\Scripts\python.exe" (
  echo Criando ambiente Python da Manix...
  python -m venv "%ROOT%\.venv"
)

call "%ROOT%\.venv\Scripts\activate.bat"

python -c "import torch,transformers,fastapi,uvicorn,accelerate,safetensors" >nul 2>nul
if errorlevel 1 (
  echo Instalando dependencias da primeira execucao...
  python -m pip install --upgrade pip
  python -m pip install "torch>=2.5" "transformers>=4.46,<6" "accelerate>=1.0" "safetensors>=0.4" "fastapi>=0.115" "uvicorn>=0.32"
)

copy /Y "%~dp0queen-local-server.py" "%ROOT%\manix-local-server.py" >nul

echo.
echo Iniciando Manix treinada em http://127.0.0.1:8765 ...
start "MANIX Backend" "%ROOT%\.venv\Scripts\python.exe" "%ROOT%\manix-local-server.py" --model "%MODEL%" --port 8765

timeout /t 3 /nobreak >nul
start "" "https://luizgonzntx.github.io/pcm-aegea/teresina/"

echo.
echo A Manix detecta o servidor automaticamente pelo navegador.
echo Mantenha esta janela/servidor aberto enquanto usar o modelo treinado.
pause
