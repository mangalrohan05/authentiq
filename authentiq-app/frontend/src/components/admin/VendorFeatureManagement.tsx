import React, { useState, useEffect } from 'react';

interface Vendor {
  id: string;
  name: string;
}

interface FeatureOverride {
  vendor_id: string;
  feature_key: string;
  override_value: string;
  granted_by: string;
  reason?: string;
  created_at: string;
  updated_at: string;
}

interface VendorOverridesData {
  vendor_id: string;
  plan_slug: string;
  defaults: Record<string, any>;
  overrides: FeatureOverride[];
  limits?: Record<string, any>;
}

interface VendorFeatureManagementProps {
  vendor: Vendor;
  onClose: () => void;
}

const FEATURE_META: Record<string, { label: string; type: 'boolean' | 'enum'; options?: string[] }> = {
  location: { label: 'Location Tracking', type: 'enum', options: ['none', 'region_level', 'full_heatmaps'] },
  csv_export: { label: 'CSV Export', type: 'boolean' },
  bulk_qr: { label: 'Bulk QR Generation', type: 'boolean' },
  telemetry: { label: 'Analytics Telemetry', type: 'boolean' },
  case_level: { label: 'Case Level CRUD', type: 'enum', options: ['basic', 'full'] },
  api_webhooks: { label: 'API Webhooks', type: 'boolean' },
  sso: { label: 'SSO & Team', type: 'boolean' },
};

export default function VendorFeatureManagement({ vendor, onClose }: VendorFeatureManagementProps) {
  const [data, setData] = useState<VendorOverridesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitsForm, setLimitsForm] = useState<Record<string, any>>({});

  useEffect(() => {
    loadData();
  }, [vendor.id]);

  async function loadData() {
    try {
      setLoading(true);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = localStorage.getItem("authentiq_admin_token");
      
      const res = await fetch(`${baseUrl}/admin/features/vendor/${vendor.id}/overrides`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error("Failed to load vendor feature overrides");
      
      const jsonData = await res.json();
      setData(jsonData);
      setLimitsForm(jsonData.limits || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveOverride(featureKey: string, newValue: string) {
    try {
      setSavingKey(featureKey);
      setError(null);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = localStorage.getItem("authentiq_admin_token");

      // Optional reason prompt (can be extended to a real modal)
      const reason = window.prompt("Reason for this override (optional):");
      if (reason === null) return; // cancelled

      const res = await fetch(`${baseUrl}/admin/features/vendor/${vendor.id}/overrides`, {
        method: 'PUT',
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          feature_key: featureKey,
          override_value: newValue,
          reason: reason
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save override");
      }
      
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleResetOverride(featureKey: string) {
    try {
      setSavingKey(featureKey);
      setError(null);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = localStorage.getItem("authentiq_admin_token");

      const res = await fetch(`${baseUrl}/admin/features/vendor/${vendor.id}/overrides/${featureKey}`, {
        method: 'DELETE',
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) throw new Error("Failed to reset override");
      
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleSaveLimits(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingKey('limits');
      setError(null);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = localStorage.getItem("authentiq_admin_token");

      const res = await fetch(`${baseUrl}/admin/features/vendor/${vendor.id}/limits`, {
        method: 'PUT',
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          total_users_limit: limitsForm.total_users_limit === '' ? null : Number(limitsForm.total_users_limit),
          total_skus_limit: limitsForm.total_skus_limit === '' ? null : Number(limitsForm.total_skus_limit),
          total_brands_limit: limitsForm.total_brands_limit === '' ? null : Number(limitsForm.total_brands_limit),
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save limits");
      }
      
      await loadData();
      alert("Limits updated successfully");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-lg">
        <div className="text-center py-8 text-gray-500">Loading Vendor Features...</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg overflow-x-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Feature Overrides</h2>
          <p className="text-sm text-gray-600 mt-1">
            Vendor: <span className="font-semibold">{vendor.name}</span> | Base Plan: <span className="font-semibold">{data.plan_slug}</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Close
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="overflow-hidden border border-gray-200 rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Feature</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan Default</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin Info</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.entries(FEATURE_META).map(([key, meta]) => {
              const defaultValue = String(data.defaults[key]);
              const override = data.overrides.find(o => o.feature_key === key);
              const isOverridden = !!override;
              const currentValue = isOverridden ? override.override_value : defaultValue;

              return (
                <tr key={key} className={isOverridden ? 'bg-amber-50/30' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {meta.label}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {defaultValue}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {isOverridden ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                        Overridden
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {isOverridden ? (
                      <div>
                        <div className="font-medium">{override.granted_by}</div>
                        {override.reason && <div className="text-xs text-gray-400 mt-1 italic w-40 truncate" title={override.reason}>"{override.reason}"</div>}
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {meta.type === 'boolean' ? (
                        <select
                          className={`text-sm text-gray-900 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 py-1.5 ${isOverridden ? 'bg-white border-amber-300' : 'bg-gray-50'}`}
                          value={currentValue.toLowerCase()}
                          onChange={(e) => handleSaveOverride(key, e.target.value)}
                          disabled={savingKey === key}
                        >
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : (
                        <select
                          className={`text-sm text-gray-900 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 py-1.5 ${isOverridden ? 'bg-white border-amber-300' : 'bg-gray-50'}`}
                          value={currentValue}
                          onChange={(e) => handleSaveOverride(key, e.target.value)}
                          disabled={savingKey === key}
                        >
                          {meta.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                      
                      {isOverridden && (
                        <button
                          onClick={() => handleResetOverride(key)}
                          disabled={savingKey === key}
                          className="ml-2 text-xs text-red-600 hover:text-red-900 border border-red-200 hover:bg-red-50 px-2 py-1.5 rounded-md transition-colors"
                          title="Reset to default"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Base Limit Overrides</h3>
        <p className="text-sm text-gray-600 mb-4">Leave blank to use the default limits defined by the plan.</p>
        <form onSubmit={handleSaveLimits} className="flex items-end gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Users</label>
            <input
              type="number"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="Default"
              value={limitsForm.total_users_limit ?? ''}
              onChange={e => setLimitsForm({...limitsForm, total_users_limit: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Products/SKUs</label>
            <input
              type="number"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="Default"
              value={limitsForm.total_skus_limit ?? ''}
              onChange={e => setLimitsForm({...limitsForm, total_skus_limit: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Brands</label>
            <input
              type="number"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              placeholder="Default"
              value={limitsForm.total_brands_limit ?? ''}
              onChange={e => setLimitsForm({...limitsForm, total_brands_limit: e.target.value})}
            />
          </div>
          <button
            type="submit"
            disabled={savingKey === 'limits'}
            className="px-4 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {savingKey === 'limits' ? 'Saving...' : 'Save Limits'}
          </button>
        </form>
      </div>
    </div>
  );
}
