Set-Location $PSScriptRoot
if (Test-Path ".\venv\Scripts\Activate.ps1") {
    & ".\venv\Scripts\Activate.ps1"
} else {
    Write-Warning "Virtual environment (venv) not found at .\venv\Scripts\Activate.ps1"
}
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
