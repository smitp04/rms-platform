import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { createAllocation, updateAllocation } from '@/lib/services/AllocationService';
import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';

// Bulk upsert allocations (used by drag-drop)
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;

    if (!can(actor_role, 'allocation:write:present_future')) {
      throw new ApiError(403, 'Forbidden');
    }

    const body = await req.json();
    const { allocations } = body as {
      allocations: {
        id?: string;
        employee_id: string;
        project_id: string;
        sprint_id: string;
        allocation_percentage: number;
        notes?: string;
      }[];
    };

    const actor = {
      actor_id: session.user.id,
      actor_role,
      pod_id: session.user.pod_id,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      user_agent: req.headers.get('user-agent') ?? undefined,
    };

    const results = await Promise.allSettled(
      allocations.map((a) =>
        a.id
          ? updateAllocation(a.id, { allocation_percentage: a.allocation_percentage, notes: a.notes }, actor)
          : createAllocation(a, actor)
      )
    );

    return apiSuccess({
      succeeded: results.filter((r) => r.status === 'fulfilled').length,
      failed: results
        .map((r, i) =>
          r.status === 'rejected'
            ? { index: i, error: r.reason?.message ?? 'Unknown error' }
            : null
        )
        .filter(Boolean),
    });
  } catch (err) {
    return apiError(err);
  }
}
