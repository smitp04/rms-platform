import { Database } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { AdminClient } from '@/components/admin/AdminClient';
import { authOptions } from '@/lib/auth';

export const metadata = { title: 'Admin DB · devx RMS' };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.system_role !== 'ADMIN') redirect('/overview');

  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center">
          <Database size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Admin DB</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            Direct database access — People, Projects, Pods, Audit Log
          </p>
        </div>
      </div>
      <AdminClient serverParams={params} />
    </div>
  );
}
