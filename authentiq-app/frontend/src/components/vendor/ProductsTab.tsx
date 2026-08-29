import React, { useState, useEffect, useRef, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  createProduct,
  uploadProductReferenceImage,
  deleteProduct,
  generateQR,
  waitForProductEmbeddings,
  deleteProductReferenceImage,
  getProductById,
  updateProduct as updateProductAPI,
  type ProductEmbeddingStatus,
} from '@/services/api';
import ProductRegistrationDrawer from './ProductRegistrationDrawer';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

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
  verification_url?: string;
  qr_primary_color?: string;
  qr_secondary_color?: string;
  qr_use_logo?: boolean;
  scan_count?: number;
  mrp?: number;
  hsn_code?: string;
  manufacturer_name?: string;
  manufacturer_address?: string;
  barcode?: string;
  country_of_origin?: string;
  variant_name?: string;
  pack_size?: string;
}

interface ProductEditForm {
  name: string;
  sku: string;
  category: string;
  description: string;
  mrp: string;
  hsn_code: string;
  manufacturer_name: string;
  manufacturer_address: string;
  barcode: string;
  country_of_origin: string;
  variant_name: string;
  pack_size: string;
}

const emptyEditForm: ProductEditForm = {
  name: '',
  sku: '',
  category: '',
  description: '',
  mrp: '',
  hsn_code: '',
  manufacturer_name: '',
  manufacturer_address: '',
  barcode: '',
  country_of_origin: '',
  variant_name: '',
  pack_size: '',
};

const productToEditForm = (product: Product): ProductEditForm => ({
  name: product.name || '',
  sku: product.sku || '',
  category: product.category || '',
  description: product.description || '',
  mrp: product.mrp !== undefined && product.mrp !== null ? String(product.mrp) : '',
  hsn_code: product.hsn_code || '',
  manufacturer_name: product.manufacturer_name || '',
  manufacturer_address: product.manufacturer_address || '',
  barcode: product.barcode || '',
  country_of_origin: product.country_of_origin || '',
  variant_name: product.variant_name || '',
  pack_size: product.pack_size || '',
});

const editInputClass = 'w-full text-sm font-bold text-gray-800 bg-white border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

type ReferenceSlotKey =
  | 'front_view'
  | 'back_view'
  | 'side_view'
  | 'packaging'
  | 'labels'
  | 'holograms'
  | 'barcode_qr'
  | 'seals'
  | 'additional_markers';

interface ReferenceSlotConfig {
  key: ReferenceSlotKey;
  uploadViewType: string;
  title: string;
  description: string;
  required?: boolean;
  icon: 'camera' | 'box' | 'tag' | 'shield' | 'qr' | 'seal' | 'plus';
}

interface ReferenceSlotState extends ReferenceSlotConfig {
  file: File | null;
  previewUrl: string | null;
}

const REFERENCE_SLOT_CONFIGS: ReferenceSlotConfig[] = [
  {
    key: 'front_view',
    uploadViewType: 'front_view',
    title: 'Product Front View',
    description: 'Straight-on official image with logo and primary design visible.',
    required: true,
    icon: 'camera',
  },
  {
    key: 'back_view',
    uploadViewType: 'back_view',
    title: 'Product Back View',
    description: 'Back side, serial placement, engravings, and rear detailing.',
    required: true,
    icon: 'camera',
  },
  {
    key: 'labels',
    uploadViewType: 'labels',
    title: 'Product Labels / Serial',
    description: 'Close-up of tags, serial labels, wash labels, or micro-print. Required for AI verification.',
    required: true,
    icon: 'tag',
  },
  {
    key: 'additional_markers',
    uploadViewType: 'additional_markers',
    title: 'Upload print design file',
    description: 'High-quality print design file or digital artwork. Required for AI layout matching.',
    required: true,
    icon: 'plus',
  },
  {
    key: 'side_view',
    uploadViewType: 'side_view',
    title: 'Product Side View',
    description: 'Profile angle showing shape, seams, edges, and thickness.',
    icon: 'camera',
  },
  {
    key: 'packaging',
    uploadViewType: 'packaging',
    title: 'Packaging View (Optional)',
    description: 'Outer box or retail packaging — optional advanced reference for back-view matching.',
    icon: 'box',
  },
  {
    key: 'holograms',
    uploadViewType: 'holograms',
    title: 'Holograms / Security Marks',
    description: 'Security foil, holographic sticker, or brand authenticity mark.',
    icon: 'shield',
  },
  {
    key: 'barcode_qr',
    uploadViewType: 'barcode_qr',
    title: 'Barcode / QR Area',
    description: 'Barcode, QR label, SKU sticker, or scannable identifier.',
    icon: 'qr',
  },
  {
    key: 'seals',
    uploadViewType: 'seals',
    title: 'Seal / Stitch / Authenticity Marker',
    description: 'Tamper seal, stitch detail, embossing, clasp, or material marker.',
    icon: 'seal',
  },
];

