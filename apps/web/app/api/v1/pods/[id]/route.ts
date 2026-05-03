import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { updatePod, deletePod } from '@/lib/services/PodService';
import { writeAuditLog } from '@/lib/services/AuditService';
import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!can(session.user.system_role as SystemRole, 'pod:write')) {
      throw new ApiError(403, 'Forbidden');
    }
    const { id } = await params;
    const body = await req.json();
    const { before, after } = await updatePod(id, body);
    await writeAuditLog({
      entity_type: 'pod',
      entity_id: id,
      action: 'update',
      changed_by: session.user.id,
      old_value: before as unknown as Record<string, unknown>,
      new_value: after as unknown as Record<string, unknown>,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      user_agent: req.headers.get('user-agent') ?? undefined,
    });
    return apiSuccess(after);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!can(session.user.system_role as SystemRole, 'pod:write')) {
      throw new ApiError(403, 'Forbidden');
    }
    const { id } = await params;
    const { before, after } = await deletePod(id);
    await writeAuditLog({
      entity_type: 'pod',
      entity_id: id,
      action: 'delete',
      changed_by: session.user.id,
      old_value: before as unknown as Record<string, unknown>,
      new_value: after as unknown as Record<string, unknown>,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      user_agent: req.headers.get('user-agent') ?? undefined,
    });
    return apiSuccess(after);
  } catch (err) {
    return apiError(err);
  }
}
