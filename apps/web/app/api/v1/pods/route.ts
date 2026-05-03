import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';
import { createPod } from '@/lib/services/PodService';
import { writeAuditLog } from '@/lib/services/AuditService';
import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';

export async function GET(_req: NextRequest) {
  try {
    await requireSession();
    const pods = await prisma.pods.findMany({
      where: { deleted_at: null },
      include: {
        lead: { select: { id: true, name: true, avatar_url: true } },
        members: {
          select: { id: true, name: true, avatar_url: true },
          where: { deleted_at: null, status: 'ACTIVE' },
        },
      },
      orderBy: { name: 'asc' },
    });
    const res = apiSuccess(pods);
    res.headers.set('Cache-Control', 'private, no-cache');
    return res;
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!can(session.user.system_role as SystemRole, 'pod:write')) {
      throw new ApiError(403, 'Forbidden');
    }
    const body = await req.json();
    const pod = await createPod(body);
    await writeAuditLog({
      entity_type: 'pod',
      entity_id: pod.id,
      action: 'create',
      changed_by: session.user.id,
      new_value: pod as unknown as Record<string, unknown>,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      user_agent: req.headers.get('user-agent') ?? undefined,
    });
    return apiSuccess(pod, 201);
  } catch (err) {
    return apiError(err);
  }
}
