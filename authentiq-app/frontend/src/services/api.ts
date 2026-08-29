// src/services/api.ts
/**
 * API service layer for Authentiq frontend.
 *
 * Public endpoints (no auth): scanQR
 * Protected endpoints: all others use authFetch() which injects the JWT token.
 */

import { getApiBase } from '@/lib/apiBase';

// ── Token Helper ──────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const isAdmin = window.location.pathname.startsWith('/admin');
  const tokenKey = isAdmin ? 'authentiq_admin_token' : 'authentiq_vendor_token';
  return localStorage.getItem(tokenKey);
}

// ── Retry / Backoff Helper ────────────────────────────────────────────────────

/** Sleep for the given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper that injects Authorization header from stored JWT.
 *
 * Retry policy:
 *   - 429 (Rate Limited): waits the server-specified Retry-After seconds (default 5s)
 *     then retries once. Does NOT retry again to avoid amplifying load.
 *   - 502/503/504 (Backend transient): exponential backoff up to MAX_RETRIES.
 *   - 401/403: clears session and redirects immediately (no retry).
 *   - All other errors: propagated immediately.
 */
const MAX_RETRIES = 2;

/**
 * Request timeout in milliseconds.
 * - AUTH_TIMEOUT_MS: used for /auth/login (should be fast, < 1s on healthy backend)
 * - DEFAULT_TIMEOUT_MS: used for all other API calls
 *
 * AbortSignal.timeout() is supported in all modern browsers and Node 18+.
 * On older environments it degrades gracefully (no timeout applied).
 */
const AUTH_TIMEOUT_MS = 10_000;     // 10 s — login must be snappy
const DEFAULT_TIMEOUT_MS = 15_000;  // 15 s — general API calls

function makeSignal(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined; // Older environment — no timeout
  }
}

async function authFetch(url: string, options: RequestInit = {}, _attempt = 0): Promise<Response> {
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let res: Response;
  try {
    // Apply a default timeout — if the backend is overloaded or hanging
    // (e.g. during AI model load), the browser will abort cleanly instead
    // of hanging indefinitely, which also prevents the "Failed to fetch" ghost.
    const signal = options.signal ?? makeSignal(DEFAULT_TIMEOUT_MS);
    res = await fetch(url, { ...options, headers, signal });
  } catch (networkErr) {
    // Network failure or timeout — retry with backoff
    if (_attempt < MAX_RETRIES) {
      const delay = Math.pow(2, _attempt) * 1000; // 1s, 2s
      await sleep(delay);
      return authFetch(url, options, _attempt + 1);
    }
    const isTimeout = networkErr instanceof DOMException && networkErr.name === 'TimeoutError';
    throw new Error(
      isTimeout
        ? 'Request timed out. The server may be busy — please try again.'
        : 'Network error: Unable to reach the server. Please check your connection.'
    );
  }

  if (res.status === 401) {
    // Token expired or missing — clear storage and dispatch a session-expired event.
    // IMPORTANT: Do NOT use window.location.href = '/login' here — the proxy
    // redirects /login → /vendor/login causing a full hard-reload loop.
    // Instead, fire a custom event so AuthContext can navigate cleanly via the router.
    const isAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
    const tokenKey = isAdmin ? 'authentiq_admin_token' : 'authentiq_vendor_token';
    const userKey = isAdmin ? 'authentiq_admin_user' : 'authentiq_vendor_user';
    const roleCookieKey = isAdmin ? 'authentiq_admin_role' : 'authentiq_vendor_role';

    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    document.cookie = `${tokenKey}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = `${roleCookieKey}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    // Dispatch event so AuthContext can call router.replace() without a hard reload
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('authentiq:session-expired'));
    }
    throw new Error('Session expired. Please log in again.');
  }

  if (res.status === 403) {
    throw new Error('Access denied. You do not have permission for this action.');
  }

  if (res.status === 429) {
    // Read server-specified Retry-After (seconds), default to 5s
    const retryAfterSec = parseInt(res.headers.get('Retry-After') || '5', 10);
    const retryAfterMs = Math.min(retryAfterSec * 1000, 30_000); // cap at 30s
    if (_attempt < 1) {
      // Only retry once on rate limit to avoid amplifying the problem
      await sleep(retryAfterMs);
      return authFetch(url, options, _attempt + 1);
    }
    throw new Error(`Rate limit exceeded. Please wait ${retryAfterSec}s before trying again.`);
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    if (_attempt < MAX_RETRIES) {
      const delay = Math.pow(2, _attempt) * 1000 + Math.random() * 500; // jitter
      await sleep(delay);
      return authFetch(url, options, _attempt + 1);
    }
    throw new Error('Backend is temporarily unavailable. Please try again in a moment.');
  }

  return res;
}


