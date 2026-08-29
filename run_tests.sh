#!/bin/bash

# Comprehensive Test Runner for QR Authentication App
# This script runs all test types in sequence

set -e  # Exit on error

echo "========================================"
echo "QR Authentication App - Test Suite"
echo "========================================"
echo ""

# Check if we're in the correct directory
if [ ! -d "authentiq-app" ]; then
    echo "Error: Please run this script from the project root directory"
    exit 1
fi

# Frontend Tests
echo "[1/6] Running Frontend Unit Tests..."
cd authentiq-app/frontend
npm test
echo "Frontend unit tests passed!"
cd ../..
echo ""

# Backend Unit Tests
echo "[2/6] Running Backend Unit Tests..."
cd authentiq-app/backend
pytest tests/ -m unit -v
echo "Backend unit tests passed!"
cd ../..
echo ""

# Integration Tests
echo "[3/6] Running Integration Tests..."
cd authentiq-app/backend
pytest tests/ -m integration -v
echo "Integration tests passed!"
cd ../..
echo ""

# Security Tests
echo "[4/6] Running Security Tests..."
cd authentiq-app/backend
pytest tests/ -m security -v
echo "Security tests passed!"
cd ../..
echo ""

# Performance Tests
echo "[5/6] Running Performance Tests..."
cd authentiq-app/backend
pytest tests/ -m performance -v
echo "Performance tests passed!"
cd ../..
echo ""

# White Box Tests
echo "[6/6] Running White Box Tests..."
cd authentiq-app/backend
pytest tests/ -m whitebox -v
echo "White box tests passed!"
cd ../..
echo ""

# Generate Coverage Report
echo "Generating Coverage Report..."
cd authentiq-app/backend
pytest tests/ --cov=app --cov-report=html --cov-report=term
cd ../..
echo ""

echo "========================================"
echo "All Tests Passed Successfully!"
echo "========================================"
echo ""
echo "Coverage report available at: authentiq-app/backend/htmlcov/index.html"
echo ""
