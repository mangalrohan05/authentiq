'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getApiBase } from '@/lib/apiBase';

interface Product {
  id: string;
  name: string;
  brand: string;
  description?: string;
  sku?: string;
}

interface Batch {
  id: string;
  batch_name: string;
  created_at: string;
}

interface StatusResponse {
  status: string;
  qr_id: string;
  scan_count: number;
  created_at: string;
  batch?: Batch | null;
  products: Product[];
  brand_contact_email?: string | null;
}

function buildMailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function openMailto(link: string) {
  window.location.href = link;
}

const DEFAULT_SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_DEFAULT_SUPPORT_EMAIL?.trim() || 'vendor@authentiq.com';

/** Match strength from weighted score (not fraud risk_level). */
function verificationStrengthLabel(score: number): string {
  const pct = score * 100;
  if (pct >= 92) return 'HIGH';
  if (pct >= 80) return 'MEDIUM';
  if (pct >= 65) return 'LOW';
  return 'VERY LOW';
}

function resolveSupportEmail(apiEmail?: string | null): string {
  const trimmed = apiEmail?.trim();
  if (trimmed && trimmed.includes('@')) {
    return trimmed;
  }
  return DEFAULT_SUPPORT_EMAIL;
}

const SLOT_DISPLAY_NAMES: Record<string, string> = {
  front: 'Front Match',
  back: 'Back Match',
  label: 'Label Match',
};

function slotMatchTitle(result: { display_name?: string; image_type?: string }): string {
  return (
    result.display_name ||
    SLOT_DISPLAY_NAMES[result.image_type || ''] ||
    (result.image_type ? `${result.image_type} match` : 'Match')
  );
}


