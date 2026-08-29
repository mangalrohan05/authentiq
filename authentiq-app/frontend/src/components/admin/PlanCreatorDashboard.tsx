import React, { useState, useEffect } from 'react';

interface Feature {
  id: string;
  name: string;
  description: string;
  category: string;
  is_active: boolean;
}

interface Plan {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  base_price?: number;
  billing_cycle: string;
  feature_ids: string[];
  is_customizable: boolean;
  limits: {
    max_products: number;
    max_batches: number;
    max_scans_per_month: number;
    max_users: number;
    max_managers: number;
    max_viewers: number;
    max_brands: number;
    max_storage_bytes: number;
  };
}

interface PlanCreatorDashboardProps {
  plan?: Plan; // If provided, edit mode; otherwise create mode
  onSave: (plan: Partial<Plan>) => void;
  onCancel: () => void;
}

export default function PlanCreatorDashboard({ plan, onSave, onCancel }: PlanCreatorDashboardProps) {
  const [name, setName] = useState(plan?.name || '');
  const [description, setDescription] = useState(plan?.description || '');
  const [basePrice, setBasePrice] = useState(plan?.base_price || 0);
  const [billingCycle, setBillingCycle] = useState(plan?.billing_cycle || 'monthly');
  const [isCustomizable, setIsCustomizable] = useState(plan?.is_customizable || false);
  const [active, setActive] = useState(plan?.active ?? true);
  
  const [limits, setLimits] = useState(plan?.limits || {
    max_products: 10,
    max_batches: 5,
    max_scans_per_month: 500,
    max_users: 1,
    max_managers: 5,
    max_viewers: 10,
    max_brands: 1,
    max_storage_bytes: 1073741824
  });
  
  const [features, setFeatures] = useState<Feature[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>(plan?.feature_ids || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFeatures();
  }, []);

  async function loadFeatures() {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = localStorage.getItem("authentiq_admin_token");
      
      const res = await fetch(`${baseUrl}/admin/features`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      });
      
      if (!res.ok) throw new Error("Failed to load features");
      const data = await res.json();
      setFeatures(data.features || []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function toggleFeature(featureId: string) {
    setSelectedFeatureIds(prev => 
      prev.includes(featureId) 
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  }

  function handleSave() {
    const planData: Partial<Plan> = {
      name,
      description,
      base_price: basePrice,
      billing_cycle: billingCycle,
      feature_ids: selectedFeatureIds,
      is_customizable: isCustomizable,
      active,
      limits
    };
    
    onSave(planData);
  }

  const featuresByCategory = features.reduce((acc, feature) => {
    if (!acc[feature.category]) acc[feature.category] = [];
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<string, Feature[]>);

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {plan ? 'Edit Plan' : 'Create New Plan'}
        </h2>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {plan ? 'Save Changes' : 'Create Plan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!plan}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="e.g., Business Pro"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              rows={3}
              placeholder="Plan description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Price</label>
              <input
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                placeholder="0.00"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value)}
                disabled={!!plan}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isCustomizable}
                onChange={(e) => setIsCustomizable(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Customizable by Admin</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>
        </div>

        {/* Resource Limits */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Resource Limits</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Products (SKUs)</label>
              <input
                type="number"
                value={limits.max_products}
                onChange={(e) => setLimits({...limits, max_products: parseInt(e.target.value) || 0})}
                disabled={!!plan}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Batches</label>
              <input
                type="number"
                value={limits.max_batches}
                onChange={(e) => setLimits({...limits, max_batches: parseInt(e.target.value) || 0})}
                disabled={!!plan}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Scans/Month</label>
              <input
                type="number"
                value={limits.max_scans_per_month}
                onChange={(e) => setLimits({...limits, max_scans_per_month: parseInt(e.target.value) || 0})}
                disabled={!!plan}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
                <input
                  type="number"
                  value={limits.max_users}
                  onChange={(e) => setLimits({...limits, max_users: parseInt(e.target.value) || 0})}
                  disabled={!!plan}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Managers</label>
                <input
                  type="number"
                  value={limits.max_managers}
                  onChange={(e) => setLimits({...limits, max_managers: parseInt(e.target.value) || 0})}
                  disabled={!!plan}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Viewers</label>
                <input
                  type="number"
                  value={limits.max_viewers}
                  onChange={(e) => setLimits({...limits, max_viewers: parseInt(e.target.value) || 0})}
                  disabled={!!plan}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Brands</label>
              <input
                type="number"
                value={limits.max_brands}
                onChange={(e) => setLimits({...limits, max_brands: parseInt(e.target.value) || 0})}
                disabled={!!plan}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Storage (GB)</label>
              <input
                type="number"
                value={limits.max_storage_bytes ? Math.round(limits.max_storage_bytes / 1073741824) : ''}
                onChange={(e) => setLimits({...limits, max_storage_bytes: Number(e.target.value) * 1073741824})}
                disabled={!!plan}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                step="1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Features Selection */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Included Features</h3>
        
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading features...</div>
        ) : Object.keys(featuresByCategory).length === 0 ? (
          <div className="text-center py-8 text-gray-500">No features available</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(featuresByCategory).map(([category, categoryFeatures]) => (
              <div key={category}>
                <h4 className="text-md font-medium text-gray-800 mb-3 capitalize">{category}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categoryFeatures.map((feature) => (
                    <label
                      key={feature.id}
                      className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedFeatureIds.includes(feature.id)
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-300 hover:border-gray-400'
                      } ${!feature.is_active ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFeatureIds.includes(feature.id)}
                        onChange={() => toggleFeature(feature.id)}
                        disabled={!feature.is_active}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mt-0.5"
                      />
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{feature.name}</div>
                        <div className="text-xs text-gray-500">{feature.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Summary</h4>
        <div className="text-sm text-gray-600">
          <p><strong>Selected Features:</strong> {selectedFeatureIds.length}</p>
          <p><strong>Customizable:</strong> {isCustomizable ? 'Yes' : 'No'}</p>
          <p><strong>Active:</strong> {active ? 'Yes' : 'No'}</p>
        </div>
      </div>
    </div>
  );
}
