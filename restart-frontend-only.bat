@echo off
echo.
echo ========================================
echo   Перезапуск Frontend (порт 3000)
echo ========================================
echo.

echo [1/3] Остановка Frontend...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Убиваем процесс %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

echo [2/3] Очистка кэша...
if exist frontend\node_modules\.cache (
    rmdir /s /q frontend\node_modules\.cache
    echo Кэш очищен
)

echo [3/3] Запуск Frontend...
echo.
start "Frontend React" cmd /k "cd frontend && set PORT=3000 && npm start"

echo.
echo ========================================
echo   Frontend запускается!
echo   URL: http://localhost:3000
echo ========================================
echo.
pause
