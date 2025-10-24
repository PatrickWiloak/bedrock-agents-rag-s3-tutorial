# Step 6: Advanced Customization

Explore advanced features including custom tools, API Gateway integration, Lambda functions, and production-ready patterns.

## Custom Action Groups

Action Groups let your agent execute custom code via Lambda functions.

### Use Cases

- **Database queries**: Fetch real-time data
- **API calls**: Integrate external services
- **Calculations**: Perform complex computations
- **Workflows**: Trigger business processes

### Architecture

```
User Query → Agent → Action Decision → Lambda → Response
                ↓                        ↓
         Knowledge Base              Database/API
```

### Creating a Custom Tool

#### 1. Define the Lambda Function

```typescript
// lambda/custom-tool/index.ts
export const handler = async (event: any) => {
  const { actionGroup, function: functionName, parameters } = event;

  console.log('Action invoked:', functionName);
  console.log('Parameters:', parameters);

  // Example: Get current pricing
  if (functionName === 'get_pricing') {
    const tier = parameters.find(p => p.name === 'tier')?.value || 'basic';

    const pricing = {
      basic: 10,
      pro: 50,
      enterprise: 200
    };

    return {
      response: {
        actionGroup,
        function: functionName,
        functionResponse: {
          responseBody: {
            TEXT: {
              body: JSON.stringify({
                tier,
                price: pricing[tier],
                currency: 'USD'
              })
            }
          }
        }
      }
    };
  }

  // Example: Check service status
  if (functionName === 'check_status') {
    const service = parameters.find(p => p.name === 'service')?.value;

    return {
      response: {
        actionGroup,
        function: functionName,
        functionResponse: {
          responseBody: {
            TEXT: {
              body: JSON.stringify({
                service,
                status: 'operational',
                uptime: '99.9%'
              })
            }
          }
        }
      }
    };
  }

  throw new Error(`Unknown function: ${functionName}`);
};
```

#### 2. Add Lambda to CDK Stack

```typescript
// lib/s3-rag-stack.ts
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';

// Create Lambda function
const actionLambda = new nodejs.NodejsFunction(this, 'ActionLambda', {
  entry: path.join(__dirname, '../lambda/custom-tool/index.ts'),
  handler: 'handler',
  runtime: lambda.Runtime.NODEJS_18_X,
  timeout: cdk.Duration.seconds(30),
  environment: {
    // Add any config
  }
});

// Grant agent permission to invoke Lambda
actionLambda.grantInvoke(
  new iam.ServicePrincipal('bedrock.amazonaws.com')
);
```

#### 3. Define OpenAPI Schema

```typescript
// lib/action-schema.ts
export const actionGroupSchema = {
  openapi: '3.0.0',
  info: {
    title: 'Custom Actions API',
    version: '1.0.0',
    description: 'Custom tools for the RAG agent'
  },
  paths: {
    '/get_pricing': {
      post: {
        description: 'Get pricing information for a specific tier',
        operationId: 'get_pricing',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  tier: {
                    type: 'string',
                    description: 'The pricing tier (basic, pro, enterprise)',
                    enum: ['basic', 'pro', 'enterprise']
                  }
                },
                required: ['tier']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tier: { type: 'string' },
                    price: { type: 'number' },
                    currency: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/check_status': {
      post: {
        description: 'Check the operational status of a service',
        operationId: 'check_status',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  service: {
                    type: 'string',
                    description: 'The service name to check'
                  }
                },
                required: ['service']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Successful response'
          }
        }
      }
    }
  }
};
```

#### 4. Create Action Group

