"use client";

import React, { useEffect, useState, useMemo } from "react";

interface ActivityRecord {
  id: string | number;
  verificationState: string;
  date: string;
  time: string;
  place: string;
  statusType: "success" | "alert" | string;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  batch_name: string;
  location: string;
  timestamp: string; 
  status: "authentic" | "likely_authentic" | "needs_review" | "suspicious" | string;
}

interface RecentActivityLogProps {
  records?: ActivityRecord[];
}

export default function RecentActivityLog({ records }: RecentActivityLogProps) {
  // 1. Core State Hooks for Search Filters
  const [searchActivity, setSearchActivity] = useState('');
  const [searchPlace, setSearchPlace] = useState('');
  
  // 2. Core State Hooks for Sorting
  const [sortDate, setSortDate] = useState('');
  const [sortTime, setSortTime] = useState('');
  const [sortPlace, setSortPlace] = useState('');

  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [portalName, setPortalName] = useState<string>("");

  useEffect(() => {
    // Only fetch if records prop is NOT provided
    if (records) {
      setLoading(false);
      return;
    }

    async function loadLogs() {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const token = localStorage.getItem("access_token");
        
        const headers: Record<string, string> = { 
          "Content-Type": "application/json" 
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`${baseUrl}/analytics/recent-activity`, { 
          cache: 'no-store',
          headers 
        });
        
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Authentication required. Please log in.");
          }
          throw new Error("Failed to load tracking analytics stream.");
        }
        
        const data = await res.json();
        setActivities(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    async function loadPortalName() {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const token = localStorage.getItem("access_token");
        
        const headers: Record<string, string> = { 
          "Content-Type": "application/json" 
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`${baseUrl}/auth/me`, { 
          headers 
        });
        
        if (res.ok) {
          const userData = await res.json();
          // Try to get vendor name from plan or vendor data
          if (userData.plan && userData.vendor_id) {
            setPortalName(userData.vendor_id);
          }
        }
      } catch (err) {
        // Silently fail - portal name is optional
      }
    }

    loadLogs();
    loadPortalName();
    const syncInterval = setInterval(loadLogs, 10000);
    return () => clearInterval(syncInterval);
  }, [records]);

  // Fallback sample data using your precise new Date and Time formats (with seconds)
  const defaultRecords: ActivityRecord[] = [
    { id: 1, verificationState: 'Product Added', date: '30-05-2026', time: '10:50:27', place: 'Local, Development', statusType: 'success' },
    { id: 2, verificationState: 'Product Added', date: '29-05-2026', time: '15:01:13', place: 'Local, Development', statusType: 'alert' },
    { id: 3, verificationState: 'Product Added', date: '29-05-2026', time: '13:07:53', place: 'Local, Development', statusType: 'alert' },
    { id: 4, verificationState: 'Product Added', date: '29-05-2026', time: '13:06:37', place: 'Local, Development', statusType: 'alert' },
    { id: 5, verificationState: 'Product Added', date: '29-05-2026', time: '12:07:53', place: 'Local, Development', statusType: 'success' },
    { id: 6, verificationState: 'Product Added', date: '29-05-2026', time: '11:24:44', place: 'Local, Development', statusType: 'success' },
    { id: 7, verificationState: 'Product Added', date: '29-05-2026', time: '11:03:47', place: 'Local, Development', statusType: 'success' },
  ];

  const initialRecords = useMemo(() => {
    if (records) {
      return records;
    }
    if (!loading && !error && activities && activities.length > 0) {
      return activities.map(act => {
        let tsStr = act.timestamp;
        if (typeof tsStr === 'string' && !tsStr.endsWith('Z') && !tsStr.includes('+')) {
          tsStr = tsStr.replace(' ', 'T') + 'Z';
        }
        const dateObj = tsStr ? new Date(tsStr) : new Date();
        const isValidDate = !isNaN(dateObj.getTime());
        
        let dateStr = '30-05-2026';
        let timeStr = '12:00:00';
        if (isValidDate) {
          const day = String(dateObj.getDate()).padStart(2, '0');
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const year = String(dateObj.getFullYear());
          dateStr = `${day}-${month}-${year}`;

          const hours = String(dateObj.getHours()).padStart(2, '0');
          const minutes = String(dateObj.getMinutes()).padStart(2, '0');
          const seconds = String(dateObj.getSeconds()).padStart(2, '0');
          timeStr = `${hours}:${minutes}:${seconds}`;
        }

        const eventType = act.event_type || 'Product Added';
        const displayName = act.batch_name || '';
        const verificationState = displayName ? `${eventType}: ${displayName}` : eventType;

        return {
          id: act.id,
          verificationState: verificationState,
          date: dateStr,
          time: timeStr,
          place: act.location || 'Local, Development',
          statusType: (act.status === 'suspicious' || act.status === 'needs_review') ? 'alert' : 'success'
        };
      });
    }
    return defaultRecords;
  }, [records, activities, loading, error]);

  // Helper utility to format Date + Time into sortable string
  const getSortableValue = (dateStr: string, timeStr: string): string => {
    try {
      const [day, month, year] = dateStr.split('-');
      const [hours, minutes, seconds] = timeStr.split(':');
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}${month}${day}${hours}${minutes}${seconds}`;
    } catch (e) {
      return '';
    }
  };

  // 3. Process Filtering and Sorting dynamically
  const processedRecords = useMemo(() => {
    let result = [...initialRecords];

    // Apply text search filtering
    if (searchActivity) {
      result = result.filter(r => r.verificationState.toLowerCase().includes(searchActivity.toLowerCase()));
    }
    if (searchPlace) {
      result = result.filter(r => r.place.toLowerCase().includes(searchPlace.toLowerCase()));
    }

    // Apply Sorting Priority logic
    if (sortDate) {
      result.sort((a, b) => {
        const [dayA, monthA, yearA] = a.date.split('-');
        const [dayB, monthB, yearB] = b.date.split('-');
        const dateA = `${yearA.length === 2 ? '20' + yearA : yearA}-${monthA}-${dayA}`;
        const dateB = `${yearB.length === 2 ? '20' + yearB : yearB}-${monthB}-${dayB}`;
        return sortDate === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      });
    } else if (sortTime) {
      result.sort((a, b) => {
        const valA = getSortableValue(a.date, a.time);
        const valB = getSortableValue(b.date, b.time);
        return sortTime === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    } else if (sortPlace) {
      result.sort((a, b) => sortPlace === 'asc' 
        ? a.place.localeCompare(b.place) 
        : b.place.localeCompare(a.place)
      );
    } else {
      // DEFAULT sorting: Newest events ALWAYS at the top!
      result.sort((a, b) => {
        const valA = getSortableValue(a.date, a.time);
        const valB = getSortableValue(b.date, b.time);
        return valB.localeCompare(valA); // Descending
      });
    }

    return result;
  }, [initialRecords, searchActivity, searchPlace, sortDate, sortTime, sortPlace]);

  return (
    <div className="w-full flex flex-col gap-4 font-sans">
      
      {/* ================= DYNAMIC HEADER ================= */}
      <div className="w-full">
        <h2 className="text-lg font-bold text-slate-800">
          {portalName ? `Recent Activity for ${portalName}` : "Recent Activity"}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Activity logs scoped to your organization
        </p>
      </div>

      {/* ================= TOP UTILITY FILTER & SEARCH BAR ================= */}
      <div className="w-full bg-white p-4 rounded-xl border border-slate-200/60 shadow-[0_2px_12px_rgb(0,0,0,0.01)] flex flex-wrap gap-3 items-center justify-between">
        
        {/* Left Side: Search Inputs */}
        <div className="flex items-center gap-3 flex-1 min-w-[300px]">
          <div className="relative w-full max-w-xs">
            <input 
              type="text"
              placeholder="Search Activity..."
              value={searchActivity}
              onChange={(e) => setSearchActivity(e.target.value)}
              className="w-full pl-3 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-slate-700 font-medium placeholder-slate-400"
            />
          </div>
          <div className="relative w-full max-w-xs">
            <input 
              type="text"
              placeholder="Search Scanned Place..."
              value={searchPlace}
              onChange={(e) => setSearchPlace(e.target.value)}
              className="w-full pl-3 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-slate-700 font-medium placeholder-slate-400"
            />
          </div>
        </div>

        {/* Right Side: Responsive Dropdown Sorting Tools */}
        <div className="flex items-center gap-2 flex-wrap">
          
          {/* Date Sorter */}
          <select 
            value={sortDate} 
            onChange={(e) => { setSortDate(e.target.value); setSortTime(''); setSortPlace(''); }}
            className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="">Sort by Date</option>
            <option value="asc">Date: Oldest First</option>
            <option value="desc">Date: Latest First</option>
          </select>

          {/* Time Sorter */}
          <select 
            value={sortTime} 
            onChange={(e) => { setSortTime(e.target.value); setSortDate(''); setSortPlace(''); }}
            className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="">Sort by Time</option>
            <option value="asc">Time: Ascending</option>
            <option value="desc">Time: Descending</option>
          </select>

          {/* Place Sorter */}
          <select 
            value={sortPlace} 
            onChange={(e) => { setSortPlace(e.target.value); setSortDate(''); setSortTime(''); }}
            className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="">Sort by Place</option>
            <option value="asc">Place: A to Z</option>
            <option value="desc">Place: Z to A</option>
          </select>

        </div>
      </div>

      {/* ================= DATA TABLE CONTAINER ================= */}
      <div className="w-full bg-white rounded-xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden">
        
        {/* Adjusted to proportional flex layouts for perfect alignment symmetry */}
        <div className="flex px-6 py-4 bg-slate-50/60 border-b border-slate-100 text-[11px] font-bold tracking-wider text-slate-400 uppercase items-center">
          <div className="w-[32%]">Activity</div>
          <div className="w-[20%]">Date</div>
          <div className="w-[20%]">Time</div>
          <div className="w-[28%] text-left">Scanned Place</div>
        </div>

        {/* Dynamic List Rendering Layout */}
        <div className="divide-y divide-slate-100">
          {processedRecords.length > 0 ? (
            processedRecords.map((record) => (
              <div 
                key={record.id} 
                className="flex px-6 py-[18px] items-center text-sm transition-all duration-150 ease-out hover:bg-slate-50/50"
              >
                
                {/* Col 1: Icon + Activity Name (width: 32%) */}
                <div className="w-[32%] flex items-center gap-4">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border shadow-3xs ${
                    record.statusType === 'alert' 
                      ? 'bg-rose-50 border-rose-100/70 text-rose-500' 
                      : record.statusType === 'deleted'
                        ? 'bg-slate-100 border-slate-200 text-slate-500'
                        : 'bg-emerald-50 border-emerald-100/70 text-emerald-500'
                  }`}>
                    {/* Clean QR / Scanner Vector Glyph */}
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                    </svg>
                  </div>
                  <span className="font-semibold text-slate-800 tracking-tight whitespace-nowrap">
                    {record.verificationState}
                  </span>
                </div>

                {/* Col 2: Date Marker (width: 20%) */}
                <div className="w-[20%] text-slate-500 font-medium tracking-tight">
                  {record.date}
                </div>

                {/* Col 3: Real Time Timestamp (width: 20%) */}
                <div className="w-[20%] text-slate-500 font-medium tracking-tight">
                  {record.time}
                </div>

                {/* Col 4: Scanned Location Segment (width: 28% - neatly tucked close to Time) */}
                <div className="w-[28%] text-left text-slate-700 font-semibold tracking-tight truncate">
                  {record.place}
                </div>

              </div>
            ))
          ) : (
            <div className="w-full text-center py-12 text-slate-400 font-medium text-xs">
              No matching activity records found.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
