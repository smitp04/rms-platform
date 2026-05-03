import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { LoginButton } from '@/components/ui/LoginButton';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session) redirect('/');

  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-800">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 sm:p-10 w-full max-w-sm mx-4 sm:mx-0 flex flex-col items-center gap-6 sm:gap-8">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-11 bg-black rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm tracking-tight">devx</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">devx RMS</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Resource Management System
          </p>
        </div>

        {error && (
          <div className="w-full bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error === 'AccessDenied'
              ? 'Access denied. Only @devxlabs.ai accounts are allowed.'
              : 'Sign-in failed. Please try again.'}
          </div>
        )}

        <LoginButton />

        <p className="text-xs text-gray-400 text-center">
          Sign in with your devx Google Workspace account
        </p>
      </div>
    </div>
  );
}
