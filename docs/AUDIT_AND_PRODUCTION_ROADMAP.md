# Project Audit — Flaws, Suggestions & Production-Readiness Roadmap

> **Scope:** A consolidated engineering audit of QR-Authentiq covering the AI/counterfeit-detection model, architecture, security, reliability, and code quality — followed by the concrete measures required to take the project from *working prototype* to *industrial-grade, deployable product*.
>
> **How to read this:**
> - **Part 1** lists every known flaw, its impact, severity, current status, and the suggested fix.
> - **Part 2** lists the measures required to reach industrial/production grade.
> - **Part 3** is a phased, prioritized roadmap.
> - **Appendix A** records what has already been fixed on the current branch.
>
> Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low  |  Status: ❌ Open · ✅ Fixed · ⚠️ Partial

---

## Part 1 — Flaws & Suggestions

### 1. AI / Counterfeit-Detection Model (the core product)

This is where the biggest risks live. The single most important finding: **the system's certainty comes from the QR/serialization layer, but that layer is the weakest part — so today the AI is carrying a load it cannot bear alone.**

| # | Flaw | Impact | Sev | Status | Suggested fix |
|---|---|---|---|---|---|
| 1.1 | **QR is per-*product*, not per-*unit*** (`qr/generate` reuses one code per `product_id`; `articles_collection` is labelled "future-ready: unit/article level QR" but unbuilt) | A counterfeiter copies one genuine QR onto every fake → the code is *valid*, so detection falls entirely on the AI guessing from a photo. This is the structural ceiling on accuracy. | 🔴 | ❌ | Implement **per-unit serialized, cryptographically-signed codes** (HMAC/ECDSA payload) + a scan registry. Invalid/absent code → deterministic fake. |
| 1.2 | **Certainty over-relies on vision.** Deterministic signals (over-scan, impossible-travel velocity, geo-cluster, pHash dup) exist but aren't gated on per-unit identity | High false-negative and false-positive rates because the "sure" signals are decorative | 🔴 | ❌ | Fuse deterministic checks *first*; the VLM only adjudicates what they can't settle (see Part 2A). |
| 1.3 | **Local Qwen2.5-VL-7B accuracy ceiling** (16 GB RAM cap) | Mediocre fine-grained forensics — in testing it missed a removed hologram and scored genuine ≈ counterfeit | 🟠 | ⚠️ | Add a **frontier-VLM API option** (max accuracy, data leaves box) behind a flag, or move to a 32B/72B model on a real GPU; squeeze the 7B with the techniques below. |
| 1.4 | **Whole images downscaled to 1024 px** before the VLM sees them | Fine security detail (micro-print, hologram, ® mark) is destroyed *before* inference — cannot detect what it can't see | 🟠 | ✅ | Send **high-resolution crops of security regions** (logo, hologram, barcode, batch panel), not one downscaled full image. Highest-ROI zero-shot accuracy gain. *(Implemented: `qwen_vl_service._security_region_crops` attaches high-res close-ups of detected regions alongside the full images, budgeted within `VLM_MAX_IMAGES`.)* |
| 1.5 | **Single VLM pass = high variance** — same image can flip verdict run-to-run | Unreliable, non-reproducible decisions | 🟠 | ✅ | **Self-consistency voting**: run N=3–5× and take majority / mean probability. *(Implemented: `verify_product_authenticity_voting` runs N calls, aggregates median probability + majority-agreed defects/mismatches.)* |
| 1.6 | **No handling of legitimate product variation** (new batches, regional packaging, seasonal art, label updates) | Genuine units flagged as suspicious → brand-trust damage, high false-positive rate | 🟠 | ❌ | Version reference images; let brands register "known variants"; compare against a *spec*, not a single photo. |
| 1.7 | **"Accuracy" is the wrong metric** for an imbalanced, asymmetric problem | A "say genuine always" model looks 98% accurate and catches 0 fakes | 🟠 | ✅ | Track **counterfeit recall @ fixed false-positive rate**, precision, PR/ROC — not raw accuracy. *(Implemented: `services/metrics.py` + `baseline_verification_eval.py` now report recall@FPR/precision/PR-AUC/ROC-AUC and no longer headline raw accuracy.)* |
| 1.8 | **Calibration layer is a dead scaffold** (`calibration_layer.py` — identity pass-through, never fitted, not in the decision path) | Raw scores aren't calibrated probabilities; thresholds are guesses | 🟡 | ✅ | Fit Platt/温度 calibration once labelled data exists; wire `apply()` into the decision. *(Implemented: `calibrator.apply()` now runs in `vlm_decision.decide_from_vlm` before banding; `fit_from_labeled_data()` + persistence + `scripts/fit_calibration.py` added. Stays identity until fitted + `AUTHENTIQ_CALIBRATION_ENABLED`.)* |
| 1.9 | **No human-in-the-loop review or feedback loop** | No way to resolve the uncertain band, and no labelled data ever accrues → no path to improve | 🟠 | ❌ | Build a **reviewer console**; every confirm/dispute becomes a labelled example → data flywheel → optional fine-tuning. |
| 1.10 | **No adversarial robustness** — a fake with a re-photographed genuine label + copied QR passes QR *and* CLIP retrieval; the VLM is the only gate | The most realistic attack is undefended | 🟠 | ❌ | Serialization (1.1) + tamper/liveness cues + scan-analytics veto. |
| 1.11 | **VLM inference is synchronous in the request path** (60–90 s cold) | First scan after idle times out at the proxy (the "HTTP 500" you saw) | 🟡 | ✅ | Model keep-alive/pin (done as a stopgap); proper fix = **async job queue** (Celery+Redis) with polling, and a warm model pool. *(Implemented: opt-in `POST /scan/{qr}/verify-ai?background=true` runs the verification in an in-process job store (`services/verification_jobs.py`) and returns a `job_id`; poll `GET /scan/verify-jobs/{id}`. Celery/Redis remains the durable production upgrade.)* |
| 1.12 | Reference-embedding & quality gates tuned narrowly for phone photos | Partial embeddings, false "overexposed/no-product" rejects on valid images | 🟡 | ✅ | Recalibrate thresholds on real data; make the quality gate advisory + reshoot-guided rather than a hard reject. *(Implemented: `image_quality.py` now hard-rejects only genuinely-unusable images; `too_small` is advisory, and `extreme_glare` uses a separate loose threshold instead of reusing the soft 0.15 one.)* |

