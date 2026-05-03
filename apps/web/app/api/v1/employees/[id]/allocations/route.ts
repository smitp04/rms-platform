import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';
import type { SystemRole } from '@devx/types';

// GET /api/v1/employees/:id/allocations?year=2025
// Returns per-sprint allocation trend for an employee
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const actor_role = session.user.system_role as SystemRole;

    // Employees can only view themselves
    if (actor_role === 'EMPLOYEE' && id !== session.user.id) {
      throw new ApiError(403, 'Forbidden');
    }

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));

    const sprints = await prisma.rms_sprints.findMany({
      where: { year },
      orderBy: { sprint_number: 'asc' },
    });

    const allocations = await prisma.rms_allocations.findMany({
      where: {
        employee_id: id,
        sprint_id: { in: sprints.map((s) => s.id) },
        deleted_at: null,
      },
      include: {
        project: {
          include: {
            account: { select: { brand_name: true } },
          },
        },
        sprint: true,
      },
      orderBy: { sprint: { sprint_number: 'asc' } },
    });

    // Build sprint-level summary
    const sprintMap = new Map<
      string,
      {
        sprint_id: string;
        sprint_number: number;
        label: string;
        start_date: Date;
        end_date: Date;
        total_pct: number;
        projects: { project_id: string; deal_name: string; brand_name: string; pct: number }[];
      }
    >();

    for (const sprint of sprints) {
      sprintMap.set(sprint.id, {
        sprint_id: sprint.id,
        sprint_number: sprint.sprint_number,
        label: sprint.label,
        start_date: sprint.start_date,
        end_date: sprint.end_date,
        total_pct: 0,
        projects: [],
      });
    }

    for (const alloc of allocations) {
      const entry = sprintMap.get(alloc.sprint_id);
      if (!entry) continue;
      entry.total_pct += alloc.allocation_percentage;
      entry.projects.push({
        project_id: alloc.project_id,
        deal_name: alloc.project.deal_name,
        brand_name: alloc.project.account.brand_name,
        pct: alloc.allocation_percentage,
      });
    }

    const trend = [...sprintMap.values()];

    // Compute averages only over sprints that have at least one allocation
    const activeSprints = trend.filter((s) => s.total_pct > 0);
    const avg_allocation =
      activeSprints.length > 0
        ? Math.round(activeSprints.reduce((sum, s) => sum + s.total_pct, 0) / activeSprints.length)
        : 0;

    return apiSuccess({ trend, avg_allocation, year });
  } catch (err) {
    return apiError(err);
  }
}
