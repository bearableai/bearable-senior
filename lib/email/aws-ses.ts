import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@bearable.ai';

/**
 * Send an email via AWS SES.
 * For future use: weekly digest emails to caretakers, account notifications, etc.
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<void> {
  const command = new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8',
        },
      },
    },
  });

  const response = await sesClient.send(command);

  if (!response.MessageId) {
    throw new Error('SES SendEmail failed: no MessageId returned');
  }
}
