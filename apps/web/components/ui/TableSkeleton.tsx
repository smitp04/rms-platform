'use client';

import { Loader2 } from 'lucide-react';

export function TableSkeleton() {
  return (
    <div className="flex items-center justify-center gap-2 py-20">
      <Loader2 size={16} className="animate-spin text-gray-400" />
      <span className="text-sm text-gray-400">Loading…</span>
    </div>
  );
}
