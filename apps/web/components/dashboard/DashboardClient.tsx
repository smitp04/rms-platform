'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  FolderKanban,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const LazyAllocationChart = dynamic(
  () => import('./AllocationChart'),
  {
    ssr: false,
    loading: () => (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
          Loading chart...
        </div>
      </div>
    ),
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface CurrentSprint {
  label: string;
  sprint_number: number;
  year: number;
  start_date: string;
  end_date: string;
  days_remaining: number;
  status: 'past' | 'current' | 'future' | null;
}

interface PnLSummary {
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  margin_pct: number;
}

interface HeadcountEntry {
  function_name: string;
  count: number;
}

interface ProjectEndingSoon {
  id: string;
  deal_name: string;
  brand_name: string;
  status: string;
  end_date: string;
  days_until: number;
}

interface TopProject {
  project_id: string;
  deal_name: string;
  brand_name: string;
  status: string;
  employee_count: number;
}

interface DashboardData {
  kpis: {
    total_employees: number;
    avg_allocation_pct: number;
    available_employees: number;
    projects_in_red?: number;
  };
  allocation_trend: { sprint_label: string; avg_allocation: number }[];
  current_sprint: CurrentSprint | null;
  prev_sprint_id: string | null;
  next_sprint_id: string | null;
  all_sprints: { id: string; label: string }[];
  pnl_summary?: PnLSummary;
  headcount_by_function?: HeadcountEntry[];
  projects_ending_soon?: ProjectEndingSoon[];
  top_projects?: TopProject[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type DisplayCurrency = 'INR' | 'USD';
const INR_PER_USD = 90;

function fmt(cents: number, currency: DisplayCurrency = 'INR'): string {
  const amount = currency === 'USD' ? cents / 100 / INR_PER_USD : cents / 100;
  const sym = currency === 'USD' ? '$' : '₹';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${sym}${Math.round(abs).toLocaleString()}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const FUNCTION_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899',
];

const STATUS_CHIP: Record<string, string> = {
  ACTIVE:    'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  UPCOMING:  'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  ON_HOLD:   'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  COMPLETED: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  title, value, icon: Icon, color, suffix = '', onClick, clickable = false,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  suffix?: string;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4',
        clickable && 'cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all'
      )}
      onClick={onClick}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="flex-1">
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {value}{suffix}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {title}
          {clickable && (
            <span className="text-xs text-blue-500 ml-1.5">View →</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sprint Banner ─────────────────────────────────────────────────────────────

function SprintBanner({
  sprint,
  onPrev,
  onNext,
  onSelect,
  hasPrev,
  hasNext,
  allSprints,
}: {
  sprint: CurrentSprint;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
  hasPrev: boolean;
  hasNext: boolean;
  allSprints: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Scroll the selected sprint into view when dropdown opens
  useEffect(() => {
    if (!open || !listRef.current) return;
    const active = listRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    if (active) active.scrollIntoView({ block: 'center' });
  }, [open]);

  const isPast = sprint.status === 'past';
  const isFuture = sprint.status === 'future';

  const urgency = isPast
    ? 'bg-gray-50 dark:bg-gray-900/60 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
    : isFuture
    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
    : sprint.days_remaining <= 2
    ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
    : sprint.days_remaining <= 5
    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
    : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300';

  const pillColor = isPast
    ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
    : isFuture
    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
    : sprint.days_remaining <= 2
    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
    : sprint.days_remaining <= 5
    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';

  const pillText = isPast
    ? 'Ended'
    : isFuture
    ? 'Upcoming'
    : sprint.days_remaining === 0
    ? 'Ends today'
    : `${sprint.days_remaining} day${sprint.days_remaining !== 1 ? 's' : ''} remaining`;

  return (
    <div className={cn('rounded-xl border px-4 sm:px-5 py-3', urgency)}>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors"
          >
            <Calendar size={14} className="flex-shrink-0" />
            <span className="text-sm font-semibold">{sprint.label}</span>
            <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
          </button>
        {open && (
          <div ref={listRef} className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-64 overflow-y-auto w-44">
            {allSprints.map((s) => {
              const isActive = s.label === sprint.label;
              return (
                <button
                  key={s.id}
                  data-active={isActive || undefined}
                  onClick={() => { onSelect(s.id); setOpen(false); }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors first:rounded-t-xl last:rounded-b-xl',
                    isActive
                      ? 'font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300'
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
        <span className="opacity-40 hidden sm:inline">·</span>
        <span className="text-xs hidden sm:inline">
          {fmtDate(sprint.start_date)} – {fmtDate(sprint.end_date)}, {sprint.year}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full', pillColor)}
          >
            {pillText}
          </span>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="sm:hidden text-xs mt-1 ml-9 opacity-80">
        {fmtDate(sprint.start_date)} – {fmtDate(sprint.end_date)}, {sprint.year}
      </div>
    </div>
  );
}

// ── Currency Toggle ──────────────────────────────────────────────────────────

function CurrencyToggle({ value, onChange }: { value: DisplayCurrency; onChange: (v: DisplayCurrency) => void }) {
  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
      <button
        onClick={() => onChange('INR')}
        className={cn(
          'px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors',
          value === 'INR'
            ? 'bg-white dark:bg-gray-900 shadow-sm text-blue-600'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
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
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        )}
      >
        $<span className="hidden sm:inline"> USD</span>
      </button>
    </div>
  );
}

// ── PnL Summary Strip ─────────────────────────────────────────────────────────

function PnLStrip({ pnl, currency, onCurrencyChange }: { pnl: PnLSummary; currency: DisplayCurrency; onCurrencyChange: (v: DisplayCurrency) => void }) {
  const isPositive = pnl.margin_pct >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
            {currency === 'USD'
              ? <DollarSign size={13} className="text-blue-500" />
              : <span className="text-xs font-bold text-blue-500">₹</span>}
          </div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Revenue · Sprint
          </span>
          <div className="ml-auto">
            <CurrencyToggle value={currency} onChange={onCurrencyChange} />
          </div>
        </div>
        <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{fmt(pnl.revenue_cents, currency)}</div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Users size={13} className="text-gray-500 dark:text-gray-400" />
          </div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Cost · Sprint
          </span>
        </div>
        <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{fmt(pnl.cost_cents, currency)}</div>
      </div>

      <div
        className={cn(
          'rounded-xl border p-4',
          isPositive ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700' : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center',
              isPositive ? 'bg-green-50 dark:bg-green-950/40' : 'bg-red-100 dark:bg-red-900/40'
            )}
          >
            {isPositive ? (
              <TrendingUp size={13} className="text-green-500" />
            ) : (
              <TrendingDown size={13} className="text-red-500" />
            )}
          </div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Margin · Sprint
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'text-xl font-bold',
              isPositive ? 'text-gray-900 dark:text-gray-100' : 'text-red-700 dark:text-red-400'
            )}
          >
            {fmt(pnl.margin_cents, currency)}
          </span>
          <span
            className={cn(
              'text-sm font-semibold px-1.5 py-0.5 rounded-full',
              isPositive ? 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
            )}
          >
            {pnl.margin_pct}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Headcount by Function ─────────────────────────────────────────────────────

function HeadcountWidget({
  data,
  total,
}: {
  data: HeadcountEntry[];
  total: number;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users size={14} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Headcount by Function</h3>
        <span className="ml-auto text-xs text-gray-400">{total} active</span>
      </div>

      {data.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-6">No data available</div>
      ) : (
        <div className="space-y-3">
          {data.map((fn, i) => {
            const pct = total > 0 ? Math.round((fn.count / total) * 100) : 0;
            return (
              <div key={fn.function_name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: FUNCTION_COLORS[i % FUNCTION_COLORS.length] }}
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{fn.function_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{pct}%</span>
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200 w-6 text-right">{fn.count}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: FUNCTION_COLORS[i % FUNCTION_COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Projects Ending Soon ──────────────────────────────────────────────────────

function ProjectsEndingSoonWidget({ data }: { data: ProjectEndingSoon[] }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={14} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Projects Ending Soon</h3>
        <span className="text-[10px] text-gray-400 ml-1">next 30 days</span>
      </div>

      {data.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-6">No projects ending soon</div>
      ) : (
        <div className="space-y-1">
          {data.map((p) => {
            const urgent = p.days_until <= 5;
            const soon = p.days_until <= 14;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{p.brand_name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{p.deal_name}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                      STATUS_CHIP[p.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    )}
                  >
                    {p.status}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-lg',
                      urgent
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                        : soon
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    )}
                  >
                    {p.days_until === 0 ? 'Today' : `${p.days_until}d`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Top Projects ──────────────────────────────────────────────────────────────

function TopProjectsWidget({ data }: { data: TopProject[] }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <FolderKanban size={14} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top Projects This Sprint</h3>
        <span className="text-[10px] text-gray-400 ml-1">by headcount</span>
      </div>

      {data.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-6">
          No allocation data for current sprint
        </div>
      ) : (
        <div className="space-y-1">
          {data.map((p, i) => (
            <div
              key={p.project_id}
              className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{p.brand_name}</div>
                <div className="text-[10px] text-gray-400 truncate">{p.deal_name}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                    STATUS_CHIP[p.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  )}
                >
                  {p.status}
                </span>
                <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-0.5">
                  <Users size={10} className="text-gray-400" />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{p.employee_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DashboardClient() {
  const { data: session } = useSession();
  const role = session?.user?.system_role;
  const isAdmin = role === 'ADMIN';
  const isPodLead = isAdmin || role === 'POD_LEAD';
  const isManager = isPodLead || role === 'CSM';
  const router = useRouter();
  const [sprintId, setSprintId] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('INR');

  const { data, isLoading } = useQuery<{ success: boolean; data: DashboardData }>({
    queryKey: ['dashboard', sprintId],
    queryFn: () =>
      fetch(`/api/v1/dashboard${sprintId ? `?sprint_id=${sprintId}` : ''}`, { cache: 'no-store' }).then((r) => r.json()),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 h-24" />
          ))}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 h-64" />
      </div>
    );
  }

  const kpis = data?.data?.kpis;
  const trend = data?.data?.allocation_trend ?? [];
  const currentSprint = data?.data?.current_sprint;
  const prevSprintId = data?.data?.prev_sprint_id ?? null;
  const nextSprintId = data?.data?.next_sprint_id ?? null;
  const allSprints = data?.data?.all_sprints ?? [];
  const pnlSummary = data?.data?.pnl_summary;
  const headcount = data?.data?.headcount_by_function ?? [];
  const endingSoon = data?.data?.projects_ending_soon ?? [];
  const topProjects = data?.data?.top_projects ?? [];

  const gridCols = role !== 'EMPLOYEE' ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <div className="space-y-5">

      {/* ── Sprint Banner ──────────────────────────────────────────────────── */}
      {currentSprint && (
        <SprintBanner
          sprint={currentSprint}
          onPrev={() => prevSprintId && setSprintId(prevSprintId)}
          onNext={() => nextSprintId && setSprintId(nextSprintId)}
          onSelect={(id) => setSprintId(id)}
          hasPrev={!!prevSprintId}
          hasNext={!!nextSprintId}
          allSprints={allSprints}
        />
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridCols} gap-4`}>
        <KPICard
          title="Avg Allocation — last 6 sprints"
          value={kpis?.avg_allocation_pct ?? 0}
          icon={TrendingUp}
          color="bg-emerald-500"
          suffix="%"
        />
        <KPICard
          title="Employees Available (>20%)"
          value={kpis?.available_employees ?? 0}
          icon={Users}
          color="bg-violet-500"
          clickable
          onClick={() => router.push(`/employees?available=1${sprintId ? `&sprint_id=${sprintId}` : ''}`)}
        />
        {role !== 'EMPLOYEE' && (
          <KPICard
            title="Projects in Red"
            value={kpis?.projects_in_red ?? 0}
            icon={AlertTriangle}
            color={kpis?.projects_in_red ? 'bg-red-500' : 'bg-gray-400'}
            clickable={!!kpis?.projects_in_red}
            onClick={kpis?.projects_in_red ? () => router.push('/pnl?red=1') : undefined}
          />
        )}
      </div>

      {/* ── PnL Summary Strip — Admin only ────────────────────────────────── */}
      {isAdmin && pnlSummary && (
        <PnLStrip pnl={pnlSummary} currency={displayCurrency} onCurrencyChange={setDisplayCurrency} />
      )}

      {/* ── Allocation Trend Chart + Headcount ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Team Utilisation — Last 6 Sprints
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Total allocated % ÷ total possible capacity (all employees × 100%)
          </p>
          <LazyAllocationChart data={trend} />
        </div>
        <HeadcountWidget data={headcount} total={kpis?.total_employees ?? 0} />
      </div>

      {/* ── Projects Ending Soon + Top Projects ──────────────────────────── */}
      {(isManager || isPodLead) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {isManager && (
            <ProjectsEndingSoonWidget data={endingSoon} />
          )}
          {isPodLead && <TopProjectsWidget data={topProjects} />}
        </div>
      )}

    </div>
  );
}
