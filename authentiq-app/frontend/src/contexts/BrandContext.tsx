'use client';

/**
 * BrandContext — Multi-brand support for the Vendor portal.
 *
 * Provides:
 *   - brands       : full list of Brand objects for the current vendor
 *   - activeBrand  : the currently selected Brand (persisted in localStorage)
 *   - setActiveBrand : switch the active brand by id
 *   - refreshBrands  : re-fetch brand list from API
 *
 * The active brand id is stored as `authentiq_active_brand_id` in localStorage
 * so it survives page refreshes. If the stored id is no longer valid (brand
 * deleted / deactivated), the context falls back to the first active brand.
 *
 * All vendor pages should wrap inside <BrandProvider> (see vendor/layout.tsx).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { getBrands } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Brand {
  id: string;
  vendor_id: string;
  brand_name: string;
  brand_display_name?: string | null;
  brand_logo_url?: string | null;
  brand_tagline?: string | null;
  product_categories: string[];
  status: 'active' | 'inactive';
  created_at: string;
  updated_at?: string | null;
}

interface BrandContextValue {
  brands: Brand[];
  activeBrand: Brand | null;
  activeBrandId: string | null;
  isLoading: boolean;
  setActiveBrand: (id: string) => void;
  clearActiveBrand: () => void;
  refreshBrands: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const BrandContext = createContext<BrandContextValue>({
  brands: [],
  activeBrand: null,
  activeBrandId: null,
  isLoading: true,
  setActiveBrand: () => {},
  clearActiveBrand: () => {},
  refreshBrands: async () => {},
});

const STORAGE_KEY = 'authentiq_active_brand_id';

// ── Provider ──────────────────────────────────────────────────────────────────

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBrands = useCallback(async () => {
    try {
      const data = await getBrands();
      const list: Brand[] = data.brands ?? [];
      setBrands(list);
      return list;
    } catch {
      // Not logged in yet or network error — silently return empty list.
      // The vendor login page handles auth errors separately.
      setBrands([]);
      return [] as Brand[];
    }
  }, []);

  // On mount: load brands and restore active brand from localStorage
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const list = await fetchBrands();

      const storedId =
        typeof window !== 'undefined'
          ? localStorage.getItem(STORAGE_KEY)
          : null;

      const activeBrands = list.filter((b) => b.status === 'active');
      
      let resolvedId: string | null = null;
      if (storedId === 'all') {
        resolvedId = 'all';
      } else if (storedId && activeBrands.some((b) => b.id === storedId)) {
        resolvedId = storedId;
      } else {
        resolvedId = activeBrands[0]?.id ?? null;
      }

      setActiveBrandId(resolvedId);

      if (resolvedId && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, resolvedId);
      }

      setIsLoading(false);
    })();
  }, [fetchBrands]);

  const setActiveBrand = useCallback((id: string) => {
    setActiveBrandId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const clearActiveBrand = useCallback(() => {
    setActiveBrandId(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refreshBrands = useCallback(async () => {
    const list = await fetchBrands();
    if (activeBrandId && activeBrandId !== 'all') {
      const stillValid = list.some(
        (b) => b.id === activeBrandId && b.status === 'active'
      );
      if (!stillValid) {
        const first = list.find((b) => b.status === 'active') ?? null;
        setActiveBrandId(first?.id ?? null);
        if (first && typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, first.id);
        }
      }
    }
  }, [fetchBrands, activeBrandId]);

  const activeBrand =
    brands.find((b) => b.id === activeBrandId) ?? null;

  return (
    <BrandContext.Provider
      value={{
        brands,
        activeBrand,
        activeBrandId,
        isLoading,
        setActiveBrand,
        clearActiveBrand,
        refreshBrands,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBrand() {
  return useContext(BrandContext);
}

export default BrandContext;
