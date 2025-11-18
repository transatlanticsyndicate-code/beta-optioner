---
description: Перезапускает backend и frontend серверы (Windows версия)
---

# Перезапуск серверов (Windows)

Этот workflow останавливает и заново запускает оба сервера на Windows.

## Использование:

Просто запустите bat-файл:

```bash
restart-local.bat
```

Или используйте отдельные команды ниже.

## Шаги:

### 1. Остановить Backend (порт 8000)
```powershell
$process = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($process) { Stop-Process -Id $process -Force }
```

### 2. Остановить Frontend (порт 3000)
```powershell
$process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($process) { Stop-Process -Id $process -Force }
```

### 3. Запустить Backend
```powershell
Start-Process cmd -ArgumentList "/k cd backend && venv\Scripts\activate && python -m uvicorn app.main:app --reload --port 8000" -WindowStyle Normal
```

### 4. Подождать 3 секунды
```powershell
Start-Sleep -Seconds 3
```

### 5. Запустить Frontend
```powershell
Start-Process cmd -ArgumentList "/k cd frontend && set PORT=3000 && npm start" -WindowStyle Normal
```

### 6. Готово!
```powershell
Write-Host "Servers are starting!" -ForegroundColor Green
Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
```

---

## Альтернатива: Используйте bat-файл

Просто запустите:
```
restart-local.bat
```

Это делает то же самое, но проще!
