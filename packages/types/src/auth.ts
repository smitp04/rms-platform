export type SystemRole = 'ADMIN' | 'POD_LEAD' | 'CSM' | 'EMPLOYEE';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  system_role: SystemRole;
  pod_id?: string | null;
}
