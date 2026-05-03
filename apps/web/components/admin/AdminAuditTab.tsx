'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ExportDropdown } from './ExportDropdown';

const PAGE_SIZE = 25;

interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by: string;
  actor_name: string;
  actor_role: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  update: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  delete: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
};

const ENTITY_COLORS: Record<string, string> = {
  employee: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  project: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  allocation: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300',
  compute_cost: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  pod: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
};

function JsonBlock({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  if (!data) return <p className="text-xs text-gray-400 italic">—</p>;
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <pre className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-auto max-h-48 text-gray-700 dark:text-gray-300 leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function AdminAuditTab() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery<{ data: AuditLog[] }>({
    queryKey: ['admin-audit-logs'],
    queryFn: () => fetch('/api/v1/admin/audit-logs').then((r) => r.json()),
    staleTime: 30_000,
  });

  const logs = data?.data ?? [];
  const paginatedLogs = useMemo(() => logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [logs, page]);

  const exportColumns = [
    { header: 'Timestamp', key: 'timestamp' },
    { header: 'Entity', key: 'entity' },
    { header: 'Action', key: 'action' },
    { header: 'Changed By', key: 'actor_name' },
    { header: 'Role', key: 'actor_role' },
    { header: 'Field', key: 'field' },
    { header: 'Old Value', key: 'old_val' },
    { header: 'New Value', key: 'new_val' },
  ];

  const exportRows = useMemo(() => {
    const rows: Record<string, string | number | boolean | null | undefined>[] = [];
    for (const log of logs) {
      const base = {
        timestamp: format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
        entity: log.entity_type,
        action: log.action,
        actor_name: log.actor_name,
        actor_role: log.actor_role,
      };
      const oldVal = log.old_value ?? {};
      const newVal = log.new_value ?? {};
      const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);

      if (allKeys.size === 0) {
        rows.push({ ...base, field: '', old_val: '', new_val: '' });
        continue;
      }

      // For updates, only show fields that actually changed
      const keysToShow =
        log.action === 'update'
          ? [...allKeys].filter((k) => JSON.stringify(oldVal[k]) !== JSON.stringify(newVal[k]))
          : [...allKeys];

      if (keysToShow.length === 0) {
        rows.push({ ...base, field: '(no changes)', old_val: '', new_val: '' });
        continue;
      }

      for (const key of keysToShow) {
        const fmt = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
        rows.push({
          ...base,
          field: key,
          old_val: fmt(oldVal[key]),
          new_val: fmt(newVal[key]),
        });
      }
    }
    return rows;
  }, [logs]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Audit Log</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Recent changes across People, Projects, POD, and Allocations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <ExportDropdown filename="audit-log-report" columns={exportColumns} rows={exportRows} />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : logs.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-sm text-gray-400">No audit entries yet.</div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-8" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Timestamp
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Entity
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Action
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Changed By
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {paginatedLogs.map((log) => {
                const isOpen = expanded.has(log.id);
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => toggleExpand(log.id)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${ENTITY_COLORS[log.entity_type] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                        >
                          {log.entity_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${ACTION_COLORS[log.action] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{log.actor_name}</div>
                        <div className="text-[10px] text-gray-400">{log.actor_role}</div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${log.id}-detail`} className="bg-gray-50 dark:bg-gray-800">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <JsonBlock data={log.old_value} label="Before" />
                            <JsonBlock data={log.new_value} label="After" />
                          </div>
                          {log.ip_address && <p className="text-[10px] text-gray-400 mt-2">IP: {log.ip_address}</p>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={logs.length} onChange={setPage} />
    </div>
  );
}
