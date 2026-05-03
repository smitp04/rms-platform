import type { SystemRole } from '@devx/types';

export type Permission =
  | 'allocation:read:all'
  | 'allocation:read:pod'
  | 'allocation:read:own'
  | 'allocation:write:past'
  | 'allocation:write:present_future'
  | 'project:read:revenue'
  | 'project:write'
  | 'project:write:status'
  | 'employee:write'
  | 'pnl:read'
  | 'pnl:read:revenue'
  | 'audit:read'
  | 'compute_cost:write'
  | 'pod:write';

const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  ADMIN: [
    'allocation:read:all',
    'allocation:write:past',
    'allocation:write:present_future',
    'project:read:revenue',
    'project:write',
    'employee:write',
    'pnl:read',
    'pnl:read:revenue',
    'audit:read',
    'compute_cost:write',
    'pod:write',
  ],
  POD_LEAD: [
    'allocation:read:pod',
    'allocation:write:present_future',
    'pnl:read',
    'audit:read',
  ],
  CSM: [
    'allocation:read:all',
    'allocation:write:present_future',
    'project:write:status',
    'pnl:read',
  ],
  EMPLOYEE: [
    'allocation:read:own',
  ],
};

export function can(role: SystemRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissions(role: SystemRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
