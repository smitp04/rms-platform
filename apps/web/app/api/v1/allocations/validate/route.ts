import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { validateTotalAllocation } from '@/lib/services/AllocationService';

// GET /api/v1/allocations/validate?employee_id=&sprint_id=&exclude=<allocationId>
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const employee_id = searchParams.get('employee_id');
    const sprint_id   = searchParams.get('sprint_id');
    const exclude     = searchParams.get('exclude') ?? undefined;

    if (!employee_id || !sprint_id) {
      throw new ApiError(400, 'employee_id and sprint_id are required');
    }

    const { current, available } = await validateTotalAllocation(employee_id, sprint_id, 0, exclude);

    return apiSuccess({
      employee_id,
      sprint_id,
      current_sprint_pct: current,
      available_pct: available,
    });
  } catch (err) {
    return apiError(err);
  }
}
