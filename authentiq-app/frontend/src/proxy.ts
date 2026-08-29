import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Proxy for Authentiq
 * Handles route protection and role-based redirects.
 * 
 * Note: Proxy only has access to cookies, not localStorage.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname.startsWith('/admin');
  const tokenKey = isAdminPath ? 'authentiq_admin_token' : 'authentiq_vendor_token';
  const roleKey = isAdminPath ? 'authentiq_admin_role' : 'authentiq_vendor_role';
  const token = request.cookies.get(tokenKey)?.value;
  const role = request.cookies.get(roleKey)?.value;

  // 1. PUBLIC ASSETS & VERIFY
  if (
    pathname.startsWith('/verify') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname === '/' ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp')
  ) {
    return NextResponse.next();
  }

  // 2. LEGACY LOGIN REDIRECT
  if (pathname === '/login' || pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/vendor/login', request.url));
  }

  // Public vendor auth flows (no session required)
  if (pathname.startsWith('/vendor/reset-password')) {
    return NextResponse.next();
  }

  // 3. LOGIN ROUTES (Redirect if already authenticated)
  const VENDOR_ROLES = ['vendor', 'Administrator', 'Manager', 'Viewer'];

  if (pathname.startsWith('/vendor/login') || pathname.startsWith('/admin/login')) {
    if (token && role) {
      if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url));
      if (VENDOR_ROLES.includes(role)) return NextResponse.redirect(new URL('/vendor', request.url));
    }
    return NextResponse.next();
  }

  // 4. AUTHENTICATION CHECK
  if (!token) {
    // Route to appropriate login screen
    const loginPath = pathname.startsWith('/admin') ? '/admin/login' : '/vendor/login';
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  // 5. ROLE-BASED ACCESS CONTROL (RBAC)
  
  // Admin routes
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin') {
      // If a vendor tries to access /admin, send them to /vendor
      return NextResponse.redirect(new URL('/vendor', request.url));
    }
  }

  // Vendor routes
  if (pathname.startsWith('/vendor')) {
    const isVendor = VENDOR_ROLES.includes(role || '');
    if (!isVendor && role !== 'admin') {
      // If an unauthorized role tries to access /vendor
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.redirect(new URL('/vendor/login', request.url));
    }
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
