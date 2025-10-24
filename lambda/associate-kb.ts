import { BedrockAgentClient, AssociateAgentKnowledgeBaseCommand, DisassociateAgentKnowledgeBaseCommand, GetAgentKnowledgeBaseCommand } from '@aws-sdk/client-bedrock-agent';

const bedrockAgent = new BedrockAgentClient({ region: process.env.AWS_REGION });

interface CloudFormationCustomResourceEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: {
    AgentId: string;
    KnowledgeBaseId: string;
    Description?: string;
  };
  PhysicalResourceId?: string;
}

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { AgentId, KnowledgeBaseId, Description } = event.ResourceProperties;

  try {
    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
      // Associate the knowledge base with the agent
      // Note: agentVersion must be 'DRAFT' - this is required by the Bedrock API
      const command = new AssociateAgentKnowledgeBaseCommand({
        agentId: AgentId,
        agentVersion: 'DRAFT',
        knowledgeBaseId: KnowledgeBaseId,
        description: Description || 'Knowledge base for RAG',
        knowledgeBaseState: 'ENABLED',
      });

      const response = await bedrockAgent.send(command);
      console.log('Association response:', JSON.stringify(response, null, 2));

      return {
        PhysicalResourceId: `${AgentId}-${KnowledgeBaseId}`,
        Data: {
          AssociationId: response.agentKnowledgeBase?.knowledgeBaseId,
        },
      };
    } else if (event.RequestType === 'Delete') {
      // Check if association exists before trying to delete
      try {
        await bedrockAgent.send(
          new GetAgentKnowledgeBaseCommand({
            agentId: AgentId,
            agentVersion: 'DRAFT',
            knowledgeBaseId: KnowledgeBaseId,
          })
        );

        // Association exists, delete it
        await bedrockAgent.send(
          new DisassociateAgentKnowledgeBaseCommand({
            agentId: AgentId,
            agentVersion: 'DRAFT',
            knowledgeBaseId: KnowledgeBaseId,
          })
        );

        console.log('Successfully disassociated knowledge base');
      } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
          console.log('Association already deleted or does not exist');
        } else {
          throw error;
        }
      }

      return {
        PhysicalResourceId: event.PhysicalResourceId || `${AgentId}-${KnowledgeBaseId}`,
      };
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
