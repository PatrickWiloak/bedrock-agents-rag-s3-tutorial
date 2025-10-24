import { BedrockAgentClient, PrepareAgentCommand, GetAgentCommand } from '@aws-sdk/client-bedrock-agent';

const bedrockAgent = new BedrockAgentClient({ region: process.env.AWS_REGION });

interface CloudFormationCustomResourceEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: {
    AgentId: string;
  };
  PhysicalResourceId?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { AgentId } = event.ResourceProperties;

  try {
    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
      // Wait a bit for IAM policies to propagate
      console.log('Waiting 10 seconds for IAM propagation...');
      await sleep(10000);

      // Prepare the agent with retries
      let attempt = 0;
      const maxAttempts = 5;

      while (attempt < maxAttempts) {
        try {
          console.log(`Attempting to prepare agent (attempt ${attempt + 1}/${maxAttempts})...`);

          const command = new PrepareAgentCommand({
            agentId: AgentId,
          });

          const response = await bedrockAgent.send(command);
          console.log('Prepare agent response:', JSON.stringify(response, null, 2));

          // Wait for agent to be prepared
          let status = response.agentStatus;
          let checks = 0;
          const maxChecks = 30;

          while (status === 'PREPARING' && checks < maxChecks) {
            console.log(`Agent status: ${status}, waiting 10 seconds...`);
            await sleep(10000);

            const getAgentResponse = await bedrockAgent.send(
              new GetAgentCommand({ agentId: AgentId })
            );
            status = getAgentResponse.agent?.agentStatus;
            checks++;
          }

          if (status === 'PREPARED' || status === 'DRAFT') {
            console.log(`Agent prepared successfully with status: ${status}`);
            return {
              PhysicalResourceId: AgentId,
              Data: {
                AgentStatus: status,
                PreparedAt: new Date().toISOString(),
              },
            };
          } else {
            console.warn(`Agent ended with unexpected status: ${status}`);
          }

          break; // Success, exit retry loop
        } catch (error: any) {
          console.error(`Attempt ${attempt + 1} failed:`, error);

          if (attempt === maxAttempts - 1) {
            throw error; // Last attempt, throw the error
          }

          // Wait before retrying (exponential backoff)
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000);
          console.log(`Waiting ${waitTime}ms before retry...`);
          await sleep(waitTime);
          attempt++;
        }
      }

      return {
        PhysicalResourceId: AgentId,
      };
    } else if (event.RequestType === 'Delete') {
      // No action needed on delete - agent is deleted separately
      console.log('Delete request - no action needed for PrepareAgent');
      return {
        PhysicalResourceId: event.PhysicalResourceId || AgentId,
      };
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
