import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess, requireSession } from '@/lib/utils/api';

export async function GET() {
  try {
    await requireSession();
    const skills = await prisma.skills.findMany({
      select: { id: true, name: true, platform_id: true },
      orderBy: { name: 'asc' },
    });
    return apiSuccess(skills);
  } catch (err) {
    return apiError(err);
  }
}
