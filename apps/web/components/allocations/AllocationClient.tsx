'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { readUrlParams, useSyncUrlParams } from '@/lib/hooks/useFilterParams';
import { cn } from '@/lib/utils/cn';
import { SprintBandwidthPanel } from './SprintBandwidthPanel';

const AllocationGantt = dynamic(() => import('./AllocationGantt').then((m) => ({ default: m.AllocationGantt })), {
  ssr: false,
  loading: () => <TableSkeleton />,
});

interface SelectedSprint {
  sprint_id: string;
  label: string;
  start_date: string | Date;
  end_date: string | Date;
}

interface GanttRow {
  project: {
    id: string;
    deal_name: string;
    zoho_deal_id?: string | null;
    brand_name: string;
    status: string;
    billing_model?: string;
    devx_pillar?: string;
    date_range: string | null;
    project_manager_id: string | null;
    project_manager: string | null;
    growth_consultant: string | null;
    start_date: string | Date | null;
    end_date: string | Date | null;
  };
  sprints: any[];
}

const STATUS_OPTIONS = ['ACTIVE', 'UPCOMING', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const BILLING_OPTIONS = [
  { value: 'TIME_AND_MATERIAL', label: 'Time & Material' },
  { value: 'FIXED_PRICE', label: 'Fixed Price' },
  { value: 'RETAINER', label: 'Retainer' },
];
const PILLAR_OPTIONS = [
  { value: 'CUSTOMER_INTERACTION', label: 'Customer Interaction' },
  { value: 'MARKETING_AUTOMATION', label: 'Marketing Automation' },
  { value: 'AI_OPS', label: 'AI Ops' },
  { value: 'ENTERPRISE_ARCHITECTURE', label: 'Enterprise Architecture' },
];

export function AllocationClient({
  serverParams,
  initialPmEmployees,
  initialGrowthEmployees,
  initialAccounts,
}: {
  serverParams?: Record<string, string | string[] | undefined>;
  initialPmEmployees?: { id: string; name: string }[];
  initialGrowthEmployees?: { id: string; name: string }[];
  initialAccounts?: string[];
} = {}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const urlDefaults = {
    year: new Date().getFullYear(),
    search: '',
    csm: '',
    status: 'ACTIVE',
    billing: '',
    pillar: '',
    account: '',
    growth: '',
    allocated: false,
    unallocated: false,
  };
  const init = readUrlParams(urlDefaults, serverParams);
  const [year, setYear] = useState(init.year);
  const [selectedSprint, setSelectedSprint] = useState<SelectedSprint | null>(null);
  const [projectSearch, setProjectSearch] = useState(init.search);
  const bandwidthPanelRef = useRef<HTMLDivElement>(null);
  const [csmFilter, setCsmFilter] = useState(init.csm);
  const [statusFilter, setStatusFilter] = useState(init.status);
  const [billingFilter, setBillingFilter] = useState(init.billing);
  const [pillarFilter, setPillarFilter] = useState(init.pillar);
  const [accountFilter, setAccountFilter] = useState(init.account);
  const [growthFilter, setGrowthFilter] = useState(init.growth);
  const [allocatedOnly, setAllocatedOnly] = useState(init.allocated);
  const [unallocatedOnly, setUnallocatedOnly] = useState(init.unallocated);
  useSyncUrlParams(
    {
      year,
      search: projectSearch,
      csm: csmFilter,
      status: statusFilter,
      billing: billingFilter,
      pillar: pillarFilter,
      account: accountFilter,
      growth: growthFilter,
      allocated: allocatedOnly,
      unallocated: unallocatedOnly,
    },
    urlDefaults,
  );

  // Scroll to bandwidth panel after its content has fully rendered.
  // We debounce via ResizeObserver so the scroll fires only once the
  // panel height stabilises (header + data rows all painted).
  useEffect(() => {
    if (!selectedSprint) return;
    const el = bandwidthPanelRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        observer.disconnect();
      }, 300);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [selectedSprint]);

  const today = new Date();
  const todayYear = today.getFullYear();
  const quarterParam = year === todayYear ? Math.floor(today.getMonth() / 3) + 1 : null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gantt-projects', year, quarterParam],
    queryFn: () => {
      const url = new URL('/api/v1/allocations/gantt-projects', window.location.origin);
      url.searchParams.set('year', String(year));
      url.searchParams.set('status', 'ACTIVE,UPCOMING,ON_HOLD,COMPLETED,CANCELLED');
      if (quarterParam) url.searchParams.set('quarter', String(quarterParam));
      return fetch(url.pathname + url.search, { cache: 'no-store' }).then((r) => r.json());
    },
    staleTime: 30_000,
  });

  const allRows: GanttRow[] = data?.data?.rows ?? [];
  const sprintMeta = data?.data?.sprints ?? [];
  const canEdit =
    session?.user?.system_role === 'ADMIN' ||
    session?.user?.system_role === 'POD_LEAD' ||
    session?.user?.system_role === 'CSM';

  // Fetch only CSM/PM employees for the dropdown
  const { data: empData } = useQuery({
    queryKey: ['employees-for-pm-filter'],
    queryFn: () => fetch('/api/v1/employees?is_pm=true&status=ACTIVE').then((r) => r.json()),
    staleTime: 300_000,
    ...(initialPmEmployees ? { initialData: { data: initialPmEmployees } } : {}),
  });
  const pmEmployees: { id: string; name: string }[] = empData?.data ?? [];

  // Unique accounts for the account filter dropdown
  // Derive accounts from gantt rows; use initialAccounts only while data is loading for stable select width
  const accounts = useMemo(() => {
    if (!allRows.length) return initialAccounts ?? [];
    const set = new Set<string>();
    for (const row of allRows) {
      if (row.project.brand_name) set.add(row.project.brand_name);
    }
    return [...set].sort();
  }, [allRows, initialAccounts]);

  // Load all Growth function employees for filter dropdown
  const { data: growthEmpData } = useQuery({
    queryKey: ['growth-employees-filter'],
    queryFn: () => fetch('/api/v1/employees?function_names=Growth&status=ACTIVE').then((r) => r.json()),
    staleTime: 300_000,
    ...(initialGrowthEmployees ? { initialData: { data: initialGrowthEmployees } } : {}),
  });
  const growthConsultants: string[] = useMemo(
    () => (growthEmpData?.data ?? []).map((e: { name: string }) => e.name).sort(),
    [growthEmpData],
  );

  // Clear account filter if it no longer exists in the real data (was from initialAccounts during SSR)
  useEffect(() => {
    if (accountFilter && allRows.length && !accounts.includes(accountFilter)) {
      setAccountFilter('');
    }
  }, [accounts, accountFilter, allRows.length]);

  // Client-side filtering
  const rows = useMemo(() => {
    let filtered = allRows;

    if (projectSearch) {
      const q = projectSearch.toLowerCase();
      filtered = filtered.filter(
        (row) =>
          row.project.deal_name.toLowerCase().includes(q) ||
          row.project.brand_name.toLowerCase().includes(q) ||
          (row.project.zoho_deal_id ?? '').toLowerCase().includes(q),
      );
    }

    if (csmFilter === '__none__') {
      filtered = filtered.filter((row) => !row.project.project_manager_id);
    } else if (csmFilter) {
      filtered = filtered.filter((row) => row.project.project_manager_id === csmFilter);
    }

    if (statusFilter) {
      filtered = filtered.filter((row) => row.project.status === statusFilter);
    }

    if (billingFilter) {
      filtered = filtered.filter((row) => row.project.billing_model === billingFilter);
    }

    if (pillarFilter) {
      filtered = filtered.filter((row) => row.project.devx_pillar === pillarFilter);
    }

    if (accountFilter) {
      filtered = filtered.filter((row) => row.project.brand_name === accountFilter);
    }

    if (growthFilter) {
      filtered = filtered.filter((row) => row.project.growth_consultant === growthFilter);
    }

    if (allocatedOnly) {
      filtered = filtered.filter((row) => row.sprints.length > 0);
    }

    if (unallocatedOnly) {
      filtered = filtered.filter((row) => row.sprints.length === 0);
    }

    filtered.sort((a, b) => a.project.brand_name.localeCompare(b.project.brand_name));

    return filtered;
  }, [
    allRows,
    projectSearch,
    csmFilter,
    statusFilter,
    billingFilter,
    pillarFilter,
    accountFilter,
    growthFilter,
    allocatedOnly,
    unallocatedOnly,
  ]);

  const hasAnyFilter = !!(
    projectSearch ||
    csmFilter ||
    statusFilter ||
    billingFilter ||
    pillarFilter ||
    accountFilter ||
    growthFilter ||
    allocatedOnly ||
    unallocatedOnly
  );

  function clearAllFilters() {
    setProjectSearch('');
    setCsmFilter('');
    setStatusFilter('');
    setBillingFilter('');
    setPillarFilter('');
    setAccountFilter('');
    setGrowthFilter('');
    setAllocatedOnly(false);
    setUnallocatedOnly(false);
  }

  return (
    <div className="space-y-4">
      {/* Mobile header with year */}
      <div className="sm:hidden mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Allocations {year}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setYear((y) => y - 1);
                setSelectedSprint(null);
              }}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                setYear((y) => y + 1);
                setSelectedSprint(null);
              }}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage team allocations across projects and sprints
        </p>
      </div>

      {/* Controls — Desktop */}
      <div className="hidden sm:flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-sm">
          <button
            onClick={() => {
              setYear((y) => y - 1);
              setSelectedSprint(null);
            }}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-12 text-center">{year}</span>
          <button
            onClick={() => {
              setYear((y) => y + 1);
              setSelectedSprint(null);
            }}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search project or deal ID..."
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            className="pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {projectSearch && (
            <button
              type="button"
              onClick={() => setProjectSearch('')}
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
            'min-w-[120px] select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
            !statusFilter ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300',
          )}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>

        <select
          value={csmFilter}
          onChange={(e) => setCsmFilter(e.target.value)}
          className={cn(
            'min-w-[120px] select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
            csmFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
          )}
        >
          <option value="">All CSMs</option>
          <option value="__none__">No CSM</option>

          {pmEmployees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>

        <select
          value={growthFilter}
          onChange={(e) => setGrowthFilter(e.target.value)}
          className={cn(
            'min-w-[120px] select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
            growthFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
          )}
        >
          <option value="">All Growth</option>

          {growthConsultants.map((gc) => (
            <option key={gc} value={gc}>
              {gc}
            </option>
          ))}
        </select>

        <select
          value={billingFilter}
          onChange={(e) => setBillingFilter(e.target.value)}
          className={cn(
            'min-w-[120px] select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
            !billingFilter ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300',
          )}
        >
          <option value="">All billing</option>
          {BILLING_OPTIONS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        <select
          value={pillarFilter}
          onChange={(e) => setPillarFilter(e.target.value)}
          className={cn(
            'min-w-[120px] select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
            !pillarFilter ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300',
          )}
        >
          <option value="">All pillars</option>
          {PILLAR_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className={cn(
            'w-[180px] truncate min-w-[120px] select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
            accountFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
          )}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {/* Has allocations toggle */}
        <button
          onClick={() => {
            setAllocatedOnly((v) => !v);
            setUnallocatedOnly(false);
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            allocatedOnly
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400'
          }`}
        >
          <Filter size={13} />
          Has Allocations
        </button>

        {/* No allocations toggle */}
        <button
          onClick={() => {
            setUnallocatedOnly((v) => !v);
            setAllocatedOnly(false);
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            unallocatedOnly
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400'
          }`}
        >
          <Filter size={13} />
          No Allocations
        </button>

        {selectedSprint && (
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
            Viewing bandwidth for {selectedSprint.label}
          </span>
        )}

        {!isLoading && hasAnyFilter && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {rows.length} of {allRows.length} project{allRows.length !== 1 ? 's' : ''}
            </span>
            <button onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700 font-medium">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Controls — Mobile */}
      <div className="sm:hidden space-y-2">
        {/* Search full width */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search project or deal ID..."
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {projectSearch && (
            <button
              type="button"
              onClick={() => setProjectSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {/* Row: ACTIVE + All CSMs + All Growth */}
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={cn(
              'flex-1 min-w-0 select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              !statusFilter ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300',
            )}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select
            value={csmFilter}
            onChange={(e) => setCsmFilter(e.target.value)}
            className={cn(
              'flex-1 min-w-0 select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              csmFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All CSMs</option>
            <option value="__none__">No CSM</option>
            {csmFilter && csmFilter !== '__none__' && !pmEmployees.find((e) => e.id === csmFilter) && (
              <option value={csmFilter} disabled hidden />
            )}
            {pmEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
          <select
            value={growthFilter}
            onChange={(e) => setGrowthFilter(e.target.value)}
            className={cn(
              'flex-1 min-w-0 select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              growthFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All Growth</option>
            {growthFilter && !growthConsultants.includes(growthFilter) && (
              <option value={growthFilter} disabled hidden />
            )}
            {growthConsultants.map((gc) => (
              <option key={gc} value={gc}>
                {gc}
              </option>
            ))}
          </select>
        </div>
        {/* Row: All billing + All pillars + All accounts */}
        <div className="flex items-center gap-2">
          <select
            value={billingFilter}
            onChange={(e) => setBillingFilter(e.target.value)}
            className={cn(
              'flex-1 min-w-0 select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              billingFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All billing</option>
            {BILLING_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={pillarFilter}
            onChange={(e) => setPillarFilter(e.target.value)}
            className={cn(
              'flex-1 min-w-0 select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              pillarFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All pillars</option>
            {PILLAR_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className={cn(
              'flex-1 min-w-0 select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              accountFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All accounts</option>
            {accountFilter && !accounts.includes(accountFilter) && <option value={accountFilter} disabled hidden />}
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {/* Toggle buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setAllocatedOnly((v) => !v);
              setUnallocatedOnly(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              allocatedOnly
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400'
            }`}
          >
            <Filter size={13} />
            Has Allocations
          </button>
          <button
            onClick={() => {
              setUnallocatedOnly((v) => !v);
              setAllocatedOnly(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              unallocatedOnly
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400'
            }`}
          >
            <Filter size={13} />
            No Allocations
          </button>
          {selectedSprint && (
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
              Viewing bandwidth for {selectedSprint.label}
            </span>
          )}
          {!isLoading && hasAnyFilter && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {rows.length} of {allRows.length} project{allRows.length !== 1 ? 's' : ''}
              </span>
              <button onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700 font-medium">
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Gantt */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <div className="bg-red-50 rounded-xl border border-red-200 p-8 text-center text-sm text-red-600">
          Failed to load data. Please refresh.
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center shadow-sm">
          <p className="text-sm text-gray-400">
            {hasAnyFilter ? 'No projects match your filters.' : `No active projects found for ${year}.`}
          </p>
          {!hasAnyFilter && (
            <p className="text-xs text-gray-300 mt-1">Add projects with status Active or Upcoming to see them here.</p>
          )}
        </div>
      ) : (
        <AllocationGantt
          rows={rows}
          sprintMeta={sprintMeta}
          year={year}
          actorRole={session?.user?.system_role ?? 'EMPLOYEE'}
          actorPodId={session?.user?.pod_id}
          selectedSprintId={selectedSprint?.sprint_id ?? null}
          onSprintSelect={(s) => setSelectedSprint(s)}
          isFiltered={hasAnyFilter}
        />
      )}

      {/* Sprint bandwidth panel — rendered below Gantt when a sprint is selected */}
      {selectedSprint && (
        <div ref={bandwidthPanelRef}>
          <SprintBandwidthPanel
            sprint={{
              id: selectedSprint.sprint_id,
              label: selectedSprint.label,
              start_date: selectedSprint.start_date,
              end_date: selectedSprint.end_date,
            }}
            sprints={sprintMeta.map((s: any) => ({
              id: s.sprint_id,
              label: s.label,
              start_date: s.start_date,
              end_date: s.end_date,
            }))}
            onSprintChange={(s) =>
              setSelectedSprint({
                sprint_id: s.id,
                label: s.label,
                start_date: s.start_date,
                end_date: s.end_date,
              })
            }
            canEdit={canEdit}
            onClose={() => setSelectedSprint(null)}
            onAllocated={() => {
              queryClient.invalidateQueries({ queryKey: ['gantt-projects'] });
            }}
          />
        </div>
      )}
    </div>
  );
}
