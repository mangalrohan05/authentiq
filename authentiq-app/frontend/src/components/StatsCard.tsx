import React from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  trend?: string;
  trendStatus?: 'positive' | 'warning' | 'neutral';
}

export default function StatsCard({ label, value, icon, color = 'blue', trend, trendStatus = 'neutral' }: StatsCardProps) {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    orange: 'text-orange-600 bg-orange-50',
    purple: 'text-purple-600 bg-purple-50',
  };

  const trendColors: Record<string, string> = {
    positive: 'text-green-600 bg-green-50',
    warning: 'text-yellow-600 bg-yellow-50',
    neutral: 'text-gray-500 bg-gray-100',
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {icon && (
          <div className={`p-2 rounded-lg ${colorClasses[color] || colorClasses.blue}`}>
            {icon}
          </div>
        )}
      </div>
      
      <div>
        <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
      </div>

      {trend && (
        <div className="mt-4 flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${trendColors[trendStatus]}`}>
            {trendStatus === 'positive' ? '↑' : trendStatus === 'warning' ? '!' : '−'} {trend}
          </span>
          <span className="text-xs text-gray-500">vs last week</span>
        </div>
      )}
    </div>
  );
}
