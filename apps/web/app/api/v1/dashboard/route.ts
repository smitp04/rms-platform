import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';
import { getCurrentSprint, getSprintById, getAllSprints, classifySprint } from '@/lib/services/SprintService';
import type { SystemRole } from '@devx/types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const AVAILABILITY_THRESHOLD = 80;
const EXCLUDED_FUNCTIONS = ['Growth', 'HR', 'Finance'];
const SPRINTS_PER_YEAR = 26;

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const actor_role = session.user.system_role as SystemRole;

    const now = new Date();
    const isAdmin = actor_role === 'ADMIN';
    const isPodLead = isAdmin || actor_role === 'POD_LEAD';
    const isManager = isPodLead || actor_role === 'CSM';
    const soon = new Date(now.getTime() + THIRTY_DAYS_MS);

    const sprintIdParam = req.nextUrl.searchParams.get('sprint_id');

    // ── Batch 1: Base data + functions (all in parallel) ──────────────────
    const [selectedSprint, redFlagCount, totalEmployees, billableEmployees, allSprints, allFunctions] =
      await Promise.all([
        sprintIdParam ? getSprintById(sprintIdParam) : getCurrentSprint(),
        prisma.rms_pnl_snapshots.groupBy({
          by: ['project_id'],
          where: { is_in_red: true },
        }),
        prisma.employees.count({ where: { status: 'ACTIVE', deleted_at: null } }),
        // Billable employees — excludes Growth, HR, Finance (not part of allocations)
        prisma.employees.count({
          where: {
            status: 'ACTIVE',
            deleted_at: null,
            function: { name: { notIn: EXCLUDED_FUNCTIONS } },
          },
        }),
        getAllSprints(),
        // Pre-fetch functions for headcount widget (all roles)
        prisma.functions.findMany({ select: { id: true, name: true } }),
      ]);

    // Compute sprint sets — include current sprint so the chart isn't empty
    const pastOrCurrentSprints = allSprints.filter((s) => s.start_date <= now);
    const last6Sprints = pastOrCurrentSprints.slice(-6);

    // ── Batch 2: All dependent queries in parallel ────────────────────────
    const last6SprintIds = last6Sprints.map((s) => s.id);

    const [
      allSprintAllocs,
      selectedSprintAllocs,
      headcountRaw,
      projectsEndingSoonRaw,
      topAllocationsRaw,
      activeProjectRevenues,
      activeProjectDetailsRaw,
    ] = await Promise.all([
      // Last 6 sprints for the trend chart
      last6SprintIds.length > 0
        ? prisma.rms_allocations.groupBy({
            by: ['sprint_id', 'employee_id'],
            where: { sprint_id: { in: last6SprintIds }, deleted_at: null },
            _sum: { allocation_percentage: true },
          })
        : Promise.resolve(
            [] as { sprint_id: string; employee_id: string; _sum: { allocation_percentage: number | null } }[]
          ),

      // 1 query replaces both selectedSprintAllocPromise AND selectedSprintAllocsForCost
      selectedSprint
        ? prisma.rms_allocations.findMany({
            where: { sprint_id: selectedSprint.id, deleted_at: null },
            select: {
              employee_id: true,
              allocation_percentage: true,
              employee: { select: { salary_ctc_cents: true } },
            },
          })
        : Promise.resolve(
            [] as { employee_id: string; allocation_percentage: number; employee: { salary_ctc_cents: number | null } }[]
          ),

      prisma.employees.groupBy({
            by: ['function_id'],
            where: { status: 'ACTIVE', deleted_at: null },
            _count: { id: true },
          }),

      isManager
        ? prisma.rms_projects.findMany({
            where: {
              status: { in: ['ACTIVE', 'UPCOMING'] },
              end_date: { gte: now, lte: soon },
              deleted_at: null,
            },
            select: {
              id: true,
              deal_name: true,
              status: true,
              end_date: true,
              account: { select: { brand_name: true } },
            },
            orderBy: { end_date: 'asc' },
            take: 5,
          })
        : Promise.resolve(
            [] as {
              id: string;
              deal_name: string;
              status: string;
              end_date: Date;
              account: { brand_name: string };
            }[]
          ),

      isPodLead && selectedSprint
        ? prisma.rms_allocations.groupBy({
            by: ['project_id'],
            where: { sprint_id: selectedSprint.id, deleted_at: null },
            _count: { employee_id: true },
            orderBy: { _count: { employee_id: 'desc' } },
            take: 5,
          })
        : Promise.resolve([] as { project_id: string; _count: { employee_id: number } }[]),

      isAdmin
        ? prisma.rms_projects.findMany({
            where: { status: 'ACTIVE', deleted_at: null },
            select: { revenue_cents: true },
          })
        : Promise.resolve([] as { revenue_cents: bigint | null }[]),

      // Pre-fetch project details for top projects (eliminates serial lookup)
      isPodLead && selectedSprint
        ? prisma.rms_projects.findMany({
            where: { status: { in: ['ACTIVE', 'UPCOMING'] }, deleted_at: null },
            select: {
              id: true,
              deal_name: true,
              status: true,
              account: { select: { brand_name: true } },
            },
          })
        : Promise.resolve(
            [] as { id: string; deal_name: string; status: string; account: { brand_name: string } }[]
          ),
    ]);

    // ── Compute trend from merged sprint allocs ───────────────────────────
    let totalAllocatedAll = 0;
    let sprintsWithData = 0;

    const trend = last6Sprints.map((sprint) => {
      const agg = allSprintAllocs.filter((a) => a.sprint_id === sprint.id);
      const totalAllocated = agg.reduce((s, a) => s + (a._sum.allocation_percentage ?? 0), 0);
      const totalPossible = billableEmployees * 100;
      const pct = totalPossible > 0 ? Math.round((totalAllocated / totalPossible) * 100) : 0;

      if (agg.length > 0) {
        totalAllocatedAll += totalAllocated;
        sprintsWithData++;
      }

      return { sprint_label: sprint.label, avg_allocation: pct };
    });

    const totalPossible = billableEmployees * 100 * (sprintsWithData || 1);
    const avgAllocation = totalPossible > 0
      ? Math.round((totalAllocatedAll / totalPossible) * 100)
      : 0;

    // ── Available employees from merged current sprint data ──────────────
    // Only count billable employees (exclude Growth/HR/Finance/OM)
    let availableCount = 0;
    if (selectedSprint) {
      const billableEmpIds = new Set(
        (await prisma.employees.findMany({
          where: { status: 'ACTIVE', deleted_at: null, function: { name: { notIn: EXCLUDED_FUNCTIONS } } },
          select: { id: true },
        })).map((e) => e.id)
      );
      const empAllocMap = new Map<string, number>();
      for (const a of selectedSprintAllocs) {
        if (!billableEmpIds.has(a.employee_id)) continue;
        empAllocMap.set(a.employee_id, (empAllocMap.get(a.employee_id) ?? 0) + a.allocation_percentage);
      }
      availableCount = Array.from(empAllocMap.values()).filter((pct) => pct < AVAILABILITY_THRESHOLD).length;
      availableCount += billableEmployees - empAllocMap.size;
    }

    // ── Process headcount (functions already pre-fetched in batch 1) ──────
    const functionMap = new Map(allFunctions.map((f) => [f.id, f.name]));
    const headcountByFunction = headcountRaw
      .map((h) => ({
        function_name: functionMap.get(h.function_id) ?? 'Unknown',
        count: h._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Process projects ending soon ──────────────────────────────────────
    const projectsEndingSoon = projectsEndingSoonRaw.map((p) => ({
      id: p.id,
      deal_name: p.deal_name,
      brand_name: p.account.brand_name,
      status: p.status,
      end_date: p.end_date!.toISOString(),
      days_until: Math.ceil(
        (new Date(p.end_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

    // ── Process top projects (from pre-fetched details, no serial query) ──
    const projectDetailsMap = new Map(activeProjectDetailsRaw.map((p) => [p.id, p]));
    let topProjects: {
      project_id: string;
      deal_name: string;
      brand_name: string;
      status: string;
      employee_count: number;
    }[] = [];

    if (topAllocationsRaw.length > 0) {
      topProjects = topAllocationsRaw.map((a) => {
        const proj = projectDetailsMap.get(a.project_id);
        return {
          project_id: a.project_id,
          deal_name: proj?.deal_name ?? '',
          brand_name: proj?.account.brand_name ?? '',
          status: proj?.status ?? '',
          employee_count: a._count.employee_id,
        };
      });
    }

    // ── PnL summary (admin only) ────────────────────────────────────────
    let pnlSummary:
      | { revenue_cents: number; cost_cents: number; margin_cents: number; margin_pct: number }
      | undefined;

    if (isAdmin && selectedSprint) {
      // Revenue: sum of (revenue_cents / 26) for all active projects (26 sprints per year)
      const totalRevenue = activeProjectRevenues.reduce(
        (sum, p) => sum + Math.round(Number(p.revenue_cents ?? 0) / SPRINTS_PER_YEAR),
        0
      );

      // Cost: sum of (salary / 26) × (alloc% / 100) for selected sprint allocations
      const sprintAllocs = selectedSprint
        ? await prisma.rms_allocations.findMany({
            where: { sprint_id: selectedSprint.id, deleted_at: null },
            select: {
              allocation_percentage: true,
              employee: { select: { salary_ctc_cents: true } },
            },
          })
        : [];
      const totalCost = sprintAllocs.reduce((sum, a) => {
        const salary = a.employee.salary_ctc_cents ?? 0;
        return sum + Math.round((salary / SPRINTS_PER_YEAR) * (a.allocation_percentage / 100));
      }, 0);

      const margin = totalRevenue - totalCost;
      pnlSummary = {
        revenue_cents: totalRevenue,
        cost_cents: totalCost,
        margin_cents: margin,
        margin_pct: totalRevenue > 0 ? Math.round((margin / totalRevenue) * 100) : 0,
      };
    } else if (isAdmin) {
      pnlSummary = { revenue_cents: 0, cost_cents: 0, margin_cents: 0, margin_pct: 0 };
    }

    // ── Sprint info + prev/next navigation ─────────────────────────────────
    const sprintIdx = selectedSprint
      ? allSprints.findIndex((s) => s.id === selectedSprint.id)
      : -1;
    const prevSprintId = sprintIdx > 0 ? allSprints[sprintIdx - 1]!.id : null;
    const nextSprintId = sprintIdx >= 0 && sprintIdx < allSprints.length - 1
      ? allSprints[sprintIdx + 1]!.id
      : null;

    const sprintStatus = selectedSprint ? classifySprint(selectedSprint) : null;

    const daysRemaining = (() => {
      if (!selectedSprint) return 0;
      if (sprintStatus === 'past') return 0;
      if (sprintStatus === 'future') {
        return Math.ceil(
          (selectedSprint.end_date.getTime() - selectedSprint.start_date.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
      return Math.max(
        0,
        Math.ceil(
          (selectedSprint.end_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
    })();

    const currentSprintInfo = selectedSprint
      ? {
          label: selectedSprint.label,
          sprint_number: selectedSprint.sprint_number,
          year: selectedSprint.year,
          start_date: selectedSprint.start_date.toISOString(),
          end_date: selectedSprint.end_date.toISOString(),
          days_remaining: daysRemaining,
          status: sprintStatus,
        }
      : null;

    const res = apiSuccess({
      kpis: {
        total_employees: totalEmployees,
        avg_allocation_pct: avgAllocation,
        available_employees: availableCount,
        projects_in_red: actor_role !== 'EMPLOYEE' ? redFlagCount.length : undefined,
      },
      allocation_trend: trend,
      current_sprint: currentSprintInfo,
      prev_sprint_id: prevSprintId,
      next_sprint_id: nextSprintId,
      all_sprints: allSprints.map((s) => ({ id: s.id, label: s.label })),
      pnl_summary: pnlSummary,
      headcount_by_function: headcountByFunction,
      projects_ending_soon: isManager ? projectsEndingSoon : undefined,
      top_projects: isPodLead ? topProjects : undefined,
    });
    return res;
  } catch (err) {
    return apiError(err);
  }
}
