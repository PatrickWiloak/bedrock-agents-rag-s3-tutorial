# Step 2: Setting Up Infrastructure

In this step, you'll deploy the complete RAG infrastructure using AWS CDK.

## What We'll Deploy

- S3 bucket for document storage
- OpenSearch Serverless collection for vector storage
- Bedrock Knowledge Base with embeddings
- Bedrock Agent with knowledge base integration

## Project Structure Review

```
bedrock-agents-rag-s3-tutorial/
├── bin/
│   └── s3-rag-app.ts          # CDK app entry point
├── lib/
│   ├── s3-rag-stack.ts        # Main stack
│   ├── knowledge-base-construct.ts
│   └── bedrock-agent-construct.ts
└── cdk.json                    # CDK configuration
```

## Understanding the Stack

### Main Stack (`s3-rag-stack.ts`)

This is the orchestrator that creates all resources:

```typescript
export class S3VectorRAGStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Create S3 bucket
    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      // Configuration...
    });

    // 2. Create Knowledge Base
    const knowledgeBase = new KnowledgeBaseConstruct(this, 'KnowledgeBase', {
      dataBucket: dataBucket,
      // Configuration...
    });

    // 3. Create Agent
    const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
      knowledgeBaseId: knowledgeBase.knowledgeBaseId,
      // Configuration...
    });
  }
}
```

### Knowledge Base Construct

Creates the RAG pipeline:

**Key Components:**
1. OpenSearch Serverless collection
2. Security policies (encryption, network, data access)
3. Bedrock Knowledge Base
4. S3 Data Source
5. IAM roles and permissions

**Resource Flow:**
```
S3 Bucket → Data Source → Knowledge Base → Vector Store
```

### Agent Construct

Creates the conversational AI agent:

**Key Components:**
1. IAM role for agent
2. Agent configuration
3. Knowledge base association
4. Agent preparation
5. Production alias

## Customization Points

Before deploying, you can customize these settings:

### 1. S3 Bucket Name

In `lib/s3-rag-stack.ts`:

```typescript
const dataBucket = new s3.Bucket(this, 'DataBucket', {
  bucketName: `your-custom-name-${this.account}-${this.region}`,
  // ...
});
```

### 2. Knowledge Base Settings

```typescript
const knowledgeBase = new KnowledgeBaseConstruct(this, 'KnowledgeBase', {
  dataBucket: dataBucket,
  knowledgeBaseName: 'my-kb',
  embeddingModelId: 'amazon.titan-embed-text-v2:0',
  chunkSize: 300,        // Tokens per chunk
  chunkOverlap: 20,      // Overlap between chunks
});
```

**Chunk Size Guidelines:**
- **200-300**: Short, precise Q&A
- **400-600**: Balanced (recommended)
- **800-1000**: Long-form content

### 3. Agent Configuration

```typescript
const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
  agentName: 'my-agent',
  foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
  instruction: 'Your custom instructions...',
  idleSessionTTLInSeconds: 600,
});
```

**Model Options:**
```typescript
// Fast and cheap
'anthropic.claude-3-haiku-20240307-v1:0'

// Balanced (recommended)
'anthropic.claude-3-sonnet-20240229-v1:0'

// Most capable
'anthropic.claude-3-opus-20240229-v1:0'
```

### 4. Agent Instructions

Customize how your agent behaves:

```typescript
instruction: `You are a [ROLE].

Your responsibilities:
- [Task 1]
- [Task 2]
- [Task 3]

Response guidelines:
- [Guideline 1]
- [Guideline 2]

Tone: [formal/casual/technical]
`
```

## Deployment Steps

### Step 1: Install Dependencies

```bash
npm install
```

This installs:
- AWS CDK libraries
- AWS SDK v3 clients
- TypeScript and build tools

### Step 2: Configure AWS Credentials

Ensure your AWS CLI is configured:

```bash
aws configure
```

Or use environment variables:

```bash
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=us-east-1
```

### Step 3: Bootstrap CDK (First Time Only)

```bash
cdk bootstrap
```

This creates the CDK toolkit stack for asset storage.

**Expected Output:**
```
⏳ Bootstrapping environment aws://123456789012/us-east-1...
✅ Environment aws://123456789012/us-east-1 bootstrapped.
```

### Step 4: Review the Stack

Preview what will be created:

```bash
cdk synth
```

This generates CloudFormation template in `cdk.out/`.

### Step 5: Deploy

```bash
cdk deploy
```

**What happens:**
1. CDK synthesizes CloudFormation template
2. Shows you a summary of changes
3. Asks for confirmation
4. Creates resources in order
5. Outputs important values

**Expected Duration:** 5-10 minutes

