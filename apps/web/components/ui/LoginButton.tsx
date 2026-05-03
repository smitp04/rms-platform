'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  // Show sign-out toast if redirected here after sign-out
  useEffect(() => {
    if (sessionStorage.getItem('rms_signed_out')) {
      sessionStorage.removeItem('rms_signed_out');
      // Small delay ensures sonner Toaster is fully mounted after page navigation
      const t = setTimeout(() => toast.success('Signed out successfully.'), 150);
      return () => clearTimeout(t);
    }
  }, []);

  function handleClick() {
    setLoading(true);
    sessionStorage.setItem('rms_just_logged_in', '1');
    signIn('google', { callbackUrl: '/' });
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm ${
        loading ? 'cursor-wait opacity-70' : 'cursor-pointer'
      }`}
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin text-gray-500 dark:text-gray-400" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            fill="#4285F4"
          />
          <path
            d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
            fill="#34A853"
          />
          <path
            d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
            fill="#FBBC05"
          />
          <path
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
            fill="#EA4335"
          />
        </svg>
      )}
      {loading ? 'Signing in…' : 'Continue with Google'}
    </button>
  );
}
