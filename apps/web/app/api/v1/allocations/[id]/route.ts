import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deleteAllocation, updateAllocation } from '@/lib/services/AllocationService';
import { ApiError, apiError, apiSuccess, requireSession } from '@/lib/utils/api';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const allocation = await prisma.rms_allocations.findUnique({
      where: { id },
      select: {
        id: true,
        allocation_percentage: true,
        notes: true,
        is_bench: true,
        employee_id: true,
        project_id: true,
        sprint_id: true,
      },
    });
    if (!allocation) throw new ApiError(404, 'Allocation not found');
    return apiSuccess(allocation);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;
    if (!can(actor_role, 'allocation:write:present_future')) throw new ApiError(403, 'Forbidden');

    const { id } = await params;
    const body = await req.json();

    const updated = await updateAllocation(id, body, {
      actor_id: session.user.id,
      actor_role,
      pod_id: session.user.pod_id,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      user_agent: req.headers.get('user-agent') ?? undefined,
    });

    return apiSuccess(updated);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;
    if (!can(actor_role, 'allocation:write:present_future')) throw new ApiError(403, 'Forbidden');

    const { id } = await params;
    const deleted = await deleteAllocation(id, {
      actor_id: session.user.id,
      actor_role,
      pod_id: session.user.pod_id,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
    });

    return apiSuccess(deleted);
  } catch (err) {
    return apiError(err);
  }
}