// ── Payload Types ─────────────────────────────────────────────────────────────

export interface CreateBatchPayload {
  batch_name: string;
  product_id: string;        // Required — batch must belong to a product
  batch_code?: string;
  manufacturing_date?: string;
  quantity?: number;
}

export interface CreateProductPayload {
  name: string;
  brand: string;
  description?: string;
  sku?: string;
  serial_number?: string;
  category?: string;
  // batch_id removed — products are now standalone

  // Brand association
  brand_id?: string;

  // Extended registration fields
  variant_name?: string;
  pack_size?: string;
  mrp?: number;
  barcode?: string;
  hsn_code?: string;
  manufacturer_name?: string;
  manufacturer_address?: string;
  country_of_origin?: string;
  product_status?: 'active' | 'recalled';
  notes?: string;
}

export interface ReferenceImage {
  id: string;
  filename: string;
  url: string;
  view_type: string;
  size_bytes: number;
  content_type: string;
  uploaded_at: string;
  embedding_cached?: boolean;
  embedding_cached_at?: string | null;
  embedding_vector?: number[] | null;
  embeddings_status?: string;
}

export interface ProductEmbeddingStatus {
  product_id: string;
  embeddings_status: 'none' | 'pending' | 'partial' | 'ready' | 'processing';
  embeddings_ready_count: number;
  embeddings_total_count: number;
  embeddings_pending_count: number;
  ai_service: { status: string; loaded: boolean; error?: string | null };
  images: Array<{ id: string; view_type: string; embedding_cached: boolean; embedding_error?: string }>;
}

export interface ProductResponse {
  id: string;
  product_id?: string;
  name: string;
  brand?: string;
  description?: string;
  sku?: string;
  category?: string;
  timestamp?: string;
  reference_images?: ReferenceImage[];
  qr_primary_color?: string;
  qr_secondary_color?: string;
  qr_use_logo?: boolean;
  qr_id?: string;
  verification_url?: string;
  scan_count?: number;
}

export interface QRResponse {
  qr_id: string;
  verification_url: string;
}

export interface CompanyQRResponse {
  id: string;
  company_id: string;
  qr_code_url: string;
  verification_url: string;
  image_url: string;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: string;
  name: string;
  email: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Login with email + password */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${getApiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: makeSignal(AUTH_TIMEOUT_MS),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Too many login attempts. Please try again later.');
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Login failed');
  }
  return res.json();
}

