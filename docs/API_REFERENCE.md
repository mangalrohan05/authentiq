# API Reference

All endpoints are relative to `http://localhost:8000` (development).

Authentication uses `Authorization: Bearer <jwt_token>` unless marked as **[PUBLIC]**.

---

## Authentication — `/auth`

### `POST /auth/register`
Register a new user.

**Body:**
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "role": "admin | vendor | Administrator | Manager | Viewer",
  "vendor_id": "string | null"
}
```

**Response:** `201 Created`
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "role": "string",
  "vendor_id": "string | null",
  "created_at": "datetime"
}
```

---

### `POST /auth/login` — Rate limited: 5/minute
Login and receive a JWT token.

**Body:**
```json
{ "email": "string", "password": "string" }
```

**Response:** `200 OK`
```json
{
  "access_token": "string",
  "token_type": "bearer",
  "role": "string"
}
```

---

### `POST /auth/forgot-password`
Request a password reset link (sent via email or printed to console in dev).

---

### `POST /auth/reset-password`
Reset password using the token from the reset email.

---

### `POST /auth/verify-password`
Verify the current user's password (used before profile changes). **[Requires Auth]**

---

### `POST /auth/checkout-register`
Register during a billing checkout flow.

---

### `POST /auth/accept-invitation`
Accept a team invitation and create an account.

---

## Products — `/product`

All product endpoints require authentication. Vendor users can only access their own workspace's products.

### `GET /product/`
List all products for the authenticated vendor.

**Query params:** `page`, `limit`, `brand`, `search`

### `POST /product/`
Create a new product.

**Body:**
```json
{
  "name": "string",
  "brand": "string",
  "sku": "string",
  "vendor_id": "string",
  "description": "string?",
  "manufacturer": "string?",
  "country_of_origin": "string?",
  "mrp": "number?",
  "barcode": "string?"
}
```

### `GET /product/{product_id}`
Get product details.

### `PUT /product/{product_id}`
Update product metadata.

### `DELETE /product/{product_id}`
Delete a product and its reference images.

### `POST /product/{product_id}/reference-image`
Upload a reference image for a product.

**Form data:**
- `file` — image file (JPG/PNG, min 400×400)
- `view_type` — `front | back | label | hologram | seal | barcode`

### `DELETE /product/{product_id}/reference-image/{image_id}`
Remove a reference image.

---

## QR Codes — `/qr`

### `POST /qr/generate`
Generate a batch of QR codes for a product.

**Body:**
```json
{
  "product_id": "string",
  "quantity": 1
}
```

### `GET /qr/`
List all QR codes for the authenticated vendor.

### `GET /qr/{qr_id}`
Get QR code details.

### `DELETE /qr/{qr_id}`
Delete a QR code.

---

## Scans — `/scan` [PARTIALLY PUBLIC]

### `GET /scan/status/{qr_id}` — [PUBLIC]
Get basic product info and scan count for a QR code (used by the consumer verification page).

**Response:**
```json
{
  "status": "active | inactive | stolen",
  "qr_id": "string",
  "scan_count": 42,
  "created_at": "datetime",
  "products": [{"id":"...","name":"...","brand":"...","sku":"..."}],
  "batch": {"id":"...","batch_name":"...","created_at":"..."},
  "brand_contact_email": "string | null"
}
```

### `POST /scan/verify` — [PUBLIC]
Submit a product photo for AI verification.

**Form data:**
- `qr_id` — string
- `image` — image file (customer upload)
- `slot` — `front | back | label | hologram | seal | barcode`
- `session_id` — optional (for multi-slot sessions)

**Response:**
```json
{
  "verdict": "highly_authentic | likely_authentic | needs_review | suspicious",
  "score": 0.87,
  "scan_id": "string",
  "quality_flags": [],
  "reshoot_instructions": [],
  "scoring_debug": {
    "slots": {
      "front": {
        "clip_global": 0.85,
        "clip_regional": 0.78,
        "roi_ssim": 0.72,
        "ocr_match": 0.65,
        "slot_score": 0.82
      }
    },
    "vlm": {
      "path": "api | unavailable | gross_mismatch",
      "verdict": "authentic | likely_authentic | needs_review | counterfeit",
      "probability": 0.92,
      "defects": [
        {
          "type": "string",
          "severity": "critical | major | minor",
          "description": "string"
        }
      ],
      "metadata_checks": {},
      "veto_fired": false
    },
    "pipeline_version": "v7",
    "model_signature": "string"
  }
}
```

### `GET /scan/history`
Get scan history for the authenticated vendor.

**Query params:** `page`, `limit`, `verdict`, `date_from`, `date_to`

---

## AI Verification — `/ai`

### `POST /ai/embed/{product_id}`
Trigger background embedding generation for a product.

**Response:**
```json
{ "status": "queued | processing | done", "job_id": "string" }
```

### `GET /ai/embed/status/{job_id}`
Check embedding job status.

---

## Analytics — `/analytics`

All analytics endpoints require authentication.

### `GET /analytics/summary`
Overall scan statistics for the vendor.

**Response:**
```json
{
  "total_scans": 1024,
  "authentic_rate": 0.89,
  "suspicious_rate": 0.07,
  "needs_review_rate": 0.04,
  "top_products": [...],
  "scan_trend": [...]
}
```

### `GET /analytics/geo`
Geographic distribution of scans by country.

