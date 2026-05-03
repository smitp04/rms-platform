'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const themes = ['light', 'dark'] as const;
const icons = { light: Sun, dark: Moon } as const;
const tips = { light: 'Light mode', dark: 'Dark mode' } as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const current = (theme === 'light' ? 'light' : 'dark') as (typeof themes)[number];
  const Icon = icons[current];

  const cycle = () => {
    const idx = themes.indexOf(current);
    setTheme(themes[(idx + 1) % themes.length]);
  };

  return (
    <button
      onClick={cycle}
      title={tips[current]}
      className="flex-shrink-0 p-1 rounded transition-colors text-gray-400 hover:text-white"
    >
      <Icon size={16} />
    </button>
  );
}
