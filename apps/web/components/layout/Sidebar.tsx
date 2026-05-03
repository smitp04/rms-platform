'use client';

import {
  CalendarRange,
  Database,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Pencil,
  Settings,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { useSidebarStore } from '@/store/sidebarStore';
import { ProfileEditModal } from './ProfileEditModal';
import { ThemeToggle } from './ThemeToggle';

// Akar Icons — Panel Left (collapse): rect + vertical line at x=9
function PanelLeftIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="18" x="2" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

// Akar Icons — Panel Right (expand): rect + vertical line at x=15
function PanelRightIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="18" x="2" y="3" rx="2" />
      <path d="M15 3v18" />
    </svg>
  );
}

const navItems = [
  { href: '/overview', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'POD_LEAD', 'CSM', 'EMPLOYEE'] },
  { href: '/projects', label: 'Projects', icon: FolderKanban, roles: ['ADMIN', 'POD_LEAD', 'CSM'] },
  { href: '/employees', label: 'Employees', icon: Users, roles: ['ADMIN', 'POD_LEAD', 'CSM', 'EMPLOYEE'] },
  { href: '/allocations', label: 'Allocations', icon: CalendarRange, roles: ['ADMIN', 'POD_LEAD', 'CSM'] },
  { href: '/pnl', label: 'PnL', icon: TrendingUp, roles: ['ADMIN'] },
  { href: '/admin', label: 'Admin DB', icon: Database, roles: ['ADMIN'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = session?.user?.system_role ?? 'EMPLOYEE';
  const sessionLoading = status === 'loading';
  const { isOpen, isCollapsed, toggleCollapse, close } = useSidebarStore();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  useEffect(() => {
    setShowProfileEdit(false);
  }, [pathname]);

  // While session is loading, show all nav items to prevent flash
  // (server layout already verified auth — safe to render all)
  const visibleItems = sessionLoading ? navItems : navItems.filter((item) => item.roles.includes(role));

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={close} />}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-gray-950 text-white flex flex-col',
          'transition-all duration-200 ease-in-out',
          'w-60',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:translate-x-0',
          isCollapsed ? 'md:w-16' : 'md:w-60',
        )}
      >
        {/* Brand — hidden on desktop when collapsed so toggle drops into nav */}
        <div
          className={cn(
            'border-b border-gray-800 dark:border-white/10 flex items-center px-5 py-5 justify-between',
            isCollapsed && 'md:hidden',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex-shrink-0 w-9 h-8 bg-white rounded-md border border-gray-200 flex items-center justify-center">
              <span className="text-black font-bold text-[12px] tracking-tight">devx</span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-tight whitespace-nowrap">RMS</div>
              <div className="text-[11px] text-gray-400 whitespace-nowrap">Resource Management</div>
            </div>
          </div>

          {/* Desktop collapse — Panel Left icon */}
          <button
            onClick={toggleCollapse}
            className="hidden md:flex items-center justify-center text-gray-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
            aria-label="Collapse sidebar"
          >
            <PanelLeftIcon size={18} />
          </button>

          {/* Mobile close */}
          <button onClick={close} className="md:hidden text-gray-400 hover:text-white" aria-label="Close sidebar">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className={cn('flex-1 py-4 space-y-1 overflow-y-auto', isCollapsed ? 'md:px-2 px-3' : 'px-3')}>
          {/* Panel Right expand button — inline with nav icons when collapsed on desktop */}
          <button
            onClick={toggleCollapse}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className={cn(
              'w-full flex items-center rounded-lg text-sm font-medium transition-colors',
              'gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-gray-800 dark:hover:bg-white/10 cursor-pointer',
              isCollapsed ? 'hidden md:flex md:justify-center md:px-0 md:py-3' : 'hidden',
            )}
          >
            <PanelRightIcon size={16} />
          </button>

          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  'gap-3 px-3 py-2.5',
                  isCollapsed && 'md:justify-center md:px-0 md:py-3',
                  isActive
                    ? 'bg-white text-gray-900 dark:bg-white/10 dark:text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800 dark:hover:bg-white/10',
                )}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className={cn(isCollapsed && 'md:hidden')}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div
          className={cn('py-4 border-t border-gray-800 dark:border-white/10', isCollapsed ? 'md:px-2 px-3' : 'px-3')}
        >
          <div className={cn('flex items-center gap-3 px-3 py-2 mb-1', isCollapsed && 'md:justify-center md:px-0')}>
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name ?? ''}
                className="w-7 h-7 rounded-full flex-shrink-0"
              />
            ) : (
              <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center text-xs flex-shrink-0">
                {session?.user?.name?.[0] ?? '?'}
              </div>
            )}
            <div className={cn('flex-1 min-w-0', isCollapsed && 'md:hidden')}>
              <div className="text-xs font-medium truncate">{session?.user?.name}</div>
              <div className="text-xs text-gray-500 truncate">{role}</div>
            </div>
            <button
              type="button"
              onClick={() => setShowProfileEdit(true)}
              title="Edit profile"
              className={cn('text-gray-400 hover:text-white p-1 rounded transition-colors', isCollapsed && 'md:hidden')}
            >
              <Pencil size={16} />
            </button>
          </div>

          <div className={cn('flex items-center gap-2 px-3 py-2', isCollapsed && 'md:justify-center md:px-0')}>
            <button
              onClick={() => setShowSignOutConfirm(true)}
              title={isCollapsed ? 'Sign out' : undefined}
              className={cn(
                'flex-1 flex items-center rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 dark:hover:bg-white/10 transition-colors cursor-pointer',
                'gap-3',
                isCollapsed && 'md:justify-center md:flex-none',
              )}
            >
              <LogOut size={16} className="flex-shrink-0" />
              <span className={cn(isCollapsed && 'md:hidden')}>Sign out</span>
            </button>
            <div className={cn(isCollapsed && 'md:hidden')}>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* Sign-out confirmation dialog */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <LogOut size={18} className="text-gray-600 dark:text-gray-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Sign out</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Do you want to sign out of devx RMS?</p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem('rms_login_toasted');
                  sessionStorage.setItem('rms_signed_out', '1');
                  signOut({ callbackUrl: '/login' });
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileEdit && <ProfileEditModal onClose={() => setShowProfileEdit(false)} />}
    </>
  );
}
