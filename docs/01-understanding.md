# Step 1: Understanding the Basics

## What is RAG?

**Retrieval-Augmented Generation (RAG)** is a technique that enhances large language models (LLMs) by providing them with relevant context from your own data sources.

### The Problem RAG Solves

Traditional LLMs have limitations:
- Knowledge cutoff dates
- No access to your private/proprietary data
- Can hallucinate when uncertain
- Cannot provide citations or sources

### How RAG Works

```
┌──────────────┐
│ User Query   │
└──────┬───────┘
       │
       v
┌──────────────────────┐
│ Vector Search        │ ← Finds relevant chunks
│ (Similarity Search)  │
└──────┬───────────────┘
       │
       v
┌──────────────────────┐
│ Retrieved Context    │
│ + Original Query     │
└──────┬───────────────┘
       │
       v
┌──────────────────────┐
│ LLM Generation       │ ← Generates answer
│ with Context         │
└──────┬───────────────┘
       │
       v
┌──────────────────────┐
│ Response with        │
│ Citations            │
└──────────────────────┘
```

### RAG Components

1. **Document Store**: S3 bucket with your files
2. **Embedding Model**: Converts text to vectors
3. **Vector Database**: Stores embeddings for fast search
4. **LLM**: Generates responses using retrieved context
5. **Orchestrator**: Coordinates the workflow

## What is Amazon Bedrock?

Amazon Bedrock is a fully managed service for building AI applications with foundation models.

### Key Features

- **Multiple Models**: Claude, Llama, Titan, and more
- **No Infrastructure**: Fully serverless
- **Enterprise Ready**: Security, compliance, privacy
- **RAG Support**: Built-in knowledge bases

### Foundation Models

| Model | Best For | Speed | Cost |
|-------|----------|-------|------|
| Claude 3 Opus | Complex reasoning | Slow | $$$ |
| Claude 3 Sonnet | Balanced | Medium | $$ |
| Claude 3 Haiku | Speed & cost | Fast | $ |

## What are Bedrock Agents?

Bedrock Agents orchestrate multi-step tasks using:
- **Foundation models** for intelligence
- **Knowledge bases** for RAG
- **Action groups** for custom tools
- **Guardrails** for safety

### Agent Workflow

```
User Query → Agent Planning → Knowledge Retrieval
                ↓
          Tool Execution
                ↓
          Response Generation
```

## What are Bedrock Agents?

**Bedrock Agents** provide an API for:
- Agent responses with knowledge base integration
- Multi-turn conversations
- Citations and source tracking
- Trace visibility

### Why Bedrock Agents?

Bedrock Agents simplify RAG system development:
- **Easy Integration**: Connect agents directly to knowledge bases
- **Managed Orchestration**: Agent handles retrieval and response generation
- **Debugging**: Access to agent's reasoning trace
- **Conversations**: Maintain context across turns

## What is Vector Search?

Vector search finds similar content using embeddings.

### How it Works

1. **Embedding**: Text → Vector
   ```
   "Hello world" → [0.1, 0.3, -0.2, ...]
   ```

2. **Similarity**: Compare vectors using cosine similarity
   ```
   similarity(v1, v2) = (v1 · v2) / (|v1| × |v2|)
   ```

3. **Retrieval**: Return most similar chunks

### Example

```
Query: "How do I deploy?"
Embeddings:
  "Deployment guide..." → 0.92 similarity ✓
  "API reference..."    → 0.45 similarity
  "Pricing info..."     → 0.12 similarity
```

## Architecture Overview

Our tutorial stack includes:

