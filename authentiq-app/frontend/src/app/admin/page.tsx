'use client';

import React, { useState, useEffect, useCallback } from 'react';
import StatsCard from '@/components/StatsCard';
import ActivityItem from '@/components/ActivityItem';
import { getAdminAnalytics, getAdminVendors, getAdminActivity, createVendor, getAdminScans, getVendorAccounts, createVendorAccount, updateVendorAccountStatus, resetVendorPassword, deleteVendorAccount, getAdminLocations, getAdminPlans, assignPlanToVendor, getAdminVendorSubscriptions, updateVendorSubscriptionStatus, getAdminProducts, deleteVendor, createVendorFull } from '@/services/api';
import { getRelativeTime, formatTimestamp } from '@/utils/date';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import LocationDistribution from '@/components/LocationDistribution';
import Link from 'next/link';
import { getApiBase } from '@/lib/apiBase';
import { motion } from 'framer-motion';
import PlanCreatorDashboard from '@/components/admin/PlanCreatorDashboard';
import VendorFeatureManagement from '@/components/admin/VendorFeatureManagement';

const generateSecurePassword = (): string => {
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const symbols = "!@#$%^&*";
  const allChars = lowercase + uppercase + numbers + symbols;

  let password = "";
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = 4; i < 12; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password.split('').sort(() => 0.5 - Math.random()).join('');
};

