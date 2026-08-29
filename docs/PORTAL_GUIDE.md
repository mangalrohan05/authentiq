# Portal Guide

This guide covers both the **Vendor Portal** and **Admin Portal** — their features, navigation, and user workflows.

---

## 1. Consumer Verification Page (Public)

**URL:** `http://<domain>/verify/<qrId>`  
**Authentication:** None required

This is the only page that consumers interact with. It is reached by scanning a QR code printed on a product.

### Consumer Flow

```
1. Consumer scans QR code (camera app or any scanner)
       ↓
2. Browser opens /verify/<qrId>
       ↓
3. Page fetches basic product info (name, brand, QR status)
       ↓
4. Consumer uploads photo(s) of the product
       (front, back, label — each in a separate slot)
       ↓
5. AI pipeline runs (2–10 seconds depending on VLM)
       ↓
6. Result displayed:
   ✅ Highly Authentic / Likely Authentic
   ⚠️  Needs Review
   ❌ Suspicious (counterfeit warning)
       ↓
7. If suspicious, consumer sees brand support email link
   and "Report Issue" mailto link pre-filled with scan details
```

### Displayed Information

- Product name, brand, SKU
- QR scan count (how many times this specific QR has been scanned)
- Verification verdict badge with color coding
- Match strength (HIGH / MEDIUM / LOW / VERY LOW)
- Per-slot breakdown (Front Match, Back Match, Label Match, etc.)
- AI Forensic Analysis panel:
  - VLM verdict and probability
  - Itemised defect list with severity labels
  - Metadata cross-check table
- Brand support contact link

---

## 2. Vendor Portal

**URL:** `http://<domain>/vendor`  
**Authentication:** Vendor account required  
**Roles:** Administrator, Manager, Viewer (legacy: vendor)

### 2.1 Login & Registration

**Path:** `/vendor/login`

- Standard email + password login
- Registration form for new vendor accounts
- Forgot password → email link (or console log in dev mode)
- Invitation-based registration via `/vendor/accept-invitation?token=<token>`

### 2.2 Initial Setup Wizard

**Path:** `/vendor/initial-setup`

Triggered after first login if setup is incomplete.

Steps:
1. **Company Details** — Vendor name, industry, logo
2. **Brand Creation** — Create the first brand (name, logo, support email)
3. **First Product** — SKU, name, description, reference images
4. **QR Generation** — Generate first batch of QR codes

### 2.3 Main Dashboard

**Path:** `/vendor/page.tsx` (primary dashboard)

A large, single-page dashboard with multiple tabbed sections:

#### Products Tab
- View all registered products with reference images
- Add new products with multi-angle reference image upload (front/back/label/hologram/seal/barcode)
- Edit product metadata (name, brand, SKU, MRP, manufacturer, country of origin, barcode, description)
- Delete products
- Upload validation: images must meet quality thresholds (min 400×400, not blurry)
- **Image embedding** is triggered automatically after upload

#### QR Codes Tab
- View all QR codes with scan counts and status
- Generate new QR batch (individual or bulk)
- Link QR codes to products
- Download QR code as PNG/SVG
- **Company QR Code** — A single workspace-level QR at `/vendor/company`

#### Analytics Tab
- Scan volume chart (daily/weekly/monthly)
- Verdict distribution (authentic vs. suspicious)
- Geographic distribution by country
- Recent Activity Log with scan events
- Counterfeit heatmap

#### Brands Tab

**Path:** `/vendor/brands`

- Create and manage brand identities
- Upload brand logos
- Set brand support email (shown to consumers on suspicious verdicts)
- Multiple brands per vendor workspace supported

#### Team Tab

**Path:** `/vendor/settings` → Team section

- Invite team members by email
- Assign roles: Administrator / Manager / Viewer
- View pending invitations
- Revoke access

#### Profile Tab

**Path:** `/vendor/profile`

- Update name, email, password
- Verify current password before changes (security hardening)
- Change password with strength requirements

#### Plan & Billing

**Path:** `/vendor/plan`

- View current subscription plan
- See usage vs. limits:
  - Products used / limit
  - Scans this month / limit
  - Team members / limit
  - Storage used / limit
- Plan upgrade requests (processed by admin)

### 2.4 Role Permissions Matrix