const createReferenceSlots = (): ReferenceSlotState[] =>
  REFERENCE_SLOT_CONFIGS.map(slot => ({ ...slot, file: null, previewUrl: null }));

const ReferenceSlotIcon = ({ icon }: { icon: ReferenceSlotConfig['icon'] }) => {
  if (icon === 'box') {
    return <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L21 7v10l-9 5-9-5V7l9-5zm0 10V22m0-10L3 7m9 5l9-5" />;
  }
  if (icon === 'tag') {
    return <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M3 11.5V6a3 3 0 013-3h5.5a2 2 0 011.414.586l7.5 7.5a2 2 0 010 2.828l-6.5 6.5a2 2 0 01-2.828 0l-7.5-7.5A2 2 0 013 11.5z" />;
  }
  if (icon === 'shield') {
    return <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v5c0 4.5-2.9 7.7-7 9-4.1-1.3-7-4.5-7-9V7l7-4z" />;
  }
  if (icon === 'qr') {
    return <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h2m4 0h-2m-4 4h6m-6 2h2" />;
  }
  if (icon === 'seal') {
    return <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-5m5 3a8 8 0 11-16 0 8 8 0 0116 0z" />;
  }
  if (icon === 'plus') {
    return <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />;
  }
  return <><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></>;
};

interface ProductsTabProps {
  products: Product[];
  fetchData: () => Promise<void>;
  refetchPlan: () => Promise<void>;
  isWithinLimit: (type: 'products' | 'batches', currentCount: number) => boolean;
  user: any;
  activeBrand: any;
  brands: any[];
  vendorLocation: string;
  setLocalActivities: React.Dispatch<React.SetStateAction<any[]>>;
  isProductDrawerOpen: boolean;
  setIsProductDrawerOpen: (open: boolean) => void;
  showSuccess: (msg: string) => void;
  vendorQRLogoImage: string | null;
  handleGenerateQR: (productId: string) => Promise<void>;
  handleViewQR: (product: Product) => void;
}

