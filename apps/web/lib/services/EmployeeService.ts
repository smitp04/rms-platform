import { prisma } from '@/lib/prisma';
import { getCurrentSprint } from './SprintService';

export async function getEmployees(filters: {
  function_id?: string;
  role_id?: string;
  pod_id?: string;
  status?: string;
  search?: string;
  platform_id?: string;
  is_pm?: boolean;
  system_roles?: string[];
  page?: number;
  page_size?: number;
  available_only?: boolean;
  min_available?: number;
  sort_by_allocation?: 'asc' | 'desc';
  exclude_functions?: string[];
  function_names?: string[];
  sprint_id?: string;
}) {
  // Skip sprint query when only names are needed (is_pm filter)
  const needsAllocations = !filters.is_pm;
  let currentSprint: { id: string } | null = null;

  if (needsAllocations) {
    if (filters.sprint_id) {
      currentSprint = { id: filters.sprint_id };
    } else {
      currentSprint = await getCurrentSprint();
    }
  }

  // If filtering by pod, also include the pod's lead (who may belong to a different pod like CEO Pod)
  let podLeadId: string | null = null;
  if (filters.pod_id) {
    const pod = await prisma.pods.findUnique({ where: { id: filters.pod_id }, select: { lead_id: true } });
    if (pod?.lead_id) podLeadId = pod.lead_id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma where built dynamically
  const isInactiveStatus = filters.status === 'RESIGNED' || filters.status === 'TERMINATED';
  const where: any = {
    ...(filters.status === 'ACTIVE'
      ? {} // handled via AND below to avoid OR conflicts with pod/search
      : {
          ...(isInactiveStatus ? {} : { deleted_at: null }),
          ...(filters.status ? { status: filters.status } : {}),
        }),
    ...(filters.function_id ? { function_id: filters.function_id } : {}),
    ...(filters.role_id ? { role_id: filters.role_id } : {}),
    ...(filters.pod_id
      ? podLeadId
        ? { OR: [{ pod_id: filters.pod_id }, { id: podLeadId }] }
        : { pod_id: filters.pod_id }
      : {}),
    ...(filters.platform_id ? { platforms: { some: { platform_id: filters.platform_id } } } : {}),
    ...(filters.is_pm ? { system_role: 'CSM' } : {}),
    ...(filters.system_roles?.length ? { system_role: { in: filters.system_roles } } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' as const } },
            { email: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(filters.exclude_functions?.length ? { function: { name: { notIn: filters.exclude_functions } } } : {}),
    ...(filters.function_names?.length
      ? { function: { name: { in: filters.function_names, mode: 'insensitive' } } }
      : {}),
  };

  // When filtering ACTIVE, also include resigned/terminated employees with show_in_allocations enabled
  if (filters.status === 'ACTIVE') {
    where.AND = [...(where.AND || []), { OR: [{ status: 'ACTIVE', deleted_at: null }, { show_in_allocations: true }] }];
  }

  // Push available_only filtering to DB: exclude non-billable functions + over-allocated employees
  // min_available: keep only employees with at least N% bandwidth free
  const bandwidthThreshold =
    filters.min_available && filters.min_available > 0 ? filters.min_available : filters.available_only ? 20 : 0;
  if (bandwidthThreshold > 0) {
    where.NOT = [{ function: { name: { in: ['Growth', 'HR', 'Finance'], mode: 'insensitive' } } }];

    if (currentSprint) {
      const maxAllowedAllocation = 100 - bandwidthThreshold;
      const overAllocated = await prisma.rms_allocations.groupBy({
        by: ['employee_id'],
        where: { sprint_id: currentSprint.id, deleted_at: null, project: { show_in_allocations: true } },
        having: { allocation_percentage: { _sum: { gt: maxAllowedAllocation } } },
      });
      if (overAllocated.length > 0) {
        where.id = { notIn: overAllocated.map((a) => a.employee_id) };
      }
    }
  }

  const include = {
    function: { select: { id: true, name: true } },
    role: { select: { id: true, name: true } },
    pod: { select: { id: true, name: true, lead_id: true } },
    led_pod: { select: { id: true, name: true } },
    platforms: { select: { platform: { select: { id: true, name: true } } } },
    allocations: currentSprint
      ? {
          where: { sprint_id: currentSprint.id, deleted_at: null, project: { show_in_allocations: true } },
          select: { allocation_percentage: true },
        }
      : (false as const),
  };

  const usePagination = filters.page != null && filters.page_size != null;

  // Only sort_by_allocation still needs post-processing (available_only is now DB-level)
  const needsPostSort = !!filters.sort_by_allocation;

  const [rawEmployees, totalCount] = await Promise.all([
    prisma.employees.findMany({
      where,
      include,
      orderBy: { name: 'asc' },
      ...(!needsPostSort && usePagination
        ? { skip: (filters.page! - 1) * filters.page_size!, take: filters.page_size! }
        : {}),
    }),
    usePagination ? prisma.employees.count({ where }) : Promise.resolve(0),
  ]);

  // Compute allocation_pct for each employee
  let employees = rawEmployees.map((emp) => {
    const current_allocation_pct = (emp.allocations ?? []).reduce(
      (sum: number, a: { allocation_percentage: number }) => sum + a.allocation_percentage,
      0,
    );
    const { allocations: _alloc, led_pod: _led, ...rest } = emp;
    return { ...rest, current_allocation_pct, led_pod: emp.led_pod };
  });

  let total = totalCount || employees.length;

  // Post-sort: by allocation percentage
  if (filters.sort_by_allocation) {
    employees.sort((a, b) =>
      filters.sort_by_allocation === 'asc'
        ? a.current_allocation_pct - b.current_allocation_pct
        : b.current_allocation_pct - a.current_allocation_pct,
    );
    if (usePagination) {
      total = employees.length;
      const start = (filters.page! - 1) * filters.page_size!;
      employees = employees.slice(start, start + filters.page_size!);
    }
  }

  if (usePagination) {
    return { data: employees, total, page: filters.page!, page_size: filters.page_size! };
  }

  return employees;
}

export async function getEmployeeById(id: string) {
  return prisma.employees.findUnique({
    where: { id },
    include: {
      function: true,
      role: true,
      pod: { include: { lead: { select: { id: true, name: true } } } },
      platforms: { include: { platform: true } },
      skills: { include: { skill: true } },
    },
  });
}

// Resolve default Tech > SDE-1 for new employees (required fields in schema)
async function getDefaultFunctionAndRole() {
  let fn = await prisma.functions.findFirst({ where: { name: 'Tech' } });
  if (!fn) {
    fn = await prisma.functions.create({ data: { name: 'Tech' } });
  }

  let role = await prisma.roles.findFirst({
    where: { name: 'SDE-1', function_id: fn.id },
  });
  if (!role) {
    role = await prisma.roles.create({
      data: { name: 'SDE-1', function_id: fn.id },
    });
  }

  return { function: fn, role };
}

export async function createFromGoogleAdmin(payload: { google_id: string; email: string; name: string }) {
  const { function: fn, role } = await getDefaultFunctionAndRole();

  return prisma.employees.upsert({
    where: { email: payload.email },
    update: {
      google_id: payload.google_id,
      name: payload.name,
    },
    create: {
      google_id: payload.google_id,
      email: payload.email,
      name: payload.name,
      function_id: fn.id,
      role_id: role.id,
      system_role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
  });
}

export async function offboardFromGoogleAdmin(payload: {
  email: string;
  event_type: 'suspend' | 'delete' | 'archive';
}) {
  const employee = await prisma.employees.findUnique({
    where: { email: payload.email },
  });

  if (!employee) return null;
  if (employee.status === 'RESIGNED' || employee.status === 'TERMINATED') {
    return employee; // already offboarded
  }

  const status = payload.event_type === 'delete' ? 'TERMINATED' : 'RESIGNED';

  const updated = await prisma.employees.update({
    where: { email: payload.email },
    data: {
      status,
      show_in_allocations: false,
      resignation_date: new Date(),
    },
  });

  return { before: employee, after: updated };
}

export async function createManualEmployee(payload: {
  name: string;
  email: string;
  function_id: string;
  role_id: string;
  system_role?: string;
  pod_id?: string | null;
  status?: string;
  joining_date?: string | null;
  salary_ctc_cents?: number | null;
}) {
  if (!payload.email.endsWith('@devxlabs.ai')) {
    throw new Error('Email must be @devxlabs.ai');
  }

  const existing = await prisma.employees.findUnique({ where: { email: payload.email } });
  if (existing) {
    throw new Error('An employee with this email already exists');
  }

  return prisma.employees.create({
    data: {
      google_id: `manual_${crypto.randomUUID()}`,
      name: payload.name,
      email: payload.email,
      function_id: payload.function_id,
      role_id: payload.role_id,
      system_role: (payload.system_role ?? 'EMPLOYEE') as 'ADMIN' | 'POD_LEAD' | 'CSM' | 'EMPLOYEE',
      pod_id: payload.pod_id ?? null,
      status: (payload.status ?? 'ACTIVE') as 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'TERMINATED',
      joining_date: payload.joining_date ? new Date(payload.joining_date) : null,
      salary_ctc_cents: payload.salary_ctc_cents ?? null,
    },
  });
}

export async function updateEmployee(
  id: string,
  data: {
    name?: string;
    email?: string;
    function_id?: string;
    role_id?: string;
    pod_id?: string | null;
    system_role?: string;
    status?: string;
    joining_date?: Date | string | null;
    resignation_date?: Date | string | null;
    salary_ctc_cents?: number;
    show_in_allocations?: boolean;
    is_bench?: boolean;
    platform_ids?: string[];
    skill_ids?: string[];
  },
) {
  // Convert date strings to proper ISO-8601 DateTime for Prisma
  if (data.joining_date && typeof data.joining_date === 'string') {
    data.joining_date = new Date(data.joining_date);
  }
  if (data.resignation_date && typeof data.resignation_date === 'string') {
    data.resignation_date = new Date(data.resignation_date);
  }

  // Auto-turn off allocations visibility when employee is resigned/terminated
  if (data.status === 'RESIGNED' || data.status === 'TERMINATED') {
    data.show_in_allocations = false;
  }

  const { platform_ids, skill_ids, ...scalarData } = data;

  const before = await prisma.employees.findUniqueOrThrow({ where: { id } });
  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.employees.update({
      where: { id },
      data: scalarData as never,
    });

    if (platform_ids !== undefined) {
      await tx.employee_platforms.deleteMany({ where: { employee_id: id } });
      if (platform_ids.length) {
        await tx.employee_platforms.createMany({
          data: platform_ids.map((platform_id) => ({ employee_id: id, platform_id })),
          skipDuplicates: true,
        });
      }
    }

    if (skill_ids !== undefined) {
      await tx.employee_skills.deleteMany({ where: { employee_id: id } });
      if (skill_ids.length) {
        await tx.employee_skills.createMany({
          data: skill_ids.map((skill_id) => ({ employee_id: id, skill_id, level: 3 })),
          skipDuplicates: true,
        });
      }
    }

    return updated;
  });

  // If an admin patch promotes someone to POD_LEAD or moves them between pods,
  // sync the pod's lead_id. Skip when neither field is in the patch (e.g. self-edits).
  const roleChanged = data.system_role !== undefined && data.system_role !== before.system_role;
  const podChanged = data.pod_id !== undefined && data.pod_id !== before.pod_id;
  if (roleChanged || podChanged) {
    const newRole = data.system_role ?? before.system_role;
    const podId = data.pod_id ?? before.pod_id;
    if (newRole === 'POD_LEAD' && podId) {
      const pod = await prisma.pods.findUnique({ where: { id: podId }, select: { lead_id: true } });
      if (pod && pod.lead_id !== id) {
        await prisma.pods.update({ where: { id: podId }, data: { lead_id: id } });
      }
    }
  }

  return { before, after };
}

export async function deactivateEmployee(id: string) {
  const before = await prisma.employees.findUniqueOrThrow({ where: { id } });
  const after = await prisma.employees.update({
    where: { id },
    data: { status: 'RESIGNED', deleted_at: new Date() },
  });
  return { before, after };
}