| Permission | Administrator | Manager | Viewer |
|---|---|---|---|
| `BILLING_MANAGE` | ✅ | ❌ | ❌ |
| `WORKSPACE_DELETE` | ✅ | ❌ | ❌ |
| `INVITE_USERS` | ✅ | ✅ (Viewers only) | ❌ |
| `ASSIGN_ROLES` | ✅ | ❌ | ❌ |
| `BRAND_CREATE/EDIT/DELETE` | ✅ | ✅ | ❌ |
| `SKU_CREATE/EDIT/DELETE` | ✅ | ✅ | ❌ |
| `IMAGE_UPLOAD` | ✅ | ✅ | ❌ |
| `BATCH_CREATE` | ✅ | ✅ | ❌ |
| `ANALYTICS_VIEW` | ✅ | ✅ | ✅ |
| `HEATMAP_VIEW` | ✅ | ✅ | ✅ |
| `PROFILE_MANAGE` | ✅ | ❌ | ❌ |

---

## 3. Admin Portal

**URL:** `http://<domain>/admin`  
**Authentication:** Admin account required (`role: admin`)

The admin portal is a comprehensive super-dashboard for platform operators.

### 3.1 Admin Login

**Path:** `/admin/login`

- Separate login page from vendor
- Admin accounts have `role: admin` in the database
- Rate-limited: 5 login attempts per minute

### 3.2 Admin Dashboard Overview

**Path:** `/admin/page.tsx` (240KB+ monolithic dashboard)

Sections:

#### Vendor Management
- List all registered vendors with status (active/inactive)
- View vendor details and subscription information
- Activate / Deactivate vendor accounts
- Create new vendor accounts manually
- Delete vendors (with confirmation)
- Impersonate vendor (view their data)
- Reset vendor passwords

#### Plan Management

- Create subscription plans with limits:
  - `max_products` — product count ceiling
  - `max_scans_per_month` — monthly scan quota
  - `max_users` — team size limit
  - `storage_gb` — storage quota
  - `api_calls_per_month` — API quota
- Edit existing plans (changes affect all vendors on that plan)
- Delete plans (if no vendors subscribed)
- Assign plans to vendors

#### Feature Flags

- Global feature flags per plan (`plan_features_collection`)
- Per-vendor feature overrides (`vendor_feature_overrides_collection`)
- Supports enabling/disabling features for individual vendors regardless of their plan

#### Vendor Subscription Updates

- Update a vendor's active plan
- Set billing status (active / overdue / suspended)
- Override individual limits

#### Analytics (Platform-Wide)
- Total scan volume across all vendors
- Vendor activity heatmap
- Counterfeit detection rate platform-wide
- New vendor sign-up rate

#### Audit Log
- Admin action log (`admin_audit_log_collection`)
- Filter by admin user, action type, date range
- Export to CSV

#### Data Import/Export

**Endpoint prefix:** `/data`

- **Import** — CSV/Excel bulk product import for vendors
- **Export** — Export vendor product catalog and scan history

#### AI Pipeline Health

**Endpoint:** `GET /health`

Returns current status of:
- OpenCLIP model load status
- YOLOv8 model load status
- (VLM health via `/ai/health` if implemented)

---

## 4. Navigation & URL Map

| Path | Portal | Description |
|---|---|---|
| `/` | — | Redirects to vendor login |
| `/vendor/login` | Vendor | Login / Register |
| `/vendor` | Vendor | Main dashboard |
| `/vendor/initial-setup` | Vendor | Onboarding wizard |
| `/vendor/profile` | Vendor | Profile settings |
| `/vendor/brands` | Vendor | Brand management |
| `/vendor/company` | Vendor | Company QR code |
| `/vendor/settings` | Vendor | Account & team settings |
| `/vendor/plan` | Vendor | Subscription & billing |
| `/vendor/reset-password` | Vendor | Password reset |
| `/vendor/accept-invitation` | Vendor | Accept team invite |
| `/admin/login` | Admin | Admin login |
| `/admin` | Admin | Admin super dashboard |
| `/verify/[qrId]` | Public | Consumer scan page |
| `/blog` | Public | Blog (if implemented) |

---

## 5. WebSocket — Real-Time Events

Vendor dashboards connect to `ws://localhost:8000/ws` for real-time updates.

### Event Types Pushed to Vendor

| Event | Trigger |
|---|---|
| `scan_created` | New scan recorded for vendor's product |
| `product_created` | New product added to workspace |
| `embedding_complete` | Background embedding job finished |

### Ping/Pong Keepalive

Client sends `{"type": "ping"}` → server responds `{"type": "pong"}`.

---

## 6. Vendor Onboarding Checklist

For a new vendor to successfully verify their first product:

- [ ] Register at `/vendor/login`
- [ ] Complete initial setup wizard
- [ ] Create at least one Brand
- [ ] Create a Product with ≥1 reference image (ideally all 6 views)
- [ ] Wait for embedding job to complete (or trigger manually via `/ai/embed`)
- [ ] Generate a QR code batch and link to product
- [ ] Print / attach QR to physical product
- [ ] Test scan at `/verify/<qrId>` with a photo of the product