/** Get currently authenticated user profile */
export async function getMe(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/auth/me`);
  if (!res.ok) throw new Error('Failed to fetch user profile');
  return res.json();
}

// ── Vendor profile & account ──────────────────────────────────────────────────

export async function getVendorProfile(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to load profile');
  return res.json();
}

export async function updateVendorProfile(data: Record<string, unknown>): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to update profile');
  }
  return res.json();
}

export async function completeOnboarding(data: Record<string, unknown>): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/onboarding/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to complete onboarding');
  }
  return res.json();
}

export async function updateVendorAddons(data: {
  extraUsers: number;
  extraSKUs: number;
  extraBrands: number;
  totalUsers: number;
  totalSKUs: number;
  totalBrands: number;
}): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/addons/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Failed to update add-ons');
  }
  return res.json();
}

export async function uploadVendorLogo(file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);
  const res = await authFetch(`${getApiBase()}/vendor/profile/logo`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Failed to upload logo');
  return res.json();
}

export async function uploadVendorQRLogo(file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);
  const res = await authFetch(`${getApiBase()}/vendor/profile/qr-logo`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Failed to upload QR logo');
  return res.json();
}

export async function deleteVendorLogo(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/logo`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove profile picture');
  return res.json();
}

export async function deleteVendorQRLogo(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/qr-logo`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove QR logo');
  return res.json();
}

export async function changeVendorPassword(data: {
  current_password: string;
  new_password: string;
  confirm_password: string;
}): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    if (typeof detail === 'object' && detail.errors) throw new Error(detail.errors.join(' '));
    throw new Error(detail || 'Failed to change password');
  }
  return res.json();
}

export async function getNotificationPreferences(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/notifications`);
  if (!res.ok) throw new Error('Failed to load notification preferences');
  return res.json();
}

export async function updateNotificationPreferences(preferences: Record<string, boolean>): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/notifications`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences }),
  });
  if (!res.ok) throw new Error('Failed to save notification preferences');
  return res.json();
}

export async function getVendorSessionInfo(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/session`);
  if (!res.ok) throw new Error('Failed to load session info');
  return res.json();
}

export async function logoutAllVendorSessions(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/sessions/logout-all`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to sign out other devices');
  return res.json();
}

export async function exportVendorAccountData(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/export`);
  if (!res.ok) throw new Error('Failed to export account data');
  return res.json();
}

export async function deactivateVendorAccount(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/deactivate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });
  if (!res.ok) throw new Error('Failed to deactivate account');
  return res.json();
}

export async function requestVendorAccountDeletion(confirmText: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/delete-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm_text: confirmText }),
  });
  if (!res.ok) throw new Error('Failed to submit deletion request');
  return res.json();
}

export async function forgotPassword(email: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    signal: makeSignal(AUTH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

export async function resetPasswordWithToken(data: {
  token: string;
  new_password: string;
  confirm_password: string;
}): Promise<any> {
  const res = await fetch(`${getApiBase()}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: makeSignal(AUTH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Reset failed');
  }
  return res.json();
}

export async function validateResetToken(token: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error('Invalid or expired link');
  return res.json();
}

/** Verify current user's password for critical actions */
export async function verifyPassword(password: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/auth/verify-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Incorrect password');
  return res.json();
}

// ── Batch (Vendor-protected) ──────────────────────────────────────────────────



// ── Product (Vendor-protected) ────────────────────────────────────────────────

/** Create a new product (standalone — no batch required) */
export async function createProduct(data: CreateProductPayload): Promise<ProductResponse> {
  const res = await authFetch(`${getApiBase()}/product/create`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create product: ${err}`);
  }
  return res.json();
}

/** Get flat list of all products (authenticated) */
export async function getProducts(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/product/list`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get products: ${err}`);
  }
  return res.json();
}

/** Get a single product with its batches */
export async function getProductById(productId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/product/${productId}`);
  if (!res.ok) throw new Error('Failed to fetch product');
  return res.json();
}

/** Update a product */
export async function updateProduct(productId: string, data: Partial<CreateProductPayload>): Promise<any> {
  const res = await authFetch(`${getApiBase()}/product/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update product');
  return res.json();
}

