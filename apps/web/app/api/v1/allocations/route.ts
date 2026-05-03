import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { createAllocation } from '@/lib/services/AllocationService';
import { prisma } from '@/lib/prisma';
import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const sprint_id = searchParams.get('sprint_id') ?? undefined;
    const employee_id = searchParams.get('employee_id') ?? undefined;
    const project_id = searchParams.get('project_id') ?? undefined;

    const actor_role = session.user.system_role as SystemRole;
    const where: Record<string, unknown> = { deleted_at: null };

    if (sprint_id) where.sprint_id = sprint_id;
    if (project_id) where.project_id = project_id;

    // Scope by role
    if (actor_role === 'EMPLOYEE') {
      where.employee_id = session.user.id;
    } else if (actor_role === 'POD_LEAD') {
      // Only members of pods this actor leads
      const ledPods = await prisma.pods.findMany({
        where: { lead_id: session.user.id, deleted_at: null },
        select: { id: true },
      });
      const podMembers = await prisma.employees.findMany({
        where: { pod_id: { in: ledPods.map((p) => p.id) } },
        select: { id: true },
      });
      where.employee_id = { in: podMembers.map((e) => e.id) };
    } else if (employee_id) {
      where.employee_id = employee_id;
    }

    const allocations = await prisma.rms_allocations.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true } },
        project: { include: { account: { select: { brand_name: true } } } },
        sprint: { select: { id: true, label: true, start_date: true, end_date: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return apiSuccess(allocations);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;

    if (!can(actor_role, 'allocation:write:present_future')) {
      throw new ApiError(403, 'Forbidden');
    }

    const body = await req.json();
    const allocation = await createAllocation(body, {
      actor_id: session.user.id,
      actor_role,
      pod_id: session.user.pod_id,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      user_agent: req.headers.get('user-agent') ?? undefined,
    });

    return apiSuccess(allocation, 201);
  } catch (err) {
    return apiError(err);
  }
}
