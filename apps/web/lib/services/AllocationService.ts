import { ALLOCATION_MAX, ALLOCATION_MIN, ALLOCATION_STEP, ALLOCATION_TOTAL_MAX } from '@devx/config';
import type { SystemRole } from '@devx/types';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from './AuditService';
import { classifySprint } from './SprintService';

interface CreateAllocationInput {
  employee_id: string;
  project_id: string;
  sprint_id: string;
  allocation_percentage: number;
  is_bench?: boolean;
  notes?: string;
}

interface ActorContext {
  actor_id: string;
  actor_role: SystemRole;
  pod_id?: string | null;
  ip_address?: string;
  user_agent?: string;
}

// Validate allocation percentage is a valid step
export function validateAllocationPct(pct: number): void {
  if (pct < ALLOCATION_MIN || pct > ALLOCATION_MAX || pct % ALLOCATION_STEP !== 0) {
    throw new Error(`Allocation must be between ${ALLOCATION_MIN}–${ALLOCATION_MAX}% in steps of ${ALLOCATION_STEP}%`);
  }
}

// Check if adding this allocation would exceed 100% for the employee in this sprint
export async function validateTotalAllocation(
  employee_id: string,
  sprint_id: string,
  pct: number,
  exclude_allocation_id?: string,
): Promise<{ valid: boolean; current: number; available: number }> {
  const existing = await prisma.rms_allocations.aggregate({
    where: {
      employee_id,
      sprint_id,
      deleted_at: null,
      ...(exclude_allocation_id ? { NOT: { id: exclude_allocation_id } } : {}),
    },
    _sum: { allocation_percentage: true },
  });

  const current = existing._sum.allocation_percentage ?? 0;
  const available = ALLOCATION_TOTAL_MAX - current;

  return {
    valid: current + pct <= ALLOCATION_TOTAL_MAX,
    current,
    available,
  };
}

// Validate actor can write to the sprint based on role
async function validateSprintAccess(sprint_id: string, actor_role: SystemRole): Promise<void> {
  const sprint = await prisma.rms_sprints.findUniqueOrThrow({ where: { id: sprint_id } });
  const sprintType = classifySprint(sprint);

  if (actor_role !== 'ADMIN' && sprintType === 'past') {
    throw new Error('Only Admins can modify past sprint allocations');
  }
}

// Validate POD lead can only modify their pod members
// A POD lead is identified by pods.lead_id, not by their own pod membership.
async function validatePodAccess(employee_id: string, actor: ActorContext): Promise<void> {
  if (actor.actor_role !== 'POD_LEAD') return;

  // POD leads can always allocate themselves
  if (employee_id === actor.actor_id) return;

  // Find pods this actor leads
  const ledPods = await prisma.pods.findMany({
    where: { lead_id: actor.actor_id, deleted_at: null },
    select: { id: true },
  });
  const ledPodIds = ledPods.map((p) => p.id);

  if (ledPodIds.length === 0) {
    throw new Error('You are not assigned as lead of any POD');
  }

  const employee = await prisma.employees.findUniqueOrThrow({
    where: { id: employee_id },
    select: { pod_id: true },
  });

  if (!employee.pod_id || !ledPodIds.includes(employee.pod_id)) {
    throw new Error('POD Leads can only manage allocations for their own POD members');
  }
}

