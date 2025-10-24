# API Reference

## Bedrock Agent Runtime API

This reference covers the key APIs for interacting with your deployed RAG agent.

## InvokeAgent

Invoke the agent for a single query.

### Request

```typescript
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

const response = await client.send(new InvokeAgentCommand({
  agentId: 'AGENT_ID',
  agentAliasId: 'ALIAS_ID',
  sessionId: 'unique-session-id',
  inputText: 'What is RAG?'
}));
```

### Response

```json
{
  "completion": {
    "output": "RAG stands for Retrieval-Augmented Generation...",
    "sessionId": "unique-session-id",
    "citations": [
      {
        "retrievedReferences": [
          {
            "location": {
              "s3Location": {
                "uri": "s3://bucket/doc.pdf"
              }
            },
            "content": {
              "text": "Retrieved chunk text..."
            }
          }
        ]
      }
    ]
  }
}
```

## InvokeAgent

Get responses from your Bedrock Agent.

### Request

```typescript
const response = await client.send(new InvokeAgentCommand({
  agentId: 'AGENT_ID',
  agentAliasId: 'ALIAS_ID',
  sessionId: 'session-123',
  inputText: 'Explain RAG in detail',
  enableTrace: true  // Optional: see agent's reasoning
}));

for await (const event of response.completion) {
  if (event.chunk) {
    const text = new TextDecoder().decode(event.chunk.bytes);
    process.stdout.write(text);
  }

  if (event.trace) {
    console.log('Trace:', JSON.stringify(event.trace, null, 2));
  }
}
```

### Event Types

#### Chunk Event
Contains partial response text.

```json
{
  "chunk": {
    "bytes": "VGV4dCBjaHVuaw==",
    "attribution": {
      "citations": [...]
    }
  }
}
```

#### Trace Event
Shows agent's reasoning and retrieval.

```json
{
  "trace": {
    "orchestrationTrace": {
      "invocationInput": {
        "knowledgeBaseLookupInput": {
          "text": "RAG",
          "knowledgeBaseId": "KB_ID"
        }
      },
      "observation": {
        "knowledgeBaseLookupOutput": {
          "retrievedReferences": [...]
        }
      }
    }
  }
}
```

## Knowledge Base APIs

### StartIngestionJob

Ingest documents into the knowledge base.

```typescript
import { BedrockAgentClient, StartIngestionJobCommand } from '@aws-sdk/client-bedrock-agent';

const client = new BedrockAgentClient({ region: 'us-east-1' });

const response = await client.send(new StartIngestionJobCommand({
  knowledgeBaseId: 'KB_ID',
  dataSourceId: 'DS_ID',
  description: 'Ingesting new documents'
}));

console.log('Ingestion Job ID:', response.ingestionJob.ingestionJobId);
```

### GetIngestionJob

Check ingestion status.

```typescript
const status = await client.send(new GetIngestionJobCommand({
  knowledgeBaseId: 'KB_ID',
  dataSourceId: 'DS_ID',
  ingestionJobId: 'JOB_ID'
}));

console.log('Status:', status.ingestionJob.status);
// STARTING, IN_PROGRESS, COMPLETE, FAILED
```

### Retrieve

Query the knowledge base directly (without agent).

```typescript
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const response = await client.send(new RetrieveCommand({
  knowledgeBaseId: 'KB_ID',
  retrievalQuery: {
    text: 'What is chunking?'
  },
  retrievalConfiguration: {
    vectorSearchConfiguration: {
      numberOfResults: 5,
      overrideSearchType: 'HYBRID'  // HYBRID or SEMANTIC
    }
  }
}));

for (const result of response.retrievalResults) {
  console.log('Score:', result.score);
  console.log('Content:', result.content.text);
  console.log('Location:', result.location.s3Location.uri);
}
```

## Agent Management APIs

### PrepareAgent

Prepare agent after configuration changes.

```typescript
import { BedrockAgentClient, PrepareAgentCommand } from '@aws-sdk/client-bedrock-agent';

const response = await client.send(new PrepareAgentCommand({
  agentId: 'AGENT_ID'
}));

console.log('Agent Status:', response.agentStatus);
```

### UpdateAgent

Update agent configuration.

```typescript
const response = await client.send(new UpdateAgentCommand({
  agentId: 'AGENT_ID',
  agentName: 'My Updated Agent',
  instruction: 'New instructions...',
  foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
  idleSessionTTLInSeconds: 900
}));
```

