'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute — prevents re-fetch on tab switch
            gcTime: 10 * 60 * 1000, // 10 minutes — keep cache alive longer
            refetchOnWindowFocus: false, // don't re-fetch when user tabs back
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster position="top-right" richColors duration={3000} />
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
