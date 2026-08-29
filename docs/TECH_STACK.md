# Technology Stack

## At a Glance

| Layer | Technology | Version |
|---|---|---|
| **Frontend** | Next.js | 16.2.7 |
| **UI Library** | React | 19.2.4 |
| **Language (Frontend)** | TypeScript | ^5 |
| **Styling** | Tailwind CSS | v4 |
| **Animation** | Framer Motion | ^12 |
| **QR Rendering** | qrcode.react | ^4.2 |
| **Backend** | FastAPI | latest |
| **Backend Language** | Python | 3.10+ |
| **Database** | MongoDB | 6+ |
| **Cache / Queue Broker** | Redis | 7+ |
| **Task Queue** | Celery | latest |
| **AI — Embeddings** | OpenCLIP (ViT-B-32) | ≥2.20.0 |
| **AI — Object Detection** | YOLOv8 (Ultralytics) | ≥8.0 |
| **AI — VLM Judge** | Qwen2.5-VL-7B | (self-hosted) |
| **ML Framework** | PyTorch | ≥2.0 |
| **OCR** | EasyOCR / Tesseract / PaddleOCR | optional |
| **Auth** | JWT (python-jose) + bcrypt | - |
| **Rate Limiting** | SlowAPI | latest |
| **WebSocket** | FastAPI WebSocket | native |
| **Testing (backend)** | pytest + httpx + playwright | ≥7.4 |
| **Testing (frontend)** | Jest + Testing Library + Playwright | ≥29 |
| **Marketing Site** | PHP + Tailwind CSS | - |

---

## Backend — Python / FastAPI

### Framework & Server

```
FastAPI          — ASGI web framework; auto-generates OpenAPI docs at /docs
Uvicorn          — ASGI server (hot-reload in development)
python-multipart — Multipart form data (file uploads)
```

### Database

```
PyMongo          — MongoDB driver
mongomock        — In-memory MongoDB mock (used when real DB unavailable)
```

The backend gracefully falls back to `mongomock` if MongoDB is unreachable at startup, allowing development without a local database. All 15 collections are declared in `app/core/db.py`.

### Authentication & Security

```
python-jose[cryptography]   — JWT token creation & validation (HS256)
passlib + bcrypt==3.2.2     — Password hashing (SHA-256 pre-hash → bcrypt)
slowapi                     — Rate limiting (5 req/min on login endpoint)
```

**Security details:**
- Passwords are SHA-256 pre-hashed before bcrypt to avoid the 72-byte truncation vulnerability
- JWT tokens expire in 60 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Rate limiting on `/auth/login` prevents brute force
- CORS is configured as the outermost middleware layer so all error responses (including 429) receive proper CORS headers

### AI & Computer Vision

```
torch>=2.0.0               — PyTorch deep learning framework
torchvision>=0.15.0        — Image transforms and model utilities
open-clip-torch>=2.20.0    — OpenCLIP (ViT-B-32, LAION-2B weights)
ultralytics>=8.0.0         — YOLOv8 object detection
pillow>=10.0.0             — Image processing
numpy>=1.24.0              — Numerical operations
scikit-learn>=1.3.0        — Cosine similarity, clustering utilities
imagehash>=4.3.1           — Perceptual hashing (phash near-duplicate detection)
scipy>=1.11.0              — RANSAC homography, Platt calibration scaffold
opencv-python-headless>=4.8.0  — ORB features, SSIM, ROI pixel metrics
scikit-image>=0.21.0       — Structural similarity (SSIM)
```

### Data Processing & Utilities

```
pandas + openpyxl          — CSV/Excel import/export for bulk product data
qrcode[pil]>=8.0.0         — QR code generation
httpx>=0.25.0              — Async HTTP client (VLM API calls)
```

### Async Task Queue

```
celery                     — Distributed task queue
redis                      — Celery broker + result backend
nest_asyncio               — Allows asyncio event loops in Celery worker threads
```

### Development & Quality