```typescript
// In bedrock-agent-construct.ts or stack
const createActionGroup = new cr.AwsCustomResource(this, 'CreateActionGroup', {
  onCreate: {
    service: 'BedrockAgent',
    action: 'createAgentActionGroup',
    parameters: {
      agentId: agent.agentId,
      agentVersion: 'DRAFT',
      actionGroupName: 'custom-tools',
      actionGroupExecutor: {
        lambda: actionLambda.functionArn
      },
      apiSchema: {
        payload: JSON.stringify(actionGroupSchema)
      },
      description: 'Custom tools for pricing and status checks'
    }
  },
  onDelete: {
    service: 'BedrockAgent',
    action: 'deleteAgentActionGroup',
    parameters: {
      agentId: agent.agentId,
      agentVersion: 'DRAFT',
      actionGroupId: new cr.PhysicalResourceIdReference()
    }
  },
  policy: cr.AwsCustomResourcePolicy.fromStatements([
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:CreateAgentActionGroup',
        'bedrock:DeleteAgentActionGroup'
      ],
      resources: ['*']
    })
  ])
});
```

#### 5. Update Agent Instructions

```typescript
instruction: `You are a helpful assistant with access to:

1. Knowledge base - for documentation and guides
2. Custom tools:
   - get_pricing(tier): Get pricing for a tier
   - check_status(service): Check service status

When users ask about pricing or status, use the appropriate tool.

Example:
User: "How much does the Pro plan cost?"
You: [Use get_pricing tool with tier="pro"]
     "The Pro plan costs $50 USD per month."
`
```

### Testing Custom Tools

```bash
# Redeploy with new action group
cdk deploy

# Test pricing query
npm run test-agent

# Ask: "What's the price for enterprise?"
# Agent should invoke Lambda and return: "$200 USD"
```

## API Gateway Integration

Expose your agent via REST API.

### Architecture

```
Client → API Gateway → Lambda → Bedrock Agent → Response
                         ↓
                   DynamoDB (sessions)
```

### Implementation

#### 1. Create API Lambda

```typescript
// lambda/api/index.ts
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand
} from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const bedrockClient = new BedrockAgentRuntimeClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const AGENT_ID = process.env.AGENT_ID!;
const ALIAS_ID = process.env.ALIAS_ID!;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE!;

export const handler = async (event: any) => {
  const body = JSON.parse(event.body);
  const { message, userId } = body;

  if (!message || !userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing message or userId' })
    };
  }

  // Get or create session
  let sessionId = await getSession(userId);
  if (!sessionId) {
    sessionId = `session-${userId}-${Date.now()}`;
    await saveSession(userId, sessionId);
  }

  // Invoke agent
  try {
    const response = await bedrockClient.send(new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: ALIAS_ID,
      sessionId,
      inputText: message
    }));

    let fullResponse = '';
    const citations = [];

    for await (const event of response.completion) {
      if (event.chunk?.bytes) {
        fullResponse += new TextDecoder().decode(event.chunk.bytes);
      }
      if (event.chunk?.attribution?.citations) {
        citations.push(...event.chunk.attribution.citations);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        response: fullResponse,
        citations,
        sessionId
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

async function getSession(userId: string): Promise<string | null> {
  const result = await dynamoClient.send(new GetCommand({
    TableName: SESSIONS_TABLE,
    Key: { userId }
  }));
  return result.Item?.sessionId || null;
}

async function saveSession(userId: string, sessionId: string): Promise<void> {
  await dynamoClient.send(new PutCommand({
    TableName: SESSIONS_TABLE,
    Item: {
      userId,
      sessionId,
      createdAt: new Date().toISOString()
    }
  }));
}
```

#### 2. Add API to CDK Stack

```typescript
// lib/s3-rag-stack.ts
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

// Create sessions table
const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.DESTROY
});

// Create API Lambda
const apiLambda = new nodejs.NodejsFunction(this, 'ApiLambda', {
  entry: path.join(__dirname, '../lambda/api/index.ts'),
  handler: 'handler',
  runtime: lambda.Runtime.NODEJS_18_X,
  timeout: cdk.Duration.seconds(60),
  environment: {
    AGENT_ID: agent.agentId,
    ALIAS_ID: agent.agentAliasId!,
    SESSIONS_TABLE: sessionsTable.tableName
  }
});

// Grant permissions
sessionsTable.grantReadWriteData(apiLambda);
apiLambda.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['bedrock:InvokeAgent'],
  resources: [agent.agentArn]
}));

// Create API Gateway
const api = new apigateway.RestApi(this, 'AgentApi', {
  restApiName: 'RAG Agent API',
  description: 'API for RAG agent',
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS
  }
});

const chat = api.root.addResource('chat');
chat.addMethod('POST', new apigateway.LambdaIntegration(apiLambda));

// Output API endpoint
new cdk.CfnOutput(this, 'ApiEndpoint', {
  value: api.url,
  description: 'API Gateway endpoint'
});
```