**Historical (already replaced):** the original pipeline used a **weighted-average ensemble that was structurally blind to minor counterfeits**, with **score floors that forced optimistic scores** and a **mock VLM that boosted look-alikes to "authentic."** These were removed in the VLM-primary migration (see Appendix A).

---

### 2. Architecture & Security

| # | Flaw | Impact | Sev | Status | Suggested fix |
|---|---|---|---|---|---|
| 2.1 | **Real bcrypt password hashes + emails committed to git** (`backend/static/db_backup/users.json`, incl. `admin@authentiq.com`) | Credential/PII exposure in history | 🔴 | ⚠️ | Rotate the demo passwords, scrub the file, and purge from history (BFG/`filter-repo`). Never commit credential material. *(Code side done: `users.json` untracked + gitignored; demo users seeded at runtime (`_ensure_demo_users`); seed passwords env-overridable. **Still required by you:** rotate the exposed real creds + purge git history — runbook in [`docs/SECURITY_CREDENTIAL_REMEDIATION.md`](SECURITY_CREDENTIAL_REMEDIATION.md).)* |
| 2.2 | **Runtime data committed to git** — 600+ tracked images under `backend/static/`, and `static/uploads/*` is tracked *against its own `.gitignore`* | Repo bloat (tens of MB), slow clones, data/version-control coupling | 🟠 | ❌ | Move images to **object storage (S3/GCS) + CDN**; `git rm --cached` the tracked images; gitignore `reference_images/`, `brand_logos/`, `uploads/`. |
| 2.3 | **Fragile auth-hashing evolution** — the SHA-256 pre-hash change locked out all existing users until patched | Auth outages on deploy | 🟠 | ✅ | Backward-compatible `verify_password` shipped; keep a multi-scheme `CryptContext` discipline and migration tests. *(Locked in: `tests/test_password_hashing.py` regression-tests legacy-hash verify, new pre-hash verify, wrong-password reject, and >72-byte disambiguation.)* |
| 2.4 | **Silent mock-mode fallback** — when Mongo is unreachable, `db.py` swaps to in-memory `mongomock` and re-seeds | A DB outage silently serves an empty/wrong DB instead of failing loudly | 🟡 | ❌ | Make mock-mode opt-in (env flag); in prod, **fail loudly** on DB unavailability. |
| 2.5 | **Secrets in `.env`** (JWT secret, VLM keys) with no vault | Secret sprawl; hard to rotate | 🟡 | ❌ | Use a secrets manager (Vault/AWS Secrets Manager/Doppler); never commit real `.env`. |
| 2.6 | **Expensive endpoint under-protected** — `verify-ai` runs a costly VLM call; rate-limiting is coarse | Cost-amplification / DoS via repeated scans | 🟡 | ⚠️ | Per-QR + per-IP throttles, queue backpressure, auth/nonce on the public scan flow. |
| 2.7 | RBAC (admin/vendor/manager/viewer) not formally audited | Possible privilege gaps | 🟡 | ❌ | RBAC matrix + authorization tests per route. |

