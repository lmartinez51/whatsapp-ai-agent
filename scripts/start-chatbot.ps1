param (
    [string]$Agent = ""
)

Write-Host ""
Write-Host "==== WhatsApp AI Chatbot Launcher ====" -ForegroundColor Cyan

if ($Agent) {
    Write-Host "Starting with agent: $Agent" -ForegroundColor Magenta
} else {
    Write-Host "No agent specified. Using default from .env" -ForegroundColor DarkGray
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
    
    $chromaExe = "$env:APPDATA\Python\Python312\Scripts\chroma.exe"
    
    # Define separate log files to comply with PowerShell strict streaming rules
    $chromaLogOut = "$logDir\chroma_out.log"
    $chromaLogErr = "$logDir\chroma_err.log"
    
    # Launch Chroma natively with separated standard and error streams
    Start-Process -FilePath $chromaExe `
        -ArgumentList "run --host localhost --port 8000" `
        -WindowStyle Hidden `
        -RedirectStandardOutput "$chromaLogOut" `
        -RedirectStandardError "$chromaLogErr"

    # Provide a generous 10-second buffer for the Uvicorn server to initialize properly
    Start-Sleep -Seconds 10
}

# --------------------------------
# Check if Node bot is running
# --------------------------------
$nodeRunning = Get-Process node -ErrorAction SilentlyContinue

if ($nodeRunning) {
    Write-Host "Node chatbot already running." -ForegroundColor Green
    if ($Agent) {
        Write-Host "WARNING: The bot is already running. Close the current Node window to change the agent." -ForegroundColor Yellow
    }
} else {
    Write-Host "Starting chatbot..." -ForegroundColor Yellow

    # Build the startup command injecting the active agent environment variable
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