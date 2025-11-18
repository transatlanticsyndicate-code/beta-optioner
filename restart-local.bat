@echo off
echo ========================================
echo   Restarting Local Development Servers
echo ========================================
echo.

REM Stop processes on port 8000 (Backend)
echo Stopping Backend (port 8000)...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8000" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul

REM Stop processes on port 3000 (Frontend)
echo Stopping Frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul

echo.
echo Waiting for ports to be released...
timeout /t 2 /nobreak > nul

REM Start Backend
echo Starting Backend on http://localhost:8000...
start "Backend Server" cmd /k "cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

REM Wait for backend
timeout /t 3 /nobreak > nul

REM Start Frontend
echo Starting Frontend on http://localhost:3000...
start "Frontend Server" cmd /k "cd frontend && set PORT=3000 && npm start"

echo.
echo ========================================
echo   Servers are restarting!
echo ========================================
echo.
echo Backend API: http://localhost:8000
echo Frontend App: http://localhost:3000
echo API Docs: http://localhost:8000/docs
echo.
echo Check the server windows for status
echo.
pause
