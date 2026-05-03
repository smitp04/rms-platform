import { requirePermission, apiSuccess, apiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';

/** Extract all values for a given key from old_value / new_value across logs */
function collectIds(
  logs: { old_value: unknown; new_value: unknown }[],
  key: string
): string[] {
  const ids = new Set<string>();
  for (const log of logs) {
    for (const snap of [log.old_value, log.new_value]) {
      const val = (snap as Record<string, unknown> | null)?.[key];
      if (typeof val === 'string' && val.length > 0) ids.add(val);
    }
  }
  return [...ids];
}

/** Inject a companion display field next to each ID field in a snapshot */
function enrichSnapshot(
  snap: Record<string, unknown> | null,
  lookups: Record<string, Record<string, string>>
): Record<string, unknown> | null {
  if (!snap) return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snap)) {
    result[key] = value;
    if (typeof value === 'string' && lookups[key]?.[value]) {
      // Insert a human-readable companion right after the ID field
      const nameKey = key.replace(/_id$/, '_name').replace(/^(created|updated)_by$/, '$1_by_name');
      result[nameKey] = lookups[key][value];
    }
  }
  return result;
}

// GET /api/v1/admin/audit-logs — last 200 entries, enriched with actor name
export async function GET() {
  try {
    await requirePermission('audit:read');

    const logs = await prisma.audit_logs.findMany({
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    // ── Collect all referenced IDs from snapshots ──────────────
    const employeeIds = collectIds(logs, 'employee_id');
    const projectIds = collectIds(logs, 'project_id');
    const sprintIds = collectIds(logs, 'sprint_id');
    const accountIds = collectIds(logs, 'account_id');
    const createdByIds = collectIds(logs, 'created_by');
    const updatedByIds = collectIds(logs, 'updated_by');
    const growthIds = collectIds(logs, 'growth_consultant_id');

    // Merge all person IDs for a single employee lookup
    const allPersonIds = [...new Set([
      ...logs.map((l) => l.changed_by),
      ...employeeIds,
      ...createdByIds,
      ...updatedByIds,
      ...growthIds,
    ])];

    // ── Batch fetch all referenced entities ────────────────────
    const [employees, projects, sprints, accounts] = await Promise.all([
      prisma.employees.findMany({
        where: { id: { in: allPersonIds } },
        select: { id: true, name: true, system_role: true },
      }),
      projectIds.length > 0
        ? prisma.rms_projects.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, deal_name: true },
          })
        : [],
      sprintIds.length > 0
        ? prisma.rms_sprints.findMany({
            where: { id: { in: sprintIds } },
            select: { id: true, label: true },
          })
        : [],
      accountIds.length > 0
        ? prisma.accounts.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, brand_name: true },
          })
        : [],
    ]);

    const empMap = Object.fromEntries(employees.map((e) => [e.id, e.name]));
    const projMap = Object.fromEntries(projects.map((p) => [p.id, p.deal_name]));
    const sprintMap = Object.fromEntries(sprints.map((s) => [s.id, s.label]));
    const acctMap = Object.fromEntries(accounts.map((a) => [a.id, a.brand_name]));

    // Lookup table: snapshot field → id → display name
    const lookups: Record<string, Record<string, string>> = {
      employee_id: empMap,
      project_id: projMap,
      sprint_id: sprintMap,
      account_id: acctMap,
      created_by: empMap,
      updated_by: empMap,
      growth_consultant_id: empMap,
    };

    const actorMap = Object.fromEntries(
      employees.map((a) => [a.id, { name: a.name, role: a.system_role }])
    );

    const enriched = logs.map((log) => ({
      ...log,
      old_value: enrichSnapshot(log.old_value as Record<string, unknown> | null, lookups),
      new_value: enrichSnapshot(log.new_value as Record<string, unknown> | null, lookups),
      actor_name: actorMap[log.changed_by]?.name ?? 'Unknown',
      actor_role: actorMap[log.changed_by]?.role ?? 'EMPLOYEE',
    }));

    return apiSuccess(enriched);
  } catch (err) {
    return apiError(err);
  }
}
