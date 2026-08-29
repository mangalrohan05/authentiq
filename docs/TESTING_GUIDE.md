# Testing Guide

QR-Authentiq has a comprehensive test suite covering unit tests, integration tests, security tests, performance tests, and end-to-end browser tests.

---

## Test Infrastructure

### Backend Testing Stack

| Tool | Purpose |
|---|---|
| `pytest` | Test runner and framework |
| `pytest-asyncio` | Async test support |
| `pytest-cov` | Code coverage reporting |
| `pytest-mock` | Mocking and patching |
| `pytest-xdist` | Parallel test execution |
| `httpx` | Async HTTP client for API testing |
| `mongomock` | In-memory MongoDB mock (no real DB needed) |
| `bandit` | Static security analysis |
| `safety` | Dependency vulnerability scanning |
| `locust` | Load and performance testing |

### Frontend Testing Stack

| Tool | Purpose |
|---|---|
| `jest` | Unit test runner |
| `jest-environment-jsdom` | Browser environment simulation |
| `@testing-library/react` | Component testing |
| `@testing-library/user-event` | User interaction simulation |
| `@playwright/test` | End-to-end browser testing |

---

## Backend Tests — File Reference

All test files are in `authentiq-app/backend/tests/`:

| File | Coverage Area |
|---|---|
| `test_api_integration.py` | Full API endpoint integration tests |
| `test_auth_plan_edge_cases.py` | Auth flows and plan limit enforcement |
| `test_database_integration.py` | MongoDB operations and data integrity |
| `test_embedding_compat.py` | Embedding version compatibility |
| `test_hierarchical_scoping.py` | Multi-vendor data isolation |
| `test_image_paths.py` | Image path resolution utilities |
| `test_int3.py` | Misc integration tests |
| `test_pagination_projection.py` | List API pagination and field projection |
| `test_password_policy.py` | Password strength validation |
| `test_performance.py` | API response time benchmarks |
| `test_product_management.py` | Product CRUD lifecycle |
| `test_rbac_integration.py` | Role-Based Access Control |
| `test_region_scoring.py` | AI region scoring logic |
| `test_security.py` | Security controls (auth, CORS, rate limits) |
| `test_security_edge_cases.py` | Edge cases in security enforcement |
| `test_security_utils.py` | Password hash and JWT utilities |
| `test_team_management.py` | Team invite, role assignment, access revocation |
| `test_verification_matching.py` | AI verification pipeline unit tests |
| `test_vlm_pipeline_v7.py` | VLM decision layer + veto logic (no GPU needed) |
| `test_white_box.py` | Internal service logic white-box tests |
| `conftest.py` | Shared fixtures (mock DB, test client) |

---

## Running Tests

### Quick Commands

```bash
cd authentiq-app/backend

# Activate virtual environment
venv\Scripts\activate          # Windows
source venv/bin/activate        # macOS/Linux

# Run all tests
pytest -v

# Run with coverage report
pytest --cov=app --cov-report=html -v
# View: htmlcov/index.html

# Run in parallel (faster)
pytest -n auto -v

# Run specific file
pytest tests/test_security.py -v

# Run specific test function
pytest tests/test_security.py::test_login_rate_limit -v

# Run tests matching a keyword
pytest -k "auth" -v

# Run and stop at first failure
pytest -x -v
```

### Windows Batch Scripts

```bash
# Run from project root
.\run_tests.bat           # Full test suite
.\run_quick_tests.bat     # Smoke tests only
.\run_security_tests.bat  # Security-focused tests
```

### Linux/macOS Script

```bash
bash run_tests.sh
```

---

## Test Categories

### 1. Unit Tests

Test individual service functions in isolation using mocked dependencies.

**Key areas:**
- Password hashing and verification (`test_security_utils.py`)
- JWT token creation and validation
- Image path resolution
- Embedding version compatibility checks
- Password policy validation
- AI region scoring logic

**Example:**

```bash
pytest tests/test_security_utils.py tests/test_password_policy.py -v
```

### 2. Integration Tests

Test API endpoints with a mock MongoDB database (no real DB needed — `mongomock` is used automatically via `conftest.py`).

**Key areas:**
- Auth register / login / logout flow
- Product CRUD (create, read, update, delete)
- QR code generation and status check
- Scan submission and verdict
- Team invitation workflow
- Plan limit enforcement

**Example:**

```bash
pytest tests/test_api_integration.py tests/test_product_management.py -v
```

### 3. Security Tests

Verify that security controls work correctly.

**Key areas:**
- Login rate limiting (5 req/min enforcement)
- JWT token expiry and tampering detection
- Role-based access control (403 for unauthorized roles)
- Data isolation between vendors
- Password strength enforcement
- SQL/NoSQL injection resistance

**Example:**

```bash
pytest tests/test_security.py tests/test_security_edge_cases.py tests/test_rbac_integration.py -v
```

### 4. AI Pipeline Tests

VLM decision layer and veto logic tests — **no GPU or network required**.

```bash
pytest tests/test_vlm_pipeline_v7.py tests/test_verification_matching.py -v
```

