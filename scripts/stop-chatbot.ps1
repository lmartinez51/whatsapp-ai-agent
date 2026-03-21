Write-Host ""
Write-Host "Stopping chatbot environment..." -ForegroundColor Yellow

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process chroma -ErrorAction SilentlyContinue | Stop-Process -Force

# MAGIA PURA: Borramos el caché al salir
$cachePath = "..\data\story_cache.json"
if (Test-Path $cachePath) {
    Remove-Item $cachePath -Force
    Write-Host "Cache visual destruido. Listo para un inicio limpio." -ForegroundColor Cyan
}

Write-Host "All chatbot services stopped." -ForegroundColor Green
Write-Host ""