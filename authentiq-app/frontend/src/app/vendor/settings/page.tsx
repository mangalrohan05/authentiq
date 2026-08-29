'use client';

import React, { useState } from 'react';
import Link from 'next/link';

function Card({ title, subtitle, children, icon, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white p-6 rounded-2xl shadow-lg ${className}`}>
      <header className="mb-5 flex items-center gap-3">
        {icon && <div className="text-indigo-600">{icon}</div>}
        <div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export default function SettingsAndBillingPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [displayName, setDisplayName] = useState('WePitch');
  const [emailAddress, setEmailAddress] = useState('test@gmail.com');
  const [hasChanges, setHasChanges] = useState(false);

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value);
    setHasChanges(true);
  };

  const handleEmailAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmailAddress(e.target.value);
    setHasChanges(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[800px] mx-auto py-8 px-4">
        {/* Back to Dashboard Link */}
        <Link 
          href="/vendor" 
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-indigo-600 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to dashboard
        </Link>

        {/* Card 1: Account & Security Settings */}
        <Card
          title="Account & Security Settings"
          subtitle="Update your profile information and security settings"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
        >
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === 'profile'
                  ? 'border-purple-600 text-gray-900'
                  : 'border-transparent text-gray-500'
              }`}
            >
              Update Profile
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === 'password'
                  ? 'border-purple-600 text-gray-900'
                  : 'border-transparent text-gray-500'
              }`}
            >
              Change Password
            </button>
          </div>

          {/* Profile Section */}
          {activeTab === 'profile' && (
            <div className="flex flex-col items-center">
              {/* Circular Avatar Placeholder */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>

              {/* Form Fields */}
              <div className="w-full grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Display Name</label>
                  <input
                    type="text"
                    className="input-field !text-black w-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    value={displayName}
                    onChange={handleDisplayNameChange}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Email Address</label>
                  <input
                    type="email"
                    className="input-field !text-black w-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    value={emailAddress}
                    onChange={handleEmailAddressChange}
                  />
                </div>
              </div>

              {/* Save Button */}
              <button
                type="button"
                disabled={!hasChanges}
                className={`mt-6 px-6 py-3 font-bold rounded-lg text-sm transition-colors ${
                  hasChanges
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Save Changes
              </button>
            </div>
          )}

          {/* Change Password Section */}
          {activeTab === 'password' && (
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Current Password</label>
                <input
                  type="password"
                  className="input-field !text-black w-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">New Password</label>
                <input
                  type="password"
                  className="input-field !text-black w-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  className="input-field !text-black w-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
          )}
        </Card>

        {/* Card 2: Billing & Usage */}
        <div className="mt-6">
          <Card
            title="Billing & Usage"
            subtitle="Manage your subscription and view usage metrics"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            }
          >
            {/* Current Plan */}
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sm font-semibold text-gray-900">Premium Plan</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-green-100 text-green-800">
                Active
              </span>
            </div>

            {/* Upgrade Plan Section */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center gap-3">
                <button
                  disabled
                  className="px-4 py-2 bg-gray-200 text-gray-400 font-semibold rounded-lg text-sm cursor-not-allowed"
                >
                  Upgrade Plan
                </button>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-purple-100 text-purple-700">
                  Coming Soon
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
