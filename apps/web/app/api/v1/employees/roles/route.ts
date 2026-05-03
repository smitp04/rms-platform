import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const functionId = req.nextUrl.searchParams.get('function_id');
    const HIDDEN_ROLES = ['Engagement Manager', 'Partner', 'CEO'];
    const roles = await prisma.roles.findMany({
      where: {
        ...(functionId ? { function_id: functionId } : {}),
        name: { notIn: HIDDEN_ROLES },
      },
      select: { id: true, name: true, function_id: true },
      orderBy: { name: 'asc' },
    });
    const res = apiSuccess(roles);
    res.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
    return res;
  } catch (err) {
    return apiError(err);
  }
}