### `GET /analytics/timeline`
Scan volume over time.

**Query params:** `period` = `day | week | month`

### `GET /analytics/heatmap`
Scan heatmap data (lat/lon coordinates if location available).

---

## Vendor Profile — `/vendor/profile`

### `GET /vendor/profile/`
Get authenticated vendor's profile.

### `PUT /vendor/profile/`
Update vendor profile (name, logo, support email, company details).

### `POST /vendor/profile/logo`
Upload vendor company logo.

---

## Brands — `/vendor/brands`

### `GET /vendor/brands/`
List all brands for the authenticated vendor.

### `POST /vendor/brands/`
Create a new brand.

**Body:**
```json
{
  "name": "string",
  "support_email": "string?",
  "logo": "file?"
}
```

### `PUT /vendor/brands/{brand_id}`
Update a brand.

### `DELETE /vendor/brands/{brand_id}`
Delete a brand.

---

## Team Management — `/vendor/team`

### `GET /vendor/team/`
List team members and pending invitations.

### `POST /vendor/team/invite`
Send a team invitation.

**Body:**
```json
{
  "email": "string",
  "role": "Administrator | Manager | Viewer"
}
```

**Permissions required:**
- `Administrator` can invite any role
- `Manager` can only invite `Viewer`

### `DELETE /vendor/team/member/{user_id}`
Remove a team member.

### `PUT /vendor/team/member/{user_id}/role`
Update a team member's role.

---

## Admin — `/admin`

All admin endpoints require `role: admin`.

### `GET /admin/vendors`
List all vendors on the platform.

### `POST /admin/vendors`
Create a vendor manually.

### `GET /admin/vendors/{vendor_id}`
Get full vendor details.

### `PUT /admin/vendors/{vendor_id}/status`
Activate or deactivate a vendor account.

### `DELETE /admin/vendors/{vendor_id}`
Delete a vendor and all their data.

### `GET /admin/audit-log`
Get admin action audit log.

---

## Plans — `/admin/plans`

### `GET /admin/plans/`
List all subscription plans.

### `POST /admin/plans/`
Create a new plan.

**Body:**
```json
{
  "name": "string",
  "price": 0,
  "max_products": 100,
  "max_scans_per_month": 10000,
  "max_users": 5,
  "storage_gb": 10,
  "api_calls_per_month": 50000
}
```

### `PUT /admin/plans/{plan_id}`
Update a plan.

### `DELETE /admin/plans/{plan_id}`
Delete a plan.

### `GET /admin/plans/vendor/{vendor_id}/usage`
Get real-time usage vs. limits for a vendor.

### `PUT /admin/plans/vendor/{vendor_id}/subscription`
Update a vendor's subscription plan.

---

## Feature Flags — `/admin/features`

### `GET /admin/features/`
List all feature definitions.

### `POST /admin/features/`
Create a feature flag.

### `GET /admin/features/vendor/{vendor_id}`
Get resolved feature set for a vendor (plan features + overrides).

### `PUT /admin/features/vendor/{vendor_id}/override`
Set a feature override for a specific vendor.

---

## Data Import/Export — `/data`

### `POST /data/import/products`
Bulk import products from CSV/Excel.

**Form data:** `file` (CSV or XLSX)

### `GET /data/export/products`
Export vendor product catalog.

### `GET /data/export/scans`
Export scan history.

---

## Company QR — `/company-qr`

### `GET /company-qr/{vendor_id}`
Get the company-level QR code for a vendor.

### `POST /company-qr/{vendor_id}/generate`
Generate or regenerate the company QR code.

---

## WebSocket — `/ws`

Real-time event push channel for vendor dashboards.

**Connection:** `ws://localhost:8000/ws`

**Authentication:** Pass JWT in the WebSocket URL or subprotocol.

**Incoming events (server → client):**
```json
{ "type": "scan_created", "data": { "scan_id": "...", "verdict": "...", "qr_id": "..." } }
{ "type": "embedding_complete", "data": { "product_id": "..." } }
```

**Keepalive:**
```json
// Client sends:
{ "type": "ping" }
// Server responds:
{ "type": "pong" }
```

---

## Health Check — [PUBLIC]

### `GET /health`
Returns backend and AI model status.

**Response:**
```json
{
  "status": "healthy",
  "ai": { "loaded": true, "model": "ViT-B-32", "weights": "laion2b_s34b_b79k" },
  "yolo": { "loaded": true, "model": "yolov8n" }
}
```

### `GET /`
Returns API version string.

```json
{ "message": "Authentiq Backend API v2 — Secure" }
```

---

## Error Responses

All errors follow the FastAPI default format:

```json
{ "detail": "Human-readable error message" }
```

| Status Code | Meaning |
|---|---|
| `400` | Bad request (validation error, duplicate email, etc.) |
| `401` | Unauthorized (missing or invalid JWT) |
| `403` | Forbidden (insufficient role/permission) |
| `404` | Resource not found |
| `422` | Unprocessable entity (Pydantic validation failure) |
| `429` | Rate limit exceeded (includes `Retry-After` header) |
| `500` | Internal server error |

### Rate Limit Response (429)

```json
{
  "detail": "Rate limit exceeded. Please wait before retrying.",
  "retry_after": 5
}
```

Headers: `Retry-After: 5`

---

## API Documentation (Interactive)

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
- **OpenAPI JSON:** http://localhost:8000/openapi.json
