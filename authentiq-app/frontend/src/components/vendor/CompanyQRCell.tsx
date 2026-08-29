import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

import type { CompanyQRResponse } from '@/services/api';

interface CompanyQRCellProps {
  companyQr: CompanyQRResponse | null;
  canGenerate: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onView: () => void;
}

export default function CompanyQRCell({
  companyQr,
  canGenerate,
  isGenerating,
  onGenerate,
  onView,
}: CompanyQRCellProps) {
  if (companyQr) {
    return (
      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60 min-w-[230px]">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1.5 rounded-md border border-gray-200 shrink-0">
            <QRCodeCanvas value={companyQr.verification_url} size={42} level="M" includeMargin />
          </div>
          <div className="min-w-0">
            <span className="inline-flex px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-full uppercase tracking-widest">
              QR Generated
            </span>
            <p className="mt-1 text-[11px] font-mono text-gray-500 truncate max-w-[150px]">
              /verify/company/{companyQr.company_id}
            </p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          className="mt-2 px-3 py-1.5 text-[11px] font-bold rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
        >
          View QR
        </button>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60 min-w-[230px]">
      <div className="flex items-center gap-2 text-gray-500">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h2m4 0h-2m-4 4h6m-6 2h2" />
        </svg>
        <span className="text-xs font-semibold">No QR Generated</span>
      </div>
      {canGenerate ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerate();
          }}
          disabled={isGenerating}
          className="mt-2 px-3 py-1.5 text-[11px] font-bold rounded-md border border-gray-200 bg-white text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? 'Generating...' : 'Generate QR'}
        </button>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">Use first row to generate company QR.</p>
      )}
    </div>
  );
}