#### 3. Client Usage

```typescript
// Frontend client
async function chatWithAgent(message: string, userId: string) {
  const response = await fetch('https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      userId
    })
  });

  const data = await response.json();
  return data;
}

// Usage
const result = await chatWithAgent('What is RAG?', 'user-123');
console.log(result.response);
console.log(result.citations);
```

## Guardrails

Add content filtering and safety controls.

### Creating Guardrails

```typescript
// lib/guardrails-construct.ts
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

export class GuardrailsConstruct extends Construct {
  public readonly guardrailId: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      name: 'rag-agent-guardrail',
      description: 'Content filtering for RAG agent',
      blockedInputMessaging: 'I cannot process that type of request.',
      blockedOutputsMessaging: 'I cannot provide that information.',

      // Content filters
      contentPolicyConfig: {
        filtersConfig: [
          {
            type: 'SEXUAL',
            inputStrength: 'HIGH',
            outputStrength: 'HIGH'
          },
          {
            type: 'VIOLENCE',
            inputStrength: 'HIGH',
            outputStrength: 'HIGH'
          },
          {
            type: 'HATE',
            inputStrength: 'HIGH',
            outputStrength: 'HIGH'
          },
          {
            type: 'INSULTS',
            inputStrength: 'MEDIUM',
            outputStrength: 'MEDIUM'
          },
          {
            type: 'MISCONDUCT',
            inputStrength: 'MEDIUM',
            outputStrength: 'MEDIUM'
          },
          {
            type: 'PROMPT_ATTACK',
            inputStrength: 'HIGH',
            outputStrength: 'NONE'
          }
        ]
      },

      // Topic filters
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'financial-advice',
            definition: 'Requests for financial or investment advice',
            examples: [
              'Should I invest in stocks?',
              'What should I do with my money?'
            ],
            type: 'DENY'
          },
          {
            name: 'medical-advice',
            definition: 'Requests for medical diagnosis or treatment advice',
            examples: [
              'Do I have cancer?',
              'What medication should I take?'
            ],
            type: 'DENY'
          }
        ]
      },

      // Word filters
      wordPolicyConfig: {
        wordsConfig: [
          { text: 'example-blocked-word' }
        ],
        managedWordListsConfig: [
          { type: 'PROFANITY' }
        ]
      },

      // PII redaction
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          {
            type: 'EMAIL',
            action: 'ANONYMIZE'
          },
          {
            type: 'PHONE',
            action: 'ANONYMIZE'
          },
          {
            type: 'CREDIT_DEBIT_CARD_NUMBER',
            action: 'BLOCK'
          },
          {
            type: 'US_SOCIAL_SECURITY_NUMBER',
            action: 'BLOCK'
          }
        ]
      }
    });

    this.guardrailId = guardrail.attrGuardrailId;
  }
}
```

### Attach to Agent

```typescript
// In agent construct
const guardrail = new GuardrailsConstruct(this, 'Guardrails');

// Associate with agent (via custom resource)
const attachGuardrail = new cr.AwsCustomResource(this, 'AttachGuardrail', {
  onCreate: {
    service: 'BedrockAgent',
    action: 'updateAgent',
    parameters: {
      agentId: this.agentId,
      guardrailConfiguration: {
        guardrailIdentifier: guardrail.guardrailId,
        guardrailVersion: 'DRAFT'
      }
    }
  }
});
```

## Streaming with WebSockets

Real-time streaming for better UX.

### Architecture

```
Client ←WebSocket→ API Gateway WebSocket → Lambda → Bedrock Agent
                                              ↓
                                      Stream chunks back
```

### Implementation

