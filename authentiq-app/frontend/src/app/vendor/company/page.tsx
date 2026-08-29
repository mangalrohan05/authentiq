'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CompanyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/vendor/profile');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-600 animate-spin" />
    </div>
  );
}
