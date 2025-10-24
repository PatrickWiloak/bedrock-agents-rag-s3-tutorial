import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';

export interface BedrockAgentConstructProps {
  /**
   * Name for the Bedrock agent
   */
  agentName: string;

  /**
   * Knowledge Base ID to associate with the agent (primary KB)
   * Use this for single KB or the first KB in multi-KB setup
   */
  knowledgeBaseId: string;

  /**
   * Additional Knowledge Base IDs to associate with the agent
   * @default []
   */
  additionalKnowledgeBaseIds?: string[];

  /**
   * Foundation model ID for the agent
   * @default 'anthropic.claude-3-sonnet-20240229-v1:0'
   */
  foundationModel?: string;

  /**
   * Custom instructions for the agent
   */
  instruction?: string;

  /**
   * Idle session timeout in seconds
   * @default 600
   */
  idleSessionTTLInSeconds?: number;

  /**
   * Whether to prepare the agent after creation
   * @default true
   */
  prepareAgent?: boolean;
}

export class BedrockAgentConstruct extends Construct {
  public readonly agentId: string;
  public readonly agentArn: string;
  public readonly agentAliasId?: string;
  public readonly agentAliasArn?: string;

  constructor(scope: Construct, id: string, props: BedrockAgentConstructProps) {
    super(scope, id);

    const foundationModel = props.foundationModel || 'anthropic.claude-3-sonnet-20240229-v1:0';
    const idleSessionTTL = props.idleSessionTTLInSeconds || 600;
    const prepareAgent = props.prepareAgent !== false;

    const defaultInstruction = `You are a helpful AI assistant with access to a knowledge base.
Your role is to answer questions accurately using the information from the knowledge base.

Guidelines:
- Always search the knowledge base before answering questions
- If you find relevant information, cite it in your response
- If you cannot find information in the knowledge base, clearly state that
- Be concise but thorough in your responses
- If asked about topics outside the knowledge base, politely redirect to topics you can help with`;

    const instruction = props.instruction || defaultInstruction;

    // Create IAM role for the agent
    const agentRole = new iam.Role(this, 'AgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role for Bedrock Agent',
    });

