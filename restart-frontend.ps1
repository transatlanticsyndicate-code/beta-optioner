# Скрипт для перезапуска Frontend с очисткой кэша

Write-Host "🔄 Остановка Frontend..." -ForegroundColor Yellow

# Найти и убить процесс на порту 3000
$process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
if ($process) {
    Stop-Process -Id $process -Force
    Write-Host "✅ Процесс остановлен (PID: $process)" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "⚠️ Процесс на порту 3000 не найден" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🧹 Очистка кэша..." -ForegroundColor Yellow
Set-Location frontend
if (Test-Path "node_modules\.cache") {
    Remove-Item -Recurse -Force "node_modules\.cache"
    Write-Host "✅ Кэш очищен" -ForegroundColor Green
}

Write-Host ""
Write-Host "🚀 Запуск Frontend..." -ForegroundColor Yellow
npm start
