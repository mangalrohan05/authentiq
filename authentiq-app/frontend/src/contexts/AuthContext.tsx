'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '@/lib/apiBase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id?: string;
  email: string;
  name: string;
  role: 'admin' | 'vendor' | 'Administrator' | 'Manager' | 'Viewer';
  plan?: any;
  vendor_id?: string;
  verification_status?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, expectedRole?: 'admin' | 'vendor') => Promise<void>;
  logout: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStorageKeys() {
  const isAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  return {
    TOKEN_KEY: isAdmin ? 'authentiq_admin_token' : 'authentiq_vendor_token',
    USER_KEY: isAdmin ? 'authentiq_admin_user' : 'authentiq_vendor_user',
    ROLE_KEY: isAdmin ? 'authentiq_admin_role' : 'authentiq_vendor_role',
  };
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restore session from localStorage or cookies on mount & sync dynamically with MongoDB
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { TOKEN_KEY, USER_KEY, ROLE_KEY } = getStorageKeys();
        let storedToken = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);

        // Fallback to cookies if localStorage is empty but cookies exist
        if (!storedToken) {
          storedToken = getCookie(TOKEN_KEY);
        }

        let parsedUser: AuthUser | null = null;
        if (storedUser) {
          try {
            parsedUser = JSON.parse(storedUser);
          } catch {
            parsedUser = null;
          }
        } else if (storedToken) {
          const cookieRole = getCookie(ROLE_KEY) as 'admin' | 'vendor' | null;
          if (cookieRole) {
            parsedUser = {
              email: '',
              name: '',
              role: cookieRole,
            };
          }
        }

        if (storedToken && parsedUser) {
          setToken(storedToken);
          setUser(parsedUser);

          // Sync restored state back to localStorage and cookies to maintain synchronization
          localStorage.setItem(TOKEN_KEY, storedToken);
          localStorage.setItem(USER_KEY, JSON.stringify(parsedUser));
          document.cookie = `${TOKEN_KEY}=${storedToken}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
          document.cookie = `${ROLE_KEY}=${parsedUser.role}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;

          // Background validation query to auth/me to dynamically sync the vendor plan
          const res = await fetch(`${getApiBase()}/auth/me`, {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          if (res.ok) {
            const freshUser = await res.json();
            const authUser: AuthUser = {
              email: freshUser.email,
              name: freshUser.name,
              role: freshUser.role,
              plan: freshUser.plan,
              vendor_id: freshUser.vendor_id,
              verification_status: freshUser.verification_status,
            };
            localStorage.setItem(USER_KEY, JSON.stringify(authUser));
            document.cookie = `${ROLE_KEY}=${freshUser.role}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
            // STABILITY FIX: Only call setUser if the data actually changed.
            // Calling setUser with a new object reference (even with identical data) causes
            // all useEffect hooks that depend on `user` to re-fire, creating render storms.
            setUser(prev => {
              if (prev && JSON.stringify(prev) === JSON.stringify(authUser)) return prev;
              return authUser;
            });
          } else if (res.status === 401) {
            // Purge invalid/expired session
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            document.cookie = `${ROLE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            setToken(null);
            setUser(null);
          }
        }
      } catch (err) {
        console.warn('[AuthContext] Session synchronization failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  // Listen for session-expired events dispatched by the API layer (from 401 responses).
  // This avoids the hard window.location.href reload that was causing an infinite loop:
  // api 401 → hard reload → proxy redirects /login→/vendor/login → AuthContext
  // re-runs restoreSession → another 401 → loop.
  useEffect(() => {
    const handleSessionExpired = () => {
      // Determine login redirection based on the current page path, since state/cookies
      // may have already been cleared when this event is fired.
      const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      
      setToken(null);
      setUser(null);
      
      if (isAdminPath) {
        router.replace('/admin/login');
      } else {
        router.replace('/vendor/login');
      }
    };
    window.addEventListener('authentiq:session-expired', handleSessionExpired);
    return () => window.removeEventListener('authentiq:session-expired', handleSessionExpired);
  }, [router]);

  // Keep cookies in sync with unauthenticated client state
  useEffect(() => {
    if (!isLoading && !token) {
      const { TOKEN_KEY, ROLE_KEY } = getStorageKeys();
      document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      document.cookie = `${ROLE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  }, [isLoading, token]);

  /**
   * Login: POST /auth/login → store token + user → redirect by role
   */
  const login = useCallback(async (email: string, password: string, expectedRole?: 'admin' | 'vendor') => {
    const res = await fetch(`${getApiBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || 'Login failed. Check your credentials.');
    }

    const data = await res.json();
    
    // ROLE VALIDATION
    if (expectedRole) {
      if (expectedRole === 'vendor') {
        const isVendorRole = ['vendor', 'Administrator', 'Manager', 'Viewer'].includes(data.role);
        if (!isVendorRole) {
          throw new Error('Access denied. This portal is strictly for vendors.');
        }
      } else if (data.role !== expectedRole) {
        throw new Error(`Access denied. This portal is strictly for ${expectedRole}s.`);
      }
    }
    const authUser: AuthUser = {
      email: data.email,
      name: data.name,
      role: data.role,
      plan: data.plan,
      vendor_id: data.vendor_id,
      verification_status: data.verification_status,
    };

    const { TOKEN_KEY, USER_KEY, ROLE_KEY } = getStorageKeys();

    // Persist to localStorage
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));

    // Also set a cookie for proxy access (Next.js proxy cannot see localStorage)
    document.cookie = `${TOKEN_KEY}=${data.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
    document.cookie = `${ROLE_KEY}=${data.role}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;

    setToken(data.access_token);
    setUser(authUser);

    // Route by role
    if (data.role === 'admin') {
      router.replace('/admin');
    } else {
      router.replace('/vendor');
    }
  }, [router]);

  /**
   * Logout: clear storage + state → redirect to /login
   */
  const logout = useCallback(() => {
    const { TOKEN_KEY, USER_KEY, ROLE_KEY } = getStorageKeys();
    const currentRole = user?.role || getCookie(ROLE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    // Clear cookies
    document.cookie = `${TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = `${ROLE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;

    setToken(null);
    setUser(null);
    if (currentRole === 'admin') {
      router.replace('/admin/login');
    } else {
      router.replace('/vendor/login');
    }
  }, [router, user?.role]);

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

// ── Token helper (for api.ts) ─────────────────────────────────────────────────

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  const { TOKEN_KEY } = getStorageKeys();
  return localStorage.getItem(TOKEN_KEY);
}
