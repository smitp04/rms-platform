'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { readUrlParams, useSyncUrlParams } from '@/lib/hooks/useFilterParams';
import { cn } from '@/lib/utils/cn';

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  ACTIVE: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  ON_HOLD: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  COMPLETED: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  CANCELLED: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
};

const PAGE_SIZE = 25;
const INR_PER_USD = 90;

type DisplayCurrency = 'INR' | 'USD';

interface SprintDetail {
  sprint_id: string;
  sprint_label: string;
  allocation_pct: number;
}

interface EmployeeBreakdown {
  employee_id: string;
  name: string;
  role_name: string;
  num_sprints: number;
  avg_allocation_pct: number;
  cost_cents: number;
  sprints: SprintDetail[];
}

function sprintChipColor(pct: number) {
  if (pct >= 100)
    return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800';
  if (pct >= 75)
    return 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800';
  if (pct >= 50)
    return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800';
  return 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700';
}

interface ProjectPnL {
  project_id: string;
  brand_name: string;
  deal_name: string;
  status: string;
  project_manager: string | null;
  sprint_count: number;
  deal_amount_cents?: number;
  total_revenue_cents?: number;
  total_employee_cost_cents: number;
  gross_margin_cents?: number;
  margin_pct?: number;
  is_in_red?: boolean;
  employee_breakdown: EmployeeBreakdown[];
}

