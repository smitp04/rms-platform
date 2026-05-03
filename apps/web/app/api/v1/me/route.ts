import { getEmployeeById } from '@/lib/services/EmployeeService';
import { ApiError, apiError, apiSuccess, requireSession } from '@/lib/utils/api';

export async function GET() {
  try {
    const session = await requireSession();
    const employee = await getEmployeeById(session.user.id);
    if (!employee) throw new ApiError(404, 'Employee not found');
    return apiSuccess({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      avatar_url: employee.avatar_url,
      platforms: employee.platforms.map((p) => ({ id: p.platform.id, name: p.platform.name })),
      skills: employee.skills.map((s) => ({ id: s.skill.id, name: s.skill.name })),
    });
  } catch (err) {
    return apiError(err);
  }
}
