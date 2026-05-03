import { NextRequest } from 'next/server';
import { requirePermission, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';
import { sendInviteEmail } from '@/lib/email';

const GOOGLE_DOMAIN = process.env.GOOGLE_DOMAIN ?? 'devxlabs.ai';
const INVITE_TTL_DAYS = 7;

// GET /api/v1/invites — list all invites (admin only)
export async function GET(_req: NextRequest) {
  try {
    await requirePermission('employee:write');

    const invites = await prisma.rms_invites.findMany({
      orderBy: { created_at: 'desc' },
    });

    // Enrich with inviter name
    const inviterIds = [...new Set(invites.map((i) => i.invited_by))];
    const inviters = await prisma.employees.findMany({
      where: { id: { in: inviterIds } },
      select: { id: true, name: true },
    });
    const inviterMap = new Map(inviters.map((e) => [e.id, e.name]));

    // Auto-expire any pending invites past their expiry date
    const now = new Date();
    const expiredIds = invites
      .filter((i) => i.status === 'PENDING' && i.expires_at < now)
      .map((i) => i.id);

    if (expiredIds.length > 0) {
      await prisma.rms_invites.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      });
      // Reflect expiry in response
      for (const inv of invites) {
        if (expiredIds.includes(inv.id)) {
          (inv as any).status = 'EXPIRED';
        }
      }
    }

    return apiSuccess(
      invites.map((inv) => ({
        ...inv,
        invited_by_name: inviterMap.get(inv.invited_by) ?? 'Unknown',
        is_expired: inv.status === 'EXPIRED' || (inv.status === 'PENDING' && inv.expires_at < now),
      }))
    );
  } catch (err) {
    return apiError(err);
  }
}

// POST /api/v1/invites — create (send) a new invite
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('employee:write');

    const body = await req.json();
    const { email, system_role, note } = body;

    if (!email || typeof email !== 'string') {
      throw new ApiError(400, 'email is required');
    }

    const normalised = email.toLowerCase().trim();

    if (!normalised.endsWith(`@${GOOGLE_DOMAIN}`)) {
      throw new ApiError(400, `Only @${GOOGLE_DOMAIN} addresses can be invited`);
    }

    // Check if already an active employee
    const existing = await prisma.employees.findUnique({
      where: { email: normalised },
      select: { id: true, status: true },
    });
    if (existing && existing.status === 'ACTIVE') {
      throw new ApiError(409, 'This person is already an active member');
    }

    // Check for an existing PENDING invite for this email
    const existingInvite = await prisma.rms_invites.findFirst({
      where: { email: normalised, status: 'PENDING' },
    });
    if (existingInvite) {
      throw new ApiError(409, 'An active invite already exists for this email. Resend or revoke it first.');
    }

    const VALID_ROLES = ['ADMIN', 'POD_LEAD', 'CSM', 'EMPLOYEE'];
    const role = VALID_ROLES.includes(system_role) ? system_role : 'EMPLOYEE';

    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + INVITE_TTL_DAYS);

    const invite = await prisma.rms_invites.create({
      data: {
        email: normalised,
        system_role: role as any,
        invited_by: session.user.id,
        note: note ?? null,
        expires_at,
      },
    });

    // Send invite email
    const inviter = await prisma.employees.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });

    try {
      await sendInviteEmail({
        to: normalised,
        inviterName: inviter?.name ?? 'A team admin',
        role,
        note: note ?? null,
        loginUrl: `${process.env.NEXTAUTH_URL}/login`,
      });
    } catch (emailErr) {
      console.error('Invite created but email failed:', emailErr);
    }

    return apiSuccess(invite, 201);
  } catch (err) {
    return apiError(err);
  }
}
