'use client';

import { Boxes, FolderKanban, ScrollText, Users } from 'lucide-react';
import { useState } from 'react';
import { readUrlParams, useSyncUrlParams } from '@/lib/hooks/useFilterParams';
import { AdminAuditTab } from './AdminAuditTab';
import { AdminPeopleTab } from './AdminPeopleTab';
import { AdminPodsTab } from './AdminPodsTab';
import { AdminProjectsTab } from './AdminProjectsTab';

type Tab = 'people' | 'projects' | 'pods' | 'audit';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'people', label: 'People', icon: Users },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'pods', label: 'Pods', icon: Boxes },
  { id: 'audit', label: 'Audit Log', icon: ScrollText },
];

export function AdminClient({ serverParams }: { serverParams?: Record<string, string | string[] | undefined> } = {}) {
  const urlDefaults = { tab: 'people' };
  const init = readUrlParams(urlDefaults, serverParams);
  const [activeTab, setActiveTab] = useState<Tab>(init.tab as Tab);
  // Track which tabs have been visited so we mount them once and keep them alive
  const [visited, setVisited] = useState<Set<Tab>>(new Set([init.tab as Tab]));
  useSyncUrlParams({ tab: activeTab }, urlDefaults);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setVisited((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content — keep visited tabs mounted (hidden) so switching is instant */}
      <div>
        {visited.has('people') && (
          <div className={activeTab !== 'people' ? 'hidden' : undefined}>
            <AdminPeopleTab serverParams={serverParams} />
          </div>
        )}
        {visited.has('projects') && (
          <div className={activeTab !== 'projects' ? 'hidden' : undefined}>
            <AdminProjectsTab serverParams={serverParams} />
          </div>
        )}
        {visited.has('pods') && (
          <div className={activeTab !== 'pods' ? 'hidden' : undefined}>
            <AdminPodsTab />
          </div>
        )}
        {visited.has('audit') && (
          <div className={activeTab !== 'audit' ? 'hidden' : undefined}>
            <AdminAuditTab />
          </div>
        )}
      </div>
    </div>
  );
}