export default function ProductsTab({
  products,
  fetchData,
  refetchPlan,
  isWithinLimit,
  user,
  activeBrand,
  brands,
  vendorLocation,
  setLocalActivities,
  isProductDrawerOpen,
  setIsProductDrawerOpen,
  showSuccess,
  vendorQRLogoImage,
  handleGenerateQR,
  handleViewQR,
}: ProductsTabProps) {
  // AI Verification Reference Images States
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUploading, setDetailUploading] = useState(false);
  const [embeddingsProcessing, setEmbeddingsProcessing] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<ProductEmbeddingStatus | null>(null);
  const [modalReferenceSlots, setModalReferenceSlots] = useState<ReferenceSlotState[]>(() => createReferenceSlots());
  const modalReferenceSlotsRef = useRef(modalReferenceSlots);
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editForm, setEditForm] = useState<ProductEditForm>(emptyEditForm);
  const [savingDetails, setSavingDetails] = useState(false);
  const savingDetailsRef = useRef(false);

  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    modalReferenceSlotsRef.current = modalReferenceSlots;
  }, [modalReferenceSlots]);

  const revokeReferenceSlotPreviews = (slotsList: ReferenceSlotState[]) => {
    slotsList.forEach(slot => {
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    });
  };

  const updateReferenceSlotFile = (
    key: ReferenceSlotKey,
    file: File | null,
    slotsList: ReferenceSlotState[],
    setSlots: React.Dispatch<React.SetStateAction<ReferenceSlotState[]>>
  ) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      setImageError(`Invalid file type: "${file.name}". Only JPG, PNG, and WEBP are allowed.`);
      return;
    }
    if (file.size > maxSize) {
      setImageError(`File too large: "${file.name}" exceeds the 5MB size limit.`);
      return;
    }
    const isDuplicate = slotsList.some(slot => slot.key !== key && slot.file && slot.file.name === file.name && slot.file.size === file.size);
    if (isDuplicate) {
      setImageError(`Duplicate Image Error: "${file.name}" is already selected in another slot.`);
      return;
    }

    // Clear previous error if successful
    setImageError(null);

    const previewUrl = URL.createObjectURL(file);
    setSlots(prev => prev.map(slot => {
      if (slot.key !== key) return slot;
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      return { ...slot, file, previewUrl };
    }));
  };

  const removeReferenceSlotFile = (
    key: ReferenceSlotKey,
    setSlots: React.Dispatch<React.SetStateAction<ReferenceSlotState[]>>
  ) => {
    // Clear error on removal
    setImageError(null);
    setSlots(prev => prev.map(slot => {
      if (slot.key !== key) return slot;
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      return { ...slot, file: null, previewUrl: null };
    }));
  };

  const openProductDrawer = () => {
    if (user?.role === 'Viewer') {
      alert('Access Denied: You do not have permission to add new products.');
      return;
    }
    setError(null);
    setIsProductDrawerOpen(true);
  };

  const closeProductDrawer = () => {
    setIsProductDrawerOpen(false);
  };

  const handleViewProductDetails = async (product: Product, startInEdit: boolean = false) => {
    setSelectedProductDetail(product);
    setEditingBrand(product.brand);
    setEmbeddingStatus(null);
    setDetailLoading(true);
    setImageError(null);
    setIsEditingDetails(false);
    revokeReferenceSlotPreviews(modalReferenceSlots);
    setModalReferenceSlots(createReferenceSlots());
    try {
      const fullProduct = await getProductById(product.id);
      setSelectedProductDetail(fullProduct);
      setEditingBrand(fullProduct.brand);
      if (startInEdit) {
        setEditForm(productToEditForm(fullProduct));
        setIsEditingDetails(true);
      }
    } catch (err: any) {
      console.error('Error loading product details:', err);
      alert(`Error loading product details: ${err.message || 'Unknown error'}`);
      setSelectedProductDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEditProductClick = (product: Product) => {
    if (user?.role === 'Viewer') {
      alert('Access Denied: You do not have permission to edit products.');
      return;
    }
    handleViewProductDetails(product, true);
  };

  const startEditingDetails = () => {
    if (!selectedProductDetail) return;
    setEditForm(productToEditForm(selectedProductDetail));
    setIsEditingDetails(true);
  };

  const cancelEditingDetails = () => {
    setIsEditingDetails(false);
    setEditForm(emptyEditForm);
  };

  const handleSaveDetails = async () => {
    if (!selectedProductDetail) return;
    if (savingDetailsRef.current) return;
    if (!editForm.name.trim()) {
      alert('Product name cannot be empty.');
      return;
    }
    savingDetailsRef.current = true;
    setSavingDetails(true);
    try {
      const payload: Record<string, any> = {
        name: editForm.name.trim(),
        sku: editForm.sku,
        category: editForm.category,
        description: editForm.description,
        hsn_code: editForm.hsn_code,
        manufacturer_name: editForm.manufacturer_name,
        manufacturer_address: editForm.manufacturer_address,
        barcode: editForm.barcode,
        country_of_origin: editForm.country_of_origin,
        variant_name: editForm.variant_name,
        pack_size: editForm.pack_size,
      };
      if (editForm.mrp.trim() !== '') {
        const mrpNum = Number(editForm.mrp);
        if (Number.isNaN(mrpNum) || mrpNum < 0) {
          alert('MRP must be a valid non-negative number.');
          savingDetailsRef.current = false;
          setSavingDetails(false);
          return;
        }
        payload.mrp = mrpNum;
      }
      await updateProductAPI(selectedProductDetail.id, payload);
      showSuccess('Product details updated successfully.');
      const fullProduct = await getProductById(selectedProductDetail.id);
      setSelectedProductDetail(fullProduct);
      setIsEditingDetails(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to update product details.');
    } finally {
      savingDetailsRef.current = false;
      setSavingDetails(false);
    }
  };

  const handleUpdateProductBrand = async (productId: string, newBrand: string) => {
    try {
      await updateProductAPI(productId, { brand: newBrand });
      showSuccess('Brand updated successfully');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to update brand');
    }
  };

  const handleDeleteReferenceImage = async (productId: string, imageId: string) => {
    if (user?.role === 'Viewer') {
      alert('Access Denied: You do not have permission to delete reference images.');
      return;
    }
    if (!confirm('Are you sure you want to delete this reference image?')) return;
    try {
      await deleteProductReferenceImage(productId, imageId);
      showSuccess('Reference image deleted successfully.');
      const fullProduct = await getProductById(productId);
      setSelectedProductDetail(fullProduct);
      fetchData();
    } catch (err: any) {
      alert(`Failed to delete image: ${err.message}`);
    }
  };

  const handleUploadModalImages = async () => {
    if (!selectedProductDetail) return;
    const filesToUpload = modalReferenceSlots.filter(slot => slot.file);
    if (filesToUpload.length === 0) return;
    setDetailUploading(true);
    const uploadErrors: string[] = [];
    try {
      for (const item of filesToUpload) {
        try {
          await uploadProductReferenceImage(selectedProductDetail.id, item.file!, item.uploadViewType);
        } catch (uploadErr: any) {
          uploadErrors.push(`${item.title}: ${uploadErr.message || 'Upload failed'}`);
        }
      }
      revokeReferenceSlotPreviews(modalReferenceSlots);
      setModalReferenceSlots(createReferenceSlots());
      if (uploadErrors.length === 0) {
        setEmbeddingsProcessing(true);
        try {
          const emb = await waitForProductEmbeddings(selectedProductDetail.id, {
            onProgress: setEmbeddingStatus,
          });
          setEmbeddingStatus(emb);
          if (emb.embeddings_status === 'ready') {
            showSuccess('Reference images uploaded — AI embeddings ready.');
          } else {
            alert(
              `Images uploaded, but embeddings are ${emb.embeddings_status} ` +
              `(${emb.embeddings_ready_count}/${emb.embeddings_total_count}). ` +
              'Verification may still succeed on first customer scan.'
            );
          }
        } catch (embErr: any) {
          alert(`Images uploaded, but embedding processing failed: ${embErr.message}`);
        } finally {
          setEmbeddingsProcessing(false);
        }
      } else {
        alert(`Some reference images failed to upload:\n${uploadErrors.join('\n')}`);
      }
      const fullProduct = await getProductById(selectedProductDetail.id);
      setSelectedProductDetail(fullProduct);
      fetchData();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setDetailUploading(false);
    }
  };

  const handleGenerateProductQR = async (product: Product) => {
    setError(null);
    try {
      await handleGenerateQR(product.id);
    } catch (err: any) {
      alert(err.message || 'Error generating product QR code.');
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap justify-between items-center mb-8 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Product Registry</h1>
          {activeBrand ? (
            <div className="flex items-center gap-2 mt-1">
              {activeBrand.brand_logo_url && (
                <img
                  src={`${API_BASE}${activeBrand.brand_logo_url}`}
                  alt={activeBrand.brand_name}
                  className="w-4 h-4 rounded object-cover"
                />
              )}
              <p className="text-sm font-semibold text-indigo-600">
                {activeBrand.brand_name}
              </p>
              <span className="text-[10px] text-slate-400">— showing brand products only</span>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-0.5">All products across all brands.</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-slate-400 border border-slate-200 bg-white px-3 py-1.5 rounded-full uppercase tracking-wider shadow-3xs">
            {products.length} Products
          </span>
          <button onClick={openProductDrawer} className="bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shadow-xs cursor-pointer">
            + New Product
          </button>
        </div>
      </header>

      {products.length === 0 ? (
        <div className="bg-white p-20 rounded-2xl border border-slate-200/70 shadow-sm text-center">
          {activeBrand ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-slate-700 font-semibold text-base">No products for <span className="text-indigo-600">{activeBrand.brand_name}</span> yet.</p>
              <p className="text-slate-440 text-sm mt-1">Products you add will appear here, linked to this brand.</p>
              <button onClick={openProductDrawer} className="mt-5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                + Add First Product for {activeBrand.brand_name}
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-500 font-medium">No products registered yet.</p>
              <button onClick={openProductDrawer} className="mt-4 text-sm font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-4">
                Create your first product →
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(product => {
            const scansCount = product.scan_count || 0;
            const hasQR = !!product.qr_id;

            return (
              <div
                key={product.id}
                onClick={() => handleViewProductDetails(product)}
                className="bg-white rounded-2xl border border-slate-200/70 shadow-2xs flex flex-col justify-between overflow-hidden transition-all hover:shadow-xs cursor-pointer"
              >
                <div className="p-6 pb-4">
                  <div className="flex justify-between items-start">
                    <div className="max-w-[70%]">
                      <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase block">
                        SKU: {product.sku || '—'}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight mt-0.5 truncate">
                        {product.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Brand: <span className="text-slate-700 font-semibold">{product.brand}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="block text-3xl font-bold text-slate-900 leading-none">{scansCount}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-1">Total Scans</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${hasQR ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="text-xs font-semibold text-slate-600">
                        {hasQR ? 'QR Generated' : 'No QR Code'}
                      </span>
                    </div>

                    {product.category && product.category !== '—' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 tracking-wider uppercase">
                        {product.category}
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-4 mt-5">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">Product Specifications</span>
                    <span className="text-xs font-medium text-slate-400 italic block mt-1 line-clamp-2">
                      {product.description || 'No custom variants registered.'}
                    </span>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {hasQR ? (
                    <button
                      onClick={() => handleViewQR(product)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 font-bold text-slate-800 text-xs rounded-xl shadow-3xs cursor-pointer transition-colors"
                    >
                      <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      View QR
                    </button>
                  ) : (
                    <button
                      onClick={() => handleGenerateProductQR(product)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-slate-950 hover:bg-slate-900 font-bold text-white text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Generate QR
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditProductClick(product);
                    }}
                    className="p-2 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-slate-600 hover:text-indigo-600 rounded-xl transition-colors cursor-pointer"
                    title="Edit Product"
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (user?.role === 'Viewer') {
                        alert('Access Denied: You do not have permission to delete products.');
                        return;
                      }
                      if (!confirm('Are you sure you want to delete this product? It will be archived and inaccessible.')) return;
                      try {
                        await deleteProduct(product.id);
                        showSuccess('Product deleted successfully.');

                        const d = new Date();
                        const dateStr = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getFullYear()).slice(-2);
                        const hours = String(d.getHours()).padStart(2, '0');
                        const minutes = String(d.getMinutes()).padStart(2, '0');
                        const seconds = String(d.getSeconds()).padStart(2, '0');
                        const timeStr = `${hours}:${minutes}:${seconds}`;

                        const newActivity = {
                          id: `DELETE-${product.id}-${d.getTime()}`,
                          verificationState: `Product Deleted: ${product.name}`,
                          date: dateStr,
                          time: timeStr,
                          place: vendorLocation,
                          statusType: 'alert',
                          user_email: user?.email,
                          parsedTime: d.getTime(),
                        };
                        setLocalActivities(prev => [newActivity, ...prev]);

                        fetchData();
                      } catch (err: any) {
                        alert(err.message || 'Failed to delete product');
                      }
                    }}
                    className="p-2 border border-slate-200 hover:bg-red-50 hover:border-red-200 text-red-500 rounded-xl transition-colors cursor-pointer"
                    title="Delete Product"
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Product Form Drawer */}
      <ProductRegistrationDrawer
        isOpen={isProductDrawerOpen}
        onClose={closeProductDrawer}
        onProductCreated={async (productId, productName) => {
          const d = new Date();
          const dateStr = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getFullYear()).slice(-2);
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          const seconds = String(d.getSeconds()).padStart(2, '0');
          const timeStr = `${hours}:${minutes}:${seconds}`;

          const newActivity = {
            id: `ADD-${productId}-${d.getTime()}`,
            verificationState: `Product Added: ${productName}`,
            date: dateStr,
            time: timeStr,
            place: vendorLocation,
            statusType: 'success',
            user_email: user?.email,
            parsedTime: d.getTime(),
          };
          setLocalActivities(prev => [newActivity, ...prev]);

          await fetchData();
          try { await refetchPlan(); } catch { }
        }}
        productLimitReached={!isWithinLimit('products', products.length)}
      />



      {/* Product Detail & AI Reference Images Modal */}
      {selectedProductDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                revokeReferenceSlotPreviews(modalReferenceSlots);
                setModalReferenceSlots(createReferenceSlots());
                setSelectedProductDetail(null);
                setIsEditingDetails(false);
                setEditForm(emptyEditForm);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 z-10 p-1 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {detailLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                <p className="text-sm font-semibold text-gray-500">Loading product details...</p>
              </div>
            ) : (
              <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1 mr-3">
                    {isEditingDetails ? (
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Product Name"
                        className="text-xl font-bold text-gray-900 mb-1 w-full border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    ) : (
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{selectedProductDetail.name}</h3>
                    )}
                    {user?.role !== 'Viewer' ? (
                      <div className="flex items-center gap-2 mt-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Brand:</label>
                        <select
                          value={editingBrand || selectedProductDetail.brand}
                          onChange={(e) => setEditingBrand(e.target.value)}
                          className="text-xs font-bold text-indigo-600 uppercase tracking-wider bg-transparent border-b border-indigo-200 focus:border-indigo-500 outline-none cursor-pointer"
                        >
                          {brands.map((brand: any) => (
                            <option key={brand.id} value={brand.brand_name}>
                              {brand.brand_name}
                            </option>
                          ))}
                        </select>
                        {editingBrand !== selectedProductDetail.brand && (
                          <button
                            onClick={() => handleUpdateProductBrand(selectedProductDetail.id, editingBrand || selectedProductDetail.brand)}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                          >
                            Save
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{selectedProductDetail.brand}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isEditingDetails ? (
                      <>
                        <button
                          onClick={cancelEditingDetails}
                          disabled={savingDetails}
                          className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveDetails}
                          disabled={savingDetails}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {savingDetails ? 'Saving…' : 'Save Changes'}
                        </button>
                      </>
                    ) : (
                      <>
                        {user?.role !== 'Viewer' && (
                          <button
                            onClick={startEditingDetails}
                            className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Product Details"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (user?.role === 'Viewer') {
                              alert('Access Denied: You do not have permission to delete products.');
                              return;
                            }
                            if (!confirm('Are you sure you want to delete this product? It will be archived and inaccessible.')) return;
                            try {
                              const deletedProdName = selectedProductDetail.name;
                              const deletedProdId = selectedProductDetail.id;
                              await deleteProduct(deletedProdId);
                              setSelectedProductDetail(null);
                              showSuccess('Product deleted successfully.');

                              const d = new Date();
                              const dateStr = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getFullYear()).slice(-2);
                              const hours = String(d.getHours()).padStart(2, '0');
                              const minutes = String(d.getMinutes()).padStart(2, '0');
                              const seconds = String(d.getSeconds()).padStart(2, '0');
                              const timeStr = `${hours}:${minutes}:${seconds}`;

                              const newActivity = {
                                id: `DELETE-${deletedProdId}-${d.getTime()}`,
                                verificationState: `Product Deleted: ${deletedProdName}`,
                                date: dateStr,
                                time: timeStr,
                                place: vendorLocation,
                                statusType: 'alert',
                                user_email: user?.email,
                                parsedTime: d.getTime(),
                              };
                              setLocalActivities(prev => [newActivity, ...prev]);

                              fetchData();
                            } catch (err: any) {
                              alert(err.message || 'Failed to delete product');
                            }
                          }}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Product"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm">
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">SKU</span>
                    {isEditingDetails ? (
                      <input type="text" value={editForm.sku} onChange={(e) => setEditForm(prev => ({ ...prev, sku: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-mono font-bold text-gray-800">{selectedProductDetail.sku || '—'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Category</span>
                    {isEditingDetails ? (
                      <input type="text" value={editForm.category} onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-bold text-gray-800">{selectedProductDetail.category || '—'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">MRP (₹)</span>
                    {isEditingDetails ? (
                      <input type="number" step="0.01" min="0" value={editForm.mrp} onChange={(e) => setEditForm(prev => ({ ...prev, mrp: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-bold text-gray-800">{selectedProductDetail.mrp || '—'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">HSN Code</span>
                    {isEditingDetails ? (
                      <input type="text" value={editForm.hsn_code} onChange={(e) => setEditForm(prev => ({ ...prev, hsn_code: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-bold text-gray-800">{selectedProductDetail.hsn_code || '—'}</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Manufacturer Name</span>
                    {isEditingDetails ? (
                      <input type="text" value={editForm.manufacturer_name} onChange={(e) => setEditForm(prev => ({ ...prev, manufacturer_name: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-bold text-gray-800">{selectedProductDetail.manufacturer_name || '—'}</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Manufacturer Address</span>
                    {isEditingDetails ? (
                      <textarea value={editForm.manufacturer_address} onChange={(e) => setEditForm(prev => ({ ...prev, manufacturer_address: e.target.value }))} rows={2} className={`${editInputClass} resize-none`} />
                    ) : (
                      <span className="text-gray-600 leading-relaxed">{selectedProductDetail.manufacturer_address || '—'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Barcode</span>
                    {isEditingDetails ? (
                      <input type="text" value={editForm.barcode} onChange={(e) => setEditForm(prev => ({ ...prev, barcode: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-bold text-gray-800">{selectedProductDetail.barcode || '—'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Country of Origin</span>
                    {isEditingDetails ? (
                      <input type="text" value={editForm.country_of_origin} onChange={(e) => setEditForm(prev => ({ ...prev, country_of_origin: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-bold text-gray-800">{selectedProductDetail.country_of_origin || '—'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Variant Name</span>
                    {isEditingDetails ? (
                      <input type="text" value={editForm.variant_name} onChange={(e) => setEditForm(prev => ({ ...prev, variant_name: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-bold text-gray-800">{selectedProductDetail.variant_name || '—'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Pack Size</span>
                    {isEditingDetails ? (
                      <input type="text" value={editForm.pack_size} onChange={(e) => setEditForm(prev => ({ ...prev, pack_size: e.target.value }))} className={editInputClass} />
                    ) : (
                      <span className="font-bold text-gray-800">{selectedProductDetail.pack_size || '—'}</span>
                    )}
                  </div>
                  <div className="col-span-2 border-t border-gray-100 pt-2.5 mt-1">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Description</span>
                    {isEditingDetails ? (
                      <textarea value={editForm.description} onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))} rows={3} className={`${editInputClass} resize-none`} />
                    ) : (
                      <span className="text-gray-600 leading-relaxed">{selectedProductDetail.description || 'No description provided.'}</span>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    AI Reference Images ({selectedProductDetail.reference_images?.length || 0})
                  </h4>

                  {(embeddingsProcessing || embeddingStatus) && (
                    <div className={`mb-3 rounded-lg border px-3 py-2 text-xs font-semibold ${embeddingStatus?.embeddings_status === 'ready'
                      ? 'bg-emerald-55 bg-emerald-50 border-emerald-200 text-emerald-800'
                      : embeddingsProcessing
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}>
                      {embeddingsProcessing && (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                          Generating AI embeddings…
                        </span>
                      )}
                      {!embeddingsProcessing && embeddingStatus && (
                        <span>
                          Embeddings: {embeddingStatus.embeddings_status} —{' '}
                          {embeddingStatus.embeddings_ready_count}/{embeddingStatus.embeddings_total_count} ready
                          {embeddingStatus.embeddings_status === 'ready' && ' ✓'}
                        </span>
                      )}
                    </div>
                  )}

                  {(!selectedProductDetail.reference_images || selectedProductDetail.reference_images.length === 0) ? (
                    <div className="bg-slate-50 border rounded-xl p-8 text-center text-xs font-semibold text-gray-400">
                      No AI reference images uploaded yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-64 overflow-y-auto pr-1">
                      {selectedProductDetail.reference_images.map((img: any) => (
                        <div key={img.id} className="relative group bg-gray-50 rounded-lg overflow-hidden border border-gray-200 flex flex-col">
                          <div className="relative aspect-square w-full bg-white border-b flex items-center justify-center overflow-hidden">
                            <img
                              src={`${API_BASE}${img.url}`}
                              alt={img.view_type}
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={() => handleDeleteReferenceImage(selectedProductDetail.id, img.id)}
                              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                              title="Delete Image"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          <div className="p-2 flex items-center justify-between text-[10px] font-bold">
                            <span className="capitalize text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {img.view_type.replace('_', ' ')}
                            </span>
                            <span className="text-gray-400">
                              {(img.size_bytes / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-5 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">Add More Reference Images</h4>
                    <p className="text-[11px] text-gray-400 font-medium mt-1">
                      Select the exact evidence category before uploading so future AI embeddings remain category-aware.
                    </p>
                  </div>

                  {imageError && (
                    <div className="bg-red-50 border border-red-200 text-red-650 text-red-600 rounded-xl p-3 text-xs font-bold leading-normal">
                      {imageError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                    {modalReferenceSlots.map(slot => {
                      const inputId = `modal-ref-${slot.key}`;
                      return (
                        <div
                          key={slot.key}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            updateReferenceSlotFile(slot.key, e.dataTransfer.files?.[0] || null, modalReferenceSlots, setModalReferenceSlots);
                          }}
                          className={`relative rounded-xl border-2 border-dashed p-3 min-h-[142px] transition-all ${slot.previewUrl
                            ? 'border-indigo-300 bg-indigo-50/40'
                            : 'border-gray-200 hover:border-gray-900 bg-white hover:bg-gray-50/70'
                            }`}
                        >
                          {slot.previewUrl ? (
                            <div className="flex items-center gap-3">
                              <img src={slot.previewUrl} alt={slot.title} className="w-16 h-16 object-cover rounded-lg bg-white border border-gray-200" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black text-gray-900 truncate">{slot.title}</p>
                                <p className="text-[10px] font-mono text-gray-400 truncate">{slot.file?.name} • {((slot.file?.size || 0) / 1024).toFixed(0)} KB</p>
                                <label htmlFor={inputId} className="inline-flex mt-2 text-[10px] font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer">
                                  Replace
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeReferenceSlotFile(slot.key, setModalReferenceSlots)}
                                className="p-1.5 rounded-full text-gray-400 hover:text-red-650 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Remove image"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ) : (
                            <label htmlFor={inputId} className="cursor-pointer h-full flex flex-col items-center justify-center text-center gap-2">
                              <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <ReferenceSlotIcon icon={slot.icon} />
                                </svg>
                              </span>
                              <span className="text-[11px] font-black text-gray-900 leading-tight">{slot.title}</span>
                              <span className="text-[10px] text-gray-500 leading-snug max-w-[160px]">{slot.description}</span>
                            </label>
                          )}
                          <input
                            id={inputId}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/jpg"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              updateReferenceSlotFile(slot.key, e.target.files?.[0] || null, modalReferenceSlots, setModalReferenceSlots);
                              e.target.value = '';
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {modalReferenceSlots.some(slot => slot.file) && (
                    <div className="space-y-3">
                      <button
                        onClick={handleUploadModalImages}
                        disabled={detailUploading}
                        className="w-full py-2.5 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-all disabled:opacity-50 text-sm"
                      >
                        {detailUploading ? 'Uploading Reference Images...' : 'Upload Selected Reference Images'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
