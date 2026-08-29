import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

import type { CompanyQRResponse } from '@/services/api';

interface CompanyQRModalProps {
  companyQr: CompanyQRResponse | null;
  copied: boolean;
  onClose: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onOpen: () => void;
}

export default function CompanyQRModal({
  companyQr,
  copied,
  onClose,
  onDownload,
  onCopy,
  onOpen,
}: CompanyQRModalProps) {
  if (!companyQr) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-8 relative animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Company QR</h3>
          <p className="text-sm text-gray-500 mb-6">One shared QR for all company batches.</p>

          <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6 flex flex-col items-center">
            <div className="bg-white p-3 rounded-lg shadow-sm mb-2">
              <QRCodeCanvas value={companyQr.verification_url} size={180} level="H" includeMargin />
            </div>
            <div style={{ display: 'none' }}>
              <QRCodeCanvas id="company-qr-export-modal" value={companyQr.verification_url} size={1024} level="H" includeMargin />
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={onDownload}
              className="w-full py-3 rounded-lg text-sm font-bold transition-all bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
            >
              Download QR
            </button>
            <div className="flex gap-2">
              <button
                onClick={onCopy}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${copied ? 'bg-green-500 text-white' : 'bg-gray-900 text-white hover:bg-black'}`}
              >
                {copied ? 'Copied URL!' : 'Copy Link'}
              </button>
              <button
                onClick={onOpen}
                className="flex-1 py-3 rounded-lg text-sm font-bold bg-white text-gray-900 border border-gray-200 hover:bg-gray-50"
              >
                Open Link
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
