# Project Scope & Purpose

## Overview

**QR-Authentiq** is a SaaS anti-counterfeit product authentication platform that enables brands and vendors to protect their physical goods from counterfeiting. Vendors register their products with multi-angle reference images; consumers scan a QR code printed on the product and upload a photo — the platform's AI pipeline returns a real-time authenticity verdict.

---

## Problem Statement

Global counterfeit trade causes trillions of dollars in losses annually, impacting:
- **Brands** — lost revenue, reputational damage
- **Consumers** — safety risks, financial loss
- **Regulators** — supply chain integrity

Traditional QR codes confirm only "this QR exists" — they cannot prove the physical object it is attached to is genuine. QR-Authentiq adds **visual AI authentication** on top of the QR layer.

---

## Core Goals

1. **Counterfeit Detection at Consumer Level** — Any consumer can verify product authenticity by scanning a QR code and uploading a product photo. No app install required.
2. **Multi-Angle Visual Matching** — Products are registered with front, back, label, hologram, seal, and barcode reference images. All views participate in verification.
3. **VLM-Primary Decision Making** — A self-hosted Qwen2.5-VL model is the primary adjudicator; CLIP provides retrieval and gross-mismatch pre-filtering.
4. **Veto-Based Counterfeit Catching** — A single critical defect (wrong logo, missing hologram, mismatched SKU/barcode) vetoes the result regardless of visual similarity.
5. **SaaS Vendor Portal** — Brands onboard themselves, manage products and QR batches, view scan analytics, and configure team access.
6. **Admin Superportal** — Platform administrators manage vendors, subscription plans, feature flags, and audit logs.

---

## Scope

### In Scope

| Area | Details |
|---|---|
| **Consumer Verification** | Public `/verify/[qrId]` page — scan QR → upload photo → AI verdict |
| **Vendor Portal** | Product/QR management, brand management, team RBAC, analytics dashboard |
| **Admin Portal** | Vendor management, plan/billing management, feature overrides, audit log |
| **AI Verification Pipeline** | OpenCLIP embeddings, YOLOv8 region detection, Qwen2.5-VL judgment |
| **Marketing Website** | PHP/Tailwind landing page at `/website` |
| **Async Embedding Generation** | Celery + Redis background tasks for reference image embeddings |
| **WebSocket Real-time** | Live scan push events to vendor dashboards |
| **Team Management** | Invite system, role-based access (Administrator / Manager / Viewer) |

### Out of Scope (current version)

- Native mobile apps (iOS / Android)
- NFC-based authentication
- Blockchain ledger anchoring
- Payment gateway integration (billing is admin-managed manually)

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Consumer (Browser)                        │
│              /verify/[qrId] — public, no login needed            │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP POST (image upload)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend                            │
│  Port 3000  │  Vendor Portal │ Admin Portal │ Public Verify Page │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST API / WebSocket
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend  (Port 8000)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────────┐ │
│  │  Auth    │ │ Product  │ │   Scan   │ │   AI Verification   │ │
│  │  Routes  │ │  Routes  │ │  Routes  │ │   Pipeline (v7)     │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────────────────┘ │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐  │
│  │  Core (db, security, │  │  Services Layer                  │  │
│  │  cache, limiter,     │  │  OpenCLIP · YOLO · QwenVL · OCR  │  │
│  │  celery, websocket)  │  │  ImageQuality · PhHash · Calib   │  │
│  └──────────────────────┘  └──────────────────────────────────┘  │
└────────┬───────────────────────────────────────┬─────────────────┘
         │                                       │
         ▼                                       ▼
┌─────────────────┐                   ┌───────────────────────┐
│   MongoDB        │                   │  Redis (Celery broker) │
│  authentiq_db   │                   │  + result backend      │
└─────────────────┘                   └───────────────────────┘
```

---

## User Roles

| Role | Portal | Capabilities |
|---|---|---|
| `admin` | Admin Portal | Full system access — vendors, plans, features, audit logs |
| `vendor` | Vendor Portal | Legacy role — treated as Administrator within their workspace |
| `Administrator` | Vendor Portal | Full workspace access including billing and member management |
| `Manager` | Vendor Portal | Product/brand/QR management, analytics; can invite Viewers |
| `Viewer` | Vendor Portal | Read-only analytics and scan history |
| *(public)* | Consumer Page | Scan QR, upload photo, view result — no account required |

---

## Key Outcomes

- **Consumers** get a clear, actionable verdict within seconds of scanning
- **Vendors** get real-time scan analytics, geographic heatmaps, and counterfeit alerts
- **Admins** get full platform visibility, plan enforcement, and audit trails
- **AI accuracy** scales with model size and reference image quality — the system is designed to be progressively improved
