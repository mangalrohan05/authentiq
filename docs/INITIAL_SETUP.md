# Initial Setup & Installation

This guide covers everything needed to set up QR-Authentiq from scratch on a development machine.

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|---|---|---|
| **Python** | 3.10+ | Backend runtime |
| **Node.js** | 18+ | Frontend build tools |
| **npm** | 9+ | Frontend package manager |
| **MongoDB** | 6+ | Primary database |
| **Git** | any | Version control |

### Optional (but Recommended)

| Software | Version | Purpose |
|---|---|---|
| **Redis** | 7+ | Celery task broker (async embedding jobs) |
| **GPU + CUDA** | CUDA 11.8+ | Faster AI inference (VLM + CLIP) |
| **Ollama** | latest | Self-host Qwen2.5-VL locally |
| **vLLM** | ≥0.6.3 | Production VLM server |

---

## Step 1: Clone the Repository

```bash
git clone <your-repo-url> QR-Authentiq
cd QR-Authentiq/MAIN
```

---

## Step 2: MongoDB Setup

### Option A — Local MongoDB

```bash
# Windows (with MongoDB installed)
mongod --dbpath C:\data\db

# macOS (Homebrew)
brew services start mongodb-community

# Ubuntu
sudo systemctl start mongod
```

MongoDB will run on `mongodb://localhost:27017` by default.

### Option B — MongoDB Atlas (Cloud)

1. Create a free cluster at https://cloud.mongodb.com
2. Get the connection string (format: `mongodb+srv://user:pass@cluster.mongodb.net`)
3. Set it in your `.env` file (see Step 4)

> **Note:** If MongoDB is unreachable, the backend automatically falls back to `mongomock` (in-memory mock). This allows development without a running database but data will not persist between restarts.

---

## Step 3: Backend Setup

```bash
cd authentiq-app/backend
```

### 3.1 Create Virtual Environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3.2 Install Dependencies

```bash
pip install -r requirements.txt
```

> **⚠️ PyTorch Note:** The above installs CPU-only PyTorch by default. For GPU acceleration:
> ```bash
> # CUDA 12.1
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
> # Then reinstall the rest
> pip install -r requirements.txt
> ```

> **⚠️ Windows Note:** If `opencv-python-headless` fails, try:
> ```bash
> pip install opencv-python-headless --no-binary :all:
> ```

### 3.3 Configure Environment Variables

```bash
copy .env.example .env   # Windows
cp .env.example .env     # macOS/Linux
```

Open `.env` and set the following at minimum:

```env
# Required
DATABASE_URL=mongodb://localhost:27017
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Security (CHANGE THIS IN PRODUCTION!)
SECRET_KEY=your-random-32-byte-hex-secret

# AI - OpenCLIP (usually auto-downloads on first run)
OPENCLIP_PRETRAINED=laion2b_s34b_b79k
OPENCLIP_PRETRAINED_FALLBACK=openai

# VLM - Set to false to disable Qwen2.5-VL (uses CLIP-only fallback)
AUTHENTIQ_VLM_ENABLED=true
AUTHENTIQ_VLM_API_URL=http://localhost:11434/v1/chat/completions
AUTHENTIQ_VLM_MODEL=qwen2.5vl:7b
AUTHENTIQ_VLM_FAIL_MODE=closed

# Frontend URL (for password reset emails)
FRONTEND_BASE_URL=http://localhost:3000
```

### Complete Environment Variable Reference

