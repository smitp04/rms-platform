'use client';

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  Clock,
  Copy,
  Lock,
  Plus,
  Square,
  Users,
  X,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils/cn';
import { AllocationHistoryDrawer } from './AllocationHistoryDrawer';
import { AllocationModal } from './AllocationModal';

// ── Types ────────────────────────────────────────────────────────────────────

interface EmployeeChip {
  allocation_id: string;
  employee_id: string;
  name: string;
  avatar_url?: string | null;
  role: string;
  allocation_percentage: number;
  is_bench?: boolean;
}

/** Sparse sprint entry — only sprints with allocations are present */
interface SparseSprintEntry {
  sprint_id: string;
  employees: EmployeeChip[];
}

interface ProjectRow {
  project: {
    id: string;
    deal_name: string;
    zoho_deal_id?: string | null;
    brand_name: string;
    status: string;
    date_range: string | null;
    project_manager: string | null;
    growth_consultant: string | null;
    start_date: string | Date | null;
    end_date: string | Date | null;
  };
  sprints: SparseSprintEntry[];
}

/** Sprint metadata from top-level API response */
export interface SprintMeta {
  sprint_id: string;
  sprint_number: number;
  label: string;
  start_date: string | Date;
  end_date: string | Date;
  is_past: boolean;
  is_current: boolean;
}

interface Props {
  rows: ProjectRow[];
  sprintMeta: SprintMeta[];
  year: number;
  actorRole: string;
  actorPodId?: string | null;
  onSprintSelect?: (
    sprint: { sprint_id: string; label: string; start_date: string | Date; end_date: string | Date } | null,
  ) => void;
  selectedSprintId?: string | null;
  isFiltered?: boolean;
}

// Drag item payload stored in the draggable id (JSON encoded)
interface DragPayload {
  allocation_id: string;
  employee_id: string;
  name: string;
  role: string;
  allocation_percentage: number;
  source_sprint_id: string;
  source_project_id: string;
}

// Selected chip info stored for bulk operations
interface SelectedChipInfo {
  allocation_id: string;
  employee_id: string;
  name: string;
  role: string;
  allocation_percentage: number;
  source_sprint_id: string;
  source_project_id: string;
}