```typescript
// lambda/websocket/index.ts
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from '@aws-sdk/client-apigatewaymanagementapi';

export const handler = async (event: any) => {
  const { requestContext, body } = event;
  const { connectionId, domainName, stage } = requestContext;

  const apiGwClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`
  });

  const { message } = JSON.parse(body);

  // Invoke agent with streaming
  const response = await bedrockClient.send(new InvokeAgentCommand({
    agentId: AGENT_ID,
    agentAliasId: ALIAS_ID,
    sessionId: connectionId,
    inputText: message
  }));

  // Stream chunks to client
  for await (const event of response.completion) {
    if (event.chunk?.bytes) {
      const text = new TextDecoder().decode(event.chunk.bytes);

      await apiGwClient.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({ type: 'chunk', data: text })
      }));
    }
  }

  // Send completion
  await apiGwClient.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify({ type: 'complete' })
  }));

  return { statusCode: 200, body: 'Message sent' };
};
```

## Multi-Modal RAG

Support images and other media types.

### PDF Processing

```typescript
// lambda/pdf-processor/index.ts
import { PDFDocument } from 'pdf-lib';
import * as pdfParse from 'pdf-parse';

export const handler = async (event: any) => {
  const { s3 } = event.Records[0];
  const bucket = s3.bucket.name;
  const key = s3.object.key;

  // Download PDF
  const pdfBuffer = await s3Client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key
  }));

  // Extract text
  const data = await pdfParse(pdfBuffer.Body);

  // Upload as text for ingestion
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key.replace('.pdf', '.txt'),
    Body: data.text,
    Metadata: {
      'source-document': key,
      'page-count': data.numpages.toString()
    }
  }));
};
```

## Advanced Patterns

### Pattern 1: Multi-Agent System

```typescript
// Different agents for different domains
const supportAgent = new BedrockAgentConstruct(this, 'SupportAgent', {
  agentName: 'support-agent',
  knowledgeBaseId: supportKB.knowledgeBaseId,
  instruction: 'You handle customer support...'
});

const technicalAgent = new BedrockAgentConstruct(this, 'TechnicalAgent', {
  agentName: 'technical-agent',
  knowledgeBaseId: technicalKB.knowledgeBaseId,
  instruction: 'You handle technical questions...'
});

// Router lambda decides which agent to use
```

### Pattern 2: Hybrid Search

```typescript
// Combine vector search with keyword search
async function hybridSearch(query: string) {
  // Vector search
  const vectorResults = await bedrockRuntime.retrieve({
    knowledgeBaseId: KB_ID,
    retrievalQuery: { text: query },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: 5,
        overrideSearchType: 'SEMANTIC'
      }
    }
  });

  // Keyword search (OpenSearch)
  const keywordResults = await opensearch.search({
    index: 'documents',
    body: {
      query: {
        match: { content: query }
      }
    }
  });

  // Merge and re-rank
  return mergeResults(vectorResults, keywordResults);
}
```

### Pattern 3: Feedback Loop

```typescript
// Collect user feedback
interface Feedback {
  sessionId: string;
  query: string;
  response: string;
  rating: number;
  comment?: string;
}

async function saveFeedback(feedback: Feedback) {
  await dynamodb.putItem({
    TableName: 'AgentFeedback',
    Item: feedback
  });

  // Trigger retraining if rating < 3
  if (feedback.rating < 3) {
    await sqs.sendMessage({
      QueueUrl: REVIEW_QUEUE_URL,
      MessageBody: JSON.stringify(feedback)
    });
  }
}
```

## Summary

You've learned:

✅ Custom action groups with Lambda
✅ API Gateway integration
✅ Guardrails for safety
✅ WebSocket streaming
✅ Multi-modal RAG
✅ Advanced patterns

## Resources

- [Bedrock Agents Developer Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [Action Groups Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-action.html)
- [Guardrails Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html)
- [API Gateway WebSocket](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html)

## Congratulations!

You've completed the S3 RAG with Amazon Bedrock Agents tutorial! You now have the knowledge to build production-ready RAG systems.

**What's Next?**
- Build your own RAG application
- Experiment with different models
- Integrate with your existing systems
- Share your learnings with the community

Happy building!