**Progress Output:**
```
S3VectorRAGStack: deploying...
S3VectorRAGStack: creating CloudFormation changeset...

✅ S3VectorRAGStack

Outputs:
S3VectorRAGStack.DataBucketName = bedrock-rag-docs-123456789012-us-east-1
S3VectorRAGStack.AgentIdOutput = AGENT123ABC
S3VectorRAGStack.KnowledgeBaseIdOutput = KB456DEF
S3VectorRAGStack.Region = us-east-1
```

### Step 6: Save the Outputs

Keep these values - you'll need them:
- `DataBucketName`: For uploading documents
- `AgentIdOutput`: For invoking the agent
- `KnowledgeBaseIdOutput`: For managing the KB

## Understanding IAM Roles

The stack creates several IAM roles:

### Knowledge Base Role

Permissions:
- Read from S3 bucket
- Invoke embedding model
- Write to OpenSearch collection

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:ListBucket",
    "bedrock:InvokeModel",
    "aoss:APIAccessAll"
  ]
}
```

### Agent Role

Permissions:
- Invoke foundation model
- Retrieve from knowledge base

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:Retrieve"
  ]
}
```

## OpenSearch Serverless

### Collection Configuration

```typescript
new opensearchserverless.CfnCollection(this, 'VectorCollection', {
  name: 'rag-tutorial-kb-vectors',
  type: 'VECTORSEARCH',
});
```

**Key Features:**
- Automatic scaling
- No server management
- Pay per use (OCU-based)
- Built-in security

### Security Policies

**1. Encryption Policy:**
```json
{
  "Rules": [{
    "ResourceType": "collection",
    "Resource": ["collection/rag-tutorial-kb-*"]
  }],
  "AWSOwnedKey": true
}
```

**2. Network Policy:**
```json
{
  "Rules": [{
    "ResourceType": "collection",
    "Resource": ["collection/rag-tutorial-kb-*"]
  }],
  "AllowFromPublic": true
}
```

**3. Data Access Policy:**
Grants Knowledge Base role access to create/read vectors.

## Verifying Deployment

### Check Stack Status

```bash
aws cloudformation describe-stacks \
  --stack-name S3VectorRAGStack \
  --query 'Stacks[0].StackStatus'
```

Expected: `"CREATE_COMPLETE"`

### List Resources

```bash
aws cloudformation list-stack-resources \
  --stack-name S3VectorRAGStack
```

### Check Agent Status

```bash
aws bedrock-agent get-agent \
  --agent-id <AGENT_ID>
```

Expected: `"agentStatus": "PREPARED"`

### Check Knowledge Base

```bash
aws bedrock-agent get-knowledge-base \
  --knowledge-base-id <KB_ID>
```

## Troubleshooting

### Error: "Model access not enabled"

**Solution:**
1. Go to AWS Console → Bedrock
2. Navigate to "Model access"
3. Enable Claude 3 Sonnet and Titan Embeddings
4. Wait for approval (usually instant)
5. Redeploy: `cdk deploy`

### Error: "Rate exceeded"

**Solution:**
Wait a few minutes and retry. Bedrock has rate limits during deployment.

### Error: "Stack already exists"

**Solution:**
```bash
cdk destroy
cdk deploy
```

### Error: "Insufficient permissions"

**Solution:**
Ensure your AWS user has these permissions:
- CloudFormation full access
- S3 full access
- Bedrock full access
- OpenSearch Serverless full access
- IAM role creation

## Cost Implications

### What You're Paying For

1. **OpenSearch Serverless**: ~$0.24/hour per OCU
   - Minimum 2 OCUs for vector search
   - ~$350/month if running 24/7

2. **S3**: ~$0.023/GB/month
   - Minimal for tutorial

3. **Bedrock**: Pay per use
   - Knowledge Base ingestion: ~$0.10 per 10K chunks
   - Agent invocations: Per token pricing

**Tutorial Cost:** ~$10-20 if you destroy resources after testing.

### Cost Optimization

```bash
# Destroy when not in use
cdk destroy

# Or pause OpenSearch collection (not supported in CDK, manual only)
```

## What We Created

Let's review:

✅ **S3 Bucket** - Stores your documents
✅ **OpenSearch Collection** - Vector database
✅ **Knowledge Base** - RAG orchestration
✅ **Data Source** - Links S3 to KB
✅ **Bedrock Agent** - Conversational AI
✅ **IAM Roles** - Secure permissions
✅ **Security Policies** - Network & encryption

## Next Steps

Now that infrastructure is deployed, let's add some data!

→ Continue to [Step 3: Creating Your First Agent](03-first-agent.md)

## Additional Resources

- [CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [OpenSearch Serverless](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless.html)
- [Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
