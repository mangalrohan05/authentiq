import React, { useState } from 'react';
import {
  inviteTeamMember,
  createTeamMemberManual,
  removeTeamMember,
  updateTeamMemberRole,
  cancelTeamInvitation,
  verifyPassword,
  type TeamMember,
  type TeamInvitation,
} from '@/services/api';

interface TeamTabProps {
  teamMembers: TeamMember[];
  pendingInvitations: TeamInvitation[];
  teamCount: number;
  pendingInviteCount: number;
  maxUsers: number;
  isInfiniteUsers: boolean;
  planName: string;
  isAdmin: boolean;
  user: any;
  showSuccess: (msg: string) => void;
  refetchPlan: () => Promise<void>;
  fetchData: () => Promise<void>;
  hasFeature: (featureName: string) => boolean;
  plan: any;
}

const UpgradeBanner = ({ featureName, requiredPlan }: { featureName: string; requiredPlan: string }) => (
  <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-3xl p-8 md:p-12 shadow-xl border border-indigo-500/20 max-w-4xl mx-auto overflow-hidden relative">
    <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-50/10 rounded-full blur-3xl" />
    <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-purple-50/10 rounded-full blur-3xl" />

    <div className="relative z-10 space-y-6">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-indigo-200 bg-indigo-500/20 border border-indigo-400/30 rounded-full">
        <svg className="w-3.5 h-3.5 text-yellow-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
        {requiredPlan} Feature
      </span>

      <div className="max-w-2xl">
        <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight md:text-4xl">
          Upgrade to {requiredPlan} Plan
        </h2>
        <p className="text-indigo-200 mt-4 leading-relaxed text-sm md:text-base">
          The <span className="font-semibold text-white">{featureName}</span> module requires a subscription upgrade. Enable state-of-the-art business tools to unlock deep operational insight and automated inventory workflows.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10 max-w-3xl">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Multi-User Collaboration</h4>
            <p className="text-xs text-indigo-200/80 mt-0.5">Invite managers and viewers to collaborate and manage your brand registries.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Role-Based Access Control (RBAC)</h4>
            <p className="text-xs text-indigo-200/80 mt-0.5">Enforce security with granular permissions using Manager vs Viewer roles.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Single Sign-On (SSO)</h4>
            <p className="text-xs text-indigo-200/80 mt-0.5">Secure workspace access with SAML/OIDC and corporate identity providers.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Enterprise Audit Logs</h4>
            <p className="text-xs text-indigo-200/80 mt-0.5">Track system settings changes, member activities, and verification settings history.</p>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <div className="bg-indigo-500/10 border border-indigo-400/20 p-4 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-indigo-300 flex-shrink-0 animate-bounce" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-sm text-indigo-100 font-medium">
            Contact your Authentiq Brand Manager or System Administrator to upgrade to {requiredPlan}.
          </span>
        </div>
      </div>
    </div>
  </div>
);

const AdminRestrictedBanner = ({ featureName }: { featureName: string }) => (
  <div className="bg-gradient-to-br from-red-950 via-slate-900 to-slate-950 text-white rounded-3xl p-8 md:p-12 shadow-xl border border-red-500/20 max-w-4xl mx-auto overflow-hidden relative">
    <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-red-500/10 rounded-full blur-3xl" />
    <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl" />

    <div className="relative z-10 space-y-6">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-red-200 bg-red-500/20 border border-red-400/30 rounded-full">
        <svg className="w-3.5 h-3.5 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        Feature Restricted
      </span>

      <div className="max-w-2xl">
        <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight md:text-4xl">
          Access Restricted by Admin
        </h2>
        <p className="text-red-200 mt-4 leading-relaxed text-sm md:text-base">
          Your System Administrator has restricted access to the <span className="font-semibold text-white">{featureName}</span> feature for your account. Please contact your administrator if you believe this is in error.
        </p>
      </div>

      <div className="pt-6">
        <div className="bg-red-500/10 border border-red-400/20 p-4 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-red-300 flex-shrink-0 animate-bounce" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-sm text-red-100 font-medium">
            Contact your Authentiq Brand Manager or System Administrator to request access.
          </span>
        </div>
      </div>
    </div>
  </div>
);

