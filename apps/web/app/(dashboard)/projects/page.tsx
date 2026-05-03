import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ProjectsClient } from '@/components/projects/ProjectsClient';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'POD_LEAD', 'CSM'];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session.user?.system_role as string)) {
    redirect('/overview');
  }

  const params = await searchParams;

  // Prefetch filter options so selects render correctly during SSR (no placeholder flash)
  const [pmEmployees, growthConsultants] = await Promise.all([
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
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Projects</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">All active deals and engagements</p>
      </div>
      <ProjectsClient
        serverParams={params}
        initialPmEmployees={pmEmployees}
        initialGrowthConsultants={growthConsultants}
      />
    </div>
  );
}
