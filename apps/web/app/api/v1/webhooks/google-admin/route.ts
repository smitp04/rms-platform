import { type NextRequest, NextResponse } from 'next/server';
import { handleGoogleAdminWebhook } from '@/lib/services/WebhookService';
import { validateWebhookSecret } from '@/lib/utils/api';

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await req.json();

    // Await processing so it completes before serverless runtime freezes
    await handleGoogleAdminWebhook(payload);

    return NextResponse.json({ received: true }, { status: 202 });
  } catch (err) {
    console.error('[webhook/google-admin] Processing failed:', err);
    return NextResponse.json({ received: true, warning: 'processing error logged' }, { status: 202 });
  }
}
