import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { SystemRole } from '@devx/types';
import { can, type Permission } from '@devx/auth';

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new ApiError(401, 'Unauthorized');
  }
  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireSession();
  const role = session.user.system_role as SystemRole;
  if (!can(role, permission)) {
    throw new ApiError(403, 'Forbidden');
  }
  return session;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string
  ) {
    super(message);
  }
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  // Plain Error from service layer (business rules, validation) — surface the real message
  if (error instanceof Error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
  console.error('Unhandled API error:', error);
  return NextResponse.json(
    { success: false, error: 'Internal server error' },
    { status: 500 }
  );
}

// Validate webhook secret (header or query param)
export function validateWebhookSecret(req: Request): boolean {
  const headerSecret = req.headers.get('x-webhook-secret');
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret');
  return (headerSecret || querySecret) === process.env.WEBHOOK_SECRET;
}
