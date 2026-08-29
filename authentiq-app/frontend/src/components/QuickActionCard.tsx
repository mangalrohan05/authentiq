import React from 'react';

interface QuickActionCardProps {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

export default function QuickActionCard({ label, icon, onClick }: QuickActionCardProps) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:bg-gray-50 transition-all group mb-3"
    >
      <div className="text-gray-500 group-hover:text-gray-900 transition-colors">
        {icon}
      </div>
      <span className="text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors">
        {label}
      </span>
      <div className="ml-auto opacity-50 group-hover:opacity-100 transition-opacity">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
