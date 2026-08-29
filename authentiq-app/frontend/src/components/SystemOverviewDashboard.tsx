import React, { useState } from 'react';

export default function SystemOverviewDashboard() {
  // Mock data representing your exact product metrics
  const metrics = {
    totalProducts: 7,
    maxProducts: 1000,
    verificationScans: 30,
    securityEvents: 10
  };

  const [searchTerm, setSearchTerm] = useState('');

  const productAnalyticsList = [
    { id: "TRACK-KODAK-AUKA", subtitle: "Kodak Printer", scans: 1, status: "Active" },
    { id: "TRACK-JUJ7-WKNF", subtitle: "Juj7", scans: 0, status: "Pending" },
    { id: "TRACK-EGQG-ASC8", subtitle: "Eggq Ge", scans: 1, status: "Active" },
  ];

  // Filter list based on search term
  const filteredProducts = productAnalyticsList.filter(item => 
    item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.subtitle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const percentageUsed = (metrics.totalProducts / metrics.maxProducts) * 100;

  return (
    <div className="w-full min-h-screen bg-slate-50/30 p-8 text-slate-700 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* ================= HEADER SECTION ================= */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Overview</h1>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Product-centric authenticity tracking and telemetry at a glance.</p>
        </div>
      </div>

      {/* ================= TOP METRICS CARDS (Adjusted to 3 Columns) ================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* Card 1: Total Products */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">TOTAL PRODUCTS</span>
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L21 7v10l-9 5-9-5V7l9-5zm0 10V22m0-10L3 7m9 5l9-5" />
                </svg>
              </span>
            </div>
            <span className="text-3xl font-extrabold text-slate-900 block mt-2 tracking-tight">
              7 <span className="text-lg font-semibold text-slate-400">/ 1000</span>
            </span>
          </div>
          
          <div className="relative z-10 mt-4">
            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2.5 overflow-hidden">
              <div 
                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${percentageUsed}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <span>Quota Used</span>
              <span className="text-indigo-600">{percentageUsed.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Card 2: Verification Scans */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">VERIFICATION SCANS</span>
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </span>
            </div>
            <span className="text-3xl font-extrabold text-slate-900 block mt-2 tracking-tight">{metrics.verificationScans}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[11px] font-bold relative z-10">
            <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md">↑ Active Telemetry</span>
            <span className="text-slate-400 font-medium">Across all QRs</span>
          </div>
        </div>

        {/* Card 3: Security Events */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">SECURITY EVENTS</span>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
            </div>
            <span className="text-3xl font-extrabold text-slate-900 block mt-2 tracking-tight">{metrics.securityEvents}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[11px] font-bold relative z-10">
            <span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md animate-pulse">! Action Required</span>
            <span className="text-slate-400 font-medium">Anomaly flags</span>
          </div>
        </div>

      </div>

      {/* ================= LOWER CONTENT LAYOUT SPLIT ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Quick Actions Block (Spans 5 Columns) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Quick Actions</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Action Item 1: Add Product */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-indigo-500/30 transition-all duration-300 cursor-pointer flex flex-col gap-3 group">
              <div className="h-9 w-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-lg group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                +
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm tracking-tight group-hover:text-indigo-600 transition-colors duration-300">Add Product</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Register a new product</p>
              </div>
            </div>

            {/* Action Item 2: Product Registry */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md hover:border-indigo-500/30 transition-all duration-300 cursor-pointer flex flex-col gap-3 group">
              <div className="h-9 w-9 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L21 7v10l-9 5-9-5V7l9-5zm0 10V22m0-10L3 7m9 5l9-5" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm tracking-tight group-hover:text-indigo-600 transition-colors duration-300">Product Registry</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Manage product QR cards</p>
              </div>
            </div>

          </div>

          {/* Secondary Action Badge */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 rounded-2xl text-white shadow-md flex items-center justify-between mt-1">
            <div>
              <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">Security Shield Active</span>
              <span className="text-xs font-semibold mt-1 block text-slate-200">Real-time scan verification is live</span>
            </div>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
          </div>

        </div>

        {/* Right Side: Product Analytics Tracking Card (Spans 7 Columns) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Product Analytics</h2>
            
            {/* Search Input Filter */}
            <div className="relative">
              <input 
                type="text"
                placeholder="Search catalog..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full sm:w-48 transition-all"
              />
              <span className="absolute left-2.5 top-2.5 text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 flex flex-col gap-5">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((item, idx) => (
                <div 
                  key={idx} 
                  className="flex justify-between items-center pb-4 last:pb-0 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 rounded-lg p-2 -mx-2 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 font-semibold text-[10px]">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm tracking-tight">{item.id}</h4>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {item.status}
                    </span>
                    <div className="text-right min-w-[50px]">
                      <span className="block font-bold text-slate-900 text-sm">{item.scans}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Scans</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-slate-400 font-medium">No matching products found.</p>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