```
┌─────────────────────────────────────────────┐
│                S3 Bucket                     │
│  ├── getting-started.md                     │
│  ├── api-reference.md                       │
│  └── customization-guide.md                 │
└──────────────┬──────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────┐
│         Bedrock Knowledge Base               │
│  ├── Embedding: Titan v2                    │
│  ├── Chunking: Fixed 300 tokens             │
│  └── Storage: OpenSearch Serverless         │
└──────────────┬──────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────┐
│      OpenSearch Serverless Collection       │
│  ├── Vector Index                           │
│  ├── HNSW Algorithm                         │
│  └── Automatic Scaling                      │
└──────────────┬──────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────┐
│           Bedrock Agent                      │
│  ├── Model: Claude 3 Sonnet                 │
│  ├── Instructions: Custom prompt            │
│  └── API: Agent responses                   │
└─────────────────────────────────────────────┘
```

## Key Concepts

### Document Chunking

Breaking documents into smaller pieces:

```
Original Doc (1000 words)
    ↓
Chunks (300 tokens each)
    ├── Chunk 1: "Introduction to RAG..."
    ├── Chunk 2: "RAG uses embeddings..."
    └── Chunk 3: "Benefits of RAG..."
```

**Why?** Embeddings work better on focused text.

### Embeddings

Vector representations of text:

```
Text: "Amazon Bedrock is a managed service"
  ↓
Embedding Model
  ↓
Vector: [0.12, -0.34, 0.56, ..., 0.89]
         └─ 1024 or 1536 dimensions ─┘
```

**Properties:**
- Similar text → Similar vectors
- Mathematical operations
- Language-agnostic

### Prompt Engineering

Crafting instructions for the agent:

```typescript
instruction: `You are a helpful assistant.

Your capabilities:
- Search knowledge base
- Provide accurate answers
- Cite sources

Your constraints:
- Don't make up information
- Admit when you don't know
- Stay on topic
`
```

### Session Management

Maintaining conversation context:

```
Session: user-123-conv-456
  ├── Turn 1: "What is RAG?"
  ├── Turn 2: "How does it work?"
  └── Turn 3: "Show me an example"
```

## Cost Breakdown

### Monthly Estimate (light usage)

| Service | Usage | Cost |
|---------|-------|------|
| S3 | 1 GB storage | $0.02 |
| OpenSearch | 1 OCU × 730 hrs | $175 |
| Bedrock KB | 10K queries | $0.10 |
| Bedrock Agent | 100K tokens | $3.00 |
| **Total** | | **~$178** |

**Cost Optimization:**
- Use smaller embedding models
- Reduce chunk overlap
- Implement caching
- Use Haiku for simple queries

## Use Cases

### 1. Customer Support
- Answer FAQs from documentation
- Escalate complex issues
- Provide consistent responses

### 2. Internal Knowledge Base
- Search company policies
- Find technical documentation
- Onboard new employees

### 3. Research Assistant
- Query academic papers
- Summarize findings
- Cite sources

### 4. Product Documentation
- Interactive user guides
- API documentation search
- Troubleshooting help

## Prerequisites Check

Before proceeding, ensure you have:

- [ ] AWS Account with admin access
- [ ] Bedrock access enabled in your region
- [ ] Node.js 18+ installed
- [ ] AWS CLI configured
- [ ] CDK CLI installed: `npm install -g aws-cdk`
- [ ] Basic TypeScript knowledge
- [ ] Understanding of AWS IAM

### Enable Bedrock Access

1. Go to AWS Console → Bedrock
2. Navigate to "Model access"
3. Enable models:
   - Anthropic Claude 3 Sonnet
   - Amazon Titan Embeddings v2
4. Wait for "Access granted" status

### Verify Prerequisites

```bash
# Check Node.js
node --version  # Should be v18 or higher

# Check AWS CLI
aws --version

# Check CDK
cdk --version

# Verify AWS credentials
aws sts get-caller-identity
```

## Next Steps

Now that you understand the fundamentals, let's set up the infrastructure!

→ Continue to [Step 2: Setting Up Infrastructure](02-infrastructure.md)

## Additional Resources

- [RAG Overview (AWS)](https://aws.amazon.com/what-is/retrieval-augmented-generation/)
- [Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Vector Databases Explained](https://www.pinecone.io/learn/vector-database/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)
