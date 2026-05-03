import { NextRequest, NextResponse } from 'next/server';
import { validateWebhookSecret } from '@/lib/utils/api';
import { handleCrmWebhook } from '@/lib/services/WebhookService';

function parseFormUrlEncoded(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of text.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(rest.join('=') || '');
  }
  return params;
}

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Read the raw body text once — prevents stream-already-consumed issues
    const rawBody = await req.text();
    let payload: Record<string, unknown> = {};

    if (rawBody) {
      const contentType = req.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        payload = JSON.parse(rawBody);
      } else if (
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')
      ) {
        payload = parseFormUrlEncoded(rawBody);
      } else {
        // Unknown content-type — try JSON, then form-encoded
        try {
          payload = JSON.parse(rawBody);
        } catch {
          payload = parseFormUrlEncoded(rawBody);
        }
      }
    }

    // Fallback: if body was empty, read Zoho Module Parameters from URL query params
    if (Object.keys(payload).length === 0) {
      const params: Record<string, string> = {};
      req.nextUrl.searchParams.forEach((value, key) => {
        if (key !== 'secret') params[key] = value;
      });
      if (Object.keys(params).length > 0) payload = params;
    }

    // Await processing so it completes before serverless runtime freezes
    await handleCrmWebhook(payload);

    return NextResponse.json({ received: true }, { status: 202 });
  } catch (err) {
    console.error('[webhook/crm] Processing failed:', err);
    // Still return 202 so Zoho doesn't keep retrying
    return NextResponse.json({ received: true, warning: 'processing error logged' }, { status: 202 });
  }
}