export async function createAllocation(input: CreateAllocationInput, actor: ActorContext) {
  validateAllocationPct(input.allocation_percentage);
  await validateSprintAccess(input.sprint_id, actor.actor_role);
  await validatePodAccess(input.employee_id, actor);

  const { valid, available } = await validateTotalAllocation(
    input.employee_id,
    input.sprint_id,
    input.allocation_percentage,
  );

  if (!valid) {
    throw new Error(`Allocation would exceed 100%. Employee has ${available}% available this sprint.`);
  }

  // Use upsert to handle the case where a soft-deleted or existing allocation
  // already exists for this employee+project+sprint combo
  const existing = await prisma.rms_allocations.findFirst({
    where: {
      employee_id: input.employee_id,
      project_id: input.project_id,
      sprint_id: input.sprint_id,
    },
  });

  let allocation: Awaited<ReturnType<typeof prisma.rms_allocations.update>>;
  if (existing) {
    // Restore/update the existing record (may have been soft-deleted)
    allocation = await prisma.rms_allocations.update({
      where: { id: existing.id },
      data: {
        allocation_percentage: input.allocation_percentage,
        is_bench: input.is_bench ?? false,
        notes: input.notes,
        deleted_at: null,
        updated_by: actor.actor_id,
      },
    });
  } else {
    allocation = await prisma.rms_allocations.create({
      data: {
        ...input,
        created_by: actor.actor_id,
      },
    });
  }

  await writeAuditLog({
    entity_type: 'allocation',
    entity_id: allocation.id,
    action: 'create',
    changed_by: actor.actor_id,
    old_value: null,
    new_value: JSON.parse(JSON.stringify(allocation)),
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return allocation;
}

export async function updateAllocation(
  id: string,
  patch: { allocation_percentage?: number; is_bench?: boolean; notes?: string },
  actor: ActorContext,
) {
  const before = await prisma.rms_allocations.findUniqueOrThrow({ where: { id } });
  await validateSprintAccess(before.sprint_id, actor.actor_role);
  await validatePodAccess(before.employee_id, actor);

  if (patch.allocation_percentage !== undefined) {
    validateAllocationPct(patch.allocation_percentage);
    const { valid, available } = await validateTotalAllocation(
      before.employee_id,
      before.sprint_id,
      patch.allocation_percentage,
      id, // exclude self
    );
    if (!valid) {
      throw new Error(`Allocation would exceed 100%. Employee has ${available}% available (excluding current).`);
    }
  }

  const after = await prisma.rms_allocations.update({
    where: { id },
    data: { ...patch, updated_by: actor.actor_id },
  });

  await writeAuditLog({
    entity_type: 'allocation',
    entity_id: id,
    action: 'update',
    changed_by: actor.actor_id,
    old_value: JSON.parse(JSON.stringify(before)),
    new_value: JSON.parse(JSON.stringify(after)),
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return after;
}

export async function deleteAllocation(id: string, actor: ActorContext) {
  const before = await prisma.rms_allocations.findUniqueOrThrow({ where: { id } });
  await validateSprintAccess(before.sprint_id, actor.actor_role);
  await validatePodAccess(before.employee_id, actor);

  const after = await prisma.rms_allocations.update({
    where: { id },
    data: { deleted_at: new Date(), updated_by: actor.actor_id },
  });

  await writeAuditLog({
    entity_type: 'allocation',
    entity_id: id,
    action: 'delete',
    changed_by: actor.actor_id,
    old_value: JSON.parse(JSON.stringify(before)),
    new_value: null,
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  });

  return after;
}

// Copy allocations from source sprints to target sprints (bulk)
export async function copyAllocations(
  employee_ids: string[],
  source_sprint_ids: string[],
  target_sprint_ids: string[],
  actor: ActorContext,
) {
  const sources = await prisma.rms_allocations.findMany({
    where: {
      employee_id: { in: employee_ids },
      sprint_id: { in: source_sprint_ids },
      deleted_at: null,
    },
  });

  const results = [];
  for (const source of sources) {
    for (const target_sprint_id of target_sprint_ids) {
      try {
        const result = await createAllocation(
          {
            employee_id: source.employee_id,
            project_id: source.project_id,
            sprint_id: target_sprint_id,
            allocation_percentage: source.allocation_percentage,
            notes: source.notes ?? undefined,
          },
          actor,
        );
        results.push({ success: true, allocation: result });
      } catch (err) {
        results.push({
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          employee_id: source.employee_id,
          project_id: source.project_id,
          sprint_id: target_sprint_id,
        });
      }
    }
  }
  return results;
}

// Gantt-optimized query: employees × sprints × allocations
export async function getGanttData(
  year: number,
  filters: {
    pod_id?: string;
    function_id?: string;
    actor_role: SystemRole;
    actor_id?: string;
  },
) {
  const sprints = await prisma.rms_sprints.findMany({
    where: { year },
    orderBy: { sprint_number: 'asc' },
  });

  const employeeWhere: Record<string, unknown> = {
    deleted_at: null,
    status: 'ACTIVE',
    show_in_allocations: true,
  };

  // POD_LEAD: see members of pods they lead (not their own pod membership)
  if (filters.actor_role === 'POD_LEAD' && filters.actor_id) {
    const ledPods = await prisma.pods.findMany({
      where: { lead_id: filters.actor_id, deleted_at: null },
      select: { id: true },
    });
    const ledPodIds = ledPods.map((p) => p.id);
    if (ledPodIds.length > 0) {
      employeeWhere.pod_id = { in: ledPodIds };
    }
  }
  if (filters.pod_id) employeeWhere.pod_id = filters.pod_id;
  if (filters.function_id) employeeWhere.function_id = filters.function_id;

  const employees = await prisma.employees.findMany({
    where: employeeWhere,
    include: {
      function: { select: { name: true } },
      role: { select: { name: true } },
      pod: { select: { id: true, name: true, lead_id: true } },
    },
    orderBy: { name: 'asc' },
  });

  const sprintIds = sprints.map((s) => s.id);
  const employeeIds = employees.map((e) => e.id);

  const allocations = await prisma.rms_allocations.findMany({
    where: {
      employee_id: { in: employeeIds },
      sprint_id: { in: sprintIds },
      deleted_at: null,
      project: { show_in_allocations: true },
    },
    include: {
      project: {
        include: { account: { select: { brand_name: true } } },
      },
    },
  });

  const now = new Date();

  // Build gantt rows
  return employees.map((emp) => ({
    employee: {
      id: emp.id,
      name: emp.name,
      avatar_url: emp.avatar_url,
      function: emp.function.name,
      role: emp.role.name,
      is_pod_lead: emp.pod?.lead_id === emp.id,
      pod_id: emp.pod_id,
      pod_name: emp.pod?.name,
    },
    sprints: sprints.map((sprint) => {
      const sprintAllocs = allocations.filter((a) => a.employee_id === emp.id && a.sprint_id === sprint.id);
      const total = sprintAllocs.reduce((sum, a) => sum + a.allocation_percentage, 0);
      return {
        sprint_id: sprint.id,
        label: sprint.label,
        start_date: sprint.start_date,
        end_date: sprint.end_date,
        is_past: sprint.end_date < now,
        is_current: sprint.start_date <= now && sprint.end_date >= now,
        allocations: sprintAllocs.map((a) => ({
          id: a.id,
          project_id: a.project_id,
          project_name: a.project.deal_name,
          brand_name: a.project.account.brand_name,
          allocation_percentage: a.allocation_percentage,
        })),
        total_allocated: total,
        available: Math.max(0, 100 - total),
      };
    }),
  }));
}
