'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useBrand, type Brand } from '@/contexts/BrandContext';
import {
  createBrand,
  updateBrand,
  deleteBrand,
  uploadBrandLogo,
  deleteBrandLogo,
} from '@/services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_CATEGORIES = [
  'Snacks', 'Namkeen', 'Sweets', 'Beverages', 'Dairy', 'Bakery',
  'Staples', 'Spices', 'Personal Care', 'Healthcare', 'Electronics',
  'Agriculture', 'Industrial', 'Apparel', 'Other',
];

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandFormData {
  brand_name: string;
  brand_display_name: string;
  brand_tagline: string;
  product_categories: string[];
}

const EMPTY_FORM: BrandFormData = {
  brand_name: '',
  brand_display_name: '',
  brand_tagline: '',
  product_categories: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
      status === 'active'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-gray-100 text-gray-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {status}
    </span>
  );
}

// ── Brand Form Modal ──────────────────────────────────────────────────────────

interface BrandFormModalProps {
  initial?: Brand | null;
  onClose: () => void;
  onSaved: () => void;
}

function BrandFormModal({ initial, onClose, onSaved }: BrandFormModalProps) {
  const [form, setForm] = useState<BrandFormData>(
    initial
      ? {
          brand_name: initial.brand_name,
          brand_display_name: initial.brand_display_name ?? '',
          brand_tagline: initial.brand_tagline ?? '',
          product_categories: initial.product_categories ?? [],
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initial?.brand_logo_url ? `${API_BASE}${initial.brand_logo_url}` : null
  );
  const [removeLogo, setRemoveLogo] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleCategory = (cat: string) => {
    setForm((f) => ({
      ...f,
      product_categories: f.product_categories.includes(cat)
        ? f.product_categories.filter((c) => c !== cat)
        : [...f.product_categories, cat],
    }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setRemoveLogo(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.brand_name.trim()) { setError('Brand name is required'); return; }
    if (!initial && !logoFile) { setError('Brand logo is required'); return; }
    
    // Handle custom categories
    let finalCategories = [...form.product_categories];
    if (form.product_categories.includes('Other') && customCategory.trim()) {
      // Remove "Other" and add custom categories
      finalCategories = finalCategories.filter(c => c !== 'Other');
      const customCats = customCategory.split(',').map(c => c.trim()).filter(c => c);
      finalCategories = [...finalCategories, ...customCats];
    }
    
    if (finalCategories.length === 0) { setError('At least one product category is required'); return; }
    
    setSaving(true);
    setError('');
    try {
      let brandId = initial?.id;

      if (initial) {
        await updateBrand(initial.id, {
          brand_name: form.brand_name.trim(),
          brand_display_name: form.brand_display_name.trim() || undefined,
          brand_tagline: form.brand_tagline.trim() || undefined,
          product_categories: finalCategories,
        });
      } else {
        const created = await createBrand({
          brand_name: form.brand_name.trim(),
          brand_display_name: form.brand_display_name.trim() || undefined,
          brand_tagline: form.brand_tagline.trim() || undefined,
          product_categories: finalCategories,
        });
        brandId = created.id;
      }

      // Handle logo changes
      if (brandId) {
        if (removeLogo && initial?.brand_logo_url) {
          await deleteBrandLogo(brandId);
        } else if (logoFile) {
          await uploadBrandLogo(brandId, logoFile);
        }
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save brand');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {initial ? 'Edit Brand' : 'Register New Brand'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Logo */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Brand Logo <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-400 transition-colors cursor-pointer flex items-center justify-center overflow-hidden bg-gray-50"
              >
                {logoPreview && !removeLogo ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
                >
                  {logoPreview && !removeLogo ? 'Change logo' : 'Upload logo'}
                </button>
                {(logoPreview || initial?.brand_logo_url) && !removeLogo && (
                  <button
                    type="button"
                    onClick={() => { setRemoveLogo(true); setLogoPreview(null); setLogoFile(null); }}
                    className="text-sm text-red-500 font-medium hover:text-red-700 transition-colors"
                  >
                    Remove
                  </button>
                )}
                <p className="text-[11px] text-gray-400">PNG / WEBP, max 2 MB</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>

          {/* Brand Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
              Brand Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.brand_name}
              onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
              placeholder="e.g. Bikaji"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
              required
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
              Display Name <span className="text-gray-400 font-normal">(consumer-facing, if different)</span>
            </label>
            <input
              type="text"
              value={form.brand_display_name}
              onChange={(e) => setForm((f) => ({ ...f, brand_display_name: e.target.value }))}
              placeholder="e.g. Bikaji Foods International"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
            />
          </div>

          {/* Tagline */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
              Tagline / Short Description
            </label>
            <input
              type="text"
              value={form.brand_tagline}
              onChange={(e) => setForm((f) => ({ ...f, brand_tagline: e.target.value }))}
              placeholder="e.g. Desh ka Swad"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
            />
          </div>

          {/* Product Categories */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Product Categories <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    form.product_categories.includes(cat)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {form.product_categories.includes('Other') && (
              <div className="mt-3">
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Chocolates, Sweets, Confectionery"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">Multiple categories can be separated by comma</p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Brand'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Brand Card ────────────────────────────────────────────────────────────────

interface BrandCardProps {
  brand: Brand;
  isActive: boolean;
  onEdit: () => void;
  onSetActive: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}

function BrandCard({ brand, isActive, onEdit, onSetActive, onDeactivate, onReactivate, onDelete }: BrandCardProps) {
  return (
    <div className={`relative bg-white rounded-2xl border-2 transition-all shadow-sm hover:shadow-md ${
      isActive ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-100 hover:border-indigo-200'
    }`}>
      {isActive && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-600 text-white">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Active
          </span>
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start gap-4 mb-4">
          {brand.brand_logo_url ? (
            <img
              src={`${API_BASE}${brand.brand_logo_url}`}
              alt={brand.brand_name}
              className="w-14 h-14 rounded-xl object-cover border border-gray-100 flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0 pr-12">
            <h3 className="text-base font-bold text-gray-900 truncate">{brand.brand_name}</h3>
            {brand.brand_display_name && brand.brand_display_name !== brand.brand_name && (
              <p className="text-xs text-gray-500 truncate">{brand.brand_display_name}</p>
            )}
            {brand.brand_tagline && (
              <p className="text-xs text-gray-400 italic mt-0.5 truncate">"{brand.brand_tagline}"</p>
            )}
            <div className="mt-1.5">
              <StatusBadge status={brand.status} />
            </div>
          </div>
        </div>

        {brand.product_categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {brand.product_categories.slice(0, 5).map((cat) => (
              <span key={cat} className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {cat}
              </span>
            ))}
            {brand.product_categories.length > 5 && (
              <span className="text-[10px] font-semibold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                +{brand.product_categories.length - 5} more
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {!isActive && brand.status === 'active' && (
            <button
              type="button"
              onClick={onSetActive}
              className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
            >
              Set Active
            </button>
          )}
          {brand.status === 'inactive' && (
            <>
              <button
                type="button"
                onClick={onReactivate}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
              >
                Reactivate
              </button>
              <button
                type="button"
                onClick={onDelete}
                title="Delete brand permanently"
                className="px-3 py-2 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors flex-shrink-0 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
          {brand.status === 'active' && (
            <button
              type="button"
              onClick={onDeactivate}
              title="Deactivate brand"
              className="px-3 py-2 rounded-lg border border-red-100 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors flex-shrink-0 flex items-center justify-center cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BrandsPage() {
  const { brands, activeBrand, setActiveBrand, refreshBrands, isLoading } = useBrand();
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSaved = async () => {
    await refreshBrands();
    setShowForm(false);
    setEditingBrand(null);
    showToast('Brand saved successfully');
  };

  const handleDeactivate = async (brand: Brand) => {
    if (!confirm(`Deactivate "${brand.brand_name}"? Products will not be deleted.`)) return;
    try {
      await deleteBrand(brand.id);
      await refreshBrands();
      showToast(`"${brand.brand_name}" deactivated`);
    } catch (err: any) {
      showToast(err.message || 'Failed to deactivate brand');
    }
  };

  const handleReactivate = async (brand: Brand) => {
    try {
      await updateBrand(brand.id, { status: 'active' });
      await refreshBrands();
      showToast(`"${brand.brand_name}" reactivated`);
    } catch (err: any) {
      showToast(err.message || 'Failed to reactivate brand');
    }
  };

  const handleHardDelete = async (brand: Brand) => {
    if (!confirm(`Are you sure you want to permanently delete "${brand.brand_name}"? This action cannot be undone.`)) return;
    try {
      await deleteBrand(brand.id, true);
      await refreshBrands();
      showToast(`"${brand.brand_name}" permanently deleted`);
    } catch (err: any) {
      showToast(err.message || 'Failed to permanently delete brand');
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brand Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage multiple brands under your company. Each brand has its own products and logo.
          </p>
        </div>
        <button
          type="button"
          id="btn-new-brand"
          onClick={() => { setEditingBrand(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Brand
        </button>
      </div>

      {/* Empty State */}
      {!isLoading && brands.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">No brands yet</h3>
          <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto">
            Register your first brand to start adding products under it.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Register First Brand
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Brand Grid */}
      {!isLoading && brands.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              isActive={brand.id === activeBrand?.id}
              onEdit={() => { setEditingBrand(brand); setShowForm(true); }}
              onSetActive={() => { setActiveBrand(brand.id); showToast(`Switched to "${brand.brand_name}"`); }}
              onDeactivate={() => handleDeactivate(brand)}
              onReactivate={() => handleReactivate(brand)}
              onDelete={() => handleHardDelete(brand)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <BrandFormModal
          initial={editingBrand}
          onClose={() => { setShowForm(false); setEditingBrand(null); }}
          onSaved={handleSaved}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
