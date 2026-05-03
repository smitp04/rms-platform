import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { AllocationClient } from '@/components/allocations/AllocationClient';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'POD_LEAD', 'CSM'];

export default async function AllocationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session.user?.system_role as string)) {
    redirect('/overview');
  }

  const params = await searchParams;

  // Prefetch filter options so selects render at final width during SSR (no layout shift)
  const [pmEmployees, growthEmployees, accountRows] = await Promise.all([
    prisma.employees.findMany({
      where: { system_role: 'CSM', deleted_at: null, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.employees.findMany({
      where: { function: { name: { equals: 'Growth', mode: 'insensitive' } }, deleted_at: null, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.accounts.findMany({
      select: { brand_name: true },
      distinct: ['brand_name'],
      orderBy: { brand_name: 'asc' },
    }),
  ]);
  const initialAccounts = accountRows.map((a) => a.brand_name).filter(Boolean);

  return (
    <div>
      <div className="mb-6 hidden sm:block">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Allocations</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage team allocations across projects and sprints
        </p>
      </div>
      <AllocationClient
        serverParams={params}
        initialPmEmployees={pmEmployees}
        initialGrowthEmployees={growthEmployees}
        initialAccounts={initialAccounts}
      />
    </div>
  );
}
