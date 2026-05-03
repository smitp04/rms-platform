import { can } from '@devx/auth';
import type { SystemRole } from '@devx/types';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { classifySprint } from '@/lib/services/SprintService';
import { ApiError, apiError, apiSuccess, requireSession } from '@/lib/utils/api';

// GET /api/v1/projects/:id  — full project detail with sprint allocation history
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const actor_role = session.user.system_role as SystemRole;

    const project = await prisma.rms_projects.findUnique({
      where: { id, deleted_at: null },
      include: {
        account: true,
        project_manager: { select: { id: true, name: true, email: true } },
        growth_consultant: { select: { id: true, name: true, email: true } },
        practice_poc: { select: { id: true, name: true, email: true } },
        technologies: { include: { technology: true } },
      },
    });

    if (!project) throw new ApiError(404, 'Project not found');

    // Get all years that have allocations for this project
    const allAllocations = await prisma.rms_allocations.findMany({
      where: { project_id: id, deleted_at: null },
      include: {
        sprint: true,
        employee: {
          select: {
            id: true,
            name: true,
            avatar_url: true,
            function: { select: { name: true } },
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { sprint: { sprint_number: 'asc' } },
    });

    // Group by sprint
    const sprintMap = new Map<
      string,
      {
        sprint_id: string;
        sprint_number: number;
        label: string;
        start_date: Date;
        end_date: Date;
        is_past: boolean;
        is_current: boolean;
        year: number;
        employees: {
          allocation_id: string;
          employee_id: string;
          name: string;
          function_name: string;
          role_name: string;
          allocation_percentage: number;
        }[];
        total_pct: number;
      }
    >();

    for (const alloc of allAllocations) {
      const s = alloc.sprint;
      if (!sprintMap.has(s.id)) {
        const kind = classifySprint(s);
        sprintMap.set(s.id, {
          sprint_id: s.id,
          sprint_number: s.sprint_number,
          label: s.label,
          start_date: s.start_date,
          end_date: s.end_date,
          is_past: kind === 'past',
          is_current: kind === 'current',
          year: s.year,
          employees: [],
          total_pct: 0,
        });
      }
      const entry = sprintMap.get(s.id)!;
      entry.employees.push({
        allocation_id: alloc.id,
        employee_id: alloc.employee.id,
        name: alloc.employee.name,
        function_name: alloc.employee.function?.name ?? '',
        role_name: alloc.employee.role?.name ?? '',
        allocation_percentage: alloc.allocation_percentage,
      });
      entry.total_pct += alloc.allocation_percentage;
    }

    const sprint_history = [...sprintMap.values()].sort(
      (a, b) => a.year * 100 + a.sprint_number - (b.year * 100 + b.sprint_number),
    );

    // Unique team members ever on this project
    const teamSet = new Map<string, { id: string; name: string; role_name: string; function_name: string }>();
    for (const alloc of allAllocations) {
      if (!teamSet.has(alloc.employee.id)) {
        teamSet.set(alloc.employee.id, {
          id: alloc.employee.id,
          name: alloc.employee.name,
          role_name: alloc.employee.role?.name ?? '',
          function_name: alloc.employee.function?.name ?? '',
        });
      }
    }

    return apiSuccess({
      project: {
        ...project,
        revenue_cents: actor_role === 'ADMIN' ? project.revenue_cents : undefined,
      },
      sprint_history,
      team: [...teamSet.values()],
    });
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/v1/projects/:id — update editable fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;
    const { id } = await params;
    const body = await req.json();

    // CSMs can update status, deal_name, and the Drive link (sow_url) on their own projects
    const CSM_ALLOWED_FIELDS = ['status', 'deal_name', 'sow_url'];
    if (can(actor_role, 'project:write')) {
      // Admin — full update, no restrictions
    } else if (can(actor_role, 'project:write:status')) {
      // CSM — verify ownership and restrict to allowed fields
      const project = await prisma.rms_projects.findUnique({
        where: { id, deleted_at: null },
        select: { project_manager_id: true },
      });
      if (!project) throw new ApiError(404, 'Project not found');
      if (project.project_manager_id !== session.user.id) {
        throw new ApiError(403, 'You can only edit your own projects');
      }
      if (Object.keys(body).some((k) => !CSM_ALLOWED_FIELDS.includes(k))) {
        throw new ApiError(403, `You can only update: ${CSM_ALLOWED_FIELDS.join(', ')}`);
      }
    } else {
      throw new ApiError(403, 'Forbidden');
    }

    const { updateProject } = await import('@/lib/services/ProjectService');
    const { writeAuditLog } = await import('@/lib/services/AuditService');
    const { before, after } = await updateProject(id, body);
    await writeAuditLog({
      entity_type: 'project',
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

// DELETE /api/v1/projects/:id — soft delete (Admin only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;
    if (actor_role !== 'ADMIN') throw new ApiError(403, 'Forbidden');
    const { id } = await params;
    const { deleteProject } = await import('@/lib/services/ProjectService');
    const { writeAuditLog } = await import('@/lib/services/AuditService');
    const { before, after } = await deleteProject(id);
    await writeAuditLog({
      entity_type: 'project',
      entity_id: id,
      action: 'delete',
      changed_by: session.user.id,
      old_value: before as unknown as Record<string, unknown>,
      new_value: null,
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
      user_agent: req.headers.get('user-agent') ?? undefined,
    });
    return apiSuccess(after);
  } catch (err) {
    return apiError(err);
  }
}