// Drop target id: "project_id::sprint_id"
function makeDropId(projectId: string, sprintId: string) {
  return `${projectId}::${sprintId}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CELL_W = 210;
const LABEL_W = 380;
const PAGE_SIZE = 25;

// ── Colour helpers ────────────────────────────────────────────────────────────
const CHIP_COLORS = [
  {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-800',
    name: 'text-blue-700 dark:text-blue-300',
    pct: 'text-blue-500 dark:text-blue-400',
  },
  {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
    name: 'text-emerald-700 dark:text-emerald-300',
    pct: 'text-emerald-500 dark:text-emerald-400',
  },
  {
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    border: 'border-violet-200 dark:border-violet-800',
    name: 'text-violet-700 dark:text-violet-300',
    pct: 'text-violet-500 dark:text-violet-400',
  },
  {
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    border: 'border-orange-200 dark:border-orange-800',
    name: 'text-orange-700 dark:text-orange-300',
    pct: 'text-orange-500 dark:text-orange-400',
  },
  {
    bg: 'bg-pink-50 dark:bg-pink-950/40',
    border: 'border-pink-200 dark:border-pink-800',
    name: 'text-pink-700 dark:text-pink-300',
    pct: 'text-pink-500 dark:text-pink-400',
  },
  {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    border: 'border-teal-200 dark:border-teal-800',
    name: 'text-teal-700 dark:text-teal-300',
    pct: 'text-teal-500 dark:text-teal-400',
  },
];

// Per-project row tint so rows are visually distinct when scrolled right
const ROW_BG_TINTS = [
  'bg-white dark:bg-gray-900',
  'bg-slate-50 dark:bg-gray-900',
  'bg-white dark:bg-gray-900',
  'bg-slate-50 dark:bg-gray-900',
  'bg-white dark:bg-gray-900',
  'bg-slate-50/60 dark:bg-gray-800/30',
];

function chipColor(employeeId: string) {
  let h = 0;
  for (let i = 0; i < employeeId.length; i++) h = employeeId.charCodeAt(i) + ((h << 5) - h);
  return CHIP_COLORS[Math.abs(h) % CHIP_COLORS.length];
}

// Returns badge classes for the allocation % on a chip based on the employee's allocation level
function pctBadgeStyle(pct: number) {
  if (pct >= 100)
    return 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300';
  if (pct >= 50)
    return 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300';
  return 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400';
}

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    UPCOMING: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    ON_HOLD: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    COMPLETED: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    CANCELLED: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
  };
  const label: Record<string, string> = {
    ACTIVE: 'Active',
    UPCOMING: 'Upcoming',
    ON_HOLD: 'On Hold',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  };
  return (
    <span
      className={cn(
        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
        map[status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
      )}
    >
      {label[status] ?? status}
    </span>
  );
});

// ── Draggable chip ────────────────────────────────────────────────────────────
const DraggableChip = memo(function DraggableChip({
  chip,
  sprintId,
  projectId,
  isPast,
  canEdit,
  isSelected,
  isMultiSelectMode,
  onToggleSelect,
  onEdit,
  onHistory,
}: {
  chip: EmployeeChip;
  sprintId: string;
  projectId: string;
  isPast: boolean;
  canEdit: boolean;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const dragId = JSON.stringify({
    allocation_id: chip.allocation_id,
    employee_id: chip.employee_id,
    name: chip.name,
    role: chip.role,
    allocation_percentage: chip.allocation_percentage,
    source_sprint_id: sprintId,
    source_project_id: projectId,
  } satisfies DragPayload);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    disabled: isPast || !canEdit || isMultiSelectMode,
  });

  const c = chipColor(chip.employee_id);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isMultiSelectMode) {
      onToggleSelect();
      return;
    }
    if (!isPast && canEdit) onEdit();
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex items-center justify-between rounded-lg border px-2 py-1 transition-all hover:shadow-sm',
        c.bg,
        c.border,
        isPast
          ? 'opacity-50 cursor-default'
          : isMultiSelectMode
            ? 'cursor-pointer'
            : canEdit
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-pointer',
        isDragging && 'opacity-20',
        isSelected && 'ring-2 ring-blue-500 ring-offset-1',
      )}
      onClick={handleClick}
      {...(!isMultiSelectMode && canEdit && !isPast ? { ...attributes, ...listeners } : {})}
    >
      {/* Checkbox (shown when canEdit and not past) */}
      {canEdit && !isPast && (
        <button
          className={cn(
            'flex-shrink-0 mr-1 transition-colors',
            isMultiSelectMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          title={isSelected ? 'Deselect' : 'Select for bulk action'}
        >
          {isSelected ? (
            <CheckSquare size={11} className="text-blue-600" />
          ) : (
            <Square size={11} className="text-gray-400" />
          )}
        </button>
      )}

      {/* Avatar + name + role */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white bg-gray-400">
          {chip.name[0]}
        </div>
        <div className="min-w-0">
          <div className={cn('text-xs font-semibold truncate leading-tight', c.name)} style={{ maxWidth: 82 }}>
            {chip.name.split(' ')[0]}
          </div>
          <div className="text-[9px] text-gray-400 truncate leading-tight" style={{ maxWidth: 82 }}>
            {chip.role}
          </div>
        </div>
      </div>

      {/* Percentage + bench + history */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        {chip.is_bench && (
          <span
            className="text-[9px] font-semibold rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60"
            title="On bench"
          >
            Bench
          </span>
        )}
        <span
          className={cn(
            'text-[10px] font-bold rounded-full border px-1.5 py-0.5 tabular-nums',
            pctBadgeStyle(chip.allocation_percentage),
          )}
        >
          {chip.allocation_percentage}%
        </span>
        {!isMultiSelectMode && (
          <button
            className="hidden group-hover:flex items-center text-gray-400 hover:text-gray-600"
            onClick={(e) => {
              e.stopPropagation();
              onHistory();
            }}
            title="View history"
          >
            <Clock size={9} />
          </button>
        )}
      </div>
    </div>
  );
});

// ── Droppable cell ────────────────────────────────────────────────────────────
const DroppableCell = memo(function DroppableCell({
  projectId,
  sprintId,
  isPast,
  isCurrent,
  canEdit,
  rowBg,
  children,
}: {
  projectId: string;
  sprintId: string;
  isPast: boolean;
  isCurrent: boolean;
  canEdit: boolean;
  rowBg: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: makeDropId(projectId, sprintId),
    disabled: isPast || !canEdit,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ width: CELL_W, minWidth: CELL_W }}
      className={cn(
        'flex-shrink-0 border-r border-gray-100 dark:border-gray-800 last:border-r-0 p-2 flex flex-col gap-1 overflow-hidden',
        isCurrent ? 'bg-green-50/50 dark:bg-green-950/30' : rowBg,
        isOver && canEdit && !isPast && '!bg-blue-50/70 dark:!bg-blue-950/40 ring-1 ring-inset ring-blue-300',
      )}
    >
      {children}
    </div>
  );
});

// ── Overlay ghost chip ────────────────────────────────────────────────────────
const GhostChip = memo(function GhostChip({ payload }: { payload: DragPayload }) {
  const c = chipColor(payload.employee_id);
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 shadow-lg opacity-95 cursor-grabbing',
        c.bg,
        c.border,
      )}
    >
      <div className="w-4 h-4 rounded-full bg-gray-400 flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white">
        {payload.name[0]}
      </div>
      <span className={cn('text-xs font-medium', c.name)}>{payload.name.split(' ')[0]}</span>
      <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 ml-1">
        {payload.allocation_percentage}%
      </span>
    </div>
  );
});

// ── Drop confirmation modal ───────────────────────────────────────────────────
interface DropConfirmProps {
  payload: DragPayload;
  targetProjectId: string;
  targetProjectName: string;
  targetSprintId: string;
  targetSprintLabel: string;
  isSameCell: boolean;
  error?: string | null;
  onConfirmMove: (pct: number) => void;
  onConfirmCopy: (pct: number) => void;
  onCancel: () => void;
}

function DropConfirmModal({
  payload,
  targetProjectName,
  targetSprintLabel,
  isSameCell,
  error,
  onConfirmMove,
  onConfirmCopy,
  onCancel,
}: DropConfirmProps) {
  const [pct, setPct] = useState(payload.allocation_percentage);
  const steps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  if (isSameCell) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Move or Copy Allocation</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Summary */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 space-y-1 text-xs text-gray-600 dark:text-gray-400">
            <div className="font-medium text-gray-800 dark:text-gray-200">{payload.name}</div>
            <div className="text-gray-400">{payload.role}</div>
            <div className="flex items-center gap-1.5 mt-2 text-gray-500 dark:text-gray-400">
              <span className="font-medium">→</span>
              <span>{targetProjectName}</span>
              <span className="text-gray-300">·</span>
              <span>{targetSprintLabel}</span>
            </div>
          </div>

          {/* % selector */}
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Allocation %</div>
            <div className="grid grid-cols-5 gap-1.5">
              {steps.map((s) => (
                <button
                  key={s}
                  onClick={() => setPct(s)}
                  className={cn(
                    'py-1.5 rounded-lg text-xs font-medium transition-colors',
                    pct === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200',
                  )}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Footer: Move vs Copy */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mr-auto"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirmCopy(pct)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            <Copy size={13} />
            Copy
          </button>
          <button
            onClick={() => onConfirmMove(pct)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <ArrowRight size={13} />
            Move
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Action Bar ─────────────────────────────────────────────────────────
function BulkActionBar({
  selectedCount,
  onCopy,
  onMove,
  onClear,
}: {
  selectedCount: number;
  onCopy: () => void;
  onMove: () => void;
  onClear: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users size={15} className="text-blue-400" />
        <span>{selectedCount} selected</span>
      </div>
      <div className="w-px h-5 bg-gray-600" />
      <button
        onClick={onCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
      >
        <Copy size={13} />
        Copy all
      </button>
      <button
        onClick={onMove}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
      >
        <ArrowRight size={13} />
        Move all
      </button>
      <button
        onClick={onClear}
        className="ml-1 text-gray-400 hover:text-white transition-colors"
        title="Clear selection"
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ── Types for multi-sprint bulk modal ────────────────────────────────────────
interface SprintOption {
  sprint_id: string;
  label: string;
  start_date: string | Date;
  end_date: string | Date;
  is_past: boolean;
  is_current: boolean;
  year: number;
}

interface ConflictRow {
  sprint_id: string;
  sprint_label: string;
  employee_id: string;
  employee_name: string;
  would_be_pct: number;
  available_pct: number;
}

type ValidationState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'conflicts'; rows: ConflictRow[] };

// ── Bulk Copy/Move Modal ─────────────────────────────────────────────────────
function BulkActionModal({
  selectedChips,
  action,
  rows,
  actorRole,
  error,
  isSaving,
  onConfirm,
  onCancel,
}: {
  selectedChips: SelectedChipInfo[];
  action: 'copy' | 'move';
  rows: ProjectRow[];
  actorRole: string;
  error: string | null;
  isSaving: boolean;
  onConfirm: (targetProjectId: string, targetSprintIds: string[]) => void;
  onCancel: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [allSprints, setAllSprints] = useState<SprintOption[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(true);
  const [pickerYear, setPickerYear] = useState(currentYear);
  const [targetSprintIds, setTargetSprintIds] = useState<Set<string>>(new Set());
  const [targetProjectId, setTargetProjectId] = useState('');
  const [validationState, setValidationState] = useState<ValidationState>({ status: 'idle' });

  // Fetch all sprints across all years once on mount
  useEffect(() => {
    setLoadingSprints(true);
    fetch('/api/v1/sprints')
      .then((r) => r.json())
      .then((json) => {
        const data: SprintOption[] = (json.data ?? []).map(
          (s: {
            id: string;
            label: string;
            start_date: string;
            end_date: string;
            is_past: boolean;
            is_current: boolean;
            year: number;
          }) => ({
            sprint_id: s.id,
            label: s.label,
            start_date: s.start_date,
            end_date: s.end_date,
            is_past: s.is_past,
            is_current: s.is_current,
            year: s.year,
          }),
        );
        setAllSprints(data);
      })
      .catch(() => {
        /* silently ignore */
      })
      .finally(() => setLoadingSprints(false));
  }, []);

  // Derive available years from fetched sprints
  const availableYears = Array.from(new Set(allSprints.map((s) => s.year))).sort();
  if (!availableYears.includes(currentYear)) availableYears.push(currentYear);
  availableYears.sort((a, b) => a - b);

  // Sprints for the selected year
  const sprintsForYear = allSprints.filter((s) => s.year === pickerYear);
  const isAdmin = actorRole === 'ADMIN';

  // Dedupe projects from rows
  const projects = rows.map((r) => ({
    id: r.project.id,
    name: r.project.deal_name,
    brand_name: r.project.brand_name,
    zoho_deal_id: r.project.zoho_deal_id ?? null,
  }));

  // Reset validation whenever selections change
  function toggleSprint(sprintId: string) {
    setTargetSprintIds((prev) => {
      const next = new Set(prev);
      if (next.has(sprintId)) next.delete(sprintId);
      else next.add(sprintId);
      return next;
    });
    setValidationState({ status: 'idle' });
  }

  function handleProjectChange(projectId: string) {
    setTargetProjectId(projectId);
    setValidationState({ status: 'idle' });
  }

  // Pre-validate all chip × sprint combos
  async function checkAvailability() {
    if (targetSprintIds.size === 0 || !targetProjectId) return;
    setValidationState({ status: 'checking' });

    const pairs: { chip: SelectedChipInfo; sprintId: string }[] = [];
    for (const sprintId of targetSprintIds) {
      for (const chip of selectedChips) {
        pairs.push({ chip, sprintId });
      }
    }

    const results = await Promise.all(
      pairs.map(({ chip, sprintId }) =>
        fetch(`/api/v1/allocations/validate?employee_id=${chip.employee_id}&sprint_id=${sprintId}`)
          .then((r) => r.json())
          .then((json) => ({
            employee_id: chip.employee_id,
            employee_name: chip.name,
            allocation_percentage: chip.allocation_percentage,
            sprint_id: sprintId,
            available_pct: json.data?.available_pct ?? 0,
            current_sprint_pct: json.data?.current_sprint_pct ?? 0,
          }))
          .catch(() => ({
            employee_id: chip.employee_id,
            employee_name: chip.name,
            allocation_percentage: chip.allocation_percentage,
            sprint_id: sprintId,
            available_pct: 0,
            current_sprint_pct: 100,
          })),
      ),
    );

    const conflicts: ConflictRow[] = results
      .filter((r) => r.allocation_percentage > r.available_pct)
      .map((r) => {
        const sprint = allSprints.find((s) => s.sprint_id === r.sprint_id);
        return {
          sprint_id: r.sprint_id,
          sprint_label: sprint?.label ?? r.sprint_id,
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          would_be_pct: r.current_sprint_pct + r.allocation_percentage,
          available_pct: r.available_pct,
        };
      });

    setValidationState(conflicts.length === 0 ? { status: 'ok' } : { status: 'conflicts', rows: conflicts });
  }

  const hasSprintsSelected = targetSprintIds.size > 0;
  const canCheck = hasSprintsSelected && !!targetProjectId && validationState.status !== 'checking';
  const canConfirm = validationState.status === 'ok' && !isSaving;
  const selectedSprintCount = targetSprintIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {action === 'copy' ? 'Copy' : 'Move'} {selectedChips.length} Allocation
              {selectedChips.length > 1 ? 's' : ''}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Select one or more target sprints</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Selected people list */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Selected people
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {selectedChips.map((chip) => (
                <div key={chip.allocation_id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{chip.name}</span>
                  <span className="text-gray-400 tabular-nums">{chip.allocation_percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Target project */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Target Project
            </label>
            <select
              value={targetProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} | {p.brand_name}
                </option>
              ))}
            </select>
          </div>

          {/* Target sprints — year tabs + checkboxes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Target Sprints{' '}
              {selectedSprintCount > 0 && (
                <span className="ml-1.5 text-blue-600 font-bold">{selectedSprintCount} selected</span>
              )}
            </label>

            {/* Year tabs */}
            <div className="flex gap-1 mb-3 flex-wrap">
              {availableYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setPickerYear(y)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                    pickerYear === y
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200',
                  )}
                >
                  {y}
                </button>
              ))}
            </div>

            {/* Sprint checkboxes */}
            {loadingSprints ? (
              <div className="text-xs text-gray-400 py-3 text-center">Loading sprints…</div>
            ) : sprintsForYear.length === 0 ? (
              <div className="text-xs text-amber-600 py-2">No sprints found for {pickerYear}.</div>
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {sprintsForYear.map((sprint, i) => {
                  const blocked = sprint.is_past && !isAdmin;
                  const checked = targetSprintIds.has(sprint.sprint_id);
                  return (
                    <label
                      key={sprint.sprint_id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 transition-colors',
                        i > 0 && 'border-t border-gray-100 dark:border-gray-800',
                        blocked
                          ? 'opacity-40 cursor-not-allowed'
                          : checked
                            ? 'bg-blue-50 dark:bg-blue-950/30 cursor-pointer'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={blocked}
                        onChange={() => !blocked && toggleSprint(sprint.sprint_id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            'text-xs font-semibold',
                            sprint.is_current ? 'text-green-600' : 'text-gray-800 dark:text-gray-200',
                          )}
                        >
                          {sprint.label}
                          {sprint.is_current && (
                            <span className="ml-1.5 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                              current
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(sprint.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {' – '}
                          {new Date(sprint.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      {blocked && (
                        <span title="Past sprint — Admin only">
                          <Lock size={11} className="text-gray-400" />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Check availability button */}
          <button
            onClick={checkAvailability}
            disabled={!canCheck}
            className="w-full py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {validationState.status === 'checking' ? 'Checking…' : 'Check availability'}
          </button>

          {/* Validation result — all clear */}
          {validationState.status === 'ok' && (
            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
              <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
              All clear — no overallocation across selected sprints.
            </div>
          )}

          {/* Validation result — conflicts */}
          {validationState.status === 'conflicts' && (
            <div className="rounded-lg border border-red-200 bg-red-50 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-red-200">
                <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-red-700">
                  {validationState.rows.length} overallocation conflict{validationState.rows.length > 1 ? 's' : ''} —
                  deselect conflicting sprints to proceed
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-red-100/60">
                      <th className="text-left px-3 py-1.5 text-red-600 font-semibold">Sprint</th>
                      <th className="text-left px-3 py-1.5 text-red-600 font-semibold">Employee</th>
                      <th className="text-right px-3 py-1.5 text-red-600 font-semibold">Would be</th>
                      <th className="text-right px-3 py-1.5 text-red-600 font-semibold">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationState.rows.map((row, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: validation rows are append-only and stable within a render
                      <tr key={i} className="border-t border-red-100">
                        <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">{row.sprint_label}</td>
                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{row.employee_name}</td>
                        <td className="px-3 py-1.5 text-right font-bold text-red-600">{row.would_be_pct}%</td>
                        <td className="px-3 py-1.5 text-right text-gray-500 dark:text-gray-400">
                          {row.available_pct}% free
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Error from executeBulk */}
        {error && (
          <div className="mx-5 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 flex items-start gap-2 flex-shrink-0">
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={onCancel}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mr-auto"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(targetProjectId, Array.from(targetSprintIds))}
            disabled={!canConfirm}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              action === 'copy'
                ? 'bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-40'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40',
            )}
          >
            {isSaving ? (
              'Saving…'
            ) : action === 'copy' ? (
              <>
                <Copy size={13} /> Copy to {selectedSprintCount} sprint{selectedSprintCount !== 1 ? 's' : ''}
              </>
            ) : (
              <>
                <ArrowRight size={13} /> Move to {selectedSprintCount} sprint{selectedSprintCount !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AllocationGantt({
  rows,
  sprintMeta,
  year,
  actorRole,
  onSprintSelect,
  selectedSprintId,
  isFiltered = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    projectId?: string;
    sprintId?: string;
    employeeId?: string;
    employeeName?: string;
    allocationId?: string;
    currentPct?: number;
    available?: number;
  }>({ open: false, mode: 'add' });

  const [historyId, setHistoryId] = useState<string | null>(null);

  // Drag state
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [dropConfirm, setDropConfirm] = useState<{
    payload: DragPayload;
    targetProjectId: string;
    targetProjectName: string;
    targetSprintId: string;
    targetSprintLabel: string;
    isSameCell: boolean;
    error?: string | null;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  // Multi-select state
  const [selectedChips, setSelectedChips] = useState<Map<string, SelectedChipInfo>>(new Map());
  const [bulkAction, setBulkAction] = useState<'copy' | 'move' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [page, setPage] = useState(1);

  const isMultiSelectMode = selectedChips.size > 0;

  const canEdit = actorRole === 'ADMIN' || actorRole === 'POD_LEAD' || actorRole === 'CSM';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  // Phase 4: Memoize computed values
  const totalWidth = useMemo(() => LABEL_W + sprintMeta.length * CELL_W, [sprintMeta.length]);

  const sprintLabelMap = useMemo(() => new Map(sprintMeta.map((s) => [s.sprint_id, s.label])), [sprintMeta]);

  const projectNameMap = useMemo(() => new Map(rows.map((r) => [r.project.id, r.project.brand_name])), [rows]);

  // Phase 2: Build sparse lookup — Map<projectId, Map<sprintId, EmployeeChip[]>>
  const allocLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, EmployeeChip[]>>();
    for (const row of rows) {
      const sprintMap = new Map<string, EmployeeChip[]>();
      for (const entry of row.sprints) {
        sprintMap.set(entry.sprint_id, entry.employees);
      }
      lookup.set(row.project.id, sprintMap);
    }
    return lookup;
  }, [rows]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [rows, safePage]);

  // Clamp page when filtered results shrink (safePage handles display,
  // but sync state so pagination controls are correct)
  useEffect(() => {
    if (page > totalPages && totalPages > 0) setPage(totalPages);
  }, [totalPages]);

  // Save/restore page when filters are applied/cleared
  const preFilterPage = useRef(1);
  const wasFiltered = useRef(false);
  useEffect(() => {
    if (isFiltered && !wasFiltered.current) {
      preFilterPage.current = page;
      wasFiltered.current = true;
      setPage(1);
    } else if (!isFiltered && wasFiltered.current) {
      wasFiltered.current = false;
      setPage(preFilterPage.current);
    }
  }, [isFiltered]);

  // Auto-scroll to position current sprint as first column after project label
  useEffect(() => {
    if (sprintMeta.length === 0) return;
    const currentIdx = sprintMeta.findIndex((s) => s.is_current);
    if (currentIdx === -1) return;
    // Use requestAnimationFrame to ensure the DOM is rendered and ref is attached
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollLeft = currentIdx * CELL_W;
    });
    return () => cancelAnimationFrame(raf);
  }, [sprintMeta]);

  // Phase 4: Stable callbacks
  const toggleChipSelection = useCallback((chip: EmployeeChip, sprintId: string, projectId: string) => {
    setSelectedChips((prev) => {
      const next = new Map(prev);
      if (next.has(chip.allocation_id)) {
        next.delete(chip.allocation_id);
      } else {
        next.set(chip.allocation_id, {
          allocation_id: chip.allocation_id,
          employee_id: chip.employee_id,
          name: chip.name,
          role: chip.role,
          allocation_percentage: chip.allocation_percentage,
          source_sprint_id: sprintId,
          source_project_id: projectId,
        });
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedChips(new Map());
    setBulkAction(null);
    setBulkError(null);
  }, []);

  const openAdd = useCallback(
    (projectId: string, sprintId: string) => {
      if (!canEdit) return;
      setModalState({ open: true, mode: 'add', projectId, sprintId, available: 100 });
    },
    [canEdit],
  );

  const openEdit = useCallback(
    (chip: EmployeeChip, sprintId: string) => {
      if (!canEdit) return;
      setModalState({
        open: true,
        mode: 'edit',
        allocationId: chip.allocation_id,
        employeeId: chip.employee_id,
        employeeName: chip.name,
        sprintId,
        currentPct: chip.allocation_percentage,
        available: chip.allocation_percentage,
      });
    },
    [canEdit],
  );

  const invalidateAllocationCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['gantt-projects'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['sprint-bandwidth'] });
  }, [queryClient]);

  const handleSaved = useCallback(() => {
    invalidateAllocationCaches();
    setModalState({ open: false, mode: 'add' });
  }, [invalidateAllocationCaches]);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    try {
      const payload: DragPayload = JSON.parse(String(event.active.id));
      setActiveDrag(payload);
    } catch {
      // ignore malformed ids
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag((prev) => {
        if (!event.over || !prev) return null;

        const [targetProjectId, targetSprintId] = String(event.over.id).split('::');
        const isSameCell = targetProjectId === prev.source_project_id && targetSprintId === prev.source_sprint_id;

        if (isSameCell) return null;

        setDropConfirm({
          payload: prev,
          targetProjectId,
          targetProjectName: projectNameMap.get(targetProjectId) ?? targetProjectId,
          targetSprintId,
          targetSprintLabel: sprintLabelMap.get(targetSprintId) ?? targetSprintId,
          isSameCell,
        });
        return null;
      });
    },
    [projectNameMap, sprintLabelMap],
  );

  async function executeDrop(action: 'move' | 'copy', pct: number) {
    if (!dropConfirm || isSaving) return;
    setIsSaving(true);
    setDropError(null);
    const { payload, targetProjectId, targetSprintId } = dropConfirm;

    try {
      if (action === 'move') {
        await fetch(`/api/v1/allocations/${payload.allocation_id}`, { method: 'DELETE' });
        const res = await fetch('/api/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: payload.employee_id,
            project_id: targetProjectId,
            sprint_id: targetSprintId,
            allocation_percentage: pct,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? 'Failed to move allocation');
        }
      } else {
        const res = await fetch('/api/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: payload.employee_id,
            project_id: targetProjectId,
            sprint_id: targetSprintId,
            allocation_percentage: pct,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? 'Failed to copy allocation');
        }
      }

      invalidateAllocationCaches();
      setDropConfirm(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      console.error('Drop save failed', err);
      setDropError(msg);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Bulk action handler ───────────────────────────────────────────────────
  async function executeBulk(targetProjectId: string, targetSprintIds: string[]) {
    if (isBulkSaving || !bulkAction || targetSprintIds.length === 0) return;
    setIsBulkSaving(true);
    setBulkError(null);

    const chips = Array.from(selectedChips.values());

    try {
      if (bulkAction === 'move') {
        await Promise.all(
          chips.map((chip) => fetch(`/api/v1/allocations/${chip.allocation_id}`, { method: 'DELETE' })),
        );
      }

      const allFailures: string[] = [];
      for (const targetSprintId of targetSprintIds) {
        const res = await fetch('/api/v1/allocations/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            allocations: chips.map((chip) => ({
              employee_id: chip.employee_id,
              project_id: targetProjectId,
              sprint_id: targetSprintId,
              allocation_percentage: chip.allocation_percentage,
            })),
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          allFailures.push(`Sprint ${targetSprintId}: ${json.error ?? 'Bulk operation failed'}`);
          continue;
        }

        if (json.data?.failed?.length > 0) {
          json.data.failed.forEach((f: { index: number; error: string }) => {
            const chip = chips[f.index];
            allFailures.push(`${chip?.name ?? 'Unknown'}: ${f.error}`);
          });
        }
      }

      if (allFailures.length > 0) {
        throw new Error(`Some allocations could not be saved:\n${allFailures.join('\n')}`);
      }

      invalidateAllocationCaches();
      clearSelection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setBulkError(msg);
    } finally {
      setIsBulkSaving(false);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        {/* ── Single scroll container: header + rows scroll together ────── */}
        <div ref={scrollRef} className="overflow-x-auto">
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            {/* ── Sticky header (inside scroll so it syncs horizontally) ── */}
            <div
              className="flex sticky top-0 z-30 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
              style={{ width: totalWidth }}
            >
              {/* Project column header */}
              <div
                className="flex-shrink-0 px-5 py-3 flex items-center border-r border-gray-200 dark:border-gray-700 sm:sticky sm:left-0 bg-gray-50 dark:bg-gray-800 z-40"
                style={{ width: LABEL_W }}
              >
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Project
                </span>
              </div>

              {/* Sprint column headers */}
              {sprintMeta.map((sprint) => {
                const isSelected = selectedSprintId === sprint.sprint_id;
                return (
                  <button
                    key={sprint.sprint_id}
                    type="button"
                    onClick={() =>
                      onSprintSelect?.(
                        isSelected
                          ? null
                          : {
                              sprint_id: sprint.sprint_id,
                              label: sprint.label,
                              start_date: sprint.start_date,
                              end_date: sprint.end_date,
                            },
                      )
                    }
                    style={{ width: CELL_W, minWidth: CELL_W }}
                    className={cn(
                      'flex-shrink-0 px-3 py-3 text-center border-r border-gray-100 dark:border-gray-800 last:border-r-0 transition-colors group/sh',
                      sprint.is_current ? 'bg-green-50 dark:bg-green-950/30' : 'bg-transparent',
                      isSelected && 'bg-blue-50 dark:bg-blue-950/30 border-b-2 border-b-blue-500',
                      onSprintSelect && 'hover:bg-blue-50/60 dark:hover:bg-blue-950/20 cursor-pointer',
                    )}
                  >
                    <div
                      className={cn(
                        'text-xs font-semibold flex items-center justify-center gap-1.5',
                        isSelected
                          ? 'text-blue-600'
                          : sprint.is_current
                            ? 'text-green-600'
                            : 'text-gray-600 dark:text-gray-400',
                      )}
                    >
                      {sprint.is_current && !isSelected && (
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                      )}
                      {isSelected && <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />}
                      {sprint.is_current
                        ? new Date(sprint.start_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                        : sprint.label}
                    </div>
                    <div className={cn('text-[10px] mt-0.5', isSelected ? 'text-blue-400' : 'text-gray-400')}>
                      {new Date(sprint.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {' – '}
                      {new Date(sprint.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Project Rows (paginated) ────────────────────────────────── */}
            <div style={{ overflowAnchor: 'none' }}>
              {paginatedRows.map((row, index) => {
                const { project } = row;

                const accentMap: Record<string, string> = {
                  ACTIVE: 'bg-green-400',
                  UPCOMING: 'bg-amber-400',
                  ON_HOLD: 'bg-gray-300',
                };
                const accent = accentMap[project.status] ?? 'bg-gray-200';
                const rowBg = ROW_BG_TINTS[index % ROW_BG_TINTS.length];
                const projectAllocMap = allocLookup.get(project.id);

                return (
                  <div
                    key={project.id}
                    className={cn('flex border-b border-gray-100 dark:border-gray-800 group/row', rowBg)}
                    style={{ width: totalWidth }}
                  >
                    {/* ── Project label ──────────────────────────────────── */}
                    <div
                      className={cn(
                        'relative flex-shrink-0 pl-5 pr-4 py-3 flex flex-col justify-center gap-0.5 border-r border-gray-200 dark:border-gray-700 sm:sticky sm:left-0 z-20',
                        rowBg.includes('bg-slate-50') ? 'bg-[#f8fafc] dark:bg-gray-900' : 'bg-white dark:bg-gray-900',
                      )}
                      style={{ width: LABEL_W }}
                    >
                      <div className={cn('absolute left-0 top-0 bottom-0 w-1', accent)} />
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight"
                          title={project.deal_name}
                        >
                          {project.deal_name}
                        </span>
                        {project.zoho_deal_id && (
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                            title={project.zoho_deal_id}
                          >
                            {project.zoho_deal_id.slice(-4)}
                          </span>
                        )}
                        <StatusBadge status={project.status} />
                      </div>
                      {project.brand_name && (
                        <div className="text-sm text-gray-900 dark:text-gray-100 truncate leading-tight">
                          {project.brand_name}
                        </div>
                      )}
                      {project.date_range && <div className="text-[11px] text-gray-400">{project.date_range}</div>}
                      {(project.project_manager || project.growth_consultant) && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {[project.growth_consultant, project.project_manager]
                            .filter(Boolean)
                            .map((name, i) => (
                              // biome-ignore lint/suspicious/noArrayIndexKey: small fixed list (PM + growth consultant)
                              <span key={i} className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                                {name}
                              </span>
                            ))
                            .reduce(
                              (acc: React.ReactNode[], el, i) =>
                                i === 0
                                  ? [el]
                                  : [
                                      ...acc,
                                      // biome-ignore lint/suspicious/noArrayIndexKey: separator key derived from same fixed list
                                      <span key={`sep-${i}`} className="text-gray-300 text-[10px]">
                                        |
                                      </span>,
                                      el,
                                    ],
                              [],
                            )}
                        </div>
                      )}
                    </div>

                    {/* ── Sprint cells — iterate all sprints, look up from sparse map ── */}
                    {sprintMeta.map((sprint) => {
                      const isPast = sprint.is_past && actorRole !== 'ADMIN';
                      const chips = projectAllocMap?.get(sprint.sprint_id) ?? [];

                      return (
                        <DroppableCell
                          key={sprint.sprint_id}
                          projectId={project.id}
                          sprintId={sprint.sprint_id}
                          isPast={isPast}
                          isCurrent={sprint.is_current}
                          canEdit={canEdit}
                          rowBg={rowBg}
                        >
                          {/* Employee chips */}
                          <div className="flex flex-col gap-1">
                            {chips.map((chip) => (
                              <DraggableChip
                                key={chip.allocation_id}
                                chip={chip}
                                sprintId={sprint.sprint_id}
                                projectId={project.id}
                                isPast={isPast}
                                canEdit={canEdit}
                                isSelected={selectedChips.has(chip.allocation_id)}
                                isMultiSelectMode={isMultiSelectMode}
                                onToggleSelect={() => toggleChipSelection(chip, sprint.sprint_id, project.id)}
                                onEdit={() => openEdit(chip, sprint.sprint_id)}
                                onHistory={() => setHistoryId(chip.allocation_id)}
                              />
                            ))}
                          </div>

                          {/* Add button — hide when multi-select mode active */}
                          {canEdit && !isPast && !isMultiSelectMode && (
                            <button
                              onClick={() => openAdd(project.id, sprint.sprint_id)}
                              className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-blue-500 transition-colors mt-1"
                            >
                              <Plus size={10} />
                              Add
                            </button>
                          )}
                        </DroppableCell>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {/* end scroll inner wrapper */}
        </div>
        {/* end scroll container */}

        {/* ── Footer hint ───────────────────────────────────────────────── */}
        {canEdit && (
          <div className="px-5 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[10px] text-gray-400 italic">
            <span>
              {isMultiSelectMode
                ? `${selectedChips.size} chip${selectedChips.size > 1 ? 's' : ''} selected — use the action bar below to copy or move`
                : 'Drag chips to move or copy · Click checkboxes to multi-select'}
            </span>
            {isMultiSelectMode && (
              <button
                onClick={clearSelection}
                className="not-italic font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center gap-1"
              >
                <X size={10} /> Clear selection
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      <Pagination page={safePage} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} />

      {/* ── DragOverlay (floating ghost) ──────────────────────────────────── */}
      <DragOverlay dropAnimation={null}>{activeDrag ? <GhostChip payload={activeDrag} /> : null}</DragOverlay>

      {/* ── Drop confirmation modal ───────────────────────────────────────── */}
      {dropConfirm && !dropConfirm.isSameCell && (
        <DropConfirmModal
          payload={dropConfirm.payload}
          targetProjectId={dropConfirm.targetProjectId}
          targetProjectName={dropConfirm.targetProjectName}
          targetSprintId={dropConfirm.targetSprintId}
          targetSprintLabel={dropConfirm.targetSprintLabel}
          isSameCell={dropConfirm.isSameCell}
          error={dropError}
          onConfirmMove={(pct) => executeDrop('move', pct)}
          onConfirmCopy={(pct) => executeDrop('copy', pct)}
          onCancel={() => {
            setDropConfirm(null);
            setDropError(null);
          }}
        />
      )}

      {/* ── Add/Edit modal ───────────────────────────────────────────────── */}
      {modalState.open && modalState.sprintId && (
        <AllocationModal
          employeeId={modalState.employeeId ?? ''}
          employeeName={modalState.employeeName}
          sprintId={modalState.sprintId}
          projectId={modalState.projectId}
          allocationId={modalState.allocationId}
          currentPct={modalState.currentPct}
          available={modalState.available ?? 100}
          onClose={() => setModalState({ open: false, mode: 'add' })}
          onSaved={handleSaved}
          mode={modalState.mode}
        />
      )}

      {/* ── History drawer ───────────────────────────────────────────────── */}
      {historyId && <AllocationHistoryDrawer allocationId={historyId} onClose={() => setHistoryId(null)} />}

      {/* ── Bulk action bar (shown when multiple chips selected) ─────────── */}
      {isMultiSelectMode && selectedChips.size >= 1 && (
        <BulkActionBar
          selectedCount={selectedChips.size}
          onCopy={() => {
            setBulkAction('copy');
            setBulkError(null);
          }}
          onMove={() => {
            setBulkAction('move');
            setBulkError(null);
          }}
          onClear={clearSelection}
        />
      )}

      {/* ── Bulk action modal ─────────────────────────────────────────────── */}
      {bulkAction && (
        <BulkActionModal
          selectedChips={Array.from(selectedChips.values())}
          action={bulkAction}
          rows={rows}
          actorRole={actorRole}
          error={bulkError}
          isSaving={isBulkSaving}
          onConfirm={executeBulk}
          onCancel={() => {
            setBulkAction(null);
            setBulkError(null);
          }}
        />
      )}
    </DndContext>
  );
}
