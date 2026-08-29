'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import VendorSidebar from '@/components/vendor/VendorSidebar';

export default function VendorShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    const VENDOR_ROLES = ['vendor', 'Administrator', 'Manager', 'Viewer'];
    if (!isLoading) {
      if (!isAuthenticated) router.replace('/vendor/login');
      else if (!user?.role || !VENDOR_ROLES.includes(user.role)) router.replace('/admin');
    }
  }, [isAuthenticated, isLoading, user?.role, router]);

  const VENDOR_ROLES = ['vendor', 'Administrator', 'Manager', 'Viewer'];
  const isVendor = user?.role && VENDOR_ROLES.includes(user.role);

  if (isLoading || !isAuthenticated || !isVendor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row relative">
      <VendorSidebar />
      <div className="flex-1 md:ml-56 p-6 md:p-10 relative min-h-screen w-full">{children}</div>
    </div>
  );
}