## Session Management

### Session Attributes

Pass metadata with each request:

```typescript
const response = await client.send(new InvokeAgentCommand({
  agentId: 'AGENT_ID',
  agentAliasId: 'ALIAS_ID',
  sessionId: 'session-123',
  inputText: 'Hello',
  sessionState: {
    sessionAttributes: {
      userId: 'user-456',
      context: 'support'
    }
  }
}));
```

### Prompt Session Attributes

Override prompt variables:

```typescript
sessionState: {
  promptSessionAttributes: {
    userName: 'Alice',
    accountType: 'premium'
  }
}
```

## Error Handling

### Common Errors

#### ValidationException
Invalid parameters or configuration.

```typescript
try {
  await client.send(command);
} catch (error) {
  if (error.name === 'ValidationException') {
    console.error('Invalid input:', error.message);
  }
}
```

#### ThrottlingException
Rate limit exceeded.

```typescript
if (error.name === 'ThrottlingException') {
  // Implement exponential backoff
  await sleep(1000 * Math.pow(2, retryCount));
}
```

#### ResourceNotFoundException
Agent or KB doesn't exist.

```typescript
if (error.name === 'ResourceNotFoundException') {
  console.error('Resource not found. Check IDs.');
}
```

## Rate Limits

### Agent Invocation
- Transactions per second: 25 (default)
- Can request increase via AWS Support

### Knowledge Base Ingestion
- Concurrent jobs per KB: 1
- Documents per job: 10,000

## Best Practices

### 1. Session ID Management

```typescript
// Generate unique session per user conversation
const sessionId = `${userId}-${Date.now()}`;

// Reuse for multi-turn conversation
const sessionId = `${userId}-${conversationId}`;
```

### 2. Error Retry Logic

```typescript
async function invokeWithRetry(command, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.send(command);
    } catch (error) {
      if (error.name === 'ThrottlingException' && i < maxRetries - 1) {
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
      throw error;
    }
  }
}
```

### 3. Streaming Response Handling

```typescript
async function streamResponse(agentId, aliasId, sessionId, query) {
  const response = await client.send(new InvokeAgentCommand({
    agentId,
    agentAliasId: aliasId,
    sessionId,
    inputText: query
  }));

  let fullResponse = '';
  const citations = [];

  for await (const event of response.completion) {
    if (event.chunk) {
      const text = new TextDecoder().decode(event.chunk.bytes);
      fullResponse += text;
      process.stdout.write(text);

      if (event.chunk.attribution?.citations) {
        citations.push(...event.chunk.attribution.citations);
      }
    }
  }

  return { fullResponse, citations };
}
```

### 4. Citation Handling

```typescript
function formatCitations(citations) {
  const sources = new Set();

  for (const citation of citations) {
    for (const ref of citation.retrievedReferences || []) {
      if (ref.location?.s3Location) {
        sources.add(ref.location.s3Location.uri);
      }
    }
  }

  return Array.from(sources);
}
```

## Code Examples

### Complete Example: Multi-Turn Chat

```typescript
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

class AgentChat {
  private client: BedrockAgentRuntimeClient;
  private agentId: string;
  private aliasId: string;
  private sessionId: string;

  constructor(agentId: string, aliasId: string, region: string = 'us-east-1') {
    this.client = new BedrockAgentRuntimeClient({ region });
    this.agentId = agentId;
    this.aliasId = aliasId;
    this.sessionId = `session-${Date.now()}`;
  }

  async sendMessage(message: string): Promise<string> {
    const response = await this.client.send(new InvokeAgentCommand({
      agentId: this.agentId,
      agentAliasId: this.aliasId,
      sessionId: this.sessionId,
      inputText: message,
      enableTrace: false
    }));

    let result = '';
    for await (const event of response.completion) {
      if (event.chunk?.bytes) {
        result += new TextDecoder().decode(event.chunk.bytes);
      }
    }

    return result;
  }
}

// Usage
const chat = new AgentChat('AGENT_ID', 'ALIAS_ID');
console.log(await chat.sendMessage('What is RAG?'));
console.log(await chat.sendMessage('How do I implement it?'));
```

## Related Resources

- [AWS Bedrock Agent Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [SDK Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-bedrock-agent-runtime/)
- [Streaming API Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-streaming.html)
