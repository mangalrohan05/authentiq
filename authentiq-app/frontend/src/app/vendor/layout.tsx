'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import VendorShell from '@/components/vendor/VendorShell';
import { BrandProvider } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (user?.verification_status === 'pending') {
        if (pathname !== '/vendor/initial-setup') {
          router.replace('/vendor/initial-setup');
        }
      } else {
        if (pathname === '/vendor/initial-setup') {
          router.replace('/vendor');
        }
      }
    }
  }, [isLoading, isAuthenticated, user?.verification_status, pathname, router]);

  if (pathname === '/vendor/login' || pathname.startsWith('/vendor/reset-password')) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-[#00b074] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest animate-pulse">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // If pending, only render the onboarding screen (children)
  if (user?.verification_status === 'pending') {
    return <>{children}</>;
  }

  // Main portal renders its own sidebar + tabs but still needs brand context
  if (pathname === '/vendor') {
    return <BrandProvider>{children}</BrandProvider>;
  }

  return (
    <BrandProvider>
      <VendorShell>{children}</VendorShell>
    </BrandProvider>
  );
}
