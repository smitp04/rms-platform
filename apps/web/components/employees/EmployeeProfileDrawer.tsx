'use client';

import { ALLOCATION_MAX, ALLOCATION_MIN, ALLOCATION_STEP } from '@devx/config';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface SprintTrend {
  sprint_id: string;
  sprint_number: number;
  label: string;
  start_date: string;
  end_date: string;
  total_pct: number;
  projects: { project_id: string; deal_name: string; brand_name: string; pct: number }[];
}

interface ActivityEntry {
  id: string;
  action: 'create' | 'update' | 'delete';
  created_at: string;
  actor_name: string;
  actor_role: string;
  old_pct: number | null;
  new_pct: number | null;
  brand_name: string | null;
  deal_name: string | null;
  sprint_label: string | null;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  function?: { name: string } | null;
  role?: { name: string } | null;
  pod?: { name: string } | null;
  platforms?: { platform: { name: string } }[];
}

function UtilBar({ pct, max = 100 }: { pct: number; max?: number }) {
  const capped = Math.min(pct, 120);
  const width = Math.min((capped / (max > 0 ? max : 100)) * 100, 100);
  const color = pct > 100 ? 'bg-blue-500' : pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-gray-300';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${width}%` }} />
      </div>
      <span
        className={cn(
          'text-xs font-semibold w-9 text-right tabular-nums',
          pct > 100 ? 'text-blue-600' : pct === 100 ? 'text-green-600' : 'text-gray-500 dark:text-gray-400',
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

function ActionIcon({ action }: { action: string }) {
  if (action === 'create') return <Plus size={10} className="text-green-600" />;
  if (action === 'delete') return <Trash2 size={10} className="text-red-500" />;
  // update — distinguish move vs copy heuristically: if old_pct changes it's an edit; show generic edit icon
  return <ArrowRight size={10} className="text-blue-500" />;
}

function ActionLabel({ action, oldPct, newPct }: { action: string; oldPct: number | null; newPct: number | null }) {
  if (action === 'create') return <span className="text-green-700 dark:text-green-400 font-medium">Allocated</span>;
  if (action === 'delete') return <span className="text-red-600 dark:text-red-400 font-medium">Removed</span>;
  if (action === 'update') {
    if (oldPct !== null && newPct !== null && oldPct !== newPct) {
      return (
        <span className="text-blue-700 dark:text-blue-400 font-medium">
          Updated {oldPct}% → {newPct}%
        </span>
      );
    }
    return <span className="text-blue-700 dark:text-blue-400 font-medium">Updated</span>;
  }
  return <span className="text-gray-600 dark:text-gray-400 font-medium capitalize">{action}</span>;
}

function ActivityTab({ employeeId }: { employeeId: string }) {
  const [page, setPage] = useState(1);

  // Reset page when employee changes
  const prevEmployeeId = useRef(employeeId);
  if (prevEmployeeId.current !== employeeId) {
    prevEmployeeId.current = employeeId;
    setPage(1);
  }

  // Fetch all pages up to `page` via parallel queries
  const queries = useQueries({
    queries: Array.from({ length: page }, (_, i) => ({
      queryKey: ['employee-activity', employeeId, i + 1],
      queryFn: () => fetch(`/api/v1/employees/${employeeId}/activity?page=${i + 1}`).then((r) => r.json()),
      staleTime: 60_000,
    })),
  });

  const isFirstLoading = queries[0]?.isLoading;
  const isLastFetching = queries[queries.length - 1]?.isFetching;
  const lastResult = queries[queries.length - 1]?.data;
  const total = lastResult?.data?.total ?? 0;
  const pageSize = lastResult?.data?.page_size ?? 50;
  const hasMore = page * pageSize < total;

  // Derive entries directly from query results — no effects needed
  const allEntries: ActivityEntry[] = queries.flatMap((q) => q.data?.data?.data ?? []);

  if (isFirstLoading) {
    return <div className="py-10 text-center text-sm text-gray-400">Loading activity...</div>;
  }

  if (allEntries.length === 0) {
    return (
      <div className="py-10 text-center">
        <Activity size={28} className="mx-auto text-gray-200 mb-2" />
        <p className="text-sm text-gray-400">No allocation activity yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 space-y-2">
      {allEntries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-xl border border-gray-100 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-start gap-2">
            {/* Icon */}
            <div
              className={cn(
                'mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                entry.action === 'create'
                  ? 'bg-green-50 dark:bg-green-950/40'
                  : entry.action === 'delete'
                    ? 'bg-red-50 dark:bg-red-950/40'
                    : 'bg-blue-50 dark:bg-blue-950/40',
              )}
            >
              <ActionIcon action={entry.action} />
            </div>

            <div className="flex-1 min-w-0">
              {/* Action + project */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <ActionLabel action={entry.action} oldPct={entry.old_pct} newPct={entry.new_pct} />
                {entry.brand_name && (
                  <>
                    <span className="text-gray-300 text-[10px]">·</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">
                      {entry.brand_name}
                    </span>
                  </>
                )}
                {entry.sprint_label && (
                  <>
                    <span className="text-gray-300 text-[10px]">·</span>
                    <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded font-medium">
                      {entry.sprint_label}
                    </span>
                  </>
                )}
              </div>

              {/* Deal name */}
              {entry.deal_name && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{entry.deal_name}</div>}

              {/* Actor + time */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-gray-400">by</span>
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{entry.actor_name}</span>
                <span className="text-gray-300 text-[10px]">·</span>
                <span className="text-[10px] text-gray-400">
                  {new Date(entry.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  {new Date(entry.created_at).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={isLastFetching}
          className="w-full py-2 text-xs text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400"
        >
          {isLastFetching ? 'Loading...' : `Load more (${allEntries.length} of ${total})`}
        </button>
      )}
    </div>
  );
}

interface SprintOption {
  id: string;
  sprint_number: number;
  label: string;
  year: number;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_past: boolean;
  is_future: boolean;
}

interface ProjectOption {
  id: string;
  deal_name: string;
  brand_name: string;
  status: string;
}

function AllocateTab({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const queryClient = useQueryClient();
  const [selectedSprintId, setSelectedSprintId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [pct, setPct] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');

  // Fetch sprints (current + future)
  const { data: sprintData } = useQuery({
    queryKey: ['sprints-for-employee-alloc'],
    queryFn: () => fetch('/api/v1/sprints').then((r) => r.json()),
    staleTime: 300_000,
  });
  const sprints: SprintOption[] = (sprintData?.data ?? []).filter((s: SprintOption) => s.is_current || s.is_future);

  // Auto-select current sprint
  useEffect(() => {
    if (!selectedSprintId && sprints.length > 0) {
      const current = sprints.find((s) => s.is_current);
      setSelectedSprintId(current?.id ?? sprints[0].id);
    }
  }, [sprints, selectedSprintId]);

  // Fetch projects
  const { data: projData } = useQuery({
    queryKey: ['projects-for-employee-alloc'],
    queryFn: () => fetch('/api/v1/projects?status=ACTIVE,UPCOMING').then((r) => r.json()),
    staleTime: 300_000,
  });
  const allProjects: ProjectOption[] = (projData?.data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    deal_name: p.deal_name as string,
    brand_name: (p.account as { brand_name: string } | undefined)?.brand_name ?? (p.brand_name as string) ?? '',
    status: p.status as string,
  }));
  const filteredProjects = useMemo(() => {
    if (!projectSearch) return allProjects;
    const q = projectSearch.toLowerCase();
    return allProjects.filter((p) => p.deal_name.toLowerCase().includes(q) || p.brand_name.toLowerCase().includes(q));
  }, [allProjects, projectSearch]);

  const pctPresets = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90, 100];
  const currentPctValue = pct ?? 50;
  const isPreset = pctPresets.includes(currentPctValue);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          sprint_id: selectedSprintId,
          project_id: selectedProjectId,
          allocation_percentage: currentPctValue,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
      return data;
    },
    onSuccess: () => {
      setSuccess('Allocation saved successfully');
      setError('');
      setSelectedProjectId('');
      setProjectSearch('');
      setPct(null);
      setNotes('');
      setCustomMode(false);
      setCustomInput('');
      // Refresh the trend tab data
      queryClient.invalidateQueries({ queryKey: ['employee-allocations', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['employee-activity', employeeId] });
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess('');
    },
  });

  const canSave =
    !!selectedSprintId &&
    !!selectedProjectId &&
    pct !== null &&
    currentPctValue >= ALLOCATION_MIN &&
    currentPctValue % ALLOCATION_STEP === 0;

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-4">
      {/* Sprint selector */}
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Sprint
        </label>
        <select
          value={selectedSprintId}
          onChange={(e) => {
            setSelectedSprintId(e.target.value);
            setError('');
            setSuccess('');
          }}
          className="select-chevron w-full border border-gray-200 dark:border-gray-700 rounded-lg pl-2.5 pr-8 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
        >
          <option value="">Select sprint</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {s.is_current ? ' (Current)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Project selector */}
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Project
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Search project..."
            value={projectSearch}
            onChange={(e) => {
              setProjectSearch(e.target.value);
              setSelectedProjectId('');
              setError('');
              setSuccess('');
            }}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-7 py-2 text-xs mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {projectSearch && (
            <button
              type="button"
              onClick={() => {
                setProjectSearch('');
                setSelectedProjectId('');
                setError('');
                setSuccess('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 -mt-[3px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {filteredProjects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 italic">No projects found</div>
          ) : (
            <div className="overflow-y-auto max-h-36 divide-y divide-gray-50 dark:divide-gray-800">
              {filteredProjects.map((p) => {
                const isSelected = selectedProjectId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setError('');
                      setSuccess('');
                    }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 transition-colors text-xs',
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800',
                    )}
                  >
                    <span className="font-medium truncate">
                      {p.deal_name}
                      <span className="font-normal text-gray-500 dark:text-gray-400"> — {p.brand_name}</span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                        p.status === 'ACTIVE'
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
                      )}
                    >
                      {p.status === 'ACTIVE' ? 'Active' : 'Upcoming'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Allocation % */}
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Allocation %
        </label>
        <div className="grid grid-cols-7 gap-1">
          {pctPresets.map((step) => (
            <button
              key={step}
              onClick={() => {
                setPct(step);
                setCustomMode(false);
                setError('');
                setSuccess('');
              }}
              className={cn(
                'py-1.5 rounded-lg text-xs font-medium transition-colors',
                currentPctValue === step && !customMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700',
              )}
            >
              {step}%
            </button>
          ))}
          <button
            onClick={() => {
              setCustomMode(true);
              setCustomInput(String(currentPctValue));
            }}
            className={cn(
              'py-1.5 rounded-lg text-xs font-medium transition-colors',
              customMode || (!isPreset && pct !== null)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700',
            )}
          >
            Custom
          </button>
        </div>
        {(customMode || (!isPreset && pct !== null)) && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={ALLOCATION_MIN}
              max={ALLOCATION_MAX}
              step={ALLOCATION_STEP}
              value={customInput || (pct !== null ? String(pct) : '')}
              onChange={(e) => {
                setCustomInput(e.target.value);
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= ALLOCATION_MIN && val <= ALLOCATION_MAX && val % ALLOCATION_STEP === 0) {
                  setPct(val);
                  setError('');
                }
              }}
              placeholder={`${ALLOCATION_MIN}–${ALLOCATION_MAX} in steps of ${ALLOCATION_STEP}`}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">%</span>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Notes <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any context for this allocation..."
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
          <AlertCircle size={12} /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 rounded-lg px-3 py-2">
          <CheckCircle2 size={12} /> {success}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={() => saveMutation.mutate()}
        disabled={!canSave || saveMutation.isPending}
        className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saveMutation.isPending ? 'Saving...' : `Allocate ${employeeName.split(' ')[0]}`}
      </button>
    </div>
  );
}

export function EmployeeProfileDrawer({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { data: session } = useSession();
  const role = session?.user?.system_role ?? 'EMPLOYEE';
  const canAllocate = ['ADMIN', 'POD_LEAD', 'CSM'].includes(role);

  const [year, setYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<'trend' | 'activity' | 'allocate'>('trend');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true));
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, 350);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['employee-allocations', employee.id, year],
    queryFn: () => fetch(`/api/v1/employees/${employee.id}/allocations?year=${year}`).then((r) => r.json()),
    enabled: activeTab === 'trend',
    staleTime: 30_000,
  });

  const trend: SprintTrend[] = data?.data?.trend ?? [];
  const avg_allocation: number = data?.data?.avg_allocation ?? 0;

  // Only show sprints with data or current/upcoming
  const activeSprints = trend.filter((s) => s.total_pct > 0);
  const maxPct = Math.max(...activeSprints.map((s) => s.total_pct), 100);

  const empFunction = employee.function?.name?.toLowerCase() ?? '';
  const isNonBillable = ['growth', 'hr', 'finance', 'om'].includes(empFunction);
  const isGrowth = empFunction === 'growth';
  const showAllocateTab = canAllocate && !isNonBillable;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={cn('absolute inset-0 -z-10 transition-colors duration-350', isOpen ? 'bg-black/25' : 'bg-black/0')}
        onClick={handleClose}
      />

      <div
        className={cn(
          'relative w-full max-w-full sm:max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col h-full border-l border-gray-200 dark:border-gray-700 overflow-hidden transition-transform duration-350 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              {employee.name[0]}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{employee.name}</h2>
              <p className="text-xs text-gray-400">{employee.email}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {employee.function && (
                  <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 px-1.5 py-0.5 rounded-full font-medium">
                    {employee.function.name}
                  </span>
                )}
                {employee.role && (
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{employee.role.name}</span>
                )}
                {employee.pod && (
                  <span className="text-[10px] bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-800 px-1.5 py-0.5 rounded-full font-medium">
                    {employee.pod.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* ── Platforms ──────────────────────────────────────────────────── */}
        {(employee.platforms ?? []).length > 0 && (
          <div className="px-5 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Platforms</span>
            {(employee.platforms ?? []).map(({ platform }) => (
              <span
                key={platform.name}
                className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded font-medium"
              >
                {platform.name}
              </span>
            ))}
          </div>
        )}

        {/* ── Non-billable employees (Growth, HR, Finance) ─────────────── */}
        {isNonBillable ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
            <div className="w-full bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800 rounded-xl p-4 text-left">
              <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">Effective allocation</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">100%</div>
              <div className="text-[10px] text-amber-500 mt-0.5">Non-billable, always engaged</div>
            </div>
            <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <TrendingUp size={22} className="text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {employee.function?.name} team member
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {employee.function?.name} employees are not tracked in sprint allocations — they are considered fully
                engaged at all times.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Tabs ───────────────────────────────────────────────────── */}
            <div className="flex border-b border-gray-100 dark:border-gray-700 px-5 pt-3">
              <button
                onClick={() => setActiveTab('trend')}
                className={cn(
                  'flex items-center gap-1.5 pb-2 text-xs font-semibold border-b-2 mr-5 transition-colors',
                  activeTab === 'trend'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                )}
              >
                <BarChart2 size={12} />
                Allocation Trend
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={cn(
                  'flex items-center gap-1.5 pb-2 text-xs font-semibold border-b-2 mr-5 transition-colors',
                  activeTab === 'activity'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                )}
              >
                <Activity size={12} />
                Activity Log
              </button>
              {showAllocateTab && (
                <button
                  onClick={() => setActiveTab('allocate')}
                  className={cn(
                    'flex items-center gap-1.5 pb-2 text-xs font-semibold border-b-2 transition-colors',
                    activeTab === 'allocate'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-400 hover:text-gray-600',
                  )}
                >
                  <Plus size={12} />
                  Allocate
                </button>
              )}
            </div>

            {/* ── Trend tab ─────────────────────────────────────────────── */}
            {activeTab === 'trend' && (
              <>
                <div className="px-5 pt-4 pb-2">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Year</span>
                    <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                      <button
                        onClick={() => setYear((y) => y - 1)}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-10 text-center">
                        {year}
                      </span>
                      <button
                        onClick={() => setYear((y) => y + 1)}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Summary row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{avg_allocation}%</div>
                      <div className="text-[10px] text-blue-400 dark:text-blue-500 font-medium mt-0.5">
                        Avg utilisation
                      </div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/40 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        {activeSprints.filter((s) => s.total_pct >= 80).length}
                      </div>
                      <div className="text-[10px] text-green-400 dark:text-green-500 font-medium mt-0.5">
                        High-util sprints
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-gray-600 dark:text-gray-400">{activeSprints.length}</div>
                      <div className="text-[10px] text-gray-400 font-medium mt-0.5">Active sprints</div>
                    </div>
                  </div>
                </div>

                {/* Sprint-by-sprint bars */}
                <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
                  {isLoading ? (
                    <div className="py-8 text-center text-sm text-gray-400">Loading trend...</div>
                  ) : activeSprints.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">No allocations in {year}</div>
                  ) : (
                    activeSprints.map((sprint) => (
                      <div
                        key={sprint.sprint_id}
                        className="rounded-xl border border-gray-100 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              S{sprint.sprint_number}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(sprint.start_date).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                              })}
                              {' – '}
                              {new Date(sprint.end_date).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                          </div>
                        </div>
                        <UtilBar pct={sprint.total_pct} max={maxPct} />
                        {/* Project breakdown */}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {sprint.projects.map((p) => (
                            <span
                              key={p.project_id}
                              className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 px-1.5 py-0.5 rounded-full"
                            >
                              {p.brand_name} · {p.pct}%
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* ── Activity tab ───────────────────────────────────────────── */}
            {activeTab === 'activity' && <ActivityTab employeeId={employee.id} />}

            {/* ── Allocate tab ─────────────────────────────────────────────── */}
            {activeTab === 'allocate' && showAllocateTab && (
              <AllocateTab employeeId={employee.id} employeeName={employee.name} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
