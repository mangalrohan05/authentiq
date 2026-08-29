'use client';

import React from 'react';
import { LocationData } from '@/services/api';

export interface LocationDistributionProps {
  locations: LocationData[];
  isLoading: boolean;
  theme: {
    barColor: string;
    textColor: string;
  };
}

export default function LocationDistribution({ locations, isLoading, theme }: LocationDistributionProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-white/5 rounded-xl"></div>
        ))}
      </div>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <div className="text-center py-10 bg-white/[0.02] rounded-2xl border border-white/[0.05]">
        <svg className="w-10 h-10 text-zinc-600 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium text-zinc-400">No Location Data</p>
        <p className="text-xs text-zinc-600 mt-1">Scan events with geographic data will appear here.</p>
      </div>
    );
  }

  const maxCount = Math.max(...locations.map(l => l.count));
  const totalCount = locations.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="space-y-5">
      {locations.map((loc, index) => {
        const percentage = Math.round((loc.count / totalCount) * 100);
        const width = `${Math.round((loc.count / maxCount) * 100)}%`;
        
        return (
          <div key={`${loc.country}-${loc.city}-${index}`} className="relative group">
            <div className="flex justify-between items-end mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${theme.textColor}`}>
                  {loc.country === 'Unknown' ? 'Unknown Region' : loc.country}
                </span>
                {loc.city && loc.city !== 'Unknown' && loc.country !== 'Unknown' && (
                  <span className="text-xs font-medium text-zinc-500 bg-white/[0.05] px-2 py-0.5 rounded-full">
                    {loc.city}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-300">
                  {percentage}%
                </span>
                <span className="text-xs font-medium text-zinc-600 w-8 text-right">
                  ({loc.count})
                </span>
              </div>
            </div>
            <div className="w-full bg-white/[0.03] rounded-full h-2 overflow-hidden border border-white/[0.02]">
              <div 
                className={`h-full rounded-full bg-gradient-to-r ${theme.barColor} transition-all duration-1000 ease-out`}
                style={{ width }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