export default function TeamTab({
  teamMembers,
  pendingInvitations,
  teamCount,
  pendingInviteCount,
  maxUsers,
  isInfiniteUsers,
  planName,
  isAdmin,
  user,
  showSuccess,
  refetchPlan,
  fetchData,
  hasFeature,
  plan,
}: TeamTabProps) {
  const isTeamEnabled = hasFeature('sso');
  const isPlanProhibiting = planName !== 'Enterprise';

  // Modal toggle and field states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Viewer');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [isCreateMemberModalOpen, setIsCreateMemberModalOpen] = useState(false);
  const [createMemberName, setCreateMemberName] = useState('');
  const [createMemberEmail, setCreateMemberEmail] = useState('');
  const [createMemberPassword, setCreateMemberPassword] = useState('');
  const [createMemberConfirmPassword, setCreateMemberConfirmPassword] = useState('');
  const [createMemberRole, setCreateMemberRole] = useState('Viewer');
  const [createMemberError, setCreateMemberError] = useState<string | null>(null);
  const [creatingMember, setCreatingMember] = useState(false);

  // Password verification modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requirePasswordVerification = (action: () => void) => {
    setPendingAction(() => action);
    setPasswordInput('');
    setPasswordError(null);
    setShowVerifyPassword(false);
    setIsPasswordModalOpen(true);
  };

  const handlePasswordVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    try {
      await verifyPassword(passwordInput);
      setIsPasswordModalOpen(false);
      setPasswordInput('');
      setShowVerifyPassword(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } catch (err: any) {
      setPasswordError(err.message || 'Incorrect password');
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      await inviteTeamMember(inviteEmail.trim(), inviteRole);
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('Viewer');
      showSuccess(`Invitation sent successfully to ${inviteEmail}`);
      await fetchData();
      try { await refetchPlan(); } catch { }
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleCreateMemberManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMemberError(null);
    if (createMemberPassword !== createMemberConfirmPassword) {
      setCreateMemberError('Passwords do not match');
      return;
    }
    setCreatingMember(true);
    try {
      await createTeamMemberManual({
        name: createMemberName.trim(),
        email: createMemberEmail.trim().toLowerCase(),
        password: createMemberPassword,
        role: createMemberRole,
      });
      setIsCreateMemberModalOpen(false);
      setCreateMemberName('');
      setCreateMemberEmail('');
      setCreateMemberPassword('');
      setCreateMemberConfirmPassword('');
      setCreateMemberRole('Viewer');
      showSuccess(`Team member created and confirmation email sent to ${createMemberEmail}`);
      await fetchData();
      try { await refetchPlan(); } catch { }
    } catch (err: any) {
      setCreateMemberError(err.message || 'Failed to create team member');
    } finally {
      setCreatingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string, email: string) => {
    requirePasswordVerification(async () => {
      if (!window.confirm(`Are you sure you want to remove ${email} from the workspace?`)) return;
      try {
        await removeTeamMember(userId);
        showSuccess(`Successfully removed ${email} from team`);
        await fetchData();
        try { await refetchPlan(); } catch { }
      } catch (err: any) {
        alert(err.message || 'Failed to remove team member');
      }
    });
  };

  const handleRoleUpdate = async (userId: string, currentEmail: string, newRole: string) => {
    requirePasswordVerification(async () => {
      try {
        await updateTeamMemberRole(userId, newRole);
        showSuccess(`Updated role to ${newRole} for ${currentEmail}`);
        await fetchData();
      } catch (err: any) {
        alert(err.message || 'Failed to update user role');
      }
    });
  };

  const handleCancelInvite = async (inviteId: string, email: string) => {
    requirePasswordVerification(async () => {
      if (!window.confirm(`Cancel pending invitation for ${email}?`)) return;
      try {
        await cancelTeamInvitation(inviteId);
        showSuccess(`Cancelled invitation for ${email}`);
        await fetchData();
        try { await refetchPlan(); } catch { }
      } catch (err: any) {
        alert(err.message || 'Failed to cancel invitation');
      }
    });
  };

  if (!isTeamEnabled) {
    return (
      <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in duration-355">
        <header className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Team Management</h2>
          <p className="text-sm font-medium text-gray-500 mt-1">Manage team members and invite new users to your workspace.</p>
        </header>
        {isPlanProhibiting ? (
          <UpgradeBanner featureName="Team Members & SSO" requiredPlan="Enterprise" />
        ) : (
          <AdminRestrictedBanner featureName="Team Members & SSO" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in duration-355">
      {/* Resource Usage Banner */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Current Users: {teamMembers.length} / Max Limit: {isInfiniteUsers ? '∞' : maxUsers} ({planName} Plan)
            </p>
          </div>
        </div>
        {teamMembers.length >= maxUsers && !isInfiniteUsers && (
          <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-medium">
            Limit Reached
          </div>
        )}
      </div>

      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Team Management</h2>
          <p className="text-sm font-medium text-gray-500 mt-1">Manage team members and invite new users to your workspace.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {isAdmin && (
            <button
              onClick={() => {
                setCreateMemberError(null);
                setCreateMemberName('');
                setCreateMemberEmail('');
                setCreateMemberPassword('');
                setCreateMemberConfirmPassword('');
                setIsCreateMemberModalOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-slate-905 bg-slate-900 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-black transition-colors shadow-sm text-sm cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235A10.137 10.137 0 0110 18c2.23 0 4.298.718 6 1.932M10 11.25a3.375 3.375 0 100-6.75 3.375 3.375 0 000 6.75z" />
              </svg>
              Create Member
            </button>
          )}
          <button
            onClick={() => {
              setInviteError(null);
              setIsInviteModalOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-500 transition-colors shadow-sm text-sm cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invite Team Member
          </button>
        </div>
      </header>

      {/* Team Members List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-900">Active Members ({teamMembers.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/30">
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Name</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Role</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {teamMembers.map((member) => {
                const isSelf = member.email === user?.email;
                const userIsAdmin = user?.role === 'Administrator' || user?.role === 'vendor';

                return (
                  <tr key={member.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4 font-semibold text-gray-900">
                      {member.name}{' '}
                      {isSelf && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-md ml-1.5">
                          You
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-500">{member.email}</td>
                    <td className="px-5 py-4">
                      {userIsAdmin && !isSelf ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleUpdate(member.id, member.email, e.target.value)}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="Manager">Manager</option>
                          <option value="Viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                          {member.role}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{member.status}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {userIsAdmin && !isSelf ? (
                        <button
                          onClick={() => handleRemoveMember(member.id, member.email)}
                          className="text-xs font-bold text-red-650 hover:text-red-500 text-red-600 px-2 py-1 rounded transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-900">Pending Invitations ({pendingInviteCount})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/30">
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Email</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Invited Role</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Invited By</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date Sent</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {pendingInvitations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400 font-medium">No pending invitations.</td>
                </tr>
              ) : (
                pendingInvitations.map((invite) => (
                  <tr key={invite.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4 text-gray-900 font-medium">{invite.email}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-yellow-50 text-yellow-700 border border-yellow-200">{invite.role}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-500">{invite.invited_by}</td>
                    <td className="px-5 py-4 text-gray-400 font-mono text-xs">{new Date(invite.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-4 text-right">
                      {(isAdmin || (user?.role === 'Manager' && invite.invited_by_role === 'Manager')) ? (
                        <button
                          onClick={() => handleCancelInvite(invite.id, invite.email)}
                          className="text-xs font-bold text-slate-500 hover:text-red-500 px-2 py-1 rounded transition-colors cursor-pointer"
                        >
                          Cancel invite
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TEAM INVITATION MODAL */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 relative p-6 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsInviteModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Invite Team Member</h2>
            <p className="text-xs font-medium text-slate-400 mt-1">Send an invitation to join your workspace.</p>

            {inviteError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs font-semibold animate-in fade-in">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInviteMember} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@brand.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Assigned Role</label>
                {user?.role === 'Manager' ? (
                  <div className="space-y-1">
                    <select
                      disabled
                      value="Viewer"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500"
                    >
                      <option value="Viewer">Viewer (Read-Only)</option>
                    </select>
                    <p className="text-[10px] text-amber-600 font-semibold mt-1">Managers are restricted to inviting Viewers only.</p>
                  </div>
                ) : (
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800"
                  >
                    <option value="Manager">Manager (Operations)</option>
                    <option value="Viewer">Viewer (Read-Only)</option>
                  </select>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {inviting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TEAM MEMBER MANUAL MODAL */}
      {isCreateMemberModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 relative p-6 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsCreateMemberModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Create Team Member</h2>
            <p className="text-xs font-medium text-slate-400 mt-1">Manually register a user and set their credentials.</p>

            {createMemberError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs font-semibold animate-in fade-in">
                {createMemberError}
              </div>
            )}

            <form onSubmit={handleCreateMemberManual} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={createMemberName}
                  onChange={(e) => setCreateMemberName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={createMemberEmail}
                  onChange={(e) => setCreateMemberEmail(e.target.value)}
                  placeholder="teammate@brand.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={createMemberPassword}
                  onChange={(e) => setCreateMemberPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={createMemberConfirmPassword}
                  onChange={(e) => setCreateMemberConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Assigned Role</label>
                <select
                  value={createMemberRole}
                  onChange={(e) => setCreateMemberRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800"
                >
                  <option value="Manager">Manager (Operations)</option>
                  <option value="Viewer">Viewer (Read-Only)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateMemberModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMember}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-black disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {creatingMember ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Create Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PASSWORD VERIFICATION MODAL */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 relative p-6 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsPasswordModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Verify Your Password</h2>
            <p className="text-xs font-medium text-slate-400 mt-1">Enter your password to confirm this critical action.</p>

            {passwordError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs font-semibold animate-in fade-in">
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordVerification} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showVerifyPassword ? 'text' : 'password'}
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-3 pr-10 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-slate-400 text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showVerifyPassword ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Verify
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
