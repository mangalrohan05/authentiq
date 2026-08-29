'use client';

/**
 * ProductRegistrationDrawer
 *
 * A self-contained 2-step product creation drawer that lives outside vendor/page.tsx.
 *
 * Step 1 — Product Details:
 *   Basic (name, brand, variant, pack size, category, SKU, description)
 *   + Collapsible Regulatory & Trade section (MRP, barcode, HSN, manufacturer, country, status, notes)
 *
 * Step 2 — AI Verification Reference Images:
 *   9 upload slots (4 required, 5 optional), drag-and-drop support.
 *
 * Callbacks (from parent):
 *   onClose()                           — dismiss the drawer without saving
 *   onProductCreated(id, name, brandId) — called after successful create + image uploads
 *                                         parent is responsible for fetchData/refetchPlan/activity log
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createProduct, uploadProductReferenceImage } from '@/services/api';
import { useBrand } from '@/contexts/BrandContext';
import { usePlan } from '@/hooks/usePlan';

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const PRESET_CATEGORIES = [
  'Beverages',
  'Snacks',
  'Packaged Foods',
  'Dairy Products',
  'Bakery & Bread',
  'Cereals & Grains',
  'Sweets & Confectionery',
  'Personal Care',
  'Household Goods',
];

type ReferenceSlotKey =
  | 'front_view' | 'back_view' | 'labels' | 'additional_markers'
  | 'side_view' | 'packaging' | 'holograms' | 'barcode_qr' | 'seals';

type SlotIcon = 'camera' | 'box' | 'tag' | 'shield' | 'qr' | 'seal' | 'plus';

interface ReferenceSlotConfig {
  key: ReferenceSlotKey;
  uploadViewType: string;
  title: string;
  description: string;
  required?: boolean;
  icon: SlotIcon;
}

interface ReferenceSlotState extends ReferenceSlotConfig {
  file: File | null;
  previewUrl: string | null;
}

const SLOT_CONFIGS: ReferenceSlotConfig[] = [
  { key: 'front_view',        uploadViewType: 'front_view',        title: 'Product Front View',         description: 'Straight-on official image with logo and primary design visible.', required: true,  icon: 'camera' },
  { key: 'back_view',         uploadViewType: 'back_view',         title: 'Product Back View',          description: 'Back side, serial placement, engravings, and rear detailing.',     required: true,  icon: 'camera' },
  { key: 'labels',            uploadViewType: 'labels',            title: 'Product Labels / Serial',    description: 'Close-up of tags, serial labels, wash labels, or micro-print.',   required: true,  icon: 'tag'    },
  { key: 'additional_markers',uploadViewType: 'additional_markers',title: 'Upload Print Design File',   description: 'High-quality print design file or digital artwork.',               required: true,  icon: 'plus'   },
  { key: 'side_view',         uploadViewType: 'side_view',         title: 'Product Side View',          description: 'Profile angle showing shape, seams, edges, and thickness.',                        icon: 'camera' },
  { key: 'packaging',         uploadViewType: 'packaging',         title: 'Packaging View (Optional)',  description: 'Outer box or retail packaging for back-view matching.',                             icon: 'box'    },
  { key: 'holograms',         uploadViewType: 'holograms',         title: 'Holograms / Security Marks', description: 'Security foil, holographic sticker, or authenticity mark.',                        icon: 'shield' },
  { key: 'barcode_qr',        uploadViewType: 'barcode_qr',        title: 'Barcode / QR Area',          description: 'Barcode, QR label, SKU sticker, or scannable identifier.',                         icon: 'qr'     },
  { key: 'seals',             uploadViewType: 'seals',             title: 'Seal / Authenticity Marker', description: 'Tamper seal, stitch detail, embossing, clasp, or material marker.',                 icon: 'seal'   },
];

const createSlots = (): ReferenceSlotState[] =>
  SLOT_CONFIGS.map(s => ({ ...s, file: null, previewUrl: null }));

// ── Slot Icon ─────────────────────────────────────────────────────────────────

function SlotIcon({ icon }: { icon: SlotIcon }) {
  if (icon === 'box')    return <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L21 7v10l-9 5-9-5V7l9-5zm0 10V22m0-10L3 7m9 5l9-5" />;
  if (icon === 'tag')    return <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M3 11.5V6a3 3 0 013-3h5.5a2 2 0 011.414.586l7.5 7.5a2 2 0 010 2.828l-6.5 6.5a2 2 0 01-2.828 0l-7.5-7.5A2 2 0 013 11.5z" />;
  if (icon === 'shield') return <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v5c0 4.5-2.9 7.7-7 9-4.1-1.3-7-4.5-7-9V7l7-4z" />;
  if (icon === 'qr')     return <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h2m4 0h-2m-4 4h6m-6 2h2" />;
  if (icon === 'seal')   return <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-5m5 3a8 8 0 11-16 0 8 8 0 0116 0z" />;
  if (icon === 'plus')   return <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />;
  return (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProductRegistrationDrawerProps {
  isOpen: boolean;
  /** Called when drawer should close (without saving) */
  onClose: () => void;
  /** Called after a successful product creation + image uploads */
  onProductCreated: (productId: string, productName: string) => void;
  /** Whether the vendor has reached their product limit */
  productLimitReached?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductRegistrationDrawer({
  isOpen,
  onClose,
  onProductCreated,
  productLimitReached = false,
}: ProductRegistrationDrawerProps) {
  const { brands, activeBrand } = useBrand();

  // Sync selected brand when drawer opens or activeBrand changes
  useEffect(() => {
    if (isOpen) {
      setBrand(activeBrand?.brand_name || '');
    }
  }, [isOpen, activeBrand]);

  // ── Step ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);

  // ── Basic Info ─────────────────────────────────────────────────────────────
  const [name, setName]           = useState('');
  const [brand, setBrand]         = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku]             = useState('');
  const [category, setCategory]   = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [variantName, setVariantName] = useState('');
  const [packSize, setPackSize]   = useState('');

  // ── Regulatory & Trade ─────────────────────────────────────────────────────
  const [showReg, setShowReg]     = useState(false);
  const [mrp, setMrp]             = useState('');
  const [barcode, setBarcode]     = useState('');
  const [hsnCode, setHsnCode]     = useState('');
  const [mfgName, setMfgName]     = useState('');
  const [mfgAddress, setMfgAddress] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [productStatus, setProductStatus] = useState<'active' | 'recalled'>('active');
  const [notes, setNotes]         = useState('');

  // ── Reference Images ───────────────────────────────────────────────────────
  const [slots, setSlots] = useState<ReferenceSlotState[]>(() => createSlots());
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // ── UI State ───────────────────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    brand?: string;
    mrp?: string;
    hsnCode?: string;
    mfgName?: string;
    mfgAddress?: string;
    images?: string;
    category?: string;
  }>({});
  const [creating, setCreating]     = useState(false);
  const [created, setCreated]       = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const revokeAll = useCallback((arr: ReferenceSlotState[]) => {
    arr.forEach(s => { if (s.previewUrl) URL.revokeObjectURL(s.previewUrl); });
  }, []);

  const updateSlot = useCallback((key: ReferenceSlotKey, file: File | null, arr: ReferenceSlotState[], setter: React.Dispatch<React.SetStateAction<ReferenceSlotState[]>>) => {
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const maxSize = 5 * 1024 * 1024;

      if (!allowedTypes.includes(file.type)) {
        setFieldErrors(prev => ({
          ...prev,
          images: `Invalid file type: "${file.name}". Only JPG, PNG, and WEBP are allowed.`
        }));
        return;
      }
      if (file.size > maxSize) {
        setFieldErrors(prev => ({
          ...prev,
          images: `File too large: "${file.name}" exceeds the 5MB size limit.`
        }));
        return;
      }
      const isDuplicate = arr.some(s => s.key !== key && s.file && s.file.name === file.name && s.file.size === file.size);
      if (isDuplicate) {
        setFieldErrors(prev => ({
          ...prev,
          images: `Duplicate Image Error: "${file.name}" is already selected in another slot. Please upload a unique image for each slot.`
        }));
        return;
      }
      // Clear image error if upload is valid
      setFieldErrors(prev => ({ ...prev, images: undefined }));
    }

    setter(prev => prev.map(s => {
      if (s.key !== key) return s;
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      if (!file) return { ...s, file: null, previewUrl: null };
      return { ...s, file, previewUrl: URL.createObjectURL(file) };
    }));
  }, [setFieldErrors]);

  const removeSlot = useCallback((key: ReferenceSlotKey, setter: React.Dispatch<React.SetStateAction<ReferenceSlotState[]>>) => {
    setter(prev => prev.map(s => {
      if (s.key !== key) return s;
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      return { ...s, file: null, previewUrl: null };
    }));
  }, []);

  const reset = () => {
    revokeAll(slotsRef.current);
    setSlots(createSlots());
    setStep(1);
    setName(''); setBrand(''); setDescription(''); setSku(''); setCategory('');
    setSelectedCategory(''); setCustomCategory('');
    setVariantName(''); setPackSize('');
    setShowReg(false);
    setMrp(''); setBarcode(''); setHsnCode('');
    setMfgName(''); setMfgAddress(''); setCountryOfOrigin('');
    setProductStatus('active'); setNotes('');
    setFieldErrors({}); setCreating(false); setCreated(false); setGeneralError(null);
  };

  const handleClose = () => {
    if (creating) return;
    reset();
    onClose();
  };

  // ── Step 1 → Step 2 ────────────────────────────────────────────────────────

  const goToStep2 = () => {
    const errs: typeof fieldErrors = {};
    if (!name.trim()) errs.name = 'Product name is required';
    const effectiveBrand = brand.trim();
    if (!effectiveBrand) errs.brand = 'Brand is required';

    if (selectedCategory === 'Other' && !customCategory.trim()) {
      errs.category = 'Custom category is required';
    }

    // Validate mandatory Regulatory & Trade fields
    if (!mrp.trim()) {
      errs.mrp = 'MRP is required';
    } else if (isNaN(Number(mrp)) || Number(mrp) <= 0) {
      errs.mrp = 'MRP must be greater than 0';
    }
    if (!hsnCode.trim()) errs.hsnCode = 'HSN Code is required';
    else if (!/^\d+$/.test(hsnCode.trim())) errs.hsnCode = 'HSN Code must be a number';
    if (!mfgName.trim()) errs.mfgName = 'Manufacturer Name is required';
    if (!mfgAddress.trim()) errs.mfgAddress = 'Manufacturer Address is required';

    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setGeneralError('Please fill in all required fields');
      // Auto expand regulatory details if any of those have errors
      if (errs.mrp || errs.hsnCode || errs.mfgName || errs.mfgAddress) {
        setShowReg(true);
      }
      return;
    }
    setFieldErrors({});
    setGeneralError(null);
    setStep(2);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setGeneralError(null);
    setFieldErrors({});

    // Validate required images (step 2)
    const hasFile = (k: ReferenceSlotKey) => Boolean(slotsRef.current.find(s => s.key === k)?.file);
    const missing: string[] = [];
    if (!hasFile('front_view'))         missing.push('Product Front View');
    if (!hasFile('back_view'))          missing.push('Product Back View');
    if (!hasFile('labels'))             missing.push('Product Labels / Serial');
    if (!hasFile('additional_markers')) missing.push('Upload Print Design File');
    if (missing.length) {
      setFieldErrors({ images: `Required images missing: ${missing.join(', ')}` });
      return;
    }

    const effectiveBrand = brand.trim();
    const selectedBrandObj = brands.find(b => b.brand_name === effectiveBrand);
    const effectiveBrandId = selectedBrandObj?.id || activeBrand?.id || undefined;
    const finalCategory = selectedCategory === 'Other' ? customCategory.trim() : selectedCategory;

    try {
      setCreating(true);
      const productRes = await createProduct({
        name: name.trim(),
        brand: effectiveBrand,
        description: description.trim() || undefined,
        sku: sku.trim() || undefined,
        category: finalCategory || undefined,
        // Brand FK
        brand_id: effectiveBrandId,
        // Extended fields
        variant_name: variantName.trim() || undefined,
        pack_size: packSize.trim() || undefined,
        mrp: mrp ? parseFloat(mrp) : undefined,
        barcode: barcode.trim() || undefined,
        hsn_code: hsnCode.trim() || undefined,
        manufacturer_name: mfgName.trim() || undefined,
        manufacturer_address: mfgAddress.trim() || undefined,
        country_of_origin: countryOfOrigin.trim() || undefined,
        product_status: productStatus,
        notes: notes.trim() || undefined,
      });

      const productId = productRes.id || productRes.product_id;
      if (!productId) throw new Error('Backend did not return a product ID.');

      // Close window immediately and upload images in background
      setCreated(true);
      onProductCreated(productId, name.trim());
      reset();
      onClose();

      // Upload reference images in background (fire and forget)
      // Capture slots before reset to avoid race conditions
      const slotsToUpload = slotsRef.current.filter(s => s.file);
      if (slotsToUpload.length > 0) {
        // Use Promise.all to ensure uploads complete properly
        Promise.all(
          slotsToUpload.map(async (slot) => {
            try {
              await uploadProductReferenceImage(productId, slot.file!, slot.uploadViewType);
            } catch (err: any) {
              console.error(`Background upload failed for ${slot.title}:`, err);
              // Log error to backend notifications so user sees it
              try {
                await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/analytics/vendor/log-error`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authentiq_vendor_token')}`,
                  },
                  body: JSON.stringify({
                    error_title: `Image Upload Failed: ${slot.title}`,
                    error_details: err.message || 'Unknown error during background image upload',
                    product_id: productId,
                  }),
                });
              } catch (logErr) {
                console.error('Failed to log error to backend:', logErr);
              }
            }
          })
        ).catch(err => {
          console.error('Background image upload error:', err);
        });
      }

    } catch (err: any) {
      setGeneralError(err.message || 'Failed to create product. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  const selectedBrandObj = brands.find(b => b.brand_name === brand);
  const brandCategories = selectedBrandObj?.product_categories || [];
  const categoriesList = selectedBrandObj && brandCategories.length > 0
    ? Array.from(new Set(brandCategories)).filter(Boolean)
    : Array.from(new Set(PRESET_CATEGORIES)).filter(Boolean);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 new-product-page overflow-y-auto">
      <div className="product-form-container relative">

        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          disabled={creating}
          aria-label="Close"
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2>Add New Product</h2>
        <p className="text-sm text-gray-500 mb-6">Step {step} of 2</p>

        <form onSubmit={handleSubmit}>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ STEP 1 ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 1 && (
            <>
              {/* Active-brand banner */}
              {activeBrand && (
                <div className="mb-5 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                  {activeBrand.brand_logo_url ? (
                    <img
                      src={`${API_BASE}${activeBrand.brand_logo_url}`}
                      alt={activeBrand.brand_name}
                      className="w-6 h-6 rounded object-cover"
                    />
                  ) : (
                    <span className="w-6 h-6 rounded bg-indigo-200 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </span>
                  )}
                  <span className="text-xs font-semibold text-indigo-800">
                    Adding to: <span className="font-bold">{activeBrand.brand_name}</span>
                  </span>
                </div>
              )}

              {/* ── Basic fields ── */}
              <div className="form-grid">
                <div className="form-group">
                  <label>Product Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); if (fieldErrors.name) setFieldErrors(p => ({ ...p, name: undefined })); }}
                    placeholder="e.g. Aloo Bhujia"
                    className={fieldErrors.name ? 'border-red-500' : ''}
                  />
                  {fieldErrors.name && <p className="text-sm text-red-500 mt-1">{fieldErrors.name}</p>}
                </div>

                <div className="form-group">
                  <label>Brand *</label>
                  <select
                    value={brand}
                    onChange={e => { setBrand(e.target.value); if (fieldErrors.brand) setFieldErrors(p => ({ ...p, brand: undefined })); }}
                    className={fieldErrors.brand ? 'border-red-500' : ''}
                  >
                    <option value="">Select a Brand...</option>
                    {brands.filter(b => b.status === 'active').map(b => (
                      <option key={b.id} value={b.brand_name}>
                        {b.brand_name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.brand && <p className="text-sm text-red-500 mt-1">{fieldErrors.brand}</p>}
                </div>

                <div className="form-group">
                  <label>Variant Name</label>
                  <input type="text" value={variantName} onChange={e => setVariantName(e.target.value)} placeholder="e.g. Aloo Bhujia 200g" />
                </div>

                <div className="form-group">
                  <label>Pack Size</label>
                  <input type="text" value={packSize} onChange={e => setPackSize(e.target.value)} placeholder="e.g. 12×200g" />
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={selectedCategory}
                    onChange={e => {
                      setSelectedCategory(e.target.value);
                      if (fieldErrors.category) setFieldErrors(p => ({ ...p, category: undefined }));
                    }}
                    className={fieldErrors.category ? 'border-red-500' : ''}
                  >
                    <option value="">Select a Category...</option>
                    {categoriesList.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                  {fieldErrors.category && <p className="text-sm text-red-500 mt-1">{fieldErrors.category}</p>}
                </div>

                {selectedCategory === 'Other' && (
                  <div className="form-group">
                    <label>Custom Category *</label>
                    <input
                      type="text"
                      value={customCategory}
                      onChange={e => {
                        setCustomCategory(e.target.value);
                        if (fieldErrors.category) setFieldErrors(p => ({ ...p, category: undefined }));
                      }}
                      placeholder="e.g. Chocolates, Sweets, Confectionery"
                      className={fieldErrors.category ? 'border-red-500' : ''}
                    />
                    <p className="text-xs text-gray-500 mt-1">Multiple categories can be separated by comma</p>
                    {fieldErrors.category && <p className="text-sm text-red-500 mt-1">{fieldErrors.category}</p>}
                  </div>
                )}

                <div className="form-group">
                  <label>SKU</label>
                  <input type="text" value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. BIK-AB-200" />
                </div>

                <div className="form-group full-width">
                  <label>Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional product details…" />
                </div>
              </div>

              {/* ── Regulatory & Trade (collapsible) ── */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowReg(v => !v)}
                  className="flex items-center gap-2 text-xs font-bold text-indigo-700 uppercase tracking-wider hover:text-indigo-900 transition-colors"
                >
                  <svg
                    className={`w-4 h-4 transition-transform duration-200 ${showReg ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Regulatory &amp; Trade Details
                </button>

                {showReg && (
                  <div className="form-grid mt-4 pt-4 border-t border-gray-100">
                    <div className="form-group">
                      <label>MRP (₹) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mrp}
                        onChange={e => { setMrp(e.target.value); if (fieldErrors.mrp) setFieldErrors(p => ({ ...p, mrp: undefined })); }}
                        placeholder="e.g. 35.00"
                        className={fieldErrors.mrp ? 'border-red-500' : ''}
                      />
                      {fieldErrors.mrp && <p className="text-sm text-red-500 mt-1">{fieldErrors.mrp}</p>}
                    </div>

                    <div className="form-group">
                      <label>Barcode (EAN / UPC)</label>
                      <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="e.g. 8901234567890" />
                    </div>

                    <div className="form-group">
                      <label>HSN Code *</label>
                      <input
                        type="text"
                        value={hsnCode}
                        onChange={e => { setHsnCode(e.target.value); if (fieldErrors.hsnCode) setFieldErrors(p => ({ ...p, hsnCode: undefined })); }}
                        placeholder="e.g. 2106"
                        className={fieldErrors.hsnCode ? 'border-red-500' : ''}
                      />
                      {fieldErrors.hsnCode && <p className="text-sm text-red-500 mt-1">{fieldErrors.hsnCode}</p>}
                    </div>

                    <div className="form-group">
                      <label>Country of Origin</label>
                      <input type="text" value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} placeholder="India" />
                    </div>

                    <div className="form-group">
                      <label>Manufacturer Name *</label>
                      <input
                        type="text"
                        value={mfgName}
                        onChange={e => { setMfgName(e.target.value); if (fieldErrors.mfgName) setFieldErrors(p => ({ ...p, mfgName: undefined })); }}
                        placeholder="e.g. Bikaji Foods International Ltd."
                        className={fieldErrors.mfgName ? 'border-red-500' : ''}
                      />
                      {fieldErrors.mfgName && <p className="text-sm text-red-500 mt-1">{fieldErrors.mfgName}</p>}
                    </div>

                    <div className="form-group">
                      <label>Product Status</label>
                      <select
                        value={productStatus}
                        onChange={e => setProductStatus(e.target.value as 'active' | 'recalled')}
                        style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: '0.875rem', background: 'white', color: '#111827' }}
                      >
                        <option value="active">Active</option>
                        <option value="recalled">Recalled</option>
                      </select>
                    </div>

                    <div className="form-group full-width">
                      <label>Manufacturer Address *</label>
                      <textarea
                        value={mfgAddress}
                        onChange={e => { setMfgAddress(e.target.value); if (fieldErrors.mfgAddress) setFieldErrors(p => ({ ...p, mfgAddress: undefined })); }}
                        placeholder="Full manufacturer address as printed on packaging"
                        className={fieldErrors.mfgAddress ? 'border-red-500' : ''}
                      />
                      {fieldErrors.mfgAddress && <p className="text-sm text-red-500 mt-1">{fieldErrors.mfgAddress}</p>}
                    </div>

                    <div className="form-group full-width">
                      <label>Notes / Remarks</label>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal QC notes or remarks…" />
                    </div>
                  </div>
                )}
              </div>

              {generalError && <p className="text-sm text-red-600 mt-4 whitespace-pre-line">{generalError}</p>}

              <div className="form-actions">
                <button type="button" onClick={handleClose} className="cancel-btn">Cancel</button>
                <button type="button" onClick={goToStep2} className="create-btn">Next →</button>
              </div>
            </>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ STEP 2 ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 2 && (
            <>
              <div className="product-form-section mt-0 pt-0 border-t-0">
                <p className="product-form-section-title">AI Verification Reference Images</p>
                <p className="product-form-section-hint">
                  Official reference images for AI verification. Required: front, back, label/serial, and print design file.
                  Optional: side view, packaging, holograms, barcode, and seals. Max 5 MB per image.
                </p>

                {fieldErrors.images && (
                  <p className="text-sm text-red-600 mt-2">{fieldErrors.images}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
                  {slots.map(slot => {
                    const inputId = `prd-ref-${slot.key}`;
                    return (
                      <div
                        key={slot.key}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); updateSlot(slot.key, e.dataTransfer.files?.[0] || null, slots, setSlots); }}
                        className={`relative rounded-xl border-2 border-dashed p-3 min-h-[168px] transition-all ${
                          slot.previewUrl
                            ? 'border-indigo-300 bg-indigo-50/40'
                            : 'border-gray-200 hover:border-gray-900 bg-white hover:bg-gray-50/70'
                        }`}
                      >
                        {slot.previewUrl ? (
                          <div className="h-full flex flex-col">
                            <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-white aspect-[4/3]">
                              <img src={slot.previewUrl} alt={slot.title} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeSlot(slot.key, setSlots)}
                                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
                                title="Remove"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <div className="pt-2 min-w-0">
                              <p className="text-[11px] font-black text-gray-900 truncate">{slot.title}</p>
                              <p className="text-[10px] font-mono text-gray-400 truncate">
                                {slot.file?.name} • {((slot.file?.size || 0) / 1024).toFixed(0)} KB
                              </p>
                              <label htmlFor={inputId} className="inline-flex mt-1.5 text-[10px] font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer">
                                Replace image
                              </label>
                            </div>
                          </div>
                        ) : (
                          <label htmlFor={inputId} className="cursor-pointer h-full flex flex-col items-center justify-center text-center gap-2">
                            <span className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <SlotIcon icon={slot.icon} />
                              </svg>
                            </span>
                            <span className="text-xs font-black text-gray-900 leading-tight">
                              {slot.title} {slot.required && <span className="text-indigo-600">*</span>}
                            </span>
                            <span className="text-[10px] text-gray-500 leading-snug max-w-[180px]">{slot.description}</span>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pt-1">Tap or drop image</span>
                          </label>
                        )}
                        <input
                          id={inputId}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/jpg"
                          capture="environment"
                          className="hidden"
                          onChange={e => {
                            updateSlot(slot.key, e.target.files?.[0] || null, slots, setSlots);
                            e.target.value = '';
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {fieldErrors.images && (
                <p className="text-sm text-red-600 mt-4 whitespace-pre-line">{fieldErrors.images}</p>
              )}

              {generalError && (
                <p className="text-sm text-red-600 mt-4 whitespace-pre-line">{generalError}</p>
              )}

              <div className="form-actions">
                <button type="button" onClick={() => setStep(1)} disabled={creating} className="cancel-btn">
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={creating || created || productLimitReached}
                  className="create-btn"
                >
                  {productLimitReached
                    ? 'Product Limit Reached'
                    : created
                    ? 'Created ✓'
                    : creating
                    ? 'Creating…'
                    : '+ Create Product'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
