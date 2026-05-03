import { NextRequest } from 'next/server';
import { requireSession, apiSuccess, apiError } from '@/lib/utils/api';
import { getAllSprints, getSprintsByYear, getCurrentSprint, classifySprint } from '@/lib/services/SprintService';

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year');

    const sprints = year
      ? await getSprintsByYear(parseInt(year))
      : await getAllSprints();

    const now = new Date();
    const res = apiSuccess(
      sprints.map((s) => ({
        ...s,
        is_current: s.start_date <= now && s.end_date >= now,
        is_past: s.end_date < now,
        is_future: s.start_date > now,
      }))
    );
    res.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
    return res;
  } catch (err) {
    return apiError(err);
  }
}
