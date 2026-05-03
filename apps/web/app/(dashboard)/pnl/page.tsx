import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { PnLClient } from '@/components/pnl/PnLClient';
import { authOptions } from '@/lib/auth';

export default async function PnLPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.system_role !== 'ADMIN') redirect('/overview');

  const params = await searchParams;
  // When navigating from the dashboard "Projects in Red" card, pre-filter to red projects
  const defaultRedFilter = params.red === '1';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">PnL Overview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Project profitability across sprints</p>
      </div>
      <PnLClient defaultRedFilter={defaultRedFilter} serverParams={params} isAdmin />
    </div>
  );
}
