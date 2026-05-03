import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { getGanttData } from '@/lib/services/AllocationService';
import type { SystemRole } from '@devx/types';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));
    const pod_id = searchParams.get('pod_id') ?? undefined;
    const function_id = searchParams.get('function_id') ?? undefined;

    const data = await getGanttData(year, {
      pod_id,
      function_id,
      actor_role: session.user.system_role as SystemRole,
      actor_id: session.user.id,
    });

    return apiSuccess(data);
  } catch (err) {
    return apiError(err);
  }
}
