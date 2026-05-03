'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Crown, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { readUrlParams, useSyncUrlParams } from '@/lib/hooks/useFilterParams';
import { cn } from '@/lib/utils/cn';
import { EmployeeProfileDrawer } from './EmployeeProfileDrawer';

const PAGE_SIZE = 25;

// Employees with <80% allocated have >20% bandwidth open — considered "available"
const AVAILABILITY_THRESHOLD = 80;

interface EmployeeRecord {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  is_pod_lead?: boolean;
  led_pod_name?: string | null;
  current_allocation_pct?: number;
  function?: { id: string; name: string } | null;
  role?: { id: string; name: string } | null;
  pod?: { id: string; name: string; lead_id?: string | null } | null;
  platforms?: { platform: { id: string; name: string } }[];
}

type SortDir = 'asc' | 'desc' | null;

interface PaginatedResponse {
  success: boolean;
  data: {
    data: EmployeeRecord[];
    total: number;
    page: number;
    page_size: number;
  };
}

function AllocationBar({ pct, isGrowth }: { pct: number; isGrowth?: boolean }) {
  if (isGrowth) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-amber-100 rounded-full h-1.5">
          <div className="h-1.5 rounded-full bg-amber-400 w-full" />
        </div>
        <span className="text-xs text-amber-600 font-semibold w-8 text-right">100%</span>
      </div>
    );
  }

  const color =
    pct >= 100
      ? 'bg-blue-500'
      : pct >= 80
        ? 'bg-green-500'
        : pct >= 50
          ? 'bg-amber-400'
          : pct > 0
            ? 'bg-yellow-300'
            : 'bg-gray-200';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
        <div className={cn('h-1.5 rounded-full transition-all', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc') return <ArrowUp size={11} className="text-blue-500" />;
  if (dir === 'desc') return <ArrowDown size={11} className="text-blue-500" />;
  return <ArrowUpDown size={11} className="text-gray-300" />;
}

export function EmployeesClient({
  defaultAvailableFilter = false,
  sprintId,
  serverParams,
  initialFunctions,
  initialPods,
}: {
  defaultAvailableFilter?: boolean;
  sprintId?: string;
  serverParams?: Record<string, string | string[] | undefined>;
  initialFunctions?: { id: string; name: string }[];
  initialPods?: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const urlDefaults = {
    search: '',
    fn: '',
    pod: '',
    plat: '',
    minAvail: 0,
    sort: '',
    available: defaultAvailableFilter,
    page: 1,
  };
  const init = readUrlParams(urlDefaults, serverParams);
  const [search, setSearch] = useState(init.search);
  const debouncedSearch = useDebounce(search, 300);
  const [functionFilter, setFunctionFilter] = useState(init.fn);
  const [podFilter, setPodFilter] = useState(init.pod);
  const [platformFilter, setPlatformFilter] = useState<string>(init.plat as string);
  const [minAvailFilter, setMinAvailFilter] = useState<number>(Number(init.minAvail) || 0);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [allocSortDir, setAllocSortDir] = useState<SortDir>((init.sort as SortDir) || null);
  const [availableOnly, setAvailableOnly] = useState(init.available);
  const [page, setPage] = useState(init.page);
  const preFilterPage = useRef(1);
  useSyncUrlParams(
    {
      search,
      fn: functionFilter,
      pod: podFilter,
      plat: platformFilter,
      minAvail: minAvailFilter,
      sort: allocSortDir ?? '',
      available: availableOnly,
      page,
    },
    urlDefaults,
  );

  // Build query params — server handles pagination, filtering, sorting
  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (functionFilter) params.set('function_id', functionFilter);
  if (podFilter) params.set('pod_id', podFilter);
  params.set('status', 'ACTIVE');
  params.set('page', String(page));
  params.set('page_size', String(PAGE_SIZE));
  if (availableOnly) params.set('available_only', 'true');
  if (platformFilter) params.set('platform_id', platformFilter);
  if (minAvailFilter > 0) params.set('min_available', String(minAvailFilter));
  if (allocSortDir) params.set('sort_by_allocation', allocSortDir);
  if (sprintId) params.set('sprint_id', sprintId);

  const {
    data: employeeData,
    isLoading,
    isFetching,
  } = useQuery<PaginatedResponse>({
    queryKey: [
      'employees',
      debouncedSearch,
      functionFilter,
      podFilter,
      platformFilter,
      minAvailFilter,
      availableOnly,
      allocSortDir,
      page,
      sprintId,
    ],
    queryFn: () => fetch(`/api/v1/employees?${params.toString()}`).then((r) => r.json()),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: functionData } = useQuery({
    queryKey: ['functions'],
    queryFn: () => fetch('/api/v1/employees/functions').then((r) => r.json()),
    staleTime: 300_000,
    ...(initialFunctions ? { initialData: { data: initialFunctions } } : {}),
  });

  const { data: podData } = useQuery({
    queryKey: ['pods'],
    queryFn: () => fetch('/api/v1/pods').then((r) => r.json()),
    staleTime: 300_000,
    ...(initialPods ? { initialData: { data: initialPods } } : {}),
  });

  const { data: platformsData } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => fetch('/api/v1/platforms').then((r) => r.json()),
    staleTime: 300_000,
  });

  const employees: EmployeeRecord[] = employeeData?.data?.data ?? [];
  const totalItems = employeeData?.data?.total ?? 0;
  const functions: { id: string; name: string }[] = functionData?.data ?? [];
  const pods: { id: string; name: string }[] = podData?.data ?? [];
  const platforms: { id: string; name: string }[] = platformsData?.data ?? [];

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  // Prefetch next page for instant transitions
  useEffect(() => {
    if (page < totalPages) {
      const nextParams = new URLSearchParams(params);
      nextParams.set('page', String(page + 1));
      queryClient.prefetchQuery({
        queryKey: ['employees', debouncedSearch, functionFilter, podFilter, availableOnly, allocSortDir, page + 1],
        queryFn: () => fetch(`/api/v1/employees?${nextParams.toString()}`).then((r) => r.json()),
        staleTime: 30_000,
      });
    }
  }, [page, totalPages, debouncedSearch, functionFilter, podFilter, availableOnly, allocSortDir]);

  function cycleAllocSort() {
    const next: SortDir = allocSortDir === null ? 'desc' : allocSortDir === 'desc' ? 'asc' : null;
    setAllocSortDir(next);
    applyFilterPage(isDefaultFilters(search, functionFilter, podFilter, availableOnly, next));
  }

  function isDefaultFilters(s: string, fn: string, pod: string, avail: boolean, sort: SortDir) {
    return !s && !fn && !pod && !avail && !platformFilter && minAvailFilter === 0 && sort === null;
  }
  const wasDefault = useRef(isDefaultFilters(search, functionFilter, podFilter, availableOnly, allocSortDir));

  function applyFilterPage(nextDefault: boolean) {
    if (nextDefault) {
      setPage(preFilterPage.current);
    } else {
      if (wasDefault.current) preFilterPage.current = page;
      setPage(1);
    }
    wasDefault.current = nextDefault;
  }

  function handleSearch(v: string) {
    setSearch(v);
    if (v !== search) applyFilterPage(isDefaultFilters(v, functionFilter, podFilter, availableOnly, allocSortDir));
  }
  function handleFunction(v: string) {
    setFunctionFilter(v);
    applyFilterPage(isDefaultFilters(search, v, podFilter, availableOnly, allocSortDir));
  }
  function handlePod(v: string) {
    setPodFilter(v);
    applyFilterPage(isDefaultFilters(search, functionFilter, v, availableOnly, allocSortDir));
  }
  function handleAvailableToggle() {
    const next = !availableOnly;
    setAvailableOnly(next);
    applyFilterPage(isDefaultFilters(search, functionFilter, podFilter, next, allocSortDir));
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 w-full sm:w-auto sm:flex sm:contents">
            <select
              value={functionFilter}
              onChange={(e) => handleFunction(e.target.value)}
              className={cn(
                'min-w-0 sm:w-[140px] sm:flex-none select-chevron border border-gray-300 dark:border-gray-600 rounded-lg pl-2 pr-6 sm:pl-3 sm:pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 truncate',
                functionFilter ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',
              )}
            >
              <option value="">All functions</option>
              {functions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <select
              value={podFilter}
              onChange={(e) => handlePod(e.target.value)}
              className={cn(
                'min-w-0 sm:w-[140px] sm:flex-none select-chevron border border-gray-300 dark:border-gray-600 rounded-lg pl-2 pr-6 sm:pl-3 sm:pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 truncate',
                podFilter ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',
              )}
            >
              <option value="">All pods</option>
              {pods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Available filter toggle */}
            <button
              onClick={handleAvailableToggle}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex-shrink-0',
                availableOnly
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-violet-400 hover:text-violet-600',
              )}
            >
              <Zap size={13} />
              Available
            </button>

            <select
              value={minAvailFilter}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMinAvailFilter(v);
                applyFilterPage(
                  !search &&
                    !functionFilter &&
                    !podFilter &&
                    !platformFilter &&
                    v === 0 &&
                    !availableOnly &&
                    allocSortDir === null,
                );
              }}
              className={cn(
                'min-w-0 sm:w-[145px] sm:flex-none select-chevron border border-gray-300 dark:border-gray-600 rounded-lg pl-2 pr-6 sm:pl-3 sm:pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
                minAvailFilter > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',
              )}
            >
              <option value={0}>Any bandwidth</option>
              {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
                <option key={v} value={v}>
                  {v}%+ free
                </option>
              ))}
            </select>

            <select
              value={platformFilter}
              onChange={(e) => {
                const v = e.target.value;
                setPlatformFilter(v);
                applyFilterPage(
                  !search &&
                    !functionFilter &&
                    !podFilter &&
                    !v &&
                    minAvailFilter === 0 &&
                    !availableOnly &&
                    allocSortDir === null,
                );
              }}
              className={cn(
                'min-w-0 sm:w-[140px] sm:flex-none select-chevron border border-gray-300 dark:border-gray-600 rounded-lg pl-2 pr-6 sm:pl-3 sm:pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 truncate',
                platformFilter ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',
              )}
            >
              <option value="">All platforms</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isLoading && (
          <span className="text-xs text-gray-400">
            {totalItems} employee{totalItems !== 1 ? 's' : ''}
            {availableOnly && <span className="ml-1 text-violet-500 font-medium">· &gt;20% open</span>}
            {isFetching && <span className="ml-2 text-blue-400">updating…</span>}
          </span>
        )}
      </div>

      {/* Table */}
      <div
        className={cn(
          'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto',
          isFetching && !isLoading && 'opacity-75 transition-opacity',
        )}
      >
        {isLoading ? (
          <TableSkeleton />
        ) : employees.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {availableOnly ? 'No employees with >20% bandwidth open right now.' : 'No employees found'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Employee
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Function / Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Pod
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Platforms
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-44">
                  <button
                    onClick={cycleAllocSort}
                    className="flex items-center gap-1.5 hover:text-gray-700 dark:hover:text-gray-300 transition-colors group"
                  >
                    Allocation
                    <SortIcon dir={allocSortDir} />
                  </button>
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {employees.map((emp) => {
                const fnName = emp.function?.name?.toLowerCase() ?? '';
                const isGrowth = fnName === 'growth' || fnName === 'hr' || fnName === 'finance';
                const currentPct = emp.current_allocation_pct ?? 0;
                const available = isGrowth ? 0 : Math.max(0, 100 - currentPct);
                const isHighlyAvailable = !isGrowth && currentPct < AVAILABILITY_THRESHOLD;

                return (
                  <tr
                    key={emp.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    onClick={() => setSelectedEmployee(emp)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {emp.name[0]}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                            {emp.name}
                            {emp.is_pod_lead &&
                              (() => {
                                const isExec =
                                  emp.led_pod_name === 'CEO Pod' || emp.led_pod_name === 'Hallucination Station';
                                return (
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                                      isExec ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700',
                                    )}
                                  >
                                    <Crown size={10} />
                                    {emp.led_pod_name ? `${emp.led_pod_name} Lead` : 'Pod Lead'}
                                  </span>
                                );
                              })()}
                          </div>
                          <div className="text-xs text-gray-400">{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700 dark:text-gray-300">{emp.function?.name}</div>
                      <div className="text-xs text-gray-400">{emp.role?.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{emp.pod?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(emp.platforms ?? []).length === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          (emp.platforms ?? []).map(({ platform }) => (
                            <span
                              key={platform.name}
                              className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded font-medium"
                            >
                              {platform.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <AllocationBar pct={currentPct} isGrowth={isGrowth} />
                      <div
                        className={cn(
                          'text-xs mt-0.5 font-medium',
                          isGrowth ? 'text-amber-500' : isHighlyAvailable ? 'text-violet-500' : 'text-gray-400',
                        )}
                      >
                        {isGrowth ? 'Non-billable' : `${available}% available`}
                      </div>
                    </td>
                    <td className="w-10 py-3 pr-3 text-right text-gray-300">
                      <ChevronRight size={14} className="inline-block" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <Pagination page={page} pageSize={PAGE_SIZE} total={totalItems} onChange={setPage} />

      {/* Employee profile drawer */}
      {selectedEmployee && (
        <EmployeeProfileDrawer employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} />
      )}
    </div>
  );
}