```env
# ── Core ──────────────────────────────────────────────────────────
DATABASE_URL=mongodb://localhost:27017
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
SECRET_KEY=CHANGE-ME-use-openssl-rand-hex-32
ACCESS_TOKEN_EXPIRE_MINUTES=60
FRONTEND_BASE_URL=http://localhost:3000

# ── OpenCLIP ──────────────────────────────────────────────────────
OPENCLIP_PRETRAINED=laion2b_s34b_b79k
OPENCLIP_PRETRAINED_FALLBACK=openai

# ── YOLOv8 ────────────────────────────────────────────────────────
AUTHENTIQ_YOLO_ENABLED=true
AUTHENTIQ_YOLO_MODEL=yolov8n.pt
AUTHENTIQ_YOLO_CONF=0.25
AUTHENTIQ_YOLO_DEBUG=false

# ── Hybrid Scoring ────────────────────────────────────────────────
AUTHENTIQ_SLOT_BLEND_GLOBAL=0.55
AUTHENTIQ_SLOT_BLEND_REGIONAL=0.45

# ── Alignment ─────────────────────────────────────────────────────
AUTHENTIQ_ALIGNMENT_ENABLED=true
AUTHENTIQ_ORB_FEATURES=2500
AUTHENTIQ_ALIGN_MIN_MATCHES=12
AUTHENTIQ_ALIGN_MIN_INLIERS=10
AUTHENTIQ_ALIGN_MAX_REPROJ_ERR=5.0

# ── VLM (Qwen2.5-VL) ──────────────────────────────────────────────
AUTHENTIQ_VLM_ENABLED=true
AUTHENTIQ_VLM_API_URL=http://localhost:11434/v1/chat/completions
AUTHENTIQ_VLM_API_KEY=
AUTHENTIQ_VLM_MODEL=qwen2.5vl:7b
AUTHENTIQ_VLM_TIMEOUT=90
AUTHENTIQ_VLM_MAX_RETRIES=2
AUTHENTIQ_VLM_MAX_TOKENS=1536
AUTHENTIQ_VLM_MAX_IMAGES=12
AUTHENTIQ_VLM_MAX_REFS_PER_VIEW=1
AUTHENTIQ_VLM_IMAGE_MAX_DIM=1024
AUTHENTIQ_VLM_FAIL_MODE=closed
AUTHENTIQ_VLM_DEV_MOCK=false

# ── VLM Tuning ────────────────────────────────────────────────────
AUTHENTIQ_VLM_CRITICAL_VETO_CAP=0.30
AUTHENTIQ_VLM_COUNTERFEIT_CAP=0.30
AUTHENTIQ_VLM_MAJOR_PENALTY=0.18
AUTHENTIQ_VLM_MINOR_PENALTY=0.06
AUTHENTIQ_CLIP_GROSS_MISMATCH_MIN=0.35

# ── Image Quality Thresholds ──────────────────────────────────────
AUTHENTIQ_QUALITY_MIN_BLUR=25.0
AUTHENTIQ_QUALITY_MIN_BRIGHTNESS=15.0
AUTHENTIQ_QUALITY_MAX_BRIGHTNESS=245.0
AUTHENTIQ_QUALITY_MIN_CONTRAST=10.0
AUTHENTIQ_QUALITY_MIN_PRODUCT_AREA_RATIO=0.08
AUTHENTIQ_QUALITY_MAX_GLARE_RATIO=0.15
AUTHENTIQ_QUALITY_OVERALL_THRESHOLD=0.45

# ── Feature Matching ──────────────────────────────────────────────
AUTHENTIQ_DIMENSION_THRESHOLD=0.90
AUTHENTIQ_FEATURE_METHOD=auto
AUTHENTIQ_FEATURE_MATCH_THRESHOLD=0.75
AUTHENTIQ_RANSAC_THRESHOLD=0.70

# ── Redis / Celery ────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── Email (SMTP) ──────────────────────────────────────────────────
# SMTP_ENABLED=true
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=noreply@example.com
# SMTP_PASSWORD=your-smtp-password

# ── Calibration ───────────────────────────────────────────────────
AUTHENTIQ_CALIBRATION_ENABLED=false

# ── CORS Regex (optional, for LAN testing) ───────────────────────
# ALLOWED_ORIGIN_REGEX=https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$
```

### 3.4 Generate a Secure Secret Key

