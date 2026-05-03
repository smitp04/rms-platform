// Lightweight API-facing types (not Prisma models)
// Used by frontend and API route handlers

export interface Employee {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  joining_date?: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'TERMINATED';
  system_role: 'ADMIN' | 'POD_LEAD' | 'CSM' | 'EMPLOYEE';
  function: { id: string; name: string };
  role: { id: string; name: string };
  pod?: { id: string; name: string } | null;
  is_pod_lead: boolean;
  platforms: { id: string; name: string }[];
  salary_ctc_cents?: number | null;
  current_allocation_pct?: number; // computed: sum of current sprint allocations
}

export interface Project {
  id: string;
  deal_name: string;
  account: { id: string; brand_name: string };
  status: 'UPCOMING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  billing_model: 'TIME_AND_MATERIAL' | 'FIXED_PRICE' | 'RETAINER' | 'MILESTONE_BASED';
  devx_pillar: 'CUSTOMER_INTERACTION' | 'MARKETING_AUTOMATION' | 'AI_OPS' | 'ENTERPRISE_ARCHITECTURE';
  start_date: string;
  end_date?: string | null;
  sow_url?: string | null;
  expected_compute_cost_cents: number;
  // Revenue only included for ADMIN role
  revenue_cents?: number;
  project_manager?: { id: string; name: string } | null;
  growth_consultant?: { id: string; name: string } | null;
  practice_poc?: { id: string; name: string } | null;
}

export interface Sprint {
  id: string;
  sprint_number: number;
  year: number;
  start_date: string;
  end_date: string;
  label: string;
  is_current: boolean;
  is_past: boolean;
  is_future: boolean;
}

export interface Allocation {
  id: string;
  employee_id: string;
  project_id: string;
  sprint_id: string;
  allocation_percentage: number;
  notes?: string | null;
  created_by: string;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GanttRow {
  employee: {
    id: string;
    name: string;
    avatar_url?: string | null;
    function: string;
    role: string;
    is_pod_lead: boolean;
    pod_id?: string | null;
  };
  sprints: {
    sprint_id: string;
    label: string;
    allocations: {
      id: string;
      project_id: string;
      project_name: string;
      brand_name: string;
      allocation_percentage: number;
    }[];
    total_allocated: number;
    available: number;
  }[];
}

export interface PnLSnapshot {
  project_id: string;
  sprint_id: string;
  sprint_label: string;
  revenue_cents: number;
  total_employee_cost_cents: number;
  total_compute_cost_cents: number;
  total_cost_cents: number;
  gross_margin_cents: number;
  is_in_red: boolean;
  is_projected: boolean;
}

export interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changed_by: string;
  actor_name?: string;
  actor_role?: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  created_at: string;
}
