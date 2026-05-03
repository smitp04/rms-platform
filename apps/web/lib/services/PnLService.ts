import { prisma } from '@/lib/prisma';

// Recompute PnL snapshot for a project + sprint
export async function computePnLSnapshot(project_id: string, sprint_id: string) {
  const [project, sprint, allocations] = await Promise.all([
    prisma.rms_projects.findUniqueOrThrow({ where: { id: project_id } }),
    prisma.rms_sprints.findUniqueOrThrow({ where: { id: sprint_id } }),
    prisma.rms_allocations.findMany({
      where: { project_id, sprint_id, deleted_at: null },
      include: {
        employee: { select: { salary_ctc_cents: true } },
      },
    }),
  ]);

  const now = new Date();
  const is_projected = sprint.start_date > now;

  // Sprint is ~2 weeks = approx 1/26 of annual salary per sprint
  const SPRINTS_PER_YEAR = 26;
  let total_employee_cost_cents = 0;

  for (const alloc of allocations) {
    const annual_salary = alloc.employee.salary_ctc_cents ?? 0;
    const per_sprint_cost = annual_salary / SPRINTS_PER_YEAR;
    const cost_for_project = (per_sprint_cost * alloc.allocation_percentage) / 100;
    total_employee_cost_cents += Math.round(cost_for_project);
  }

  // Compute costs for this project in the month overlapping this sprint
  const sprintMonth = sprint.start_date.toISOString().slice(0, 7);
  const computeCosts = await prisma.rms_project_compute_costs.aggregate({
    where: { project_id, month: sprintMonth },
    _sum: { computed_cost_cents: true },
  });
  const total_compute_cost_cents = computeCosts._sum.computed_cost_cents ?? 0;

  // Revenue: prorate annually (monthly = revenue_cents / 12, bi-weekly = / 26)
  const revenue_cents = Math.round(Number(project.revenue_cents ?? 0) / SPRINTS_PER_YEAR);

  const total_cost_cents = total_employee_cost_cents + total_compute_cost_cents;
  const gross_margin_cents = revenue_cents - total_cost_cents;
  const is_in_red = total_cost_cents > revenue_cents;

  return prisma.rms_pnl_snapshots.upsert({
    where: { project_id_sprint_id: { project_id, sprint_id } },
    update: {
      revenue_cents,
      total_employee_cost_cents,
      total_compute_cost_cents,
      total_cost_cents,
      gross_margin_cents,
      is_in_red,
      is_projected,
      computed_at: new Date(),
    },
    create: {
      project_id,
      sprint_id,
      revenue_cents,
      total_employee_cost_cents,
      total_compute_cost_cents,
      total_cost_cents,
      gross_margin_cents,
      is_in_red,
      is_projected,
    },
  });
}

// Trigger recompute for all sprints of a project
export async function recomputeProjectPnL(project_id: string) {
  const sprints = await prisma.rms_sprints.findMany({ orderBy: { start_date: 'asc' } });
  const results = [];
  for (const sprint of sprints) {
    const snapshot = await computePnLSnapshot(project_id, sprint.id);
    results.push(snapshot);
  }
  return results;
}

export async function getRedFlagProjects() {
  return prisma.rms_pnl_snapshots.findMany({
    where: { is_in_red: true },
    include: {
      project: {
        include: { account: { select: { brand_name: true } } },
      },
      sprint: { select: { label: true } },
    },
    distinct: ['project_id'],
  });
}

export async function getProjectPnL(project_id: string, actor_role: string) {
  const snapshots = await prisma.rms_pnl_snapshots.findMany({
    where: { project_id },
    include: { sprint: { select: { label: true, start_date: true, end_date: true } } },
    orderBy: { sprint: { start_date: 'asc' } },
  });

  return snapshots.map((s) => ({
    ...s,
    // Strip revenue for non-admins
    revenue_cents: actor_role === 'ADMIN' ? s.revenue_cents : undefined,
    gross_margin_cents: actor_role === 'ADMIN' ? s.gross_margin_cents : undefined,
  }));
}
