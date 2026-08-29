# AI Model & Verification Pipeline

## Architecture Overview — v7 Pipeline

The verification system uses a **VLM-primary** design. CLIP handles cheap retrieval and gross-mismatch filtering; Qwen2.5-VL makes the final authenticity judgment.

```
Consumer uploads image(s)
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 0: Image Quality Gate                            │
│  validate_customer_image_bytes()                        │
│  Checks: resolution, blur, brightness, glare, contrast  │
│  Configurable via env vars (AUTHENTIQ_QUALITY_*)        │
└─────────────────────┬───────────────────────────────────┘
                      │ pass
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 1: Near-Duplicate Detection (pHash)              │
│  phash_service.py — rejects identical resubmissions     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 2: OpenCLIP Embedding + Reference Retrieval      │
│  Model: ViT-B-32 (LAION-2B weights)                    │
│  • Generate 512-dim embedding for customer image        │
│  • Cosine similarity against all reference embeddings   │
│  • Pick best-matching reference view per slot           │
│  Strategy: v3_global_yolo_region_patch_ocr              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 3: Gross-Mismatch Pre-filter                     │
│  If best CLIP similarity < AUTHENTIQ_CLIP_GROSS_        │
│  MISMATCH_MIN (0.35) → skip VLM → verdict: suspicious  │
└─────────────────────┬───────────────────────────────────┘
                      │ passes filter
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 4: ORB + RANSAC Homography Alignment             │
│  alignment_service.py                                   │
│  • ORB feature extraction (2500 keypoints)              │
│  • BFMatcher with Lowe's ratio test                     │
│  • RANSAC homography estimation                         │
│  • Warp customer image onto reference geometry          │
│  Requires: ≥12 matches, ≥10 inliers, reproj err ≤5px   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 5: Multi-Signal Ensemble (per slot)              │
│  verification_matching.py                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ • Global CLIP cosine similarity                  │  │
│  │ • YOLOv8 region embeddings (when enabled)        │  │
│  │   yolo_service.py → detect logo/label/barcode    │  │
│  │   region_embeddings.py → CLIP on each region     │  │
│  │ • Patch embeddings (subdivided tile comparison)  │  │
│  │   patch_embeddings.py                            │  │
│  │ • ROI pixel metrics (SSIM / MSE / color hist)    │  │
│  │   roi_pixel_service.py                           │  │
│  │ • OCR text extraction + fuzzy field matching     │  │
│  │   ocr_service.py                                 │  │
│  │ • Dimension similarity                           │  │
│  │   dimension_service.py                           │  │
│  │ • ORB feature matching score                     │  │
│  │   feature_matching_service.py                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Slot weights: label 45% > front 30% > back 20% >       │
│               proof 5% (redistributed if absent)        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 6: Qwen2.5-VL Primary Adjudication (v7)         │
│  qwen_vl_service.py                                     │
│  Single prompt contains:                                │
│  • Full product metadata (name, brand, SKU, MRP,        │
│    manufacturer, country, barcode, description)         │
│  • All reference views (front/back/label/hologram etc.) │
│  • All customer-uploaded images (labelled by slot)      │
│                                                         │
│  Returns structured JSON:                               │
│  • per-attribute match/mismatch                         │
│  • defects[] with severity (critical/major/minor)       │
│  • metadata cross-check table                           │
│  • authenticity_probability (0.0–1.0)                   │
│  • verdict                                              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 7: Decision Layer + Veto Logic                   │
│  vlm_decision.py                                        │
│  • Any CRITICAL defect → score capped at 0.30 (veto)   │
│  • MAJOR defect → -0.18 per occurrence                  │
│  • MINOR defect → -0.06 per occurrence                  │
│  • Identity mismatch → immediate veto                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 8: Platt Calibration Scaffold                    │
│  calibration_layer.py                                   │
│  STATUS: Identity pass-through until labeled dataset    │
│  exists. Logs raw scores for future calibration.        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
                 Final Verdict
     ┌──────────────────────────────────┐
     │  ≥ 0.90 → highly_authentic       │
     │  ≥ 0.80 → likely_authentic       │
     │  ≥ 0.65 → needs_review           │
     │   < 0.65 → suspicious            │
     └──────────────────────────────────┘
```

