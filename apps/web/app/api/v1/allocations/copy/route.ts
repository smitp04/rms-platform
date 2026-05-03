import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { copyAllocations } from '@/lib/services/AllocationService';
import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;

    if (!can(actor_role, 'allocation:write:present_future')) {
      throw new ApiError(403, 'Forbidden');
    }

    const body = await req.json();
    const { employee_ids, source_sprint_ids, target_sprint_ids } = body;

    const results = await copyAllocations(
      employee_ids,
      source_sprint_ids,
      target_sprint_ids,
      {
        actor_id: session.user.id,
        actor_role,
        pod_id: session.user.pod_id,
        ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      }
    );

    return apiSuccess(results);
  } catch (err) {
    return apiError(err);
  }
}
