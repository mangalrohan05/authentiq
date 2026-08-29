'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  changeVendorPassword,
  getVendorProfile,
  updateVendorProfile,
  uploadVendorLogo,
  uploadVendorQRLogo,
  deleteVendorLogo,
  deleteVendorQRLogo,
  getCompanyDetails,
  updateCompanyDetails,
  type CompanyDetailsPayload,
} from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

function Card({ 
  title, 
  subtitle, 
  children, 
  icon, 
  className = '', 
  action 
}: { 
  title: string; 
  subtitle?: string; 
  children: React.ReactNode; 
  icon?: React.ReactNode; 
  className?: string; 
  action?: React.ReactNode 
}) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      <header className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">{icon}</div>}
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
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

function Modal({ title, isOpen, onClose, children, maxWidth = 'max-w-md' }: { title: string; isOpen: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: string }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50 backdrop-blur-sm">
      <div 
        className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} overflow-hidden max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
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

export default function VendorProfilePage() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Modals state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedQRFile, setSelectedQRFile] = useState<File | null>(null);
  const [previewQRUrl, setPreviewQRUrl] = useState<string | null>(null);

  // Company and Contact data state
  const [form, setForm] = useState<CompanyDetailsPayload>({
    legal_company_name: '',
    company_type: undefined,
    gstin: '',
    pan: '',
    cin: '',
    reg_address_line1: '',
    reg_address_line2: '',
    reg_city: '',
    reg_state: '',
    reg_pin: '',
    reg_country: 'India',
    industry_sector: undefined,
    company_website: '',
    contact_full_name: '',
    contact_work_email: '',
    contact_mobile: '',
    contact_designation: '',
    tm_status: '',
    tm_number: '',
    tm_app_file: '',
    tm_cert_file: '',
    brand_auth_file: '',
    gst_cert_file: '',
    inc_doc_file: '',
    pharma_drug_license_file: '',
    fssai_license_file: '',
    excise_license_file: '',
    gst_cert_status: '',
    inc_doc_status: '',
    pharma_drug_license_status: '',
    fssai_license_status: '',
    excise_license_status: '',
    tm_app_status: '',
    tm_cert_status: '',
    brand_auth_status: '',
  });

  const [isReadOnly, setIsReadOnly] = useState(false);
  const [initialForm, setInitialForm] = useState<CompanyDetailsPayload | null>(null);

  // Re-verification state
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpVerified, setEmailOtpVerified] = useState(false);
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailShowVerification, setEmailShowVerification] = useState(false);
  
  const [mobileOtpSent, setMobileOtpSent] = useState(false);
  const [mobileOtpVerified, setMobileOtpVerified] = useState(false);
  const [mobileOtpInput, setMobileOtpInput] = useState('');
  const [mobileShowVerification, setMobileShowVerification] = useState(false);

  const emailChanged = !!(initialForm && form.contact_work_email !== initialForm.contact_work_email);
  const emailNeedsVerification = emailChanged && !emailOtpVerified;

  const mobileChanged = !!(initialForm && form.contact_mobile !== initialForm.contact_mobile);
  const mobileNeedsVerification = mobileChanged && !mobileOtpVerified;

  const showEmailWidget = emailChanged && emailShowVerification;
  const showMobileWidget = mobileChanged && mobileShowVerification;

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const loadProfileAndCompany = useCallback(async () => {
    setLoading(true);
    try {
      const [profileData, companyData] = await Promise.all([
        getVendorProfile(),
        getCompanyDetails(),
      ]);

      setProfile(profileData);
      if (profileData.user?.name) {
        setDisplayName(profileData.user.name);
      }
      if (profileData.user?.email) {
        setEmailAddress(profileData.user.email);
      }

      const cleanCompanyData = {
        legal_company_name: companyData.legal_company_name || '',
        company_type: companyData.company_type || undefined,
        gstin: companyData.gstin || '',
        pan: companyData.pan || '',
        cin: companyData.cin || '',
        reg_address_line1: companyData.reg_address_line1 || '',
        reg_address_line2: companyData.reg_address_line2 || '',
        reg_city: companyData.reg_city || '',
        reg_state: companyData.reg_state || '',
        reg_pin: companyData.reg_pin || '',
        reg_country: companyData.reg_country || 'India',
        industry_sector: companyData.industry_sector || undefined,
        company_website: companyData.company_website || '',
        contact_full_name: companyData.contact_full_name || '',
        contact_work_email: companyData.contact_work_email || '',
        contact_mobile: companyData.contact_mobile || '',
        contact_designation: companyData.contact_designation || '',
        tm_status: companyData.tm_status || '',
        tm_number: companyData.tm_number || '',
        tm_app_file: companyData.tm_app_file || '',
        tm_cert_file: companyData.tm_cert_file || '',
        brand_auth_file: companyData.brand_auth_file || '',
        gst_cert_file: companyData.gst_cert_file || '',
        inc_doc_file: companyData.inc_doc_file || '',
        pharma_drug_license_file: companyData.pharma_drug_license_file || '',
        fssai_license_file: companyData.fssai_license_file || '',
        excise_license_file: companyData.excise_license_file || '',
        gst_cert_status: companyData.gst_cert_status || '',
        inc_doc_status: companyData.inc_doc_status || '',
        pharma_drug_license_status: companyData.pharma_drug_license_status || '',
        fssai_license_status: companyData.fssai_license_status || '',
        excise_license_status: companyData.excise_license_status || '',
        tm_app_status: companyData.tm_app_status || '',
        tm_cert_status: companyData.tm_cert_status || '',
        brand_auth_status: companyData.brand_auth_status || '',
      };
      setForm(cleanCompanyData);
      setInitialForm(cleanCompanyData);

      if (profileData.verification_status === 'verified') {
        setIsReadOnly(true);
      }
    } catch (e: any) {
      showToast('error', e.message || 'Failed to load details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfileAndCompany();
  }, [loadProfileAndCompany]);

  const logoUrl = useMemo(() => {
    if (previewUrl) return previewUrl;
    const path = profile?.vendor?.profile_image;
    if (!path) return null;
    return path.startsWith('http') ? path : `${API_BASE}${path}`;
  }, [profile, previewUrl]);

  const qrLogoUrl = useMemo(() => {
    if (previewQRUrl) return previewQRUrl;
    const path = profile?.vendor?.qr_logo_image;
    if (!path) return null;
    return path.startsWith('http') ? path : `${API_BASE}${path}`;
  }, [profile, previewQRUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1 * 1024 * 1024) {
        showToast('error', 'Profile picture file size exceeds the 1MB limit.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (img.width !== img.height) {
            showToast('error', `Profile picture must have a square aspect ratio (1:1). Current dimensions: ${img.width}x${img.height}px.`);
            return;
          }
          if (img.width < 100 || img.width > 800) {
            showToast('error', `Profile picture dimensions must be between 100x100px and 800x800px. Current: ${img.width}x${img.height}px.`);
            return;
          }
          setSelectedFile(file);
          const url = URL.createObjectURL(file);
          setPreviewUrl(url);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQRFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1 * 1024 * 1024) {
        showToast('error', 'QR Logo file size exceeds the 1MB limit.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (img.width !== img.height) {
            showToast('error', `QR Logo must have a square aspect ratio (1:1). Current dimensions: ${img.width}x${img.height}px.`);
            return;
          }
          if (img.width < 100 || img.width > 800) {
            showToast('error', `QR Logo dimensions must be between 100x100px and 800x800px. Current: ${img.width}x${img.height}px.`);
            return;
          }
          setSelectedQRFile(file);
          const url = URL.createObjectURL(file);
          setPreviewQRUrl(url);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSettings = async () => {
    if (!form.contact_full_name?.trim()) {
      showToast('error', 'Primary contact name is required.');
      return;
    }
    if (!form.contact_work_email?.trim()) {
      showToast('error', 'Primary contact email is required.');
      return;
    }
    if (!form.contact_mobile?.trim()) {
      showToast('error', 'Primary contact mobile is required.');
      return;
    }

    if (emailNeedsVerification || mobileNeedsVerification) {
      if (emailNeedsVerification) setEmailShowVerification(true);
      if (mobileNeedsVerification) setMobileShowVerification(true);
      showToast('error', 'Re-verification required for updated email or mobile number.');
      return;
    }

    setSaving(true);
    try {
      const hasAdminRights = profile?.user?.role === 'Administrator' || profile?.user?.role === 'admin' || profile?.user?.role === 'vendor';
      
      // 1. Upload photo if selected
      if (hasAdminRights && selectedFile) {
        await uploadVendorLogo(selectedFile);
      }

      // 1b. Upload QR Logo if selected
      if (hasAdminRights && selectedQRFile) {
        await uploadVendorQRLogo(selectedQRFile);
      }
      
      // 2. Update profile name and email
      await updateVendorProfile({ full_name: displayName, email: emailAddress });

      // 3. Update primary contact details
      if (hasAdminRights) {
        const payload: CompanyDetailsPayload = {
          contact_full_name: form.contact_full_name?.trim(),
          contact_work_email: form.contact_work_email?.trim(),
          contact_mobile: form.contact_mobile?.trim(),
          contact_designation: form.contact_designation?.trim(),
        };
        await updateCompanyDetails(payload);
      }
      
      // 4. Update password if provided
      if (passwordForm.new_password) {
        if (passwordForm.new_password !== passwordForm.confirm_password) {
          throw new Error('New passwords do not match');
        }
        await changeVendorPassword(passwordForm);
        setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      }

      setInitialForm(form);
      setEmailOtpSent(false);
      setEmailOtpVerified(false);
      setEmailOtpInput('');
      setEmailShowVerification(false);
      
      setMobileOtpSent(false);
      setMobileOtpVerified(false);
      setMobileOtpInput('');
      setMobileShowVerification(false);

      await loadProfileAndCompany();
      showToast('success', 'Profile and contact settings updated successfully');
      setShowSettingsModal(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setSelectedQRFile(null);
      setPreviewQRUrl(null);
    } catch (e: any) {
      showToast('error', e.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveProfileImage = async () => {
    if (previewUrl) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    if (confirm("Are you sure you want to remove your profile picture? This action takes effect immediately.")) {
      try {
        setSaving(true);
        await deleteVendorLogo();
        await loadProfileAndCompany();
        showToast('success', 'Profile picture removed successfully');
      } catch (e: any) {
        showToast('error', e.message || 'Failed to remove profile picture');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleRemoveQRLogo = async () => {
    if (previewQRUrl) {
      setSelectedQRFile(null);
      setPreviewQRUrl(null);
      return;
    }
    if (confirm("Are you sure you want to remove your QR Code Brand Logo? This action takes effect immediately.")) {
      try {
        setSaving(true);
        await deleteVendorQRLogo();
        await loadProfileAndCompany();
        showToast('success', 'QR Code Brand Logo removed successfully');
      } catch (e: any) {
        showToast('error', e.message || 'Failed to remove QR logo');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSendEmailOtp = () => {
    if (!form.contact_work_email || !form.contact_work_email.includes('@')) {
      showToast('error', 'Please enter a valid email address first.');
      return;
    }
    setEmailOtpSent(true);
    showToast('success', 'Verification code "1234" sent to your email.');
  };

  const handleVerifyEmailOtp = () => {
    if (emailOtpInput === '1234') {
      setEmailOtpVerified(true);
      showToast('success', 'Email verified successfully!');
    } else {
      showToast('error', 'Invalid verification code. Please try again.');
    }
  };

  const handleSendMobileOtp = () => {
    if (!form.contact_mobile || form.contact_mobile.length < 10) {
      showToast('error', 'Please enter a valid mobile number first.');
      return;
    }
    setMobileOtpSent(true);
    showToast('success', 'Verification code "1234" sent to your mobile.');
  };

  const handleVerifyMobileOtp = () => {
    if (mobileOtpInput === '1234') {
      setMobileOtpVerified(true);
      showToast('success', 'Mobile number verified successfully!');
    } else {
      showToast('error', 'Invalid verification code. Please try again.');
    }
  };

  const handleChange = (field: keyof CompanyDetailsPayload, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    
    // Reset OTP verification states if fields change
    if (field === 'contact_work_email') {
      setEmailOtpSent(false);
      setEmailOtpVerified(false);
      setEmailOtpInput('');
      setEmailShowVerification(false);
    }
    if (field === 'contact_mobile') {
      setMobileOtpSent(false);
      setMobileOtpVerified(false);
      setMobileOtpInput('');
      setMobileShowVerification(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('success', 'Copied to clipboard');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Verified':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'Awaiting Review':
      case 'Under Review':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'Rejected':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      default:
        return 'bg-gray-50 text-gray-500 border border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  const vendor = profile?.vendor || {};
  const user = profile?.user || {};
  const hasAdminRights = user.role === 'Administrator' || user.role === 'admin' || user.role === 'vendor';

  const filteredDocs = [
    { name: 'GST Certificate (GST-06)', filename: form.gst_cert_file, status: form.gst_cert_status || 'Not Uploaded' },
    { name: 'Certificate of Incorporation', filename: form.inc_doc_file, status: form.inc_doc_status || 'Not Uploaded' },
    { name: 'Trademark Application (TM-A)', filename: form.tm_app_file, status: form.tm_app_status || 'Not Uploaded' },
    { name: 'Trademark Certificate (TM-O)', filename: form.tm_cert_file, status: form.tm_cert_status || 'Not Uploaded' },
    { name: 'Brand Authorization Letter', filename: form.brand_auth_file, status: form.brand_auth_status || 'Not Uploaded' },
    { name: 'Drug License Certificate', filename: form.pharma_drug_license_file, status: form.pharma_drug_license_status || 'Not Uploaded', showFor: 'Pharma' },
    { name: 'FSSAI License Certificate', filename: form.fssai_license_file, status: form.fssai_license_status || 'Not Uploaded', showFor: 'FMCG' },
    { name: 'Excise License Certificate', filename: form.excise_license_file, status: form.excise_license_status || 'Not Uploaded', showFor: 'Liquor' },
  ].filter(doc => !doc.showFor || doc.showFor === form.industry_sector);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium border ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-900 border-green-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Account & Company Profile</h2>
            <p className="text-sm text-gray-500 mt-1">Manage your identity, view legal entity details, and monitor verification status.</p>
          </div>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit Profile
          </button>
        </header>

        {isReadOnly && (
          <div className="mb-6 p-4 rounded-xl border border-emerald-100 bg-emerald-50/50 text-emerald-800 text-sm font-medium flex items-center gap-3 shadow-sm">
            <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Registration details are verified. Organization identifiers and compliance certificates are locked.</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left / Main Column */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Profile Information Card */}
            <Card
              title="Profile Information"
              subtitle="Your personal details and identity"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center border border-gray-200 bg-gray-50 shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl font-bold text-gray-400">
                        {displayName?.charAt(0)?.toUpperCase() || 'U'}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center">Profile Image</span>
                </div>

                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center border border-gray-200 bg-gray-50 shrink-0">
                    {qrLogoUrl ? (
                      <img src={qrLogoUrl} alt="QR Logo" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center">QR Logo</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12 w-full">
                  <div>
                    <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Display Name</span>
                    <span className="block text-sm font-semibold text-gray-900">{user.name || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Email Address</span>
                    <span className="block text-sm font-semibold text-gray-900">{user.email || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Status</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                      Verified Vendor
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Member Since</span>
                    <span className="block text-sm font-semibold text-gray-900">
                      {vendor.created_at ? new Date(vendor.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'Jan 2026'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Company / Legal Entity Details */}
            <Card
              title="Legal Entity Details"
              subtitle="Corporate identifiers and physical location"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
                <div className="sm:col-span-2">
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Legal Company Name</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.legal_company_name || '—'}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Company Type</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.company_type || '—'}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">CIN</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.cin || 'N/A'}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">GSTIN</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.gstin || '—'}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">PAN</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.pan || '—'}</span>
                </div>
                
                <div className="sm:col-span-2 border-t border-gray-100 pt-4">
                  <span className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Registered Address</span>
                  <p className="text-sm font-semibold text-gray-900 leading-relaxed">
                    {form.reg_address_line1}
                    {form.reg_address_line2 ? `, ${form.reg_address_line2}` : ''}
                    <br />
                    {form.reg_city}, {form.reg_state} - {form.reg_pin}
                    <br />
                    {form.reg_country}
                  </p>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Industry Sector</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.industry_sector || '—'}</span>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Company Website</span>
                  {form.company_website ? (
                    <a href={form.company_website} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-indigo-600 hover:underline">
                      {form.company_website}
                    </a>
                  ) : (
                    <span className="block text-sm font-semibold text-gray-900">—</span>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Trademark Status</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.tm_status || 'N/A'}</span>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Trademark / Application ID</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.tm_number || 'N/A'}</span>
                </div>
              </div>
            </Card>

            {/* Primary Contact Details */}
            <Card
              title="Primary Contact Details"
              subtitle="Operational coordinator and account manager"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-12">
                <div>
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Full Name</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.contact_full_name || '—'}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Designation</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.contact_designation || '—'}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Work Email Address</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.contact_work_email || '—'}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Mobile / Whatsapp Number</span>
                  <span className="block text-sm font-semibold text-gray-900">{form.contact_mobile || '—'}</span>
                </div>
              </div>
            </Card>

          </div>

          {/* Right / Sidebar Column */}
          <div className="space-y-8">
            
            {/* Documents Verification Center */}
            <Card
              title="Documents Verification Center"
              subtitle="Compliance document statuses"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              <div className="flex flex-col gap-4">
                {filteredDocs.map((doc, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/50 flex flex-col gap-2 hover:shadow-sm transition-all duration-200">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm font-bold text-gray-900">{doc.name}</span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${getStatusColor(doc.status)}`}>
                        {doc.status === 'Verified' && (
                          <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {doc.status}
                      </span>
                    </div>
                    {doc.filename ? (
                      <div className="flex items-center gap-1 text-xs text-indigo-600 font-medium hover:underline cursor-pointer w-fit">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span className="truncate max-w-[170px]">{doc.filename}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No document file provided</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Security Center Summary */}
            <Card
              title="Security Summary"
              subtitle="Credentials & Session Info"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium">Account Status</span>
                  <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 font-bold border border-green-200">Active</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-gray-100 pt-3">
                  <span className="text-gray-500 font-medium">Email Verification</span>
                  <span className="text-green-600 font-bold flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Verified
                  </span>
                </div>

              </div>
            </Card>

            {/* Support and Sign out */}
            <Card title="Support & Help">
              <div className="flex flex-col gap-2">
                <button onClick={() => setShowSupportModal(true)} className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200 group text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 transition-colors shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-900">Contact Support</span>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                
                <div className="border-t border-gray-100 my-2"></div>

                <button onClick={() => setShowPrivacyModal(true)} className="text-left text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-2 rounded transition-colors hover:bg-gray-50">Privacy Policy</button>
                <button onClick={() => setShowTermsModal(true)} className="text-left text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-2 rounded transition-colors hover:bg-gray-50">Terms &amp; Conditions</button>
              </div>
            </Card>

            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl shadow-sm transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>

          </div>
        </div>
      </div>

      {/* Unified settings modal */}
      <Modal title="Edit Profile & Contact Details" isOpen={showSettingsModal} onClose={() => {
        setShowSettingsModal(false);
        setSelectedFile(null);
        setPreviewUrl(null);
        setSelectedQRFile(null);
        setPreviewQRUrl(null);
      }} maxWidth="max-w-xl">
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
          {!hasAdminRights && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
              Note: You have limited permissions. Only Administrators can update company details and logos.
            </div>
          )}
          {/* Section A: Profile Identity */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Profile Identity</h4>
            
            {/* Profile Picture */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-gray-700">Profile Picture</span>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <label className="cursor-pointer px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors inline-block w-fit">
                      Change Photo
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveProfileImage}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-colors inline-block w-fit cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400">Square 1:1, 100x100px to 800x800px, max 1MB.</p>
                </div>
              </div>
            </div>

            {/* QR Brand Logo */}
            <div className="flex flex-col gap-2 pt-2">
              <span className="text-xs font-bold text-gray-700">QR Code Brand Logo</span>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {qrLogoUrl ? (
                    <img src={qrLogoUrl} alt="QR Logo Preview" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <label className="cursor-pointer px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors inline-block w-fit">
                      Upload QR Logo
                      <input type="file" accept="image/*" className="hidden" onChange={handleQRFileChange} />
                    </label>
                    {qrLogoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveQRLogo}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-colors inline-block w-fit cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400">Square 1:1, 100x100px to 800x800px, max 1MB.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Display Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Luxe Coordinator"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Login Email Address</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="name@company.com"
                />
              </div>
            </div>
          </div>

          {/* Section B: Primary Contact details */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Primary Contact Details</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900"
                  value={form.contact_full_name}
                  onChange={(e) => handleChange('contact_full_name', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Designation / Role</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-950"
                  value={form.contact_designation}
                  onChange={(e) => handleChange('contact_designation', e.target.value)}
                  placeholder="e.g. Operations Manager"
                />
              </div>
              
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Work Email Address <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900"
                  value={form.contact_work_email}
                  onChange={(e) => handleChange('contact_work_email', e.target.value)}
                  required
                />
                
                {showEmailWidget && (
                  <div className="mt-3 p-4 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 space-y-3 transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Email re-verification required
                      </span>
                      {emailOtpVerified ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                          ✓ Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 uppercase tracking-wider">
                          Pending
                        </span>
                      )}
                    </div>

                    {!emailOtpVerified && (
                      <div className="space-y-3">
                        {!emailOtpSent ? (
                          <div>
                            <button
                              type="button"
                              onClick={handleSendEmailOtp}
                              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm"
                            >
                              Send Verification Code
                            </button>
                            <p className="text-[10px] text-gray-400 mt-1">We will send a 4-digit code to {form.contact_work_email}.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                maxLength={4}
                                value={emailOtpInput}
                                onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, ''))}
                                placeholder="1234"
                                className="w-32 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold tracking-widest text-center focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none text-gray-900"
                              />
                              <button
                                type="button"
                                onClick={handleVerifyEmailOtp}
                                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm"
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                onClick={handleSendEmailOtp}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline ml-2"
                              >
                                Resend
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-400">
                              Enter mock OTP code <strong className="text-indigo-700 font-bold">1234</strong> to complete verification.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Mobile / Whatsapp Number <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900"
                  value={form.contact_mobile}
                  onChange={(e) => handleChange('contact_mobile', e.target.value)}
                  required
                />

                {showMobileWidget && (
                  <div className="mt-3 p-4 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 space-y-3 transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Mobile re-verification required
                      </span>
                      {mobileOtpVerified ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider animate-pulse">
                          ✓ Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 uppercase tracking-wider animate-pulse">
                          Pending
                        </span>
                      )}
                    </div>

                    {!mobileOtpVerified && (
                      <div className="space-y-3">
                        {!mobileOtpSent ? (
                          <div>
                            <button
                              type="button"
                              onClick={handleSendMobileOtp}
                              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm"
                            >
                              Send Verification Code
                            </button>
                            <p className="text-[10px] text-gray-400 mt-1">We will send a 4-digit code to {form.contact_mobile}.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                maxLength={4}
                                value={mobileOtpInput}
                                onChange={(e) => setMobileOtpInput(e.target.value.replace(/\D/g, ''))}
                                placeholder="1234"
                                className="w-32 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold tracking-widest text-center focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 outline-none text-gray-900"
                              />
                              <button
                                type="button"
                                onClick={handleVerifyMobileOtp}
                                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm"
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                onClick={handleSendMobileOtp}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline ml-2"
                              >
                                Resend
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-400">
                              Enter mock OTP code <strong className="text-indigo-700 font-bold">1234</strong> to complete verification.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section C: Security / Password Change */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Change Password</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Current Password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">New Password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  placeholder="Leave blank to keep unchanged"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Confirm New Password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  placeholder="Confirm new password"
                />
              </div>
            </div>
          </div>

          {/* Footer & Submit Actions */}
          <div className="pt-4 flex flex-col items-end gap-2 border-t border-gray-100">
            {((emailShowVerification && emailNeedsVerification) || (mobileShowVerification && mobileNeedsVerification)) && (
              <span className="text-[10px] text-red-500 font-bold animate-pulse">
                Please complete OTP verification for changed email or mobile number
              </span>
            )}
            <div className="flex gap-3 w-full justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setSelectedQRFile(null);
                  setPreviewQRUrl(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={saving || (emailShowVerification && emailNeedsVerification) || (mobileShowVerification && mobileNeedsVerification)}
                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Contact Support Modal */}
      <Modal title="Contact Support" isOpen={showSupportModal} onClose={() => setShowSupportModal(false)}>
        <div className="space-y-6">
          <p className="text-sm text-gray-600">Need help? Our support team is available 24/7 to assist you with any questions or issues.</p>
          
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Support Email</p>
                <p className="text-sm font-medium text-gray-900">support@authentiq.com</p>
              </div>
              <button onClick={() => copyToClipboard('support@authentiq.com')} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Copy</button>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone Number</p>
                <p className="text-sm font-medium text-gray-900">+1 800 555 0199</p>
              </div>
              <button onClick={() => copyToClipboard('+18005550199')} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Copy</button>
            </div>
          </div>
          
          <div className="pt-2 flex justify-end">
            <button onClick={() => setShowSupportModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50">Close</button>
          </div>
        </div>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal title="Privacy Policy" isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} maxWidth="max-w-2xl">
        <div className="space-y-4 text-sm text-gray-700">
          <h4 className="font-bold text-gray-900">1. Data Collection</h4>
          <p>We collect information you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us. This information may include: name, email, phone number, postal address, profile picture, payment method, items requested (for delivery services), delivery notes, and other information you choose to provide.</p>
          
          <h4 className="font-bold text-gray-900 mt-4">2. Data Usage</h4>
          <p>We may use the information we collect about you to: Provide, maintain, and improve our Services, including, for example, to facilitate payments, send receipts, provide products and services you request (and send related information), develop new features, provide customer support to Users and Drivers, develop safety features, authenticate users, and send product updates and administrative messages.</p>
          
          <h4 className="font-bold text-gray-900 mt-4">3. Security</h4>
          <p>We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction.</p>
          
          <h4 className="font-bold text-gray-900 mt-4">4. Retention</h4>
          <p>We will retain your information for as long as your account is active or as needed to provide you services. We will retain and use your information as necessary to comply with our legal obligations, resolve disputes, and enforce our agreements.</p>
          
          <h4 className="font-bold text-gray-900 mt-4">5. Contact Information</h4>
          <p>If you have any questions about this Privacy Policy, please contact us at privacy@authentiq.com.</p>
          
          <div className="pt-6 flex justify-end border-t border-gray-100">
            <button onClick={() => setShowPrivacyModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50">Close</button>
          </div>
        </div>
      </Modal>

      {/* Terms & Conditions Modal */}
      <Modal title="Terms & Conditions" isOpen={showTermsModal} onClose={() => setShowTermsModal(false)} maxWidth="max-w-2xl">
        <div className="space-y-4 text-sm text-gray-700">
          <h4 className="font-bold text-gray-900">1. Platform Usage</h4>
          <p>By accessing or using our platform, you agree to be bound by these Terms and all applicable laws and regulations. You are responsible for compliance with any applicable local laws.</p>
          
          <h4 className="font-bold text-gray-900 mt-4">2. Account Responsibility</h4>
          <p>You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password, whether your password is with our Service or a third-party service. You agree not to disclose your password to any third party.</p>
          
          <h4 className="font-bold text-gray-900 mt-4">3. Verification Disclaimer</h4>
          <p>Our verification services are provided on an "as is" and "as available" basis. While we strive for accuracy, we make no warranties, expressed or implied, regarding the absolute certainty of any product authentication.</p>
          
          <h4 className="font-bold text-gray-900 mt-4">4. Service Availability</h4>
          <p>We reserve the right to withdraw or amend our Service, and any service or material we provide via the Service, in our sole discretion without notice. We will not be liable if for any reason all or any part of the Service is unavailable at any time or for any period.</p>
          
          <h4 className="font-bold text-gray-900 mt-4">5. Limitation of Liability</h4>
          <p>In no event shall Authentiq, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.</p>
          
          <div className="pt-6 flex justify-end border-t border-gray-100">
            <button onClick={() => setShowTermsModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50">Close</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
