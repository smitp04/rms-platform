'use client';

import { ALLOCATION_MAX, ALLOCATION_MIN, ALLOCATION_STEP } from '@devx/config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  employeeId: string;
  employeeName?: string;
  sprintId: string;
  projectId?: string;
  allocationId?: string;
  currentPct?: number;
  available: number;
  mode: 'add' | 'edit';
  onClose: () => void;
  onSaved: () => void;
}

interface EmployeeOption {
  id: string;
  name: string;
  role?: { name: string } | null;
  function?: { id: string; name: string } | null;
  current_allocation_pct?: number;
}

interface ProjectOption {
  id: string;
  deal_name: string;
  zoho_deal_id: string | null;
  brand_name: string;
  status: string;
}

interface SprintAvailability {
  employee_id: string;
  sprint_id: string;
  current_sprint_pct: number;
  available_pct: number;
}

export function AllocationModal({
  employeeId,
  employeeName,
  sprintId,
  projectId,
  allocationId,
  currentPct,
  available: _available,
  mode,
  onClose,
  onSaved,
}: Props) {
  const isEdit = mode === 'edit';
  // "fromBandwidth" = employee is pre-selected (clicked Allocate from bandwidth panel) but no project yet
  const fromBandwidth = !isEdit && !!employeeId && !projectId;

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    employeeId ? new Set([employeeId]) : new Set(),
  );
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? '');
  const [projectSearch, setProjectSearch] = useState('');
  const [pct, setPct] = useState<number | null>(isEdit ? (currentPct ?? 50) : null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [functionFilter, setFunctionFilter] = useState('');
  const [minAvailFilter, setMinAvailFilter] = useState('');
  const [nameSearch, setNameSearch] = useState('');

  // For single-select backwards compat (edit mode, bandwidth mode)
  const selectedEmployeeId = isEdit || fromBandwidth ? employeeId : (Array.from(selectedEmployeeIds)[0] ?? '');

  const { data: empData } = useQuery({
    queryKey: ['employees-list-allocation', sprintId],
    queryFn: () =>
      fetch(`/api/v1/employees?status=ACTIVE&exclude_functions=Growth,HR,Finance&sprint_id=${sprintId}`).then((r) =>
        r.json(),
      ),
    enabled: !isEdit && !fromBandwidth,
    staleTime: 30_000,
  });
  const allEmployees: EmployeeOption[] = empData?.data ?? [];

  // Fetch projects for bandwidth-panel allocation mode
  const { data: projData } = useQuery({
    queryKey: ['projects-for-allocation'],
    queryFn: () => fetch('/api/v1/projects?status=ACTIVE,UPCOMING').then((r) => r.json()),
    enabled: fromBandwidth,
    staleTime: 300_000,
  });
  const allProjects: ProjectOption[] = (projData?.data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    deal_name: p.deal_name as string,
    zoho_deal_id: (p.zoho_deal_id as string | null) ?? null,
    brand_name: (p.account as { brand_name: string } | undefined)?.brand_name ?? (p.brand_name as string) ?? '',
    status: p.status as string,
  }));
  const filteredProjects = useMemo(() => {
    if (!projectSearch) return allProjects;
    const q = projectSearch.toLowerCase();
    return allProjects.filter(
      (p) =>
        p.deal_name.toLowerCase().includes(q) ||
        p.brand_name.toLowerCase().includes(q) ||
        (p.zoho_deal_id ?? '').toLowerCase().includes(q),
    );
  }, [allProjects, projectSearch]);

  // Availability query — only for single-select modes (edit / bandwidth)
  const activeEmpId = isEdit ? employeeId : selectedEmployeeId;
  const isSingleMode = isEdit || fromBandwidth || selectedEmployeeIds.size === 1;
  const { data: availData } = useQuery<{ data: SprintAvailability }>({
    queryKey: ['sprint-avail', activeEmpId, sprintId, allocationId],
    queryFn: () =>
      fetch(
        `/api/v1/allocations/validate?employee_id=${activeEmpId}&sprint_id=${sprintId}${
          allocationId ? `&exclude=${allocationId}` : ''
        }`,
        { cache: 'no-store' },
      ).then((r) => r.json()),
    enabled: !!activeEmpId && !!sprintId && isSingleMode,
    staleTime: 0,
  });

  const sprintAvailPct: number = isSingleMode ? (availData?.data?.available_pct ?? 100) : 100;

  // Per-allocation bench flag (single-select modes only). For edit, fetch the allocation.
  const { data: allocBenchData, isLoading: isBenchLoading } = useQuery<{
    data: { id: string; is_bench: boolean };
  }>({
    queryKey: ['allocation-bench', allocationId],
    queryFn: () => fetch(`/api/v1/allocations/${allocationId}`).then((r) => r.json()),
    enabled: !!allocationId && isEdit,
    staleTime: 30_000,
  });
  const initialIsBench = isEdit ? (allocBenchData?.data?.is_bench ?? false) : false;
  const [isBench, setIsBench] = useState(false);
  useEffect(() => {
    if (isEdit) setIsBench(initialIsBench);
  }, [isEdit, initialIsBench]);
  const benchLoaded = isEdit ? !isBenchLoading && allocBenchData !== undefined : true;

  useEffect(() => {
    if (isEdit || pct !== null) return;
    if (selectedEmployeeIds.size === 0 && !fromBandwidth) {
      setPct(50);
      return;
    }
    if (isSingleMode) {
      const maxValid = Math.floor(sprintAvailPct / ALLOCATION_STEP) * ALLOCATION_STEP;
      setPct(Math.max(ALLOCATION_MIN, Math.min(maxValid, ALLOCATION_MAX)));
    } else {
      setPct(50);
    }
  }, [sprintAvailPct, selectedEmployeeIds.size, isEdit, pct, fromBandwidth, isSingleMode]);

  function toggleEmployee(id: string) {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPct(null);
    setError('');
  }

  const functionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of allEmployees) {
      if (e.function?.id && !seen.has(e.function.id)) seen.set(e.function.id, e.function.name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [allEmployees]);

  const employees = useMemo(() => {
    let list = allEmployees;
    if (functionFilter) list = list.filter((e) => e.function?.id === functionFilter);
    if (minAvailFilter) {
      const minAvail = parseInt(minAvailFilter, 10);
      list = list.filter((e) => 100 - (e.current_allocation_pct ?? 0) >= minAvail);
    }
    if (nameSearch) list = list.filter((e) => e.name.toLowerCase().includes(nameSearch.toLowerCase()));
    return list;
  }, [allEmployees, functionFilter, minAvailFilter, nameSearch]);

  const pctPresets = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90, 100];
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const currentPctValue = pct ?? 50;
  const maxAllowed = sprintAvailPct;
  const wouldExceed = isSingleMode && currentPctValue > maxAllowed;
  const isPreset = pctPresets.includes(currentPctValue);

  const isMultiAdd = !isEdit && !fromBandwidth && selectedEmployeeIds.size > 1;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const res = await fetch(`/api/v1/allocations/${allocationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            allocation_percentage: currentPctValue,
            is_bench: isBench,
            notes: notes || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
        return data;
      }

      if (fromBandwidth) {
        const res = await fetch('/api/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: selectedEmployeeId,
            sprint_id: sprintId,
            project_id: selectedProjectId,
            allocation_percentage: currentPctValue,
            is_bench: isBench,
            notes: notes || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
        return data;
      }

      // Multi-select or single add — use bulk API
      const isSingleAdd = selectedEmployeeIds.size === 1;
      const allocations = Array.from(selectedEmployeeIds).map((empId) => ({
        employee_id: empId,
        sprint_id: sprintId,
        project_id: projectId!,
        allocation_percentage: currentPctValue,
        ...(isSingleAdd ? { is_bench: isBench } : {}),
        notes: notes || undefined,
      }));

      if (allocations.length === 1) {
        const res = await fetch('/api/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(allocations[0]),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
        return data;
      }

      // Bulk
      const res = await fetch('/api/v1/allocations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
      if (data.data?.failed?.length > 0) {
        throw new Error(`${data.data.failed.length} allocation(s) failed`);
      }
      return data;
    },
    onSuccess: onSaved,
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/allocations/${allocationId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Delete failed');
    },
    onSuccess: onSaved,
    onError: (err: Error) => setError(err.message),
  });

  const hasEmployeeSelection = isEdit || fromBandwidth || selectedEmployeeIds.size > 0;
  const hasProjectSelection = fromBandwidth ? !!selectedProjectId : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Edit Allocation' : fromBandwidth ? 'Allocate to Project' : 'Add Person to Sprint'}
            </h2>
            {(isEdit || fromBandwidth) && employeeName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">{employeeName}</p>
            )}
            {isMultiAdd && (
              <p className="text-xs text-blue-600 mt-0.5 font-medium">{selectedEmployeeIds.size} people selected</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Project picker — shown when allocating from bandwidth panel */}
          {fromBandwidth && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Project</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search project or deal ID..."
                  value={projectSearch}
                  onChange={(e) => {
                    setProjectSearch(e.target.value);
                    setSelectedProjectId('');
                    setPct(null);
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-7 py-1.5 text-xs mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500"
                />
                {projectSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setProjectSearch('');
                      setSelectedProjectId('');
                      setPct(null);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 -mt-[3px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                {filteredProjects.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400 italic">No projects found</div>
                ) : (
                  <div className="overflow-y-auto max-h-36 divide-y divide-gray-50 dark:divide-gray-800">
                    {filteredProjects.map((p) => {
                      const isSelected = selectedProjectId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(p.id);
                            setPct(null);
                            setError('');
                          }}
                          className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 transition-colors text-xs ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                              : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span className="font-medium truncate flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{p.deal_name}</span>
                            {p.zoho_deal_id && (
                              <span
                                className="shrink-0 px-1 py-0.5 rounded text-[9px] font-mono font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                                title={p.zoho_deal_id}
                              >
                                {p.zoho_deal_id.slice(-4)}
                              </span>
                            )}
                            <span className="font-normal text-gray-500 dark:text-gray-400 truncate">
                              {' '}
                              — {p.brand_name}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              p.status === 'ACTIVE'
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {p.status === 'ACTIVE' ? 'Active' : 'Upcoming'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isEdit && !fromBandwidth && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Function
                  </label>
                  <select
                    value={functionFilter}
                    onChange={(e) => {
                      setFunctionFilter(e.target.value);
                      setSelectedEmployeeIds(new Set());
                      setPct(null);
                    }}
                    className="select-chevron w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-2.5 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
                  >
                    <option value="">All functions</option>
                    {functionOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Min. available
                  </label>
                  <select
                    value={minAvailFilter}
                    onChange={(e) => {
                      setMinAvailFilter(e.target.value);
                      setSelectedEmployeeIds(new Set());
                      setPct(null);
                    }}
                    className="select-chevron w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-2.5 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900"
                  >
                    <option value="">Any</option>
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
                      <option key={v} value={v}>
                        {v}%+
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Person
                  {selectedEmployeeIds.size > 0 && (
                    <span className="ml-1.5 text-blue-600 font-semibold">({selectedEmployeeIds.size} selected)</span>
                  )}
                  {selectedEmployeeIds.size === 0 &&
                    employees.length > 0 &&
                    (functionFilter || minAvailFilter || nameSearch) && (
                      <span className="ml-1.5 text-gray-400 font-normal">
                        ({employees.length} match{employees.length === 1 ? '' : 'es'})
                      </span>
                    )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={nameSearch}
                    onChange={(e) => {
                      setNameSearch(e.target.value);
                    }}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-7 py-1.5 text-xs mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                  {nameSearch && (
                    <button
                      type="button"
                      onClick={() => setNameSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 -mt-[3px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  {employees.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400 italic">No matches</div>
                  ) : (
                    <div className="overflow-y-auto max-h-36 divide-y divide-gray-50 dark:divide-gray-800">
                      {employees.map((e) => {
                        const avail = 100 - (e.current_allocation_pct ?? 0);
                        const isSelected = selectedEmployeeIds.has(e.id);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => toggleEmployee(e.id)}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors text-xs ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              {isSelected && <Check size={10} className="text-white" />}
                            </div>
                            <span className="font-medium truncate flex-1">
                              {e.name}
                              {e.role?.name ? (
                                <span className="font-normal text-gray-500 dark:text-gray-400"> — {e.role.name}</span>
                              ) : (
                                ''
                              )}
                            </span>
                            <span
                              className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                avail >= 50
                                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                  : avail > 0
                                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                    : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                              }`}
                            >
                              {avail}% free
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Selected chips */}
                {selectedEmployeeIds.size > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Array.from(selectedEmployeeIds).map((id) => {
                      const emp = allEmployees.find((e) => e.id === id);
                      if (!emp) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-medium px-2 py-0.5 rounded-full"
                        >
                          {emp.name}
                          <button type="button" onClick={() => toggleEmployee(id)} className="hover:text-blue-900">
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {isSingleMode && selectedEmployeeIds.size === 1 && (
                  <div className="mt-1.5">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        sprintAvailPct >= 50
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : sprintAvailPct > 0
                            ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {sprintAvailPct}% available in this sprint
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Allocation %</label>
              {isSingleMode && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  Max available: <span className="font-bold text-gray-700 dark:text-gray-300">{maxAllowed}%</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {pctPresets.map((step) => {
                const overLimit = isSingleMode && step > maxAllowed;
                return (
                  <button
                    key={step}
                    onClick={() => {
                      setPct(step);
                      setCustomMode(false);
                      setError('');
                    }}
                    title={overLimit ? `Exceeds ${maxAllowed}% available` : undefined}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      currentPctValue === step && !customMode
                        ? 'bg-blue-600 text-white'
                        : overLimit
                          ? 'bg-red-50 dark:bg-red-950/40 text-red-300 dark:text-red-400 cursor-not-allowed'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {step}%
                  </button>
                );
              })}
              {/* Custom option */}
              <button
                onClick={() => {
                  setCustomMode(true);
                  setCustomInput(String(currentPctValue));
                }}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  customMode || (!isPreset && pct !== null)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Custom
              </button>
            </div>
            {(customMode || (!isPreset && pct !== null)) && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={ALLOCATION_MIN}
                  max={ALLOCATION_MAX}
                  step={ALLOCATION_STEP}
                  value={customInput || (pct !== null ? String(pct) : '')}
                  onChange={(e) => {
                    setCustomInput(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (
                      !Number.isNaN(val) &&
                      val >= ALLOCATION_MIN &&
                      val <= ALLOCATION_MAX &&
                      val % ALLOCATION_STEP === 0
                    ) {
                      setPct(val);
                      setError('');
                    }
                  }}
                  placeholder={`${ALLOCATION_MIN}–${ALLOCATION_MAX} in steps of ${ALLOCATION_STEP}`}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">%</span>
              </div>
            )}
            {wouldExceed && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
                <AlertCircle size={12} />
                Total would exceed 100% for this sprint. Max allowed: {maxAllowed}%.
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context for this allocation..."
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {isSingleMode && activeEmpId && benchLoaded && (
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Mark as Bench</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Flag this specific allocation as bench. Saved with the allocation.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBench((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isBench ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isBench ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          {isEdit && (
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={
              saveMutation.isPending ||
              !hasEmployeeSelection ||
              !hasProjectSelection ||
              currentPctValue < ALLOCATION_MIN ||
              currentPctValue % ALLOCATION_STEP !== 0 ||
              wouldExceed
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending
              ? 'Saving...'
              : isEdit
                ? 'Update'
                : isMultiAdd
                  ? `Add ${selectedEmployeeIds.size} people`
                  : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
