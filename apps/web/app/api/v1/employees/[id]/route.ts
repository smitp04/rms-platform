import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';
import type { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/services/AuditService';
import { deactivateEmployee, getEmployeeById, updateEmployee } from '@/lib/services/EmployeeService';
import { ApiError, apiError, apiSuccess, requireSession } from '@/lib/utils/api';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const actor_role = session.user.system_role as SystemRole;

    // Employees can only view themselves
    if (actor_role === 'EMPLOYEE' && id !== session.user.id) {
      throw new ApiError(403, 'Forbidden');
    }

    const employee = await getEmployeeById(id);
    if (!employee) throw new ApiError(404, 'Employee not found');

    return apiSuccess({
      ...employee,
      salary_ctc_cents: actor_role === 'ADMIN' ? employee.salary_ctc_cents : undefined,
    });
  } catch (err) {
    return apiError(err);
  }
}

// Fields a user can edit on their OWN record without the employee:write permission.
const SELF_EDITABLE_FIELDS = ['name', 'platform_ids', 'skill_ids'] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    const actor_role = session.user.system_role as SystemRole;
    const hasWritePerm = can(actor_role, 'employee:write');
    const isSelf = id === session.user.id;

    if (!hasWritePerm) {
      if (!isSelf) throw new ApiError(403, 'Forbidden');
      // Strip body to only allow self-editable fields
      const allowed = Object.fromEntries(
        Object.entries(body).filter(([k]) => (SELF_EDITABLE_FIELDS as readonly string[]).includes(k)),
      );
      if (Object.keys(allowed).length === 0) {
        throw new ApiError(400, 'No editable fields provided');
      }
      const { before, after } = await updateEmployee(id, allowed);
      await writeAuditLog({
        entity_type: 'employee',
        entity_id: id,
        action: 'update',
        changed_by: session.user.id,
        old_value: before as unknown as Record<string, unknown>,
        new_value: after as unknown as Record<string, unknown>,
        ip_address: req.headers.get('x-forwarded-for') ?? undefined,
        user_agent: req.headers.get('user-agent') ?? undefined,
      });
      return apiSuccess(after);
    }

    const { before, after } = await updateEmployee(id, body);
    await writeAuditLog({
      entity_type: 'employee',
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (!can(session.user.system_role as SystemRole, 'employee:write')) {
      throw new ApiError(403, 'Forbidden');
    }
    const { id } = await params;
    const { before, after } = await deactivateEmployee(id);
    await writeAuditLog({
      entity_type: 'employee',
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