---

### 3. Reliability & Operations

| # | Flaw | Impact | Sev | Status | Suggested fix |
|---|---|---|---|---|---|
| 3.1 | **Celery/Redis not wired** — embedding jobs log "Celery task dispatch failed"; falls back to inline/in-memory | Background work (embeddings) doesn't run reliably; verification does heavy work inline | 🟠 | ⚠️ | Run Redis + a Celery worker; move embeddings **and** VLM verification to async jobs. *(Code/docs done: `/readyz` reports broker reachability; VLM verification has an in-process async job path (1.11); worker runbook in [`DEPLOYMENT_OPS.md`](DEPLOYMENT_OPS.md). **You run** Redis + `celery … worker` for real throughput.)* |
| 3.2 | **Single uvicorn process**, no workers/autoscaling | No concurrency headroom; one slow scan blocks capacity | 🟠 | ✅ | Gunicorn + uvicorn workers behind Nginx; horizontal scale; separate the GPU/VLM tier. *(Added `gunicorn.conf.py` (uvicorn workers, `WEB_CONCURRENCY`) + `gunicorn` dep; production launch documented.)* |
| 3.3 | **No observability** — no structured logs, metrics, tracing, or error tracking | Blind in production; hard to debug incidents | 🟠 | ✅ | Structured JSON logs → centralized store; Prometheus/Grafana metrics; Sentry; request tracing. *(Implemented: `core/observability.py` — JSON logs (`LOG_FORMAT=json`), `X-Request-ID` tracing middleware, Prometheus `/metrics`, env-gated Sentry.)* |
| 3.4 | **No health/readiness probes** beyond `/docs`; **WebSockets unsupported** ("No supported WebSocket library") | Orchestrators can't gate traffic; realtime features degrade | 🟡 | ✅ | Add `/healthz` + `/readyz`; `pip install 'uvicorn[standard]'` for WS; verify model-ready state. *(Implemented: `routes/health.py` — `/healthz`, `/readyz` (db+model+vlm+broker), `/metrics`; `uvicorn[standard]` fixes WS.)* |
| 3.5 | **No model-serving infra** — Ollama single instance, model unloads after idle | Cold-start latency spikes, no scale | 🟡 | ⚠️ | vLLM/Triton with a warm pool; keep-alive; autoscaled GPU tier. *(Runbook documented in [`DEPLOYMENT_OPS.md`](DEPLOYMENT_OPS.md); the model-pin stopgap already exists. **You deploy** the vLLM GPU tier.)* |

---

### 4. Code Quality, Testing & Build

| # | Flaw | Impact | Sev | Status | Suggested fix |
|---|---|---|---|---|---|
| 4.1 | **`next build` failed** — test/e2e TS errors weren't excluded from the type-check | Production frontend build broken | 🟠 | ✅ | `tsconfig` now excludes tests/e2e. |
| 4.2 | **Undeclared dependency** `email-validator` (pydantic `EmailStr`) crashed clean installs | Fresh deploy wouldn't boot | 🟠 | ✅ | Added to `requirements.txt`. Audit remaining optional deps (kornia/lightglue/easyocr). |
| 4.3 | **`calibration_layer.py` `NameError`** (`uuid` used, never imported) on the scan path | Runtime crash risk | 🟠 | ✅ | `import uuid` added. |
| 4.4 | **No CI/CD**; tests exist but aren't gated; ad-hoc debug scripts littered the tree | Regressions ship silently | 🟠 | ✅ | CI: lint + typecheck + tests + security scan on PR; the throwaway scripts were removed. *(Added `.github/workflows/ci.yml`: backend black/pylint/mypy/bandit/safety + pytest (Mongo service), frontend eslint/jest/`next build`. Advisory linters are `continue-on-error` until the legacy backlog is cleared.)* |
| 4.5 | Monolithic `admin/page.tsx` (~3,900 lines); duplicated badge markup; `aiResult` typed `any` | Hard to maintain; type-unsafe result rendering | 🟡 | ⚠️ | Split by section; extract a `StatusBadge`; add a `VerificationResult` interface. *(Done + tsc-validated: `components/StatusBadge.tsx` extracted and adopted; `types/verification.ts` `VerificationResult` replaces `aiResult: any`. Wider StatusBadge adoption + the full section-split remains as mechanical follow-up.)* |
| 4.6 | Dead code / orphaned modules / stray non-ASCII char in the VLM prompt | Noise, confusion | 🟢 | ✅ | Cleaned (see Appendix A). |

