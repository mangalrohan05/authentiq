'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import RecentActivityLog from '@/components/RecentActivityLog';
import { QRCodeCanvas } from 'qrcode.react';
import {
  getProducts, getProductsByBrand, getVendorScans,
  getVendorAnalyticsOverview, getVendorAnalyticsTrends, getVendorSecurityAlerts,
  getVendorActivity, getVendorLocations, getVendorProfile,
  getTeamMembers, getPendingTeamInvitations,
  generateQR, updateProductQRCustomization,
  getVendorNotifications,
  type TeamMember, type TeamInvitation
} from '@/services/api';
import { getRelativeTime, formatTimestamp } from '@/utils/date';
import { useBrand } from '@/contexts/BrandContext';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/hooks/usePlan';
import { useRouter } from 'next/navigation';
import VendorSidebar, { type VendorTabId } from '@/components/vendor/VendorSidebar';

import DashboardTab from '@/components/vendor/DashboardTab';
import ProductsTab from '@/components/vendor/ProductsTab';
import AnalyticsTab from '@/components/vendor/AnalyticsTab';
import ImportExportTab from '@/components/vendor/ImportExportTab';
import TeamTab from '@/components/vendor/TeamTab';

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
}

export default function VendorDashboard() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { plan, hasFeature, isWithinLimit, refetch: refetchPlan } = usePlan();
  const maxUsers = plan?.limits?.max_users || 1;
  const isInfiniteUsers = maxUsers === -1;
  const planName = plan?.plan_name || 'Free Trial';
  const router = useRouter();
  const isAdmin = user?.role === 'Administrator' || user?.role === 'vendor';

  const maxBrands = plan?.limits?.max_brands || 1;
  const isInfiniteBrands = maxBrands === -1;

  const [products, setProducts] = useState<Product[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [totalScansCount, setTotalScansCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // Analytics States
  const [overview, setOverview] = useState<any>({ total_batches: 0, total_products: 0, total_scans: 0, suspicious_scans: 0 });
  const [trends, setTrends] = useState<any[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);

  // Brand context — drives product list filtering
  const { activeBrand, brands } = useBrand();

  // Custom QR logo image
  const [vendorQRLogoImage, setVendorQRLogoImage] = useState<string | null>(null);

  // Tab switching state
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Notification States
  const [vendorNotifications, setVendorNotifications] = useState<any[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [deletedNotificationIds, setDeletedNotificationIds] = useState<string[]>([]);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [notificationSearch, setNotificationSearch] = useState("");

  useEffect(() => {
    const storedRead = localStorage.getItem('vendor_read_notifications');
    if (storedRead) {
      try {
        setReadNotificationIds(JSON.parse(storedRead));
      } catch (e) {
        console.error(e);
      }
    }
    const storedDeleted = localStorage.getItem('vendor_deleted_notifications');
    if (storedDeleted) {
      try {
        setDeletedNotificationIds(JSON.parse(storedDeleted));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleMarkAllAsRead = () => {
    const visibleNonDeletedIds = vendorNotifications
      .filter((a: any) => !deletedNotificationIds.includes(a.id))
      .map((a: any) => a.id);
    const newRead = Array.from(new Set([...readNotificationIds, ...visibleNonDeletedIds]));
    setReadNotificationIds(newRead);
    localStorage.setItem('vendor_read_notifications', JSON.stringify(newRead));
  };

  const handleMarkAsRead = (id: string) => {
    if (!readNotificationIds.includes(id)) {
      const newRead = [...readNotificationIds, id];
      setReadNotificationIds(newRead);
      localStorage.setItem('vendor_read_notifications', JSON.stringify(newRead));
    }
  };

  const handleDeleteNotification = (id: string) => {
    if (!deletedNotificationIds.includes(id)) {
      const newDeleted = [...deletedNotificationIds, id];
      setDeletedNotificationIds(newDeleted);
      localStorage.setItem('vendor_deleted_notifications', JSON.stringify(newDeleted));
    }
  };

  const handleDeleteReadNotifications = () => {
    const activeReadIds = vendorNotifications
      .filter((a: any) => readNotificationIds.includes(a.id) && !deletedNotificationIds.includes(a.id))
      .map((a: any) => a.id);

    if (activeReadIds.length > 0) {
      const newDeleted = [...deletedNotificationIds, ...activeReadIds];
      setDeletedNotificationIds(newDeleted);
      localStorage.setItem('vendor_deleted_notifications', JSON.stringify(newDeleted));
    }
  };

  // Team Management States
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<TeamInvitation[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);

  const [localActivities, setLocalActivities] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('authentiq_local_activities');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [vendorLocation, setVendorLocation] = useState<string>('Local, System');

  // QR Customization and Modal states
  const [selectedQR, setSelectedQR] = useState<string | null>(null);
  const [qrCopied, setQrCopied] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState('');
  const [qrPrimaryColor, setQrPrimaryColor] = useState('#000000');
  const [qrSecondaryColor, setQrSecondaryColor] = useState('#ffffff');
  const [qrUseLogo, setQrUseLogo] = useState(false);
  const [savingCustomization, setSavingCustomization] = useState(false);
  const [roundedLogoUrl, setRoundedLogoUrl] = useState<string | null>(null);

  const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  const qrLogoUrl = useMemo(() => {
    if (!vendorQRLogoImage) return null;
    return vendorQRLogoImage.startsWith('http') ? vendorQRLogoImage : `${API_BASE}${vendorQRLogoImage}`;
  }, [vendorQRLogoImage]);

  useEffect(() => {
    if (!qrLogoUrl) {
      setRoundedLogoUrl(null);
      return;
    }

    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      const canvas = document.createElement('canvas');
      const size = Math.max(img.width, img.height);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setRoundedLogoUrl(qrLogoUrl);
        return;
      }

      ctx.clearRect(0, 0, size, size);

      const radius = size * 0.2;
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(size - radius, 0);
      ctx.quadraticCurveTo(size, 0, size, radius);
      ctx.lineTo(size, size - radius);
      ctx.quadraticCurveTo(size, size, size - radius, size);
      ctx.lineTo(radius, size);
      ctx.quadraticCurveTo(0, size, 0, size - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();

      ctx.clip();
      ctx.drawImage(img, 0, 0, size, size);

      try {
        setRoundedLogoUrl(canvas.toDataURL());
      } catch (err) {
        console.error('Failed to generate rounded logo Data URL:', err);
        setRoundedLogoUrl(qrLogoUrl);
      }
    };
    img.onerror = () => {
      if (!active) return;
      setRoundedLogoUrl(qrLogoUrl);
    };
    img.src = qrLogoUrl;

    return () => {
      active = false;
    };
  }, [qrLogoUrl]);

  const handleGenerateQR = async (productId: string) => {
    setError(null);
    try {
      const qr = await generateQR(productId);
      const dynamicUrl = `${window.location.origin}/verify/${qr.qr_id}`;

      setSelectedQR(qr.qr_id);
      setVerificationUrl(dynamicUrl);
      setQrCopied(false);

      setQrPrimaryColor('#000000');
      setQrSecondaryColor('#ffffff');
      setQrUseLogo(false);

      showSuccess('QR generated successfully!');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Error generating QR');
    }
  };

  const handleViewQR = (product: Product) => {
    if (product.qr_id) {
      setSelectedQR(product.qr_id);
      setVerificationUrl(`${window.location.origin}/verify/${product.qr_id}`);
      setQrCopied(false);

      setQrPrimaryColor(product.qr_primary_color || '#000000');
      setQrSecondaryColor(product.qr_secondary_color || '#ffffff');
      setQrUseLogo(Boolean(product.qr_use_logo));
    }
  };

  const handleSaveCustomization = async () => {
    if (user?.role === 'Viewer') {
      alert('Access Denied: You do not have permission to customize QR codes.');
      return;
    }
    const activeProduct = products.find(p => p.qr_id === selectedQR);
    if (!activeProduct) return;
    setSavingCustomization(true);
    try {
      await updateProductQRCustomization(activeProduct.id, {
        qr_primary_color: qrPrimaryColor,
        qr_secondary_color: qrSecondaryColor,
        qr_use_logo: qrUseLogo,
      });
      showSuccess('QR customization saved successfully.');
      await fetchData();
    } catch (err: any) {
      alert(`Failed to save customization: ${err.message}`);
    } finally {
      setSavingCustomization(false);
    }
  };

  const handleDownloadQR = () => {
    const canvas = document.getElementById('qr-export-modal') as HTMLCanvasElement;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.setAttribute('download', `authentiq_qr_${selectedQR?.substring(0, 8)}.png`);
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    }, 'image/png', 1.0);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`,
              {
                headers: {
                  'Accept-Language': 'en',
                  'User-Agent': 'Authentiq/1.0 (vendor-client)'
                }
              }
            );
            if (response.ok) {
              const data = await response.json();
              const addr = data.address || {};
              let city = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || '';
              if (city) {
                city = city.replace(/\s+(Municipal\s+Corporation|Corporation|Municipality|District|Division|Cantonment|Cantt)\b/gi, '').trim();
              }
              const state = addr.state || addr.region || '';
              const country = addr.country || '';
              const parts = [city, state, country].filter(p => p && p.trim() !== '');
              const locationStr = parts.join(', ');
              if (locationStr) {
                setVendorLocation(locationStr);
              }
            }
          } catch (e) {
            console.error('Error reverse geocoding vendor location:', e);
          }
        },
        (err) => {
          console.warn('Vendor geolocation failed or denied:', err);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('authentiq_local_activities', JSON.stringify(localActivities));
    }
  }, [localActivities]);

  const allActivitiesMapped = useMemo(() => {
    const parsedActivities = (activities || [])
      .filter((act: any) => act.location !== 'System Panel, Registry' || (act.event_type || act.title || '').toLowerCase().includes('add') || (act.event_type || act.title || '').toLowerCase().includes('delete'))
      .map((act: any) => {
        let tsStr = act.timestamp;
        if (typeof tsStr === 'string' && !tsStr.endsWith('Z') && !tsStr.includes('+')) {
          tsStr = tsStr.replace(' ', 'T') + 'Z';
        }
        const parsedTime = tsStr ? new Date(tsStr).getTime() : 0;
        return { ...act, tsStr, parsedTime };
      })
      .sort((a, b) => b.parsedTime - a.parsedTime);

    const keptScans: typeof parsedActivities = [];
    const uniqueActivities = parsedActivities.filter((act: any) => {
      const isDuplicate = keptScans.some(other => {
        const sameEvent = (other.event_type || other.title || '') === (act.event_type || act.title || '');
        const sameProduct = (other.product_name || '') === (act.product_name || '');
        const sameIp = (other.ip_address || '') === (act.ip_address || '');
        const withinTime = Math.abs(other.parsedTime - act.parsedTime) <= 60000;
        return sameEvent && sameProduct && sameIp && withinTime;
      });
      if (isDuplicate) return false;
      keptScans.push(act);
      return true;
    });

    const mapped = uniqueActivities.map((act: any) => {
      const dateObj = act.tsStr ? new Date(act.tsStr) : new Date();
      const isValidDate = !isNaN(dateObj.getTime());

      let dateStr = '30-05-26';
      let timeStr = '12:00:00';
      if (isValidDate) {
        const d = dateObj;
        dateStr = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getFullYear()).slice(-2);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        timeStr = `${hours}:${minutes}:${seconds}`;
      }

      const titleStr = act.title || act.event_type || 'Product Scanned';
      const prodName = act.product_name || '';

      let activityTitle = titleStr;
      let statusType = act.type === 'warning' ? 'alert' : 'success';

      if (titleStr.toLowerCase().includes('added')) {
        activityTitle = prodName ? `Product Added: ${prodName}` : titleStr;
        statusType = 'success';
      } else if (titleStr.toLowerCase().includes('deleted')) {
        activityTitle = prodName ? `Product Deleted: ${prodName}` : titleStr;
        statusType = 'deleted';
      } else if (titleStr.toLowerCase().includes('suspicious') || act.type === 'warning') {
        if (titleStr.toLowerCase().includes('review')) {
          activityTitle = prodName ? `Scan Needs Review: ${prodName}` : 'Scan Needs Review';
        } else {
          activityTitle = prodName ? `Suspicious Scan: ${prodName}` : 'Suspicious Scan Detected';
        }
        statusType = 'alert';
      } else {
        activityTitle = prodName ? `Product Scanned: ${prodName}` : 'Product Scanned';
        statusType = 'success';
      }

      return {
        id: act.id,
        verificationState: activityTitle,
        date: dateStr,
        time: timeStr,
        place: act.location || 'Local, Development',
        statusType: statusType,
        parsedTime: act.parsedTime
      };
    });

    const userEmail = user?.email;
    const filteredLocal = localActivities.filter(act => act.user_email === userEmail);
    const combined = [...filteredLocal, ...mapped];

    const getActivityTimestamp = (a: any): number => {
      if (a.parsedTime) return a.parsedTime;
      try {
        const [day, month, year] = a.date.split('-');
        const [hours, minutes, seconds] = a.time.split(':');
        const fullYear = year.length === 2 ? `20${year}` : year;
        const isoStr = `${fullYear}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        const parsed = new Date(isoStr).getTime();
        return isNaN(parsed) ? 0 : parsed;
      } catch (e) {
        return 0;
      }
    };

    const uniqueCombined: typeof combined = [];
    combined.forEach(act => {
      const actTime = getActivityTimestamp(act);
      const isDuplicate = uniqueCombined.some(other => {
        const sameText = other.verificationState === act.verificationState;
        if (!sameText) return false;
        
        const otherTime = getActivityTimestamp(other);
        return Math.abs(otherTime - actTime) <= 120000; // Deduplicate if within 2 minutes
      });
      if (!isDuplicate) {
        uniqueCombined.push(act);
      }
    });

    const getSortableValue = (dStr: string, tStr: string): string => {
      try {
        const [day, month, year] = dStr.split('-');
        const [hours, minutes, seconds] = tStr.split(':');
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}${month}${day}${hours}${minutes}${seconds}`;
      } catch (e) {
        return '';
      }
    };

    uniqueCombined.sort((a, b) => getSortableValue(b.date, b.time).localeCompare(getSortableValue(a.date, a.time)));

    return uniqueCombined;
  }, [activities, localActivities, user?.email]);



  useEffect(() => {
    if (!isAuthLoading) {
      if (!isAuthenticated) {
        router.replace('/vendor/login');
      } else if (!['vendor', 'Administrator', 'Manager', 'Viewer'].includes(user?.role || '')) {
        router.replace('/admin');
      }
    }
  }, [isAuthenticated, isAuthLoading, user?.role, router]);

  useEffect(() => {
    const saved = sessionStorage.getItem('vendor_active_tab');
    if (saved === 'register') {
      setActiveTab('products');
      setIsProductDrawerOpen(true);
      sessionStorage.removeItem('vendor_active_tab');
      window.scrollTo(0, 0);
      return;
    }
    if (saved && ['dashboard', 'products', 'activity', 'analytics', 'import-export'].includes(saved)) {
      setActiveTab(saved);
      sessionStorage.removeItem('vendor_active_tab');
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Viewer') {
      setActiveTab('analytics');
    }
  }, [user?.role]);

  const fetchData = useCallback(async () => {
    try {
      let userRole = '';
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('authentiq_user');
          if (stored) {
            userRole = JSON.parse(stored).role;
          }
        } catch { }
      }

      const isViewerRole = userRole === 'Viewer';

      const [
        productData, scanData, overviewData, trendsData,
        alertsData, activityData, locData, profileData,
        teamData, inviteData, notificationsData
      ] = await Promise.all([
        activeBrand?.id
          ? getProductsByBrand(activeBrand.id).catch(() => [])
          : getProducts().catch(() => []),
        getVendorScans({ limit: 10 }).catch(() => ({ scans: [], total: 0 })),
        getVendorAnalyticsOverview().catch(() => ({ total_batches: 0, total_products: 0, total_scans: 0, suspicious_scans: 0 })),
        getVendorAnalyticsTrends(14).catch(() => ({ trends: [] })),
        getVendorSecurityAlerts().catch(() => ({ alerts: [] })),
        getVendorActivity().catch(() => ({ activity: [] })),
        getVendorLocations().catch(() => ({ locations: [] })),
        getVendorProfile().catch(() => null),
        (!isViewerRole ? getTeamMembers().catch(() => []) : Promise.resolve([])),
        (!isViewerRole ? getPendingTeamInvitations().catch(() => []) : Promise.resolve([])),
        getVendorNotifications().catch(() => ({ activity: [] }))
      ]);

      setProducts(Array.isArray(productData) ? productData : (productData.products || []));
      setScans(scanData.scans || []);
      setTotalScansCount(scanData.total || 0);
      setOverview(overviewData);
      setTrends(trendsData.trends || []);
      setSecurityAlerts(alertsData.alerts || []);
      setActivities(activityData.activity || []);
      setLocations(locData.locations || []);
      setVendorNotifications(notificationsData.activity || []);

      if (profileData && profileData.vendor) {
        setVendorQRLogoImage(profileData.vendor.qr_logo_image || profileData.vendor.qr_logo_url || null);
      }

      if (!isViewerRole) {
        setTeamMembers(teamData);
        setPendingInvitations(inviteData);
        setTeamCount(teamData.length);
        setPendingInviteCount(inviteData.filter((i: any) => i.status === 'pending').length);
      }
    } catch (e: any) {
      setError(`Failed to load data: ${e.message || 'Check backend connection'}`);
    } finally {
      setIsLoaded(true);
    }
  }, [activeBrand?.id]);

  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      try {
        const productData = activeBrand?.id
          ? await getProductsByBrand(activeBrand.id)
          : await getProducts();
        setProducts(Array.isArray(productData) ? productData : (productData.products || []));
      } catch { }
    })();
  }, [activeBrand?.id]);

  useEffect(() => {
    if (isAuthenticated && ['vendor', 'Administrator', 'Manager', 'Viewer'].includes(user?.role || '')) {
      fetchData();
    }
  }, [isAuthenticated, user?.role, fetchData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const channel = new BroadcastChannel('authentiq_activity_channel');
      channel.onmessage = (event) => {
        if (event.data === 'reload_activity') {
          fetchData();
        }
      };
      return () => {
        channel.close();
      };
    } catch (e) {
      console.error('Failed to initialize BroadcastChannel listener:', e);
    }
  }, [fetchData]);

  useRealtimeUpdates(fetchData, 30000, isAuthenticated && ['vendor', 'Administrator', 'Manager', 'Viewer'].includes(user?.role || ''));

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleTabChange = (tab: VendorTabId) => {
    setActiveTab(tab);
    window.scrollTo(0, 0);
  };

  const openProductDrawer = () => {
    if (user?.role === 'Viewer') {
      alert('Access Denied: You do not have permission to add new products.');
      return;
    }
    setActiveTab('products');
    setError(null);
    setIsProductDrawerOpen(true);
  };

  if (isAuthLoading || !isAuthenticated || !['vendor', 'Administrator', 'Manager', 'Viewer'].includes(user?.role || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isLoaded) return <div className="p-4">Loading...</div>;

  const unreadCount = vendorNotifications.filter(
    a => !deletedNotificationIds.includes(a.id) && !readNotificationIds.includes(a.id)
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row relative">
      <VendorSidebar activeTab={activeTab as VendorTabId} onTabChange={handleTabChange} unreadCount={unreadCount} />
      <div className="flex-1 md:ml-64 p-6 md:p-10 relative w-full min-h-screen">
        {successMsg && (
          <div className="absolute top-4 right-4 z-50 bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-lg shadow-sm text-sm font-semibold animate-in fade-in slide-in-from-top-2">
            {successMsg}
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg shadow-sm text-sm font-semibold flex justify-between items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {error.toLowerCase().includes('rate limit') && (
                <span className="shrink-0 px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-200 text-[10px] font-bold rounded uppercase tracking-widest">
                  Rate Limited
                </span>
              )}
              <span className="truncate">{error}</span>
            </div>
            <button
              onClick={() => { setError(null); setRetrying(true); fetchData().finally(() => setRetrying(false)); }}
              disabled={retrying}
              className="shrink-0 text-xs underline hover:no-underline font-bold disabled:opacity-50"
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {user?.role === 'Viewer' && (
          <div className="max-w-6xl mx-auto mb-6 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-8V7m0 10a9 9 0 110-18 9 9 0 010 18z" />
            </svg>
            <span className="text-sm font-semibold">
              You are viewing the dashboard with <strong>View-Only</strong> permissions. All modifications and configurations are disabled.
            </span>
          </div>
        )}

        <div className="max-w-6xl mx-auto">
          <div className="animate-in fade-in duration-300">
            {activeTab === 'dashboard' && (
              <DashboardTab
                overview={overview}
                products={products}
                plan={plan}
                teamCount={teamCount}
                pendingInviteCount={pendingInviteCount}
                totalScansCount={totalScansCount}
                isInfiniteUsers={isInfiniteUsers}
                maxUsers={maxUsers}
                isInfiniteBrands={isInfiniteBrands}
                maxBrands={maxBrands}
                brands={brands}
                openProductDrawer={openProductDrawer}
                setActiveTab={handleTabChange}
              />
            )}

            {activeTab === 'products' && (
              <ProductsTab
                products={products}
                fetchData={fetchData}
                refetchPlan={refetchPlan}
                isWithinLimit={isWithinLimit}
                user={user}
                activeBrand={activeBrand}
                brands={brands}
                vendorLocation={vendorLocation}
                setLocalActivities={setLocalActivities}
                isProductDrawerOpen={isProductDrawerOpen}
                setIsProductDrawerOpen={setIsProductDrawerOpen}
                showSuccess={showSuccess}
                vendorQRLogoImage={vendorQRLogoImage}
                handleGenerateQR={handleGenerateQR}
                handleViewQR={handleViewQR}
              />
            )}

            {activeTab === 'activity' && (
              <RecentActivityLog records={allActivitiesMapped} />
            )}

            {activeTab === 'notifications' && (
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
                  const visible = vendorNotifications.filter(a => !deletedNotificationIds.includes(a.id));
                  const total = visible.length;
                  const unread = visible.filter(a => !readNotificationIds.includes(a.id)).length;
                  const alerts = visible.filter(a => a.type === 'warning').length;
                  const opsCount = visible.filter(a => a.type === 'vendor_portal').length;
                  
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

                      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Operations</p>
                          <p className="text-xl font-bold text-gray-800">{opsCount}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Filters and Search */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all', label: 'All Updates' },
                      { id: 'warning', label: 'Security Alerts' },
                      { id: 'vendor_portal', label: 'Operations' }
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
                    const filtered = vendorNotifications.filter((act: any) => {
                      if (deletedNotificationIds.includes(act.id)) return false;
                      if (notificationFilter !== 'all' && act.type !== notificationFilter) return false;
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
                      
                      let iconBg = 'bg-blue-50 text-blue-600 border-blue-100';
                      let iconSvg = <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
                      
                      if (act.type === 'warning') {
                        iconBg = 'bg-red-50 text-red-600 border-red-100';
                        iconSvg = <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
                      } else if (act.type === 'vendor_portal') {
                        iconBg = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                        iconSvg = <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
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
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse flex-shrink-0" />
                              )}
                              <span className="text-[10px] text-gray-400 font-medium">
                                {formatTimestamp(act.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">
                              {act.description}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                {act.location || 'Vendor Portal'}
                              </span>
                              {act.user_email && (
                                <span className="flex items-center gap-1 normal-case font-normal text-slate-500">
                                  by {act.user_email}
                                </span>
                              )}
                              {act.ip_address && (
                                <span className="flex items-center gap-1 font-mono">
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

            {activeTab === 'analytics' && (
              <AnalyticsTab
                overview={overview}
                securityAlerts={securityAlerts}
                scans={scans}
                trends={trends}
                hasFeature={hasFeature}
                plan={plan}
                locations={locations}
              />
            )}

            {activeTab === 'import-export' && (
              <ImportExportTab
                hasFeature={hasFeature}
                plan={plan}
                fetchData={fetchData}
                showSuccess={showSuccess}
                setError={setError}
              />
            )}

            {activeTab === 'team' && (
              <TeamTab
                teamMembers={teamMembers}
                pendingInvitations={pendingInvitations}
                teamCount={teamCount}
                pendingInviteCount={pendingInviteCount}
                maxUsers={maxUsers}
                isInfiniteUsers={isInfiniteUsers}
                planName={planName}
                isAdmin={isAdmin}
                user={user}
                showSuccess={showSuccess}
                refetchPlan={refetchPlan}
                fetchData={fetchData}
                hasFeature={hasFeature}
                plan={plan}
              />
            )}
          </div>
        </div>
      </div>

      {/* QR Code Customization Modal */}
      {selectedQR && (() => {
        const activeProduct = products.find(p => p.qr_id === selectedQR);
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-[0_20px_60px_rgba(0,0,0,0.12)] relative p-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200 my-8">
              <button
                onClick={() => setSelectedQR(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <h2 className="text-xl font-bold text-slate-900 tracking-tight text-center mt-2">Custom QR Code</h2>
              <p className="text-xs font-medium text-slate-400 text-center mt-1">
                {user?.role === 'Viewer' ? 'View-only access for colors and branding.' : 'Customize colors and branding for this product.'}
              </p>

              <div className="w-full border border-slate-100 rounded-2xl bg-slate-50/50 p-6 my-4 flex flex-col items-center justify-center">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-3xs">
                  <QRCodeCanvas
                     value={verificationUrl}
                    size={160}
                    level="H"
                    includeMargin={true}
                    fgColor={qrPrimaryColor}
                    bgColor={qrSecondaryColor}
                    imageSettings={qrUseLogo && roundedLogoUrl ? {
                      src: roundedLogoUrl,
                      x: undefined,
                      y: undefined,
                      height: 38,
                      width: 38,
                      excavate: true,
                    } : undefined}
                    id="qr-export-modal"
                  />
                </div>
                {activeProduct && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3">
                    Product: {activeProduct.name}
                  </p>
                )}
              </div>

              {user?.role !== 'Viewer' && (
                <div className="w-full space-y-4 mb-5 text-left">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Foreground Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={qrPrimaryColor}
                          onChange={(e) => setQrPrimaryColor(e.target.value)}
                          className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer overflow-hidden p-0"
                        />
                        <span className="text-xs font-mono font-bold text-slate-700 uppercase">{qrPrimaryColor}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Background Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={qrSecondaryColor}
                          onChange={(e) => setQrSecondaryColor(e.target.value)}
                          className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer overflow-hidden p-0"
                        />
                        <span className="text-xs font-mono font-bold text-slate-700 uppercase">{qrSecondaryColor}</span>
                      </div>
                    </div>
                  </div>

                  {qrLogoUrl && (
                    <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qrUseLogo}
                        onChange={(e) => setQrUseLogo(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="block text-xs font-black text-slate-900">Render Brand Logo in Center</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">Embed your profile logo into the QR canvas.</span>
                      </div>
                    </label>
                  )}
                </div>
              )}

              <div className="w-full space-y-2">
                <button
                  onClick={handleSaveCustomization}
                  disabled={savingCustomization || user?.role === 'Viewer'}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors text-center cursor-pointer disabled:opacity-50"
                >
                  {user?.role === 'Viewer' ? 'Customization Disabled' : (savingCustomization ? 'Saving customization...' : 'Save QR Customization')}
                </button>

                <button
                  onClick={handleDownloadQR}
                  className="w-full py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100/70 text-indigo-600 font-bold text-xs rounded-xl transition-colors text-center cursor-pointer"
                >
                  Download High-Res QR
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(verificationUrl);
                      setQrCopied(true);
                      setTimeout(() => setQrCopied(false), 2000);
                    }}
                    className={`py-2.5 px-4 font-bold text-xs rounded-xl transition-colors text-center cursor-pointer ${qrCopied ? 'bg-emerald-500 text-white' : 'bg-slate-950 hover:bg-slate-900 text-white'
                      }`}
                  >
                    {qrCopied ? 'Copied URL!' : 'Copy Link'}
                  </button>

                  <a
                    href={`${verificationUrl}${verificationUrl.includes('?') ? '&' : '?'}source=vendor_portal`}
                    target="_blank"
                    rel="noreferrer"
                    className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 text-xs rounded-xl transition-colors text-center block"
                  >
                    Open Link
                  </a>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
