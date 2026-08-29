import React from 'react';
import StatsCard from '@/components/StatsCard';
import LocationDistribution from '@/components/LocationDistribution';

interface AnalyticsTabProps {
  overview: {
    total_batches: number;
    total_products: number;
    total_scans: number;
    suspicious_scans: number;
  };
  securityAlerts: any[];
  scans: any[];
  trends: any[];
  hasFeature: (featureName: string) => boolean;
  plan: any;
  locations: any[];
}

const UpgradeBanner = ({ featureName, requiredPlan }: { featureName: string; requiredPlan: string }) => (
  <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-3xl p-8 md:p-12 shadow-xl border border-indigo-500/20 max-w-4xl mx-auto overflow-hidden relative">
    <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-50/10 rounded-full blur-3xl" />
    <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-purple-50/10 rounded-full blur-3xl" />

    <div className="relative z-10 space-y-6">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-indigo-200 bg-indigo-500/20 border border-indigo-400/30 rounded-full">
        <svg className="w-3.5 h-3.5 text-yellow-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
        {requiredPlan} Feature
      </span>

      <div className="max-w-2xl">
        <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight md:text-4xl">
          Upgrade to {requiredPlan} Plan
        </h2>
        <p className="text-indigo-200 mt-4 leading-relaxed text-sm md:text-base">
          The <span className="font-semibold text-white">{featureName}</span> module requires a subscription upgrade. Enable state-of-the-art business tools to unlock deep operational insight and automated inventory workflows.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10 max-w-3xl">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Advanced Real-Time Analytics</h4>
            <p className="text-xs text-indigo-200/80 mt-0.5">Identify scanning behaviors, product popularity trends, and security anomalies.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Geolocation & Threat Map</h4>
            <p className="text-xs text-indigo-200/80 mt-0.5">Pinpoint verification events globally and detect suspicious remote scans.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">CSV & Excel Bulk Sync</h4>
            <p className="text-xs text-indigo-200/80 mt-0.5">Register, update, and manage thousands of products and batch codes in seconds.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Expanded Production Limits</h4>
            <p className="text-xs text-indigo-200/80 mt-0.5">Scale up to 1,000 product templates and 500 QR batch generations.</p>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <div className="bg-indigo-500/10 border border-indigo-400/20 p-4 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-indigo-300 flex-shrink-0 animate-bounce" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-sm text-indigo-100 font-medium">
            Contact your Authentiq Brand Manager or System Administrator to upgrade to {requiredPlan}.
          </span>
        </div>
      </div>
    </div>
  </div>
);

const AdminRestrictedBanner = ({ featureName }: { featureName: string }) => (
  <div className="bg-gradient-to-br from-red-950 via-slate-900 to-slate-950 text-white rounded-3xl p-8 md:p-12 shadow-xl border border-red-500/20 max-w-4xl mx-auto overflow-hidden relative">
    <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-red-500/10 rounded-full blur-3xl" />
    <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl" />

    <div className="relative z-10 space-y-6">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-red-200 bg-red-500/20 border border-red-400/30 rounded-full">
        <svg className="w-3.5 h-3.5 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        Feature Restricted
      </span>

      <div className="max-w-2xl">
        <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight md:text-4xl">
          Access Restricted by Admin
        </h2>
        <p className="text-red-200 mt-4 leading-relaxed text-sm md:text-base">
          Your System Administrator has restricted access to the <span className="font-semibold text-white">{featureName}</span> feature for your account. Please contact your administrator if you believe this is in error.
        </p>
      </div>

      <div className="pt-6">
        <div className="bg-red-500/10 border border-red-400/20 p-4 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-red-300 flex-shrink-0 animate-bounce" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-sm text-red-100 font-medium">
            Contact your Authentiq Brand Manager or System Administrator to request access.
          </span>
        </div>
      </div>
    </div>
  </div>
);

