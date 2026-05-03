import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireSession();
    const accounts = await prisma.accounts.findMany({
      select: { id: true, brand_name: true },
      orderBy: { brand_name: 'asc' },
    });
    return apiSuccess(accounts);
  } catch (err) {
    return apiError(err);
  }
}
