// Runtime environment variable loader for AWS Amplify
// Fetches secrets from SSM Parameter Store since Amplify doesn't pass
// console environment variables to runtime

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });

let cachedEnv: Record<string, string> | null = null;

export async function loadRuntimeEnv() {
  if (cachedEnv) return cachedEnv;

  try {
    // Load from SSM Parameter Store
    const [dbPassword, cronSecret, rdsEndpoint] = await Promise.all([
      ssmClient.send(
        new GetParameterCommand({
          Name: '/bearable-senior/db-password',
          WithDecryption: true,
        })
      ),
      ssmClient.send(
        new GetParameterCommand({
          Name: '/bearable-senior/cron-secret',
          WithDecryption: true,
        })
      ),
      ssmClient.send(
        new GetParameterCommand({
          Name: '/bearable-senior/rds-endpoint',
          WithDecryption: false,
        })
      ),
    ]);

    const dbPass = dbPassword.Parameter?.Value;
    const endpoint = rdsEndpoint.Parameter?.Value || 'bearable-senior-cluster.cluster-cgl6i8wwyn6u.us-east-1.rds.amazonaws.com';

    cachedEnv = {
      DATABASE_URL: `postgresql://bearable_admin:${dbPass}@${endpoint}:5432/bearable_senior?sslmode=require`,
      CRON_SECRET: cronSecret.Parameter?.Value || '',
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || 'placeholder',
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || 'placeholder',
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '+18556884499',
    };

    // Set in process.env for backward compatibility
    Object.assign(process.env, cachedEnv);

    return cachedEnv;
  } catch (error: any) {
    console.error('Failed to load runtime environment:', error);
    throw new Error(`Failed to load runtime environment from SSM: ${error.message}`);
  }
}
