# Step 4: Customizing Your Agent

Learn how to tailor your RAG agent to your specific use case through various customization options.

## Agent Personality & Instructions

The agent's instruction is its "system prompt" - defining its role, capabilities, and constraints.

### Basic Template

```typescript
instruction: `You are a [ROLE].

Capabilities:
- [What it can do]
- [What resources it has access to]

Responsibilities:
- [Primary task 1]
- [Primary task 2]

Guidelines:
- [How to respond]
- [What to avoid]
- [When to escalate]

Response format: [Structure of answers]
Tone: [Formal/Casual/Technical]
`
```

### Example 1: Customer Support Bot

```typescript
const agent = new BedrockAgentConstruct(this, 'SupportAgent', {
  agentName: 'customer-support-agent',
  instruction: `You are a customer support specialist for TechCorp's SaaS platform.

**Your Knowledge Base:**
You have access to our complete product documentation, FAQs, and troubleshooting guides.

**Your Role:**
- Help customers resolve issues quickly
- Provide clear, step-by-step instructions
- Escalate complex technical issues
- Never make promises about features or timelines

**Response Guidelines:**
1. Always search the knowledge base first
2. If found: Provide detailed answer with steps
3. If not found: "I don't have information about that. Let me connect you with our technical team."
4. Include relevant links when available
5. Ask clarifying questions if needed

**Response Format:**
- Start with a brief summary
- Provide numbered steps for procedures
- End with "Is there anything else I can help you with?"

**Tone:** Professional but warm and empathetic
`,
  foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
});
```

### Example 2: Technical Documentation Assistant

```typescript
instruction: `You are a technical documentation expert for our API platform.

**Your Expertise:**
- API endpoints and parameters
- Authentication methods
- Code examples
- Error messages and troubleshooting

**Response Style:**
- Precise and technical
- Include code snippets when relevant
- Cite specific API versions
- Provide working examples

**Format:**
\`\`\`
## [Topic]
**Description:** [Brief explanation]
**Example:**
[Code block]
**Parameters:**
- param1: [description]
\`\`\`

**Tone:** Technical and authoritative
`,
  foundationModel: 'anthropic.claude-3-opus-20240229-v1:0',
});
```

### Example 3: Internal Knowledge Assistant

```typescript
instruction: `You are the company knowledge assistant.

**Your Purpose:**
Help employees quickly find information from:
- Company policies
- HR guidelines
- IT procedures
- Office information

**Boundaries:**
- Only answer from documented policies
- For sensitive HR matters: "Please contact HR directly at hr@company.com"
- For IT issues requiring access: "Please submit a ticket at support.company.com"
- Never speculate on policy changes

**Response Format:**
- Quote relevant policy sections
- Provide policy document names
- Include last updated dates when available

**Tone:** Helpful and neutral
`,
  foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0',
});
```

## Foundation Model Selection

Choose based on your requirements:

### Performance Comparison

| Model | Use Case | Latency | Cost | Quality |
|-------|----------|---------|------|---------|
| Claude 3 Haiku | FAQ, simple queries | Fast | $ | Good |
| Claude 3 Sonnet | General purpose | Medium | $$ | Great |
| Claude 3 Opus | Complex analysis | Slow | $$$ | Best |

### When to Use Each

**Haiku:**
```typescript
foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0'
```
- High volume, simple queries
- FAQ bots
- Cost-sensitive applications
- Real-time chat

**Sonnet (Recommended):**
```typescript
foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0'
```
- General-purpose RAG
- Balanced performance/cost
- Most use cases
- Good reasoning

**Opus:**
```typescript
foundationModel: 'anthropic.claude-3-opus-20240229-v1:0'
```
- Complex technical questions
- Research assistance
- High-stakes applications
- Best quality required

### Switching Models

Update in `lib/s3-rag-stack.ts`:

```typescript
const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
  // Change this line:
  foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0',
  // ...other config
});
```

Then redeploy:
```bash
cdk deploy
```

The agent will automatically be prepared with the new model.

## Document Chunking Strategy

### Understanding Chunking

Chunking splits documents for optimal retrieval:

```
Original Document (2000 tokens)
        ↓
