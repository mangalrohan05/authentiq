# Quick Start — Commands Reference

Everything you need to run, test, and interact with QR-Authentiq from the command line.

---

## 🚀 Development Startup

### Backend

```bash
cd authentiq-app/backend

# Activate virtual environment
venv\Scripts\activate              # Windows PowerShell
source venv/bin/activate            # macOS / Linux

# Start FastAPI dev server (hot reload)
uvicorn app.main:app --reload --port 8000

# Windows convenience script
.\start_backend.bat

# PowerShell convenience script
.\start_backend.ps1

# Linux/macOS convenience script
bash start_backend.sh
```

### Frontend

```bash
cd authentiq-app/frontend

# Development server (webpack mode)
npm run dev

# Production build
npm run build

# Serve production build
npm start
```

### Celery Worker (for async embedding jobs)

```bash
cd authentiq-app/backend

# Activate venv first, then:
celery -A app.core.celery_app worker --loglevel=info

# With concurrency (recommended for embedding tasks)
celery -A app.core.celery_app worker --loglevel=info --concurrency=2
```

### Redis (if not running as a service)

```bash
# Docker (cross-platform)
docker run -d -p 6379:6379 redis:7

# Windows (WSL)
wsl redis-server

# macOS
redis-server
```

---

## 🌐 Access URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| API Docs (ReDoc) | http://localhost:8000/redoc |
| Health Check | http://localhost:8000/health |
| VLM (Ollama) | http://localhost:11434 |
| VLM (vLLM) | http://localhost:8000 (separate port if vLLM) |

---

## 🔑 Authentication Commands

### Register Admin Account

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"Pass123!","role":"admin","vendor_id":null}'
```

### Login and Get JWT Token

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Pass123!"}'
# Returns: {"access_token":"...", "token_type":"bearer", "role":"admin"}
```

### Use Token in Requests

```bash
TOKEN="your-jwt-token-here"
curl http://localhost:8000/product/ \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📦 Product & QR Management (API)

### Create a Product

```bash
curl -X POST http://localhost:8000/product/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Widget Pro",
    "brand": "MyBrand",
    "sku": "WP-001",
    "vendor_id": "your-vendor-id"
  }'
```

### Upload Reference Image

```bash
curl -X POST http://localhost:8000/product/{product_id}/reference-image \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/front.jpg" \
  -F "view_type=front"
```

View types: `front`, `back`, `label`, `hologram`, `seal`, `barcode`

### Generate QR Codes

```bash
curl -X POST http://localhost:8000/qr/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_id": "your-product-id", "quantity": 10}'
```

### Check QR Status (Public — no auth)

```bash
curl http://localhost:8000/scan/status/{qr_id}
```

---

## 🤖 AI Pipeline Commands

### Trigger Embedding Generation for a Product

```bash
curl -X POST http://localhost:8000/ai/embed/{product_id} \
  -H "Authorization: Bearer $TOKEN"
```

### Check AI Health

```bash
curl http://localhost:8000/health
# {"status":"healthy","ai":{"loaded":true},"yolo":{"loaded":true}}
```

### Verify a Product (Consumer Scan)

```bash
curl -X POST http://localhost:8000/scan/verify \
  -F "qr_id=your-qr-id" \
  -F "image=@/path/to/product_photo.jpg" \
  -F "slot=front"
```

### Regenerate All Embeddings (Admin utility)

```bash
cd authentiq-app/backend
python regenerate_embeddings.py
```

### Database Audit (check embedding coverage)

```bash
cd authentiq-app/backend
python db_audit.py
```

### Restore Mock Data (development)

```bash
cd authentiq-app/backend
python restore_mock_data.py
```

---

## 🧪 Running Tests

### Full Test Suite

```bash
cd authentiq-app/backend
pytest -v
```

### With Coverage Report

```bash
pytest --cov=app --cov-report=html -v
# Open htmlcov/index.html for the report
```

### Specific Test Files

```bash
# Security tests
pytest tests/test_security.py -v

# VLM pipeline tests (no GPU needed)
pytest tests/test_vlm_pipeline_v7.py -v

# RBAC / permissions
pytest tests/test_rbac_integration.py -v

# Team management
pytest tests/test_team_management.py -v

# Integration tests
pytest tests/test_api_integration.py -v
```

### Run Tests in Parallel

```bash
pytest -n auto -v   # Uses pytest-xdist for parallel execution
```

### Frontend Tests

```bash
cd authentiq-app/frontend

# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# End-to-end (Playwright)
npm run test:e2e

# E2E with UI
npm run test:e2e:ui
```

### Windows Test Runner Scripts

```bash
# Root directory
.\run_tests.bat           # Full backend test suite
.\run_quick_tests.bat     # Fast smoke tests
.\run_security_tests.bat  # Security-focused tests
```

### Linux/macOS Test Runner

```bash
bash run_tests.sh
```

---

## 🔒 Security & Code Quality

### Static Security Analysis (Bandit)

```bash
cd authentiq-app/backend
bandit -r app/ -c bandit.yaml
```

### Dependency Vulnerability Scan

```bash
safety check -r requirements.txt
```

### Code Formatting

```bash
black app/
```

### Type Checking

```bash
mypy app/
```

### Linting

```bash
pylint app/
```

### Frontend Linting

```bash
cd authentiq-app/frontend
npm run lint
```

---

## 📊 Performance / Load Testing

```bash
cd authentiq-app/backend

# Start Locust load test web UI
locust -f locustfile.py --host=http://localhost:8000

# Headless mode (1000 users, spawn rate 10/s)
locust -f locustfile.py --host=http://localhost:8000 \
  --users 1000 --spawn-rate 10 --headless
```

---

## 🛠️ Data Utilities

### E2E Image Test

```bash
cd authentiq-app/backend
python e2e_test_images.py
```

### Image Quality Gate Test

```bash
cd authentiq-app/backend
python test_image_quality_gate.py
```

### Patch Embeddings (if updating the embedding strategy)

```bash
cd authentiq-app/backend
python authentiq-app/backend/app/services/patch_embeddings.py
```

---

## 📌 Common PowerShell Shortcuts

```powershell
# Start everything in separate windows
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd authentiq-app/backend; venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd authentiq-app/frontend; npm run dev"
```

---

## 🔧 Debugging

### Enable YOLO Debug Output

```env
AUTHENTIQ_YOLO_DEBUG=true
```

### Enable VLM Mock (dev only — never in production)

```env
AUTHENTIQ_VLM_DEV_MOCK=true
```

> ⚠️ Mock mode returns fake "authentic" verdicts. Never use in production.

### View Verification Logs

The backend writes detailed verification logs to the system temp directory:
```
# Windows
%TEMP%\authentiq_verification.log

# macOS/Linux
/tmp/authentiq_verification.log
```
