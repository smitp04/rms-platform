import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, requireSession } from '@/lib/utils/api';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const { id: sprint_id } = await params;
    const function_id = searchParams.get('function_id') ?? undefined;
    const min_available = parseInt(searchParams.get('min_available') ?? '0', 10);

    const sprint = await prisma.rms_sprints.findUniqueOrThrow({
      where: { id: sprint_id },
    });

    // All active employees (select only needed fields)
    const [employees, allocations] = await Promise.all([
      prisma.employees.findMany({
        where: {
          deleted_at: null,
          status: { notIn: ['TERMINATED', 'RESIGNED'] },
          function: { name: { notIn: ['Growth', 'HR', 'Finance'] } },
          ...(function_id ? { function_id } : {}),
        },
        select: {
          id: true,
          name: true,
          avatar_url: true,
          function: { select: { id: true, name: true } },
          role: { select: { name: true } },
          pod: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      // Run allocations query in parallel (sprint_id is already known)
      prisma.rms_allocations.findMany({
        where: {
          sprint_id,
          deleted_at: null,
          ...(function_id ? { employee: { function_id } } : {}),
        },
        select: {
          id: true,
          employee_id: true,
          allocation_percentage: true,
          is_bench: true,
          project_id: true,
          project: {
            select: {
              deal_name: true,
              account: { select: { brand_name: true } },
            },
          },
        },
      }),
    ]);

    // Build per-employee bandwidth
    const rows = employees
      .map((emp) => {
        const empAllocs = allocations.filter((a) => a.employee_id === emp.id);
        const allocated_pct = empAllocs.reduce((sum, a) => sum + a.allocation_percentage, 0);
        const available_pct = Math.max(0, 100 - allocated_pct);
        return {
          id: emp.id,
          name: emp.name,
          avatar_url: emp.avatar_url,
          function: emp.function?.name ?? null,
          role: emp.role?.name ?? null,
          pod: emp.pod?.name ?? null,
          pod_id: emp.pod?.id ?? null,
          allocated_pct,
          available_pct,
          allocations: empAllocs.map((a) => ({
            allocation_id: a.id,
            project_id: a.project_id,
            brand_name: a.project.account.brand_name,
            deal_name: a.project.deal_name,
            allocation_percentage: a.allocation_percentage,
            is_bench: a.is_bench,
          })),
        };
      })
      .filter((r) => r.available_pct >= min_available);

    const body = JSON.stringify({ data: { sprint, rows } });
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return apiError(err);
  }
}
