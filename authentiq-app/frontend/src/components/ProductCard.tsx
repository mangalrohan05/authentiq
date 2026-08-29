import React, { useState } from 'react';

interface ProductCardProps {
  mockId: string;
  name: string;
  batch: string;
  description?: string;
  qrCount?: number;
  scanCount?: number;
  qrId?: string;
  onGenerateQR: () => void;
  onViewQR: () => void;
}

export default function ProductCard({ 
  mockId, 
  name, 
  batch, 
  description, 
  qrCount = 0, 
  scanCount = 0, 
  qrId,
  onGenerateQR,
  onViewQR 
}: ProductCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (qrCount === 0) {
      alert("Please generate a QR code first.");
      return;
    }
    
    // Use qrId if we have it, otherwise fallback to mockId (though qrId is preferred)
    const activeId = qrId || mockId;
    const url = `${window.location.origin}/verify/${activeId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
           <h3 className="text-base font-bold text-gray-900">{name}</h3>
           <span className="px-2 py-0.5 rounded text-[10px] font-bold text-green-700 bg-green-100 uppercase tracking-widest border border-green-200">
             Active
           </span>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono bg-gray-100 border border-gray-200 px-2 py-1 rounded text-gray-600">
          {batch}
        </span>
        <span className="text-xs font-mono text-gray-500">
          ID: <strong className="text-gray-700">{mockId}</strong>
        </span>
      </div>

      <p className="text-sm text-gray-500 line-clamp-2 mb-6 flex-grow">
        {description || 'No description provided.'}
      </p>
      
      {/* Metrics Row */}
      <div className="flex items-center gap-6 mb-5 px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
         <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">QR Status</span>
            <span className={`text-sm font-bold ${qrCount > 0 ? 'text-green-600' : 'text-gray-900'}`}>
              {qrCount > 0 ? 'QR Active' : 'Not Generated'}
            </span>
         </div>
         <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Scans</span>
            <span className="text-sm font-bold text-gray-900">{scanCount} tracking</span>
         </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-auto">
        {qrCount > 0 ? (
          <button
            onClick={onViewQR}
            className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200 rounded-lg text-sm font-bold transition-all active:scale-[0.98]"
          >
            View QR
          </button>
        ) : (
          <button
            onClick={onGenerateQR}
            className="w-full py-2 bg-gray-900 hover:bg-black text-white border border-gray-900 rounded-lg text-sm font-bold transition-all active:scale-[0.98]"
          >
            Generate QR
          </button>
        )}
        <button
          onClick={handleCopyLink}
          className="w-full py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold transition-colors active:scale-[0.98] border border-gray-200 shadow-sm"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}
