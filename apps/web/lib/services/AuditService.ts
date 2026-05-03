import { prisma } from '@/lib/prisma';

interface AuditParams {
  entity_type: string;
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  changed_by: string;
  old_value?: object | null;
  new_value?: object | null;
  ip_address?: string;
  user_agent?: string;
}

export async function writeAuditLog(params: AuditParams) {
  const log = await prisma.audit_logs.create({
    data: {
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      action: params.action,
      changed_by: params.changed_by,
      old_value: params.old_value ?? undefined,
      new_value: params.new_value ?? undefined,
      ip_address: params.ip_address,
      user_agent: params.user_agent,
    },
  });

  return log;
}

export async function getAuditHistory(entity_type: string, entity_id: string) {
  const logs = await prisma.audit_logs.findMany({
    where: { entity_type, entity_id },
    orderBy: { created_at: 'desc' },
  });

  // Enrich with actor name
  const actorIds = [...new Set(logs.map((l) => l.changed_by))];
  const actors = await prisma.employees.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, system_role: true },
  });
  const actorMap = Object.fromEntries(actors.map((a) => [a.id, a]));

  return logs.map((log) => ({
    ...log,
    actor_name: actorMap[log.changed_by]?.name ?? 'Unknown',
    actor_role: actorMap[log.changed_by]?.system_role ?? 'EMPLOYEE',
  }));
}
