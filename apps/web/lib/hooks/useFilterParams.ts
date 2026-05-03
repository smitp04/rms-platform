'use client';

import { useEffect, useRef } from 'react';

type FilterValue = string | number | boolean;
type Defaults = Record<string, FilterValue>;

/**
 * Read filter values from a raw params object (from server searchParams or window.location).
 * Coerces types based on the defaults object.
 */
function parseParams<T extends Defaults>(raw: Record<string, string>, defaults: T): T {
  const result = { ...defaults } as Record<string, FilterValue>;
  for (const [key, def] of Object.entries(defaults)) {
    const val = raw[key];
    if (val === undefined || val === null) continue;
    if (typeof def === 'number') {
      const n = Number(val);
      result[key] = Number.isFinite(n) ? n : def;
    } else if (typeof def === 'boolean') result[key] = val === 'true' || val === '1';
    else result[key] = val;
  }
  return result as T;
}

/**
 * Read URL search params, working on both server (from passed serverParams) and client.
 * Pass the raw searchParams from the Next.js page to eliminate SSR flash.
 */
export function readUrlParams<T extends Defaults>(
  defaults: T,
  serverParams?: Record<string, string | string[] | undefined>,
): T {
  // Normalise server params (Next.js searchParams values can be string | string[])
  if (serverParams) {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(serverParams)) {
      if (typeof v === 'string') flat[k] = v;
      else if (Array.isArray(v) && v.length) flat[k] = v[0];
    }
    return parseParams(flat, defaults);
  }
  // Client fallback
  if (typeof window !== 'undefined') {
    const raw: Record<string, string> = {};
    const params = new URLSearchParams(window.location.search);
    params.forEach((v, k) => {
      raw[k] = v;
    });
    return parseParams(raw, defaults);
  }
  return { ...defaults };
}

/**
 * Hook: keeps URL search params in sync with filter state.
 * Only modifies params listed in `defaults`; preserves all others.
 * Params matching their default value are removed to keep URLs clean.
 */
export function useSyncUrlParams(values: Defaults, defaults: Defaults) {
  const defaultsRef = useRef(defaults);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    for (const [key, def] of Object.entries(defaultsRef.current)) {
      const val = values[key];
      if (val === def || val === '' || val === null || val === undefined) {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
      } else {
        const str = String(val);
        if (params.get(key) !== str) {
          params.set(key, str);
          changed = true;
        }
      }
    }
    if (changed) {
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  }, [values]);
}