// Format INR cents → display currency
function fmt(cents: number | undefined, currency: DisplayCurrency) {
  if (cents == null) return '—';
  const amount = currency === 'USD' ? cents / 100 / INR_PER_USD : cents / 100;
  const sym = currency === 'USD' ? '$' : '₹';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${sym}${Math.round(abs).toLocaleString()}`;
}

type SortKey = 'name' | 'cost' | 'revenue' | 'margin';
type SortDir = 'asc' | 'desc';

function SortIcon({ field, current, dir }: { field: SortKey; current: SortKey; dir: SortDir }) {
  if (field !== current) return <ArrowUpDown size={11} className="text-gray-300 ml-1 inline-block" />;
  return dir === 'asc' ? (
    <ArrowUp size={11} className="text-blue-500 ml-1 inline-block" />
  ) : (
    <ArrowDown size={11} className="text-blue-500 ml-1 inline-block" />
  );
}

function CurrencyToggle({ value, onChange }: { value: DisplayCurrency; onChange: (v: DisplayCurrency) => void }) {
  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
      <button
        onClick={() => onChange('INR')}
        className={cn(
          'px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors',
          value === 'INR'
            ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
        )}
      >
        ₹<span className="hidden sm:inline"> INR</span>
      </button>
      <button
        onClick={() => onChange('USD')}
        className={cn(
          'px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors',
          value === 'USD'
            ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
        )}
      >
        $<span className="hidden sm:inline"> USD</span>
      </button>
    </div>
  );
}

export function PnLClient({
  defaultRedFilter = false,
  serverParams,
  isAdmin = false,
}: {
  defaultRedFilter?: boolean;
  serverParams?: Record<string, string | string[] | undefined>;
  isAdmin?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  // Search + filter — pre-set red filter when navigating from dashboard
  const urlDefaults = {
    search: '',
    status: 'ACTIVE',
    red: defaultRedFilter,
    currency: 'INR',
    sortKey: 'name',
    sortDir: 'asc',
    page: 1,
  };
  const init = readUrlParams(urlDefaults, serverParams);
  const [search, setSearch] = useState(init.search);
  const [statusFilter, setStatusFilter] = useState(init.status);
  const [redOnlyFilter, setRedOnlyFilter] = useState(init.red);

  // Currency toggle
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(init.currency as DisplayCurrency);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>(init.sortKey as SortKey);
  const [sortDir, setSortDir] = useState<SortDir>(init.sortDir as SortDir);

  // Pagination
  const [page, setPage] = useState(init.page);
  const preFilterPage = useRef(1);
  useSyncUrlParams(
    { search, status: statusFilter, red: redOnlyFilter, currency: displayCurrency, sortKey, sortDir, page },
    urlDefaults,
  );

  const { data, isLoading } = useQuery({
    queryKey: ['pnl-summary'],
    queryFn: () => fetch('/api/v1/pnl/summary').then((r) => r.json()),
    staleTime: 60_000,
  });

  const allProjects: ProjectPnL[] = data?.data ?? [];
  const activeProjects = allProjects.filter((p) => p.employee_breakdown.length > 0);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = activeProjects;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.brand_name.toLowerCase().includes(q) ||
          p.deal_name.toLowerCase().includes(q) ||
          (p.project_manager ?? '').toLowerCase().includes(q),
      );
    }
    if (statusFilter) {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (redOnlyFilter && isAdmin) {
      list = list.filter((p) => p.is_in_red);
    }
    return list;
  }, [activeProjects, search, statusFilter, redOnlyFilter, isAdmin]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.brand_name.localeCompare(b.brand_name);
      } else if (sortKey === 'cost') {
        cmp = a.total_employee_cost_cents - b.total_employee_cost_cents;
      } else if (sortKey === 'revenue') {
        cmp = (a.total_revenue_cents ?? 0) - (b.total_revenue_cents ?? 0);
      } else if (sortKey === 'margin') {
        cmp = (a.margin_pct ?? 0) - (b.margin_pct ?? 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ── Paginate ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const pnlWasDefault = useRef(!search && !statusFilter && !redOnlyFilter);

  function pnlFilterPage(nextDefault: boolean) {
    if (nextDefault) {
      setPage(preFilterPage.current);
    } else {
      if (pnlWasDefault.current) preFilterPage.current = page;
      setPage(1);
    }
    pnlWasDefault.current = nextDefault;
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleEmployee(key: string) {
    setExpandedEmployees((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const statusOptions = ['ACTIVE', 'UPCOMING', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

  return (
    <div className="space-y-4">
      {/* Red filter banner — shown when navigated from dashboard */}
      {defaultRedFilter && redOnlyFilter && (
        <div className="flex items-center justify-between bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} />
            Showing only projects currently in the red (costs exceeding revenue)
          </span>
          <button
            onClick={() => setRedOnlyFilter(false)}
            className="text-xs text-red-500 hover:text-red-700 font-medium ml-4"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Toolbar — Desktop ─────────────────────────────────────────── */}
      <div className="hidden sm:flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search project, brand, or PM..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              pnlFilterPage(!e.target.value && !statusFilter && !redOnlyFilter);
            }}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-900"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                pnlFilterPage(!statusFilter && !redOnlyFilter);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            pnlFilterPage(!search && !e.target.value && !redOnlyFilter);
          }}
          className={cn(
            'w-[140px] select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500',
            statusFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
          )}
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>

        <CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />

        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 overflow-x-auto">
          <button
            onClick={() => handleSort('name')}
            className={cn(
              'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
              sortKey === 'name'
                ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            Name <SortIcon field="name" current={sortKey} dir={sortDir} />
          </button>
          <button
            onClick={() => handleSort('cost')}
            className={cn(
              'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
              sortKey === 'cost'
                ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            Cost <SortIcon field="cost" current={sortKey} dir={sortDir} />
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => handleSort('revenue')}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  sortKey === 'revenue'
                    ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                Revenue <SortIcon field="revenue" current={sortKey} dir={sortDir} />
              </button>
              <button
                onClick={() => handleSort('margin')}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  sortKey === 'margin'
                    ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                Margin% <SortIcon field="margin" current={sortKey} dir={sortDir} />
              </button>
            </>
          )}
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              const next = !redOnlyFilter;
              setRedOnlyFilter(next);
              pnlFilterPage(!search && !statusFilter && !next);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
              redOnlyFilter
                ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-200 hover:text-red-500',
            )}
          >
            <AlertTriangle size={13} />
            In the red
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap min-w-[80px] text-right">
          {isLoading ? '\u00A0' : `${filtered.length} project${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Toolbar — Mobile ──────────────────────────────────────────── */}
      <div className="sm:hidden space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search project, brand, or PM..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              pnlFilterPage(!e.target.value && !statusFilter && !redOnlyFilter);
            }}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-900"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                pnlFilterPage(!statusFilter && !redOnlyFilter);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              pnlFilterPage(!search && !e.target.value && !redOnlyFilter);
            }}
            className={cn(
              'min-w-[110px] select-chevron border border-gray-200 dark:border-gray-700 rounded-lg pl-2 pr-6 py-2 text-xs bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500',
              statusFilter ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />
          {isAdmin && (
            <button
              onClick={() => {
                const next = !redOnlyFilter;
                setRedOnlyFilter(next);
                pnlFilterPage(!search && !statusFilter && !next);
              }}
              className={cn(
                'flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
                redOnlyFilter
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-200 hover:text-red-500',
              )}
            >
              <AlertTriangle size={13} />
              Red
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{filtered.length} projects</span>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 overflow-x-auto">
          <button
            onClick={() => handleSort('name')}
            className={cn(
              'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
              sortKey === 'name'
                ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            Name <SortIcon field="name" current={sortKey} dir={sortDir} />
          </button>
          <button
            onClick={() => handleSort('cost')}
            className={cn(
              'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
              sortKey === 'cost'
                ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            Cost <SortIcon field="cost" current={sortKey} dir={sortDir} />
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => handleSort('revenue')}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  sortKey === 'revenue'
                    ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                Revenue <SortIcon field="revenue" current={sortKey} dir={sortDir} />
              </button>
              <button
                onClick={() => handleSort('margin')}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  sortKey === 'margin'
                    ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                Margin% <SortIcon field="margin" current={sortKey} dir={sortDir} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Project cards ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <TableSkeleton />
      ) : !activeProjects.length ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-400">
          No allocation data yet. Allocate employees to projects to see PnL.
        </div>
      ) : paginated.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-400">
          No projects match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {paginated.map((project) => {
            const isOpen = expanded.has(project.project_id);
            const isRed = project.is_in_red ?? false;

            return (
              <div
                key={project.project_id}
                className={cn(
                  'bg-white dark:bg-gray-900 rounded-xl border overflow-hidden shadow-sm',
                  isRed ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-gray-700',
                )}
              >
                {/* ── Project header row ─────────────────────────────────── */}
                <button
                  className="w-full text-left px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => toggle(project.project_id)}
                >
                  {/* Left: name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                      {isAdmin && isRed && <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />}
                      <span className="font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">
                        {project.brand_name}
                      </span>
                      <span className="text-gray-400 text-sm flex-shrink-0">·</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{project.deal_name}</span>
                      <span
                        className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
                          STATUS_COLORS[project.status] ??
                            'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
                        )}
                      >
                        {project.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      {project.sprint_count} sprint{project.sprint_count !== 1 ? 's' : ''}
                      {project.project_manager ? ` · PM: ${project.project_manager}` : ''}
                      {' · '}
                      {project.employee_breakdown.length} employee{project.employee_breakdown.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Right: KPI chips + expand arrow */}
                  <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:items-center sm:gap-6 flex-1 sm:flex-none">
                      <div className="text-left sm:text-right min-w-0 sm:min-w-[72px]">
                        <div className="text-xs text-gray-400 mb-0.5">Emp. Cost</div>
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {fmt(project.total_employee_cost_cents, displayCurrency)}
                        </div>
                      </div>

                      {isAdmin && project.total_revenue_cents != null && (
                        <>
                          <div className="text-left sm:text-right min-w-0 sm:min-w-[72px]">
                            <div className="text-xs text-gray-400 mb-0.5">Deal Value</div>
                            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              {fmt(project.deal_amount_cents, displayCurrency)}
                            </div>
                          </div>

                          <div className="text-left sm:text-right min-w-0 sm:min-w-[72px]">
                            <div className="text-xs text-gray-400 mb-0.5">Revenue</div>
                            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              {fmt(project.total_revenue_cents, displayCurrency)}
                            </div>
                          </div>

                          <div className="text-left sm:text-right min-w-0 sm:min-w-[96px]">
                            <div className="text-xs text-gray-400 mb-0.5">Margin</div>
                            <div
                              className={cn(
                                'text-sm font-bold flex items-center gap-1 sm:justify-end',
                                isRed ? 'text-red-600' : 'text-green-600',
                              )}
                            >
                              {isRed ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                              {fmt(project.gross_margin_cents, displayCurrency)}
                              {project.margin_pct != null && (
                                <span
                                  className={cn(
                                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-0.5',
                                    isRed
                                      ? 'bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400'
                                      : 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400',
                                  )}
                                >
                                  {project.margin_pct}%
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Expand/collapse */}
                    <div className="text-gray-300 ml-auto sm:ml-2">
                      {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </div>
                </button>

                {/* ── Employee breakdown (expandable) ────────────────────── */}
                <div
                  className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                  )}
                >
                  <div className="overflow-hidden">
                    <div
                      className={cn(
                        'border-t overflow-x-auto',
                        isOpen ? 'border-gray-100 dark:border-gray-700' : 'border-transparent',
                      )}
                    >
                      <table className="w-full text-sm min-w-[500px]">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                            <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              Employee
                            </th>
                            <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              Sprints
                            </th>
                            <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              Avg %
                            </th>
                            <th className="text-right px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              Cost
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                          {project.employee_breakdown
                            .slice()
                            .sort((a, b) => b.cost_cents - a.cost_cents)
                            .map((emp) => {
                              const empKey = `${project.project_id}-${emp.employee_id}`;
                              const isEmpOpen = expandedEmployees.has(empKey);
                              return (
                                <React.Fragment key={empKey}>
                                  {/* ── Employee summary row ── */}
                                  <tr
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                                    onClick={() => toggleEmployee(empKey)}
                                  >
                                    <td className="px-5 py-2.5">
                                      <div className="flex items-center gap-2">
                                        <ChevronRight
                                          size={12}
                                          className={cn(
                                            'text-gray-300 transition-transform flex-shrink-0',
                                            isEmpOpen && 'rotate-90',
                                          )}
                                        />
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                                          {emp.name[0]}
                                        </div>
                                        <div>
                                          <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                            {emp.name}
                                          </div>
                                          <div className="text-[10px] text-gray-400">{emp.role_name}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-xs text-gray-500 dark:text-gray-400">
                                      {emp.num_sprints}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                        {emp.avg_allocation_pct}%
                                      </span>
                                    </td>
                                    <td className="px-5 py-2.5 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                                      {fmt(emp.cost_cents, displayCurrency)}
                                    </td>
                                  </tr>

                                  {/* ── Sprint-level breakdown (expandable) ── */}
                                  {isEmpOpen && (
                                    <tr
                                      key={`${emp.employee_id}-sprints`}
                                      className="bg-blue-50/30 dark:bg-gray-800/50"
                                    >
                                      <td colSpan={4} className="px-5 py-3">
                                        <div className="pl-10">
                                          <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-2">
                                            Sprint allocations
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {emp.sprints.map((s) => (
                                              <span
                                                key={s.sprint_id}
                                                className={cn(
                                                  'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border',
                                                  sprintChipColor(s.allocation_pct),
                                                )}
                                              >
                                                <span className="font-bold">{s.sprint_label}</span>
                                                <span className="opacity-60">·</span>
                                                <span>{s.allocation_pct}%</span>
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                        </tbody>
                        {/* Total row */}
                        <tfoot>
                          <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                            <td
                              colSpan={3}
                              className="px-5 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                            >
                              Total employee cost
                            </td>
                            <td className="px-5 py-2 text-right text-sm font-bold text-gray-800 dark:text-gray-200">
                              {fmt(project.total_employee_cost_cents, displayCurrency)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      <Pagination page={safePage} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} />
    </div>
  );
}