/** Delete a product */
export async function deleteProduct(productId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/product/${productId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete product');
  return res.json();
}

// getProductBatches removed

/** Upload reference image for a product */
export async function uploadProductReferenceImage(productId: string, file: File, viewType: string): Promise<ReferenceImage> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('view_type', viewType);

  const res = await authFetch(`${getApiBase()}/product/${productId}/reference-images`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload reference image: ${err}`);
  }
  return res.json();
}

/** Poll embedding generation status for a product */
export async function getProductEmbeddingStatus(productId: string): Promise<ProductEmbeddingStatus> {
  const res = await authFetch(`${getApiBase()}/product/${productId}/embedding-status`);
  if (!res.ok) throw new Error('Failed to fetch embedding status');
  return res.json();
}

/**
 * Poll until reference embeddings are ready (or timeout).
 * Call after uploading reference images so verification is not blocked.
 */
export async function waitForProductEmbeddings(
  productId: string,
  options?: { maxAttempts?: number; intervalMs?: number; onProgress?: (status: ProductEmbeddingStatus) => void }
): Promise<ProductEmbeddingStatus> {
  const maxAttempts = options?.maxAttempts ?? 40;
  const intervalMs = options?.intervalMs ?? 3000;

  let last: ProductEmbeddingStatus | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await getProductEmbeddingStatus(productId);
    options?.onProgress?.(last);

    if (last.embeddings_status === 'ready') return last;
    if (last.embeddings_status === 'none') return last;
    if (last.ai_service?.status === 'error') {
      throw new Error(
        last.ai_service.error || 'AI embedding service failed to load. Check backend logs and dependencies.'
      );
    }

    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }

  return last!;
}

/** Get reference images for a product */
export async function getProductReferenceImages(productId: string): Promise<ReferenceImage[]> {
  const res = await authFetch(`${getApiBase()}/product/${productId}/reference-images`);
  if (!res.ok) throw new Error('Failed to fetch reference images');
  return res.json();
}

/** Delete a reference image for a product */
export async function deleteProductReferenceImage(productId: string, imageId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/product/${productId}/reference-images/${imageId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete reference image');
  return res.json();
}

/** Replace a reference image for a product */
export async function replaceProductReferenceImage(productId: string, imageId: string, file: File, viewType: string): Promise<ReferenceImage> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('view_type', viewType);

  const res = await authFetch(`${getApiBase()}/product/${productId}/reference-images/${imageId}`, {
    method: 'PUT',
    body: formData
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to replace reference image: ${err}`);
  }
  return res.json();
}

// ── QR (Vendor-protected) ─────────────────────────────────────────────────────

/** Generate QR for a product */
export async function generateQR(productId: string): Promise<QRResponse> {
  const res = await authFetch(`${getApiBase()}/qr/generate`, {
    method: 'POST',
    body: JSON.stringify({ product_id: productId }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to generate QR: ${err}`);
  }
  return res.json();
}

/** Update QR code customization settings for a product */
export async function updateProductQRCustomization(productId: string, data: {
  qr_primary_color?: string;
  qr_secondary_color?: string;
  qr_use_logo?: boolean;
}): Promise<any> {
  const res = await authFetch(`${getApiBase()}/product/${productId}/qr-customization`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to update QR customization: ${err}`);
  }
  return res.json();
}


/** Generate one shared company QR (idempotent) */
export async function generateCompanyQR(companyId: string): Promise<CompanyQRResponse> {
  const res = await authFetch(`${getApiBase()}/company/${companyId}/generate-qr`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to generate company QR: ${err}`);
  }
  return res.json();
}

/** Get company-level shared QR */
export async function getCompanyQR(companyId: string): Promise<CompanyQRResponse> {
  const res = await authFetch(`${getApiBase()}/company/${companyId}/qr`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch company QR: ${err}`);
  }
  return res.json();
}

// ── Scan (PUBLIC — no auth) ───────────────────────────────────────────────────

