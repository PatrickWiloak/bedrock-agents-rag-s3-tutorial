# Customization Guide

## Customizing Your RAG Agent

This guide covers all the ways you can customize your Bedrock agent to fit your specific use case.

## 1. Agent Instructions

The agent's instruction defines its personality and behavior. You can customize this in `lib/s3-rag-stack.ts`:

```typescript
const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
  instruction: `Your custom instructions here...`,
});
```

### Instruction Best Practices

- **Be specific** about the agent's role
- **Define boundaries** for what it should/shouldn't do
- **Include examples** of good responses
- **Set the tone** (formal, casual, technical, etc.)
- **Specify format** (bullet points, paragraphs, etc.)

### Example: Technical Support Agent

```
You are a technical support specialist for our SaaS product.

Your role:
- Answer questions using our documentation
- Provide step-by-step troubleshooting
- Escalate complex issues appropriately

Response format:
- Start with a brief summary
- Provide detailed steps
- Include relevant links when available

Tone: Professional but friendly
```

## 2. Foundation Model Selection

Choose the right model for your needs:

### Available Models

- **Claude 3 Sonnet**: Balance of performance and cost
- **Claude 3 Haiku**: Fast, cost-effective
- **Claude 3 Opus**: Most capable, higher cost

Update in the stack:

```typescript
foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0'
```

## 3. Document Chunking Strategy

Customize how documents are split for embedding:

```typescript
const knowledgeBase = new KnowledgeBaseConstruct(this, 'KnowledgeBase', {
  chunkSize: 500,      // Larger chunks = more context
  chunkOverlap: 50,    // More overlap = better continuity
});
```

### Chunk Size Guidelines

- **Small (200-300)**: Good for Q&A, definitions
- **Medium (400-600)**: Balanced approach
- **Large (800-1000)**: Better for complex topics

## 4. Embedding Model

Choose the embedding model:

```typescript
embeddingModelId: 'amazon.titan-embed-text-v2:0'
// or
embeddingModelId: 'cohere.embed-english-v3'
```

## 5. Knowledge Base Configuration

### Retrieval Settings

Control how many chunks are retrieved (configured at runtime):

```python
response = agent.invoke(
    input="Your question",
    retrievalConfiguration={
        'numberOfResults': 5,
        'searchType': 'HYBRID'  # or 'SEMANTIC'
    }
)
```

### Metadata Filtering

Add metadata to documents and filter during retrieval:

```json
{
  "metadataAttributes": {
    "category": "api-docs",
    "version": "2.0"
  }
}
```

## 6. Session Configuration

Adjust session timeout:

```typescript
idleSessionTTLInSeconds: 1200  // 20 minutes
```

## 7. Guardrails

Add content filtering and safety controls:

```typescript
// Create a guardrail
const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
  blockedInputMessaging: 'I cannot process that request.',
  blockedOutputsMessaging: 'I cannot provide that information.',
  contentPolicyConfig: {
    filtersConfig: [{
      type: 'HATE',
      inputStrength: 'HIGH',
      outputStrength: 'HIGH'
    }]
  }
});
```

## 8. Custom Tools (Advanced)

Add Lambda functions as tools for the agent:

```typescript
// Define action group with Lambda
const actionGroup = {
  actionGroupName: 'custom-actions',
  actionGroupExecutor: {
    lambda: myLambdaFunction.functionArn
  },
  apiSchema: {
    // OpenAPI schema
  }
};
```

## 9. Response Customization

### Agent Response Configuration

Configure your agent responses:

```typescript
// In your client code
const response = await bedrockRuntime.invokeAgentWithResponseStream({
  agentId: agentId,
  agentAliasId: aliasId,
  sessionId: sessionId,
  inputText: question
});

for await (const event of response.completion) {
  if (event.chunk) {
    process.stdout.write(event.chunk.bytes);
  }
}
```

## 10. Multi-Turn Conversations

Maintain context across multiple queries:

```typescript
const sessionId = 'unique-session-id';

// First query
await invokeAgent(agentId, aliasId, sessionId, "What is RAG?");

// Follow-up query with context
await invokeAgent(agentId, aliasId, sessionId, "How do I implement it?");
```

## Common Customization Scenarios

### Scenario 1: Customer Support Bot

```typescript
instruction: `You are a customer support agent.
- Always be empathetic and professional
- Search knowledge base for solutions
- If issue is not in KB, offer to escalate
- Never make up information`

chunkSize: 400
model: 'claude-3-sonnet'
```

### Scenario 2: Technical Documentation Assistant

```typescript
instruction: `You are a technical documentation expert.
- Provide accurate, detailed technical information
- Include code examples when relevant
- Cite specific sections of documentation
- Use technical terminology appropriately`

chunkSize: 600
model: 'claude-3-opus'
```

### Scenario 3: FAQ Bot

```typescript
instruction: `You answer frequently asked questions.
- Keep responses concise
- Provide links when available
- If question is not in FAQ, say so clearly`

chunkSize: 200
model: 'claude-3-haiku'
```

## Testing Your Customizations

After making changes:

1. Redeploy: `cdk deploy`
2. If agent instructions changed: Agent is auto-prepared
3. If chunking changed: Re-run ingestion
4. Test: `npm run test-agent`

## Performance Tuning

### For faster responses:
- Use Claude Haiku
- Reduce chunk size
- Limit number of retrieved results

### For better quality:
- Use Claude Opus
- Increase chunk size and overlap
- Retrieve more results
- Add metadata filtering

## Cost Optimization

- **Model selection**: Haiku costs ~1/5 of Opus
- **Chunk size**: Smaller chunks = more storage = higher cost
- **Retrieval**: Fewer results = lower cost
- **Session timeout**: Shorter = less memory cost

## Next Steps

- Review the [API Reference](api-reference.md)
- Explore [Advanced Features](advanced-features.md)
- Check out [Best Practices](best-practices.md)