export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [isLoaded, setIsLoaded] = useState(false);
  const [analytics, setAnalytics] = useState<any>({});
  const [vendors, setVendors] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [locations, setLocations] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [selectedAnalyticsVendor, setSelectedAnalyticsVendor] = useState("all");
  const [selectedAnalyticsVendorCard, setSelectedAnalyticsVendorCard] = useState<any | null>(null);
  const [analyticsSearch, setAnalyticsSearch] = useState("");
  const [analyticsSortBy, setAnalyticsSortBy] = useState("name-asc");
  const [selectedActivityVendorCard, setSelectedActivityVendorCard] = useState<any | null>(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [activitySortBy, setActivitySortBy] = useState("name-asc");
  const [activitySortOrder, setActivitySortOrder] = useState("newest");
  const [activityFilter, setActivityFilter] = useState("all");
  
  // Pagination state for Plans page
  const [plansCurrentPage, setPlansCurrentPage] = useState(1);
  const [plansItemsPerPage, setPlansItemsPerPage] = useState(5);
  
  // Pagination and sorting states for Vendor Hub Product Table
  const [vendorHubProductsPage, setVendorHubProductsPage] = useState(1);
  const [vendorHubProductsSort, setVendorHubProductsSort] = useState<'asc' | 'desc'>('asc');
  
  // Pagination state for Recent Verification Feed
  const [recentScansPage, setRecentScansPage] = useState(1);
  
  // Pagination state for Flagged Threat Activities
  const [flaggedScansPage, setFlaggedScansPage] = useState(1);
  
  // States for filtering vendors
  const [vendorSearch, setVendorSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [dateFocused, setDateFocused] = useState(false);
  const [dateSortOrder, setDateSortOrder] = useState<"latest" | "oldest" | "latest_explicit">("latest");

  // Brand Details modal state
  const [brandDetailVendor, setBrandDetailVendor] = useState<any | null>(null);
  const [vendorProfileVendor, setVendorProfileVendor] = useState<any | null>(null);
  // Vendor Hub full-page state
  const [vendorHubProducts, setVendorHubProducts] = useState<any[]>([]);
  const [vendorHubProductSearch, setVendorHubProductSearch] = useState('');
  const [vendorHubProductsLoading, setVendorHubProductsLoading] = useState(false);
  // Tracks which vendor ID is currently open so the polling effect can target it
  const vendorHubVendorIdRef = React.useRef<string | null>(null);

  // Scroll refs for pagination reset
  const vendorHubScrollRef = React.useRef<HTMLDivElement>(null);
  const recentScansScrollRef = React.useRef<HTMLDivElement>(null);
  const flaggedScansScrollRef = React.useRef<HTMLDivElement>(null);

  // State for Add Vendor (Brands)
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for Vendor Logins (Users)
  const [vendorAccounts, setVendorAccounts] = useState<any[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showAdminResetModal, setShowAdminResetModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const [newUserPayload, setNewUserPayload] = useState({ name: '', email: '', password: '', vendor_id: '' });
  const [newPassword, setNewPassword] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [selectedPlanInfoModal, setSelectedPlanInfoModal] = useState<any | null>(null);
  
  // Notification States
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [deletedNotificationIds, setDeletedNotificationIds] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [isResetSuccess, setIsResetSuccess] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [notificationSearch, setNotificationSearch] = useState("");
  
  // Feature management states
  const [showPlanCreator, setShowPlanCreator] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [showVendorFeatureManager, setShowVendorFeatureManager] = useState(false);
  const [selectedVendorForFeatures, setSelectedVendorForFeatures] = useState<any | null>(null);

  // Vendor Deletion states
  const [showDeleteVendorModal, setShowDeleteVendorModal] = useState(false);
  const [deleteVendorId, setDeleteVendorId] = useState<string | null>(null);
  const [deleteVendorPassword, setDeleteVendorPassword] = useState("");
  const [isDeletingVendor, setIsDeletingVendor] = useState(false);

  // Vendor Creation Wizard states
  const [showCreateVendorWizard, setShowCreateVendorWizard] = useState(false);
  const [createVendorStep, setCreateVendorStep] = useState(1);
  const [newVendorData, setNewVendorData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    company_name: '',
    plan_id: ''
  });


  const { user, isAuthenticated, isLoading: isAuthLoading, logout } = useAuth();
  const router = useRouter();

  // Load read and deleted notifications from localStorage
  useEffect(() => {
    const storedRead = localStorage.getItem('admin_read_notifications');
    if (storedRead) {
      try {
        setReadNotificationIds(JSON.parse(storedRead));
      } catch (e) {
        console.error(e);
      }
    }
    const storedDeleted = localStorage.getItem('admin_deleted_notifications');
    if (storedDeleted) {
      try {
        setDeletedNotificationIds(JSON.parse(storedDeleted));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleMarkAsRead = (id: string) => {
    if (!readNotificationIds.includes(id)) {
      const newRead = [...readNotificationIds, id];
      setReadNotificationIds(newRead);
      localStorage.setItem('admin_read_notifications', JSON.stringify(newRead));
    }
  };

  const handleMarkAllAsRead = () => {
    const visibleNonDeletedIds = activities
      .filter((a: any) => !deletedNotificationIds.includes(a.id))
      .map((a: any) => a.id);
    const newRead = Array.from(new Set([...readNotificationIds, ...visibleNonDeletedIds]));
    setReadNotificationIds(newRead);
    localStorage.setItem('admin_read_notifications', JSON.stringify(newRead));
  };

  const handleDeleteNotification = (id: string) => {
    if (!deletedNotificationIds.includes(id)) {
      const newDeleted = [...deletedNotificationIds, id];
      setDeletedNotificationIds(newDeleted);
      localStorage.setItem('admin_deleted_notifications', JSON.stringify(newDeleted));
    }
  };

  const handleDeleteReadNotifications = () => {
    const activeReadIds = activities
      .filter((a: any) => readNotificationIds.includes(a.id) && !deletedNotificationIds.includes(a.id))
      .map((a: any) => a.id);
    
    if (activeReadIds.length > 0) {
      const newDeleted = [...deletedNotificationIds, ...activeReadIds];
      setDeletedNotificationIds(newDeleted);
      localStorage.setItem('admin_deleted_notifications', JSON.stringify(newDeleted));
    }
  };

  const handleCopyPassword = async (passwordText: string) => {
    try {
      await navigator.clipboard.writeText(passwordText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy password", err);
    }
  };

  const handleDateChange = (val: string) => {
    // Keep only numbers
    let clean = val.replace(/[^0-9]/g, '');
    if (clean.length > 8) clean = clean.substring(0, 8);
    
    // Format as DD/MM/YYYY
    let formatted = '';
    if (clean.length > 0) {
      formatted += clean.substring(0, 2);
      if (clean.length > 2) {
        formatted += '/' + clean.substring(2, 4);
        if (clean.length > 4) {
          formatted += '/' + clean.substring(4, 8);
        }
      }
    }
    setDateFilter(formatted);
  };

  // Filter vendors based on real-time search input
  const filteredVendors = (vendors || []).filter((vendor) => {
    const searchVendorLower = vendorSearch.toLowerCase().trim();
    const matchesVendor = !searchVendorLower || vendor.name?.toLowerCase().includes(searchVendorLower);

    const searchBrandLower = brandSearch.toLowerCase().trim();
    const matchesBrand = !searchBrandLower || 
      (vendor.brands && vendor.brands.some((brand: any) => brand.name?.toLowerCase().includes(searchBrandLower)));

    let matchesDate = true;
    if (dateFilter && vendor.created_at) {
      if (dateFilter.length === 10) {
        const parts = dateFilter.split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          const formattedFilterDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          
          // 1. Check vendor registration date
          const dbDateStr = typeof vendor.created_at === 'string' 
            ? vendor.created_at.substring(0, 10) 
            : new Date(vendor.created_at).toISOString().substring(0, 10);
          const vendorMatches = (dbDateStr === formattedFilterDate);

          // 2. Check brand registration dates
          let brandMatches = false;
          if (vendor.brands && Array.isArray(vendor.brands)) {
            brandMatches = vendor.brands.some((brand: any) => {
              if (!brand.created_at) return false;
              const bDateStr = typeof brand.created_at === 'string' 
                ? brand.created_at.substring(0, 10) 
                : new Date(brand.created_at).toISOString().substring(0, 10);
              return bDateStr === formattedFilterDate;
            });
          }

          matchesDate = vendorMatches || brandMatches;
        } else {
          matchesDate = false;
        }
      } else {
        // While typing (length < 10), do not hide vendors
        matchesDate = true;
      }
    }
    return matchesVendor && matchesBrand && matchesDate;
  });

  // Sort the filtered vendors list based on dateSortOrder selection
  const sortedFilteredVendors = [...filteredVendors].sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return (dateSortOrder === "latest" || dateSortOrder === "latest_explicit") ? timeB - timeA : timeA - timeB;
  });

  // Auth Guard
  useEffect(() => {
    if (!isAuthLoading) {
      if (!isAuthenticated) {
        router.replace('/admin/login');
      } else if (user?.role !== 'admin') {
        router.replace('/vendor');
      }
    }
  }, [isAuthenticated, isAuthLoading, user?.role, router]);

  // Stable fetchData — useCallback with empty deps prevents the identity
  // from changing on every render, which would cause useRealtimeUpdates
  // to restart the WebSocket on every state update.
  const fetchData = useCallback(async () => {
    try {
      const fetchWithCatch = async (fn: () => Promise<any>, fallback: any) => {
        try { return await fn(); } catch (e) { console.error(e); return fallback; }
      };

      const [an, ven, act, scn, usersRes, locRes, plansRes, subsRes] = await Promise.all([
        fetchWithCatch(getAdminAnalytics, {}),
        fetchWithCatch(getAdminVendors, { vendors: [] }),
        fetchWithCatch(getAdminActivity, { activity: [] }),
        fetchWithCatch(() => getAdminScans({ limit: 100 }), { scans: [], total: 0 }),
        fetchWithCatch(getVendorAccounts, { users: [] }),
        fetchWithCatch(getAdminLocations, { locations: [] }),
        fetchWithCatch(getAdminPlans, { plans: [] }),
        fetchWithCatch(getAdminVendorSubscriptions, { subscriptions: [] }),
      ]);
      
      setAnalytics(an);
      setVendors(ven.vendors || []);
      setScans(scn.scans || []);
      setTotalScans(scn.total || 0);
      
      const mappedActivity = (act.activity || []).map((item: any) => {
        let timeStr = '--:--:--';
        let dateStr = '-----';
        if (item.timestamp) {
          const d = new Date(item.timestamp);
          if (!isNaN(d.getTime())) {
            const pad = (n: number) => n.toString().padStart(2, '0');
            timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            dateStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear().toString().slice(-2)}`;
          }
        }
        return {
          ...item,
          rawTimestamp: item.timestamp,
          timestamp: timeStr,
          date: dateStr
        };
      });
      setActivities(mappedActivity);
      setVendorAccounts(usersRes.users || []);
      setLocations(locRes?.locations || []);
      setPlans(plansRes?.plans || []);
      setSubscriptions(subsRes?.subscriptions || []);
    } catch (err) {
      console.error("Critical error loading admin data", err);
    } finally {
      setIsLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // no deps — setters are stable; API fns are module-level

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      fetchData();
    }
  }, [isAuthenticated, user?.role, fetchData]);

  // Real-time updates via WebSocket (falls back to 30s polling if WS fails)
  // IMPORTANT: fetchData is stable (useCallback), so the hook will NOT
  // reconnect the WebSocket on every render cycle.
  useRealtimeUpdates(fetchData, 30000, isAuthenticated && user?.role === 'admin');

  // ── Vendor Hub real-time product sync ────────────────────────────────────────
  // When the hub is open, poll the products endpoint every 15 s so any changes
  // made by the vendor (add/update/delete) are reflected without page reload.
  // The WebSocket 'product_update' event also triggers fetchData, but this
  // targeted interval keeps the hub's filtered product list always current.
  useEffect(() => {
    if (activeSection !== 'vendor-hub' || !vendorProfileVendor) return;
    vendorHubVendorIdRef.current = vendorProfileVendor.id;

    const syncProducts = async () => {
      const targetId = vendorHubVendorIdRef.current;
      if (!targetId) return;
      try {
        const res = await getAdminProducts();
        const all = res?.products || res || [];
        // Only update if we're still viewing the same vendor
        if (vendorHubVendorIdRef.current === targetId) {
          setVendorHubProducts(
            all.filter((p: any) => p.vendor_id === targetId || p.vendor_name === vendorProfileVendor?.name)
          );
        }
      } catch { /* silent — last data stays visible */ }
    };

    const intervalId = setInterval(syncProducts, 15_000);
    return () => {
      clearInterval(intervalId);
      vendorHubVendorIdRef.current = null;
    };
  // Re-runs only when the active vendor changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, vendorProfileVendor?.id]);

  // Reset pagination when active vendor changes
  useEffect(() => {
    setVendorHubProductsPage(1);
  }, [vendorProfileVendor?.id]);

  useEffect(() => {
    setRecentScansPage(1);
    setFlaggedScansPage(1);
  }, [selectedAnalyticsVendorCard?.id]);

  // Scroll to top on page change
  useEffect(() => {
    if (vendorHubScrollRef.current) {
      vendorHubScrollRef.current.scrollTop = 0;
    }
  }, [vendorHubProductsPage]);

  useEffect(() => {
    if (recentScansScrollRef.current) {
      recentScansScrollRef.current.scrollTop = 0;
    }
  }, [recentScansPage]);

  useEffect(() => {
    if (flaggedScansScrollRef.current) {
      flaggedScansScrollRef.current.scrollTop = 0;
    }
  }, [flaggedScansPage]);


  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createVendor(newVendorName);
      setNewVendorName("");
      setShowVendorModal(false);
      await fetchData();
    } catch (err) {
      alert("Failed to create vendor. It might already exist.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateVendorUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserPayload.email || !newUserPayload.password || !newUserPayload.vendor_id) return;
    
    setIsSubmitting(true);
    try {
      await createVendorAccount(newUserPayload);
      setNewUserPayload({ name: '', email: '', password: '', vendor_id: '' });
      setShowUserModal(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await updateVendorAccountStatus(userId, newStatus);
      await fetchData();
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !newPassword.trim()) return;
    
    setIsSubmitting(true);
    try {
      await resetVendorPassword(selectedUserId, newPassword);
      setIsResetSuccess(true);
    } catch (err) {
      alert("Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewPassword.trim() || !user?.id) {
      if (!user?.id) alert("Unable to identify current admin user.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await resetVendorPassword(user.id, adminNewPassword);
      alert("Admin password updated successfully.");
      setAdminNewPassword("");
      setShowAdminResetModal(false);
    } catch (err: any) {
      alert(err.message || "Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to completely delete this login credential? This action cannot be undone.")) return;
    try {
      await deleteVendorAccount(userId);
      await fetchData();
    } catch (err) {
      alert("Failed to delete user.");
    }
  };

  const handleAssignPlan = async (vendorId: string, planId: string) => {
    try {
      await assignPlanToVendor(vendorId, planId);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to assign plan.");
    }
  };

  const handleDeleteVendor = async () => {
    if (!deleteVendorId || !deleteVendorPassword.trim()) return;

    setIsDeletingVendor(true);
    try {
      await deleteVendor(deleteVendorId, deleteVendorPassword);
      setShowDeleteVendorModal(false);
      setDeleteVendorId(null);
      setDeleteVendorPassword("");
      setActiveSection('vendor');
      setVendorProfileVendor(null);
      await fetchData();
      alert("Vendor deleted successfully.");
    } catch (err: any) {
      alert(err.message || "Failed to delete vendor. Please check your password.");
    } finally {
      setIsDeletingVendor(false);
    }
  };

  const handleCreateVendorWizard = async () => {
    // Step 1 validation
    if (createVendorStep === 1) {
      if (!newVendorData.name.trim() || !newVendorData.email.trim() || !newVendorData.company_name.trim()) {
        alert("Please fill in all required fields.");
        return;
      }
      if (!newVendorData.email.includes('@')) {
        alert("Please enter a valid email address.");
        return;
      }
      setCreateVendorStep(2);
      return;
    }

    // Step 2 validation
    if (createVendorStep === 2) {
      setCreateVendorStep(3);
      return;
    }

    // Step 3 - Final submission
    if (createVendorStep === 3) {
      if (!newVendorData.password.trim()) {
        alert("Please enter a password.");
        return;
      }
      if (newVendorData.password !== newVendorData.confirmPassword) {
        alert("Passwords do not match.");
        return;
      }
      if (newVendorData.password.length < 8) {
        alert("Password must be at least 8 characters.");
        return;
      }

      setIsSubmitting(true);
      try {
        await createVendorFull({
          name: newVendorData.name,
          email: newVendorData.email,
          password: newVendorData.password,
          company_name: newVendorData.company_name,
          plan_id: newVendorData.plan_id || undefined
        });
        setShowCreateVendorWizard(false);
        setCreateVendorStep(1);
        setNewVendorData({
          name: '',
          email: '',
          password: '',
          confirmPassword: '',
          company_name: '',
          plan_id: ''
        });
        await fetchData();
        alert("Vendor created successfully! The user will be prompted to complete onboarding on first login.");
      } catch (err: any) {
        alert(err.message || "Failed to create vendor.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const stats = [
    { 
      label: 'Total Vendors', 
      value: vendors.length, 
      color: 'blue',
      trend: "Active Platform",
      trendStatus: "positive" as const,
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
    },
    { 
      label: 'Total Products', 
      value: analytics.total_products || 0, 
      color: 'purple',
      trend: "Registered",
      trendStatus: "positive" as const,
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
    },
    { 
      label: 'Total Verifications', 
      value: analytics.total_scans || 0, 
      color: 'green',
      trend: "Total Scans",
      trendStatus: "positive" as const,
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    },
  ];

  if (isAuthLoading || !isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isLoaded) return <div className="p-10 text-center font-bold text-gray-400">Loading Enterprise Dashboard...</div>;

  const getNavClass = (id: string) => {
    const base = "flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all cursor-pointer ";
    return activeSection === id
      ? base + "bg-gray-200 text-gray-900 font-semibold"
      : base + "text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row relative">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-gray-200 flex flex-col md:fixed md:inset-y-0 z-10 transition-transform">
        <div className="pt-2 pb-4 px-5 flex flex-col items-start border-b border-gray-100 mb-4 flex-shrink-0">
           <Link href="/admin" className="block hover:opacity-90 transition-opacity mb-2 ml-[-14px]">
             <img src="/authentiq_logo.png" alt="Authentiq Logo" className="w-full max-w-[180px] h-auto" />
           </Link>
           <p className="text-[8px] text-gray-400 font-bold uppercase tracking-[0.2em] text-left mt-1">Admin Control Panel</p>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto pb-4">
          <button onClick={() => { setActiveSection('dashboard'); window.scrollTo(0,0); }} className={getNavClass('dashboard')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            Dashboard
          </button>
          <button onClick={() => { setActiveSection('vendor'); window.scrollTo(0,0); }} className={getNavClass('vendor')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            Vendor
          </button>
          <button onClick={() => { setActiveSection('plans'); window.scrollTo(0,0); }} className={getNavClass('plans')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            Plans & Limits
          </button>
          <button onClick={() => { setActiveSection('features'); window.scrollTo(0,0); }} className={getNavClass('features')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Features
          </button>
          <button onClick={() => { setActiveSection('analytics'); setSelectedAnalyticsVendorCard(null); window.scrollTo(0,0); }} className={getNavClass('analytics')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            Analytics
          </button>
          <button onClick={() => { setActiveSection('activity'); setSelectedActivityVendorCard(null); window.scrollTo(0,0); }} className={getNavClass('activity')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Activity
          </button>
          <button onClick={() => { setActiveSection('notifications'); window.scrollTo(0,0); }} className={getNavClass('notifications') + " relative"}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            <span>Notifications</span>
            {(() => {
              const count = activities.filter((a: any) => !deletedNotificationIds.includes(a.id) && !readNotificationIds.includes(a.id)).length;
              return count > 0 ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm">
                  {count > 9 ? '9+' : count}
                </span>
              ) : null;
            })()}
          </button>
          <button onClick={() => { setActiveSection('profile'); window.scrollTo(0,0); }} className={getNavClass('profile')}>
            <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            Profile
          </button>
        </nav>

      </aside>

      <main className="flex-1 md:ml-56 p-6 md:p-10">
        <div className="max-w-6xl mx-auto">
          
          <div className="animate-in fade-in duration-300">
            
            {/* VIEW: DASHBOARD */}
            {activeSection === 'dashboard' && (
              <div className="space-y-8">
                <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Platform-wide product and verification metrics</p>
                  </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {stats.map((stat) => (
                    <StatsCard
                      key={stat.label}
                      label={stat.label}
                      value={stat.value}
                      color={stat.color}
                      trend={stat.trend}
                      trendStatus={stat.trendStatus}
                      icon={stat.icon}
                    />
                  ))}
                </div>

                <section>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Platform Overview</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm text-gray-500 mb-1">Total Products</p>
                      <p className="text-2xl font-bold text-gray-900">{analytics.total_products || 0}</p>
                    </div>
                    <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm text-gray-500 mb-1">QR Codes</p>
                      <p className="text-2xl font-bold text-gray-900">{analytics.total_qrs || 0}</p>
                    </div>
                    <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm text-gray-500 mb-1">Anomalous Activity</p>
                      <p className="text-2xl font-bold text-yellow-600">0</p>
                    </div>
                    <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-sm text-gray-500 mb-1">Node Health</p>
                      <p className="text-2xl font-bold text-green-600">Verified</p>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* VIEW: VENDOR */}
            {activeSection === 'vendor' && (
              <div className="space-y-8 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
                <header className="mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Vendor Registry</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Manage vendor profiles, brands, and compliance documents.</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowCreateVendorWizard(true);
                      setCreateVendorStep(1);
                      setNewVendorData({
                        name: '',
                        email: '',
                        password: '',
                        confirmPassword: '',
                        company_name: '',
                        plan_id: ''
                      });
                    }}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Create Vendor
                  </button>
                </header>

                {/* Filter and Search Bar Area */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  {/* Search Vendor */}
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      placeholder="Search Vendor Name"
                      className="block w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                    />
                  </div>

                  {/* Search Brand */}
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={brandSearch}
                      onChange={(e) => setBrandSearch(e.target.value)}
                      placeholder="Search Brand Name"
                      className="block w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                    />
                  </div>

                  {/* Sort */}
                  <select
                    value={dateSortOrder}
                    onChange={(e) => setDateSortOrder(e.target.value as "latest" | "oldest" | "latest_explicit")}
                    className="px-3.5 py-2.5 text-sm bg-gray-50/50 border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold cursor-pointer"
                  >
                    <option value="latest">Sort by Date</option>
                    <option value="oldest">Date: Oldest First</option>
                    <option value="latest_explicit">Date: Latest First</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vendor Name</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brands</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date Added</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {sortedFilteredVendors.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-400">
                            {vendors.length === 0 ? "No vendors registered yet." : "No matching vendors found."}
                          </td>
                        </tr>
                      ) : (
                        sortedFilteredVendors.map((vendor) => {
                          return (
                            <tr key={vendor.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="px-6 py-4">
                                <button
                                  onClick={async () => {
                                    setVendorProfileVendor(vendor);
                                    setActiveSection('vendor-hub');
                                    setVendorHubProductSearch('');
                                    setVendorHubProductsLoading(true);
                                    window.scrollTo(0, 0);
                                    try {
                                      const res = await getAdminProducts();
                                      const all = res?.products || res || [];
                                      setVendorHubProducts(all.filter((p: any) => p.vendor_id === vendor.id || p.vendor_name === vendor.name));
                                    } catch { setVendorHubProducts([]); }
                                    finally { setVendorHubProductsLoading(false); }
                                  }}
                                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors text-left cursor-pointer"
                                >
                                  {vendor.name}
                                </button>
                              </td>
                              <td className="px-6 py-4 text-sm font-semibold text-gray-700">
                                {vendor.brands?.length || 0}
                              </td>
                              <td className="px-6 py-4 text-xs font-semibold text-gray-600 font-mono">
                                {vendor.created_at ? (() => {
                                  const dateObj = new Date(vendor.created_at);
                                  const year = dateObj.getFullYear();
                                  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                                  const day = String(dateObj.getDate()).padStart(2, '0');
                                  return `${day}/${month}/${year}`;
                                })() : '—'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}



            {/* ── Vendor Hub Full-Page View ── */}
            {activeSection === 'vendor-hub' && vendorProfileVendor && (() => {
              const hub = vendorProfileVendor;
              const linkedAccounts = vendorAccounts.filter((a: any) => a.vendor_id === hub.id);
              const docRows = [
                { label: 'GST Certificate', value: hub.gst_cert_status, file: hub.gst_cert_file },
                { label: 'Incorporation Doc', value: hub.inc_doc_status, file: hub.inc_doc_file },
                { label: 'Trademark Application', value: hub.tm_app_status, file: hub.tm_app_file },
                { label: 'Trademark Certificate', value: hub.tm_cert_status, file: hub.tm_cert_file },
                { label: 'Brand Authorization', value: hub.brand_auth_status, file: hub.brand_auth_file },
                ...(hub.industry_sector === 'Pharma' ? [{ label: 'Drug License', value: hub.pharma_drug_license_status, file: hub.pharma_drug_license_file }] : []),
                ...(hub.industry_sector === 'FMCG' ? [{ label: 'FSSAI License', value: hub.fssai_license_status, file: hub.fssai_license_file }] : []),
                ...(hub.industry_sector === 'Liquor' ? [{ label: 'Excise License', value: hub.excise_license_status, file: hub.excise_license_file }] : []),
              ] as { label: string; value: string | undefined; file: string | undefined }[];
              const getDocUrl = (filename: string) => {
                if (!filename) return '#';
                if (filename.startsWith('http') || filename.startsWith('/')) return filename;
                return `${getApiBase()}/static/${filename}`;
              };
              const getBrandProductCount = (brandName: string) => {
                return (vendorHubProducts || []).filter((p: any) => p.brand === brandName).length;
              };
              const sortedHubProducts = [...vendorHubProducts]
                .filter(p =>
                  !vendorHubProductSearch.trim() ||
                  p.name?.toLowerCase().includes(vendorHubProductSearch.toLowerCase())
                )
                .sort((a, b) => {
                  const nameA = a.name || '';
                  const nameB = b.name || '';
                  if (vendorHubProductsSort === 'asc') {
                    return nameA.localeCompare(nameB);
                  } else {
                    return nameB.localeCompare(nameA);
                  }
                });

              const itemsPerPage = 50;
              const totalItems = sortedHubProducts.length;
              const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
              const currentPageVal = Math.min(vendorHubProductsPage, totalPages);
              const startIndex = (currentPageVal - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedHubProducts = sortedHubProducts.slice(startIndex, endIndex);
              return (
                <div className="space-y-0 animate-in fade-in duration-300">
                  {/* Back button */}
                  <div className="mb-4">
                    <button
                      onClick={() => { setActiveSection('vendor'); setVendorProfileVendor(null); window.scrollTo(0, 0); }}
                      className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to Vendors
                    </button>
                  </div>

                  {/* ── Vendor Hub Header — minimalist: logo + name + registered date ── */}
                  <div className="flex items-center gap-5 mb-8 pb-6 border-b border-gray-100">
                    <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 border border-indigo-200 flex items-center justify-center shadow-sm">
                      <span className="text-xl font-black text-indigo-500">{(hub.name || '?').charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-2xl font-bold text-gray-900 tracking-tight truncate">{hub.name}</h2>
                      <p className="text-xs text-gray-400 font-medium mt-1">
                        Registered on {hub.created_at ? (() => { const d = new Date(hub.created_at); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })() : '—'}
                      </p>
                    </div>
                  </div>

                  {/* ── Two-column layout: Main (left) + Sidebar (right) ── */}
                  <div className="flex flex-col xl:flex-row gap-8 items-start">

                    {/* ── LEFT: Main Content ── */}
                    <div className="flex-1 min-w-0 space-y-8">

                      {/* Brand Portfolio */}
                      <section>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">Brand Portfolio</h3>
                            <p className="text-xs text-gray-400 mt-0.5">{hub.brands?.length || 0} registered {hub.brands?.length === 1 ? 'brand' : 'brands'}</p>
                          </div>
                        </div>
                        {(!hub.brands || hub.brands.length === 0) ? (
                          <div className="py-12 text-center bg-white rounded-2xl border border-gray-200 border-dashed">
                            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            </div>
                            <p className="text-sm text-gray-400 font-medium">No brands registered yet.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {hub.brands.map((brand: any, idx: number) => {
                              const bLogo = brand.logo_url ? (brand.logo_url.startsWith('http') ? brand.logo_url : `${getApiBase()}${brand.logo_url}`) : null;
                              const bDate = brand.created_at ? (() => { const d = new Date(brand.created_at); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })() : null;
                              return (
                                // Read-only brand card — no interactive links or drill-down
                                <div key={idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex items-center gap-4 p-5">
                                  <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center">
                                    {bLogo ? (
                                      <img src={bLogo} alt={brand.name} className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    ) : (
                                      <span className="text-xl font-black text-gray-300">{(brand.name || '?').charAt(0).toUpperCase()}</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{brand.name || 'Unnamed Brand'}</p>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 mt-1">
                                      {bDate && <span className="text-[10px] text-gray-400 font-medium">Registered {bDate}</span>}
                                      {bDate && <span className="hidden sm:inline w-1 h-1 rounded-full bg-gray-300" />}
                                      <span className="text-[10px] text-indigo-600 font-bold">{getBrandProductCount(brand.name)} products</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      {/* Products Section */}
                      <section className="mt-8">
                        {/* Section heading */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">Products</h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {vendorHubProductsLoading ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin inline-block" />
                                  Syncing…
                                </span>
                              ) : (
                                `Showing ${startIndex + 1}–${Math.min(endIndex, totalItems)} of ${totalItems} product${totalItems !== 1 ? 's' : ''}`
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Search and Sort Bar */}
                        <div className="flex flex-col sm:flex-row gap-3 mb-4">
                          {/* Search Bar */}
                          <div className="relative flex-grow">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                            </div>
                            <input
                              type="text"
                              value={vendorHubProductSearch}
                              onChange={(e) => {
                                setVendorHubProductSearch(e.target.value);
                                setVendorHubProductsPage(1);
                              }}
                              placeholder="Search by product name…"
                              className="block w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 shadow-sm transition-all"
                            />
                            {vendorHubProductSearch && (
                              <button
                                onClick={() => {
                                  setVendorHubProductSearch('');
                                  setVendorHubProductsPage(1);
                                }}
                                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>

                          {/* Sorting Dropdown */}
                          <div className="relative min-w-[200px]">
                            <select
                              value={vendorHubProductsSort}
                              onChange={(e) => setVendorHubProductsSort(e.target.value as 'asc' | 'desc')}
                              className="w-full text-sm font-semibold bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all cursor-pointer appearance-none pr-10"
                            >
                              <option value="asc">Product Name (A-Z)</option>
                              <option value="desc">Product Name (Z-A)</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        {/* Product Table */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                          {vendorHubProductsLoading ? (
                            <div className="py-16 flex flex-col items-center gap-3">
                              <div className="w-6 h-6 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                              <p className="text-sm text-gray-400">Loading products…</p>
                            </div>
                          ) : paginatedHubProducts.length === 0 ? (
                            <div className="py-16 text-center">
                              <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                              <p className="text-sm text-gray-400 font-medium">
                                {vendorHubProductSearch ? 'No products match your filter.' : 'No products registered for this vendor.'}
                              </p>
                            </div>
                          ) : (
                            <div ref={vendorHubScrollRef} className="overflow-x-auto max-h-[600px] overflow-y-auto">
                              <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10">
                                  <tr className="border-b border-gray-100 bg-transparent">
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Product Name</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">SKU</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {paginatedHubProducts.map((product: any, idx: number) => (
                                    <motion.tr
                                      key={`${currentPageVal}-${product.id || idx}`}
                                      initial={{ opacity: 0, y: 15 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{
                                        type: "spring",
                                        stiffness: 70,
                                        damping: 15,
                                        mass: 0.8,
                                        delay: (idx % 15) * 0.025
                                      }}
                                      className="hover:bg-gray-50/80 transition-colors"
                                    >
                                      <td className="px-6 py-4">
                                        <p className="text-sm font-semibold text-gray-900">{product.name || '—'}</p>
                                        {product.description && (
                                          <p className="text-xs text-gray-400 truncate max-w-[200px] mt-0.5">{product.description}</p>
                                        )}
                                      </td>
                                      <td className="px-6 py-4 text-xs font-mono text-gray-600">{product.sku || '—'}</td>
                                      <td className="px-6 py-4">
                                        {product.category ? (
                                          <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200 rounded-full">
                                            {product.category}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-gray-400">—</span>
                                        )}
                                      </td>
                                      <td className="px-6 py-4 text-xs font-medium text-gray-600">{product.brand || '—'}</td>
                                      <td className="px-6 py-4 text-right">
                                        <span
                                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                            product.product_status === 'recalled'
                                              ? 'bg-red-50 text-red-700 border-red-200'
                                              : 'bg-green-50 text-green-700 border-green-200'
                                          }`}
                                        >
                                          {product.product_status === 'recalled' ? 'Recalled' : 'Active'}
                                        </span>
                                      </td>
                                    </motion.tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Pagination Bar */}
                        {totalItems > 0 && (
                          <div className="flex items-center justify-between mt-4 px-2">
                            <div className="text-xs text-gray-400 font-medium">
                              Page {currentPageVal} of {totalPages}
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setVendorHubProductsPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPageVal === 1}
                                className="px-4 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white flex items-center gap-1.5 cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                                Previous
                              </button>
                              <button
                                onClick={() => setVendorHubProductsPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPageVal === totalPages}
                                className="px-4 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white flex items-center gap-1.5 cursor-pointer"
                              >
                                Next
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </section>

                    </div>{/* end LEFT */}

                    {/* ── RIGHT: Sidebar ── */}
                    <div className="w-full xl:w-80 flex-shrink-0 space-y-6">

                      {/* Compliance Documents */}
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Compliance Documents</h4>
                        </div>
                        <div className="p-4 space-y-2.5">
                          {docRows.map(({ label, file }) => {
                            return (
                              <div key={label} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-100 gap-2">
                                <span className="text-xs font-semibold text-gray-700 truncate flex-1 min-w-0" title={label}>{label}</span>
                                {file ? (
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <a
                                      href={getDocUrl(file)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="View Document"
                                      className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-all cursor-pointer"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                    </a>
                                    <a
                                      href={getDocUrl(file)}
                                      download={file}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Download Document"
                                      className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-all cursor-pointer"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                      </svg>
                                    </a>
                                  </div>
                                ) : (
                                  <span className="text-[9px] font-bold text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                    Not Uploaded
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Registration Metadata */}
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Registration Details</h4>
                        </div>
                        <div className="p-4 space-y-3">
                          {([
                            { label: 'Vendor ID', value: hub.id ? `${String(hub.id).substring(0,14)}…` : '—' },
                            { label: 'Industry', value: hub.industry_sector || 'General' },
                            { label: 'Registered On', value: hub.created_at ? (() => { const d = new Date(hub.created_at); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })() : '—' },
                            { label: 'Total Brands', value: `${hub.brands?.length || 0}` },
                            { label: 'Products', value: `${vendorHubProducts.length}` },
                            { label: 'Accounts', value: `${linkedAccounts.length}` },
                          ] as { label: string; value: string }[]).map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-xs text-gray-400 font-medium">{label}</span>
                              <span className="text-xs font-bold text-gray-800 font-mono">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Subscription & Usage */}
                      {(() => {
                        const vendorSub = subscriptions.find((s: any) => s.vendor_id === hub.id);
                        if (!vendorSub) return null;
                        const limits = vendorSub.limits || {};
                        const usage = vendorSub.usage || {};
                        const productPct = limits.max_products ? Math.min(100, Math.round((usage.products_used / limits.max_products) * 100)) : 0;
                        const statusStyles: Record<string, string> = {
                          active: 'bg-green-50 text-green-700 border-green-200',
                          suspended: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                          inactive: 'bg-gray-100 text-gray-500 border-gray-200',
                          expired: 'bg-red-50 text-red-700 border-red-200',
                          pending: 'bg-blue-50 text-blue-700 border-blue-200 bg-blue-50/50',
                        };
                        const status = vendorSub.assigned_plan ? (vendorSub.subscription_status || 'inactive') : 'pending';
                        return (
                          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Subscription & Usage</h4>
                            </div>
                            <div className="p-4 space-y-4">
                              {/* Assigned Plan */}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400 font-medium">Plan</span>
                                <span className="text-xs font-bold text-gray-700 bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
                                  {vendorSub.assigned_plan 
                                    ? ((plans || []).find((p: any) => p.id === vendorSub.assigned_plan)?.name || vendorSub.assigned_plan) 
                                    : 'None'}
                                </span>
                              </div>
                              {/* Status */}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400 font-medium">Status</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${statusStyles[status] || statusStyles.inactive}`}>
                                  {status}
                                </span>
                              </div>
                              {/* Usage */}
                              {limits.max_products !== undefined && limits.max_products !== null ? (
                                <div className="space-y-3 pt-2 border-t border-gray-100">
                                  <div>
                                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                      <span>Products</span>
                                      <span className="font-bold">{usage.products_used} / {limits.max_products === -1 ? '∞' : limits.max_products}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${productPct >= 90 ? 'bg-red-400' : productPct >= 70 ? 'bg-yellow-400' : 'bg-indigo-400'}`} style={{ width: `${productPct}%` }} />
                                    </div>
                                  </div>
                                  <div className="text-[10px] text-gray-500">
                                    <span className="font-bold text-gray-700">{usage.scans_this_month}</span> scans this month
                                    <span className="text-gray-400"> / {limits.max_scans_per_month}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="pt-2 border-t border-gray-100">
                                  <span className="text-xs text-gray-400 italic">No plan assigned</span>
                                </div>
                              )}
                              {/* Assigned Since */}
                              {vendorSub.plan_assigned_at && (
                                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                  <span className="text-xs text-gray-400 font-medium">Assigned</span>
                                  <span className="text-xs font-bold text-gray-600">{new Date(vendorSub.plan_assigned_at).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Linked Accounts */}
                      {(() => {
                        const rolePriority: Record<string, number> = {
                          'Administrator': 1,
                          'vendor': 2,
                          'Manager': 3,
                          'Viewer': 4
                        };
                        const sortedLinkedAccounts = [...linkedAccounts].sort((a: any, b: any) => {
                          const pA = rolePriority[a.role] || 99;
                          const pB = rolePriority[b.role] || 99;
                          return pA - pB;
                        });

                        if (sortedLinkedAccounts.length === 0) return null;

                        return (
                          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Linked Accounts</h4>
                            </div>
                            <div className="p-4 space-y-2">
                              {sortedLinkedAccounts.map((acc: any) => (
                                  <div key={acc.id} className="flex items-center justify-between gap-2.5 py-1.5 border-b border-gray-50 last:border-b-0">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                                        <span className="text-[10px] font-black text-indigo-500">{(acc.name || acc.email || 'U').charAt(0).toUpperCase()}</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <p className="text-xs font-semibold text-gray-800 truncate max-w-[100px]">{acc.name || '—'}</p>
                                          <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 flex-shrink-0">
                                            {acc.role || 'Vendor'}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{acc.email}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border flex-shrink-0 ${
                                        acc.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                                      }`}>{acc.status || 'active'}</span>
                                      
                                      <button
                                        onClick={() => {
                                          setSelectedUserId(acc.id);
                                          setNewPassword(generateSecurePassword());
                                          setShowResetModal(true);
                                          setIsResetSuccess(false);
                                        }}
                                        title="Reset Password"
                                        className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-gray-50 rounded transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                        </svg>
                                      </button>
                                      
                                      <button
                                        onClick={() => handleToggleUserStatus(acc.id, acc.status || 'active')}
                                        title={acc.status === 'active' ? "Deactivate User" : "Activate User"}
                                        className={`p-1 rounded transition-colors ${acc.status === 'active' ? 'text-gray-400 hover:text-yellow-600 hover:bg-gray-50' : 'text-gray-400 hover:text-green-600 hover:bg-gray-50'}`}
                                      >
                                        {acc.status === 'active' ? (
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                          </svg>
                                        ) : (
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                        )}
                                      </button>
                                      
                                      <button
                                        onClick={() => handleDeleteUser(acc.id)}
                                        title="Delete Account"
                                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-50 rounded transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))
                              }
                            </div>
                          </div>
                        );
                      })()}

                      {/* Delete Vendor Button */}
                      <button
                        onClick={() => {
                          setDeleteVendorId(hub.id);
                          setDeleteVendorPassword("");
                          setShowDeleteVendorModal(true);
                        }}
                        className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Vendor
                      </button>

                    </div>{/* end SIDEBAR */}
                  </div>{/* end two-column */}
                </div>
              );
            })()}



            {/* ── Brand Details Modal ── */}
            {brandDetailVendor && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
                onClick={() => setBrandDetailVendor(null)}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-gray-100 flex flex-col animate-in zoom-in-95 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="px-8 py-6 border-b border-gray-100 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{brandDetailVendor.name}</h2>
                      <p className="text-sm text-gray-400 mt-0.5 font-medium">
                        {brandDetailVendor.brands.length} Registered {brandDetailVendor.brands.length === 1 ? 'Brand' : 'Brands'}
                      </p>
                    </div>
                    <button
                      onClick={() => setBrandDetailVendor(null)}
                      className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Brand List */}
                  <div className="overflow-y-auto flex-1 px-8 py-6 space-y-4">
                    {brandDetailVendor.brands.map((brand: any, idx: number) => {
                      const logoSrc = brand.logo_url
                        ? (brand.logo_url.startsWith('http') ? brand.logo_url : `${getApiBase()}${brand.logo_url}`)
                        : null;
                      const registeredDate = brand.created_at
                        ? (() => {
                            const d = new Date(brand.created_at);
                            return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                          })()
                        : '—';
                      return (
                        <div key={idx} className="flex items-center gap-5 p-5 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/20 transition-all">
                          {/* Logo */}
                          <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden flex items-center justify-center">
                            {logoSrc ? (
                              <img
                                src={logoSrc}
                                alt={brand.name}
                                className="w-full h-full object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <span className="text-2xl font-black text-gray-300">
                                {(brand.name || '?').charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-bold text-gray-900 truncate">{brand.name || 'Unnamed Brand'}</p>
                            <p className="text-xs text-indigo-500 font-semibold mt-0.5">Active Brand Entity</p>
                          </div>

                          {/* Date */}
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Registered</p>
                            <p className="text-xs font-semibold text-gray-600 font-mono">{registeredDate}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="px-8 py-5 border-t border-gray-100 bg-gray-50/50">
                    <button
                      onClick={() => setBrandDetailVendor(null)}
                      className="w-full px-6 py-3 bg-gray-900 text-white font-bold text-sm rounded-xl hover:bg-black transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                      Back
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Vendor Brand Creation Modal */}
            {showVendorModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900">Register New Brand</h3>
                    <button onClick={() => setShowVendorModal(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <form onSubmit={handleCreateVendor} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Vendor/Brand Name</label>
                      <input 
                        type="text" 
                        required
                        value={newVendorName}
                        onChange={(e) => setNewVendorName(e.target.value)}
                        placeholder="e.g. Luxe & Co."
                        className="input-field !text-black w-full"
                        style={{ color: 'black' }}
                        autoFocus
                      />
                    </div>
                    <div className="pt-4 flex gap-3">
                      <button 
                        type="button"
                        onClick={() => setShowVendorModal(false)}
                        className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-3 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center"
                      >
                        {isSubmitting ? 'Registering...' : 'Register Brand'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* User Creation Modal */}
            {showUserModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900">Create Vendor Login</h3>
                    <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <form onSubmit={handleCreateVendorUser} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Assign to Brand</label>
                      <select
                        required
                        value={newUserPayload.vendor_id}
                        onChange={(e) => setNewUserPayload({...newUserPayload, vendor_id: e.target.value})}
                        className="input-field !text-black w-full"
                        style={{ color: 'black' }}
                      >
                        <option value="">Select a Brand...</option>
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Rep Name</label>
                      <input 
                        type="text" required value={newUserPayload.name}
                        onChange={(e) => setNewUserPayload({...newUserPayload, name: e.target.value})}
                        placeholder="John Doe" className="input-field !text-black w-full" style={{ color: 'black' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Email Address</label>
                      <input 
                        type="email" required value={newUserPayload.email}
                        onChange={(e) => setNewUserPayload({...newUserPayload, email: e.target.value})}
                        placeholder="john@vendor.com" className="input-field !text-black w-full" style={{ color: 'black' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Initial Password</label>
                      <input 
                        type="password" required value={newUserPayload.password} minLength={6}
                        onChange={(e) => setNewUserPayload({...newUserPayload, password: e.target.value})}
                        placeholder="Secure password" className="input-field !text-black w-full" style={{ color: 'black' }}
                      />
                    </div>
                    <div className="pt-4 flex gap-3">
                      <button 
                        type="button" onClick={() => setShowUserModal(false)}
                        className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" disabled={isSubmitting}
                        className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? 'Creating...' : 'Create Account'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Reset Password Modal */}
            {showResetModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900">Reset Vendor Password</h3>
                    <button 
                      onClick={() => { 
                        setShowResetModal(false); 
                        setSelectedUserId(null); 
                        setNewPassword(""); 
                        setIsResetSuccess(false); 
                      }} 
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  
                  {isResetSuccess ? (
                    <div className="p-6 space-y-6 text-center">
                      <div className="w-16 h-16 bg-green-50 rounded-full border border-green-200 flex items-center justify-center mx-auto shadow-sm">
                        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-lg font-bold text-gray-900">Password Reset Successful</h4>
                        <p className="text-sm text-gray-500 px-4">
                          The new password has been set. Copy it now and share it with the vendor.
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between gap-3 max-w-sm mx-auto">
                        <code className="text-base font-mono font-bold text-indigo-600 tracking-wider select-all break-all">{newPassword}</code>
                        <button
                          type="button"
                          onClick={() => handleCopyPassword(newPassword)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition-all flex-shrink-0"
                        >
                          {isCopied ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              Copied
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m-6 4h6m-3-3v6" /></svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowResetModal(false);
                          setSelectedUserId(null);
                          setNewPassword("");
                          setIsResetSuccess(false);
                        }}
                        className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-gray-800 transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">New Random Password</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            required 
                            value={newPassword} 
                            minLength={6}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New secure password" 
                            className="input-field !text-black flex-1 font-mono tracking-wider" 
                            style={{ color: 'black' }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleCopyPassword(newPassword)}
                            className="px-3 border border-gray-200 hover:bg-gray-50 rounded-xl text-gray-500 transition-colors flex items-center justify-center flex-shrink-0"
                            title="Copy Password"
                          >
                            {isCopied ? (
                              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m-6 4h6m-3-3v6" /></svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPassword(generateSecurePassword())}
                            className="px-3 border border-gray-200 hover:bg-gray-50 rounded-xl text-indigo-600 font-bold transition-colors flex items-center justify-center flex-shrink-0"
                            title="Regenerate Password"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="pt-2 flex gap-3">
                        <button 
                          type="button" 
                          onClick={() => { 
                            setShowResetModal(false); 
                            setSelectedUserId(null); 
                            setNewPassword(""); 
                            setIsResetSuccess(false); 
                          }}
                          className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          disabled={isSubmitting}
                          className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                          {isSubmitting ? 'Resetting...' : 'Update Password'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* Admin Reset Password Modal */}
            {showAdminResetModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900">Reset Admin Password</h3>
                    <button onClick={() => { setShowAdminResetModal(false); setAdminNewPassword(""); }} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <form onSubmit={handleAdminResetPassword} className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">New Password</label>
                      <input 
                        type="password" required value={adminNewPassword} minLength={6}
                        onChange={(e) => setAdminNewPassword(e.target.value)}
                        placeholder="New secure password" className="input-field !text-black w-full" style={{ color: 'black' }}
                        autoFocus
                      />
                    </div>
                    <div className="pt-2 flex gap-3">
                      <button 
                        type="button" onClick={() => { setShowAdminResetModal(false); setAdminNewPassword(""); }}
                        className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" disabled={isSubmitting}
                        className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? 'Resetting...' : 'Reset Password'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Plan Info Modal */}
            {selectedPlanInfoModal && (() => {
              const sub = selectedPlanInfoModal.sub;
              const plan = selectedPlanInfoModal.plan;
              const limits = sub.limits || {};
              const usage = sub.usage || {};
              
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{sub.vendor_name}</h3>
                        <p className="text-xs text-gray-500 font-medium">Subscription Details & Plan Metrics</p>
                      </div>
                      <button onClick={() => setSelectedPlanInfoModal(null)} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      {/* Plan Summary */}
                      <div className="flex justify-between items-center p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                        <div>
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Assigned Plan</span>
                          <span className="text-base font-bold text-indigo-900">{plan?.name || sub.assigned_plan || "None"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-right text-gray-400 uppercase tracking-widest block">Status</span>
                          <span className={`text-xs font-bold uppercase tracking-wider block ${
                            sub.subscription_status === 'active' ? 'text-green-600' : 'text-gray-500'
                          }`}>
                            {sub.subscription_status || 'inactive'}
                          </span>
                        </div>
                      </div>

                      {/* Resource Usage & Limits */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Resource Usage</h4>
                        
                        {/* Products */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-500">Products (SKUs)</span>
                            <span className="text-gray-900">{usage.products_used ?? 0} / {limits.max_products ?? 'Unlimited'}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-indigo-600 h-full rounded-full transition-all"
                              style={{ width: `${limits.max_products ? Math.min(100, ((usage.products_used ?? 0) / limits.max_products) * 100) : 0}%` }}
                            />
                          </div>
                        </div>

                        {/* Scans */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-500">Monthly Scans</span>
                            <span className="text-gray-900">{(usage.scans_this_month ?? 0).toLocaleString()} / {(limits.max_scans_per_month ?? 'Unlimited').toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-green-600 h-full rounded-full transition-all"
                              style={{ width: `${limits.max_scans_per_month ? Math.min(100, ((usage.scans_this_month ?? 0) / limits.max_scans_per_month) * 100) : 0}%` }}
                            />
                          </div>
                        </div>

                        {/* Accounts/Users */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-500">Linked Accounts</span>
                            <span className="text-gray-900">{usage.users_used ?? 0} / {limits.max_users ?? 'Unlimited'}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-yellow-500 h-full rounded-full transition-all"
                              style={{ width: `${limits.max_users ? Math.min(100, ((usage.users_used ?? 0) / limits.max_users) * 100) : 0}%` }}
                            />
                          </div>
                        </div>

                        {/* Brands */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-500">Brands Limit</span>
                            <span className="text-gray-900">{usage.brands_used ?? 0} / {limits.max_brands ?? 'Unlimited'}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-red-500 h-full rounded-full transition-all"
                              style={{ width: `${limits.max_brands ? Math.min(100, ((usage.brands_used ?? 0) / limits.max_brands) * 100) : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>


                    </div>

                    <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex">
                      <button 
                        type="button" onClick={() => setSelectedPlanInfoModal(null)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors shadow-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* VIEW: PLANS & SUBSCRIPTIONS */}
            {activeSection === 'plans' && (() => {
              // Pagination logic
              const totalPages = Math.ceil(subscriptions.length / plansItemsPerPage);
              const startIndex = (plansCurrentPage - 1) * plansItemsPerPage;
              const endIndex = startIndex + plansItemsPerPage;
              const paginatedSubscriptions = subscriptions.slice(startIndex, endIndex);

              const handlePageChange = (newPage: number) => {
                setPlansCurrentPage(newPage);
              };

              const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
                setPlansItemsPerPage(Number(e.target.value));
                setPlansCurrentPage(1);
              };

              return (
                <div className="space-y-10">
                  {/* ── VENDOR SUBSCRIPTION MANAGEMENT TABLE ── */}
                  <div>
                    <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Vendor Subscription Management</h2>
                        <p className="text-sm font-medium text-gray-500 mt-1">Assign plans, manage subscription status, and monitor usage limits per vendor.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Show</label>
                        <select
                          value={plansItemsPerPage}
                          onChange={handleItemsPerPageChange}
                          className="text-sm font-bold bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={50}>50</option>
                        </select>
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">per page</label>
                      </div>
                    </header>

                    <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                      <div className={`overflow-x-auto ${plansItemsPerPage > 5 && subscriptions.length > 5 ? 'max-h-[450px] overflow-y-auto' : ''}`}>
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-gray-50/50 z-10">
                            <tr className="border-b border-gray-100">
                              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vendor</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Assigned Plan</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Since</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {subscriptions.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">No vendors registered yet.</td>
                              </tr>
                            ) : paginatedSubscriptions.map((sub: any) => {
                              const statusStyles: Record<string, string> = {
                                active: 'text-green-600',
                                suspended: 'text-yellow-600',
                                inactive: 'text-gray-500',
                                expired: 'text-red-600',
                                pending: 'text-blue-600',
                              };
                              const status = sub.assigned_plan ? (sub.subscription_status || 'inactive') : 'pending';
                              const limits = sub.limits || {};
                              const usage = sub.usage || {};
                              const productPct = limits.max_products ? Math.min(100, Math.round((usage.products_used / limits.max_products) * 100)) : 0;
                              return (
                                <tr key={sub.vendor_id} className="hover:bg-gray-50/80 transition-colors">
                                  {/* Vendor name */}
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs font-mono flex-shrink-0">
                                        {sub.vendor_name?.substring(0, 2).toUpperCase()}
                                      </div>
                                      <span className="text-sm font-bold text-gray-900">{sub.vendor_name}</span>
                                    </div>
                                  </td>
                                  {/* Plan assignment clickable */}
                                  <td className="px-6 py-4">
                                    {sub.assigned_plan ? (
                                      <button
                                        onClick={() => {
                                          const matchedPlan = (plans || []).find((p: any) => p.id === sub.assigned_plan);
                                          setSelectedPlanInfoModal({ sub, plan: matchedPlan });
                                        }}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 inline-block transition-all cursor-pointer text-left"
                                      >
                                        {(plans || []).find((p: any) => p.id === sub.assigned_plan)?.name || sub.assigned_plan}
                                      </button>
                                    ) : (
                                      <span className="text-xs font-bold text-gray-400 px-3 py-1.5 inline-block">—</span>
                                    )}
                                  </td>
                                  {/* Status badge */}
                                  <td className="px-6 py-4">
                                    <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-widest ${statusStyles[status] || statusStyles.inactive}`}>
                                      {status}
                                    </span>
                                  </td>
                                  {/* Assigned since */}
                                  <td className="px-6 py-4 text-xs text-gray-500">
                                    {sub.plan_assigned_at ? new Date(sub.plan_assigned_at).toLocaleDateString() : '—'}
                                  </td>
                                  {/* Actions */}
                                  <td className="px-6 py-4 text-right">
                                    {!sub.assigned_plan ? (
                                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1.5 rounded tracking-wider uppercase animate-pulse">
                                        Assign Plan Above
                                      </span>
                                    ) : (
                                      <div className="inline-flex items-center gap-3">
                                        {status === 'active' ? (
                                          <button
                                            onClick={async () => {
                                              if (!confirm(`Suspend ${sub.vendor_name}'s subscription?`)) return;
                                              try {
                                                await updateVendorSubscriptionStatus(sub.vendor_id, 'suspended');
                                                await fetchData();
                                              } catch (err: any) { alert(err.message || 'Failed'); }
                                            }}
                                            className="text-[10px] font-bold text-yellow-600 hover:text-yellow-800 uppercase tracking-wider cursor-pointer"
                                          >
                                            Suspend
                                          </button>
                                        ) : (
                                          <button
                                            onClick={async () => {
                                              try {
                                                await updateVendorSubscriptionStatus(sub.vendor_id, 'active');
                                                await fetchData();
                                              } catch (err: any) { alert(err.message || 'Failed'); }
                                            }}
                                            className="text-[10px] font-bold text-green-600 hover:text-green-800 uppercase tracking-wider cursor-pointer"
                                          >
                                            Reactivate
                                          </button>
                                        )}
                                        <button
                                          onClick={async () => {
                                            if (!confirm(`Deactivate ${sub.vendor_name}'s subscription?`)) return;
                                            try {
                                              await updateVendorSubscriptionStatus(sub.vendor_id, 'inactive');
                                              await fetchData();
                                            } catch (err: any) { alert(err.message || 'Failed'); }
                                          }}
                                          className="text-[10px] font-bold bg-red-500 hover:bg-red-600 text-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer uppercase tracking-wider inline-block"
                                        >
                                          Deactivate
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Pagination Controls */}
                      {subscriptions.length > 0 && (
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                          <div className="text-xs text-gray-500">
                            Showing {startIndex + 1} to {Math.min(endIndex, subscriptions.length)} of {subscriptions.length} vendors
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePageChange(plansCurrentPage - 1)}
                              disabled={plansCurrentPage === 1}
                              className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                              Previous
                            </button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (plansCurrentPage <= 3) {
                                  pageNum = i + 1;
                                } else if (plansCurrentPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = plansCurrentPage - 2 + i;
                                }
                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => handlePageChange(pageNum)}
                                    className={`w-8 h-8 text-xs font-bold rounded-lg transition-all ${
                                      pageNum === plansCurrentPage
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                                    }`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => handlePageChange(plansCurrentPage + 1)}
                              disabled={plansCurrentPage === totalPages}
                              className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>

                {/* ── PLAN DEFINITIONS ── */}
                <div>
                  <header className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Available Plans</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Platform-wide plan definitions and feature limits.</p>
                  </header>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(plans || []).map((plan: any) => (
                      <div key={plan.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-lg font-bold text-gray-900">{plan.name}</h4>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mt-1 inline-block bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {plan.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 border border-gray-200 px-2 py-1 rounded">
                            {subscriptions.filter((s: any) => s.assigned_plan === plan.id && s.subscription_status === 'active').length} vendors
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{plan.description}</p>
                        <div className="pt-4 border-t border-gray-100">
                          <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">Usage Limits</h5>
                          <ul className="text-sm text-gray-600 space-y-1">
                            <li className="flex justify-between"><span>Max Products</span><span className="font-bold text-gray-900">{plan.limits?.max_products}</span></li>
                            <li className="flex justify-between"><span>Max Scans/mo</span><span className="font-bold text-gray-900">{plan.limits?.max_scans_per_month?.toLocaleString()}</span></li>
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
})()}




            {/* VIEW: FEATURES */}
            {activeSection === 'features' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Feature Management</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Manage platform features and user-specific feature overrides</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingPlan(null);
                      setShowPlanCreator(true);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Create New Plan
                  </button>
                </header>

                {/* Plan Creator Modal */}
                {showPlanCreator && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-gray-100 animate-in zoom-in-95 duration-200">
                      <PlanCreatorDashboard
                        plan={editingPlan}
                        onSave={async (planData) => {
                          try {
                            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                            const token = localStorage.getItem("authentiq_admin_token");
                            
                            if (editingPlan) {
                              await fetch(`${baseUrl}/admin/plans/${editingPlan.id}`, {
                                method: 'PUT',
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(token ? { "Authorization": `Bearer ${token}` } : {})
                                },
                                body: JSON.stringify(planData)
                              });
                            } else {
                              await fetch(`${baseUrl}/admin/plans`, {
                                method: 'POST',
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(token ? { "Authorization": `Bearer ${token}` } : {})
                                },
                                body: JSON.stringify(planData)
                              });
                            }
                            
                            setShowPlanCreator(false);
                            setEditingPlan(null);
                            await fetchData();
                          } catch (err: any) {
                            alert(err.message || "Failed to save plan");
                          }
                        }}
                        onCancel={() => {
                          setShowPlanCreator(false);
                          setEditingPlan(null);
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Vendor Feature Management Modal */}
                {showVendorFeatureManager && selectedVendorForFeatures && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-100 animate-in zoom-in-95 duration-200">
                      <VendorFeatureManagement
                        vendor={selectedVendorForFeatures}
                        onClose={async () => {
                          setShowVendorFeatureManager(false);
                          setSelectedVendorForFeatures(null);
                          await fetchData();
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Plans with Feature Management */}
                <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Available Plans</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(plans || []).map((plan: any) => (
                      <div key={plan.id} className="bg-gray-50 p-6 rounded-xl border border-gray-200 flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-lg font-bold text-gray-900">{plan.name}</h4>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mt-1 inline-block ${plan.active ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                              {plan.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setEditingPlan(plan);
                              setShowPlanCreator(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                          >
                            Edit
                          </button>
                        </div>
                        <p className="text-sm text-gray-600">{plan.description || 'No description'}</p>
                        <div className="pt-4 border-t border-gray-200">
                          <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">Resource Limits</h5>
                          <ul className="text-sm text-gray-600 space-y-1">
                            <li className="flex justify-between"><span>Products</span><span className="font-bold text-gray-900">{plan.limits?.max_products || 0}</span></li>
                            <li className="flex justify-between"><span>Users</span><span className="font-bold text-gray-900">{plan.limits?.max_users || 0}</span></li>
                            <li className="flex justify-between"><span>Scans/mo</span><span className="font-bold text-gray-900">{plan.limits?.max_scans_per_month?.toLocaleString() || 0}</span></li>
                          </ul>
                        </div>
                        <div className="pt-4 border-t border-gray-200">
                          <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">Features ({plan.feature_ids?.length || 0})</h5>
                          <div className="flex flex-wrap gap-2">
                            {plan.feature_ids?.length > 0 ? (
                              plan.feature_ids.slice(0, 5).map((featureId: string) => (
                                <span key={featureId} className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold uppercase tracking-wider">{featureId}</span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400">No features assigned</span>
                            )}
                            {plan.feature_ids?.length > 5 && (
                              <span className="text-xs text-gray-500">+{plan.feature_ids.length - 5} more</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vendor Feature Overrides */}
                <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Vendor Feature Overrides</h3>
                  <p className="text-sm text-gray-500 mb-6">Manage platform feature overrides per vendor</p>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vendor</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Plan</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {vendors.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-400">
                              No vendors found
                            </td>
                          </tr>
                        ) : (
                          vendors.map((vendor: any) => (
                            <tr key={vendor.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="px-6 py-4 text-sm font-semibold text-gray-900">{vendor.name}</td>
                              <td className="px-6 py-4 text-sm text-gray-600">{vendor.subscription_status || '—'}</td>
                              <td className="px-6 py-4 text-sm text-gray-600">{vendor.assigned_plan || '—'}</td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => {
                                    setSelectedVendorForFeatures(vendor);
                                    setShowVendorFeatureManager(true);
                                  }}
                                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                                >
                                  Manage Features
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW: ANALYTICS */}
            {activeSection === 'analytics' && (() => {
              if (selectedAnalyticsVendorCard === null) {
                // Page 1: Grid of searchable/sortable vendor cards

                // 1. Filter vendors by search query
                const filteredVendorList = (vendors || []).filter((v: any) =>
                  !analyticsSearch.trim() ||
                  v.name?.toLowerCase().includes(analyticsSearch.toLowerCase())
                );

                // Helper to get stats for sorting and display
                const getVendorStats = (vendorId: string) => {
                  const sub = subscriptions.find((s: any) => s.vendor_id === vendorId);
                  const scansCount = sub?.usage?.scans_this_month || scans.filter((s: any) => s.vendor_id === vendorId).length || 0;
                  const productsCount = sub?.usage?.products_used || 0;
                  return { scansCount, productsCount };
                };

                // 2. Sort vendors list
                const sortedVendorList = [...filteredVendorList].sort((a: any, b: any) => {
                  if (analyticsSortBy === 'name-asc') {
                    return (a.name || '').localeCompare(b.name || '');
                  }
                  if (analyticsSortBy === 'name-desc') {
                    return (b.name || '').localeCompare(a.name || '');
                  }
                  if (analyticsSortBy === 'date-desc') {
                    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return timeB - timeA;
                  }
                  if (analyticsSortBy === 'date-asc') {
                    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return timeA - timeB;
                  }
                  if (analyticsSortBy === 'scans-desc') {
                    return getVendorStats(b.id).scansCount - getVendorStats(a.id).scansCount;
                  }
                  if (analyticsSortBy === 'products-desc') {
                    return getVendorStats(b.id).productsCount - getVendorStats(a.id).productsCount;
                  }
                  return 0;
                });

                return (
                  <div className="space-y-8 animate-in fade-in duration-300">
                    <header className="mb-4">
                      <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Enterprise Analytics</h2>
                      <p className="text-sm font-medium text-gray-500 mt-1">Select a vendor registry card below to view detailed analytics.</p>
                    </header>

                    {/* Query Bar */}
                    <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      {/* Search Bar */}
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <input
                          type="text"
                          value={analyticsSearch}
                          onChange={(e) => setAnalyticsSearch(e.target.value)}
                          placeholder="Search analytics by vendor name..."
                          className="block w-full pl-10 pr-4 py-2 text-sm bg-gray-50/50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        />
                      </div>

                      {/* Sort Dropdown */}
                      <div className="flex items-center gap-2">
                        <label htmlFor="analytics-sort" className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Sort By</label>
                        <select
                          id="analytics-sort"
                          value={analyticsSortBy}
                          onChange={(e) => setAnalyticsSortBy(e.target.value)}
                          className="text-sm font-bold bg-white border border-gray-200 rounded-lg px-4 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                          <option value="name-asc">Name (A-Z)</option>
                          <option value="name-desc">Name (Z-A)</option>
                          <option value="date-desc">Newest First</option>
                          <option value="date-asc">Oldest First</option>
                          <option value="scans-desc">Most Scans</option>
                          <option value="products-desc">Most Products</option>
                        </select>
                      </div>
                    </div>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      
                      {/* Special Global Analytics Card */}
                      <div
                        onClick={() => {
                          setSelectedAnalyticsVendorCard({ id: 'all', name: 'System Global' });
                          setSelectedAnalyticsVendor('all');
                          window.scrollTo(0, 0);
                        }}
                        className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 rounded-2xl border border-indigo-600 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between min-h-[160px]"
                      >
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 border border-white/10 px-2 py-0.5 rounded">Platform Total</span>
                          <h3 className="text-lg font-bold mt-2">All Analytics</h3>
                          <p className="text-xs text-indigo-100 mt-1">Global supply chain performance aggregates</p>
                        </div>
                        <div className="flex justify-between items-end border-t border-white/10 pt-4 mt-4 text-xs">
                          <div>
                            <span className="opacity-70">Total Scans:</span>
                            <p className="font-bold text-sm text-white">{totalScans || analytics.total_scans || 0}</p>
                          </div>
                          <svg className="w-6 h-6 opacity-80" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                      </div>

                      {/* Individual Vendor Cards */}
                      {sortedVendorList.map((vendor: any) => {
                        const stats = getVendorStats(vendor.id);
                        return (
                          <div
                            key={vendor.id}
                            onClick={() => {
                              setSelectedAnalyticsVendorCard(vendor);
                              setSelectedAnalyticsVendor(vendor.id);
                              window.scrollTo(0, 0);
                            }}
                            className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between min-h-[160px]"
                          >
                            <div>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-500 font-mono">
                                  {vendor.name?.substring(0, 2).toUpperCase()}
                                </div>
                                <h3 className="text-sm font-bold text-gray-900 truncate max-w-[140px]" title={vendor.name}>
                                  {vendor.name}
                                </h3>
                              </div>
                              <p className="text-[10px] text-gray-400 font-medium mt-2">
                                Registered: {vendor.created_at ? new Date(vendor.created_at).toLocaleDateString() : '—'}
                              </p>
                            </div>

                            <div className="flex justify-between items-end border-t border-gray-50 pt-4 mt-4 text-[10px]">
                              <div>
                                <span className="text-gray-400">Scans:</span>
                                <p className="font-bold text-gray-800 text-xs">{stats.scansCount}</p>
                              </div>
                              <div>
                                <span className="text-gray-400">Products:</span>
                                <p className="font-bold text-gray-800 text-xs">{stats.productsCount}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // Page 2: Detailed view
              const filteredScans = selectedAnalyticsVendorCard.id === 'all'
                ? scans
                : scans.filter((s: any) => s.vendor_id === selectedAnalyticsVendorCard.id);

              const activeSub = selectedAnalyticsVendorCard.id === 'all'
                ? null
                : subscriptions.find((sub: any) => sub.vendor_id === selectedAnalyticsVendorCard.id);

              const scanCount = selectedAnalyticsVendorCard.id === 'all'
                ? (totalScans || analytics.total_scans || 0)
                : (activeSub?.usage?.scans_this_month || filteredScans.length || 0);

              const productCount = selectedAnalyticsVendorCard.id === 'all'
                ? (analytics.total_products || 0)
                : (activeSub?.usage?.products_used || 0);

              const ipCount = new Set(filteredScans.map((s: any) => s.ip_address)).size;

              const dynamicLocations = (() => {
                if (selectedAnalyticsVendorCard.id === 'all') {
                  return locations;
                }
                const agg: Record<string, { country: string; city: string; count: number }> = {};
                filteredScans.forEach((s: any) => {
                  let country = 'Unknown';
                  let city = 'Unknown';
                  if (typeof s.location === 'string') {
                    country = s.location;
                  } else if (s.location) {
                    country = s.location.country || 'Unknown';
                    city = s.location.city || 'Unknown';
                  }
                  const key = `${country}-${city}`;
                  if (!agg[key]) {
                    agg[key] = { country, city, count: 0 };
                  }
                  agg[key].count += 1;
                });
                return Object.values(agg).sort((a, b) => b.count - a.count);
              })();

              // Calculate trends for visual charts
              const scansByDay = (() => {
                const days = Array.from({ length: 7 }).map((_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - i);
                  try {
                    return d.toISOString().split('T')[0];
                  } catch (e) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const dayVal = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${dayVal}`;
                  }
                }).reverse();

                return days.map(dateStr => {
                  const count = filteredScans.filter((s: any) => {
                    if (!s.timestamp) return false;
                    try {
                      let tVal = s.timestamp;
                      if (typeof tVal === 'string' && !isNaN(Number(tVal))) {
                        tVal = Number(tVal);
                      }
                      const d = new Date(tVal);
                      if (isNaN(d.getTime())) {
                        if (typeof s.timestamp === 'string') {
                          const withT = s.timestamp.replace(' ', 'T');
                          const d2 = new Date(withT);
                          if (!isNaN(d2.getTime())) {
                            return d2.toISOString().split('T')[0] === dateStr;
                          }
                        }
                        return false;
                      }
                      return d.toISOString().split('T')[0] === dateStr;
                    } catch (e) {
                      return false;
                    }
                  }).length;

                  let label = dateStr;
                  try {
                    const [y, m, d] = dateStr.split('-').map(Number);
                    const labelDate = new Date(y, m - 1, d);
                    label = labelDate.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
                  } catch (e) {}

                  return {
                    date: dateStr,
                    label,
                    count
                  };
                });
              })();

              const productStats = (() => {
                const agg: Record<string, number> = {};
                filteredScans.forEach((s: any) => {
                  const name = s.product_name || s.product_id || 'Unknown Product';
                  agg[name] = (agg[name] || 0) + 1;
                });
                return Object.entries(agg)
                  .map(([name, count]) => ({ name, count }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5);
              })();

              const flaggedScans = filteredScans.filter((s: any) => s.is_suspicious === true);
              const verifiedScans = filteredScans.filter((s: any) => s.is_suspicious !== true);

              // Flagged scans pagination
              const flaggedPerPage = 50;
              const totalFlagged = flaggedScans.length;
              const totalFlaggedPages = Math.ceil(totalFlagged / flaggedPerPage) || 1;
              const currentFlaggedPageVal = Math.min(flaggedScansPage, totalFlaggedPages);
              const flaggedStartIndex = (currentFlaggedPageVal - 1) * flaggedPerPage;
              const flaggedEndIndex = flaggedStartIndex + flaggedPerPage;
              const paginatedFlaggedScans = flaggedScans.slice(flaggedStartIndex, flaggedEndIndex);

              const scansPerPage = 50;
              const totalScansForFeed = verifiedScans.length;
              const totalScansPages = Math.ceil(totalScansForFeed / scansPerPage) || 1;
              const currentScansPageVal = Math.min(recentScansPage, totalScansPages);
              const scansStartIndex = (currentScansPageVal - 1) * scansPerPage;
              const scansEndIndex = scansStartIndex + scansPerPage;
              const paginatedVerifiedScans = verifiedScans.slice(scansStartIndex, scansEndIndex);

              return (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <header className="mb-4">
                    {/* Back button */}
                    <div className="mb-4">
                      <button
                        onClick={() => setSelectedAnalyticsVendorCard(null)}
                        className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Analytics List
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                          {selectedAnalyticsVendorCard.id === 'all' ? 'Enterprise Analytics' : `${selectedAnalyticsVendorCard.name} Analytics`}
                        </h2>
                        <p className="text-sm font-medium text-gray-500 mt-1">
                          {selectedAnalyticsVendorCard.id === 'all' 
                            ? 'Real-time IP intelligence and verification traffic.'
                            : `Supply chain verification statistics for ${selectedAnalyticsVendorCard.name}.`
                          }
                        </p>
                      </div>
                    </div>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatsCard 
                      label="Verification Scans" 
                      value={scanCount} 
                      trend={selectedAnalyticsVendorCard.id === 'all' ? "System Global" : "Vendor Specific"} 
                      trendStatus="positive" 
                      color="green" 
                    />
                    <StatsCard 
                      label="Registered Products" 
                      value={productCount} 
                      trend={selectedAnalyticsVendorCard.id === 'all' ? "Synchronized" : "Vendor Specific"} 
                      trendStatus="positive" 
                      color="blue" 
                    />
                    <StatsCard 
                      label="Recent IP Count" 
                      value={ipCount} 
                      trend="Unique Sources" 
                      trendStatus="positive" 
                      color="purple" 
                    />
                  </div>

                  {/* Geolocation Analytics */}
                  <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <h3 className="font-bold text-gray-900">Global Scan Distribution</h3>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded">Location Intelligence</span>
                    </div>
                    <div className="p-6">
                      <LocationDistribution 
                        locations={dynamicLocations} 
                        isLoading={!isLoaded} 
                        theme={{ barColor: "from-indigo-500 to-purple-500", textColor: "text-gray-900" }} 
                      />
                    </div>
                  </section>

                  {/* Visual Charts Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Daily Scan Trends */}
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                      <h3 className="font-bold text-gray-900 mb-6 flex items-center justify-between">
                        <span>Verification Activity (Last 7 Days)</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded">Daily Trends</span>
                      </h3>
                      <div className="flex items-end justify-between h-36 border-b border-gray-100 px-4">
                        {scansByDay.map((d, idx) => {
                          const maxVal = Math.max(...scansByDay.map(x => x.count), 1);
                          const pct = (d.count / maxVal) * 100;
                          return (
                            <div key={idx} className="flex flex-col justify-end items-center h-full flex-1 group relative">
                              <div className="absolute bottom-full mb-2 bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md z-20">
                                {d.count} scans
                              </div>
                              <div 
                                className="w-8 sm:w-12 bg-gradient-to-t from-indigo-500 to-indigo-600 rounded-t-md hover:from-indigo-600 hover:to-purple-600 transition-all duration-500 shadow-sm cursor-pointer"
                                style={{ height: `${Math.max(pct, 5)}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between px-4 mt-3">
                        {scansByDay.map((d, idx) => (
                          <div key={idx} className="flex-1 text-center">
                            <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">
                              {d.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Top Scanned Products */}
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                      <h3 className="font-bold text-gray-900 mb-6 flex items-center justify-between">
                        <span>Top Scanned Products</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded">Product Metrics</span>
                      </h3>
                      <div className="space-y-4">
                        {productStats.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-8">No product scans recorded.</p>
                        ) : (
                          productStats.map((item, idx) => {
                            const maxVal = Math.max(...productStats.map(p => p.count), 1);
                            const pct = (item.count / maxVal) * 100;
                            return (
                              <div key={idx} className="space-y-1.5 text-slate-700">
                                <div className="flex justify-between items-center text-xs font-semibold">
                                  <span className="truncate max-w-[200px]" title={item.name}>{item.name}</span>
                                  <span>{item.count} scans</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                  <div 
                                    className="bg-gradient-to-r from-purple-500 to-indigo-600 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Two-part Scans Layout (Split) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Flagged Threat Activities */}
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
                      <div ref={flaggedScansScrollRef} className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10">
                            <tr className="border-b border-gray-100 bg-transparent">
                              <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">IP / Product</th>
                              <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</th>
                              <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Timestamp</th>
                              <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {paginatedFlaggedScans.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-5 py-10 text-center text-xs text-gray-500 italic">No suspicious activity detected. Registry is healthy.</td>
                              </tr>
                            ) : (
                              paginatedFlaggedScans.map((scan, i) => (
                                <motion.tr
                                  key={`${currentFlaggedPageVal}-${scan.id || i}`}
                                  initial={{ opacity: 0, y: 15 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 70,
                                    damping: 15,
                                    mass: 0.8,
                                    delay: (i % 15) * 0.025
                                  }}
                                  className="hover:bg-red-50/30 transition-colors"
                                >
                                  <td className="px-5 py-4">
                                    <p className="text-xs font-mono font-bold text-gray-900">{scan.ip_address}</p>
                                    <p className="text-[9px] text-gray-400 truncate max-w-[150px]" title={scan.user_agent}>
                                      {scan.user_agent || 'Unknown Device'}
                                    </p>
                                    <p className="text-[9px] font-bold text-indigo-600 mt-0.5">{(scan.product_name || scan.product_id) || "Unknown Product"}</p>
                                  </td>
                                  <td className="px-5 py-4">
                                    <p className="text-xs font-medium text-gray-700">
                                      {typeof scan.location === 'string'
                                        ? scan.location
                                        : `${scan.location?.city || 'Unknown'}${scan.location?.state ? `, ${scan.location.state}` : ''}, ${scan.location?.country || 'Local'}`}
                                    </p>
                                  </td>
                                  <td className="px-5 py-4 text-xs text-gray-500">
                                    {new Date(scan.timestamp).toLocaleString()}
                                  </td>
                                  <td className="px-5 py-4 text-right">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-red-100 text-red-700 border border-red-200">
                                      Flagged
                                    </span>
                                  </td>
                                </motion.tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalFlagged > 0 && (
                        <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50/50">
                          <div className="text-xs text-gray-400 font-medium">
                            Page {currentFlaggedPageVal} of {totalFlaggedPages}
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setFlaggedScansPage(prev => Math.max(prev - 1, 1))}
                              disabled={currentFlaggedPageVal === 1}
                              className="px-4 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white flex items-center gap-1.5 cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                              </svg>
                              Previous
                            </button>
                            <button
                              onClick={() => setFlaggedScansPage(prev => Math.min(prev + 1, totalFlaggedPages))}
                              disabled={currentFlaggedPageVal === totalFlaggedPages}
                              className="px-4 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white flex items-center gap-1.5 cursor-pointer"
                            >
                              Next
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Right: Recent Verification Feed */}
                    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                          Recent Verification Feed
                        </h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-green-600 bg-green-50 border border-green-100 px-2 py-1 rounded">Verified Logs</span>
                      </div>
                      <div ref={recentScansScrollRef} className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10">
                            <tr className="border-b border-gray-100 bg-transparent">
                              <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">IP / Product</th>
                              <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</th>
                              <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Timestamp</th>
                              <th className="px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {paginatedVerifiedScans.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-5 py-10 text-center text-xs text-gray-500 italic">No verification logs available.</td>
                              </tr>
                            ) : (
                              paginatedVerifiedScans.map((scan, i) => (
                                <motion.tr
                                  key={`${currentScansPageVal}-${scan.id || i}`}
                                  initial={{ opacity: 0, y: 15 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 70,
                                    damping: 15,
                                    mass: 0.8,
                                    delay: (i % 15) * 0.025
                                  }}
                                  className="hover:bg-gray-50/80 transition-colors"
                                >
                                  <td className="px-5 py-4">
                                    <p className="text-xs font-mono font-bold text-gray-900">{scan.ip_address}</p>
                                    <p className="text-[9px] text-gray-400 truncate max-w-[150px]" title={scan.user_agent}>
                                      {scan.user_agent || 'Unknown Device'}
                                    </p>
                                    <p className="text-[9px] font-bold text-indigo-600 mt-0.5">{(scan.product_name || scan.product_id) || "Unknown Product"}</p>
                                  </td>
                                  <td className="px-5 py-4">
                                    <p className="text-xs font-medium text-gray-700">
                                      {typeof scan.location === 'string'
                                        ? scan.location
                                        : `${scan.location?.city || 'Unknown'}${scan.location?.state ? `, ${scan.location.state}` : ''}, ${scan.location?.country || 'Local'}`}
                                    </p>
                                  </td>
                                  <td className="px-5 py-4 text-xs text-gray-500">
                                    {new Date(scan.timestamp).toLocaleString()}
                                  </td>
                                  <td className="px-5 py-4 text-right">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-green-100 text-green-700 border border-green-200">
                                      Verified
                                    </span>
                                  </td>
                                </motion.tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalScansForFeed > 0 && (
                        <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50/50">
                          <div className="text-xs text-gray-400 font-medium">
                            Page {currentScansPageVal} of {totalScansPages}
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setRecentScansPage(prev => Math.max(prev - 1, 1))}
                              disabled={currentScansPageVal === 1}
                              className="px-4 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white flex items-center gap-1.5 cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                              </svg>
                              Previous
                            </button>
                            <button
                              onClick={() => setRecentScansPage(prev => Math.min(prev + 1, totalScansPages))}
                              disabled={currentScansPageVal === totalScansPages}
                              className="px-4 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white flex items-center gap-1.5 cursor-pointer"
                            >
                              Next
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              );
            })()}

            {/* VIEW: ACTIVITY */}
            {activeSection === 'activity' && (() => {
              if (selectedActivityVendorCard === null) {
                // Page 1: Grid of searchable/sortable vendor cards
                const filteredVendorList = (vendors || []).filter((v: any) =>
                  !activitySearch.trim() ||
                  v.name?.toLowerCase().includes(activitySearch.toLowerCase())
                );

                const getVendorActivityStats = (vendorId: string) => {
                  const count = (activities || []).filter((act: any) => act.vendor_id === vendorId).length;
                  return { count };
                };

                const sortedVendorList = [...filteredVendorList].sort((a: any, b: any) => {
                  if (activitySortBy === 'name-asc') {
                    return (a.name || '').localeCompare(b.name || '');
                  }
                  if (activitySortBy === 'name-desc') {
                    return (b.name || '').localeCompare(a.name || '');
                  }
                  if (activitySortBy === 'date-desc') {
                    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return timeB - timeA;
                  }
                  if (activitySortBy === 'events-desc') {
                    return getVendorActivityStats(b.id).count - getVendorActivityStats(a.id).count;
                  }
                  return 0;
                });

                return (
                  <div className="space-y-8 animate-in fade-in duration-300">
                    <header className="mb-4">
                      <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Enterprise Logs & Activities</h2>
                      <p className="text-sm font-medium text-gray-500 mt-1">Select an organization card below to view detailed audit logs.</p>
                    </header>

                    {/* Query Bar */}
                    <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      {/* Search Bar */}
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <input
                          type="text"
                          value={activitySearch}
                          onChange={(e) => setActivitySearch(e.target.value)}
                          placeholder="Search activities by vendor name..."
                          className="block w-full pl-10 pr-4 py-2 text-sm bg-gray-50/50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                        />
                      </div>

                      {/* Sort Dropdown */}
                      <div className="flex items-center gap-2">
                        <label htmlFor="activity-vendor-sort" className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Sort By</label>
                        <select
                          id="activity-vendor-sort"
                          value={activitySortBy}
                          onChange={(e) => setActivitySortBy(e.target.value)}
                          className="text-sm font-bold bg-white border border-gray-200 rounded-lg px-4 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                          <option value="name-asc">Name (A-Z)</option>
                          <option value="name-desc">Name (Z-A)</option>
                          <option value="date-desc">Newest First</option>
                          <option value="events-desc">Most Events</option>
                        </select>
                      </div>
                    </div>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      
                      {/* Highlighted Admin Activity Card */}
                      <div
                        onClick={() => {
                          setSelectedActivityVendorCard({ id: 'all', name: 'Admin Activity' });
                          window.scrollTo(0, 0);
                        }}
                        className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 rounded-2xl border border-indigo-600 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between min-h-[160px]"
                      >
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 border border-white/10 px-2 py-0.5 rounded">Platform Log</span>
                          <h3 className="text-lg font-bold mt-2">Admin Activity</h3>
                          <p className="text-xs text-indigo-100 mt-1">Platform audit log and global registry events</p>
                        </div>
                        <div className="flex justify-between items-end border-t border-white/10 pt-4 mt-4 text-xs">
                          <div>
                            <span className="opacity-70">Total Events:</span>
                            <p className="font-bold text-sm text-white">{activities.length}</p>
                          </div>
                          <svg className="w-6 h-6 opacity-80" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>

                      {/* Individual Vendor Cards */}
                      {sortedVendorList.map((vendor: any) => {
                        const stats = getVendorActivityStats(vendor.id);
                        return (
                          <div
                            key={vendor.id}
                            onClick={() => {
                              setSelectedActivityVendorCard(vendor);
                              window.scrollTo(0, 0);
                            }}
                            className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between min-h-[160px]"
                          >
                            <div>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-500 font-mono">
                                  {vendor.name?.substring(0, 2).toUpperCase()}
                                </div>
                                <h3 className="text-sm font-bold text-gray-900 truncate max-w-[140px]" title={vendor.name}>
                                  {vendor.name}
                                </h3>
                              </div>
                              <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-wide truncate">
                                ID: {vendor.id?.substring(0, 8)}...
                              </p>
                            </div>
                            <div className="flex justify-between items-end border-t border-gray-100 pt-4 mt-4 text-[11px]">
                              <div>
                                <span className="text-gray-400 font-semibold">Total Logged:</span>
                                <p className="font-black text-gray-800">{stats.count} events</p>
                              </div>
                              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // Page 2: Filtered Activities List (for selected activity card)
              const isAll = selectedActivityVendorCard.id === 'all';
              
              // Filter activities by selected vendor
              const vendorActivities = isAll 
                ? activities 
                : activities.filter((act: any) => act.vendor_id === selectedActivityVendorCard.id);

              const filteredActivities = vendorActivities.filter((activity: any) => {
                if (activityFilter === 'flagged') {
                  return activity.type === 'warning' || activity.type === 'alert';
                }
                return true;
              });

              // Sort activities
              const sortedActivities = [...filteredActivities].sort((a: any, b: any) => {
                if (activitySortOrder === 'newest') {
                  const timeA = a.rawTimestamp ? new Date(a.rawTimestamp).getTime() : 0;
                  const timeB = b.rawTimestamp ? new Date(b.rawTimestamp).getTime() : 0;
                  return timeB - timeA;
                }
                if (activitySortOrder === 'oldest') {
                  const timeA = a.rawTimestamp ? new Date(a.rawTimestamp).getTime() : 0;
                  const timeB = b.rawTimestamp ? new Date(b.rawTimestamp).getTime() : 0;
                  return timeA - timeB;
                }
                if (activitySortOrder === 'type-asc') {
                  return (a.type || '').localeCompare(b.type || '');
                }
                if (activitySortOrder === 'type-desc') {
                  return (b.type || '').localeCompare(a.type || '');
                }
                return 0;
              });

              return (
                <div className="space-y-8 animate-in fade-in duration-300">
                  {/* Back Navigation & Header */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedActivityVendorCard(null)}
                      className="p-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div>
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">Audit Log</span>
                      <h2 className="text-xl font-bold text-gray-900 mt-1">
                        {isAll ? 'Platform Audit Log' : `${selectedActivityVendorCard.name} Activity`}
                      </h2>
                    </div>
                  </div>

                  <header className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mt-1">
                        {isAll 
                          ? 'Real-time feed of all verification and registration events.' 
                          : `Activity and audit trail relative to ${selectedActivityVendorCard.name}.`
                        }
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      {/* Filter Dropdown */}
                      <div className="flex items-center gap-2">
                        <label htmlFor="activity-filter" className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Filter</label>
                        <select
                          id="activity-filter"
                          value={activityFilter}
                          onChange={(e) => setActivityFilter(e.target.value)}
                          className="text-sm font-bold bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                          <option value="all">All Events</option>
                          <option value="flagged">Flagged / Warnings Only</option>
                        </select>
                      </div>

                      {/* Sort Dropdown */}
                      <div className="flex items-center gap-2">
                        <label htmlFor="activity-sort" className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Sort By</label>
                        <select
                          id="activity-sort"
                          value={activitySortOrder}
                          onChange={(e) => setActivitySortOrder(e.target.value)}
                          className="text-sm font-bold bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                          <option value="newest">Newest First</option>
                          <option value="oldest">Oldest First</option>
                          <option value="type-asc">Event Type (A-Z)</option>
                          <option value="type-desc">Event Type (Z-A)</option>
                        </select>
                      </div>
                    </div>
                  </header>

                  <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-gray-50/50 z-10 backdrop-blur-sm">
                          <tr className="border-b border-gray-100">
                            <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Event</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Details</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Occurred</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sortedActivities.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-400 font-medium">No activity registered.</td>
                            </tr>
                          ) : (
                            sortedActivities.map((activity: any, idx: number) => (
                              <motion.tr
                                key={activity.id || idx}
                                initial={{ opacity: 0, y: -15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ type: "spring", stiffness: 80, damping: 15, mass: 0.8 }}
                                className="hover:bg-gray-50/80 transition-colors"
                              >
                                {/* Event Title with optional Flagged badge */}
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-900 truncate max-w-[200px]" title={activity.title}>
                                      {activity.title}
                                    </span>
                                    {(activity.type === 'warning' || activity.type === 'alert') && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                        Flagged
                                      </span>
                                    )}
                                    {activity.type === 'deleted' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-50 text-gray-600 border border-gray-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                        Deleted
                                      </span>
                                    )}
                                  </div>
                                </td>
                                
                                {/* Details/Description */}
                                <td className="px-6 py-4">
                                  <span className="text-xs text-gray-600 font-medium">
                                    {activity.description}
                                  </span>
                                </td>

                                {/* Date */}
                                <td className="px-6 py-4">
                                  <span className="text-xs font-semibold text-gray-500">
                                    {activity.date}
                                  </span>
                                </td>

                                {/* Occurred */}
                                <td className="px-6 py-4 text-right">
                                  <span className="text-xs font-semibold text-gray-500" title={activity.rawTimestamp ? new Date(activity.rawTimestamp).toLocaleString() : ''}>
                                    {activity.timestamp}
                                  </span>
                                </td>
                              </motion.tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              );
            })()}

            {/* VIEW: NOTIFICATIONS */}
            {activeSection === 'notifications' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Updates & Notifications</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">
                      Monitor new registrations, credential changes, scan attempts, and platform security flags.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleMarkAllAsRead}
                      className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
                    >
                      Mark all as read
                    </button>
                    <button
                      onClick={handleDeleteReadNotifications}
                      className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-colors shadow-sm cursor-pointer"
                    >
                      Delete read
                    </button>
                    <button
                      onClick={fetchData}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      Refresh Feed
                    </button>
                  </div>
                </header>

                {/* Summary Metrics */}
                {(() => {
                  const visibleActivities = activities.filter(a => !deletedNotificationIds.includes(a.id));
                  const total = visibleActivities.length;
                  const unread = visibleActivities.filter(a => !readNotificationIds.includes(a.id)).length;
                  const alerts = visibleActivities.filter(a => a.type === 'warning').length;
                  const reg = visibleActivities.filter(a => a.type === 'vendor_portal').length;
                  
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Unread Updates</p>
                          <p className="text-xl font-bold text-gray-800">{unread} <span className="text-xs text-gray-400 font-normal">/ {total}</span></p>
                        </div>
                      </div>

                      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 flex-shrink-0">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Security Flags</p>
                          <p className="text-xl font-bold text-gray-800">{alerts}</p>
                        </div>
                      </div>

                    </div>
                  );
                })()}

                {/* Filters and Search */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all', label: 'All Alerts' },
                      { id: 'warning', label: 'Security Alerts' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setNotificationFilter(tab.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          notificationFilter === tab.id
                            ? 'bg-gray-900 text-white shadow-sm'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative max-w-xs w-full">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search updates..."
                      value={notificationSearch}
                      onChange={(e) => setNotificationSearch(e.target.value)}
                      className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent !text-black"
                      style={{ color: 'black' }}
                    />
                  </div>
                </div>

                {/* Notifications Timeline List */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
                  {(() => {
                    const filtered = activities.filter((act: any) => {
                      // Filter out deleted
                      if (deletedNotificationIds.includes(act.id)) return false;
                      // Filter by category
                      if (notificationFilter !== 'all' && act.type !== notificationFilter) return false;
                      // Filter by search query
                      if (notificationSearch.trim()) {
                        const searchLower = notificationSearch.toLowerCase();
                        return (
                          (act.title && act.title.toLowerCase().includes(searchLower)) ||
                          (act.description && act.description.toLowerCase().includes(searchLower)) ||
                          (act.location && act.location.toLowerCase().includes(searchLower))
                        );
                      }
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="p-16 text-center">
                          <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 mx-auto mb-4 border border-gray-100 shadow-sm">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2M9 5h6M9 16h6m-3-3v6" /></svg>
                          </div>
                          <h4 className="text-sm font-bold text-gray-900">No updates found</h4>
                          <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                            There are no notifications matching your current filters.
                          </p>
                        </div>
                      );
                    }

                    return filtered.map((act: any) => {
                      const isUnread = !readNotificationIds.includes(act.id);
                      
                      // Theme/color choices based on type
                      let iconBg = 'bg-blue-50 text-blue-600 border-blue-100';
                      let iconSvg = <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
                      
                      if (act.type === 'warning') {
                        iconBg = 'bg-red-50 text-red-600 border-red-100';
                        iconSvg = <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
                      } else if (act.type === 'vendor_portal') {
                        iconBg = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                        iconSvg = <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
                      } else if (act.type === 'deleted') {
                        iconBg = 'bg-gray-100 text-gray-600 border-gray-200';
                        iconSvg = <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
                      } else if (act.type === 'scan') {
                        iconBg = 'bg-indigo-50 text-indigo-600 border-indigo-100';
                        iconSvg = <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>;
                      }

                      return (
                        <div
                          key={act.id}
                          className={`flex items-start gap-4 p-5 hover:bg-gray-50/50 transition-colors ${
                            isUnread ? 'bg-indigo-50/10' : ''
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                            {iconSvg}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-gray-900">{act.title}</h4>
                              {isUnread && (
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse flex-shrink-0" title="New" />
                              )}
                              <span className="text-[10px] text-gray-400 font-medium">
                                {formatTimestamp(act.rawTimestamp || act.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">
                              {act.description}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                {act.location || 'Unknown Location'}
                              </span>
                              {act.ip_address && (
                                <span className="flex items-center gap-1">
                                  IP: {act.ip_address}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isUnread && (
                              <button
                                onClick={() => handleMarkAsRead(act.id)}
                                className="px-2.5 py-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm cursor-pointer flex-shrink-0"
                              >
                                Mark read
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteNotification(act.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg transition-all cursor-pointer flex-shrink-0"
                              title="Delete Notification"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* VIEW: PROFILE */}
            {activeSection === 'profile' && (
              <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
                <header className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Profile</h2>
                  <p className="text-sm font-medium text-gray-500 mt-1">Manage your administrator account details and session.</p>
                </header>

                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                  {/* Top banner background */}
                  <div 
                    className="h-36 bg-cover bg-center bg-no-repeat relative"
                    style={{ backgroundImage: "url('/admin_banner.png')" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 to-transparent"></div>
                  </div>
                  
                  <div className="p-8 relative">
                    {/* Avatar placement */}
                    <div className="absolute -top-16 left-8">
                      <div className="w-24 h-24 rounded-2xl bg-white p-1.5 shadow-md">
                        <div className="w-full h-full rounded-xl bg-gradient-to-tr from-indigo-100 to-purple-100 border border-indigo-200 flex items-center justify-center">
                          <span className="text-3xl font-black text-indigo-600">
                            {user?.name?.charAt(0).toUpperCase() || 'A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-10 space-y-6">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{user?.name || 'Administrator'}</h3>
                        <p className="text-sm text-gray-400 font-medium uppercase tracking-wider mt-0.5">{user?.role || 'Admin'}</p>
                      </div>

                      <div className="border-t border-gray-100 pt-6 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/50">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Email Address</p>
                            <p className="text-sm font-semibold text-gray-800">{user?.email || 'admin@authentiq.app'}</p>
                          </div>
                          
                          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/50">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Access Level</p>
                            <p className="text-sm font-semibold text-indigo-600 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                              Root Administrator
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-gray-100 pt-8 flex flex-col sm:flex-row justify-end gap-3">
                        <button
                          onClick={() => setShowAdminResetModal(true)}
                          className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl shadow-sm transition-all cursor-pointer hover:shadow-md active:scale-[0.98]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          Reset Password
                        </button>
                        <button
                          onClick={logout}
                          className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-all cursor-pointer hover:shadow-md active:scale-[0.98]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign Out of Account
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Delete Vendor Confirmation Modal ── */}
            {showDeleteVendorModal && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setShowDeleteVendorModal(false);
                }}
              >
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 bg-red-50/50">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Delete Vendor
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">This action cannot be undone.</p>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-sm text-red-800 font-medium">
                        Warning: This will permanently delete the vendor and all associated data including:
                      </p>
                      <ul className="text-xs text-red-700 mt-2 space-y-1 list-disc list-inside">
                        <li>All vendor user accounts</li>
                        <li>All products and reference images</li>
                        <li>All QR codes</li>
                        <li>All brands</li>
                        <li>All scan history</li>
                      </ul>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Confirm with your admin password
                      </label>
                      <input
                        type="password"
                        value={deleteVendorPassword}
                        onChange={(e) => setDeleteVendorPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="block w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium"
                      />
                    </div>
                  </div>
                  <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    <button
                      onClick={() => setShowDeleteVendorModal(false)}
                      disabled={isDeletingVendor}
                      className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteVendor}
                      disabled={isDeletingVendor || !deleteVendorPassword.trim()}
                      className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isDeletingVendor ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Vendor
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Create Vendor Wizard Modal ── */}
            {showCreateVendorWizard && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
              >
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-gray-100 bg-indigo-50/50">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      Create Vendor
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Step {createVendorStep} of 3</p>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Step 1: Vendor Details */}
                    {createVendorStep === 1 && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Contact Name *
                          </label>
                          <input
                            type="text"
                            value={newVendorData.name}
                            onChange={(e) => setNewVendorData({ ...newVendorData, name: e.target.value })}
                            placeholder="Full name of primary contact"
                            className="block w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Email Address *
                          </label>
                          <input
                            type="email"
                            value={newVendorData.email}
                            onChange={(e) => setNewVendorData({ ...newVendorData, email: e.target.value })}
                            placeholder="vendor@company.com"
                            className="block w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Company Name *
                          </label>
                          <input
                            type="text"
                            value={newVendorData.company_name}
                            onChange={(e) => setNewVendorData({ ...newVendorData, company_name: e.target.value })}
                            placeholder="Legal company name"
                            className="block w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                          />
                        </div>
                      </div>
                    )}

                    {/* Step 2: Plan Assignment */}
                    {createVendorStep === 2 && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Assign Plan
                          </label>
                          <select
                            value={newVendorData.plan_id}
                            onChange={(e) => setNewVendorData({ ...newVendorData, plan_id: e.target.value })}
                            className="block w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium cursor-pointer"
                          >
                            <option value="">Free Trial (Default)</option>
                            {plans.map((plan: any) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-400 mt-2">
                            The vendor will be assigned this plan. They can change it later.
                          </p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                          <p className="text-sm text-blue-800 font-medium">
                            Next: Set up login credentials
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            You'll create a temporary password for the vendor. They'll be prompted to change it on first login.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Password Setup */}
                    {createVendorStep === 3 && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Password *
                          </label>
                          <input
                            type="password"
                            value={newVendorData.password}
                            onChange={(e) => setNewVendorData({ ...newVendorData, password: e.target.value })}
                            placeholder="Minimum 8 characters"
                            className="block w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Confirm Password *
                          </label>
                          <input
                            type="password"
                            value={newVendorData.confirmPassword}
                            onChange={(e) => setNewVendorData({ ...newVendorData, confirmPassword: e.target.value })}
                            placeholder="Re-enter password"
                            className="block w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                          />
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                          <p className="text-sm text-green-800 font-medium">
                            Ready to create vendor
                          </p>
                          <p className="text-xs text-green-700 mt-1">
                            The vendor will be created with pending verification status. On first login, they'll complete the onboarding flow (Compliance, PAN, GSTIN, Account details).
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-6 border-t border-gray-100 flex justify-between bg-gray-50/50">
                    <button
                      onClick={() => {
                        if (createVendorStep === 1) {
                          setShowCreateVendorWizard(false);
                        } else {
                          setCreateVendorStep(createVendorStep - 1);
                        }
                      }}
                      disabled={isSubmitting}
                      className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {createVendorStep === 1 ? 'Cancel' : 'Back'}
                    </button>
                    <button
                      onClick={handleCreateVendorWizard}
                      disabled={isSubmitting}
                      className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          {createVendorStep === 3 ? 'Create Vendor' : 'Next'}
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