/** Scan a QR code — public endpoint, no token needed */
export async function scanQR(qrId: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/scan/${qrId}`);
  if (!res.ok) {
    if (res.status === 429) throw new Error('Too many scan attempts. Please wait a moment.');
    const err = await res.text();
    throw new Error(`Failed to scan QR: ${err}`);
  }
  return res.json();
}

// ── Admin (Admin-protected) ───────────────────────────────────────────────────

/** Admin: Get Analytics */
export async function getAdminAnalytics(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/analytics`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get admin analytics: ${err}`);
  }
  return res.json();
}

/** Admin: Get Activity */
export async function getAdminActivity(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/activity`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get admin activity: ${err}`);
  }
  return res.json();
}

/** Admin: Get Vendors */
export async function getAdminVendors(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendors`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get admin vendors: ${err}`);
  }
  return res.json();
}

/** Admin: Create Vendor */
export async function createVendor(vendorName: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor/create`, {
    method: 'POST',
    body: JSON.stringify({ vendor_name: vendorName }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create vendor: ${err}`);
  }
  return res.json();
}

/** Admin: Get Products */
export async function getAdminProducts(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/products`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get admin products: ${err}`);
  }
  return res.json();
}

/** Admin: Get Detailed Scan Logs */
export async function getAdminScans(params: { limit?: number; skip?: number; vendor_id?: string; product_id?: string } = {}): Promise<any> {
  const query = new URLSearchParams(params as any).toString();
  const res = await authFetch(`${getApiBase()}/analytics/admin/scans?${query}`);
  if (!res.ok) throw new Error('Failed to fetch admin scan logs');
  return res.json();
}

/** Vendor: Get Detailed Scan Logs */
export async function getVendorScans(params: { limit?: number; skip?: number; product_id?: string } = {}): Promise<any> {
  const query = new URLSearchParams(params as any).toString();
  const res = await authFetch(`${getApiBase()}/analytics/vendor/scans?${query}`);
  if (!res.ok) throw new Error('Failed to fetch vendor scan logs');
  return res.json();
}


// ── Admin (Vendor Credential Management) ──────────────────────────────────────

/** Admin: Get Vendor User Credentials */
export async function getVendorAccounts(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor-users`);
  if (!res.ok) throw new Error(`Failed to fetch vendor users: ${await res.text()}`);
  return res.json();
}

/** Admin: Create Vendor User Credential */
export async function createVendorAccount(data: any): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor-users`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errObj = await res.json().catch(() => ({}));
    throw new Error(errObj.detail || `Failed to create vendor account: ${res.statusText}`);
  }
  return res.json();
}

/** Admin: Toggle Vendor User Status */
export async function updateVendorAccountStatus(userId: string, status: 'active' | 'inactive'): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor-users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update vendor status: ${await res.text()}`);
  return res.json();
}

/** Admin: Reset Vendor Password */
export async function resetVendorPassword(userId: string, new_password: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor-users/${userId}/reset-password`, {
    method: 'PATCH',
    body: JSON.stringify({ new_password }),
  });
  if (!res.ok) throw new Error(`Failed to reset password: ${await res.text()}`);
  return res.json();
}

/** Admin: Delete Vendor Account */
export async function deleteVendorAccount(userId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor-users/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete vendor account: ${await res.text()}`);
  return res.json();
}

/** Admin: Update Vendor Account Role */
export async function updateVendorAccountRole(userId: string, role: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor-users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`Failed to update vendor role: ${await res.text()}`);
  return res.json();
}

/** Vendor: Get Analytics Overview */
export async function getVendorAnalyticsOverview(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/analytics/vendor/overview`);
  if (!res.ok) throw new Error(`Failed to fetch analytics overview: ${await res.text()}`);
  return res.json();
}

/** Vendor: Get Scan Trends */
export async function getVendorAnalyticsTrends(days: number = 14): Promise<any> {
  const res = await authFetch(`${getApiBase()}/analytics/vendor/trends?days=${days}`);
  if (!res.ok) throw new Error(`Failed to fetch scan trends: ${await res.text()}`);
  return res.json();
}

/** Vendor: Get Top Performing Products */
export async function getVendorTopProducts(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/analytics/vendor/top-products`);
  if (!res.ok) throw new Error(`Failed to fetch top products: ${await res.text()}`);
  return res.json();
}


