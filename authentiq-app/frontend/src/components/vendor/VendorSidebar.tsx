'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePlan } from '@/hooks/usePlan';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';

export type VendorTabId =
  | 'dashboard'
  | 'products'
  | 'activity'
  | 'notifications'
  | 'analytics'
  | 'import-export'
  | 'team';

interface VendorSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: VendorTabId) => void;
  unreadCount?: number;
}

export function navigateToVendorTab(router: ReturnType<typeof useRouter>, tab: VendorTabId) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('vendor_active_tab', tab);
  }
  router.push('/vendor');
}

export default function VendorSidebar({ activeTab, onTabChange, unreadCount }: VendorSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { plan, hasFeature } = usePlan();
  const { brands, activeBrand, activeBrandId, setActiveBrand } = useBrand();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const isProfile = pathname.startsWith('/vendor/profile');
  const isPlan = pathname.startsWith('/vendor/plan');
  const isBrands = pathname.startsWith('/vendor/brands');
  const isCompany = pathname.startsWith('/vendor/company');
  const onVendorHome = pathname === '/vendor';

  const getTabClass = (id: string) => {
    const base =
      'flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all cursor-pointer ';
    const active = onVendorHome && activeTab === id;
    return active
      ? base + 'bg-gray-200 text-gray-900 font-semibold'
      : base + 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium';
  };

  const getLinkClass = (isActive: boolean) =>
    'flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all cursor-pointer ' +
    (isActive
      ? 'bg-gray-200 text-gray-900 font-semibold'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium');

  const handleTab = (id: VendorTabId) => {
    if (onTabChange) {
      onTabChange(id);
      window.scrollTo(0, 0);
    } else {
      navigateToVendorTab(router, id);
    }
  };

  const handleBrandSelect = (id: string) => {
    setActiveBrand(id);
    setSwitcherOpen(false);

    // Set tab to dashboard in sessionStorage so it defaults back to dashboard
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('vendor_active_tab', 'dashboard');
    }

    if (onTabChange) {
      onTabChange('dashboard');
    }

    if (pathname !== '/vendor') {
      router.push('/vendor');
    }
  };

  const activeBrands = brands.filter((b) => b.status === 'active');

  const { user } = useAuth();
  const role = user?.role;
  const isViewer = role === 'Viewer';
  const isManager = role === 'Manager';
  const isAdmin = role === 'Administrator' || role === 'vendor' || role === 'admin';

  return (
    <aside className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-gray-200 flex flex-col md:fixed md:inset-y-0 z-10">
      {/* Logo */}
      <div className="pt-2 pb-3 px-5 flex flex-col items-start border-b border-gray-100 flex-shrink-0">
        <Link href="/vendor" className="block hover:opacity-90 transition-opacity mb-2 ml-[-14px]">
          <img src="/authentiq_logo.png" alt="Authentiq Logo" className="w-full max-w-[180px] h-auto" />
        </Link>
        <p className="text-[8px] text-gray-400 font-bold uppercase tracking-[0.2em] text-left mt-1">
          Vendor Control Panel
        </p>
      </div>

      {/* Brand Switcher - Hide for Viewers */}
      {!isViewer && (
        <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0 relative">
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 px-1">
            Active Brand
          </p>
          <button
            type="button"
            onClick={() => setSwitcherOpen((o) => !o)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-indigo-300 transition-all text-sm cursor-pointer"
          >
            {activeBrandId === 'all' ? (
              <span className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </span>
            ) : activeBrand?.brand_logo_url ? (
              <img
                src={activeBrand.brand_logo_url}
                alt={activeBrand.brand_name}
                className="w-6 h-6 rounded object-cover flex-shrink-0"
              />
            ) : (
              <span className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </span>
            )}
            <span className="flex-1 text-left truncate font-medium text-gray-800">
              {activeBrandId === 'all' ? 'All Products' : (activeBrand?.brand_name ?? (activeBrands.length === 0 ? 'No brands yet' : 'Select brand'))}
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${switcherOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {switcherOpen && (
            <div className="absolute left-3 right-3 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 max-h-52 overflow-y-auto">
              {/* All Products Option */}
              <button
                type="button"
                onClick={() => handleBrandSelect('all')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors cursor-pointer ${activeBrandId === 'all' ? 'text-indigo-700 font-semibold' : 'text-gray-700'}`}
              >
                <span className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </span>
                <span className="truncate">All Products</span>
                {activeBrandId === 'all' && (
                  <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <hr className="my-1 border-gray-100" />

              {activeBrands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleBrandSelect(b.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors cursor-pointer ${b.id === activeBrand?.id ? 'text-indigo-700 font-semibold' : 'text-gray-700'}`}
                >
                  {b.brand_logo_url ? (
                    <img src={b.brand_logo_url} alt={b.brand_name} className="w-5 h-5 rounded object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-5 h-5 rounded bg-indigo-100 flex-shrink-0" />
                  )}
                  <span className="truncate">{b.brand_name}</span>
                  {b.id === activeBrand?.id && (
                    <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
              <hr className="my-1 border-gray-100" />
              <Link
                href="/vendor/brands"
                onClick={() => setSwitcherOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 font-medium transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Manage Brands
              </Link>
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto pb-4 pt-3">
        <button type="button" onClick={() => handleTab('dashboard')} className={getTabClass('dashboard')}>
          <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Dashboard
        </button>

        {!isViewer && (
          <Link href="/vendor/brands" className={getLinkClass(isBrands)}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Brands
          </Link>
        )}

        {/* Products - visible to all roles, but read-only for Viewers */}
        <button type="button" onClick={() => handleTab('products')} className={getTabClass('products')}>
          <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L21 7v10l-9 5-9-5V7l9-5zm0 10V22m0-10L3 7m9 5l9-5" />
          </svg>
          Products
        </button>


        {!isViewer && (
          <button type="button" onClick={() => handleTab('activity')} className={getTabClass('activity')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Logs
          </button>
        )}

        <button type="button" onClick={() => handleTab('notifications')} className={getTabClass('notifications') + " relative"}>
          <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span>Notifications</span>
          {unreadCount !== undefined && unreadCount > 0 && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <button type="button" onClick={() => handleTab('analytics')} className={getTabClass('analytics')}>
          <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="flex items-center justify-between w-full">
            <span>Analytics</span>
            {!hasFeature('telemetry') && (
              <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full uppercase">
                Pro
              </span>
            )}
          </span>
        </button>

        {!isViewer && (
          <button type="button" onClick={() => handleTab('import-export')} className={getTabClass('import-export')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="flex items-center justify-between w-full">
              <span>Data Sync</span>
              {plan?.plan_name === 'Free Trial' && (
                <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full uppercase">
                  Pro
                </span>
              )}
            </span>
          </button>
        )}

        {/* Team Members Tab - visible to Admin & Manager */}
        {!isViewer && (
          <button type="button" onClick={() => handleTab('team')} className={getTabClass('team')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="flex items-center justify-between w-full">
              <span>Team Members</span>
              {plan?.plan_name !== 'Enterprise' && (
                <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full uppercase">
                  Enterprise
                </span>
              )}
            </span>
          </button>
        )}



        <Link href="/vendor/profile" className={getLinkClass(isProfile)}>
          <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Profile
        </Link>
      </nav>



      {/* Plan / Billing section - Admin only */}
      {isAdmin && (
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <Link
            href="/vendor/plan"
            className={`block p-3.5 rounded-xl border transition-all duration-200 group cursor-pointer ${
              isPlan
                ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-100 shadow-sm'
                : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100 hover:border-indigo-500/30 shadow-sm hover:shadow'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
                isPlan ? 'text-indigo-600' : 'text-gray-400 group-hover:text-indigo-600'
              }`}>
                Plan
              </span>
              <svg
                className={`w-3.5 h-3.5 transition-colors ${isPlan ? 'text-indigo-500' : 'text-gray-400 group-hover:text-indigo-500'}`}
                fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className={`text-xs font-black mt-1 ${isPlan ? 'text-indigo-900' : 'text-slate-800'}`}>
              {plan?.plan_name || 'Free Trial'} · {plan?.subscription_status || 'active'}
            </p>
          </Link>
        </div>
      )}
    </aside>
  );
}
