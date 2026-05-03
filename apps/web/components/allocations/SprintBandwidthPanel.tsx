'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { AllocationModal } from './AllocationModal';

interface SprintInfo {
  id: string;
  label: string;
  start_date: string | Date;
  end_date: string | Date;
}

interface BandwidthRow {
  id: string;
  name: string;
  avatar_url?: string | null;
  function: string | null;
  role: string | null;
  pod: string | null;
  pod_id: string | null;
  allocated_pct: number;
  available_pct: number;
  allocations: {
    allocation_id: string;
    project_id: string;
    brand_name: string;
    deal_name: string;
    allocation_percentage: number;
    is_bench?: boolean;
  }[];
}

interface Props {
  sprint: SprintInfo;
  sprints?: SprintInfo[];
  onSprintChange?: (sprint: SprintInfo) => void;
  projectId?: string;
  onClose: () => void;
  onAllocated: () => void;
  canEdit: boolean;
}

function AvailBar({ pct }: { pct: number }) {
  const color = pct >= 50 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-red-400';
  const textColor = pct >= 50 ? 'text-green-700' : pct > 0 ? 'text-amber-700' : 'text-red-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('text-xs font-semibold tabular-nums', textColor)}>{pct}%</span>
    </div>
  );
}

export function SprintBandwidthPanel({
  sprint,
  sprints,
  onSprintChange,
  projectId,
  onClose,
  onAllocated,
  canEdit,
}: Props) {
  const queryClient = useQueryClient();
  const [functionFilter, setFunctionFilter] = useState('');
  const [podFilter, setPodFilter] = useState('');
  const [minAvailFilter, setMinAvailFilter] = useState(50);
  const [benchOnly, setBenchOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [allocateEmployee, setAllocateEmployee] = useState<{
    id: string;
    name: string;
    available_pct: number;
  } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sprint-bandwidth', sprint.id],
    queryFn: () => fetch(`/api/v1/sprints/${sprint.id}/bandwidth`, { cache: 'no-store' }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const allRows: BandwidthRow[] = data?.data?.rows ?? [];

  // Derive unique function names for the dropdown
  const functionOptions = Array.from(new Set(allRows.map((r) => r.function).filter(Boolean))) as string[];

  // Derive unique pod names for the dropdown
  const podOptions = Array.from(
    new Map(allRows.filter((r) => r.pod_id && r.pod).map((r) => [r.pod_id!, r.pod!])).entries(),
  ).map(([id, name]) => ({ id, name }));

  // Client-side filtering — search matches name or pod name
  const filtered = allRows.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.pod?.toLowerCase().includes(q)) return false;
    }
    if (functionFilter && r.function !== functionFilter) return false;
    if (podFilter && r.pod_id !== podFilter) return false;
    if (r.available_pct < minAvailFilter) return false;
    if (benchOnly && !r.allocations.some((a) => a.is_bench)) return false;
    return true;
  });

  const startDate = new Date(sprint.start_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  const endDate = new Date(sprint.end_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Open Bandwidth —</h3>
              {sprints && sprints.length > 0 && onSprintChange ? (
                <select
                  value={sprint.id}
                  onChange={(e) => {
                    const next = sprints.find((s) => s.id === e.target.value);
                    if (next) onSprintChange(next);
                  }}
                  className="select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-2.5 pr-8 py-1 text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sprint.label}</h3>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {startDate} – {endDate} · {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-36">
              <input
                type="text"
                placeholder="Search name or pod..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <select
              value={functionFilter}
              onChange={(e) => setFunctionFilter(e.target.value)}
              className="select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-2.5 pr-8 py-1.5 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All functions</option>
              {functionOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              value={podFilter}
              onChange={(e) => setPodFilter(e.target.value)}
              className="select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-2.5 pr-8 py-1.5 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All pods</option>
              {podOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={minAvailFilter}
              onChange={(e) => setMinAvailFilter(Number(e.target.value))}
              className="select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-2.5 pr-8 py-1.5 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>Any bandwidth</option>
              {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
                <option key={v} value={v}>
                  {v}%+ free
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setBenchOnly((v) => !v)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                benchOnly
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-amber-400 hover:text-amber-600',
              )}
              title="Show only employees on bench"
            >
              Bench
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors rounded"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No employees match the current filters.</div>
        ) : (
          <div className="overflow-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Employee
                  </th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Function / Role
                  </th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Pod
                  </th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Allocated
                  </th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Available
                  </th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Current projects
                  </th>
                  {canEdit && <th className="w-28 px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white">
                          {row.name[0]}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100 text-xs">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs text-gray-600 dark:text-gray-400">{row.function ?? '—'}</div>
                      <div className="text-[10px] text-gray-400">{row.role ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{row.pod ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                        {row.allocated_pct}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <AvailBar pct={row.available_pct} />
                    </td>
                    <td className="px-4 py-2.5">
                      {row.allocations.length === 0 ? (
                        <span className="text-[10px] text-gray-300 italic">Unallocated</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.allocations.map((a) => (
                            <span
                              key={a.allocation_id}
                              className={cn(
                                'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium border',
                                a.is_bench
                                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/70'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent',
                              )}
                              title={a.is_bench ? `${a.brand_name} — on bench for this allocation` : a.brand_name}
                            >
                              {a.brand_name}
                              <span className={a.is_bench ? 'text-amber-500' : 'text-gray-400'}>
                                {a.allocation_percentage}%
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2.5">
                        <button
                          disabled={row.available_pct === 0}
                          onClick={() =>
                            setAllocateEmployee({
                              id: row.id,
                              name: row.name,
                              available_pct: row.available_pct,
                            })
                          }
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                            row.available_pct === 0
                              ? 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40',
                          )}
                        >
                          <UserPlus size={11} />
                          Allocate
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {allocateEmployee && (
        <AllocationModal
          employeeId={allocateEmployee.id}
          employeeName={allocateEmployee.name}
          sprintId={sprint.id}
          projectId={projectId}
          available={allocateEmployee.available_pct}
          mode="add"
          onClose={() => setAllocateEmployee(null)}
          onSaved={() => {
            setAllocateEmployee(null);
            refetch();
            onAllocated();
            queryClient.invalidateQueries({ queryKey: ['gantt-projects'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </>
  );
}
