/**
 * API base URL for browser and server.
 *
 * In the browser, defaults to same-origin `/api/backend` (Next.js rewrite → FastAPI)
 * so verification works on localhost, 127.0.0.1, and LAN IPs without CORS errors.
 *
 * Override with NEXT_PUBLIC_API_URL when the API is hosted elsewhere.
 */
export function getApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return '/api/backend';
  }
  const serverBackend = process.env.BACKEND_URL?.trim() || 'http://127.0.0.1:8000';
  return serverBackend.replace(/\/$/, '');
}
