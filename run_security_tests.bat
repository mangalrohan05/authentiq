@echo off
REM Security Test Runner - Runs security tests and bandit scanning

echo ========================================
echo Security Test Suite
echo ========================================
echo.

REM Backend Security Tests
echo [1/2] Running Security Tests...
cd authentiq-app\backend
pytest tests/ -m security -v
if %errorlevel% neq 0 (
    echo Security tests failed!
    cd ..\..
    pause
    exit /b 1
)
echo Security tests passed!
cd ..\..
echo.

REM Bandit Security Scan
echo [2/2] Running Bandit Security Scan...
cd authentiq-app\backend
bandit -r app/ -f json -o bandit-report.json
if %errorlevel% neq 0 (
    echo Bandit found security issues!
    echo Check bandit-report.json for details
    cd ..\..
    pause
    exit /b 1
)
echo Bandit scan completed!
cd ..\..
echo.

echo ========================================
echo Security Tests Passed Successfully!
echo ========================================
echo.
echo Bandit report available at: authentiq-app\backend\bandit-report.json
echo.
pause
