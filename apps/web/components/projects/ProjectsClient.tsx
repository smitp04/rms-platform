'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronRight, X } from 'lucide-react';

import { useEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { readUrlParams, useSyncUrlParams } from '@/lib/hooks/useFilterParams';
import { cn } from '@/lib/utils/cn';
import { ProjectDetailDrawer } from './ProjectDetailDrawer';

const PAGE_SIZE = 25;

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

interface ProjectRecord {
  id: string;
  deal_name: string;
  status: string;
  devx_pillar?: string;
  start_date?: string | null;
  revenue_cents?: number;
  account?: { brand_name: string };
  project_manager?: { id: string; name: string } | null;
  growth_consultant?: { id: string; name: string } | null;
}

export function ProjectsClient({
  serverParams,
  initialPmEmployees,
  initialGrowthConsultants,
}: {
  serverParams?: Record<string, string | string[] | undefined>;
  initialPmEmployees?: { id: string; name: string }[];
  initialGrowthConsultants?: { id: string; name: string }[];
} = {}) {
  const queryClient = useQueryClient();
  const urlDefaults = { search: '', status: 'ACTIVE', pm: '', growth: '', page: 1 };
  const init = readUrlParams(urlDefaults, serverParams);
  const [search, setSearch] = useState(init.search);
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState(init.status);
  const [pmFilter, setPmFilter] = useState(init.pm);
  const [growthFilter, setGrowthFilter] = useState(init.growth);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [page, setPage] = useState(init.page);
  const preFilterPage = useRef(1);
  const wasFiltered = useRef(false);
  useSyncUrlParams({ search, status: statusFilter, pm: pmFilter, growth: growthFilter, page }, urlDefaults);

  // Load employees for PM filter dropdown (only actual project managers)
  const { data: empData } = useQuery({
    queryKey: ['employees-list-for-pm-filter'],
    queryFn: () => fetch('/api/v1/employees?is_pm=true&status=ACTIVE').then((r) => r.json()),
    staleTime: 300_000,
    ...(initialPmEmployees ? { initialData: { data: initialPmEmployees } } : {}),
  });
  const allEmployees: { id: string; name: string }[] = empData?.data ?? [];

  // Load all Growth function employees for filter dropdown
  const { data: growthData } = useQuery({
    queryKey: ['growth-employees-filter'],
    queryFn: () => fetch('/api/v1/employees?function_names=Growth&status=ACTIVE').then((r) => r.json()),
    staleTime: 300_000,
    ...(initialGrowthConsultants ? { initialData: { data: initialGrowthConsultants } } : {}),
  });
  const growthConsultants: { id: string; name: string }[] = growthData?.data ?? [];

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (statusFilter) params.set('status', statusFilter);
  if (pmFilter) params.set('project_manager_id', pmFilter);
  if (growthFilter) params.set('growth_consultant_id', growthFilter);
  params.set('page', String(page));
  params.set('page_size', String(PAGE_SIZE));

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['projects', debouncedSearch, statusFilter, pmFilter, growthFilter, page],
    queryFn: () => fetch(`/api/v1/projects?${params.toString()}`).then((r) => r.json()),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const paginated: ProjectRecord[] = data?.data?.data ?? [];
  const totalItems = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  // Prefetch next page for instant transitions
  useEffect(() => {
    if (page < totalPages) {
      const nextParams = new URLSearchParams(params);
      nextParams.set('page', String(page + 1));
      queryClient.prefetchQuery({
        queryKey: ['projects', debouncedSearch, statusFilter, pmFilter, growthFilter, page + 1],
        queryFn: () => fetch(`/api/v1/projects?${nextParams.toString()}`).then((r) => r.json()),
        staleTime: 30_000,
      });
    }
  }, [page, totalPages, debouncedSearch, statusFilter, pmFilter, growthFilter]);

  // Save/restore page when filters change (uses debouncedSearch so search timing is stable)
  const isFiltered = !!(debouncedSearch || statusFilter || pmFilter || growthFilter);
  useEffect(() => {
    if (isFiltered && !wasFiltered.current) {
      preFilterPage.current = page;
      wasFiltered.current = true;
      setPage(1);
    } else if (!isFiltered && wasFiltered.current) {
      wasFiltered.current = false;
      setPage(preFilterPage.current);
    }
  }, [debouncedSearch, statusFilter, pmFilter, growthFilter]);

  return (
    <div className="space-y-4">
      {/* Filters + actions */}
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <div className="relative w-full sm:w-56">
            <input
              type="text"
              placeholder="Search by deal or brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500"
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
              'select-chevron border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              !statusFilter ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100',
            )}
          >
            <option value="">All statuses</option>
            {['UPCOMING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select
            value={pmFilter}
            onChange={(e) => setPmFilter(e.target.value)}
            className={cn(
              'select-chevron border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              pmFilter ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All CSMs</option>
            <option value="__none__">No CSM</option>
            {allEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
          <select
            value={growthFilter}
            onChange={(e) => setGrowthFilter(e.target.value)}
            className={cn(
              'select-chevron border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900',
              growthFilter ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <option value="">All Growth</option>
            {growthConsultants.map((gc) => (
              <option key={gc.id} value={gc.id}>
                {gc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && (
            <span className="text-xs text-gray-400">
              {totalItems} project{totalItems !== 1 ? 's' : ''}
              {isFetching && !isLoading && <span className="ml-2 text-blue-400">updating…</span>}
            </span>
          )}
        </div>
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
        ) : totalItems === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No projects found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Deal / Brand
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Pillar
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  PM
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Start
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {paginated.map((project) => (
                <tr
                  key={project.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {project.deal_name}
                      {project.account?.brand_name ? (
                        <span className="text-gray-400 font-normal"> / {project.account.brand_name}</span>
                      ) : (
                        ''
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        STATUS_COLORS[project.status] ??
                          'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
                      )}
                    >
                      {project.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                    {PILLAR_LABELS[project.devx_pillar ?? ''] ?? project.devx_pillar ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{project.project_manager?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="w-10 py-3 pr-3 text-right text-gray-300">
                    <ChevronRight size={14} className="inline-block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <Pagination page={safePage} pageSize={PAGE_SIZE} total={totalItems} onChange={setPage} />

      {/* Project detail drawer */}
      {selectedProjectId && (
        <ProjectDetailDrawer projectId={selectedProjectId} onClose={() => setSelectedProjectId(null)} />
      )}
    </div>
  );
}
