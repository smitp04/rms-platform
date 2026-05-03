'use client';

import { Plus, Clock, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface SprintAlloc {
  id: string;
  project_id: string;
  project_name: string;
  brand_name: string;
  allocation_percentage: number;
}

interface SprintData {
  sprint_id: string;
  allocations: SprintAlloc[];
  total_allocated: number;
  available: number;
}

interface Props {
  sprintData: SprintData;
  isPast: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (allocId: string, currentPct: number) => void;
  onViewHistory: (allocId: string) => void;
}

const PROJECT_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

function hashColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return PROJECT_COLORS[Math.abs(h) % PROJECT_COLORS.length];
}

export function AllocationCell({ sprintData, isPast, canEdit, onAdd, onEdit, onViewHistory }: Props) {
  const { allocations, total_allocated, available } = sprintData;

  return (
    <div className="h-full flex flex-col gap-0.5 min-h-[60px]">
      {allocations.map((alloc) => (
        <div
          key={alloc.id}
          className={cn(
            'group relative flex items-center justify-between rounded px-1.5 py-0.5 text-xs cursor-pointer',
            hashColor(alloc.project_id),
            isPast && 'opacity-60'
          )}
          onClick={() => canEdit && onEdit(alloc.id, alloc.allocation_percentage)}
          title={`${alloc.brand_name} · ${alloc.project_name}`}
        >
          <span className="font-medium truncate max-w-[90px]">{alloc.brand_name}</span>
          <span className="font-bold flex-shrink-0 ml-1">{alloc.allocation_percentage}%</span>

          {/* Hover: view history */}
          <button
            className="absolute right-0 top-0 bottom-0 hidden group-hover:flex items-center px-1 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={(e) => {
              e.stopPropagation();
              onViewHistory(alloc.id);
            }}
            title="View history"
          >
            <Clock size={10} />
          </button>
        </div>
      ))}

      {/* Add allocation button */}
      {canEdit && available > 0 && (
        <button
          onClick={onAdd}
          className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded py-0.5 transition-colors"
        >
          <Plus size={10} />
          {allocations.length === 0 ? 'Allocate' : `+${available}%`}
        </button>
      )}

      {/* Full indicator */}
      {total_allocated >= 100 && (
        <div className="text-xs text-center text-gray-400 font-medium">Full</div>
      )}
    </div>
  );
}
