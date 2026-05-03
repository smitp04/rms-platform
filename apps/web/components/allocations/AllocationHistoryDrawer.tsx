'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { format } from 'date-fns';

interface AuditEntry {
  id: string;
  action: string;
  changed_by: string;
  actor_name: string;
  actor_role: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: 'Allocated', color: 'text-green-600 bg-green-50' },
  update: { label: 'Updated', color: 'text-blue-600 bg-blue-50' },
  delete: { label: 'Removed', color: 'text-red-600 bg-red-50' },
};

export function AllocationHistoryDrawer({
  allocationId,
  onClose,
}: {
  allocationId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['allocation-history', allocationId],
    queryFn: () =>
      fetch(`/api/v1/allocations/${allocationId}/history`).then((r) => r.json()),
    staleTime: 30_000,
  });

  const entries: AuditEntry[] = data?.data ?? [];

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true));
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, 350);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={cn('absolute inset-0 -z-10 transition-colors duration-350', isOpen ? 'bg-black/25' : 'bg-black/0')}
        onClick={handleClose}
      />
      <div className={cn(
        'w-full max-w-sm bg-white dark:bg-gray-900 shadow-xl flex flex-col h-full border-l border-gray-200 dark:border-gray-700 transition-transform duration-350 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Allocation History</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isLoading ? (
            <div className="text-sm text-gray-400 text-center py-8">Loading history...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-8">No history found</div>
          ) : (
            entries.map((entry) => {
              const action = ACTION_LABELS[entry.action] ?? {
                label: entry.action,
                color: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800',
              };
              const oldPct = (entry.old_value as { allocation_percentage?: number } | null)
                ?.allocation_percentage;
              const newPct = (entry.new_value as { allocation_percentage?: number } | null)
                ?.allocation_percentage;

              return (
                <div key={entry.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${action.color}`}
                    >
                      {action.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>

                  {entry.action === 'update' && oldPct !== undefined && newPct !== undefined && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Changed from{' '}
                      <span className="font-semibold">{oldPct}%</span> →{' '}
                      <span className="font-semibold">{newPct}%</span>
                    </div>
                  )}

                  {entry.action === 'create' && newPct !== undefined && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Allocated at <span className="font-semibold">{newPct}%</span>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    by{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{entry.actor_name}</span>
                    <span className="text-gray-400"> · {entry.actor_role}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 -z-10"
        onClick={onClose}
      />
    </div>
  );
}
