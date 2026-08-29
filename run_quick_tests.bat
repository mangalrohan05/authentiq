@echo off
REM Quick Test Runner - Runs only unit tests for fast feedback

echo ========================================
echo Quick Test Suite (Unit Tests Only)
echo ========================================
echo.

REM Frontend Unit Tests
echo [1/2] Running Frontend Unit Tests...
cd authentiq-app\frontend
call npm test -- --watchAll=false
if %errorlevel% neq 0 (
    echo Frontend unit tests failed!
    cd ..\..
    pause
    exit /b 1
)
echo Frontend unit tests passed!
cd ..\..
echo.

REM Backend Unit Tests
echo [2/2] Running Backend Unit Tests...
cd authentiq-app\backend
pytest tests/ -m unit -v --tb=short
if %errorlevel% neq 0 (
    echo Backend unit tests failed!
    cd ..\..
    pause
    exit /b 1
)
echo Backend unit tests passed!
cd ..\..
echo.

echo ========================================
echo Quick Tests Passed Successfully!
echo ========================================
echo.
pause
