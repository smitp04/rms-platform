import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { getRedFlagProjects, getProjectPnL } from '@/lib/services/PnLService';
import { prisma } from '@/lib/prisma';
import type { SystemRole } from '@devx/types';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const actor_role = session.user.system_role as SystemRole;

    const project_id = searchParams.get('project_id');

    if (project_id) {
      const pnl = await getProjectPnL(project_id, actor_role);
      return apiSuccess(pnl);
    }

    // All projects PnL summary
    const snapshots = await prisma.rms_pnl_snapshots.findMany({
      include: {
        project: { include: { account: { select: { brand_name: true } } } },
        sprint: { select: { label: true, start_date: true } },
      },
      orderBy: { sprint: { start_date: 'asc' } },
    });

    return apiSuccess(
      snapshots.map((s) => ({
        ...s,
        revenue_cents: actor_role === 'ADMIN' ? s.revenue_cents : undefined,
        gross_margin_cents: actor_role === 'ADMIN' ? s.gross_margin_cents : undefined,
      }))
    );
  } catch (err) {
    return apiError(err);
  }
}
