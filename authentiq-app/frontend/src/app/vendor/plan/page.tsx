'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getVendorProfile, renewMyPlan, changeMyPlan, updateVendorAddons } from '@/services/api';

// Self-contained reusable Card component matching the app's visual system
function Card({ title, subtitle, children, icon, className = '', action }: { title: string; subtitle?: string; children: React.ReactNode; icon?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden ${className}`}>
      <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/30">
        <div className="flex items-center gap-3">
          {icon && <div className="text-slate-400">{icon}</div>}
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && <div>{action}</div>}
      </header>
      <div className="p-6">
        {children}
      </div>
    </section>
  );
}

// Modal component for confirmations
function Modal({ title, isOpen, onClose, children, maxWidth = 'max-w-md' }: { title: string; isOpen: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: string }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
      <div 
        className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} overflow-hidden max-h-[90vh] flex flex-col border border-slate-100`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function VendorPlanPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);

  // Dynamic simulation state for plan switching
  const [selectedPlan, setSelectedPlan] = useState<string>('Business');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('Active');
  const billingCycle = 'yearly';

  // Add-ons states
  const [extraUsers, setExtraUsers] = useState(0);
  const [extraSKUs, setExtraSKUs] = useState(0);
  const [extraBrands, setExtraBrands] = useState(0);
  const [savingAddons, setSavingAddons] = useState(false);
  const [showAddonsModal, setShowAddonsModal] = useState(false);

  const getProratedPrice = (yearlyPrice: number) => {
    const renewalDate = new Date('2026-06-30T23:59:59');
    const today = new Date();
    const diffTime = renewalDate.getTime() - today.getTime();
    let days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (days <= 0) days = 30; // fallback
    const ratio = days / 365;
    return {
      price: Math.max(1, Math.round(yearlyPrice * ratio)),
      days
    };
  };

  const handleCloseAddonsModal = () => {
    setShowAddonsModal(false);
    if (profile?.vendor) {
      setExtraUsers(profile.vendor.extra_users || 0);
      setExtraSKUs(profile.vendor.extra_skus || 0);
      setExtraBrands(profile.vendor.extra_brands || 0);
    }
  };

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVendorProfile();
      setProfile(data);
      if (data?.plan?.name) {
        setSelectedPlan(data.plan.name);
      }
      if (data?.vendor) {
        setExtraUsers(data.vendor.extra_users || 0);
        setExtraSKUs(data.vendor.extra_skus || 0);
        setExtraBrands(data.vendor.extra_brands || 0);
      }
    } catch (e: any) {
      // Degrade gracefully with fallback defaults
      console.warn('Failed to load profile details:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleUpdateAddons = async () => {
    setSavingAddons(true);
    try {
      const totalUsers = (selectedPlan === 'Business' ? 5 : 50) + extraUsers;
      const totalSKUs = (selectedPlan === 'Business' ? 25 : 500) + extraSKUs;
      const totalBrands = (selectedPlan === 'Business' ? 1 : 5) + extraBrands;

      await updateVendorAddons({
        extraUsers,
        extraSKUs,
        extraBrands,
        totalUsers,
        totalSKUs,
        totalBrands
      });

      showToast('success', 'Subscription Add-Ons updated successfully!');
      setShowAddonsModal(false);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update add-ons.');
    } finally {
      setSavingAddons(false);
    }
  };

  const planIds: Record<string, string> = {
    'Free Trial': 'free_trial',
    'Business': 'business',
    'Business Pro': 'business_pro',
    'Enterprise': 'enterprise'
  };

  const handleSelectPlan = async (planName: string) => {
    setSaving(true);
    try {
      const planId = planIds[planName];
      if (!planId) throw new Error(`Unknown plan: ${planName}`);
      await changeMyPlan(planId);
      setSelectedPlan(planName);
      setSubscriptionStatus('Active');
      showToast('success', `Plan switched to ${planName} successfully!`);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to switch plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleRenewPlan = async () => {
    setSaving(true);
    try {
      await renewMyPlan();
      setShowRenewModal(false);
      showToast('success', 'Plan renewed successfully for another billing cycle!');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to renew plan.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  const user = profile?.user || { email: 'vendor@authentiq.com' };

  // Plan features for mapping
  const planFeatures: Record<string, string[]> = {
    'Free Trial': [
      'Basic QR Registry',
      '250 Scans / month limit',
      '1 Brand, 1 Product SKU, 1 User limit',
      'Standard support'
    ],
    'Business': [
      'AI-Powered Product Verification',
      '100,000 Scans / month limit',
      '1 Brand, 25 Product SKUs, 5 Users limit',
      'Priority support response',
      'Full analytics dashboard',
      'CSV / Excel product data import & export',
      'Geolocation-based scan distribution insights'
    ],
    'Business Pro': [
      'Full Supply Chain Protection',
      'Unlimited Scans',
      '5 Brands, 500 Product SKUs, 50 Users limit',
      'Dedicated support account manager',
      'Advanced predictive anomaly detection',
      'CSV / Excel product data import & export',
      'Custom data exports & integrations'
    ],
    'Enterprise': [
      'White-labeled verification pages',
      'Unlimited Scans, Brands, SKUs, and Users',
      'Custom API & system integrations',
      'SLA guarantee with dedicated support manager',
      'Advanced predictive anomaly detection & analytics'
    ]
  };

  const currentFeatures = planFeatures[selectedPlan] || planFeatures['Business'];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-bold border animate-fade-in ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-900 border-green-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Plan &amp; Billing</h2>
          <p className="text-sm text-slate-500 mt-1">Review your subscription details, limits, and pricing tiers.</p>
        </header>

        <div className="space-y-8">
          {/* 1. Entire Page layout: Current subscription details at the top */}
          <Card
            title="Current Subscription Details"
            subtitle="Your active service tier, quotas, and billing status"
            icon={
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-slate-100 pb-6 mb-6">
              <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-100">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Active Plan</span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm">
                  {selectedPlan}
                </span>
              </div>
              <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-100">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                  {subscriptionStatus}
                </span>
              </div>
              <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-100">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Renewal Date</span>
                <span className="block text-sm font-bold text-slate-800">June 30, 2026</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Billing Information</h4>
                <div className="space-y-3.5 text-sm">
                  <div className="flex justify-between py-1 border-b border-slate-100/60">
                    <span className="text-slate-500">Billing Contact Email</span>
                    <span className="font-semibold text-slate-800">{user.email || 'vendor@authentiq.com'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100/60">
                    <span className="text-slate-500">Rate / Billing Period</span>
                    <span className="font-semibold text-slate-800 text-right">
                      {selectedPlan === 'Free Trial' && 'Free (Trial)'}
                      {selectedPlan === 'Business' && 'Rs. 4,583 / month (billed yearly at Rs. 55,000)'}
                      {selectedPlan === 'Business Pro' && 'Rs. 20,416 / month (billed yearly at Rs. 245,000)'}
                      {selectedPlan === 'Enterprise' && 'Custom Pricing (Billed Annually)'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Payment Method</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                      </svg>
                      Visa ending in 4242
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Features Enabled</h4>
                <div className="grid grid-cols-1 gap-2 text-sm text-slate-700">
                  {currentFeatures.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Subscription Add-Ons Action */}
          {['Business', 'Business Pro'].includes(selectedPlan) && (
            <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-white rounded-2xl border border-slate-200/60 shadow-sm gap-4">
              <div className="text-left">
                <h3 className="text-base font-bold text-gray-900">Subscription Add-ons</h3>
                <p className="text-xs text-slate-500 mt-0.5">Expand users, catalog SKUs, or registered brands post-purchase.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddonsModal(true)}
                style={{ backgroundColor: '#00b074', color: '#ffffff' }}
                className="hover:bg-[#009660] font-extrabold py-3 px-6 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shrink-0"
              >
                Add - on
              </button>
            </div>
          )}

          {/* Subscription Add-Ons Modal */}
          {['Business', 'Business Pro'].includes(selectedPlan) && (
            <Modal
              title="Configure Subscription Add-Ons"
              isOpen={showAddonsModal}
              onClose={handleCloseAddonsModal}
              maxWidth="max-w-2xl"
            >
              <div className="space-y-6">
                <p className="text-xs text-slate-500 text-left">
                  Expand users, product catalog SKUs, or registered brands post-purchase.
                  Prices are updated and prorated based on the remaining time of your current plan (ending June 30, 2026).
                </p>

                {/* 1. Team Seats Add-On */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-left">
                  <div>
                    <h4 className="text-sm font-bold text-[#003057]">Extra Team Seats</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Included base: {selectedPlan === 'Business' ? '5' : '50'} users. Expand in blocks of 5 seats (+₹5,000/yr per block).
                    </p>
                    <span className="inline-block mt-2 text-[10px] bg-slate-200/60 text-slate-600 px-2 py-0.5 rounded font-semibold">
                      Current Total: {(selectedPlan === 'Business' ? 5 : 50) + extraUsers} users
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      disabled={extraUsers <= 0 || savingAddons}
                      onClick={() => setExtraUsers(Math.max(0, extraUsers - 5))}
                      className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      –
                    </button>
                    <span className="text-sm font-bold text-slate-800 w-16 text-center font-mono">+{extraUsers}</span>
                    <button
                      type="button"
                      disabled={savingAddons}
                      onClick={() => setExtraUsers(extraUsers + 5)}
                      className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 active:scale-95 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 2. SKUs Catalog Add-On */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-left">
                  <div>
                    <h4 className="text-sm font-bold text-[#003057]">SKUs Catalog Capacity</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Included base: {selectedPlan === 'Business' ? '25' : '500'} SKUs.
                    </p>
                    <span className="inline-block mt-2 text-[10px] bg-slate-200/60 text-slate-600 px-2 py-0.5 rounded font-semibold">
                      Current Total: {(selectedPlan === 'Business' ? 25 : 500) + extraSKUs} SKUs
                    </span>
                  </div>
                  <div className="shrink-0 w-full md:w-48 text-left">
                    <select
                      value={extraSKUs}
                      disabled={savingAddons}
                      onChange={(e) => setExtraSKUs(Number(e.target.value))}
                      className="w-full bg-white text-slate-800 border border-slate-200 rounded-xl p-3 text-xs font-bold focus:outline-none cursor-pointer"
                    >
                      <option value={0}>No Extra SKUs (+₹0)</option>
                      <option value={10}>+10 SKUs (+₹10,000/yr)</option>
                      <option value={50}>+50 SKUs (+₹45,000/yr)</option>
                    </select>
                  </div>
                </div>

                {/* 3. Brands Registry (Only for Business Pro) */}
                {selectedPlan === 'Business Pro' && (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-left">
                    <div>
                      <h4 className="text-sm font-bold text-[#003057]">Extra Brands Registry</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Included base: 5 brands. Expand active brand registries (+₹10,000/yr per brand).
                      </p>
                      <span className="inline-block mt-2 text-[10px] bg-slate-200/60 text-slate-600 px-2 py-0.5 rounded font-semibold">
                        Current Total: {5 + extraBrands} brands
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        disabled={extraBrands <= 0 || savingAddons}
                        onClick={() => setExtraBrands(Math.max(0, extraBrands - 1))}
                        className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        –
                      </button>
                      <span className="text-sm font-bold text-slate-800 w-16 text-center font-mono">+{extraBrands}</span>
                      <button
                        type="button"
                        disabled={savingAddons}
                        onClick={() => setExtraBrands(extraBrands + 1)}
                        className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 active:scale-95 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Proration Price Details calculated based on end of current plan */}
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 space-y-3 text-left">
                  <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Prorated Cost Calculation</h4>
                  <div className="space-y-2 text-xs text-slate-650">
                    <div className="flex justify-between">
                      <span>Remaining Duration (until renewal on June 30, 2026)</span>
                      <span className="font-bold text-slate-850">{getProratedPrice(1000).days} days</span>
                    </div>
                    <div className="flex justify-between border-t border-indigo-100/50 pt-2 font-semibold">
                      <span>Add-on Annual Increase</span>
                      <span className="text-slate-900">
                        ₹{(
                          ((extraUsers / 5) * 5000) +
                          (extraSKUs === 10 ? 10000 : extraSKUs === 50 ? 45000 : 0) +
                          (extraBrands * 10000)
                        ).toLocaleString('en-IN')}/yr
                      </span>
                    </div>
                    <div className="flex justify-between text-indigo-900 font-extrabold text-sm border-t border-indigo-100 pt-2">
                      <span>Total Due Today (Prorated)</span>
                      <span>
                        ₹{getProratedPrice(
                          ((extraUsers / 5) * 5000) +
                          (extraSKUs === 10 ? 10000 : extraSKUs === 50 ? 45000 : 0) +
                          (extraBrands * 10000)
                        ).price.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Confirm and Cancel Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCloseAddonsModal}
                    className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold py-3 px-6 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingAddons}
                    onClick={handleUpdateAddons}
                    style={{ backgroundColor: '#00b074', color: '#ffffff' }}
                    className="hover:bg-[#009660] disabled:opacity-50 text-white font-extrabold py-3 px-8 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                  >
                    {savingAddons ? 'Updating...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {/* 2. Choose a Plan section below */}
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Available Subscription Plans</h3>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200/60">
                Billed Annually
              </span>
            </div>

            {/* Free Trial Banner */}
            <div className={`bg-white rounded-2xl p-5 border transition-all duration-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative ${
              selectedPlan === 'Free Trial' 
                ? 'border-2 border-indigo-500 shadow-md ring-4 ring-indigo-50 bg-indigo-50/5' 
                : 'border-slate-200/80 shadow-sm hover:border-slate-300'
            }`}>
              {selectedPlan === 'Free Trial' && (
                <span className="absolute -top-3 left-6 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-sm">
                  Current Active
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-base font-bold text-gray-900">Free Trial</h4>
                  <p className="text-slate-500 text-xs mt-1">For validation testing and exploration. Includes 1 Brand, 1 Product SKU, 1 User, and 250 Scans / month. (14-day limit)</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                <div className="text-left sm:text-right">
                  <p className="text-xl font-black text-slate-900">Rs. 0</p>
                  <p className="text-[10px] text-slate-400 font-bold">14-Day Evaluation</p>
                </div>
                {selectedPlan === 'Free Trial' ? (
                  <button 
                    type="button"
                    onClick={() => setShowRenewModal(true)}
                    className="px-6 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-sm transition-all shadow-sm"
                  >
                    Renew Trial
                  </button>
                ) : (
                  <button 
                    type="button"
                    onClick={() => handleSelectPlan('Free Trial')}
                    disabled={saving}
                    className="px-6 py-2 border border-indigo-500 text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-sm transition-all"
                  >
                    Select Trial
                  </button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Business Card */}
              <div 
                className={`bg-white rounded-2xl p-6 border transition-all duration-300 flex flex-col h-full relative ${
                  selectedPlan === 'Business' 
                    ? 'border-2 border-indigo-500 shadow-md ring-4 ring-indigo-50' 
                    : 'border-slate-200/80 shadow-sm hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {selectedPlan === 'Business' && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm">
                    Current Active
                  </span>
                )}
                <div className="mb-4">
                  <h4 className="text-lg font-bold text-gray-900">Business</h4>
                  <p className="text-slate-500 text-xs mt-1">For growing brands protecting packaging lines.</p>
                </div>
                <div className="mb-6">
                  <p className="text-3xl font-black text-slate-900">
                    Rs. 4,583
                    <span className="text-sm font-normal text-slate-400">/mo</span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                    Billed Rs. 55,000 annually
                  </p>
                </div>
                <ul className="text-sm text-slate-600 space-y-3 mb-8 flex-grow">
                  <li className="flex items-center gap-2">✓ AI-Powered Verification</li>
                  <li className="flex items-center gap-2">✓ 100,000 Scans / mo</li>
                  <li className="flex items-center gap-2">✓ 1 Brand, 25 SKUs, 5 Users</li>
                  <li className="flex items-center gap-2">✓ Real-time Analytics Dashboard</li>
                </ul>
                {selectedPlan === 'Business' ? (
                  <button 
                    onClick={() => setShowRenewModal(true)}
                    className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-sm transition-all shadow-sm"
                  >
                    Renew Plan
                  </button>
                ) : (
                  <button 
                    onClick={() => handleSelectPlan('Business')}
                    disabled={saving}
                    className="w-full py-2.5 border border-indigo-500 text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-sm transition-all"
                  >
                    Select Plan
                  </button>
                )}
              </div>

              {/* Business Pro Card */}
              <div 
                className={`bg-white rounded-2xl p-6 border transition-all duration-300 flex flex-col h-full relative ${
                  selectedPlan === 'Business Pro' 
                    ? 'border-2 border-indigo-500 shadow-md ring-4 ring-indigo-50' 
                    : 'border-slate-200/80 shadow-sm hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {selectedPlan === 'Business Pro' && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm">
                    Current Active
                  </span>
                )}
                <div className="mb-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-lg font-bold text-gray-900">Business Pro</h4>
                    <span className="text-[9px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/60 px-1.5 py-0.5 rounded uppercase tracking-wider">Popular</span>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">Full supply chain protection and API channels.</p>
                </div>
                <div className="mb-6">
                  <p className="text-3xl font-black text-slate-900">
                    Rs. 20,416
                    <span className="text-sm font-normal text-slate-400">/mo</span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                    Billed Rs. 245,000 annually
                  </p>
                </div>
                <ul className="text-sm text-slate-600 space-y-3 mb-8 flex-grow">
                  <li className="flex items-center gap-2">✓ Full Supply Chain Protection</li>
                  <li className="flex items-center gap-2">✓ Unlimited Scans</li>
                  <li className="flex items-center gap-2">✓ 5 Brands, 500 SKUs, 50 Users</li>
                  <li className="flex items-center gap-2">✓ Dedicated Support Manager</li>
                </ul>
                {selectedPlan === 'Business Pro' ? (
                  <button 
                    onClick={() => setShowRenewModal(true)}
                    className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-sm transition-all shadow-sm"
                  >
                    Renew Plan
                  </button>
                ) : (
                  <button 
                    onClick={() => handleSelectPlan('Business Pro')}
                    disabled={saving}
                    className="w-full py-2.5 border border-indigo-500 text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-sm transition-all"
                  >
                    Select Plan
                  </button>
                )}
              </div>

              {/* Enterprise Card */}
              <div 
                className={`bg-white rounded-2xl p-6 border transition-all duration-300 flex flex-col h-full relative ${
                  selectedPlan === 'Enterprise' 
                    ? 'border-2 border-indigo-500 shadow-md ring-4 ring-indigo-50' 
                    : 'border-slate-200/80 shadow-sm hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {selectedPlan === 'Enterprise' && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm">
                    Current Active
                  </span>
                )}
                <div className="mb-4">
                  <h4 className="text-lg font-bold text-gray-900">Enterprise</h4>
                  <p className="text-slate-500 text-xs mt-1">For custom requirements and massive volumes.</p>
                </div>
                <div className="mb-6">
                  <p className="text-3xl font-black text-slate-900">
                    Custom
                    <span className="text-sm font-normal text-slate-400">/SLA</span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                    Billed annually under contract
                  </p>
                </div>
                <ul className="text-sm text-slate-600 space-y-3 mb-8 flex-grow">
                  <li className="flex items-center gap-2">✓ Custom API Integrations</li>
                  <li className="flex items-center gap-2">✓ Unlimited Scans &amp; Units</li>
                  <li className="flex items-center gap-2">✓ Dedicated Support Manager</li>
                  <li className="flex items-center gap-2">✓ White-labeled verification pages</li>
                </ul>
                {selectedPlan === 'Enterprise' ? (
                  <button 
                    onClick={() => setShowRenewModal(true)}
                    className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-sm transition-all shadow-sm"
                  >
                    Renew Plan
                  </button>
                ) : (
                  <a 
                    href="mailto:support@authentiq.com?subject=Enterprise%20Plan%20Inquiry"
                    className="w-full py-2.5 border border-indigo-500 text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-sm transition-all text-center block"
                  >
                    Contact Sales
                  </a>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Renew Modal */}
      <Modal title="Renew Plan" isOpen={showRenewModal} onClose={() => setShowRenewModal(false)}>
        <div className="space-y-6">
          <p className="text-sm text-slate-600">You are about to renew your <strong>{selectedPlan}</strong> for another billing cycle.</p>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
            <div className="flex justify-between mb-2">
              <span className="text-slate-600">Billing Cycle</span>
              <span className="font-bold text-slate-900 capitalize">Yearly</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-slate-600">Current Expiry</span>
              <span className="font-bold text-slate-900">June 30, 2026</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">New Expiry</span>
              <span className="font-bold text-slate-900">June 30, 2027</span>
            </div>
            <div className="border-t border-slate-200 my-3"></div>
            <div className="flex justify-between font-extrabold text-base">
              <span className="text-slate-900">Total</span>
              <span className="text-slate-900">
                {selectedPlan === 'Free Trial' && 'Rs. 0.00'}
                {selectedPlan === 'Business' && 'Rs. 55,000.00'}
                {selectedPlan === 'Business Pro' && 'Rs. 245,000.00'}
                {selectedPlan === 'Enterprise' && 'Custom (Contract)'}
              </span>
            </div>
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button onClick={() => setShowRenewModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
            <button onClick={handleRenewPlan} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow">
              {saving ? 'Processing...' : 'Confirm Renewal'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
