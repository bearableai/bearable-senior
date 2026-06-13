import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: This endpoint was used for Twilio voice webhooks.
 * Voice calls are now handled by Amazon Connect contact flows.
 * Inbound calls go directly to the Connect instance; transcription
 * results are posted to /api/voice/connect-callback.
 *
 * This route is kept temporarily to return a helpful message if
 * any stale Twilio configuration still points here.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Voice is now handled by Amazon Connect.',
      redirect: '/api/voice/connect-callback',
    },
    { status: 410 },
  );
}
