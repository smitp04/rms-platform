import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess, requireSession } from '@/lib/utils/api';

export async function GET() {
  try {
    await requireSession();
    const platforms = await prisma.platforms.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return apiSuccess(platforms);
  } catch (err) {
    return apiError(err);
  }
}