```
pytest>=7.4.0              — Test runner
pytest-asyncio             — Async test support
pytest-cov                 — Coverage reporting
pytest-mock                — Mocking utilities
pytest-xdist               — Parallel test execution
bandit>=1.7.5              — Static security analysis
safety>=2.3.5              — Dependency vulnerability scanner
locust>=2.17.0             — Load / performance testing
pylint, black, mypy        — Linting, formatting, type checking
```

---

## Frontend — Next.js / React / TypeScript

### Framework

```
next@16.2.7      — App Router, SSR/SSG, file-based routing
react@19.2.4     — Latest React with concurrent features
react-dom@19.2.4 — DOM rendering
TypeScript ^5    — Static typing throughout
```

### Styling

```
tailwindcss@v4   — Utility-first CSS (configured via postcss)
globals.css      — Custom CSS variables and base styles
framer-motion    — Animation library for UI transitions
```

### Key Frontend Libraries

```
qrcode.react@^4.2  — QR code rendering in the vendor portal (batch generation)
```

### Testing (Frontend)

```
jest@^29                     — Unit test runner
jest-environment-jsdom       — Browser environment simulation
@testing-library/react       — Component testing utilities
@testing-library/user-event  — User interaction simulation
@playwright/test@^1.40       — End-to-end browser testing
```

### Routing Structure (Next.js App Router)

```
src/app/
├── page.tsx                  — Root redirect
├── layout.tsx                — Root layout with global metadata
├── admin/
│   ├── page.tsx              — Admin super portal (240KB+ monolithic dashboard)
│   └── login/                — Admin login page
├── vendor/
│   ├── page.tsx              — Vendor dashboard (53KB+)
│   ├── layout.tsx            — Vendor layout with sidebar
│   ├── login/                — Vendor login & registration
│   ├── initial-setup/        — Post-registration onboarding wizard
│   ├── profile/              — Vendor profile management
│   ├── brands/               — Brand management
│   ├── company/              — Company QR code
│   ├── settings/             — Account settings
│   ├── plan/                 — Subscription & billing
│   ├── accept-invitation/    — Team invite acceptance flow
│   └── reset-password/       — Password reset
└── verify/[qrId]/
    └── page.tsx              — PUBLIC consumer verification page
```

---

## Database — MongoDB

### Collections

| Collection | Purpose |
|---|---|
| `users` | All user accounts (admin, vendor roles, team members) |
| `vendors` | Vendor workspace records |
| `products` | Product catalog with reference images and embeddings |
| `qr_codes` | Individual QR code records linked to products |
| `scans` | Every scan event with location, verdict, and AI scores |
| `brands` | Brand identities under a vendor workspace |
| `plans` | Subscription plan definitions |
| `plan_features` | Feature flags per plan |
| `vendor_feature_overrides` | Per-vendor feature overrides by admin |
| `invitations` | Pending team invitation tokens |
| `audit_logs` | Vendor action audit trail |
| `admin_audit_log` | Admin action audit trail |
| `verification_sessions` | In-progress multi-step verification sessions |
| `company_qr` | Company-level QR codes |
| `vendor_notifications` | Vendor notification records |

### Key Indexes

- `qr_codes.qr_id` — unique
- `users.email` — unique
- `products.(vendor_id, sku)` — compound unique (partial filter)
- `scans.(vendor_id, timestamp)` — compound, for analytics queries
- `scans.(qr_id, timestamp)` — velocity check
- `scans.location.country` — geographic analytics

---

## Infrastructure Dependencies

| Dependency | Role | Required? |
|---|---|---|
| MongoDB | Primary data store | **Yes** (falls back to mock) |
| Redis | Celery broker + cache | Optional (embedding jobs degrade gracefully) |
| Qwen2.5-VL server | VLM verification judge | Optional (fails closed → `needs_review`) |
| SMTP server | Password reset emails | Optional (links printed to console in dev) |

---

## Marketing Website (`/website`)

```
PHP             — Server-side templating
Tailwind CSS    — Styling via compiled dist/
Node.js         — Build toolchain (Tailwind compilation)
```

Pages: `index.php`, `billing.php`, `contact.php`, `privacy.php`, `terms.php`
