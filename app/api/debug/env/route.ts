import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasDatabase: !!process.env.DATABASE_URL,
    hasCronSecret: !!process.env.CRON_SECRET,
    hasRegion: !!process.env.REGION,
    nodeEnv: process.env.NODE_ENV,
    // Don't expose actual values, just check existence
    envKeys: Object.keys(process.env).filter(key =>
      key.includes('DATABASE') ||
      key.includes('TWILIO') ||
      key.includes('CRON') ||
      key.includes('REGION') ||
      key.includes('AWS')
    )
  });
}
