import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: This endpoint was used for Twilio recording/transcription callbacks.
 * Voice recording and transcription are now handled within Amazon Connect contact flows.
 * Results are posted to /api/voice/connect-callback.
 *
 * This route is kept temporarily to return a helpful message if
 * any stale Twilio configuration still points here.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Use /api/voice/connect-callback for Amazon Connect.',
      redirect: '/api/voice/connect-callback',
    },
    { status: 410 },
  );
}
