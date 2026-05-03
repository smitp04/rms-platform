import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { getGrowthConsultants } from '@/lib/services/ProjectService';

export async function GET() {
  try {
    await requireSession();
    const data = await getGrowthConsultants();
    return apiSuccess(data);
  } catch (err) {
    return apiError(err);
  }
}
