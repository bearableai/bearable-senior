import { ConnectClient, StartOutboundVoiceContactCommand } from '@aws-sdk/client-connect';

const connectClient = new ConnectClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const INSTANCE_ID = process.env.CONNECT_INSTANCE_ID!;
const CONTACT_FLOW_ID = process.env.CONNECT_CONTACT_FLOW_ID!;
const SOURCE_PHONE = process.env.CONNECT_PHONE_NUMBER!;

/**
 * Initiate an outbound voice call via Amazon Connect.
 * The Contact Flow handles: TTS greeting -> record -> transcribe -> POST results to callback endpoint.
 */
export async function initiateOutboundCall(
  phoneNumber: string,
  contactFlowId?: string,
  instanceId?: string,
): Promise<void> {
  const command = new StartOutboundVoiceContactCommand({
    DestinationPhoneNumber: phoneNumber,
    ContactFlowId: contactFlowId || CONTACT_FLOW_ID,
    InstanceId: instanceId || INSTANCE_ID,
    SourcePhoneNumber: SOURCE_PHONE,
  });

  const response = await connectClient.send(command);

  if (!response.ContactId) {
    throw new Error('Connect StartOutboundVoiceContact failed: no ContactId returned');
  }
}