/** Vendor: Get Activity Feed */
export async function getVendorActivity(limit: number = 20): Promise<any> {
  const res = await authFetch(`${getApiBase()}/analytics/vendor/activity?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch vendor activity: ${await res.text()}`);
  return res.json();
}

/** Vendor: Get Security Alerts */
export async function getVendorSecurityAlerts(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/analytics/vendor/security-alerts`);
  if (!res.ok) throw new Error(`Failed to fetch security alerts: ${await res.text()}`);
  return res.json();
}

/** Vendor: Get Notifications (Operations log and security alerts unified) */
export async function getVendorNotifications(limit: number = 50): Promise<any> {
  const res = await authFetch(`${getApiBase()}/analytics/vendor/notifications?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${await res.text()}`);
  return res.json();
}

/** Vendor: Import Products via CSV/XLSX (product-first) */
export async function importProducts(file: File, productId: string = ''): Promise<any> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  if (productId) {
    formData.append('product_id', productId);
  }

  const res = await fetch(`${getApiBase()}/data/import/products`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });

  if (!res.ok) {
    let errorMsg = await res.text();
    try {
      const parsed = JSON.parse(errorMsg);
      if (parsed.detail) errorMsg = parsed.detail;
    } catch (e) { }
    throw new Error(errorMsg);
  }
  return res.json();
}

/** Vendor: Export Products to CSV or Excel */
export async function exportVendorProducts(format: 'csv' | 'excel' = 'csv'): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}/data/export/products?format=${format}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to export products");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const extension = format === 'excel' ? 'xlsx' : 'csv';
  a.download = `products_export_${new Date().toISOString().split('T')[0]}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}



/** Vendor: Download CSV Template */
export async function downloadCsvTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}/data/import/template/csv`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to download CSV template");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `authentiq_import_template.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/** Vendor: Download Excel Template */
export async function downloadExcelTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}/data/import/template/excel`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to download Excel template");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `authentiq_import_template.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ── Location Analytics ────────────────────────────────────────────────────────

export async function getAdminPlans(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans`);
  if (!res.ok) throw new Error(`Failed to fetch plans: ${await res.text()}`);
  return res.json();
}

export async function createAdminPlan(data: any): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create plan: ${await res.text()}`);
  return res.json();
}

/** Admin: Delete a vendor with password verification */
export async function deleteVendor(vendorId: string, adminPassword: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor/${vendorId}`, {
    method: 'DELETE',
    body: JSON.stringify({ admin_password: adminPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete vendor');
  }
  return res.json();
}

/** Admin: Create a vendor with user credentials and plan assignment */
export async function createVendorFull(data: {
  name: string;
  email: string;
  password: string;
  company_name: string;
  plan_id?: string;
}): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/vendor/create-full`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create vendor');
  }
  return res.json();
}

export async function updateAdminPlan(planId: string, data: any): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans/${planId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update plan: ${await res.text()}`);
  return res.json();
}

export async function assignPlanToVendor(vendorId: string, planId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans/vendor/${vendorId}/assign?plan_id=${planId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to assign plan: ${await res.text()}`);
  return res.json();
}

/** Admin: List all vendor subscriptions with usage */
export async function getAdminVendorSubscriptions(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans/vendors`);
  if (!res.ok) throw new Error(`Failed to fetch vendor subscriptions: ${await res.text()}`);
  return res.json();
}

/** Admin: Get single vendor subscription detail */
export async function getAdminVendorPlan(vendorId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans/vendor/${vendorId}`);
  if (!res.ok) throw new Error(`Failed to fetch vendor plan: ${await res.text()}`);
  return res.json();
}

