'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Calendar, ChevronDown, ChevronUp, ExternalLink, Pencil, TrendingUp, Users, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  ACTIVE: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  ON_HOLD: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  COMPLETED: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  CANCELLED: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300',
};

const STATUS_OPTIONS = ['UPCOMING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

const PILLAR_LABELS: Record<string, string> = {
  CUSTOMER_INTERACTION: 'Customer Interaction',
  MARKETING_AUTOMATION: 'Marketing Automation',
  AI_OPS: 'AI Ops',
  ENTERPRISE_ARCHITECTURE: 'Enterprise Architecture',
};

const CHIP_COLORS = [
  'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
];

function chipColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return CHIP_COLORS[Math.abs(h) % CHIP_COLORS.length];
}

interface SprintEntry {
  sprint_id: string;
  sprint_number: number;
  label: string;
  start_date: string;
  end_date: string;
  is_past: boolean;
  is_current: boolean;
  year: number;
  employees: {
    allocation_id: string;
    employee_id: string;
    name: string;
    function_name: string;
    role_name: string;
    allocation_percentage: number;
  }[];
  total_pct: number;
}

interface ProjectFull {
  id: string;
  deal_name: string;
  status: string;
  devx_pillar?: string;
  billing_model?: string;
  revenue_cents?: number;
  start_date?: string | null;
  end_date?: string | null;
  sow_url?: string | null;
  account?: { brand_name: string };
  project_manager?: { id: string; name: string } | null;
  growth_consultant?: { id: string; name: string } | null;
  practice_poc?: { id: string; name: string } | null;
}

