param (
    [string]$Agent = ""
)

Write-Host ""
Write-Host "==== WhatsApp AI Chatbot Launcher ====" -ForegroundColor Cyan

if ($Agent) {
    Write-Host "Iniciando con agente: $Agent" -ForegroundColor Magenta
} else {
    Write-Host "No se especificó agente. Se usará el default del .env" -ForegroundColor DarkGray
}

# Detect project root automatically
$projectRoot = Split-Path $PSScriptRoot -Parent

$botEntry = "$projectRoot\src\app.js"
$logDir = "$projectRoot\logs"

$chromaLog = "$logDir\chroma.log"
$botLog = "$logDir\bot.log"

if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

# --------------------------------
# Check if ChromaDB is running
# --------------------------------
$chromaRunning = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($chromaRunning) {
    Write-Host "ChromaDB already running." -ForegroundColor Green
} else {
    Write-Host "Starting ChromaDB..." -ForegroundColor Yellow
    Start-Process powershell `
        -ArgumentList "chroma run --host localhost --port 8000 *> `"$chromaLog`"" `
        -WindowStyle Hidden

    Start-Sleep -Seconds 3
}

# --------------------------------
# Check if Node bot is running
# --------------------------------
$nodeRunning = Get-Process node -ErrorAction SilentlyContinue

if ($nodeRunning) {
    Write-Host "Node chatbot already running." -ForegroundColor Green
    if ($Agent) {
        Write-Host "ADVERTENCIA: El bot ya está corriendo. Cierra la ventana actual de Node si quieres cambiar de agente." -ForegroundColor Yellow
    }
} else {
    Write-Host "Starting chatbot..." -ForegroundColor Yellow

    # Construimos el comando inyectando la variable si se proporcionó un argumento
    $nodeCommand = "cd `"$projectRoot`"; "
    if ($Agent) {
        $nodeCommand += "`$env:ACTIVE_AGENT='$Agent'; "
    }
    $nodeCommand += "node src/app.js"

    Start-Process powershell `
        -ArgumentList "-NoExit", "-Command", $nodeCommand `
        -WindowStyle Normal
}

Write-Host ""
Write-Host "Chatbot environment running." -ForegroundColor Green
Write-Host "Logs located at:"
Write-Host "$logDir"
Write-Host ""