/** Admin: Update vendor subscription status (active | suspended | inactive | expired) */
export async function updateVendorSubscriptionStatus(
  vendorId: string,
  status: 'active' | 'suspended' | 'inactive' | 'expired'
): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans/vendor/${vendorId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update subscription status: ${await res.text()}`);
  return res.json();
}

/** Vendor: Get own plan details + feature flags (used by usePlan hook) */
export async function getMyPlan(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans/my-plan`);
  if (!res.ok) throw new Error(`Failed to fetch plan: ${await res.text()}`);
  return res.json();
}


// ── Location Analytics ────────────────────────────────────────────────────────

export interface LocationData {
  country: string;
  city: string;
  count: number;
}

export interface LocationResponse {
  locations: LocationData[];
}

/** Admin: Get Location Distribution */
export async function getAdminLocations(): Promise<LocationResponse> {
  const res = await authFetch(`${getApiBase()}/analytics/admin/locations`);
  if (!res.ok) throw new Error(`Failed to fetch admin locations: ${await res.text()}`);
  return res.json();
}

/** Vendor: Get Location Distribution */
export async function getVendorLocations(): Promise<LocationResponse> {
  const res = await authFetch(`${getApiBase()}/analytics/vendor/locations`);
  if (!res.ok) throw new Error(`Failed to fetch vendor locations: ${await res.text()}`);
  return res.json();
}

// ── Brand (Vendor-protected) ──────────────────────────────────────────────────

export interface BrandPayload {
  brand_name: string;
  brand_display_name?: string;
  brand_tagline?: string;
  product_categories?: string[];
}

export interface BrandUpdatePayload {
  brand_name?: string;
  brand_display_name?: string;
  brand_tagline?: string;
  product_categories?: string[];
  status?: 'active' | 'inactive';
}

/** Get all brands for the current vendor */
export async function getBrands(): Promise<{ brands: any[] }> {
  const res = await authFetch(`${getApiBase()}/vendor/brands`);
  if (!res.ok) throw new Error(`Failed to fetch brands: ${await res.text()}`);
  return res.json();
}

/** Create a new brand */
export async function createBrand(data: BrandPayload): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/brands`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create brand');
  }
  return res.json();
}

/** Get a single brand */
export async function getBrand(brandId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/brands/${brandId}`);
  if (!res.ok) throw new Error('Failed to fetch brand');
  return res.json();
}

/** Update a brand */
export async function updateBrand(brandId: string, data: BrandUpdatePayload): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/brands/${brandId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update brand');
  }
  return res.json();
}

/** Delete a brand (optional hard delete) */
export async function deleteBrand(brandId: string, hard = false): Promise<any> {
  const url = `${getApiBase()}/vendor/brands/${brandId}${hard ? '?hard=true' : ''}`;
  const res = await authFetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete brand');
  }
  return res.json();
}

/** Upload or replace brand logo */
export async function uploadBrandLogo(brandId: string, file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);
  const res = await authFetch(`${getApiBase()}/vendor/brands/${brandId}/logo`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Failed to upload brand logo');
  return res.json();
}

