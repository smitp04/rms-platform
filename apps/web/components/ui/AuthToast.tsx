'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

export function AuthToast() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.name) return;

    // Only show when user just completed the login flow
    if (!sessionStorage.getItem('rms_just_logged_in')) return;
    sessionStorage.removeItem('rms_just_logged_in');

    toast.success(`Welcome back, ${session.user.name.split(' ')[0]}!`);
  }, [status, session]);

  return null;
}
