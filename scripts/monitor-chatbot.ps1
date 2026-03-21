Write-Host "==== Chatbot Monitor Started ====" -ForegroundColor Cyan

$projectRoot = Split-Path $PSScriptRoot -Parent
$botEntry = "$projectRoot\src\app.js"
$logFile = "$projectRoot\logs\bot.log"

while ($true) {

    $nodeRunning = Get-Process node -ErrorAction SilentlyContinue

    if (!$nodeRunning) {

        Write-Host "Chatbot stopped. Restarting..." -ForegroundColor Yellow

        Start-Process powershell `
            -ArgumentList "node `"$botEntry`" *> `"$logFile`"" `
            -WindowStyle Hidden
    }

    Start-Sleep -Seconds 10
}