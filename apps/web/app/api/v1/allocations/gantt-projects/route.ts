import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  classifySprint,
  ensureSprintsForYear,
  getCurrentSprint,
  getSprintsForQuarter,
  isLastMonthOfQuarter,
} from '@/lib/services/SprintService';
import { apiError, requireSession } from '@/lib/utils/api';

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10);
    const quarterParam = searchParams.get('quarter');
    const quarter = quarterParam ? parseInt(quarterParam, 10) : null;
    const statusParam = searchParams.get('status');
    const statuses = (
      statusParam ? statusParam.split(',') : ['ACTIVE', 'UPCOMING']
    ) as import('@devx/db').ProjectStatus[];

    // Auto-generate sprints for the requested year if missing
    await ensureSprintsForYear(year);

    // Pre-generate next year's sprints starting October
    const now = new Date();
    if (now.getMonth() >= 9) {
      await ensureSprintsForYear(now.getFullYear() + 1);
    }

    // Look-ahead: include next quarter when current sprint sits in the last month of its quarter
    let includeNext = false;
    if (quarter !== null) {
      const current = await getCurrentSprint();
      includeNext = !!current && isLastMonthOfQuarter(new Date(current.start_date));
      if (includeNext && quarter === 4) await ensureSprintsForYear(year + 1);
      if (quarter === 1) await ensureSprintsForYear(year - 1);
    }

    // 1A: Parallelize independent queries (sprints + projects have no dependency)
    const [sprints, projects] = await Promise.all([
      quarter !== null && quarter >= 1 && quarter <= 4
        ? getSprintsForQuarter(year, quarter, includeNext)
        : prisma.rms_sprints.findMany({
            where: { year },
            orderBy: { sprint_number: 'asc' },
          }),
      prisma.rms_projects.findMany({
        where: { deleted_at: null, status: { in: statuses }, show_in_allocations: true },
        include: {
          account: { select: { brand_name: true } },
          project_manager: { select: { id: true, name: true } },
          growth_consultant: { select: { id: true, name: true } },
        },
        orderBy: { deal_name: 'asc' },
      }),
    ]);

    const sprintIds = sprints.map((s) => s.id);
    const projectIds = projects.map((p) => p.id);

    // All allocations for these projects × sprints
    const allocations = await prisma.rms_allocations.findMany({
      where: {
        project_id: { in: projectIds },
        sprint_id: { in: sprintIds },
        deleted_at: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            avatar_url: true,
            role: { select: { name: true } },
          },
        },
      },
    });

    // Index allocations by project_id + sprint_id for fast lookup
    const allocByProjSprint = new Map<string, typeof allocations>();
    for (const a of allocations) {
      const key = `${a.project_id}::${a.sprint_id}`;
      if (!allocByProjSprint.has(key)) allocByProjSprint.set(key, []);
      allocByProjSprint.get(key)!.push(a);
    }

    // 1C: Sprint metadata with is_past / is_current flags
    const sprintMeta = sprints.map((s) => {
      const sprintType = classifySprint(s);
      return {
        sprint_id: s.id,
        sprint_number: s.sprint_number,
        label: s.label,
        start_date: s.start_date,
        end_date: s.end_date,
        is_past: sprintType === 'past',
        is_current: sprintType === 'current',
      };
    });

    // 1C: Sparse rows — only include sprints that have allocations
    const rows = projects.map((project) => {
      const startLabel = project.start_date
        ? new Date(project.start_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
        : null;
      const endLabel = project.end_date
        ? new Date(project.end_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
        : 'Ongoing';

      // Only emit sprint entries that have allocations
      const sprintEntries: {
        sprint_id: string;
        employees: {
          allocation_id: string;
          employee_id: string;
          name: string;
          avatar_url: string | null;
          role: string;
          allocation_percentage: number;
          is_bench: boolean;
        }[];
      }[] = [];

      for (const sprint of sprints) {
        const sprintAllocs = allocByProjSprint.get(`${project.id}::${sprint.id}`);
        if (!sprintAllocs || sprintAllocs.length === 0) continue;

        sprintEntries.push({
          sprint_id: sprint.id,
          employees: sprintAllocs.map((a) => ({
            allocation_id: a.id,
            employee_id: a.employee.id,
            name: a.employee.name,
            avatar_url: a.employee.avatar_url,
            role: a.employee.role.name,
            allocation_percentage: a.allocation_percentage,
            is_bench: a.is_bench,
          })),
        });
      }

      return {
        project: {
          id: project.id,
          deal_name: project.deal_name,
          zoho_deal_id: project.zoho_deal_id,
          brand_name: project.account.brand_name,
          status: project.status,
          billing_model: project.billing_model,
          devx_pillar: project.devx_pillar,
          date_range: startLabel ? `${startLabel} – ${endLabel}` : null,
          project_manager: project.project_manager?.name ?? null,
          project_manager_id: project.project_manager?.id ?? null,
          growth_consultant: project.growth_consultant?.name ?? null,
          start_date: project.start_date,
          end_date: project.end_date,
        },
        sprints: sprintEntries,
      };
    });

    const body = JSON.stringify({ data: { rows, sprints: sprintMeta } });
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return apiError(err);
  }
}
