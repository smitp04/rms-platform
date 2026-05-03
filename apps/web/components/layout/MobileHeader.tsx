'use client';

import { Menu } from 'lucide-react';
import { useSidebarStore } from '@/store/sidebarStore';

export function MobileHeader() {
  const toggle = useSidebarStore((s) => s.toggle);

  return (
    <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <button onClick={toggle} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
        <Menu size={22} />
      </button>
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 w-9 h-7 bg-gray-900 dark:bg-white rounded flex items-center justify-center">
          <span className="text-white dark:text-black font-bold text-[12px] tracking-tight">devx</span>
        </div>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">RMS</span>
      </div>
    </div>
  );
}