---

## Part 2 — Measures for Industrial-Grade Deployment

What must be true before this is a product a brand would pay for and rely on.

### A. Anti-counterfeit core (the real accuracy backbone — build this first)
- **Per-unit serialized, signed QR/NFC codes** + a scan registry (one-time or bounded scans; invalid signature = deterministic fake).
- **Analytics veto layer** gated on per-unit identity: over-scan, impossible-travel, geo-cluster anomalies, velocity, duplicate-image (pHash) — all already partly present, just not gated.
- **Brand security-feature spec** per product (documented holograms, batch formats, ® placement) used as VLM ground truth and for deterministic checks.
- (Optional/physical) tamper-evident seals, UV/taggant, NFC — for premium tiers.

### B. AI/ML productionization
- **Dedicated GPU inference** (vLLM/Triton) with a warm model pool + model versioning/registry.
- **Region-crop + self-consistency + agentic multi-step** VLM pipeline (Part 1.4/1.5).
- **Calibrated decision fusion** (deterministic + VLM → one calibrated probability, asymmetric thresholds favouring recall, explicit human-review band).
- **Reviewer console + feedback loop** → labelled dataset → **eventual fine-tuning of a small on-prem detector** (the honest path past the zero-shot ceiling).
- **Golden eval set + accuracy regression in CI**; drift & false-positive monitoring in prod; model cards.

### C. Scalability & performance
- Async job queue (Celery+Redis) for embeddings and verification; polling/websocket result delivery.
- Gunicorn + uvicorn workers; separate GPU tier; connection pooling; response/embedding caching.
- Load-test SLAs (locust harness already present).

### D. Data & storage
- **Object storage (S3/GCS) + CDN** for reference/upload images; remove images from git.
- MongoDB Atlas (M10+) with replica set, automated backups, PITR; indexes on hot queries (`sku`, `qr_id`, `vendor_id`).
- Data-retention & PII policy (uploaded consumer photos + geo/IP).

### E. Security & compliance
- Secrets vault; TLS everywhere; WAF; strict CORS; short-lived tokens + refresh; RBAC authorization tests.
- **Purge committed credentials from git history** and rotate.
- **Data-residency decision** for the VLM (self-hosted = local; frontier API = images leave premises — GDPR/consumer-photo implications).
- Audit logging (verification decisions already carry a `vlm_report` trail — extend it), appeals process, pen test, SOC2 trajectory.

### F. Reliability & observability
- `/healthz` + `/readyz`; Prometheus metrics; Grafana dashboards; distributed tracing; Sentry error tracking; alerting + on-call runbooks; SLOs (latency, availability, false-positive rate).

### G. CI/CD & DevOps
- Containerize (Docker) backend, frontend, and worker; IaC (Terraform); staging→prod pipeline with canary/blue-green; DB migration discipline (esp. auth-hash changes); dependency & image vulnerability scanning.

### H. Testing & QA
- Unit + **integration + e2e (Playwright) in CI**; contract tests for the API; **model-accuracy regression suite** on a labelled golden set; chaos/failure testing (DB down, VLM down → must fail *closed*, not silently mock).

### I. AI governance
- Explainable, auditable verdicts (keep the per-defect `vlm_report`); human-review SLA; false-positive/appeals tracking; bias & fairness review across product categories; documented decision policy and thresholds.

---

## Part 3 — Prioritized Roadmap

