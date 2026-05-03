import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';

const PAGE_SIZE = 50;

/**
 * GET /api/v1/employees/:id/activity?page=1
 *
 * Returns paginated allocation audit log entries where the affected allocation
 * belongs to the given employee.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id: employee_id } = await params;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

    // Find all allocation IDs for this employee (including soft-deleted)
    const allocations = await prisma.rms_allocations.findMany({
      where: { employee_id },
      select: { id: true },
    });
    const allocationIds = allocations.map((a) => a.id);

    if (allocationIds.length === 0) {
      return apiSuccess({ data: [], total: 0, page, page_size: PAGE_SIZE });
    }

    const where = {
      entity_type: 'allocation' as const,
      entity_id: { in: allocationIds },
    };

    // Get total count + paginated logs
    const [total, logs] = await Promise.all([
      prisma.audit_logs.count({ where }),
      prisma.audit_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    // Enrich with actor names
    const actorIds = [...new Set(logs.map((l) => l.changed_by))];
    const actors = await prisma.employees.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, system_role: true },
    });
    const actorMap = Object.fromEntries(actors.map((a) => [a.id, a]));

    // Enrich with project + sprint info from new_value / old_value snapshots
    const enriched = logs.map((log) => {
      const snapshot = (log.new_value ?? log.old_value) as Record<string, unknown> | null;
      return {
        id: log.id,
        action: log.action,
        created_at: log.created_at,
        actor_name: actorMap[log.changed_by as string]?.name ?? 'Unknown',
        actor_role: actorMap[log.changed_by as string]?.system_role ?? 'EMPLOYEE',
        old_pct: (log.old_value as Record<string, unknown> | null)?.allocation_percentage ?? null,
        new_pct: (log.new_value as Record<string, unknown> | null)?.allocation_percentage ?? null,
        sprint_id: snapshot?.sprint_id ?? null,
        project_id: snapshot?.project_id ?? null,
      };
    });

    // Bulk-fetch project + sprint labels so we can show human-readable names
    const projectIds = [...new Set(enriched.map((e) => e.project_id).filter(Boolean) as string[])];
    const sprintIds  = [...new Set(enriched.map((e) => e.sprint_id).filter(Boolean)  as string[])];

    const [projects, sprints] = await Promise.all([
      prisma.rms_projects.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, deal_name: true, account: { select: { brand_name: true } } },
      }),
      prisma.rms_sprints.findMany({
        where: { id: { in: sprintIds } },
        select: { id: true, label: true },
      }),
    ]);

    const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));
    const sprintMap  = Object.fromEntries(sprints.map((s)  => [s.id, s]));

    const result = enriched.map((e) => ({
      ...e,
      brand_name: e.project_id ? (projectMap[e.project_id as string]?.account?.brand_name ?? null) : null,
      deal_name:  e.project_id ? (projectMap[e.project_id as string]?.deal_name ?? null) : null,
      sprint_label: e.sprint_id ? (sprintMap[e.sprint_id as string]?.label ?? null) : null,
    }));

    return apiSuccess({ data: result, total, page, page_size: PAGE_SIZE });
  } catch (err) {
    return apiError(err);
  }
}
