import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { InviteClient } from '@/components/settings/InviteClient';

export const metadata = { title: 'Settings · devx RMS' };

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.system_role !== 'ADMIN') redirect('/overview');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage platform access and team invites</p>
      </div>
      <InviteClient />
    </div>
  );
}