```bash
# PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# macOS / Linux
openssl rand -hex 32
```

---

## Step 4: VLM Setup (Qwen2.5-VL)

The VLM is optional but strongly recommended for accurate counterfeit detection.

### Option A — Ollama (Easiest)

```bash
# Install Ollama from https://ollama.com
ollama pull qwen2.5vl:7b
ollama serve
```

Set in `.env`:
```env
AUTHENTIQ_VLM_API_URL=http://localhost:11434/v1/chat/completions
AUTHENTIQ_VLM_MODEL=qwen2.5vl:7b
```

### Option B — vLLM (GPU, Production)

```bash
pip install "vllm>=0.6.3"
vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
  --port 8000 \
  --limit-mm-per-prompt image=12 \
  --max-model-len 32768
```

Set in `.env`:
```env
AUTHENTIQ_VLM_API_URL=http://localhost:8000/v1/chat/completions
AUTHENTIQ_VLM_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
AUTHENTIQ_VLM_MAX_IMAGES=12
```

### Disable VLM (CLIP-only mode)

If you don't have enough resources for the VLM, set:
```env
AUTHENTIQ_VLM_ENABLED=false
```

The system will use CLIP-only scoring with the pre-v7 ensemble. Scans that can't be auto-resolved will route to `needs_review`.

---

## Step 5: Redis Setup (Optional)

Redis enables async background embedding jobs via Celery.

```bash
# Windows (via WSL or Docker)
docker run -d -p 6379:6379 redis:7

# macOS
brew install redis && brew services start redis

# Ubuntu
sudo apt install redis-server && sudo systemctl start redis
```

Without Redis, embedding jobs run synchronously (first scan is slower but still works).

---

## Step 6: Frontend Setup

```bash
cd authentiq-app/frontend
npm install
```

### Frontend Environment Variables

Create `authentiq-app/frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEFAULT_SUPPORT_EMAIL=support@yourcompany.com
```

> If `NEXT_PUBLIC_API_BASE_URL` is not set, the frontend uses `http://localhost:8000` as the default.

---

## Step 7: Create First Admin Account

The backend provides a registration endpoint. Use it to create the initial admin:

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@example.com",
    "password": "SecurePass123!",
    "role": "admin",
    "vendor_id": null
  }'
```

Or use the Admin Portal registration form at `/admin/login`.

---

## Step 8: Verify Installation

```bash
# Backend health check
curl http://localhost:8000/health
# Expected: {"status":"healthy","ai":{"loaded":true},"yolo":{"loaded":true}}

# API docs
open http://localhost:8000/docs

# Frontend
open http://localhost:3000
```

---

## Static Folders

The backend automatically creates these directories on startup:

```
authentiq-app/backend/static/
├── uploads/          — Temporary customer uploads during verification
├── reference_images/ — Vendor reference product images
├── vendor_logos/     — Vendor company logos
├── company_qr/       — Company-level QR code files
└── brand_logos/      — Brand logo images
```

These are served at `http://localhost:8000/static/...`.

---

## Troubleshooting

### OpenCLIP model fails to download

Set `OPENCLIP_PRETRAINED_FALLBACK=openai` — this uses lighter OpenAI CLIP weights available without Hugging Face authentication.

### MongoDB connection refused

The backend will fall back to `mongomock`. Check if `mongod` is running:
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

### CORS errors in browser

Ensure `ALLOWED_ORIGINS` in `.env` matches exactly the URL you're accessing the frontend from (including port).

### bcrypt import error

The project pins `bcrypt==3.2.2`. If you see `AttributeError: module 'bcrypt' has no attribute '__about__'`, run:
```bash
pip install bcrypt==3.2.2 --force-reinstall
```

### PyTorch DataLoader warning on CPU

The warning "pin_memory on CPU" is suppressed in `app/main.py` — no action needed.

### Embedding job not running

Ensure Redis is running and `REDIS_URL` is set correctly. Check Celery worker logs.