---

## Model 1 — OpenCLIP (ViT-B-32)

### Role
Primary embedding engine for visual similarity. Used for:
- Reference image indexing (pre-computed at product upload)
- Customer image similarity at scan time
- Regional embedding (per-YOLO-detected region)
- Patch-level tile comparison

### Configuration

| Parameter | Env Var | Default |
|---|---|---|
| Primary weights | `OPENCLIP_PRETRAINED` | `laion2b_s34b_b79k` |
| Fallback weights | `OPENCLIP_PRETRAINED_FALLBACK` | `openai` |
| Embedding dim | — | 512 (ViT-B-32 fixed) |

### Singleton Pattern
The model is loaded **lazily** — only on the first verification call. Startup preloads it in a background asyncio task. Thread-safe with a `threading.Lock()`.

### Embedding Strategy
Version: `v3_global_yolo_region_patch_ocr`

Embeddings are stored per product view type (front, back, label, hologram, seal, barcode). When a new model version is detected (via signature mismatch), old embeddings are automatically regenerated.

### Similarity Thresholds (pre-VLM CLIP-only path)

| Verdict | Threshold |
|---|---|
| `highly_authentic` | ≥ 0.90 |
| `likely_authentic` | ≥ 0.80 |
| `needs_review` | ≥ 0.65 |
| `suspicious` | < 0.65 |

---

## Model 2 — YOLOv8 (Ultralytics)

### Role
Region proposal model. Detects bounded regions of interest (logo, label, barcode, product area) for enhanced CLIP embedding on focused regions.

### Configuration

| Parameter | Env Var | Default |
|---|---|---|
| Enable YOLO | `AUTHENTIQ_YOLO_ENABLED` | `true` |
| Model file | `AUTHENTIQ_YOLO_MODEL` | `yolov8n.pt` |
| Confidence threshold | `AUTHENTIQ_YOLO_CONF` | `0.25` |
| Debug output | `AUTHENTIQ_YOLO_DEBUG` | `false` |

### Hybrid Scoring Weights

| Parameter | Env Var | Default |
|---|---|---|
| Global CLIP weight | `AUTHENTIQ_SLOT_BLEND_GLOBAL` | `0.55` |
| Regional CLIP weight | `AUTHENTIQ_SLOT_BLEND_REGIONAL` | `0.45` |

---

## Model 3 — Qwen2.5-VL (Primary Judge)

### Role
Vision-Language Model that serves as the **primary authenticity adjudicator** (v7 pipeline). It replaces the old weighted-average ensemble approach. The VLM sees the full picture: all reference views + all customer images + complete product metadata in a single prompt.

### Why VLM Over Pure CLIP?

The previous ensemble design was structurally blind to **minor counterfeits**. A wrong logo glyph or missing hologram barely moves an aggregate similarity score. The VLM understands context — it can reason about whether a security feature is present, whether printed text matches the registered metadata, and flag critical defects explicitly.

### Transport
OpenAI-compatible `/v1/chat/completions` endpoint. Two serving options:

**Option A — vLLM (GPU, recommended)**
```bash
pip install "vllm>=0.6.3"
vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
  --port 8000 \
  --limit-mm-per-prompt image=12 \
  --max-model-len 32768
```

**Option B — Ollama (simpler, CPU/GPU)**
```bash
ollama pull qwen2.5vl:7b
ollama serve
```

### VLM Configuration

| Env Var | Description | Default |
|---|---|---|
| `AUTHENTIQ_VLM_ENABLED` | Enable VLM adjudication | `true` |
| `AUTHENTIQ_VLM_API_URL` | VLM server endpoint | `http://localhost:11434/v1/chat/completions` |
| `AUTHENTIQ_VLM_MODEL` | Model identifier | `qwen2.5vl:7b` |
| `AUTHENTIQ_VLM_TIMEOUT` | Request timeout (seconds) | `90` |
| `AUTHENTIQ_VLM_MAX_RETRIES` | Retry attempts | `2` |
| `AUTHENTIQ_VLM_MAX_TOKENS` | Response token limit | `1536` |
| `AUTHENTIQ_VLM_MAX_IMAGES` | Images per prompt | `12` |
| `AUTHENTIQ_VLM_MAX_REFS_PER_VIEW` | Reference views per slot | `1` |
| `AUTHENTIQ_VLM_IMAGE_MAX_DIM` | Max image dimension (px) | `1024` |
| `AUTHENTIQ_VLM_FAIL_MODE` | Failure policy | `closed` |