What is tested:
- Critical defect veto (score capped at 0.30)
- Major/minor penalty accumulation
- Identity mismatch detection
- Gross-mismatch pre-filter logic
- Pipeline fallback when VLM unavailable
- Score threshold mapping to verdicts

### 5. Performance Tests

```bash
pytest tests/test_performance.py -v
```

Tests response time benchmarks for key endpoints. Non-AI endpoints should respond in under 200ms; AI endpoints have higher bounds due to model inference.

### 6. RBAC / Team Management Tests

```bash
pytest tests/test_rbac_integration.py tests/test_team_management.py tests/test_hierarchical_scoping.py -v
```

Tests:
- Role permission enforcement for Administrator / Manager / Viewer
- Team invite flow (send → accept → assign role)
- Access revocation
- Multi-vendor data isolation (vendor A cannot see vendor B's data)
- Hierarchical scoping (team member can only access their own vendor's workspace)

---

## Load Testing with Locust

```bash
cd authentiq-app/backend

# Web UI (open http://localhost:8089 in browser)
locust -f locustfile.py --host=http://localhost:8000

# Headless mode
locust -f locustfile.py \
  --host=http://localhost:8000 \
  --users 50 \
  --spawn-rate 5 \
  --run-time 60s \
  --headless
```

Locust tests simulate:
- Login bursts
- Product list reads
- QR status checks (public endpoint)
- Concurrent scan submissions

---

## Security Scanning

### Static Analysis (Bandit)

```bash
cd authentiq-app/backend
bandit -r app/ -c bandit.yaml

# Save report
bandit -r app/ -c bandit.yaml -f json -o bandit_report.json
```

Severity targets:
- `HIGH` — must fix before production
- `MEDIUM` — review and justify or fix
- `LOW` — informational

### Dependency Vulnerabilities (Safety)

```bash
safety check -r requirements.txt

# HTML report
safety check -r requirements.txt --output json > safety_report.json
```

---

## Frontend Tests

### Unit Tests (Jest)

```bash
cd authentiq-app/frontend

npm test                    # Run all unit tests once
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
```

Test files are in `src/components/__tests__/` and co-located `__tests__` folders.

### End-to-End Tests (Playwright)

```bash
cd authentiq-app/frontend

# Install browser binaries (first time only)
npx playwright install

# Run all E2E tests
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui

# Run specific test file
npx playwright test e2e/verify-flow.spec.ts

# Debug mode (headed browser)
npx playwright test --debug
```

E2E tests are in `authentiq-app/frontend/e2e/`.

---

## Coverage Targets

| Area | Target |
|---|---|
| Core security (auth, JWT) | 90%+ |
| AI pipeline decision layer | 85%+ |
| API routes | 80%+ |
| Services | 75%+ |
| Frontend components | 70%+ |

To view current coverage:

```bash
cd authentiq-app/backend
pytest --cov=app --cov-report=term-missing
```

---

## Test Configuration Files

| File | Purpose |
|---|---|
| `authentiq-app/backend/pytest.ini` | Pytest markers, asyncio mode |
| `authentiq-app/backend/.coveragerc` | Coverage source includes/excludes |
| `authentiq-app/backend/bandit.yaml` | Bandit skip rules and thresholds |
| `authentiq-app/frontend/jest.config.js` | Jest configuration |
| `authentiq-app/frontend/jest.setup.js` | Testing Library setup |
| `authentiq-app/frontend/playwright.config.ts` | Playwright browser config |

---

## CI/CD Testing

Recommended CI pipeline steps:

```yaml
# Example GitHub Actions step sequence
steps:
  - name: Install backend deps
    run: pip install -r requirements.txt

  - name: Security scan
    run: bandit -r app/ -c bandit.yaml

  - name: Run tests with coverage
    run: pytest --cov=app --cov-fail-under=75 -v

  - name: Install frontend deps
    run: npm ci
    working-directory: authentiq-app/frontend

  - name: Frontend lint
    run: npm run lint
    working-directory: authentiq-app/frontend

  - name: Frontend unit tests
    run: npm test -- --coverage
    working-directory: authentiq-app/frontend
```

---

## Image-Based Testing Utilities

### E2E Image Test

Tests the full scan-and-verify flow using sample images:

```bash
cd authentiq-app/backend
python e2e_test_images.py
```

### Image Quality Gate Test

Tests that the quality validation service correctly rejects/accepts images:

```bash
cd authentiq-app/backend
python test_image_quality_gate.py
```

Test images are in `authentiq-app/test images/`.

---

## Common Test Failures & Fixes

### `ImportError: No module named 'app'`
```bash
# Ensure PYTHONPATH is set
PYTHONPATH=. pytest -v
```

### MongoDB connection in tests
Tests use `mongomock` automatically — no real MongoDB needed. If tests still try to connect, check `conftest.py` and ensure the mock is activated before any DB import.

### JWT test failures
Ensure `SECRET_KEY` environment variable is set in the test environment (or rely on the default test key in `conftest.py`).

### Async test errors
Add `@pytest.mark.asyncio` to async test functions, or set `asyncio_mode = auto` in `pytest.ini`.
