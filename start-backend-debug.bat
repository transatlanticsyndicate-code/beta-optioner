@echo off
echo Starting Backend in debug mode...
cd backend

echo Checking virtual environment...
if not exist "venv\Scripts\python.exe" (
    echo ERROR: Virtual environment not found!
    echo Creating virtual environment...
    python -m venv venv
    echo Installing dependencies...
    venv\Scripts\pip.exe install -r requirements.txt
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Starting uvicorn...
python -m uvicorn app.main:app --reload --port 8000

pause