export function ProjectDetailDrawer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.system_role === 'ADMIN';
  const isCSM = session?.user?.system_role === 'CSM';
  const queryClient = useQueryClient();

  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set());
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [editingDrive, setEditingDrive] = useState(false);
  const [driveValue, setDriveValue] = useState('');
  const [savingDrive, setSavingDrive] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true));
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, 350);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['project-detail', projectId],
    queryFn: () => fetch(`/api/v1/projects/${projectId}`).then((r) => r.json()),
    staleTime: 30_000,
  });

  const project: ProjectFull | null = data?.data?.project ?? null;
  const sprintHistory: SprintEntry[] = data?.data?.sprint_history ?? [];
  const team: { id: string; name: string; role_name: string; function_name: string }[] = data?.data?.team ?? [];

  // Group sprint history by year
  const byYear = sprintHistory.reduce<Record<number, SprintEntry[]>>((acc, s) => {
    (acc[s.year] ??= []).push(s);
    return acc;
  }, {});
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  function toggleSprint(id: string) {
    setExpandedSprints((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Compute peak team size
  const peakTeamSize = Math.max(...sprintHistory.map((s) => s.employees.length), 0);
  const activeSprints = sprintHistory.filter((s) => s.employees.length > 0);

  // CSMs can edit their own projects; Admins can always edit
  const canEditProject = isAdmin || (isCSM && project?.project_manager?.id === session?.user?.id);

  async function handleNameSave() {
    const trimmed = nameValue.trim();
    if (!project || !trimmed || trimmed === project.deal_name) {
      setEditingName(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_name: trimmed }),
      });
      if (!res.ok) throw new Error('Failed to update name');
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project name updated');
    } catch {
      toast.error('Failed to update project name');
    } finally {
      setEditingName(false);
    }
  }

  async function handleDriveSave() {
    if (!project) return;
    const trimmed = driveValue.trim();
    if (trimmed === (project.sow_url ?? '')) {
      setEditingDrive(false);
      return;
    }
    setSavingDrive(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sow_url: trimmed || null }),
      });
      if (!res.ok) throw new Error('Failed to update Drive link');
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Drive link updated');
      setEditingDrive(false);
    } catch {
      toast.error('Failed to update Drive link');
    } finally {
      setSavingDrive(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!project || newStatus === project.status) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    } catch {
      // silently fail — query refetch will show correct state
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={cn('absolute inset-0 -z-10 transition-colors duration-350', isOpen ? 'bg-black/25' : 'bg-black/0')}
        onClick={handleClose}
      />

      <div
        className={cn(
          'relative w-full max-w-full sm:max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col h-full border-l border-gray-200 dark:border-gray-700 overflow-hidden transition-transform duration-350 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {isLoading || !project ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            {isLoading ? 'Loading project...' : 'Project not found'}
          </div>
        ) : (
          <>
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-4">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate block">
                    {project.account?.brand_name}
                  </span>
                  {editingName ? (
                    <div className="flex items-center gap-2 mt-1 min-w-0">
                      <input
                        autoFocus
                        size={Math.max(nameValue.length + 1, 10)}
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleNameSave();
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                        className="min-w-0 w-auto text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleNameSave}
                        className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors h-[30px]"
                      >
                        Save
                      </button>
                      <button onClick={() => setEditingName(false)} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <p
                      className={cn(
                        'text-sm text-gray-500 dark:text-gray-400 mt-0.5',
                        canEditProject &&
                          'group/name inline-flex items-center gap-1 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300',
                      )}
                      onClick={() => {
                        if (!canEditProject) return;
                        setNameValue(project.deal_name);
                        setEditingName(true);
                      }}
                    >
                      {project.deal_name}
                      {canEditProject && (
                        <Pencil size={11} className="text-gray-300 group-hover/name:text-gray-500 dark:text-gray-400" />
                      )}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {project.devx_pillar && (
                      <span className="text-xs text-gray-400">
                        {PILLAR_LABELS[project.devx_pillar] ?? project.devx_pillar}
                      </span>
                    )}
                    {project.start_date && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar size={10} />
                        {format(new Date(project.start_date), 'MMM d, yyyy')}
                        {project.end_date ? ` → ${format(new Date(project.end_date), 'MMM d, yyyy')}` : ' → Ongoing'}
                      </span>
                    )}
                    {canEditProject ? (
                      <div className="relative inline-flex items-center">
                        <select
                          value={project.status}
                          onChange={(e) => handleStatusChange(e.target.value)}
                          disabled={updatingStatus}
                          className={cn(
                            'text-[11px] font-semibold pl-2.5 pr-5 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none',
                            STATUS_COLORS[project.status] ??
                              'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
                            updatingStatus && 'opacity-50 cursor-wait',
                          )}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={10}
                          className="absolute right-1.5 pointer-events-none text-gray-800 dark:text-gray-200"
                        />
                      </div>
                    ) : (
                      <span
                        className={cn(
                          'text-[11px] font-semibold px-2.5 py-0.5 rounded-full',
                          STATUS_COLORS[project.status] ??
                            'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
                        )}
                      >
                        {project.status?.replace('_', ' ')}
                      </span>
                    )}
                    {editingDrive ? (
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="url"
                          value={driveValue}
                          onChange={(e) => setDriveValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleDriveSave();
                            if (e.key === 'Escape') setEditingDrive(false);
                          }}
                          placeholder="https://drive.google.com/…"
                          className="text-xs w-80 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900"
                        />
                        <button
                          onClick={handleDriveSave}
                          disabled={savingDrive}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                        >
                          {savingDrive ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingDrive(false)} className="text-gray-500 hover:text-gray-700">
                          <X size={14} />
                        </button>
                      </div>
                    ) : project.sow_url ? (
                      <span className="inline-flex items-center gap-1.5">
                        <a
                          href={project.sow_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Drive folder"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                        >
                          <ExternalLink size={11} /> View Doc
                        </a>
                        {canEditProject && (
                          <button
                            type="button"
                            title="Edit Drive link"
                            onClick={() => {
                              setDriveValue(project.sow_url ?? '');
                              setEditingDrive(true);
                            }}
                            className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                      </span>
                    ) : (
                      canEditProject && (
                        <button
                          type="button"
                          onClick={() => {
                            setDriveValue('');
                            setEditingDrive(true);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 border border-dashed border-gray-300 transition-colors"
                        >
                          <ExternalLink size={11} /> Add Drive link
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Scrollable content ──────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              {/* ── People strip ────────────────────────────────────────────── */}
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { label: 'Project Manager', person: project.project_manager },
                  { label: 'Growth', person: project.growth_consultant },
                  { label: 'Practice POC', person: project.practice_poc },
                ].map(({ label, person }) => (
                  <div key={label}>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">
                      {label}
                    </div>
                    <div className="text-gray-700 dark:text-gray-300 font-medium">{person?.name ?? '—'}</div>
                  </div>
                ))}
              </div>

              {/* ── Summary cards ───────────────────────────────────────────── */}
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 grid grid-cols-3 gap-2">
                <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{team.length}</div>
                  <div className="text-[10px] text-blue-400 dark:text-blue-500 font-medium mt-0.5">Team members</div>
                </div>
                <div className="bg-violet-50 dark:bg-violet-950/40 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-violet-600 dark:text-violet-400">{peakTeamSize}</div>
                  <div className="text-[10px] text-violet-400 dark:text-violet-500 font-medium mt-0.5">
                    Peak team size
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-950/40 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">{activeSprints.length}</div>
                  <div className="text-[10px] text-green-400 dark:text-green-500 font-medium mt-0.5">
                    Active sprints
                  </div>
                </div>
              </div>

              {/* ── Ever on team ────────────────────────────────────────────── */}
              {team.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users size={12} className="text-gray-400" />
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Team</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {team.map((m) => (
                      <div
                        key={m.id}
                        className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', chipColor(m.id))}
                      >
                        {m.name}
                        <span className="opacity-60 ml-1 font-normal">{m.role_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Sprint history ──────────────────────────────────────────── */}
              <div className="px-5 py-3">
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp size={12} className="text-gray-400" />
                  <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                    Sprint Allocation History
                  </span>
                </div>

                {activeSprints.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">No allocations yet</div>
                ) : (
                  <div className="space-y-1">
                    {years.map((yr) => (
                      <div key={yr}>
                        <div className="text-[10px] uppercase tracking-widest text-gray-300 dark:text-gray-500 font-bold py-1.5 px-1">
                          {yr}
                        </div>
                        {byYear[yr]
                          .filter((s) => s.employees.length > 0)
                          .map((sprint) => {
                            const expanded = expandedSprints.has(sprint.sprint_id);
                            return (
                              <div
                                key={sprint.sprint_id}
                                className={cn(
                                  'rounded-xl border mb-1.5 overflow-hidden transition-colors',
                                  sprint.is_current
                                    ? 'border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-950/30'
                                    : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800',
                                )}
                              >
                                {/* Sprint row */}
                                <button
                                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                                  onClick={() => toggleSprint(sprint.sprint_id)}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {sprint.is_current && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                    )}
                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                      S{sprint.sprint_number}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      {format(new Date(sprint.start_date), 'd MMM')}
                                      {' – '}
                                      {format(new Date(sprint.end_date), 'd MMM')}
                                    </span>
                                    {/* Mini chips */}
                                    <div className="flex gap-1 flex-wrap">
                                      {sprint.employees.slice(0, 4).map((e) => (
                                        <span
                                          key={e.employee_id}
                                          className={cn(
                                            'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
                                            chipColor(e.employee_id),
                                          )}
                                        >
                                          {e.name.split(' ')[0]} · {e.allocation_percentage}%
                                        </span>
                                      ))}
                                      {sprint.employees.length > 4 && (
                                        <span className="text-[10px] text-gray-400">
                                          +{sprint.employees.length - 4}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                      {sprint.total_pct}%
                                    </span>
                                    {expanded ? (
                                      <ChevronUp size={12} className="text-gray-400" />
                                    ) : (
                                      <ChevronDown size={12} className="text-gray-400" />
                                    )}
                                  </div>
                                </button>

                                {/* Expanded detail */}
                                {expanded && (
                                  <div className="px-3 pb-3 pt-0 space-y-1 border-t border-gray-100 dark:border-gray-700">
                                    {sprint.employees.map((e) => (
                                      <div key={e.employee_id} className="flex items-center justify-between py-1.5">
                                        <div className="flex items-center gap-2">
                                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                                            {e.name[0]}
                                          </div>
                                          <div>
                                            <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                              {e.name}
                                            </div>
                                            <div className="text-[10px] text-gray-400">{e.role_name}</div>
                                          </div>
                                        </div>
                                        <span
                                          className={cn(
                                            'text-xs font-bold px-2 py-0.5 rounded-full border',
                                            chipColor(e.employee_id),
                                          )}
                                        >
                                          {e.allocation_percentage}%
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
