# QR-Authentiq 🔐

> **Scan. Verify. Trust.** — Anti-counterfeit product authentication powered by a multi-stage AI pipeline (DINOv2 + YOLOv8 + EasyOCR). Consumers scan a QR code; the system returns an authenticity verdict in seconds.

[![FastAPI](https://img.shields.io/badge/FastAPI-Python-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-Detection-purple)](https://ultralytics.com)

## What It Does

Product vendors embed cryptographically unique QR codes on their goods. When a consumer scans, they upload a photo through a public web page. The AI pipeline compares the photo against registered reference images and returns one of four verdicts:

| Verdict | Score | Meaning |
|---|---|---|
| highly_authentic | >= 0.90 | Matches all references |
| likely_authentic | >= 0.80 | Strong match, minor deviation |
| needs_review | >= 0.65 | Routed to human review |
| suspicious | < 0.65 | Likely counterfeit |

## AI Pipeline

```
Consumer photo upload
       │
       ▼
  YOLOv8 Detection ──── detects product region
       │
       ▼
  DINOv2 Embeddings ─── visual similarity vs. reference images
       │
       ▼
  EasyOCR ──────────── label/text verification
       │
       ▼
  Scoring Engine ─────── weighted verdict (confidence score 0-1)
```

## Tech Stack

| Layer | Technology |
|---|---|
| AI Detection | YOLOv8 (Ultralytics) |
| AI Embeddings | DINOv2 (Facebook) |
| AI OCR | EasyOCR |
| Backend | FastAPI + Python + Celery |
| Frontend | Next.js 16 + React 19 + TypeScript |
| Auth | JWT (admin/vendor portals) |
| Tests | pytest (21-file suite) |

## Repository Structure

```
authentiq/
├── docs/                   # Full documentation
├── authentiq-app/
│   ├── backend/            # FastAPI AI backend (14 route modules)
│   │   ├── app/routes/     # REST API handlers
│   │   ├── app/services/   # AI pipeline, OCR, embeddings, scoring
│   │   └── tests/          # pytest suite
│   └── frontend/           # Next.js admin + vendor + consumer scan portals
└── website/                # Marketing landing page
```

## Documentation

| Doc | Description |
|---|---|
| [PROJECT_SCOPE.md](./docs/PROJECT_SCOPE.md) | Architecture & goals |
| [AI_MODEL.md](./docs/AI_MODEL.md) | Full AI pipeline details |
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | REST API reference |
| [QUICK_START.md](./docs/QUICK_START.md) | Up and running in minutes |
| [TESTING_GUIDE.md](./docs/TESTING_GUIDE.md) | Test suite & coverage |

## Quick Start

```bash
# Backend
cd authentiq-app/backend
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd authentiq-app/frontend
npm install && npm run dev
```

Frontend -> http://localhost:3000 | API -> http://localhost:8000 | Docs -> http://localhost:8000/docs