┌─────────────────┐
│ Chunk 1 (300)   │ ← Tokens 1-300
├─────────────────┤
│ Overlap (20)    │ ← Shared context
├─────────────────┤
│ Chunk 2 (300)   │ ← Tokens 281-580
├─────────────────┤
│ Overlap (20)    │
├─────────────────┤
│ Chunk 3 (300)   │ ← Tokens 561-860
└─────────────────┘
```

### Customizing Chunk Size

In `lib/s3-rag-stack.ts`:

```typescript
const knowledgeBase = new KnowledgeBaseConstruct(this, 'KnowledgeBase', {
  dataBucket: dataBucket,
  chunkSize: 500,      // ← Adjust this
  chunkOverlap: 50,    // ← Adjust this
});
```

### Chunk Size Guidelines

**Small Chunks (200-300)**
- **Pros:** Precise retrieval, lower cost
- **Cons:** May miss context
- **Best for:** Q&A, definitions, structured data

**Medium Chunks (400-600)**
- **Pros:** Balanced approach
- **Cons:** None significant
- **Best for:** Most use cases (recommended)

**Large Chunks (800-1000)**
- **Pros:** More context
- **Cons:** Higher cost, less precise
- **Best for:** Long-form content, narratives

### Chunk Overlap

Overlap prevents information loss at boundaries:

```
Chunk 1: "...the configuration file should be placed in..."
                                              ↓ OVERLAP ↓
Chunk 2: "...should be placed in the /etc directory with..."
```

**Guidelines:**
- 10-20% of chunk size
- Higher overlap = better continuity
- Higher overlap = more storage cost

**Example:**
```typescript
chunkSize: 500,
chunkOverlap: 75,  // 15% overlap
```

### When to Re-chunk

After changing chunk settings:

```bash
# 1. Update stack
cdk deploy

# 2. Re-run ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID
```

## Embedding Model Selection

### Available Models

**Amazon Titan Embeddings v2** (Default)
```typescript
embeddingModelId: 'amazon.titan-embed-text-v2:0'
```
- Dimensions: 1024
- Languages: 100+
- Cost: $0.0001 per 1K tokens

**Cohere Embed v3**
```typescript
embeddingModelId: 'cohere.embed-english-v3'
```
- Dimensions: 1024
- Language: English
- Cost: $0.0001 per 1K tokens

### Changing Embedding Model

**Important:** Requires recreating the knowledge base.

```typescript
const knowledgeBase = new KnowledgeBaseConstruct(this, 'KnowledgeBase', {
  dataBucket: dataBucket,
  embeddingModelId: 'cohere.embed-english-v3',  // ← Change
  // ...
});
```

Then:
```bash
# Destroy and recreate
cdk destroy
cdk deploy

# Re-upload and ingest
npm run upload-docs
```

## Retrieval Configuration

### Runtime Settings

Configure at query time (not deployment):

```typescript
const response = await client.send(new RetrieveCommand({
  knowledgeBaseId: KB_ID,
  retrievalQuery: { text: 'What is RAG?' },
  retrievalConfiguration: {
    vectorSearchConfiguration: {
      numberOfResults: 10,           // How many chunks to retrieve
      overrideSearchType: 'HYBRID'   // HYBRID or SEMANTIC
    }
  }
}));
```

### Number of Results

**Trade-offs:**

| Results | Pros | Cons |
|---------|------|------|
| 3-5 | Faster, focused | May miss relevant info |
| 5-10 | Balanced | Standard cost |
| 10-20 | Comprehensive | Slower, expensive |

### Search Types

**SEMANTIC** (Default)
- Pure vector similarity
- Best for conceptual matches
- Example: "How to deploy" matches "deployment guide"

**HYBRID**
- Combines vector + keyword search
- Best for specific terms
- Example: "API key" finds exact phrase

### Implementation

In your test script:

```typescript
// For specific queries
const response = await bedrockRuntime.retrieve({
  knowledgeBaseId,
  retrievalQuery: { text: query },
  retrievalConfiguration: {
    vectorSearchConfiguration: {
      numberOfResults: 5,
      overrideSearchType: 'SEMANTIC'
    }
  }
});
```

## Session Management

### Session Timeout

Control how long sessions stay active:

```typescript
const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
  idleSessionTTLInSeconds: 1200,  // 20 minutes
});
```

**Guidelines:**
- **Short (300-600s):** Chat-like interactions
- **Medium (600-1200s):** Standard web apps
- **Long (1200-3600s):** Research/analysis tasks

### Session Attributes

Pass context with each invocation:

```typescript
const response = await client.send(new InvokeAgentCommand({
  agentId,
  agentAliasId,
  sessionId,
  inputText: query,
  sessionState: {
    sessionAttributes: {
      userId: 'user-123',
      accountTier: 'premium',
      language: 'en-US'
    }
  }
}));
```

Use in instructions:

```typescript
instruction: `You are a support agent.

When responding:
- Address user by their tier level
- Prioritize premium users
- Consider user's language preference

Access user data via session attributes.
`
```

## Advanced: Metadata Filtering

### Adding Metadata to Documents

When uploading to S3, include metadata:

```typescript
await s3Client.send(new PutObjectCommand({
  Bucket: bucketName,
  Key: 'docs/api-v2.md',
  Body: fileContent,
  Metadata: {
    'x-amz-meta-category': 'api-docs',
    'x-amz-meta-version': '2.0',
    'x-amz-meta-audience': 'developers'
  }
}));
```

### Filtering During Retrieval

```typescript
const response = await client.send(new RetrieveCommand({
  knowledgeBaseId,
  retrievalQuery: { text: 'authentication' },
  retrievalConfiguration: {
    vectorSearchConfiguration: {
      numberOfResults: 5,
      filter: {
        equals: {
          key: 'category',
          value: 'api-docs'
        }
      }
    }
  }
}));
```

**Use Cases:**
- Version-specific docs
- Role-based access
- Category filtering
- Language selection

## Performance Tuning

### For Speed

```typescript
// Fast model
foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0'

