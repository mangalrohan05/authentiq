'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { forgotPassword } from '@/services/api';

export interface LoginFormProps {
  title: string;
  subtitle: string;
  expectedRole: 'admin' | 'vendor';
  theme: {
    gradientFrom: string;
    gradientTo: string;
    buttonHoverFrom: string;
    buttonHoverTo: string;
    shadowColor: string;
    ringColor: string;
    bgColor1: string;
    bgColor2: string;
  };
}

export default function LoginForm({ title, subtitle, expectedRole, theme }: LoginFormProps) {
  const { login, isLoading, isAuthenticated, user } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.role === 'admin') {
        router.replace('/admin');
      } else {
        router.replace('/vendor');
      }
    }
  }, [isAuthenticated, isLoading, user, router]);

  // Pre-fill email from query parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qEmail = params.get('email');
      if (qEmail && !email && !isAuthenticated && !isLoading) {
        setEmail(qEmail);
      }
    }
  }, [email, isAuthenticated, isLoading]);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email.trim(), password, expectedRole);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className={`w-8 h-8 rounded-full border-2 border-t-transparent animate-spin ${theme.ringColor.replace('focus:ring-', 'border-').replace('/50', '')}`} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className={`absolute top-[-20%] left-[30%] w-[600px] h-[600px] rounded-full blur-[120px] ${theme.bgColor1}`} />
        <div className={`absolute bottom-[-10%] right-[20%] w-[400px] h-[400px] rounded-full blur-[100px] ${theme.bgColor2}`} />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-10 flex flex-col items-center">
          <img src="/authentiq_logo_dark.png" alt="Authentiq Logo" className="w-full max-w-[210px] h-auto mb-4" />
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2">
            <span className="text-indigo-400">Verify Instantly.</span>{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent animate-text-shine">Trust Absolutely.</span>
          </p>
          <p className="text-xs text-zinc-500 font-medium">Secure Product Authentication Platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
          <div className="mb-7">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-red-300 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@authentiq.com"
                className={`w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 ${theme.ringColor} transition-all`}
              />
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                  Password
                </label>
                {expectedRole === 'vendor' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgot(true);
                      setForgotEmail(email);
                      setForgotSent(false);
                    }}
                    className="text-[10px] font-semibold text-violet-400 hover:text-violet-300 uppercase tracking-wider"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 pr-12 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 ${theme.ringColor} transition-all`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full bg-gradient-to-r ${theme.gradientFrom} ${theme.gradientTo} hover:${theme.buttonHoverFrom} hover:${theme.buttonHoverTo} text-white font-semibold py-3 px-6 rounded-xl text-sm transition-all duration-200 shadow-lg ${theme.shadowColor} hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
          
          <div className="mt-6 pt-6 border-t border-white/[0.06]">
            <p className="text-xs text-zinc-600 text-center font-medium">
              Secure {expectedRole === 'admin' ? 'Administrative' : 'Vendor'} Access Portal
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-700 mt-6 font-medium">
          © {new Date().getFullYear()} Authentiq · Secure Chain Registry
        </p>
      </div>

      {showForgot && expectedRole === 'vendor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#12121a] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Reset password</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Enter your vendor email. If an account exists, we&apos;ll send reset instructions.
            </p>
            {forgotSent ? (
              <p className="mt-4 text-sm text-emerald-400/90">
                Check your inbox (and server logs in development) for the reset link.
              </p>
            ) : (
              <form
                className="mt-4 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setForgotLoading(true);
                  setError(null);
                  try {
                    await forgotPassword(forgotEmail.trim());
                    setForgotSent(true);
                  } catch {
                    setError('Could not send reset email. Try again later.');
                  } finally {
                    setForgotLoading(false);
                  }
                }}
              >
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white text-sm"
                  placeholder="you@brand.com"
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForgot(false)}
                    className="flex-1 py-2.5 border border-white/10 rounded-xl text-sm font-semibold text-zinc-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${theme.gradientFrom} ${theme.gradientTo} disabled:opacity-50`}
                  >
                    {forgotLoading ? 'Sending…' : 'Send link'}
                  </button>
                </div>
              </form>
            )}
            <button
              type="button"
              onClick={() => setShowForgot(false)}
              className="w-full mt-4 text-xs text-zinc-500 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
