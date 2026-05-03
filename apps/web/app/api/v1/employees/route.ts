import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';
import type { NextRequest } from 'next/server';
import { writeAuditLog } from '@/lib/services/AuditService';
import { createFromGoogleAdmin, createManualEmployee, getEmployees } from '@/lib/services/EmployeeService';
import { ApiError, apiError, apiSuccess, requireSession } from '@/lib/utils/api';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('page_size');

    const result = await getEmployees({
      function_id: searchParams.get('function_id') ?? undefined,
      role_id: searchParams.get('role_id') ?? undefined,
      pod_id: searchParams.get('pod_id') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      platform_id: searchParams.get('platform_id') ?? undefined,
      is_pm: searchParams.get('is_pm') === 'true' ? true : undefined,
      sprint_id: searchParams.get('sprint_id') ?? undefined,
      system_roles: searchParams.get('system_roles')?.split(',').filter(Boolean) ?? undefined,
      page: pageParam ? parseInt(pageParam, 10) : undefined,
      page_size: pageSizeParam ? parseInt(pageSizeParam, 10) : undefined,
      available_only: searchParams.get('available_only') === 'true' ? true : undefined,
      min_available: searchParams.get('min_available') ? parseInt(searchParams.get('min_available')!, 10) : undefined,
      sort_by_allocation: (searchParams.get('sort_by_allocation') as 'asc' | 'desc') || undefined,
      exclude_functions: searchParams.get('exclude_functions')?.split(',').filter(Boolean) ?? undefined,
      function_names: searchParams.get('function_names')?.split(',').filter(Boolean) ?? undefined,
    });

    // Remove salary from non-admin responses
    const actor_role = session.user.system_role as SystemRole;
    const isPaginated = pageParam != null;
    const employees = isPaginated ? (result as { data: unknown[] }).data : result;
    const sanitized = (employees as Array<Record<string, unknown>>).map((e: Record<string, unknown>) => {
      const { led_pod, ...rest } = e;
      return {
        ...rest,
        salary_ctc_cents: actor_role === 'ADMIN' ? e.salary_ctc_cents : undefined,
        is_pod_lead: !!(led_pod as { id?: string } | null)?.id,
        led_pod_name: (led_pod as { name?: string } | null)?.name ?? null,
      };
    });

    const res = isPaginated
      ? apiSuccess({
          data: sanitized,
          total: (result as { total: number }).total,
          page: (result as { page: number }).page,
          page_size: (result as { page_size: number }).page_size,
        })
      : apiSuccess(sanitized);
    res.headers.set('Cache-Control', 'private, no-cache');
    return res;
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!can(session.user.system_role as SystemRole, 'employee:write')) {
      throw new ApiError(403, 'Forbidden');
    }
    const body = await req.json();

    if (body.source === 'manual') {
      const employee = await createManualEmployee(body);
      await writeAuditLog({
        entity_type: 'employee',
        entity_id: employee.id,
        action: 'create',
        changed_by: session.user.id,
        new_value: employee as unknown as object,
      });
      return apiSuccess(employee, 201);
    }

    const employee = await createFromGoogleAdmin(body);
    return apiSuccess(employee, 201);
  } catch (err) {
    return apiError(err);
  }
}
