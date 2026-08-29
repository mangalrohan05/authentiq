// src/hooks/usePlan.ts
/**
 * usePlan — Vendor-side feature gating hook.
 *
 * Fetches the currently authenticated vendor's assigned plan from the backend.
 * Exposes:
 *   - plan        : raw plan data (feature_flags, limits, usage, status)
 *   - isLoading   : true while fetching
 *   - hasFeature  : (flagName) => boolean — checks feature_flags
 *   - isWithinLimit : (metric, count) => boolean — checks usage against limits
 *   - isActive    : true if subscription_status === 'active'
 */

import { useState, useEffect, useCallback } from 'react';
import { getMyPlan } from '@/services/api';

export interface PlanData {
  vendor_id: string;
  assigned_plan: string | null;
  plan_name: string | null;
  subscription_status: 'active' | 'suspended' | 'inactive' | 'expired';
  features: Record<string, any>;
  limits: {
    max_products: number;
    max_batches: number;
    max_scans_per_month: number;
    max_brands?: number;
    max_users?: number;
    max_storage_bytes?: number;
    max_api_calls?: number;
  };
  usage: {
    products_used: number;
    batches_used: number;
    scans_this_month: number;
    users_count?: number;
    storage_bytes?: number;
    api_calls_count?: number;
  };
}

const DEFAULT_PLAN: PlanData = {
  vendor_id: '',
  assigned_plan: null,
  plan_name: null,
  subscription_status: 'inactive',
  features: {},
  limits: { max_products: 0, max_batches: 0, max_scans_per_month: 0 },
  usage: { products_used: 0, batches_used: 0, scans_this_month: 0 },
};

export function usePlan(enabled = true) {
  const [plan, setPlan] = useState<PlanData>(DEFAULT_PLAN);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getMyPlan();
      setPlan(data);
      setError(null);
    } catch (err: any) {
      // Graceful degradation — don't crash UI, just log
      console.warn('[usePlan] Could not fetch plan:', err?.message);
      setError(err?.message || 'Failed to load plan');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  /** Returns true if the named feature flag is enabled on the current plan. */
  const hasFeature = useCallback(
    (flagName: keyof PlanData['features']): boolean => {
      if (plan.subscription_status !== 'active') return false;
      return plan.features[flagName] === true;
    },
    [plan]
  );

  /**
   * Returns true if the current usage count is within the plan limit.
   * metric: 'products' | 'batches' | 'scans'
   */
  const isWithinLimit = useCallback(
    (metric: 'products' | 'batches' | 'scans', currentCount: number): boolean => {
      if (plan.subscription_status !== 'active') return false;
      const limitMap: Record<string, number> = {
        products: plan.limits.max_products,
        batches: plan.limits.max_batches,
        scans: plan.limits.max_scans_per_month,
      };
      const limit = limitMap[metric];
      if (limit === undefined) return true;
      // -1 represents unlimited/infinite
      if (limit === -1) return true;
      return currentCount < limit;
    },
    [plan]
  );

  const isActive = plan.subscription_status === 'active';

  return { plan, isLoading, error, isActive, hasFeature, isWithinLimit, refetch: fetchPlan };
}
