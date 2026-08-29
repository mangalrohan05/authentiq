# QR-Authentiq — Anti-Counterfeit Product Authentication Platform

> **Scan. Verify. Trust.** — A full-stack QR code–based product authentication system powered by a multi-stage AI pipeline (OpenCLIP + YOLOv8 + Qwen2.5-VL) that detects counterfeit goods at consumer scan time.

---

## 📑 Documentation Index

| Document | Description |
|---|---|
| [PROJECT_SCOPE.md](./docs/PROJECT_SCOPE.md) | Project purpose, business goals, and system architecture |
| [TECH_STACK.md](./docs/TECH_STACK.md) | Full technology stack and dependency breakdown |
| [AI_MODEL.md](./docs/AI_MODEL.md) | AI/ML pipeline — OpenCLIP, YOLOv8, Qwen2.5-VL, scoring |
| [PORTAL_GUIDE.md](./docs/PORTAL_GUIDE.md) | Admin & Vendor portal walkthroughs and feature map |
| [INITIAL_SETUP.md](./docs/INITIAL_SETUP.md) | Installation, environment configuration, and first-run |
| [QUICK_START.md](./docs/QUICK_START.md) | Commands to get up and running in minutes |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Deployment strategy (dev, staging, production) |
| [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md) | Test suite, coverage, and testing workflows |
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | REST API endpoint reference |

---

## 🔑 What Is QR-Authentiq?

QR-Authentiq enables product vendors to embed cryptographically unique QR codes on their physical goods. When a consumer scans the code, they upload a photo of the product through a public web page. The system's AI pipeline compares the photo against registered reference images and returns one of four verdicts:

| Verdict | Score | Meaning |
|---|---|---|
| `highly_authentic` | ≥ 0.90 | Product matches all registered references |
| `likely_authentic` | ≥ 0.80 | Strong match, minor deviation |
| `needs_review` | ≥ 0.65 | Inconclusive — routed to human review |
| `suspicious` | < 0.65 | Likely counterfeit — consumer alerted |

---

## 🏗️ Repository Structure

```
QR-Authentiq/MAIN/
├── docs/                        # ← All project documentation (this folder)
├── authentiq-app/
│   ├── backend/                 # FastAPI + Python AI backend
│   │   ├── app/
│   │   │   ├── core/            # DB, auth, rate limiting, Celery, WebSocket
│   │   │   ├── routes/          # REST API route handlers (14 modules)
│   │   │   ├── services/        # AI pipeline, OCR, embeddings, scoring
│   │   │   ├── schemas/         # Pydantic request/response models
│   │   │   └── tasks/           # Async Celery embedding tasks
│   │   ├── tests/               # 21-file pytest suite
│   │   ├── static/              # Uploaded images, QR codes, brand logos
│   │   └── requirements.txt
│   ├── frontend/                # Next.js 16 + React 19 + TypeScript
│   │   └── src/
│   │       ├── app/
│   │       │   ├── admin/       # Admin portal (single-page dashboard)
│   │       │   ├── vendor/      # Vendor portal (products, QRs, analytics)
│   │       │   └── verify/[qrId]/ # Public consumer scan & verify page
│   │       ├── components/      # Shared UI components
│   │       ├── contexts/        # React context providers
│   │       ├── hooks/           # Custom React hooks
│   │       ├── lib/             # API base URL utilities
│   │       └── services/        # Frontend API service layer
│   ├── ai-service/              # AI service module (Python)
│   └── docs/                    # Supplementary app-level docs
└── website/                     # Marketing/landing site (PHP + Tailwind)
```

---

## ⚡ 60-Second Quick Start

```bash
# 1. Clone and enter the project
git clone <repo-url> && cd QR-Authentiq/MAIN

# 2. Start the backend
cd authentiq-app/backend
python -m venv venv && venv\Scripts\activate     # Windows
pip install -r requirements.txt
copy .env.example .env                           # Edit as needed
uvicorn app.main:app --reload --port 8000

# 3. Start the frontend (new terminal)
cd authentiq-app/frontend
npm install && npm run dev
```

Frontend → http://localhost:3000  
Backend API → http://localhost:8000  
API Docs → http://localhost:8000/docs

---

*See [INITIAL_SETUP.md](./docs/INITIAL_SETUP.md) for the complete installation guide.*
