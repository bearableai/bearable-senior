import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Send an SMS message via AWS SNS.
 * Uses the default AWS credential chain (env vars, IAM role, etc.).
 */
export async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  const command = new PublishCommand({
    PhoneNumber: phoneNumber,
    Message: message,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: 'Transactional',
      },
    },
  });

  const response = await snsClient.send(command);

  if (!response.MessageId) {
    throw new Error('SNS publish failed: no MessageId returned');
  }
}
