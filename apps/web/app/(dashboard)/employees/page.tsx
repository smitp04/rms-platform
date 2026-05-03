import { EmployeesClient } from '@/components/employees/EmployeesClient';
import { prisma } from '@/lib/prisma';

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // When navigating from the dashboard "Employees Available" card, pre-sort by availability
  const defaultAvailableFilter = params.available === '1';

  // Prefetch filter options so selects render correctly during SSR (no placeholder flash)
  const [functions, pods] = await Promise.all([
    prisma.functions.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.pods.findMany({ where: { deleted_at: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Employees</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Team directory and allocation overview</p>
      </div>
      <EmployeesClient
        defaultAvailableFilter={defaultAvailableFilter}
        sprintId={params.sprint_id as string | undefined}
        serverParams={params}
        initialFunctions={functions}
        initialPods={pods}
      />
    </div>
  );
}
