import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function proxy(req) {
    // Allow all authenticated requests through
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: [
    // Protect all routes except login, public assets, and auth API
    '/((?!login|api/auth|api/v1/auth|api/v1/webhooks|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