function SlotMatchBreakdown({
  results,
  accentClass,
}: {
  results: Array<{
    image_type?: string;
    display_name?: string;
    slot_score?: number;
    average_similarity?: number;
    global_similarity?: number;
    patch_similarity?: number | null;
    ocr_match_percent?: number | null;
    ocr_similarity?: number | null;
  }>;
  accentClass: string;
}) {
  if (!results?.length) return null;
  return (
    <div className="space-y-3">
      <h4 className={`text-xs font-black uppercase tracking-[0.2em] ${accentClass}`}>
        Verification Breakdown
      </h4>
      <div className={`p-4 rounded-xl border space-y-3 ${accentClass.includes('emerald') ? 'bg-emerald-500/[0.02] border-emerald-500/15' : 'bg-red-500/[0.02] border-red-500/15'}`}>
        {results.map((result, idx) => {
          const score = result.slot_score ?? result.average_similarity ?? 0;
          const pct = Math.round(score * 100);
          const isLabel = result.image_type === 'label';
          return (
            <div key={idx} className="p-3 bg-white/5 rounded-lg space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className={`font-bold ${accentClass}`}>{slotMatchTitle(result)}</span>
                <span className="font-mono text-zinc-200">{pct}%</span>
              </div>
              {typeof result.global_similarity === 'number' && (
                <p className="text-[10px] text-zinc-500">
                  Visual (global): {Math.round(result.global_similarity * 100)}%
                  {result.patch_similarity != null &&
                    ` · Detail patches: ${Math.round(result.patch_similarity * 100)}%`}
                </p>
              )}
              {isLabel && result.ocr_match_percent != null && (
                <p className="text-[10px] text-zinc-400">
                  OCR Match: {result.ocr_match_percent}%
                  {result.ocr_match_percent >= 80
                    ? ' — serial/label text aligns with reference'
                    : result.ocr_match_percent > 0
                      ? ' — partial text overlap'
                      : ' — OCR unavailable or no readable text'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface UploadSlot {
  key: 'front' | 'back' | 'label' | 'proof';
  label: string;
  description: string;
  required: boolean;
  file: File | null;
  preview: string | null;
}

export default function ProductVerification() {
  const params = useParams();
  const qrId = params.qrId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<StatusResponse | null>(null);
  const [step, setStep] = useState<'initial' | 'upload' | 'analyzing' | 'result'>('initial');

  // Multi-image upload slots state
  const [slots, setSlots] = useState<UploadSlot[]>([
    { key: 'front', label: 'Product Front View', description: 'Straight-on photo with brand logo and primary design clearly visible.', required: true, file: null, preview: null },
    { key: 'back', label: 'Product Back View', description: 'Clear image of the back showing labels, serial markings, stitching, engravings, or rear details.', required: true, file: null, preview: null },
    { key: 'label', label: 'Product Label / Serial', description: 'Close-up of serial numbers, wash labels, tags, or security micro-print.', required: true, file: null, preview: null },
    { key: 'proof', label: 'Purchase Receipt (Optional)', description: 'Optional — helps the brand if you report an issue after verification.', required: false, file: null, preview: null },
  ]);

  // AI Pipeline Execution States
  const [uploadProgress, setUploadProgress] = useState(0);
  const [aiStatusText, setAiStatusText] = useState('Initializing secure AI vision model...');
  const [aiResult, setAiResult] = useState<any | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Customer report notes (mailto on result step)
  const [reportNotes, setReportNotes] = useState('');
  const [reportPurchaseLocation, setReportPurchaseLocation] = useState('');

  const dragOverSlot = useRef<string | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState<string>('');

  // Geolocation integration and reverse geocoding
  useEffect(() => {
    let isVendorPortal = false;
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      isVendorPortal = searchParams.get('source') === 'vendor_portal';
    }

    if (typeof window !== 'undefined') {
      const cachedLocation = sessionStorage.getItem('authentiq_cached_location');
      if (cachedLocation) {
        setResolvedLocation(cachedLocation);
        if (!isVendorPortal) {
          fetch(`${getApiBase()}/scan/${qrId}?location_str=${encodeURIComponent(cachedLocation)}`).catch(() => {});
        }
        return;
      }
    }

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            // Reverse geocode via Nominatim
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`,
              {
                headers: {
                  'Accept-Language': 'en',
                  'User-Agent': 'Authentiq/1.0 (verify-client)'
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
                setResolvedLocation(locationStr);
                sessionStorage.setItem('authentiq_cached_location', locationStr);
                if (!isVendorPortal) {
                  fetch(`${getApiBase()}/scan/${qrId}?location_str=${encodeURIComponent(locationStr)}`).catch(() => {});
                }
              }
            }
          } catch (e) {
            console.error('Error reverse geocoding client location:', e);
            if (!isVendorPortal) {
              fetch(`${getApiBase()}/scan/${qrId}`).catch(() => {});
            }
          }
        },
        (err) => {
          console.warn('Geolocation failed or denied:', err);
          if (!isVendorPortal) {
            fetch(`${getApiBase()}/scan/${qrId}`).catch(() => {});
          }
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      if (!isVendorPortal) {
        fetch(`${getApiBase()}/scan/${qrId}`).catch(() => {});
      }
    }
  }, [qrId]);

  // ── 1. INITIAL STATUS VALIDATION ───────────────────────────────────────────
  useEffect(() => {
    const fetchStatus = async () => {
      if (!qrId) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${getApiBase()}/scan/${qrId}/status`);
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Invalid or unregistered QR code');
        }

        const data = await res.json();
        setQrStatus(data);
      } catch (err: any) {
        setError(err.message || 'Invalid or unregistered QR code');
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [qrId]);

  // ── 2. FILE SELECTION & SANITIZATION ──────────────────────────────────────
  const handleFileChange = (key: string, file: File | null) => {
    setSubmitError(null);
    if (!file) {
      setSlots(prev => prev.map(s => s.key === key ? { ...s, file: null, preview: null } : s));
      return;
    }

    // Type checking
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setSubmitError('Invalid format: Only JPEG, PNG, and WEBP images are supported.');
      return;
    }

    // Size limit check (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setSubmitError('File is too large. Images must be under 5MB.');
      return;
    }

    // Duplicate detection (compares name & size)
    const isDuplicate = slots.some(s => s.file && s.file.name === file.name && s.file.size === file.size);
    if (isDuplicate) {
      setSubmitError('Duplicate upload: This file has already been added to another slot.');
      return;
    }

    // Generate object URL for image preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setSlots(prev => prev.map(s => s.key === key ? {
        ...s,
        file: file,
        preview: reader.result as string
      } : s));
    };
    reader.readAsDataURL(file);
  };

  const removeFile = (key: string) => {
    setSlots(prev => prev.map(s => s.key === key ? { ...s, file: null, preview: null } : s));
  };

  // Drag & drop handlers
  const onDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    dragOverSlot.current = key;
  };

  const onDrop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    dragOverSlot.current = null;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileChange(key, file);
    }
  };

  const VERIFY_TIMEOUT_MS = 120_000; // OpenCLIP first run + 3–4 images can take >15s

  const parseApiError = async (res: Response): Promise<string> => {
    try {
      const errData = await res.json();
      const detail = errData.detail;
      if (typeof detail === 'string') return detail;
      if (detail?.message) return detail.message;
      if (detail?.error === 'EmbeddingsMissing') {
        const ready = detail.embeddings_ready_count ?? 0;
        const total = detail.embeddings_total_count ?? 0;
        return `${detail.message}${total ? ` (${ready}/${total} ready)` : ''}`;
      }
      if (detail?.error === 'AIServiceUnavailable') {
        return detail.message || 'AI verification service is temporarily unavailable.';
      }
      return JSON.stringify(detail);
    } catch {
      if (res.status === 503) return 'AI service unavailable. Please try again shortly.';
      if (res.status === 422) return 'Reference embeddings are still processing. Please wait and retry.';
      return `Verification failed (HTTP ${res.status})`;
    }
  };

  // ── 3. AI PIPELINE SUBMISSION ──────────────────────────────────────────────
  const triggerAIVerification = async () => {
    const requiredMissing = slots.filter(s => s.required && !s.file);
    if (requiredMissing.length > 0) {
      setSubmitError(`Please upload clear images for all required fields: ${requiredMissing.map(s => s.label).join(', ')}.`);
      return;
    }

    setStep('analyzing');
    setUploadProgress(10);
    setSubmitError(null);

    // Dynamic AI Status Loading texts
    const textIntervals = [
      { t: 0, text: 'Encrypting payload and preparing image secure packets...' },
      { t: 1500, text: 'Running neural anti-counterfeit texture analysis...' },
      { t: 3200, text: 'Analyzing holographic micro-print alignment grids...' },
      { t: 5000, text: 'Resolving brand spectral security indicators...' },
      { t: 6800, text: 'Computing final product authenticity certificate...' }
    ];

    textIntervals.forEach(interval => {
      setTimeout(() => setAiStatusText(interval.text), interval.t);
    });

    try {
      const formData = new FormData();
      slots.forEach(s => {
        if (s.file) {
          formData.append(s.key, s.file);
        }
      });
      if (resolvedLocation) {
        formData.append('location_str', resolvedLocation);
      }
      // Run verification as a background job and poll for the result, so a slow
      // (local) VLM never trips the request/proxy timeout — audit 1.11.
      formData.append('background', 'true');

      // Progress animation simulation
      const progressTimer = setInterval(() => {
        setUploadProgress(p => (p >= 90 ? p : p + 8));
      }, 400);

      const verifyUrl = `${getApiBase()}/scan/${qrId}/verify-ai`;

      const postVerify = () =>
        fetch(verifyUrl, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        });

      let res = await postVerify();

      // Retry once when vendor embeddings are still warming up
      if (!res.ok && res.status === 422) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody?.detail?.error === 'EmbeddingsMissing') {
          setAiStatusText('Reference embeddings still processing — retrying in 15s...');
          await new Promise(r => setTimeout(r, 15000));
          res = await postVerify();
        } else {
          clearInterval(progressTimer);
          const detail = errBody.detail;
          throw new Error(
            typeof detail === 'string' ? detail : detail?.message || 'Verification failed'
          );
        }
      }

      clearInterval(progressTimer);

      if (!res.ok) {
        clearInterval(progressTimer);
        throw new Error(await parseApiError(res));
      }

      // Async job (audit 1.11): the POST enqueues and returns { job_id }; poll
      // GET /scan/verify-jobs/{id} until it finishes, so a slow local VLM never
      // trips the request/proxy timeout. Falls back to a synchronous result if
      // the server did not return a job_id.
      let result = await res.json();
      if (result && result.job_id) {
        const jobUrl = `${getApiBase()}/scan/verify-jobs/${result.job_id}`;
        const deadline = Date.now() + 8 * 60 * 1000; // 8-minute overall cap
        setAiStatusText('Running AI authentication — this can take up to a minute...');
        for (;;) {
          await new Promise(r => setTimeout(r, 2500));
          const pr = await fetch(jobUrl, { signal: AbortSignal.timeout(15_000) });
          if (!pr.ok) {
            clearInterval(progressTimer);
            throw new Error(await parseApiError(pr));
          }
          const pb = await pr.json();
          if (pb.status === 'done') {
            result = pb.result;
            break;
          }
          if (Date.now() > deadline) {
            clearInterval(progressTimer);
            throw new Error('Verification is taking longer than expected. Please try again.');
          }
        }
      }

      clearInterval(progressTimer);
      setUploadProgress(100);

      if (typeof window !== 'undefined') {
        try {
          const channel = new BroadcastChannel('authentiq_activity_channel');
          channel.postMessage('reload_activity');
          channel.close();
        } catch (e) {
          console.error('Failed to post to BroadcastChannel:', e);
        }
      }
      
      // Delay slightly to give a pleasant premium interaction feel
      setTimeout(() => {
        setAiResult(result);
        setStep('result');
      }, 1000);

    } catch (err: any) {
      setStep('upload');
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      const isNetwork =
        err?.message === 'Failed to fetch' ||
        err?.name === 'TypeError';
      setSubmitError(
        isTimeout
          ? 'Verification timed out. The AI model may still be loading — please wait a moment and try again.'
          : isNetwork
            ? 'Cannot reach the verification server. Ensure the backend is running on port 8000 and restart the Next.js dev server after updates.'
            : err.message || 'Image processing failed. Please retry.'
      );
    }
  };

  // ── 4. MAILTO CONTACT & REPORT ─────────────────────────────────────────────

  // ── 5. STATE RENDERS ───────────────────────────────────────────────────────

  // Loading indicator
  if (loading) return (
    <div className="min-h-screen bg-[#070b19] flex flex-col items-center justify-center p-6 text-zinc-100 antialiased">
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20"></div>
        <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 animate-spin"></div>
      </div>
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-indigo-400 animate-pulse">Initializing Secure Registry Link</p>
      <p className="text-xs text-zinc-500 mt-2">Connecting to Authentiq Blockchain Ledger</p>
    </div>
  );

  // Invalid / Expired / Suspicious QR State
  if (error || !qrStatus) return (
    <div className="min-h-screen bg-[#070b19] flex items-center justify-center p-6 antialiased">
      <div className="bg-[#0c122c]/65 backdrop-blur-md p-10 rounded-[2.5rem] border border-red-500/30 text-center max-w-md w-full shadow-2xl relative overflow-hidden">
         <div className="absolute -top-12 -right-12 w-32 h-32 bg-red-500/10 rounded-full blur-2xl"></div>
         <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
         </div>
         <h2 className="text-2xl font-black text-red-400 mb-2 uppercase tracking-tight">Fraud Warning</h2>
         <p className="text-zinc-300 text-sm font-medium leading-relaxed mb-6">
           This QR registry ID is not recognized or has been revoked due to suspicious anti-counterfeit activity.
         </p>
         <div className="bg-red-500/10 rounded-2xl p-4 border border-red-500/25 text-left text-xs text-red-300 space-y-2 mb-2">
           <p className="font-bold">⚠️ Customer Safety Recommendations:</p>
           <ul className="list-disc pl-4 space-y-1">
             <li>Do not consume or wear this product.</li>
             <li>Request a refund or return from your retailer immediately.</li>
             <li>Report fraud to the respective brand registry manager.</li>
           </ul>
         </div>
         <div className="text-[10px] font-black text-zinc-500 mt-6 uppercase tracking-wider">Secured by Authentiq Registry</div>
      </div>
    </div>
  );

  const product = qrStatus.products[0] || { name: 'Unknown Product', brand: 'Secure Chain', id: 'N/A', sku: 'N/A' };

  const authStatusLabel =
    qrStatus.status === 'active'
      ? 'Product Recognized • Awaiting AI Verification'
      : 'Registered • Verification Available';

  const brandEmail = resolveSupportEmail(qrStatus.brand_contact_email);
  const hasSupportEmail = !!brandEmail;
  const scanTimestamp = qrStatus.created_at
    ? new Date(qrStatus.created_at).toLocaleString()
    : new Date().toLocaleString();

  const handleContactBrand = () => {
    if (!hasSupportEmail) return;
    const subject = `Authentiq Product Inquiry — ${product.name}`;
    const body = [
      `Hello ${product.brand} team,`,
      '',
      'I scanned a product QR code on Authentiq and would like to get in touch regarding this item.',
      '',
      `Brand: ${product.brand}`,
      `Product: ${product.name}`,
      `Registry status: ${authStatusLabel}`,
      `Scan time: ${scanTimestamp}`,
      '',
      '[Your message here]',
    ].join('\n');
    openMailto(buildMailtoLink(brandEmail, subject, body));
  };

  const handleSendVerificationReport = () => {
    if (!hasSupportEmail || !aiResult) return;
    const ai = aiResult.ai_result;
    const sessionRef = aiResult.session_id
      ? `${String(aiResult.session_id).slice(0, 8)}…`
      : `${qrStatus.qr_id.slice(0, 8)}…`;
    const processedAt = ai.processed_at
      ? new Date(ai.processed_at).toLocaleString()
      : new Date().toLocaleString();

    const subject = 'Authentiq Verification Report — Product Issue';
    const body = [
      'Authentiq Verification Report',
      '────────────────────────────',
      '',
      `Brand: ${product.brand}`,
      `Product: ${product.name}`,
      `Verification result: ${ai.status}`,
      `Verified at: ${processedAt}`,
      `Session reference: ${sessionRef}`,
      '',
      reportPurchaseLocation.trim()
        ? `Purchase location: ${reportPurchaseLocation.trim()}`
        : null,
      reportNotes.trim() ? `Customer concern:\n${reportNotes.trim()}` : 'Customer concern:\n[Describe the issue here]',
      '',
      '— Sent via Authentiq customer verification',
    ]
      .filter((line) => line !== null)
      .join('\n');

    openMailto(buildMailtoLink(brandEmail, subject, body));
  };

  const verificationReportSection = (accent: 'emerald' | 'amber' | 'red') => (
    <div
      className={`bg-white/[0.01] p-6 rounded-2xl border space-y-4 ${
        accent === 'emerald' ? 'border-white/5' : accent === 'amber' ? 'border-amber-500/15' : 'border-red-500/15'
      }`}
    >
      <div>
        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
          Report to Brand
        </h4>
        <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
          Share verification details with {product.brand} if you have concerns about this product.
        </p>
      </div>

      {accent !== 'emerald' && (
        <div>
          <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1.5">
            Purchase location (optional)
          </label>
          <input
            type="text"
            value={reportPurchaseLocation}
            onChange={(e) => setReportPurchaseLocation(e.target.value)}
            placeholder="e.g. Retail store or merchant site"
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-white/5 focus:border-indigo-500/50 text-xs text-white"
          />
        </div>
      )}

      <div>
        <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1.5">
          Your message (optional)
        </label>
        <textarea
          rows={3}
          value={reportNotes}
          onChange={(e) => setReportNotes(e.target.value)}
          placeholder="Describe your concern about this product…"
          className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-white/5 focus:border-indigo-500/50 text-xs text-white resize-none"
        />
      </div>

      <div className="flex flex-col md:flex-row gap-3 w-full">
        <button
          type="button"
          onClick={handleContactBrand}
          className="flex-1 w-full min-h-[3rem] py-3.5 px-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest bg-zinc-800 border border-zinc-600 text-zinc-100 hover:bg-zinc-700 hover:border-zinc-500"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Contact Brand
        </button>
        <button
          type="button"
          onClick={handleSendVerificationReport}
          className="flex-1 w-full min-h-[3rem] py-3.5 px-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/30"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Send Verification Report
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070b19] flex items-center justify-center p-4 sm:p-10 antialiased text-white">
      <div className="max-w-xl w-full">
        {/* Authentiq brand header */}
        <div className="text-center mb-10 flex flex-col items-center">
          <img src="/authentiq_logo_dark.png" alt="Authentiq Logo" className="w-full max-w-[260px] h-auto mb-4" />
          <p className="text-[9px] font-black uppercase tracking-[0.25em]">
            <span className="text-indigo-400">Verify Instantly.</span>{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent animate-text-shine">Trust Absolutely.</span>
          </p>
        </div>

        <div className="bg-[#0c122c]/50 backdrop-blur-lg rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl shadow-black/40">
          
          {/* 🚀 STEP 1: INITIAL REGISTRY FOUND */}
          {step === 'initial' && (
            <div>
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 p-10 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-6 border border-white/20 shadow-lg relative z-10">
                  <svg className="w-10 h-10 text-indigo-200" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="45 45 135 135">
                    <g stroke="#2de898" strokeWidth="5.5" fill="none" strokeLinecap="round">
                      <path d="M76,52 L52,52 L52,76" />
                      <path d="M148,52 L172,52 L172,76" />
                      <path d="M76,168 L52,168 L52,144" />
                      <path d="M148,168 L172,168 L172,144" />
                    </g>
                    <circle cx="108" cy="106" r="38" stroke="#2de898" strokeWidth="7" fill="none" />
                    <line x1="137" y1="135" x2="158" y2="158" stroke="#2de898" strokeWidth="8" strokeLinecap="round" />
                    <polyline points="90,106 102,118 127,93" stroke="#2de898" strokeWidth="6.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h1 className="text-2xl font-black uppercase tracking-widest text-white leading-none">Product Authenticated</h1>
                <p className="text-indigo-200 text-xs mt-2 font-bold uppercase tracking-widest">Valid Code • Ready for AI Validation</p>
              </div>

              <div className="p-8 sm:p-10 space-y-8">
                {/* Product summary — customer-facing fields only */}
                <div className="bg-white/[0.02] p-6 rounded-2xl border border-white/5 space-y-5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Brand</span>
                    <h3 className="text-xl font-bold text-white mt-0.5">{product.brand}</h3>
                  </div>
                  <div className="border-t border-white/5 pt-4">
                    <span className="text-[10px] text-zinc-500 uppercase font-black block">Product</span>
                    <span className="font-bold text-white mt-1 block text-lg">{product.name}</span>
                  </div>
                  <div className="border-t border-white/5 pt-4 flex items-center gap-3">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-black block">Authentication Status</span>
                      <span className="text-sm font-semibold text-emerald-300/95 mt-0.5 block">{authStatusLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Verification guidance */}
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] p-5 text-center">
                  <p className="text-sm font-semibold text-white leading-relaxed">
                    Upload product images to verify authenticity using Authentiq AI validation technology.
                  </p>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed max-w-sm mx-auto">
                    Quick, secure visual checks compare your photos against the brand&apos;s registered reference — confirming your product is genuine in minutes.
                  </p>
                </div>

                {/* Submit CTA */}
                <button 
                  onClick={() => setStep('upload')}
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-indigo-600/20"
                >
                  Proceed to AI Verification
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </button>

                <button
                  type="button"
                  onClick={handleContactBrand}
                  className="w-full py-3.5 bg-zinc-900/80 border border-white/10 text-zinc-200 font-bold rounded-xl hover:bg-zinc-800 hover:border-white/20 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Contact Brand
                </button>
              </div>
            </div>
          )}

          {/* 📸 STEP 2: UPLOAD IMAGES */}
          {step === 'upload' && (
            <div className="p-8 sm:p-10 space-y-6">
              <header className="text-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Step 2 of 3</span>
                <h2 className="text-2xl font-black text-white mt-1">Capture Product Details</h2>
                <p className="text-xs text-zinc-400 mt-1">Upload front, back, and label views — matched against the brand&apos;s official reference images.</p>
              </header>

              {submitError && (
                <div className="bg-red-500/10 border border-red-500/25 p-4 rounded-xl text-red-400 text-xs font-semibold">
                  {submitError}
                </div>
              )}

              {/* Dynamic upload grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {slots.map(slot => (
                  <div 
                    key={slot.key}
                    onDragOver={(e) => onDragOver(e, slot.key)}
                    onDrop={(e) => onDrop(e, slot.key)}
                    className={`relative rounded-2xl border-2 border-dashed p-4 flex flex-col items-center text-center justify-center transition-all min-h-[145px] ${
                      slot.preview 
                        ? 'border-indigo-500/40 bg-indigo-500/[0.02]' 
                        : 'border-white/10 hover:border-indigo-500/30 bg-white/[0.01]'
                    }`}
                  >
                    {slot.preview ? (
                      <div className="w-full flex flex-col items-center relative">
                        <img 
                          src={slot.preview} 
                          alt={slot.label} 
                          className="w-16 h-16 object-cover rounded-lg border border-white/10 mb-2 shadow-inner" 
                        />
                        <span className="text-xs font-bold text-white truncate max-w-[150px]">{slot.file?.name}</span>
                        <span className="text-[9px] text-zinc-500 font-mono mt-0.5">{(slot.file!.size / 1024).toFixed(0)} KB</span>
                        <button 
                          onClick={() => removeFile(slot.key)}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 mb-2 group-hover:text-indigo-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <span className="text-xs font-bold text-zinc-300 block">{slot.label} {slot.required && <span className="text-indigo-400">*</span>}</span>
                        <span className="text-[10px] text-zinc-500 leading-normal mt-1 max-w-[160px] block">{slot.description}</span>
                        
                        <input 
                          type="file" 
                          accept="image/*"
                          capture="environment" // Forces native camera trigger on mobile!
                          className="hidden"
                          onChange={(e) => {
                            handleFileChange(slot.key, e.target.files?.[0] || null);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>

              {/* Drag/drop description */}
              <div className="text-center text-[10px] text-zinc-500 font-bold uppercase tracking-wider pt-2">
                Drag & Drop or Tap slots to use camera
              </div>

              {/* Form CTAs */}
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setStep('initial')}
                  className="flex-1 py-4 bg-zinc-900 border border-white/5 text-zinc-400 font-bold rounded-xl hover:bg-zinc-800 transition-colors"
                >
                  Back
                </button>
                <button 
                  onClick={triggerAIVerification}
                  className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20"
                >
                  Trigger AI Verification
                </button>
              </div>
            </div>
          )}

          {/* ⚡ STEP 3: RUNNING AI ALGORITHMS */}
          {step === 'analyzing' && (
            <div className="p-10 flex flex-col items-center justify-center text-center space-y-8 min-h-[400px]">
              
              {/* Outer pulsing ring */}
              <div className="relative w-36 h-36 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-indigo-500/10 animate-ping"></div>
                <div className="absolute inset-2 rounded-full border-2 border-dashed border-indigo-500/30 animate-spin" style={{ animationDuration: '6s' }}></div>
                <div className="absolute inset-4 rounded-full border border-indigo-500/20"></div>
                <div className="absolute inset-4 rounded-full border-2 border-t-indigo-400 animate-spin"></div>
                
                {/* Radial progress core */}
                <div className="relative z-10 text-2xl font-black text-indigo-400">{uploadProgress}%</div>
              </div>

              <div className="space-y-2 max-w-sm">
                <h3 className="text-xl font-black text-white uppercase tracking-wider animate-pulse">Running AI Integrity Check</h3>
                <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest">{aiStatusText}</p>
                <p className="text-[10px] text-zinc-500 pt-2 leading-relaxed">
                  Authentiq compares each view against matching brand references registered by {product.brand}.
                </p>
              </div>
            </div>
          )}

          {/* 🎖️ STEP 4: VERIFICATION REPORT RESULTS */}
          {step === 'result' && aiResult && (
            <div>
              {['authentic', 'likely_authentic'].includes(aiResult.ai_result.status) ? (
                // SUCCESS: GENUINE BRAND
                <div>
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-800 p-10 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                    <div className="w-20 h-20 bg-white/15 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-6 border border-white/20 shadow-lg relative z-10">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="45 45 135 135">
                        <g stroke="#2de898" strokeWidth="5.5" fill="none" strokeLinecap="round">
                          <path d="M76,52 L52,52 L52,76" />
                          <path d="M148,52 L172,52 L172,76" />
                          <path d="M76,168 L52,168 L52,144" />
                          <path d="M148,168 L172,168 L172,144" />
                        </g>
                        <circle cx="108" cy="106" r="38" stroke="#2de898" strokeWidth="7" fill="none" />
                        <line x1="137" y1="135" x2="158" y2="158" stroke="#2de898" strokeWidth="8" strokeLinecap="round" />
                        <polyline points="90,106 102,118 127,93" stroke="#2de898" strokeWidth="6.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-white leading-none">
                      Genuine
                    </h1>
                    <p className="text-emerald-100 text-xs mt-2 font-bold uppercase tracking-widest">🎖️ Certified Product • Secure Registry Verified</p>
                  </div>

                  <div className="p-8 sm:p-10 space-y-8">
                    
                    {/* circular dial display */}
                    <div className="flex flex-col sm:flex-row gap-6 items-center justify-between p-6 bg-emerald-500/[0.02] border border-emerald-500/20 rounded-2xl">
                      <div className="w-24 h-24 flex items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 shrink-0">
                        <svg className="w-12 h-12 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="text-center sm:text-left space-y-1">
                        <h4 className="text-lg font-bold text-white">Authenticity Verdict</h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">{aiResult.ai_result.explanation}</p>
                      </div>
                    </div>

                    <SlotMatchBreakdown
                      results={aiResult.ai_result.per_image_results || []}
                      accentClass="text-emerald-400"
                    />

                    {verificationReportSection('emerald')}
                  </div>
                </div>
              ) : aiResult.ai_result.status === 'needs_review' ? (
                // NEEDS REVIEW: AMBIGUOUS — NOT A CONFIRMED FAKE, PENDING REVIEW
                <div>
                  <div className="bg-gradient-to-br from-amber-500 to-amber-800 p-10 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                    <div className="w-20 h-20 bg-white/15 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-6 border border-white/20 shadow-lg relative z-10">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-white leading-none">
                      Needs Review
                    </h1>
                    <p className="text-amber-100 text-xs mt-2 font-bold uppercase tracking-widest">
                      🔍 Not confirmed either way • Pending manual review
                    </p>
                  </div>

                  <div className="p-8 sm:p-10 space-y-8">

                    {/* circular dial display */}
                    <div className="flex flex-col sm:flex-row gap-6 items-center justify-between p-6 bg-amber-500/[0.02] border border-amber-500/20 rounded-2xl">
                      <div className="w-24 h-24 flex items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30 shrink-0">
                        <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-center sm:text-left space-y-1">
                        <h4 className="text-lg font-bold text-white">Authenticity Verdict</h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {aiResult.ai_result.explanation || 'The AI found this scan ambiguous and could not confidently confirm or reject it. This is not an accusation — it is routed for manual review.'}
                        </p>
                      </div>
                    </div>

                    <SlotMatchBreakdown
                      results={aiResult.ai_result.per_image_results || []}
                      accentClass="text-amber-400"
                    />

                    {verificationReportSection('amber')}
                  </div>
                </div>
              ) : (
                // FAILS / SUSPICIOUS: BRAND CAUTION REPORT
                <div>
                  <div className="bg-gradient-to-br from-red-600 to-red-950 p-10 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                    <div className="w-20 h-20 bg-white/15 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-6 border border-white/20 shadow-lg relative z-10">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-white leading-none">
                      Not Genuine
                    </h1>
                    <p className="text-red-100 text-xs mt-2 font-bold uppercase tracking-widest">
                      ⚠️ Could not confirm this product as authentic
                    </p>
                  </div>

                  <div className="p-8 sm:p-10 space-y-8">
                    
                    {/* circular dial display */}
                    <div className="flex flex-col sm:flex-row gap-6 items-center justify-between p-6 bg-red-500/[0.02] border border-red-500/20 rounded-2xl">
                      <div className="w-24 h-24 flex items-center justify-center rounded-full bg-red-500/10 border border-red-500/30 shrink-0">
                        <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div className="text-center sm:text-left space-y-1">
                        <h4 className="text-lg font-bold text-white">Authenticity Verdict</h4>
                        <p className="text-xs text-zinc-400">{aiResult.ai_result.explanation}</p>
                      </div>
                    </div>

                    <SlotMatchBreakdown
                      results={aiResult.ai_result.per_image_results || []}
                      accentClass="text-red-400"
                    />

                    {verificationReportSection('red')}
                  </div>
                </div>
              )}
            </div>
          )}



        </div>
      </div>
    </div>
  );
}