// Smaller chunks
chunkSize: 300

// Fewer results
// Set at runtime: numberOfResults: 3

// Shorter timeout
idleSessionTTLInSeconds: 300
```

### For Quality

```typescript
// Better model
foundationModel: 'anthropic.claude-3-opus-20240229-v1:0'

// Larger chunks
chunkSize: 600
chunkOverlap: 60

// More results
// Set at runtime: numberOfResults: 10

// Detailed instructions
instruction: `[Very detailed instructions...]`
```

### For Cost

```typescript
// Cheaper model
foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0'

// Smaller chunks (less storage)
chunkSize: 300
chunkOverlap: 15

// Fewer results
// Set at runtime: numberOfResults: 3

// Amazon model for embeddings
embeddingModelId: 'amazon.titan-embed-text-v2:0'
```

## Testing Customizations

### A/B Testing

Create multiple agents with different configs:

```typescript
// Agent A: Fast & cheap
const agentA = new BedrockAgentConstruct(this, 'AgentA', {
  agentName: 'fast-agent',
  foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0',
});

// Agent B: Quality focused
const agentB = new BedrockAgentConstruct(this, 'AgentB', {
  agentName: 'quality-agent',
  foundationModel: 'anthropic.claude-3-opus-20240229-v1:0',
});
```

### Measuring Performance

```typescript
// Measure latency
const start = Date.now();
const response = await invokeAgent(...);
const latency = Date.now() - start;

// Measure quality (subjective)
const citationCount = citations.length;
const responseLength = fullResponse.length;

console.log({
  latency,
  citationCount,
  responseLength,
  model: 'claude-3-sonnet'
});
```

## Real-World Examples

### E-commerce Support

```typescript
agentName: 'product-support',
instruction: `You help customers with product questions.

Your knowledge base contains:
- Product specifications
- User manuals
- Warranty information
- Return policies

Always:
- Search KB before responding
- Provide product links when available
- Mention warranty terms if relevant
- For orders/shipping: "Contact our support team at..."

Tone: Friendly and helpful
`,
foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
chunkSize: 400,
```

### Legal Document Search

```typescript
agentName: 'legal-research',
instruction: `You are a legal research assistant.

Capabilities:
- Search case law and statutes
- Find precedents
- Summarize legal documents

Limitations:
- NOT a lawyer
- Cannot provide legal advice
- Always include disclaimers

Response format:
1. Summary of findings
2. Relevant excerpts with citations
3. Disclaimer: "This is not legal advice. Consult an attorney."

Tone: Professional and precise
`,
foundationModel: 'anthropic.claude-3-opus-20240229-v1:0',
chunkSize: 800,  // Legal docs need more context
chunkOverlap: 100,
```

### Developer Documentation

```typescript
agentName: 'api-docs-assistant',
instruction: `You are an API documentation expert.

When users ask about our API:
1. Provide endpoint details
2. Show code examples
3. Explain parameters
4. List common errors

Code format:
\`\`\`language
[working code example]
\`\`\`

Always cite:
- API version
- Documentation page
- Last updated date

Tone: Technical and clear
`,
foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
chunkSize: 500,
```

## Deployment Workflow

After customization:

```bash
# 1. Make changes in code
vim lib/s3-rag-stack.ts

# 2. Preview changes
cdk diff

# 3. Deploy
cdk deploy

# 4. Test
npm run test-agent

# 5. If chunking changed, re-ingest
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID
```

## Summary Checklist

Customize your agent by considering:

- [ ] Agent instructions (role, guidelines, tone)
- [ ] Foundation model (speed vs quality vs cost)
- [ ] Chunk size (precision vs context)
- [ ] Chunk overlap (continuity)
- [ ] Embedding model (if multilingual)
- [ ] Session timeout (use case duration)
- [ ] Metadata filtering (if multi-tenant)
- [ ] Retrieval settings (results count, search type)

## Next Steps

Learn how to test and validate your customizations!

→ Continue to [Step 5: Testing & Deployment](05-testing.md)
