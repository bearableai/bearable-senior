// DEPRECATED: Twilio has been replaced by AWS SNS.
// This file re-exports from aws-sns.ts for backward compatibility.
// All SMS is now sent via AWS SNS.

export { sendSMS } from './aws-sns';

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
