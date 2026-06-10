const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID!;
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN!;
const FROM_NUMBER  = process.env.TWILIO_PHONE_NUMBER!;

export async function sendSMS(to: string, body: string): Promise<void> {
  if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
    throw new Error('Twilio credentials not configured');
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
      },
      body: new URLSearchParams({ To: to, From: FROM_NUMBER, Body: body }).toString(),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio error ${res.status}: ${err}`);
  }
}

export function generateVerifyCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 7 && raw.startsWith('+')) return `+${digits}`;
  return null;
}