/** Remove brand logo */
export async function deleteBrandLogo(brandId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/brands/${brandId}/logo`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove brand logo');
  return res.json();
}

// ── Company Details (Vendor-protected) ────────────────────────────────────────

export interface CompanyDetailsPayload {
  legal_company_name?: string;
  company_type?: 'Pvt Ltd' | 'LLP' | 'Proprietorship' | 'Partnership' | 'Public Ltd';
  gstin?: string;
  pan?: string;
  cin?: string;
  reg_address_line1?: string;
  reg_address_line2?: string;
  reg_city?: string;
  reg_state?: string;
  reg_pin?: string;
  reg_country?: string;
  industry_sector?: 'FMCG' | 'Pharma' | 'Agro' | 'Liquor' | 'Electronics' | 'Manufacturing' | 'Other';
  company_website?: string;
  contact_full_name?: string;
  contact_work_email?: string;
  contact_mobile?: string;
  contact_designation?: string;

  // Trademark Details
  tm_status?: string;
  tm_number?: string;
  tm_app_file?: string;
  tm_cert_file?: string;
  brand_auth_file?: string;

  // Verification Files
  gst_cert_file?: string;
  inc_doc_file?: string;
  pharma_drug_license_file?: string;
  fssai_license_file?: string;
  excise_license_file?: string;

  // Verification Statuses
  gst_cert_status?: string;
  inc_doc_status?: string;
  pharma_drug_license_status?: string;
  fssai_license_status?: string;
  excise_license_status?: string;
  tm_app_status?: string;
  tm_cert_status?: string;
  brand_auth_status?: string;
}

/** Get company/legal entity details for the current vendor */
export async function getCompanyDetails(): Promise<CompanyDetailsPayload> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/company`);
  if (!res.ok) throw new Error('Failed to fetch company details');
  return res.json();
}

/** Save company/legal entity details (GSTIN/PAN validated server-side) */
export async function updateCompanyDetails(data: CompanyDetailsPayload): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/profile/company`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to save company details');
  }
  return res.json();
}

/** Get products filtered by brand */
export async function getProductsByBrand(brandId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/product/list?brand_id=${encodeURIComponent(brandId)}`);
  if (!res.ok) throw new Error('Failed to fetch products for brand');
  return res.json();
}

// ── Team Management ─────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Administrator' | 'Manager' | 'Viewer' | 'vendor' | 'admin';
  status: string;
  created_at: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: 'Administrator' | 'Manager' | 'Viewer';
  invited_by: string;
  invited_by_role?: string;
  status: string;
  created_at: string;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const res = await authFetch(`${getApiBase()}/vendor/team/members`);
  if (!res.ok) throw new Error('Failed to fetch team members');
  return res.json();
}

export async function inviteTeamMember(email: string, role: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/team/invite`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to invite team member');
  }
  return res.json();
}

export async function removeTeamMember(userId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/team/users/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to remove team member');
  }
  return res.json();
}

export async function updateTeamMemberRole(userId: string, role: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/team/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update team member role');
  }
  return res.json();
}

export async function getPendingTeamInvitations(): Promise<TeamInvitation[]> {
  const res = await authFetch(`${getApiBase()}/vendor/team/invitations`);
  if (!res.ok) throw new Error('Failed to fetch pending invitations');
  return res.json();
}

export async function cancelTeamInvitation(invitationId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/team/invitations/${invitationId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to cancel invitation');
  }
  return res.json();
}

/** Accept a workspace invitation (public) */
export async function acceptTeamInvitation(token: string, name: string, password: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/auth/invitation/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to accept invitation');
  }
  return res.json();
}
// ── Plans Management ─────────────────────────────────────────────────────────

/** Vendor: Renew My Plan */
export async function renewMyPlan(): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans/my-plan/renew`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to renew plan');
  }
  return res.json();
}

/** Vendor: Change My Plan */
export async function changeMyPlan(planId: string): Promise<any> {
  const res = await authFetch(`${getApiBase()}/admin/plans/my-plan/change`, {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to change plan');
  }
  return res.json();
}

/** Generate bulk QR codes for a product (50 QRs) */
export async function generateBulkQR(productId: string, count: number = 50): Promise<any> {
  const res = await authFetch(`${getApiBase()}/qr/generate-bulk`, {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, count }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to generate bulk QRs');
  }
  return res.json();
}

/** Export product QR codes to CSV */
export async function exportProductQRs(productId: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}/qr/${productId}/export-qrs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to export product QR codes");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `product_qrs_${productId.substring(0, 8)}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}


/** Manually create a new team member (Administrator only) */
export async function createTeamMemberManual(data: any): Promise<any> {
  const res = await authFetch(`${getApiBase()}/vendor/team/create-member`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create team member manually');
  }
  return res.json();
}