### Fail Modes

| Mode | Behaviour When VLM Unreachable |
|---|---|
| `closed` | Scan routed to `needs_review` — **never auto-approved** (recommended) |
| `open` | Provisional CLIP result (development only) |

### Veto & Penalty Configuration

| Env Var | Description | Default |
|---|---|---|
| `AUTHENTIQ_VLM_CRITICAL_VETO_CAP` | Max score after any critical defect | `0.30` |
| `AUTHENTIQ_VLM_COUNTERFEIT_CAP` | Max score for counterfeit verdict | `0.30` |
| `AUTHENTIQ_VLM_MAJOR_PENALTY` | Score deduction per major defect | `0.18` |
| `AUTHENTIQ_VLM_MINOR_PENALTY` | Score deduction per minor defect | `0.06` |
| `AUTHENTIQ_CLIP_GROSS_MISMATCH_MIN` | CLIP similarity below which VLM is skipped | `0.35` |

---

## Supporting AI Services

### OCR Service (`ocr_service.py`)
- Extracts text from product label images
- Fuzzy text similarity scoring against registered metadata fields (brand, SKU, MRP, barcode, manufacturer)
- Supports EasyOCR, Tesseract (pytesseract), and PaddleOCR (optional)

### Perceptual Hash Service (`phash_service.py`)
- Generates a perceptual hash for each customer upload
- Near-duplicate detection prevents trivial bypasses (re-submitting the same image)
- Uses `imagehash` library

### Image Quality Service (`image_quality.py`)
Two quality tiers:
- **Vendor reference uploads** — strict thresholds (min 400×400, blur variance ≥80, brightness 35–220)
- **Customer uploads** — lenient phone-camera thresholds (min 300×300, configurable via `AUTHENTIQ_QUALITY_*` env vars)

Returns `quality_flags[]` and `reshoot_instructions[]` for user-facing guidance.

### Alignment Service (`alignment_service.py`)
- ORB feature extraction and BFMatcher
- RANSAC homography estimation for geometric alignment
- Warps customer image onto reference geometry before pixel-level comparison

### ROI Pixel Service (`roi_pixel_service.py`)
- After alignment, computes SSIM, MSE, and color histogram similarity on specific ROI regions (logo, hologram, serial, label, QR code area)

### Calibration Layer (`calibration_layer.py`)
- Platt scaling scaffold for converting raw similarity scores to calibrated probabilities
- Currently an identity pass-through (no labeled dataset yet)
- Logs raw scores to `calibration_data_collection` for future fitting

---

## Async Embedding Pre-computation

Reference image embeddings are expensive. They are pre-computed asynchronously via Celery:

```
Product uploaded → schedule_product_embedding_job() → Celery task
                                                       ↓
                              embedding_jobs.py runs OpenCLIP on all reference images
                                                       ↓
                              Embeddings stored in products_collection
                                                       ↓
                              Scan request → get_cached_reference_embeddings() → cache hit
```

If Celery/Redis is unavailable, embeddings are computed inline (slower first-scan experience).

---

## API Response — Verification Debug Block

The `/scan/verify` endpoint returns a `scoring_debug` block with full transparency:

```json
{
  "verdict": "suspicious",
  "score": 0.28,
  "scoring_debug": {
    "slots": {
      "front": { "clip_global": 0.72, "clip_regional": 0.65, "roi_ssim": 0.41, "ocr_match": 0.30 }
    },
    "vlm": {
      "path": "api",
      "verdict": "counterfeit",
      "probability": 0.12,
      "defects": [
        { "type": "logo_altered", "severity": "critical", "description": "Logo glyph differs from registered reference" }
      ],
      "veto_fired": true,
      "veto_cap_applied": 0.30
    },
    "pipeline_version": "v7",
    "model_signature": "ViT-B-32/laion2b_s34b_b79k/v3"
  }
}
```
