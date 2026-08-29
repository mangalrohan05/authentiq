@echo off
REM Comprehensive Test Runner for QR Authentication App
REM This script runs all test types in sequence

echo ========================================
echo QR Authentication App - Test Suite
echo ========================================
echo.

REM Check if we're in the correct directory
if not exist "authentiq-app" (
    echo Error: Please run this script from the project root directory
    pause
    exit /b 1
)

REM Frontend Tests
echo [1/6] Running Frontend Unit Tests...
cd authentiq-app\frontend
call npm test
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
echo [2/6] Running Backend Unit Tests...
cd authentiq-app\backend
pytest tests/ -m unit -v
if %errorlevel% neq 0 (
    echo Backend unit tests failed!
    cd ..\..
    pause
    exit /b 1
)
echo Backend unit tests passed!
cd ..\..
echo.

REM Integration Tests
echo [3/6] Running Integration Tests...
cd authentiq-app\backend
pytest tests/ -m integration -v
if %errorlevel% neq 0 (
    echo Integration tests failed!
    cd ..\..
    pause
    exit /b 1
)
echo Integration tests passed!
cd ..\..
echo.

REM Security Tests
echo [4/6] Running Security Tests...
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

REM Performance Tests
echo [5/6] Running Performance Tests...
cd authentiq-app\backend
pytest tests/ -m performance -v
if %errorlevel% neq 0 (
    echo Performance tests failed!
    cd ..\..
    pause
    exit /b 1
)
echo Performance tests passed!
cd ..\..
echo.

REM White Box Tests
echo [6/6] Running White Box Tests...
cd authentiq-app\backend
pytest tests/ -m whitebox -v
if %errorlevel% neq 0 (
    echo White box tests failed!
    cd ..\..
    pause
    exit /b 1
)
echo White box tests passed!
cd ..\..
echo.

REM Generate Coverage Report
echo Generating Coverage Report...
cd authentiq-app\backend
pytest tests/ --cov=app --cov-report=html --cov-report=term
cd ..\..
echo.

echo ========================================
echo All Tests Passed Successfully!
echo ========================================
echo.
echo Coverage report available at: authentiq-app\backend\htmlcov\index.html
echo.
pause
