'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronDown, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { readUrlParams, useSyncUrlParams } from '@/lib/hooks/useFilterParams';
import { cn } from '@/lib/utils/cn';
import { ConfirmDialog } from './ConfirmDialog';
import { ExportDropdown } from './ExportDropdown';

const BulkImportModal = dynamic(
  () => import('../import/BulkImportModal').then((m) => ({ default: m.BulkImportModal })),
  { ssr: false },
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  deal_name: string;
  zoho_deal_id: string | null;
  revenue_cents: number | null;
  status: string;
  billing_model: string;
  devx_pillar: string;
  start_date: string;
  end_date: string | null;
  sow_url: string | null;
  expected_compute_cost_cents: number;
  show_in_allocations: boolean;
  account?: { id: string; brand_name: string } | null;
  project_manager?: { id: string; name: string } | null;
  growth_consultant?: { id: string; name: string } | null;
  practice_poc?: { id: string; name: string } | null;
}

interface EmployeeOption {
  id: string;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['UPCOMING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const BILLING_OPTIONS = ['TIME_AND_MATERIAL', 'FIXED_PRICE', 'RETAINER', 'MILESTONE_BASED'];
const PILLAR_OPTIONS = ['CUSTOMER_INTERACTION', 'MARKETING_AUTOMATION', 'AI_OPS', 'ENTERPRISE_ARCHITECTURE'];

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  ACTIVE: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  ON_HOLD: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
  COMPLETED: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  CANCELLED: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
};

const PILLAR_LABELS: Record<string, string> = {
  CUSTOMER_INTERACTION: 'Customer Interaction',
  MARKETING_AUTOMATION: 'Marketing Automation',
  AI_OPS: 'AI Ops',
  ENTERPRISE_ARCHITECTURE: 'Enterprise Architecture',
};

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

function EditDrawer({
  project,
  employees,
  pmEmployees,
  gcEmployees,
  accounts,
  onClose,
  onSaved,
}: {
  project: Project;
  employees: EmployeeOption[];
  pmEmployees: EmployeeOption[];
  gcEmployees: EmployeeOption[];
  accounts: { id: string; brand_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true));
  }, []);
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, 350);
  }, [onClose]);

  const [form, setForm] = useState({
    deal_name: project.deal_name,
    account_id: project.account?.id ?? '',
    status: project.status,
    billing_model: project.billing_model,
    devx_pillar: project.devx_pillar,
    start_date: project.start_date ? project.start_date.slice(0, 10) : '',
    end_date: project.end_date ? project.end_date.slice(0, 10) : '',
    sow_url: project.sow_url ?? '',
    expected_compute_cost_cents: project.expected_compute_cost_cents,
    project_manager_id: project.project_manager?.id ?? '',
    growth_consultant_id: project.growth_consultant?.id ?? '',
    practice_poc_id: project.practice_poc?.id ?? '',
    show_in_allocations: project.show_in_allocations ?? true,
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        deal_name: form.deal_name.trim(),
        account_id: form.account_id || undefined,
        status: form.status,
        billing_model: form.billing_model,
        devx_pillar: form.devx_pillar,
        start_date: form.start_date || undefined,
        end_date: form.end_date || null,
        sow_url: form.sow_url || null,
        expected_compute_cost_cents: form.expected_compute_cost_cents,
        project_manager_id: form.project_manager_id || null,
        growth_consultant_id: form.growth_consultant_id || null,
        practice_poc_id: form.practice_poc_id || null,
        show_in_allocations: form.show_in_allocations,
      };
      const res = await fetch(`/api/v1/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
    },
    onSuccess: () => {
      // Optimistic: patch the cached list immediately so the table updates instantly
      qc.setQueryData(['admin-projects'], (old: { data: Project[] } | undefined) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((p) =>
            p.id === project.id
              ? {
                  ...p,
                  deal_name: form.deal_name.trim(),
                  account: accounts.find((a) => a.id === form.account_id) ?? p.account,
                  status: form.status,
                  billing_model: form.billing_model,
                  devx_pillar: form.devx_pillar,
                  start_date: form.start_date || p.start_date,
                  end_date: form.end_date || null,
                  sow_url: form.sow_url || null,
                  expected_compute_cost_cents: form.expected_compute_cost_cents,
                  show_in_allocations: form.show_in_allocations,
                  project_manager: pmEmployees.find((e) => e.id === form.project_manager_id) ?? null,
                  growth_consultant: gcEmployees.find((e) => e.id === form.growth_consultant_id) ?? null,
                  practice_poc: employees.find((e) => e.id === form.practice_poc_id) ?? null,
                }
              : p,
          ),
        };
      });
      // Background refetch for full consistency
      qc.invalidateQueries({ queryKey: ['admin-projects'] });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
      setShowConfirm(false);
    },
  });

  return (
    <>
      <div
        className={cn('fixed inset-0 z-40 transition-colors duration-350', isOpen ? 'bg-black/20' : 'bg-black/0')}
        onClick={handleClose}
      />
      <div
        className={cn(
          'fixed right-0 top-0 h-full z-50 w-full sm:w-[460px] bg-white dark:bg-gray-900 shadow-2xl flex flex-col transition-transform duration-350 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Project</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{project.deal_name}</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Deal Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Deal Name</label>
            <input
              type="text"
              value={form.deal_name}
              onChange={(e) => setForm((f) => ({ ...f, deal_name: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Account */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Account</label>
            <select
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— Select account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.brand_name}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Visible */}
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">In Allocations</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Toggle off to hide this project from Projects & Allocations
              </div>
              {!form.show_in_allocations && project.show_in_allocations && (
                <div className="text-xs text-red-500 dark:text-red-400 mt-1 font-medium">
                  All allocations for this project will be removed on save.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, show_in_allocations: !f.show_in_allocations }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.show_in_allocations ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 shadow transition-transform ${form.show_in_allocations ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {/* Billing Model */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Billing Model</label>
            <select
              value={form.billing_model}
              onChange={(e) => setForm((f) => ({ ...f, billing_model: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {BILLING_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* devx Pillar */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">devx Pillar</label>
            <select
              value={form.devx_pillar}
              onChange={(e) => setForm((f) => ({ ...f, devx_pillar: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {PILLAR_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PILLAR_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Start / End dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              />
            </div>
          </div>

          {/* Drive Link */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Drive Link</label>
            <input
              type="url"
              value={form.sow_url}
              onChange={(e) => setForm((f) => ({ ...f, sow_url: e.target.value }))}
              placeholder="https://drive.google.com/…"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {/* Expected compute cost */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Expected Compute Cost (₹)
            </label>
            <input
              type="number"
              min={0}
              value={form.expected_compute_cost_cents / 100}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expected_compute_cost_cents: Math.round(parseFloat(e.target.value || '0') * 100),
                }))
              }
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Project Manager */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Project Manager</label>
            <select
              value={form.project_manager_id}
              onChange={(e) => setForm((f) => ({ ...f, project_manager_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— None —</option>
              {pmEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {/* Growth Consultant */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Growth Consultant
            </label>
            <select
              value={form.growth_consultant_id}
              onChange={(e) => setForm((f) => ({ ...f, growth_consultant_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— None —</option>
              {gcEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {/* Practice POC */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Practice POC</label>
            <select
              value={form.practice_poc_id}
              onChange={(e) => setForm((f) => ({ ...f, practice_poc_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— None —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Save changes
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title={`Update "${project.deal_name}"?`}
          description="This will immediately update the project record in the database."
          confirmLabel="Save"
          confirmVariant="primary"
          isLoading={saveMutation.isPending}
          onConfirm={() => saveMutation.mutate()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Create Drawer ───────────────────────────────────────────────────────────

function CreateDrawer({
  employees,
  pmEmployees,
  gcEmployees,
  accounts,
  onClose,
  onSaved,
}: {
  employees: EmployeeOption[];
  pmEmployees: EmployeeOption[];
  gcEmployees: EmployeeOption[];
  accounts: { id: string; brand_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true));
  }, []);
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, 350);
  }, [onClose]);

  const [form, setForm] = useState({
    deal_name: '',
    account_id: '',
    new_account_name: '',
    status: 'UPCOMING',
    billing_model: 'TIME_AND_MATERIAL',
    devx_pillar: 'AI_OPS',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    sow_url: '',
    expected_compute_cost_cents: 0,
    project_manager_id: '',
    growth_consultant_id: '',
    practice_poc_id: '',
    show_in_allocations: true,
  });
  const [useNewAccount, setUseNewAccount] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        deal_name: form.deal_name,
        account_id: useNewAccount ? undefined : form.account_id || undefined,
        new_account_name: useNewAccount ? form.new_account_name : undefined,
        status: form.status,
        billing_model: form.billing_model,
        devx_pillar: form.devx_pillar,
        start_date: form.start_date || undefined,
        end_date: form.end_date || null,
        sow_url: form.sow_url || null,
        expected_compute_cost_cents: form.expected_compute_cost_cents,
        project_manager_id: form.project_manager_id || null,
        growth_consultant_id: form.growth_consultant_id || null,
        practice_poc_id: form.practice_poc_id || null,
        show_in_allocations: form.show_in_allocations,
      };
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Create failed');
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
      setShowConfirm(false);
    },
  });

  const canSave = form.deal_name.trim() && (useNewAccount ? form.new_account_name.trim() : form.account_id);

  return (
    <>
      <div
        className={cn('fixed inset-0 z-40 transition-colors duration-350', isOpen ? 'bg-black/20' : 'bg-black/0')}
        onClick={handleClose}
      />
      <div
        className={cn(
          'fixed right-0 top-0 h-full z-50 w-full sm:w-[460px] bg-white dark:bg-gray-900 shadow-2xl flex flex-col transition-transform duration-350 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add Project</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Deal Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Deal Name *</label>
            <input
              type="text"
              value={form.deal_name}
              onChange={(e) => setForm((f) => ({ ...f, deal_name: e.target.value }))}
              placeholder="e.g. AWS Migration Phase 2"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {/* Account */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Account *</label>
              <button
                type="button"
                onClick={() => setUseNewAccount((v) => !v)}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
              >
                {useNewAccount ? 'Select existing' : '+ New account'}
              </button>
            </div>
            {useNewAccount ? (
              <input
                type="text"
                value={form.new_account_name}
                onChange={(e) => setForm((f) => ({ ...f, new_account_name: e.target.value }))}
                placeholder="New account name"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              />
            ) : (
              <select
                value={form.account_id}
                onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
              >
                <option value="">— Select account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.brand_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Visible */}
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">In Allocations</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Toggle off to hide from Projects & Allocations
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, show_in_allocations: !f.show_in_allocations }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.show_in_allocations ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 shadow transition-transform ${form.show_in_allocations ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {/* Billing Model */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Billing Model</label>
            <select
              value={form.billing_model}
              onChange={(e) => setForm((f) => ({ ...f, billing_model: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {BILLING_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* devx Pillar */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">devx Pillar</label>
            <select
              value={form.devx_pillar}
              onChange={(e) => setForm((f) => ({ ...f, devx_pillar: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {PILLAR_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PILLAR_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Start / End dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              />
            </div>
          </div>

          {/* Drive Link */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Drive Link</label>
            <input
              type="url"
              value={form.sow_url}
              onChange={(e) => setForm((f) => ({ ...f, sow_url: e.target.value }))}
              placeholder="https://drive.google.com/…"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {/* Expected compute cost */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Expected Compute Cost (₹)
            </label>
            <input
              type="number"
              min={0}
              value={form.expected_compute_cost_cents / 100}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expected_compute_cost_cents: Math.round(parseFloat(e.target.value || '0') * 100),
                }))
              }
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Project Manager */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Project Manager</label>
            <select
              value={form.project_manager_id}
              onChange={(e) => setForm((f) => ({ ...f, project_manager_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— None —</option>
              {pmEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {/* Growth Consultant */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Growth Consultant
            </label>
            <select
              value={form.growth_consultant_id}
              onChange={(e) => setForm((f) => ({ ...f, growth_consultant_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— None —</option>
              {gcEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {/* Practice POC */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Practice POC</label>
            <select
              value={form.practice_poc_id}
              onChange={(e) => setForm((f) => ({ ...f, practice_poc_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— None —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Create Project
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Create this project?"
          description={`This will create "${form.deal_name}" in the database.`}
          confirmLabel="Create"
          confirmVariant="primary"
          isLoading={saveMutation.isPending}
          onConfirm={() => saveMutation.mutate()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function AdminProjectsTab({
  serverParams,
}: {
  serverParams?: Record<string, string | string[] | undefined>;
} = {}) {
  const qc = useQueryClient();

  const urlDefaults = { search: '', status: 'ACTIVE', visible: 'visible', csm: '', page: 1 };
  const init = readUrlParams(urlDefaults, serverParams);
  const [search, setSearch] = useState(init.search);
  const [statusFilter, setStatusFilter] = useState(init.status);
  const [visibleFilter, setVisibleFilter] = useState(init.visible);
  const [csmFilter, setCsmFilter] = useState(init.csm);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toggleOffProject, setToggleOffProject] = useState<Project | null>(null);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(init.page);
  const PAGE_SIZE = 25;
  useSyncUrlParams({ search, status: statusFilter, visible: visibleFilter, csm: csmFilter, page }, urlDefaults);

  const { data: projData, isLoading } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: () => fetch('/api/v1/projects?include_hidden=true', { cache: 'no-store' }).then((r) => r.json()),
    staleTime: 120_000,
  });
  const { data: empData } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: () => fetch('/api/v1/employees?status=ACTIVE').then((r) => r.json()),
    staleTime: 120_000,
  });
  const { data: pmData } = useQuery({
    queryKey: ['admin-employees-pm'],
    queryFn: () => fetch('/api/v1/employees?is_pm=true&status=ACTIVE').then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: gcData } = useQuery({
    queryKey: ['admin-employees-gc'],
    queryFn: () => fetch('/api/v1/employees?function_names=Growth&status=ACTIVE').then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: accountData } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => fetch('/api/v1/accounts').then((r) => r.json()),
    staleTime: 300_000,
  });

  const projects: Project[] = projData?.data ?? [];
  const accounts: { id: string; brand_name: string }[] = accountData?.data ?? [];
  const employees: EmployeeOption[] = (empData?.data ?? []).map((e: { id: string; name: string }) => ({
    id: e.id,
    name: e.name,
  }));
  const pmEmployees: EmployeeOption[] = (pmData?.data ?? []).map((e: { id: string; name: string }) => ({
    id: e.id,
    name: e.name,
  }));
  const gcEmployees: EmployeeOption[] = (gcData?.data ?? []).map((e: { id: string; name: string }) => ({
    id: e.id,
    name: e.name,
  }));

  const filtered = useMemo(() => {
    let list = projects;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.deal_name.toLowerCase().includes(q) ||
          (p.account?.brand_name ?? '').toLowerCase().includes(q) ||
          (p.zoho_deal_id ?? '').toLowerCase().includes(q),
      );
    }
    if (statusFilter) list = list.filter((p) => p.status === statusFilter);
    if (visibleFilter === 'visible') list = list.filter((p) => p.show_in_allocations);
    if (visibleFilter === 'hidden') list = list.filter((p) => !p.show_in_allocations);
    if (csmFilter === '__none__') list = list.filter((p) => !p.project_manager);
    else if (csmFilter) list = list.filter((p) => p.project_manager?.id === csmFilter);
    return list;
  }, [projects, search, statusFilter, visibleFilter, csmFilter]);

  // Track page across filter changes: save before filtering, restore when cleared
  const defaultFilterKey = '|||';
  const filterKey = `${search}|${statusFilter}|${visibleFilter}|${csmFilter}`;
  const prevFilterKey = useRef(filterKey);
  const preFilterPage = useRef(1);
  if (prevFilterKey.current !== filterKey) {
    const wasDefault = prevFilterKey.current === defaultFilterKey;
    const isDefault = filterKey === defaultFilterKey;
    prevFilterKey.current = filterKey;
    if (!isDefault && wasDefault) {
      preFilterPage.current = page;
      if (page !== 1) setPage(1);
    } else if (isDefault) {
      setPage(preFilterPage.current);
    } else {
      if (page !== 1) setPage(1);
    }
  }

  const paginatedRows = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const exportColumns = [
    { header: 'Deal Name', key: 'deal_name' },
    { header: 'Account', key: 'account' },
    { header: 'Status', key: 'status' },
    { header: 'Billing Model', key: 'billing_model' },
    { header: 'Pillar', key: 'pillar' },
    { header: 'Start Date', key: 'start_date' },
    { header: 'End Date', key: 'end_date' },
    { header: 'Revenue', key: 'revenue' },
    { header: 'PM', key: 'pm' },
    { header: 'Growth Consultant', key: 'gc' },
    { header: 'Visible', key: 'visible' },
  ];

  const exportRows = useMemo(
    () =>
      filtered.map((p) => ({
        deal_name: p.deal_name,
        account: p.account?.brand_name ?? '',
        status: p.status,
        billing_model: p.billing_model.replace(/_/g, ' '),
        pillar: PILLAR_LABELS[p.devx_pillar] ?? p.devx_pillar,
        start_date: p.start_date ? format(new Date(p.start_date), 'MMM d, yyyy') : '',
        end_date: p.end_date ? format(new Date(p.end_date), 'MMM d, yyyy') : '',
        revenue: p.revenue_cents != null ? (p.revenue_cents / 100).toFixed(2) : '',
        pm: p.project_manager?.name ?? '',
        gc: p.growth_consultant?.name ?? '',
        visible: p.show_in_allocations ? 'Yes' : 'No',
      })),
    [filtered],
  );

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    setIsDeleting(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/v1/projects/${id}`, { method: 'DELETE' }).then((r) => r.json())),
    );
    const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
    setIsDeleting(false);
    setShowDeleteConfirm(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ['admin-projects'] });
    if (failed.length > 0) {
      setDeleteResult(`${ids.length - failed.length} archived, ${failed.length} failed.`);
    } else {
      setDeleteResult(`${ids.length} project${ids.length === 1 ? '' : 's'} archived.`);
    }
    setTimeout(() => setDeleteResult(null), 4000);
  }

  return (
    <div>
      {/* Toolbar — mobile: 3 rows, desktop: single row */}
      {/* Desktop */}
      <div className="hidden sm:flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects or deal ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={cn(
              'appearance-none border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              statusFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>
        <div className="relative">
          <select
            value={visibleFilter}
            onChange={(e) => setVisibleFilter(e.target.value)}
            className={cn(
              'appearance-none border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              visibleFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All visibility</option>
            <option value="visible">Shown</option>
            <option value="hidden">Hidden</option>
          </select>
          <ChevronDown
            size={12}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>
        <div className="relative">
          <select
            value={csmFilter}
            onChange={(e) => setCsmFilter(e.target.value)}
            className={cn(
              'appearance-none border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              csmFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All CSMs</option>
            <option value="__none__">No CSM</option>
            {pmEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>
        {selected.size > 0 ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <Trash2 size={14} />
            Archive selected ({selected.size})
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              Add Project
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Upload size={14} />
              Import
            </button>
            <ExportDropdown filename="projects-report" columns={exportColumns} rows={exportRows} />
          </div>
        )}
      </div>
      {/* Mobile */}
      <div className="sm:hidden space-y-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects or deal ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={cn(
                'w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
                statusFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
              )}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
          <div className="relative flex-1">
            <select
              value={visibleFilter}
              onChange={(e) => setVisibleFilter(e.target.value)}
              className={cn(
                'w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
                visibleFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
              )}
            >
              <option value="">All visibility</option>
              <option value="visible">Shown</option>
              <option value="hidden">Hidden</option>
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
          <div className="relative flex-1">
            <select
              value={csmFilter}
              onChange={(e) => setCsmFilter(e.target.value)}
              className={cn(
                'w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
                csmFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
              )}
            >
              <option value="">All CSMs</option>
              <option value="__none__">No CSM</option>
              {pmEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Upload size={14} />
            Import
          </button>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              <Trash2 size={14} />
              Archive ({selected.size})
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus size={14} />
                Add Project
              </button>
              <ExportDropdown filename="projects-report" columns={exportColumns} rows={exportRows} />
            </>
          )}
        </div>
      </div>

      {/* Result banners */}
      {(deleteResult || saveResult) && (
        <div className="mb-3 px-4 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
          {deleteResult || saveResult}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === filtered.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length;
                    }}
                    onChange={toggleAll}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Project
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Account
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Pillar
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Start
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  In Allocations
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                    No projects found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((proj) => (
                  <tr
                    key={proj.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${selected.has(proj.id) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(proj.id)}
                        onChange={() => toggleOne(proj.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="font-medium text-xs text-gray-900 dark:text-gray-100 max-w-[200px] truncate flex items-center gap-1.5"
                        title={proj.deal_name}
                      >
                        <span className="truncate">{proj.deal_name}</span>
                        {proj.zoho_deal_id ? (
                          <span
                            className="shrink-0 px-1 py-0.5 rounded text-[9px] font-mono font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                            title={proj.zoho_deal_id}
                          >
                            {proj.zoho_deal_id.slice(-4)}
                          </span>
                        ) : (
                          <span className="shrink-0 ml-1 px-1 py-0.5 rounded text-[9px] font-semibold bg-purple-100 text-purple-600">
                            M
                          </span>
                        )}
                      </div>
                      {proj.project_manager && (
                        <div className="text-[10px] text-gray-400">PM: {proj.project_manager.name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {proj.account?.brand_name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[proj.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                      >
                        {proj.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {PILLAR_LABELS[proj.devx_pillar] ?? proj.devx_pillar}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {proj.start_date ? format(new Date(proj.start_date), 'MMM d, yyyy') : '—'}
                    </td>
                    {/* Inline "show in allocations" toggle */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        title={
                          proj.show_in_allocations
                            ? 'Visible in RMS — click to hide'
                            : 'Hidden from RMS — click to show'
                        }
                        onClick={async () => {
                          const newVal = !proj.show_in_allocations;
                          if (!newVal) {
                            // Turning OFF — show warning
                            setToggleOffProject(proj);
                            return;
                          }
                          // Turning ON — no warning needed
                          qc.setQueryData(['admin-projects'], (old: { data: Project[] } | undefined) => {
                            if (!old?.data) return old;
                            return {
                              ...old,
                              data: old.data.map((p) => (p.id === proj.id ? { ...p, show_in_allocations: newVal } : p)),
                            };
                          });
                          await fetch(`/api/v1/projects/${proj.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ show_in_allocations: newVal }),
                          });
                          qc.invalidateQueries({ queryKey: ['admin-projects'] });
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${proj.show_in_allocations ? 'bg-blue-600' : 'bg-gray-300'}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-gray-900 shadow transition-transform ${proj.show_in_allocations ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditProject(proj)}
                        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />

      {/* Edit drawer */}
      {editProject && (
        <EditDrawer
          project={editProject}
          employees={employees}
          pmEmployees={pmEmployees}
          gcEmployees={gcEmployees}
          accounts={accounts}
          onClose={() => setEditProject(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-projects'] });
            setEditProject(null);
            setSaveResult('Project details updated successfully.');
            setTimeout(() => setSaveResult(null), 3000);
          }}
        />
      )}

      {/* Bulk delete confirm */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title={`Archive ${selected.size} project${selected.size === 1 ? '' : 's'}?`}
          description="They will be soft-deleted (status set to CANCELLED and deleted_at set). This cannot be undone from the UI."
          confirmLabel="Archive"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Confirm toggle-off allocations */}
      {toggleOffProject && (
        <ConfirmDialog
          title={`Hide "${toggleOffProject.deal_name}" from allocations?`}
          description="This will remove all current allocations for this project. People allocated to it will be freed up for other projects."
          confirmLabel="Hide & Remove Allocations"
          confirmVariant="danger"
          onConfirm={async () => {
            const proj = toggleOffProject;
            setToggleOffProject(null);
            qc.setQueryData(['admin-projects'], (old: { data: Project[] } | undefined) => {
              if (!old?.data) return old;
              return {
                ...old,
                data: old.data.map((p) => (p.id === proj.id ? { ...p, show_in_allocations: false } : p)),
              };
            });
            await fetch(`/api/v1/projects/${proj.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ show_in_allocations: false }),
            });
            qc.invalidateQueries({ queryKey: ['admin-projects'] });
          }}
          onCancel={() => setToggleOffProject(null)}
        />
      )}

      {/* Create drawer */}
      {showCreate && (
        <CreateDrawer
          employees={employees}
          pmEmployees={pmEmployees}
          gcEmployees={gcEmployees}
          accounts={accounts}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-projects'] });
            setShowCreate(false);
            setSaveResult('Project created successfully.');
            setTimeout(() => setSaveResult(null), 3000);
          }}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <BulkImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['admin-projects'] });
            setShowImport(false);
          }}
          defaultType="projects"
        />
      )}
    </div>
  );
}
