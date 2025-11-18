@echo off
echo ========================================
echo   Setting up Backend Environment
echo ========================================
echo.

cd backend

echo Step 1: Creating virtual environment...
python -m venv venv

echo.
echo Step 2: Installing dependencies...
venv\Scripts\pip.exe install -r requirements.txt

echo.
echo ========================================
echo   Backend setup complete!
echo ========================================
echo.
echo Now you can start the backend with:
echo   restart-local.bat
echo.
pause
