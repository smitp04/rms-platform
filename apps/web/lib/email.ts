import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_EMAIL = process.env.SMTP_FROM ?? 'DevX RMS <rms@devxlabs.ai>';

interface SendInviteEmailParams {
  to: string;
  inviterName: string;
  role: string;
  note?: string | null;
  loginUrl: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  POD_LEAD: 'POD Lead',
  CSM: 'CSM',
  EMPLOYEE: 'Employee',
};

export async function sendInviteEmail({
  to,
  inviterName,
  role,
  note,
  loginUrl,
}: SendInviteEmailParams) {
  const roleLabel = ROLE_LABELS[role] ?? role;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 0;">
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">

        <div style="background: #1e3a5f; padding: 24px 32px;">
          <h1 style="color: #ffffff; font-size: 20px; margin: 0;">DevX RMS</h1>
        </div>

        <div style="padding: 32px;">
          <h2 style="color: #111827; font-size: 18px; margin: 0 0 8px;">You've been invited!</h2>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
            <strong>${inviterName}</strong> has invited you to join the DevX Resource Management System as <strong>${roleLabel}</strong>.
          </p>

          ${note ? `
          <div style="background: #f9fafb; border-left: 3px solid #3b82f6; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 0 0 20px;">
            <p style="color: #374151; font-size: 13px; margin: 0; font-style: italic;">"${note}"</p>
          </div>
          ` : ''}

          <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            Sign in with your <strong>@devxlabs.ai</strong> Google account to get started.
          </p>

          <a href="${loginUrl}"
             style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Sign in to RMS
          </a>

          <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0; line-height: 1.5;">
            This invite is valid for 7 days. If you didn't expect this email, you can safely ignore it.
          </p>
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject: `${inviterName} invited you to DevX RMS`,
    html,
  });
}