export default function AnalyticsTab({
  overview,
  securityAlerts,
  scans,
  trends,
  hasFeature,
  plan,
  locations,
}: AnalyticsTabProps) {
  const isAnalyticsEnabled = hasFeature('telemetry');
  const isGeolocationEnabled = plan?.features?.location && plan.features.location !== 'none';
  const planName = plan?.plan_name || 'Free Trial';
  const isPlanProhibiting = !(planName === 'Business Pro' || planName === 'Enterprise');

  return (
    <div className="space-y-10">
      <header className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Enterprise Analytics</h2>
        <p className="text-sm font-medium text-gray-500 mt-1">Real-time intelligence and verification performance.</p>
      </header>

      {!isAnalyticsEnabled ? (
        isPlanProhibiting ? (
          <UpgradeBanner featureName="Real-Time Analytics Dashboard" requiredPlan="Business Pro" />
        ) : (
          <AdminRestrictedBanner featureName="Real-Time Analytics Dashboard" />
        )
      ) : (
        <>
          {/* KPI Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatsCard
              label="Verification Scans"
              value={overview.total_scans}
              trend="Life-to-date"
              trendStatus="positive"
              color="green"
            />
            <StatsCard
              label="Active Products"
              value={overview.total_products}
              trend="In registry"
              trendStatus="positive"
              color="blue"
            />
            <StatsCard
              label="Security Events"
              value={overview.suspicious_scans}
              trend="Suspicious scans"
              trendStatus={overview.suspicious_scans > 0 ? 'warning' : 'positive'}
              color="orange"
            />
          </div>

          {/* Geolocation Analytics */}
          {isGeolocationEnabled && (
            <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-900">Product Scan Distribution</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded">Location Intelligence</span>
              </div>
              <div className="p-6">
                <div className="w-full">
                  <LocationDistribution 
                    locations={locations} 
                    isLoading={false} 
                    theme={{ barColor: "from-indigo-500 to-purple-500", textColor: "text-gray-900" }} 
                  />
                </div>
              </div>
            </section>
          )}

          {/* Verification Trends Chart — full width */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-bold text-gray-900">Verification Trends</h3>
                <p className="text-xs text-slate-500 mt-0.5">Daily authentication scan counts over the last 14 days</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50 border border-gray-200 px-2 py-1 rounded">Last 14 Days</span>
            </div>

            <div className="flex gap-4">
              {/* Y-Axis Label & Numbers */}
              <div className="flex items-center gap-2 select-none shrink-0">
                {/* Y-Axis Text Label */}
                <div
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center py-2 h-56 flex items-center justify-center"
                  style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
                >
                  Verification Scans
                </div>
                {/* Y-Axis Numbers */}
                <div className="flex flex-col justify-between text-[10px] font-bold text-slate-500 h-56 text-right w-8">
                  <span>{trends.length > 0 ? Math.max(...trends.map((t: any) => t.count), 10) : 10}</span>
                  <span>{trends.length > 0 ? Math.round(Math.max(...trends.map((t: any) => t.count), 10) / 2) : 5}</span>
                  <span>0</span>
                </div>
              </div>

              {/* Chart Container (Chart Area + X-Axis Labels + X-Axis Legend) */}
              <div className="flex-1 flex flex-col gap-2">
                {/* Chart Bars Area */}
                <div className="h-56 relative flex items-end justify-between gap-2">
                  {/* Horizontal Gridlines */}
                  <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-between pointer-events-none select-none z-0">
                    <div className="border-b border-dashed border-slate-100 w-full" />
                    <div className="border-b border-dashed border-slate-100 w-full" />
                    <div className="border-b border-slate-200 w-full" />
                  </div>

                  {trends.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 italic">No trend data available yet.</div>
                  ) : (
                    trends.map((day: any, i: number) => {
                      const maxCount = Math.max(...trends.map((t: any) => t.count), 10);
                      const height = (day.count / maxCount) * 100;
                      const hasScans = day.count > 0;

                      return (
                        <div key={i} className="flex-1 flex flex-col justify-end items-center group relative z-10 h-full">
                          <div
                            className={`w-full rounded-t-lg transition-all duration-500 relative cursor-pointer ${
                              hasScans
                                ? 'bg-gradient-to-t from-indigo-500 to-purple-500 shadow-md group-hover:from-indigo-600 group-hover:to-purple-600'
                                : 'bg-slate-100 group-hover:bg-slate-200'
                            }`}
                            style={{ height: `${height}%`, minHeight: '8px' }}
                          >
                            {/* Tooltip */}
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 shadow-md flex flex-col items-center gap-0.5">
                              <span>{day.count} scans</span>
                              <span className="text-[8px] text-slate-400 font-normal">{new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 mt-[-3px]" />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* X-Axis Dates Labels Row */}
                <div className="flex justify-between gap-2 select-none border-t border-slate-100 pt-2">
                  {trends.map((day: any, i: number) => (
                    <div key={i} className="flex-1 text-center flex flex-col items-center">
                      <span className="text-[10px] font-bold text-slate-700">
                        {new Date(day.date).toLocaleDateString(undefined, { day: 'numeric' })}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">
                        {new Date(day.date).toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>

                {/* X-Axis Legend Label */}
                <div className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1 select-none">
                  Timeline (Date)
                </div>
              </div>
            </div>
          </div>

          {/* Anomalies and Verification Feed split layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Thread Detection Alerts */}
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-900 text-red-600 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  Flagged Threat Activities
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded">Threat Analysis</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/30">
                      <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">IP / Batch</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Attempts</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {securityAlerts.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-10 text-center text-xs text-gray-500 italic">No suspicious activity detected. Registry is healthy.</td>
                      </tr>
                    ) : (
                      securityAlerts.map((alert, i) => (
                        <tr key={i} className="hover:bg-red-50/30 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-xs font-mono font-bold text-gray-900">{alert.ip_address}</p>
                            <p className="text-[10px] text-gray-400 truncate max-w-[180px]">{alert.batch_name}</p>
                          </td>
                          <td className="px-5 py-4">
                            {alert.type === 'ai_authenticity_failure' ? (
                              <div>
                                <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded">AI Counterfeit</span>
                                <p className="text-[9px] text-gray-500 font-bold mt-1">Score: {alert.ai_score}%</p>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-bold text-red-600">{alert.count}x</p>
                                <p className="text-[9px] text-gray-400">{new Date(alert.last_seen).toLocaleTimeString()}</p>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-orange-100 text-orange-700">Flagged</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Customer Activity Feed */}
            <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-bold text-gray-900">Recent Verification Feed</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/30">
                      <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer IP</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {scans.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-10 text-center text-xs text-gray-500 italic">No verification logs available.</td>
                      </tr>
                    ) : (
                      scans.map((scan, i) => (
                        <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-xs font-mono font-bold text-gray-900">{scan.ip_address}</p>
                            <p className="text-[10px] text-gray-400 truncate max-w-[150px]">{scan.user_agent || 'Mobile Browser'}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-xs font-medium text-gray-700">
                              {typeof scan.location === 'string'
                                ? scan.location
                                : `${scan.location?.city || 'Unknown'}${scan.location?.state ? `, ${scan.location.state}` : ''}, ${scan.location?.country || 'Inferred'}`}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <p className="text-[10px] font-bold text-gray-500">{new Date(scan.timestamp).toLocaleString()}</p>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
