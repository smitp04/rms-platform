import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { getProjects } from '@/lib/services/ProjectService';
import type { SystemRole } from '@devx/types';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('page_size');

    const result = await getProjects(
      session.user.system_role as SystemRole,
      session.user.id,
      {
        status: searchParams.get('status') ?? undefined,
        devx_pillar: searchParams.get('devx_pillar') ?? undefined,
        account_id: searchParams.get('account_id') ?? undefined,
        search: searchParams.get('search') ?? undefined,
        project_manager_id: searchParams.get('project_manager_id') ?? undefined,
        growth_consultant_id: searchParams.get('growth_consultant_id') ?? undefined,
        page: pageParam ? parseInt(pageParam, 10) : undefined,
        page_size: pageSizeParam ? parseInt(pageSizeParam, 10) : undefined,
        include_hidden: searchParams.get('include_hidden') === 'true' && session.user.system_role === 'ADMIN',
      }
    );

    const res = apiSuccess(result);
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=30');
    return res;
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/v1/projects — manually create a project (Admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;
    if (actor_role !== 'ADMIN') throw new ApiError(403, 'Forbidden');

    const body = await req.json();
    const { createProject } = await import('@/lib/services/ProjectService');
    const { writeAuditLog } = await import('@/lib/services/AuditService');
    const project = await createProject(body);

    await writeAuditLog({
      entity_type: 'project',
      entity_id: project.id,
      action: 'create',
      changed_by: session.user.id,
      old_value: null,
      new_value: project as unknown as Record<string, unknown>,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      user_agent: req.headers.get('user-agent') ?? undefined,
    });

    return apiSuccess(project);
  } catch (err) {
    return apiError(err);
  }
}
