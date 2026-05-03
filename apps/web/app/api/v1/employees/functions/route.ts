import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    await requireSession();
    const functions = await prisma.functions.findMany({
      orderBy: { name: 'asc' },
    });
    const res = apiSuccess(functions);
    res.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
    return res;
  } catch (err) {
    return apiError(err);
  }
}
