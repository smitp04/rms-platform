import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      system_role: string;
      pod_id?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    employee_id?: string;
    system_role?: string;
    pod_id?: string | null;
  }
}
