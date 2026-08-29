import React from 'react';
import { type VendorTabId } from './VendorSidebar';

interface Product {
  id: string;
  name: string;
  brand: string;
  sku?: string;
  category?: string;
  description?: string;
  serial_number?: string;
  timestamp: string;
  batch_count?: number;
  reference_images?: any[];
  qr_id?: string;
  scan_count?: number;
}

interface DashboardTabProps {
  overview: {
    total_batches: number;
    total_products: number;
    total_scans: number;
    suspicious_scans: number;
  };
  products: Product[];
  plan: any;
  teamCount: number;
  pendingInviteCount: number;
  totalScansCount: number;
  isInfiniteUsers: boolean;
  maxUsers: number;
  isInfiniteBrands: boolean;
  maxBrands: number;
  brands: any[];
  openProductDrawer: () => void;
  setActiveTab: (tab: VendorTabId) => void;
}

export default function DashboardTab({
  overview,
  products,
  plan,
  teamCount,
  pendingInviteCount,
  totalScansCount,
  isInfiniteUsers,
  maxUsers,
  isInfiniteBrands,
  maxBrands,
  brands,
  openProductDrawer,
  setActiveTab,
}: DashboardTabProps) {
  const maxProducts = plan?.limits?.max_products || 1000;
  const isInfiniteProducts = maxProducts === '∞' || maxProducts === -1;
  const maxProductsNum = isInfiniteProducts ? 1000 : Number(maxProducts);
  const percentageUsed = isInfiniteProducts ? 0 : Math.min((products.length / maxProductsNum) * 100, 100);

  const maxBrandsLimit = plan?.limits?.max_brands || 1;
  const isInfiniteBrandsLimit = maxBrandsLimit === -1;
  const maxBrandsNum = isInfiniteBrandsLimit ? 1 : Number(maxBrandsLimit);
  const brandsUsed = brands.length;
  const brandsPercentage = isInfiniteBrandsLimit ? 0 : Math.min((brandsUsed / maxBrandsNum) * 100, 100);

  const maxUsersNum = isInfiniteUsers ? 1 : Number(maxUsers);
  const usersUsed = teamCount + pendingInviteCount;
  const usersPercentage = isInfiniteUsers ? 0 : Math.min((usersUsed / maxUsersNum) * 100, 100);

  const totalScans = products.reduce((acc, p) => acc + (p.scan_count || 0), 0);
  const suspiciousScans = overview.suspicious_scans || 0;

  const maxScans = plan?.limits?.max_scans_per_month || 250;
  const isInfiniteScans = maxScans === -1;
  const maxScansNum = isInfiniteScans ? 250 : Number(maxScans);
  const scansPercentage = isInfiniteScans ? 0 : Math.min((totalScansCount / maxScansNum) * 100, 100);

  const dashboardProducts = products.map((product) => {
    return {
      id: product.sku && product.sku !== '—' ? product.sku : `TRACK-${product.id.substring(0, 8).toUpperCase()}`,
      subtitle: product.name,
      scans: product.scan_count || 0,
      status: product.qr_id ? 'Active' : 'Pending',
    };
  });

  const sortedDashboardProducts = dashboardProducts.sort((a, b) => b.scans - a.scans);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ================= HEADER SECTION ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">System Overview</h2>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-sm font-medium text-gray-500">Product-centric authenticity tracking and telemetry at a glance.</p>
        </div>
      </div>

      {/* ================= TOP METRICS CARDS ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Brands Limit */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Brands Limit</span>
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </span>
            </div>
            <span className="text-3xl font-extrabold text-gray-900 block mt-2 tracking-tight">
              {brandsUsed} <span className="text-lg font-semibold text-gray-400">/ {isInfiniteBrandsLimit ? '∞' : maxBrandsLimit}</span>
            </span>
          </div>
          <div className="relative z-10 mt-4">
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${brandsPercentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400">
              <span>Brands Used</span>
              <span className="text-indigo-600">{brandsPercentage.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Card 2: Verification Scans */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">VERIFICATION SCANS</span>
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </span>
            </div>
            <span className="text-3xl font-extrabold text-gray-900 block mt-2 tracking-tight">{totalScans}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[11px] font-bold relative z-10">
            <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md">↑ Active Telemetry</span>
            <span className="text-gray-400 font-medium">Across all QRs</span>
          </div>
        </div>

        {/* Card 3: Security Events */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">SECURITY EVENTS</span>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
            </div>
            <span className="text-3xl font-extrabold text-gray-900 block mt-2 tracking-tight">{suspiciousScans}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[11px] font-bold relative z-10">
            <span className={`${suspiciousScans > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-amber-50 text-amber-600'} px-2 py-0.5 rounded-md`}>
              {suspiciousScans > 0 ? '! Attention Needed' : '✓ Safe'}
            </span>
            <span className="text-gray-400 font-medium">Anomaly flags</span>
          </div>
        </div>
      </div>

      {/* ================= PLAN RESOURCE UTILIZATION ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card A: Total Products */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/40 rounded-full blur-xl -mr-6 -mt-6 group-hover:bg-indigo-50 transition-colors duration-300" />
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Products</span>
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L21 7v10l-9 5-9-5V7l9-5zm0 10V22m0-10L3 7m9 5l9-5" />
                </svg>
              </span>
            </div>
            <span className="text-3xl font-extrabold text-gray-900 block mt-2 tracking-tight">
              {products.length} <span className="text-lg font-semibold text-gray-400">/ {isInfiniteProducts ? '∞' : (plan?.limits?.max_products || '1000')}</span>
            </span>
          </div>
          <div className="relative z-10 mt-4">
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${percentageUsed}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400">
              <span>Quota Used</span>
              <span className="text-indigo-600">{percentageUsed.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* API Calls / Scans Card */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-50/40 rounded-full blur-xl -mr-6 -mt-6 group-hover:bg-sky-50 transition-colors duration-300" />
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Monthly Scans Limit</span>
              <span className="p-2 bg-sky-50 text-sky-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
            </div>
            <span className="text-3xl font-extrabold text-gray-900 block mt-2 tracking-tight">
              {totalScansCount} <span className="text-lg font-semibold text-gray-400">/ {isInfiniteScans ? '∞' : maxScans}</span>
            </span>
          </div>
          <div className="relative z-10 mt-4">
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2.5 overflow-hidden">
              <div className="bg-sky-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${scansPercentage}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400">
              <span>Scans Used</span>
              <span className="text-sky-600">{scansPercentage.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= LOWER CONTENT LAYOUT SPLIT ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Quick Actions Block (Spans 5 Columns) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Quick Actions</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Action Item 1: Add Product */}
            <div
              onClick={openProductDrawer}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs hover:shadow-md hover:border-indigo-500/30 transition-all duration-300 cursor-pointer flex flex-col gap-3 group"
            >
              <div className="h-9 w-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-lg group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                +
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm tracking-tight group-hover:text-indigo-600 transition-colors duration-300">Add Product</h4>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Register a new product</p>
              </div>
            </div>

            {/* Action Item 2: Product Registry */}
            <div
              onClick={() => setActiveTab('products')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs hover:shadow-md hover:border-indigo-500/30 transition-all duration-300 cursor-pointer flex flex-col gap-3 group"
            >
              <div className="h-9 w-9 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L21 7v10l-9 5-9-5V7l9-5zm0 10V22m0-10L3 7m9 5l9-5" />
                </svg>
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm tracking-tight group-hover:text-indigo-600 transition-colors duration-300">Product Registry</h4>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Manage product QR cards</p>
              </div>
            </div>

          </div>
        </div>

        {/* Right Side: Product Analytics Tracking Card (Spans 7 Columns) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Product Analytics</h3>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 flex flex-col gap-5">
            {sortedDashboardProducts.length > 0 ? (
              sortedDashboardProducts.slice(0, 5).map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center pb-4 last:pb-0 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 rounded-lg p-2 -mx-2 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 font-semibold text-[10px]">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-900 text-sm tracking-tight truncate max-w-[150px] sm:max-w-none">{item.subtitle}</h4>
                      <p className="text-xs text-gray-400 font-medium mt-0.5 truncate max-w-[150px] sm:max-w-none">{item.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {item.status}
                    </span>
                    <div className="text-right min-w-[50px]">
                      <span className="block font-bold text-gray-900 text-sm">{item.scans}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Scans</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400 font-medium">No products registered yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
