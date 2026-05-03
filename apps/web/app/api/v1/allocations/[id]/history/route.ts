import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { getAuditHistory } from '@/lib/services/AuditService';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const history = await getAuditHistory('allocation', id);
    return apiSuccess(history);
  } catch (err) {
    return apiError(err);
  }
}
