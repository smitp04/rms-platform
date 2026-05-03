'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

interface Option {
  id: string;
  name: string;
}

export function MultiSelect({
  options,
  selectedIds,
  onChange,
  placeholder = 'Select…',
  emptyText = 'No options',
}: {
  options: Option[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: 'down' | 'up';
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById('multiselect-menu-portal-active');
      if (menu?.contains(target)) return;
      setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    function updatePos() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const desired = 256;
      const placement: 'down' | 'up' = spaceBelow >= desired || spaceBelow >= spaceAbove ? 'down' : 'up';
      const maxHeight = Math.min(desired, placement === 'down' ? spaceBelow : spaceAbove);
      setMenuPos({
        top: placement === 'down' ? rect.bottom + 4 : rect.top - 4 - maxHeight,
        left: rect.left,
        width: rect.width,
        maxHeight,
        placement,
      });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOptions = useMemo(() => options.filter((o) => selectedSet.has(o.id)), [options, selectedSet]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(id: string) {
    if (selectedSet.has(id)) onChange(selectedIds.filter((s) => s !== id));
    else onChange([...selectedIds, id]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[40px] flex flex-wrap items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-900 text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {selectedOptions.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 px-1">{placeholder}</span>
        ) : (
          selectedOptions.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.5 rounded"
            >
              {o.name}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(o.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    toggle(o.id);
                  }
                }}
                className="hover:text-blue-900 cursor-pointer"
              >
                <X size={10} />
              </span>
            </span>
          ))
        )}
        <ChevronDown size={14} className="ml-auto text-gray-400" />
      </button>

      {open &&
        menuPos &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            id="multiselect-menu-portal-active"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
            className="z-[60] overflow-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
          >
            <div className="sticky top-0 bg-white dark:bg-gray-900 p-2 border-b border-gray-100 dark:border-gray-800">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full text-sm px-2 py-1 bg-transparent focus:outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
              />
            </div>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">{emptyText}</div>
            ) : (
              filtered.map((o) => {
                const isSel = selectedSet.has(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => toggle(o.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800',
                      isSel && 'bg-blue-50/50 dark:bg-blue-950/20',
                    )}
                  >
                    <span className="text-gray-800 dark:text-gray-200">{o.name}</span>
                    {isSel && <Check size={14} className="text-blue-600" />}
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
