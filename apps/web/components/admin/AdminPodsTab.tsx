'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { cn } from '@/lib/utils/cn';
import { ConfirmDialog } from './ConfirmDialog';
import { ExportDropdown } from './ExportDropdown';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pod {
  id: string;
  name: string;
  lead_id: string;
  lead: { id: string; name: string; avatar_url: string | null } | null;
  members: { id: string; name: string; avatar_url: string | null }[];
}

interface Employee {
  id: string;
  name: string;
  avatar_url: string | null;
  status: string;
}

// ─── Create Pod Drawer ───────────────────────────────────────────────────────

function CreatePodDrawer({
  employees,
  existingLeadIds,
  onClose,
  onSaved,
}: {
  employees: Employee[];
  existingLeadIds: Set<string>;
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

  const [form, setForm] = useState({ name: '', lead_id: '' });
  const [error, setError] = useState('');

  const availableLeads = useMemo(
    () => employees.filter((e) => e.status === 'ACTIVE' && !existingLeadIds.has(e.id)),
    [employees, existingLeadIds],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/pods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, lead_id: form.lead_id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to create pod');
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <>
      <div
        className={cn('fixed inset-0 z-40 transition-colors duration-350', isOpen ? 'bg-black/20' : 'bg-black/0')}
        onClick={handleClose}
      />
      <div
        className={cn(
          'fixed right-0 top-0 h-full z-50 w-full sm:w-[420px] bg-white dark:bg-gray-900 shadow-2xl flex flex-col transition-transform duration-350 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Create Pod</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Pod Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Alpha Pod"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Pod Lead</label>
            <select
              value={form.lead_id}
              onChange={(e) => setForm((f) => ({ ...f, lead_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">— Select lead —</option>
              {availableLeads.map((e) => (
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
            onClick={() => saveMutation.mutate()}
            disabled={!form.name.trim() || !form.lead_id || saveMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Creating…' : 'Create Pod'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Edit Pod Drawer ─────────────────────────────────────────────────────────

function EditPodDrawer({
  pod,
  employees,
  existingLeadIds,
  onClose,
  onSaved,
}: {
  pod: Pod;
  employees: Employee[];
  existingLeadIds: Set<string>;
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

  const [form, setForm] = useState({ name: pod.name, lead_id: pod.lead_id });
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const availableLeads = useMemo(
    () => employees.filter((e) => e.status === 'ACTIVE' && (e.id === pod.lead_id || !existingLeadIds.has(e.id))),
    [employees, existingLeadIds, pod.lead_id],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (form.name !== pod.name) body.name = form.name;
      if (form.lead_id !== pod.lead_id) body.lead_id = form.lead_id;
      const res = await fetch(`/api/v1/pods/${pod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['admin-pods'] });
      const previous = qc.getQueryData(['admin-pods']);
      const newLead = employees.find((e) => e.id === form.lead_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qc.setQueryData(['admin-pods'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((p: Pod) =>
            p.id === pod.id
              ? {
                  ...p,
                  name: form.name,
                  lead_id: form.lead_id,
                  lead: newLead ? { id: newLead.id, name: newLead.name, avatar_url: newLead.avatar_url } : p.lead,
                }
              : p,
          ),
        };
      });
      return { previous };
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err: Error, _v, context) => {
      if (context?.previous) qc.setQueryData(['admin-pods'], context.previous);
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
          'fixed right-0 top-0 h-full z-50 w-full sm:w-[420px] bg-white dark:bg-gray-900 shadow-2xl flex flex-col transition-transform duration-350 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Pod</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Pod Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Pod Lead</label>
            <select
              value={form.lead_id}
              onChange={(e) => setForm((f) => ({ ...f, lead_id: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              {availableLeads.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {form.lead_id !== pod.lead_id && (
              <p className="text-xs text-amber-600 mt-1">
                Changing lead will demote the current lead and promote the new one.
              </p>
            )}
          </div>

          {/* Read-only member list */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Members ({pod.members.length})
            </label>
            {pod.members.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No members assigned yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {pod.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt={m.name} className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600 dark:text-gray-400">
                        {m.name[0]}
                      </div>
                    )}
                    <span className="text-xs text-gray-700 dark:text-gray-300">{m.name}</span>
                  </div>
                ))}
              </div>
            )}
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Save changes
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title={`Update "${pod.name}"?`}
          description="This will immediately update the pod record in the database."
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

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function AdminPodsTab() {
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editPod, setEditPod] = useState<Pod | null>(null);
  const [deletePod, setDeletePod] = useState<Pod | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: podsData, isLoading } = useQuery({
    queryKey: ['admin-pods'],
    queryFn: () => fetch('/api/v1/pods', { cache: 'no-store' }).then((r) => r.json()),
    staleTime: 300_000,
  });

  const { data: empData } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: () => fetch('/api/v1/employees?status=ACTIVE', { cache: 'no-store' }).then((r) => r.json()),
    staleTime: 120_000,
  });

  const pods: Pod[] = podsData?.data ?? [];
  const employees: Employee[] = empData?.data ?? [];

  const existingLeadIds = useMemo(() => new Set(pods.map((p) => p.lead_id)), [pods]);

  const filtered = useMemo(() => {
    if (!search) return pods;
    const q = search.toLowerCase();
    return pods.filter((p) => p.name.toLowerCase().includes(q) || (p.lead?.name ?? '').toLowerCase().includes(q));
  }, [pods, search]);

  const exportColumns = [
    { header: 'Pod Name', key: 'name' },
    { header: 'Lead', key: 'lead' },
    { header: 'Members Count', key: 'members_count' },
    { header: 'Member', key: 'member' },
  ];

  const exportRows = useMemo(() => {
    const rows: Record<string, string | number | boolean | null | undefined>[] = [];
    for (const pod of filtered) {
      const base = {
        name: pod.name,
        lead: pod.lead?.name ?? '',
        members_count: pod.members.length,
      };
      if (pod.members.length === 0) {
        rows.push({ ...base, member: '' });
      } else {
        for (const m of pod.members) {
          rows.push({ ...base, member: m.name });
        }
      }
    }
    return rows;
  }, [filtered]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/pods/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Delete failed');
    },
    onSuccess: () => {
      invalidateAll();
      setDeletePod(null);
      setResultMsg('Pod deleted successfully.');
      setTimeout(() => setResultMsg(null), 3000);
    },
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['admin-pods'] });
    qc.invalidateQueries({ queryKey: ['pods'] });
    qc.invalidateQueries({ queryKey: ['admin-employees'] });
    qc.invalidateQueries({ queryKey: ['employees'] });
  }

  return (
    <div>
      {/* Toolbar — Desktop */}
      <div className="hidden sm:flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search pods…"
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
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          Create Pod
        </button>
        <ExportDropdown filename="pods-report" columns={exportColumns} rows={exportRows} />
      </div>

      {/* Toolbar — Mobile */}
      <div className="sm:hidden space-y-2 mb-4">
        {/* Row 1: Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search pods…"
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
        {/* Row 2: Create Pod + Download */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            Create Pod
          </button>
          <ExportDropdown filename="pods-report" columns={exportColumns} rows={exportRows} />
        </div>
      </div>

      {/* Result banner */}
      {resultMsg && (
        <div className="mb-3 px-4 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
          {resultMsg}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-8" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Pod Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Lead
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Members
                </th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                    No pods found.
                  </td>
                </tr>
              ) : (
                filtered.map((pod) => {
                  const isOpen = expanded.has(pod.id);
                  return (
                    <React.Fragment key={pod.id}>
                      <tr
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(pod.id)) next.delete(pod.id);
                            else next.add(pod.id);
                            return next;
                          })
                        }
                        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">{pod.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          {pod.lead ? (
                            <div className="flex items-center gap-2">
                              {pod.lead.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={pod.lead.avatar_url} alt={pod.lead.name} className="w-6 h-6 rounded-full" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-medium text-gray-600 dark:text-gray-400">
                                  {pod.lead.name[0]}
                                </div>
                              )}
                              <span className="text-xs text-gray-700 dark:text-gray-300">{pod.lead.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {pod.members.length}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setEditPod(pod)}
                              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeletePod(pod)}
                              className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50/50 dark:bg-gray-800/50">
                          <td colSpan={5} className="px-6 py-3">
                            {pod.members.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No members assigned.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {pod.members.map((m) => (
                                  <div
                                    key={m.id}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full"
                                  >
                                    {m.avatar_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={m.avatar_url} alt={m.name} className="w-5 h-5 rounded-full" />
                                    ) : (
                                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-[9px] font-semibold text-white">
                                        {m.name[0]}
                                      </div>
                                    )}
                                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                                      {m.name}
                                    </span>
                                    {m.id === pod.lead_id && (
                                      <span className="text-[9px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                                        Lead
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create drawer */}
      {showCreate && (
        <CreatePodDrawer
          employees={employees}
          existingLeadIds={existingLeadIds}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            invalidateAll();
            setShowCreate(false);
            setResultMsg('Pod created successfully.');
            setTimeout(() => setResultMsg(null), 3000);
          }}
        />
      )}

      {/* Edit drawer */}
      {editPod && (
        <EditPodDrawer
          pod={editPod}
          employees={employees}
          existingLeadIds={existingLeadIds}
          onClose={() => setEditPod(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-pods'] });
            qc.invalidateQueries({ queryKey: ['pods'] });
            setEditPod(null);
            setResultMsg('Pod updated successfully.');
            setTimeout(() => setResultMsg(null), 3000);
          }}
        />
      )}

      {/* Delete confirm */}
      {deletePod && (
        <ConfirmDialog
          title={`Delete "${deletePod.name}"?`}
          description="This will soft-delete the pod, unassign all members, and demote the lead. This cannot be undone from the UI."
          confirmLabel="Delete"
          confirmVariant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletePod.id)}
          onCancel={() => setDeletePod(null)}
        />
      )}
    </div>
  );
}