    // Grant permissions to invoke foundation models
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/${foundationModel}`,
        ],
      })
    );

    // Grant permissions to access knowledge base
    agentRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:Retrieve'],
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:knowledge-base/${props.knowledgeBaseId}`,
        ],
      })
    );

    // Create the Bedrock Agent
    const createAgent = new cr.AwsCustomResource(this, 'CreateAgent', {
      onCreate: {
        service: 'BedrockAgent',
        action: 'createAgent',
        parameters: {
          agentName: props.agentName,
          agentResourceRoleArn: agentRole.roleArn,
          foundationModel: foundationModel,
          instruction: instruction,
          idleSessionTTLInSeconds: idleSessionTTL,
          description: 'RAG agent with knowledge base integration',
        },
        physicalResourceId: cr.PhysicalResourceId.fromResponse('agent.agentId'),
      },
      onUpdate: {
        service: 'BedrockAgent',
        action: 'updateAgent',
        parameters: {
          agentId: new cr.PhysicalResourceIdReference(),
          agentName: props.agentName,
          agentResourceRoleArn: agentRole.roleArn,
          foundationModel: foundationModel,
          instruction: instruction,
          idleSessionTTLInSeconds: idleSessionTTL,
          description: 'RAG agent with knowledge base integration',
        },
        physicalResourceId: cr.PhysicalResourceId.fromResponse('agent.agentId'),
      },
      onDelete: {
        service: 'BedrockAgent',
        action: 'deleteAgent',
        parameters: {
          agentId: new cr.PhysicalResourceIdReference(),
          skipResourceInUseCheck: true,
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:CreateAgent',
            'bedrock:UpdateAgent',
            'bedrock:DeleteAgent',
            'bedrock:GetAgent',
            'bedrock:ListAgents',
            // Also use bedrock-agent prefix (AWS SDK uses both service names)
            'bedrock-agent:CreateAgent',
            'bedrock-agent:UpdateAgent',
            'bedrock-agent:DeleteAgent',
            'bedrock-agent:GetAgent',
            'bedrock-agent:ListAgents',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [agentRole.roleArn],
        }),
      ]),
      installLatestAwsSdk: false, // Use runtime SDK to avoid extra time
      timeout: cdk.Duration.minutes(2), // Add timeout for IAM propagation
    });

    this.agentId = createAgent.getResponseField('agent.agentId');
    this.agentArn = createAgent.getResponseField('agent.agentArn');

    // Associate all Knowledge Bases with Agent
    const allKnowledgeBaseIds = [
      props.knowledgeBaseId,
      ...(props.additionalKnowledgeBaseIds || []),
    ];

    // Create Lambda function for KB association with explicit IAM permissions
    const associateKbLambda = new lambda.Function(this, 'AssociateKbFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'associate-kb.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda'), {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install --production --cache /tmp/npm-cache && cp -r /asset-input/* /asset-output/',
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
    });

    // Grant explicit Bedrock permissions
    associateKbLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:AssociateAgentKnowledgeBase',
          'bedrock:DisassociateAgentKnowledgeBase',
          'bedrock:GetAgentKnowledgeBase',
          'bedrock:ListAgentKnowledgeBases',
          'bedrock:GetAgent',
          'bedrock-agent:AssociateAgentKnowledgeBase',
          'bedrock-agent:DisassociateAgentKnowledgeBase',
          'bedrock-agent:GetAgentKnowledgeBase',
          'bedrock-agent:ListAgentKnowledgeBases',
          'bedrock-agent:GetAgent',
        ],
        resources: ['*'],
      })
    );

    // Create custom resource provider
    const associateKbProvider = new cr.Provider(this, 'AssociateKbProvider', {
      onEventHandler: associateKbLambda,
    });

    const kbAssociations = allKnowledgeBaseIds.map((kbId, index) => {
      const associateKb = new cdk.CustomResource(
        this,
        `AssociateKnowledgeBase-${index}`,
        {
          serviceToken: associateKbProvider.serviceToken,
          properties: {
            AgentId: this.agentId,
            KnowledgeBaseId: kbId,
            Description: index === 0 ? 'Primary knowledge base for RAG' : `Knowledge base ${index + 1} for RAG`,
          },
        }
      );

      associateKb.node.addDependency(createAgent);
      return associateKb;
    });

    // Prepare the agent (required before use)
    if (prepareAgent) {
      // Create Lambda function for PrepareAgent with retry logic
      const prepareAgentLambda = new lambda.Function(this, 'PrepareAgentFunction', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'prepare-agent.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../lambda'), {
          bundling: {
            image: lambda.Runtime.NODEJS_20_X.bundlingImage,
            command: [
              'bash',
              '-c',
              'npm install --production --cache /tmp/npm-cache && cp -r /asset-input/* /asset-output/',
            ],
          },
        }),
        timeout: cdk.Duration.minutes(10),
        environment: {
          AGENT_ID: this.agentId,
        },
      });

      // Grant PrepareAgent permission
      prepareAgentLambda.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:PrepareAgent',
            'bedrock:GetAgent',
            // Also use bedrock-agent prefix (AWS SDK uses both service names)
            'bedrock-agent:PrepareAgent',
            'bedrock-agent:GetAgent',
          ],
          resources: ['*'],
        })
      );

      // Create custom resource provider
      const prepareAgentProvider = new cr.Provider(this, 'PrepareAgentProvider', {
        onEventHandler: prepareAgentLambda,
      });

      // Create custom resource
      const prepareAgentResource = new cdk.CustomResource(this, 'PrepareAgentResource', {
        serviceToken: prepareAgentProvider.serviceToken,
        properties: {
          AgentId: this.agentId,
        },
      });

      // Depend on all KB associations
      kbAssociations.forEach((assoc) => {
        prepareAgentResource.node.addDependency(assoc);
      });

      // Explicitly depend on agent role to ensure IAM policies have propagated
      prepareAgentResource.node.addDependency(agentRole);

      // NOTE: Agent alias creation is DISABLED to avoid CDK AwsCustomResource permission issues
      // The alias is optional - agents can be invoked directly using agent ID
      // Users can manually create an alias via AWS Console or CLI if desired:
      // aws bedrock-agent create-agent-alias --agent-id <AGENT_ID> --agent-alias-name prod

      // Set alias IDs to undefined since we're not creating them
      this.agentAliasId = undefined;
      this.agentAliasArn = undefined;
    }

    // Outputs
    new cdk.CfnOutput(this, 'AgentIdOutput', {
      value: this.agentId,
      description: 'Bedrock Agent ID',
      exportName: `${cdk.Stack.of(this).stackName}-AgentId`,
    });

    new cdk.CfnOutput(this, 'AgentArnOutput', {
      value: this.agentArn,
      description: 'Bedrock Agent ARN',
    });
  }
}
