import { create } from 'zustand';

interface ClipboardEntry {
  employee_id: string;
  project_id: string;
  sprint_id: string;
  allocation_percentage: number;
  project_name: string;
}

interface AllocationStore {
  // Clipboard for copy-paste
  clipboard: ClipboardEntry[];
  setClipboard: (entries: ClipboardEntry[]) => void;
  clearClipboard: () => void;

  // Active allocation being edited
  editingAllocationId: string | null;
  setEditingAllocationId: (id: string | null) => void;

  // History drawer
  historyAllocationId: string | null;
  setHistoryAllocationId: (id: string | null) => void;

  // Year selector for Gantt
  ganttYear: number;
  setGanttYear: (year: number) => void;
}

export const useAllocationStore = create<AllocationStore>((set) => ({
  clipboard: [],
  setClipboard: (entries) => set({ clipboard: entries }),
  clearClipboard: () => set({ clipboard: [] }),

  editingAllocationId: null,
  setEditingAllocationId: (id) => set({ editingAllocationId: id }),

  historyAllocationId: null,
  setHistoryAllocationId: (id) => set({ historyAllocationId: id }),

  ganttYear: new Date().getFullYear(),
  setGanttYear: (year) => set({ ganttYear: year }),
}));
