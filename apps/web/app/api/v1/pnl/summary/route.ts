import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';

const SPRINTS_PER_YEAR = 26;

export async function GET(_req: NextRequest) {
  try {
    const session = await requireSession();
    const isAdmin = session.user.system_role === 'ADMIN';

    // Only load projects that have allocations and aren't cancelled
    const projects = await prisma.rms_projects.findMany({
      where: {
        deleted_at: null,
        status: { not: 'CANCELLED' as const },
        allocations: { some: { deleted_at: null } },
      },
      select: {
        id: true,
        deal_name: true,
        status: true,
        revenue_cents: true,
        start_date: true,
        account: { select: { brand_name: true } },
        project_manager: { select: { name: true } },
        allocations: {
          where: { deleted_at: null },
          select: {
            employee_id: true,
            allocation_percentage: true,
            sprint_id: true,
            employee: {
              select: { id: true, name: true, salary_ctc_cents: true, role: { select: { name: true } } },
            },
            sprint: { select: { id: true, sprint_number: true, year: true } },
          },
        },
      },
      orderBy: { start_date: 'asc' },
    });

    const result = projects.map((project) => {
      // Group allocations by employee
      const employeeMap = new Map<
        string,
        {
          employee_id: string;
          name: string;
          role_name: string;
          salary_ctc_cents: number;
          sprints: { sprint_id: string; sprint_label: string; allocation_pct: number }[];
        }
      >();

      for (const alloc of project.allocations) {
        const empId = alloc.employee_id;
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employee_id: empId,
            name: alloc.employee.name,
            role_name: alloc.employee.role?.name ?? '',
            salary_ctc_cents: alloc.employee.salary_ctc_cents ?? 0,
            sprints: [],
          });
        }
        employeeMap.get(empId)!.sprints.push({
          sprint_id: alloc.sprint_id,
          sprint_label: `S${alloc.sprint.sprint_number}-${alloc.sprint.year}`,
          allocation_pct: alloc.allocation_percentage,
        });
      }

      // Compute cost per employee (all in INR cents)
      let total_employee_cost_cents = 0;

      const employee_breakdown = Array.from(employeeMap.values()).map((emp) => {
        const per_sprint_base = emp.salary_ctc_cents / SPRINTS_PER_YEAR;
        const emp_cost_cents = emp.sprints.reduce((sum, s) => {
          return sum + Math.round((per_sprint_base * s.allocation_pct) / 100);
        }, 0);
        total_employee_cost_cents += emp_cost_cents;

        const num_sprints = emp.sprints.length;
        const avg_pct =
          num_sprints > 0
            ? Math.round(emp.sprints.reduce((s, a) => s + a.allocation_pct, 0) / num_sprints)
            : 0;

        const sorted_sprints = emp.sprints
          .slice()
          .sort((a, b) => {
            const parse = (l: string) => {
              const m = l.match(/^S(\d+)-(\d+)$/);
              return m ? parseInt(m[2]) * 100 + parseInt(m[1]) : 0;
            };
            return parse(a.sprint_label) - parse(b.sprint_label);
          });

        return {
          employee_id: emp.employee_id,
          name: emp.name,
          role_name: emp.role_name,
          num_sprints,
          avg_allocation_pct: avg_pct,
          cost_cents: emp_cost_cents,
          sprints: sorted_sprints,
        };
      });

      // Revenue: (deal amount / 12 months) × months active
      // 2 sprints ≈ 1 month
      const uniqueSprintIds = new Set(project.allocations.map((a) => a.sprint_id));
      const sprint_count = uniqueSprintIds.size;
      const deal_amount_cents = Number(project.revenue_cents ?? 0);
      const monthly_revenue = Math.round(deal_amount_cents / 12);
      const months_active = sprint_count / 2;
      const total_revenue_cents = Math.round(monthly_revenue * months_active);

      const gross_margin_cents = total_revenue_cents - total_employee_cost_cents;
      const margin_pct = total_revenue_cents > 0 ? Math.round((gross_margin_cents / total_revenue_cents) * 100) : 0;
      const is_in_red = total_employee_cost_cents > total_revenue_cents;

      return {
        project_id: project.id,
        brand_name: project.account.brand_name,
        deal_name: project.deal_name,
        status: project.status,
        project_manager: project.project_manager?.name ?? null,
        sprint_count,
        // All amounts in INR cents — client converts to display currency
        deal_amount_cents: isAdmin ? deal_amount_cents : undefined,
        total_revenue_cents: isAdmin ? total_revenue_cents : undefined,
        total_employee_cost_cents,
        gross_margin_cents: isAdmin ? gross_margin_cents : undefined,
        margin_pct: isAdmin ? margin_pct : undefined,
        is_in_red: isAdmin ? is_in_red : undefined,
        employee_breakdown,
      };
    });

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
