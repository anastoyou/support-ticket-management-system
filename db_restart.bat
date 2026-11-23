@echo off
setlocal

REM ==========================================
REM Remote Production Database Configuration
REM (Referenced from refresh.bat / backend/pull_db.bat)
REM ==========================================
set "SERVER=Administrator@104.237.6.167"
set "DB_SERVICE=postgresql-x64-18"
set "PG_ISREADY=C:\Progra~1\PostgreSQL\18\bin\pg_isready.exe"

echo.
echo ==========================================
echo Connecting to %SERVER% via SSH
echo Restarting %DB_SERVICE% on production...
echo ==========================================
echo.

ssh %SERVER% "(sc query %DB_SERVICE% | findstr /i STOPPED >nul || (echo Stopping %DB_SERVICE%... & sc stop %DB_SERVICE% >nul)) & (for /l %%i in (1,1,30) do @(sc query %DB_SERVICE% | findstr /i STOPPED >nul || ping -n 2 127.0.0.1 >nul)) & (sc query %DB_SERVICE% | findstr /i STOPPED >nul || (echo ERROR: %DB_SERVICE% did not stop cleanly. & exit /b 1)) & echo Starting %DB_SERVICE%... & sc start %DB_SERVICE% >nul & (for /l %%i in (1,1,30) do @(sc query %DB_SERVICE% | findstr /i RUNNING >nul || ping -n 2 127.0.0.1 >nul)) & (sc query %DB_SERVICE% | findstr /i RUNNING >nul || (echo ERROR: %DB_SERVICE% did not reach RUNNING state. & exit /b 1)) & sc query %DB_SERVICE% & %PG_ISREADY% -h 127.0.0.1 -p 5432"

if errorlevel 1 (
    echo.
    echo ==========================================
    echo ERROR: Production DB restart failed.
    echo ==========================================
    if /i not "%~1"=="--no-pause" pause
    exit /b 1
)

echo.
echo ==========================================
echo Production DB restarted and accepting connections!
echo ==========================================
if /i not "%~1"=="--no-pause" pause
exit /b 0
