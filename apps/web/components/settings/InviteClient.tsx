'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  Send,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
  ChevronDown,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ── Types ──────────────────────────────────────────────────────────────────

type InviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
type SystemRole   = 'ADMIN' | 'POD_LEAD' | 'CSM' | 'EMPLOYEE';

interface Invite {
  id: string;
  email: string;
  system_role: SystemRole;
  status: InviteStatus;
  note: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  invited_by_name: string;
  is_expired: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<SystemRole, string> = {
  ADMIN:    'Admin',
  POD_LEAD: 'POD Lead',
  CSM:      'CSM',
  EMPLOYEE: 'Employee',
};

const ROLE_COLORS: Record<SystemRole, string> = {
  ADMIN:    'bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800',
  POD_LEAD: 'bg-violet-50 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-100 dark:border-violet-800',
  CSM:      'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800',
  EMPLOYEE: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

function StatusBadge({ status, isExpired }: { status: InviteStatus; isExpired: boolean }) {
  const effectiveStatus = isExpired && status === 'PENDING' ? 'EXPIRED' : status;
  const map: Record<string, { label: string; cls: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
    PENDING:  { label: 'Pending',  cls: 'bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800',  Icon: Clock },
    ACCEPTED: { label: 'Accepted', cls: 'bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800',  Icon: CheckCircle2 },
    EXPIRED:  { label: 'Expired',  cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',    Icon: AlertCircle },
    REVOKED:  { label: 'Revoked',  cls: 'bg-red-50 dark:bg-red-900/40 text-red-500 dark:text-red-400 border-red-100 dark:border-red-800',        Icon: Ban },
  };
  const { label, cls, Icon } = map[effectiveStatus] ?? map.PENDING;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border', cls)}>
      <Icon size={10} />
      {label}
    </span>
  );
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Main Component ─────────────────────────────────────────────────────────

export function InviteClient() {
  const qc = useQueryClient();
  const [email, setEmail]   = useState('');
  const [role, setRole]     = useState<SystemRole>('EMPLOYEE');
  const [note, setNote]     = useState('');
  const [showNote, setShowNote] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState<InviteStatus | 'ALL'>('ALL');

  // ── Fetch invites ──────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<{ data: Invite[] }>({
    queryKey: ['invites'],
    queryFn: () => fetch('/api/v1/invites').then((r) => r.json()),
    staleTime: 30_000,
  });

  const invites: Invite[] = data?.data ?? [];

  const filtered = statusFilter === 'ALL'
    ? invites
    : invites.filter((i) => {
        const eff = i.is_expired && i.status === 'PENDING' ? 'EXPIRED' : i.status;
        return eff === statusFilter;
      });

  // ── Create invite ──────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: { email: string; system_role: string; note?: string }) =>
      fetch('/api/v1/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? 'Failed to send invite');
        return json;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      setEmail('');
      setNote('');
      setShowNote(false);
      setFormError('');
      setSuccessMsg('Invite sent successfully!');
      setTimeout(() => setSuccessMsg(''), 3500);
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  // ── Resend / Revoke ────────────────────────────────────────────────────
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'resend' | 'revoke' }) =>
      fetch(`/api/v1/invites/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? 'Action failed');
        return json;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });

  // ── Submit ─────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return setFormError('Email is required');
    createMutation.mutate({ email: trimmed, system_role: role, note: note.trim() || undefined });
  }

  // ── Status counts ──────────────────────────────────────────────────────
  const counts = invites.reduce(
    (acc, i) => {
      const eff = (i.is_expired && i.status === 'PENDING' ? 'EXPIRED' : i.status) as InviteStatus;
      acc[eff] = (acc[eff] ?? 0) + 1;
      acc.ALL += 1;
      return acc;
    },
    { ALL: 0, PENDING: 0, ACCEPTED: 0, EXPIRED: 0, REVOKED: 0 } as Record<string, number>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6 items-start">

      {/* ══ LEFT COLUMN ══════════════════════════════════════════════════ */}
      <div className="space-y-6 xl:sticky xl:top-6">
        {/* ── Send invite card ──────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <UserPlus size={16} className="text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Invite a team member</h2>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFormError(''); }}
                placeholder="name@devxlabs.ai"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Role</label>
              <div className="relative">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as SystemRole)}
                  className="w-full appearance-none border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="CSM">CSM</option>
                  <option value="POD_LEAD">POD Lead</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Optional note toggle */}
            <div>
              {!showNote ? (
                <button
                  type="button"
                  onClick={() => setShowNote(true)}
                  className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                >
                  + Add a note (optional)
                </button>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Note for recipient</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. You're being added as a CSM for the new APAC pod."
                    rows={2}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                  />
                </div>
              )}
            </div>

            {/* Feedback */}
            {formError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle size={12} /> {formError}
              </p>
            )}
            {successMsg && (
              <p className="text-xs text-green-600 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> {successMsg}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-gray-400 leading-tight">
                Valid for <span className="font-semibold text-gray-600 dark:text-gray-400">7 days</span>.<br />
                Must sign in with Google.
              </p>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                <Send size={13} />
                {createMutation.isPending ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </form>
        </div>

        {/* ── RBAC info box ─────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <Shield size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Role permissions reference</h2>
          </div>
          <div className="px-5 py-4 space-y-3 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex gap-3">
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 h-fit w-[72px] text-center', ROLE_COLORS.ADMIN)}>Admin</span>
              <span>Full access — manage employees, pods, projects, allocations across all sprints. Can access Admin DB and Settings.</span>
            </div>
            <div className="flex gap-3">
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 h-fit w-[72px] text-center', ROLE_COLORS.POD_LEAD)}>POD Lead</span>
              <span>View and manage allocations for their own pod members. Current and next sprint only.</span>
            </div>
            <div className="flex gap-3">
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 h-fit w-[72px] text-center', ROLE_COLORS.CSM)}>CSM</span>
              <span>Read access to all data. Can write allocations for current and next sprint.</span>
            </div>
            <div className="flex gap-3">
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 h-fit w-[72px] text-center', ROLE_COLORS.EMPLOYEE)}>Employee</span>
              <span>Dashboard view only. Can see their own allocation summary.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══ RIGHT COLUMN — Invite history ════════════════════════════════ */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden h-fit">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Invite history
          </h2>

          {/* Status filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['ALL', 'PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'text-xs font-medium px-2.5 py-1 rounded-md transition-colors',
                  statusFilter === s
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                {counts[s] > 0 && (
                  <span className={cn('ml-1 text-[10px]', statusFilter === s ? 'text-gray-300' : 'text-gray-400')}>
                    {counts[s]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {statusFilter === 'ALL' ? 'No invites sent yet.' : `No ${statusFilter.toLowerCase()} invites.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Email
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Role
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Sent
                </th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Expiry
                </th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((inv) => {
                const isPending = inv.status === 'PENDING' && !inv.is_expired;
                const canResend = inv.status === 'PENDING' || inv.is_expired;
                const canRevoke = isPending;
                const isActing  = actionMutation.isPending;

                return (
                  <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    {/* Email */}
                    <td className="px-5 py-3">
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{inv.email}</div>
                      {inv.note && (
                        <div className="text-[10px] text-gray-400 mt-0.5 max-w-[240px] truncate" title={inv.note}>
                          {inv.note}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Invited by {inv.invited_by_name}
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                        ROLE_COLORS[inv.system_role]
                      )}>
                        {ROLE_LABELS[inv.system_role]}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={inv.status} isExpired={inv.is_expired} />
                      {inv.accepted_at && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(inv.accepted_at)}</div>
                      )}
                    </td>

                    {/* Sent date */}
                    <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                      {fmtDate(inv.created_at)}
                    </td>

                    {/* Expiry */}
                    <td className="px-4 py-3 text-center text-xs">
                      {inv.status === 'ACCEPTED' ? (
                        <span className="text-gray-400">—</span>
                      ) : inv.status === 'REVOKED' ? (
                        <span className="text-gray-400">Revoked {inv.revoked_at ? fmtDate(inv.revoked_at) : ''}</span>
                      ) : (
                        <span className={cn(
                          'font-medium',
                          inv.is_expired ? 'text-gray-400' : 'text-amber-600'
                        )}>
                          {timeLeft(inv.expires_at)}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canResend && (
                          <button
                            disabled={isActing}
                            onClick={() => actionMutation.mutate({ id: inv.id, action: 'resend' })}
                            title="Resend invite (reset 7-day expiry)"
                            className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw size={11} />
                            Resend
                          </button>
                        )}
                        {canRevoke && (
                          <button
                            disabled={isActing}
                            onClick={() => {
                              if (confirm(`Revoke invite for ${inv.email}?`)) {
                                actionMutation.mutate({ id: inv.id, action: 'revoke' });
                              }
                            }}
                            title="Revoke this invite"
                            className="flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                          >
                            <XCircle size={11} />
                            Revoke
                          </button>
                        )}
                        {!canResend && !canRevoke && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
