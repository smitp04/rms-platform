import { NextRequest } from 'next/server';
import { requirePermission, apiSuccess, apiError, ApiError } from '@/lib/utils/api';
import { prisma } from '@/lib/prisma';
import { sendInviteEmail } from '@/lib/email';

// PATCH /api/v1/invites/:id — resend (reset expiry) or revoke
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('employee:write');
    const { id } = await params;

    const body = await req.json();
    const { action } = body; // "resend" | "revoke"

    const invite = await prisma.rms_invites.findUnique({ where: { id } });
    if (!invite) throw new ApiError(404, 'Invite not found');

    if (action === 'revoke') {
      if (invite.status === 'ACCEPTED') throw new ApiError(400, 'Cannot revoke an accepted invite');

      // Delete any old REVOKED invites for the same email to avoid unique(email, status) conflict
      await prisma.rms_invites.deleteMany({
        where: { email: invite.email, status: 'REVOKED', id: { not: id } },
      });

      const updated = await prisma.rms_invites.update({
        where: { id },
        data: { status: 'REVOKED', revoked_at: new Date() },
      });
      return apiSuccess(updated);
    }

    if (action === 'resend') {
      if (invite.status === 'ACCEPTED') throw new ApiError(400, 'Invite already accepted');
      if (invite.status === 'REVOKED') throw new ApiError(400, 'Invite has been revoked');

      const expires_at = new Date();
      expires_at.setDate(expires_at.getDate() + 7);

      const updated = await prisma.rms_invites.update({
        where: { id },
        data: { status: 'PENDING', expires_at, updated_at: new Date() },
      });

      // Re-send the invite email
      const inviter = await prisma.employees.findUnique({
        where: { id: invite.invited_by },
        select: { name: true },
      });

      try {
        await sendInviteEmail({
          to: invite.email,
          inviterName: inviter?.name ?? 'A team admin',
          role: invite.system_role,
          note: invite.note,
          loginUrl: `${process.env.NEXTAUTH_URL}/login`,
        });
      } catch (emailErr) {
        console.error('Resend invite email failed:', emailErr);
      }

      return apiSuccess(updated);
    }

    throw new ApiError(400, 'action must be "resend" or "revoke"');
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/v1/invites/:id — hard delete (only PENDING/EXPIRED/REVOKED)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('employee:write');
    const { id } = await params;

    const invite = await prisma.rms_invites.findUnique({ where: { id } });
    if (!invite) throw new ApiError(404, 'Invite not found');
    if (invite.status === 'ACCEPTED') throw new ApiError(400, 'Cannot delete an accepted invite');

    await prisma.rms_invites.delete({ where: { id } });
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
