import React, { useState } from 'react';
import {
  importProducts,
  exportVendorProducts,
  downloadCsvTemplate,
  downloadExcelTemplate,
} from '@/services/api';

interface ImportExportTabProps {
  hasFeature: (featureName: string) => boolean;
  plan: any;
  fetchData: () => Promise<void>;
  showSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
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

export default function ImportExportTab({
  hasFeature,
  plan,
  fetchData,
  showSuccess,
  setError,
}: ImportExportTabProps) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProductId, setImportProductId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [exportingProducts, setExportingProducts] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('csv');

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const result = await importProducts(importFile, importProductId);
      setImportResult(result);
      if (result.success_count > 0) {
        showSuccess(`Successfully imported ${result.success_count} products!`);
        fetchData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import file');
    } finally {
      setImporting(false);
    }
  };

  const handleExportProducts = async () => {
    setExportingProducts(true);
    try {
      await exportVendorProducts(exportFormat);
      showSuccess('Products exported successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to export products');
    } finally {
      setExportingProducts(false);
    }
  };

  const handleDownloadTemplate = async (type: 'csv' | 'excel') => {
    setDownloadingTemplate(true);
    try {
      if (type === 'csv') {
        await downloadCsvTemplate();
      } else {
        await downloadExcelTemplate();
      }
      showSuccess(`${type.toUpperCase()} template downloaded successfully!`);
    } catch (err: any) {
      setError(err.message || `Failed to download ${type} template`);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const isImportEnabled = hasFeature('bulk_qr');
  const isExportEnabled = hasFeature('csv_export');
  const planName = plan?.plan_name || 'Free Trial';
  const isPlanProhibiting = planName === 'Free Trial';

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Data Synchronization</h2>
        <p className="text-sm font-medium text-gray-500 mt-1">Bulk manage your product registry via CSV and Excel.</p>
      </header>

      {!isExportEnabled ? (
        isPlanProhibiting ? (
          <UpgradeBanner featureName="CSV & Excel Bulk Sync" requiredPlan="Business" />
        ) : (
          <AdminRestrictedBanner featureName="CSV & Excel Bulk Sync" />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Import Card */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col h-full">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-gray-900">Import Products</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadTemplate('csv')}
                    disabled={downloadingTemplate}
                    className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    CSV Template
                  </button>
                  <button
                    onClick={() => handleDownloadTemplate('excel')}
                    disabled={downloadingTemplate}
                    className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Excel Template
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-6 flex-1">Upload a filled template. Mandatory fields: Product Name, MRP, HSN Code, Manufacturer Name, Manufacturer Address. Brand is auto-set to your first active brand. SKU auto-generated if empty. Category defaults to 'Other', Country defaults to 'India'. HSN Code must be numeric.</p>

              <form onSubmit={handleImport} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">File Upload</label>
                  <input
                    type="file"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="w-full py-3 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-all disabled:opacity-50 mt-4"
                >
                  {importing ? 'Processing File...' : 'Upload & Import'}
                </button>
              </form>
            </div>

            {/* Export Card */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col h-full">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Export Data</h3>
              <p className="text-sm text-gray-500 mb-4">Download your registry data for offline analysis or backup. Generates a standard .CSV or Excel format.</p>

              <div className="mt-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Format</label>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as 'csv' | 'excel')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900 bg-white"
                  >
                    <option value="csv" className="text-gray-900 bg-white">CSV</option>
                    <option value="excel" className="text-gray-900 bg-white">Excel</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Download your registry data in Excel or CSV format</p>
                </div>
                <button
                  onClick={handleExportProducts}
                  disabled={exportingProducts}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  {exportingProducts ? 'Exporting...' : 'Export All Products'}
                </button>
              </div>
            </div>
          </div>

          {/* Import Results Table */}
          {importResult && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Import Validation Report</h3>
                <div className="flex gap-3">
                  <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-800 rounded">+{importResult.success_count} Added</span>
                  {importResult.error_count > 0 && <span className="text-xs font-bold px-2 py-1 bg-red-100 text-red-800 rounded">{importResult.error_count} Skipped</span>}
                </div>
              </div>
              {importResult.error_count > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/30 sticky top-0">
                        <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-24">Row</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Error Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {importResult.errors.map((err: any, idx: number) => (
                        <tr key={idx} className="hover:bg-red-50/30">
                          <td className="px-5 py-3 text-xs font-mono text-gray-500">Row {err.row}</td>
                          <td className="px-5 py-3 text-sm font-medium text-red-600">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-green-600 font-medium flex flex-col items-center justify-center gap-2">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  All {importResult.total_processed} rows were successfully imported without errors.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