| Phase | Goal | Key work |
|---|---|---|
| **Phase 0 — Stabilize (days)** | Stop the bleeding | ✅ login/deps/build/VLM fixes (done); scrub git credentials + untrack images; add `/healthz`; wire Redis+Celery worker |
| **Phase 1 — Accuracy backbone (weeks)** | Make detection *sure* | **Per-unit serialized signed QR** + registry; gate analytics on per-unit identity; VLM **region-crops + self-consistency**; brand security-feature spec; calibrated decision + **human-review console** |
| **Phase 2 — Scale & harden (weeks)** | Production infra | Async verification queue; GPU inference tier (vLLM); object storage + CDN; observability stack; CI/CD + containers; MongoDB Atlas w/ backups |
| **Phase 3 — Close the loop (ongoing)** | Beat the zero-shot ceiling | Feedback → labelled data → **fine-tuned on-prem detector**; accuracy regression in CI; drift monitoring; frontier-VLM option behind a flag; SOC2/compliance |

**Target metric to hold the org accountable:** *≥95% counterfeit recall at ≤2% false-positive rate on a held-out, real-world labelled set* — achieved by the **system** (serialization + analytics + VLM + human-reviewed tail), not by zero-shot vision alone.

---

## Appendix A — Already fixed on this branch

These flaws were identified and resolved during the AI-pipeline overhaul (commits `84f797c`, `e30d31b`, `bc82cce`, `6da4796`):

- **VLM-primary migration** — replaced the minor-counterfeit-blind weighted-average ensemble, optimistic score floors, and the mock-VLM that boosted look-alikes, with a Qwen2.5-VL adjudicator using metadata + all reference views and a critical-defect veto.
- **Login** — backward-compatible `verify_password` (legacy + pre-hash); `team.py`/`db.py` seed aligned.
- **Boot/build** — `email-validator` added; `calibration_layer` `uuid` import; `tsconfig` excludes tests/e2e so `next build` passes; stray non-ASCII prompt char removed.
- **VLM runtime** — `.env`/`.env.example` repointed from the backend's own `:8000` to Ollama `:11434` with `qwen2.5vl`; created a 16k-context model variant; pinned the model to eliminate cold-start; **verify flow retries once on a transient 5xx**.
- **Repo cleanup** — removed dead code, orphaned modules, ad-hoc debug scripts, the placeholder `ai-service`, and a never-built SVM plan.

### Model-hardening batch (Part 1 §1 items 1.4, 1.5, 1.7, 1.8, 1.11, 1.12)

Accuracy, reliability and latency fixes to the counterfeit-detection core, each with unit tests:

- **1.4 High-res security crops** — `qwen_vl_service` now attaches high-resolution close-ups of detected security regions (hologram/logo/QR/barcode/serial/label) in addition to the full images, so the 1024px downscale no longer destroys fine detail. Config: `AUTHENTIQ_VLM_REGION_CROPS`, `AUTHENTIQ_VLM_CROP_MAX_DIM`, `AUTHENTIQ_VLM_MAX_CROPS_PER_IMAGE`.
- **1.5 Self-consistency voting** — `verify_product_authenticity_voting` runs the judgement N times (default 3, parallelised) and aggregates conservatively: median probability, majority verdict, and only defects/metadata-mismatches a majority of runs agree on. Config: `AUTHENTIQ_VLM_SELF_CONSISTENCY_N`.
- **1.7 Honest metrics** — `services/metrics.py` (counterfeit recall @ fixed FPR, precision, PR-AUC, ROC-AUC, confusion matrix); `baseline_verification_eval.py` no longer headlines raw accuracy.
- **1.8 Calibration wired in** — `calibrator.apply()` now runs in the decision path before banding; `fit_from_labeled_data()` + param persistence + `scripts/fit_calibration.py`. Identity no-op until fitted and `AUTHENTIQ_CALIBRATION_ENABLED=true`.
- **1.11 Async verification** — opt-in background job store (`services/verification_jobs.py`) + `POST …/verify-ai?background=true` → `job_id`, polled via `GET /scan/verify-jobs/{id}`. In-process (no Redis/Celery required); Celery/Redis is the durable upgrade. Default path stays synchronous and unchanged.
- **1.12 Advisory quality gate** — `image_quality.py` rejects only genuinely-unusable images; `too_small` is advisory (`too_tiny` is the hard floor), and `extreme_glare` uses a separate loose threshold. New `AUTHENTIQ_QUALITY_HARD_MIN_*` / `AUTHENTIQ_QUALITY_EXTREME_*` knobs.

---

*This document is the consolidated audit; it does not replace `DEPLOYMENT.md` (how to deploy) — it defines what must be true before deploying.*
