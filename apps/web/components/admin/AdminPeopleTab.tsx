'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Lock, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
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

interface Employee {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  google_id: string;
  status: string;
  system_role: string;
  joining_date: string | null;
  resignation_date: string | null;
  salary_ctc_cents: number | null;
  show_in_allocations: boolean;
  function?: { id: string; name: string } | null;
  role?: { id: string; name: string } | null;
  pod?: { id: string; name: string; lead_id: string } | null;
  current_allocation_pct: number;
}

interface FunctionOption {
  id: string;
  name: string;
}
interface RoleOption {
  id: string;
  name: string;
  function_id: string;
}
interface PodOption {
  id: string;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'];
const ROLE_OPTIONS = ['ADMIN', 'POD_LEAD', 'CSM', 'EMPLOYEE'];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  ON_LEAVE: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
  RESIGNED: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  TERMINATED: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
};

// Locked fields from external sources
const LOCKED_FIELDS = ['google_id', 'email', 'name', 'avatar_url', 'ems_employee_id'];

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

function EditDrawer({
  employee,
  functions,
  roles,
  pods,
  onClose,
  onSaved,
}: {
  employee: Employee;
  functions: FunctionOption[];
  roles: RoleOption[];
  pods: PodOption[];
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
    name: employee.name,
    email: employee.email,
    function_id: employee.function?.id ?? '',
    role_id: employee.role?.id ?? '',
    pod_id: employee.pod?.id ?? '',
    system_role: employee.system_role,
    status: employee.status,
    joining_date: employee.joining_date ? employee.joining_date.slice(0, 10) : '',
    resignation_date: employee.resignation_date ? employee.resignation_date.slice(0, 10) : '',
    salary_rupees: employee.salary_ctc_cents != null ? String(Math.round(employee.salary_ctc_cents / 100)) : '',
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const filteredRoles = useMemo(
    () => roles.filter((r) => !form.function_id || r.function_id === form.function_id),
    [roles, form.function_id],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const salaryRupees = parseFloat(form.salary_rupees);
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        function_id: form.function_id || undefined,
        role_id: form.role_id || undefined,
        pod_id: form.pod_id || null,
        system_role: form.system_role,
        status: form.status,
        joining_date: form.joining_date || null,
        resignation_date: form.resignation_date || null,
        salary_ctc_cents:
          form.salary_rupees.trim() !== '' && !isNaN(salaryRupees) ? Math.round(salaryRupees * 100) : null,
      };
      const res = await fetch(`/api/v1/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
    },
    onSuccess: () => {
      // Optimistic: patch the cached list immediately so the table updates instantly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueryData(['admin-employees'], (old: any) => {
        if (!old?.data) return old;
        const fnObj = functions.find((f) => f.id === form.function_id) ?? null;
        const roleObj = roles.find((r) => r.id === form.role_id) ?? null;
        const podObj = pods.find((p) => p.id === form.pod_id) ?? null;
        const salaryRupees = parseFloat(form.salary_rupees);
        return {
          ...old,
          data: (old.data as Employee[]).map((e) =>
            e.id === employee.id
              ? {
                  ...e,
                  name: form.name.trim(),
                  email: form.email.trim().toLowerCase(),
                  function: fnObj ? { id: fnObj.id, name: fnObj.name } : e.function,
                  role: roleObj ? { id: roleObj.id, name: roleObj.name } : e.role,
                  pod: podObj ? { id: podObj.id, name: podObj.name, lead_id: e.pod?.lead_id ?? '' } : null,
                  system_role: form.system_role,
                  status: form.status,
                  joining_date: form.joining_date || null,
                  resignation_date: form.resignation_date || null,
                  show_in_allocations:
                    form.status === 'RESIGNED' || form.status === 'TERMINATED' ? false : e.show_in_allocations,
                  salary_ctc_cents:
                    form.salary_rupees.trim() !== '' && !isNaN(salaryRupees) ? Math.round(salaryRupees * 100) : null,
                }
              : e,
          ),
        };
      });
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
      setShowConfirm(false);
    },
  });

  function LockBadge({ label }: { label: string }) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 font-normal">
        <Lock size={9} /> {label}
      </span>
    );
  }

  function LockedInput({ value, source }: { value: string; source: string }) {
    return (
      <div className="relative">
        <input
          disabled
          value={value}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          <LockBadge label={source} />
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn('fixed inset-0 z-40 transition-colors duration-350', isOpen ? 'bg-black/20' : 'bg-black/0')}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full z-50 w-full sm:w-[420px] bg-white dark:bg-gray-900 shadow-2xl flex flex-col transition-transform duration-350 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Employee</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{employee.email}</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Function */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Function</label>
            <select
              value={form.function_id}
              onChange={(e) => setForm((f) => ({ ...f, function_id: e.target.value, role_id: '' }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— Select function —</option>
              {functions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={form.role_id}
              onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— Select role —</option>
              {filteredRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Pod */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Pod</label>
            <select
              value={form.pod_id}
              onChange={(e) => setForm((f) => ({ ...f, pod_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— No pod —</option>
              {pods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* System Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">System Role</label>
            <select
              value={form.system_role}
              onChange={(e) => setForm((f) => ({ ...f, system_role: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {form.system_role === 'POD_LEAD' && form.pod_id && (
              <p className="text-xs text-blue-600 mt-1">This person will be set as the lead of their selected pod.</p>
            )}
            {form.system_role === 'POD_LEAD' && !form.pod_id && (
              <p className="text-xs text-amber-600 mt-1">Select a pod above to assign this person as its lead.</p>
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

          {/* Joining Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Joining Date</label>
            <input
              type="date"
              value={form.joining_date}
              onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Resignation / Termination Date — only for RESIGNED or TERMINATED */}
          {(form.status === 'RESIGNED' || form.status === 'TERMINATED') && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {form.status === 'TERMINATED' ? 'Termination Date' : 'Resignation Date'}
                <span className="text-gray-400 font-normal ml-1">(optional)</span>
              </label>
              <input
                type="date"
                value={form.resignation_date}
                onChange={(e) => setForm((f) => ({ ...f, resignation_date: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              />
            </div>
          )}

          {/* Salary CTC */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Annual Salary CTC (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 1200000"
                value={form.salary_rupees}
                onChange={(e) => setForm((f) => ({ ...f, salary_rupees: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Enter annual CTC in rupees. Used for PnL cost calculations.
            </p>
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
          title={`Update ${employee.name}?`}
          description="This will immediately update the employee record in the database."
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

function CreateEmployeeDrawer({
  functions,
  roles,
  pods,
  onClose,
  onSaved,
}: {
  functions: FunctionOption[];
  roles: RoleOption[];
  pods: PodOption[];
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
    name: '',
    email: '',
    function_id: '',
    role_id: '',
    system_role: 'EMPLOYEE',
    pod_id: '',
    status: 'ACTIVE',
    joining_date: '',
    salary_rupees: '',
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const filteredRoles = useMemo(
    () => roles.filter((r) => !form.function_id || r.function_id === form.function_id),
    [roles, form.function_id],
  );

  const isValid = form.name.trim() && form.email.trim() && form.function_id && form.role_id;

  const createMutation = useMutation({
    mutationFn: async () => {
      const salaryRupees = parseFloat(form.salary_rupees);
      const body: Record<string, unknown> = {
        source: 'manual',
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        function_id: form.function_id,
        role_id: form.role_id,
        system_role: form.system_role,
        pod_id: form.pod_id || null,
        status: form.status,
        joining_date: form.joining_date || null,
        salary_ctc_cents:
          form.salary_rupees.trim() !== '' && !isNaN(salaryRupees) ? Math.round(salaryRupees * 100) : null,
      };
      const res = await fetch('/api/v1/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Creation failed');
      return data.data;
    },
    onSuccess: (newEmp) => {
      // Optimistic: add to cache
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueryData(['admin-employees'], (old: any) => {
        if (!old?.data) return old;
        const fnObj = functions.find((f) => f.id === form.function_id) ?? null;
        const roleObj = roles.find((r) => r.id === form.role_id) ?? null;
        const podObj = pods.find((p) => p.id === form.pod_id) ?? null;
        const employee = {
          ...newEmp,
          function: fnObj ? { id: fnObj.id, name: fnObj.name } : null,
          role: roleObj ? { id: roleObj.id, name: roleObj.name } : null,
          pod: podObj ? { id: podObj.id, name: podObj.name, lead_id: '' } : null,
          current_allocation_pct: 0,
        };
        return { ...old, data: [employee, ...(old.data as Employee[])] };
      });
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
      {/* Backdrop */}
      <div
        className={cn('fixed inset-0 z-40 transition-colors duration-350', isOpen ? 'bg-black/20' : 'bg-black/0')}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full z-50 w-full sm:w-[420px] bg-white dark:bg-gray-900 shadow-2xl flex flex-col transition-transform duration-350 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add Employee</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              placeholder="name@devxlabs.ai"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Function */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Function <span className="text-red-500">*</span>
            </label>
            <select
              value={form.function_id}
              onChange={(e) => setForm((f) => ({ ...f, function_id: e.target.value, role_id: '' }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— Select function —</option>
              {functions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={form.role_id}
              onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— Select role —</option>
              {filteredRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* System Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">System Role</label>
            <select
              value={form.system_role}
              onChange={(e) => setForm((f) => ({ ...f, system_role: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Pod */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Pod</label>
            <select
              value={form.pod_id}
              onChange={(e) => setForm((f) => ({ ...f, pod_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— No pod —</option>
              {pods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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

          {/* Joining Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Joining Date</label>
            <input
              type="date"
              value={form.joining_date}
              onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Salary CTC */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Annual Salary CTC (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="e.g. 1200000"
                value={form.salary_rupees}
                onChange={(e) => setForm((f) => ({ ...f, salary_rupees: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Enter annual CTC in rupees. Used for PnL cost calculations.
            </p>
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
            disabled={!isValid}
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Employee
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Create new employee?"
          description={`This will add ${form.name.trim() || 'this person'} (${form.email.trim()}) to the system.`}
          confirmLabel="Create"
          confirmVariant="primary"
          isLoading={createMutation.isPending}
          onConfirm={() => createMutation.mutate()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function AdminPeopleTab({
  serverParams,
}: {
  serverParams?: Record<string, string | string[] | undefined>;
} = {}) {
  const qc = useQueryClient();

  const urlDefaults = { search: '', status: 'ACTIVE', visible: 'visible', page: 1 };
  const init = readUrlParams(urlDefaults, serverParams);
  const [search, setSearch] = useState(init.search);
  const [statusFilter, setStatusFilter] = useState(init.status);
  const [visibleFilter, setVisibleFilter] = useState(init.visible);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(init.page);
  const PAGE_SIZE = 25;
  useSyncUrlParams({ search, status: statusFilter, visible: visibleFilter, page }, urlDefaults);

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: () => fetch('/api/v1/employees', { cache: 'no-store' }).then((r) => r.json()),
    staleTime: 120_000,
  });
  const { data: funcData } = useQuery({
    queryKey: ['functions'],
    queryFn: () => fetch('/api/v1/employees/functions').then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: roleData } = useQuery({
    queryKey: ['roles-all'],
    queryFn: () => fetch('/api/v1/employees/roles').then((r) => r.json()),
    staleTime: 300_000,
  });
  const { data: podsData } = useQuery({
    queryKey: ['pods'],
    queryFn: () => fetch('/api/v1/pods', { cache: 'no-store' }).then((r) => r.json()),
    staleTime: 300_000,
  });

  const employees: Employee[] = empData?.data ?? [];
  const functions: FunctionOption[] = funcData?.data ?? [];
  const pods: PodOption[] = (podsData?.data ?? []).map((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
  }));
  const roles: RoleOption[] = roleData?.data ?? [];

  const filtered = useMemo(() => {
    let list = employees;
    if (search)
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase()),
      );
    if (statusFilter) list = list.filter((e) => e.status === statusFilter);
    if (visibleFilter === 'visible') list = list.filter((e) => e.show_in_allocations);
    if (visibleFilter === 'hidden') list = list.filter((e) => !e.show_in_allocations);
    return list;
  }, [employees, search, statusFilter, visibleFilter]);

  // Track page across filter changes: save before filtering, restore when cleared
  const defaultFilterKey = '||';
  const filterKey = `${search}|${statusFilter}|${visibleFilter}`;
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
    { header: 'Name', key: 'name' },
    { header: 'Email', key: 'email' },
    { header: 'Function', key: 'function' },
    { header: 'Role', key: 'role' },
    { header: 'Pod', key: 'pod' },
    { header: 'System Role', key: 'system_role' },
    { header: 'Status', key: 'status' },
    { header: 'In Allocations', key: 'in_allocations' },
  ];

  const exportRows = useMemo(
    () =>
      filtered.map((emp) => ({
        name: emp.name,
        email: emp.email,
        function: emp.function?.name ?? '',
        role: emp.role?.name ?? '',
        pod: emp.pod?.name ?? '',
        system_role: emp.system_role,
        status: emp.status,
        in_allocations: emp.show_in_allocations ? 'Yes' : 'No',
      })),
    [filtered],
  );

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
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
      ids.map((id) => fetch(`/api/v1/employees/${id}`, { method: 'DELETE' }).then((r) => r.json())),
    );
    const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
    setIsDeleting(false);
    setShowDeleteConfirm(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ['admin-employees'] });
    qc.invalidateQueries({ queryKey: ['employees'] });
    if (failed.length > 0) {
      setDeleteResult(`${ids.length - failed.length} deactivated, ${failed.length} failed.`);
    } else {
      setDeleteResult(`${ids.length} employee${ids.length === 1 ? '' : 's'} deactivated.`);
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
            placeholder="Search people…"
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn(
            'select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
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
        <select
          value={visibleFilter}
          onChange={(e) => setVisibleFilter(e.target.value)}
          className={cn(
            'select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
            visibleFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
          )}
        >
          <option value="">All visibility</option>
          <option value="visible">Shown</option>
          <option value="hidden">Hidden</option>
        </select>
        {selected.size > 0 ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <Trash2 size={14} />
            Deactivate ({selected.size})
          </button>
        ) : (
          <>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              Add Employee
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Upload size={14} />
              Import
            </button>
            <ExportDropdown filename="people-report" columns={exportColumns} rows={exportRows} />
          </>
        )}
      </div>
      {/* Mobile */}
      <div className="sm:hidden space-y-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search people…"
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
              className="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900"
            >
              <option value="">ALL STATUSES</option>
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
              className="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900"
            >
              <option value="">All</option>
              <option value="visible">Shown</option>
              <option value="hidden">Hidden</option>
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
              Deactivate ({selected.size})
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus size={14} />
                Add Employee
              </button>
              <ExportDropdown filename="people-report" columns={exportColumns} rows={exportRows} />
            </>
          )}
        </div>
      </div>

      {/* Result banner */}
      {deleteResult && (
        <div className="mb-3 px-4 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
          {deleteResult}
        </div>
      )}

      {saveResult && (
        <div className="mb-3 px-4 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
          {saveResult}
        </div>
      )}

      {/* Table */}
      {empLoading ? (
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
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Function / Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Pod
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  System Role
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
                    No employees found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((emp) => (
                  <tr
                    key={emp.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${selected.has(emp.id) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(emp.id)}
                        onChange={() => toggleOne(emp.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {emp.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={emp.avatar_url} alt={emp.name} className="w-7 h-7 rounded-full" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-400">
                            {emp.name[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">{emp.name}</div>
                          <div className="text-[10px] text-gray-400">{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {emp.function?.name ?? '—'}
                      {emp.role?.name ? <span className="text-gray-400"> / {emp.role.name}</span> : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[emp.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                      >
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{emp.pod?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{emp.system_role}</td>
                    {/* Inline "show in allocations" toggle */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        title={
                          emp.show_in_allocations
                            ? 'Shown in Allocations — click to hide'
                            : 'Hidden from Allocations — click to show'
                        }
                        onClick={async () => {
                          const newVal = !emp.show_in_allocations;
                          // Optimistic: update cache instantly
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          qc.setQueryData(['admin-employees'], (old: any) => {
                            if (!old?.data) return old;
                            return {
                              ...old,
                              data: (old.data as Employee[]).map((e) =>
                                e.id === emp.id ? { ...e, show_in_allocations: newVal } : e,
                              ),
                            };
                          });
                          await fetch(`/api/v1/employees/${emp.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ show_in_allocations: newVal }),
                          });
                          qc.invalidateQueries({ queryKey: ['admin-employees'] });
                          qc.invalidateQueries({ queryKey: ['employees'] });
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${emp.show_in_allocations ? 'bg-blue-600' : 'bg-gray-300'}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-gray-900 shadow transition-transform ${emp.show_in_allocations ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditEmployee(emp)}
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
      {editEmployee && (
        <EditDrawer
          employee={editEmployee}
          functions={functions}
          roles={roles}
          pods={pods}
          onClose={() => setEditEmployee(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-employees'] });
            qc.invalidateQueries({ queryKey: ['employees'] });
            setEditEmployee(null);
            setSaveResult('Employee updated successfully.');
            setTimeout(() => setSaveResult(null), 3000);
          }}
        />
      )}

      {/* Bulk delete confirm */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title={`Deactivate ${selected.size} employee${selected.size === 1 ? '' : 's'}?`}
          description="They will be soft-deleted (status set to RESIGNED) and removed from active views. This cannot be undone from the UI."
          confirmLabel="Deactivate"
          confirmVariant="danger"
          isLoading={isDeleting}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Create drawer */}
      {showCreate && (
        <CreateEmployeeDrawer
          functions={functions}
          roles={roles}
          pods={pods}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-employees'] });
            qc.invalidateQueries({ queryKey: ['employees'] });
            setShowCreate(false);
            setSaveResult('Employee created successfully.');
            setTimeout(() => setSaveResult(null), 3000);
          }}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <BulkImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['admin-employees'] });
            setShowImport(false);
          }}
          defaultType="employees"
        />
      )}
    </div>
  );
}
