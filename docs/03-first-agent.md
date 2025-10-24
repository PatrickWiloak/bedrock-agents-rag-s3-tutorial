# Step 3: Creating Your First Agent

Now that your infrastructure is deployed, let's populate it with data and test your RAG agent!

## Overview

In this step, you'll:
1. Upload sample documents to S3
2. Trigger knowledge base ingestion
3. Test your agent with queries
4. Understand the RAG workflow

## Upload Documents

### Using the Upload Script

We've provided a script that automates document upload:

```bash
npm run upload-docs
```

**What it does:**
1. Reads CloudFormation outputs (bucket name, KB ID, etc.)
2. Uploads all files from `sample-data/knowledge-docs/`
3. Triggers ingestion job
4. Shows progress and status

**Expected Output:**
```
🚀 S3 RAG Tutorial - Document Upload

1. Fetching stack information...
   ✓ Bucket: bedrock-rag-docs-123456789012-us-east-1
   ✓ Knowledge Base: KB456DEF
   ✓ Region: us-east-1

2. Uploading sample documents...
   ✓ Uploaded: getting-started.md
   ✓ Uploaded: customization-guide.md
   ✓ Uploaded: api-reference.md
   ✓ Uploaded 3 files

3. Verifying uploads...
   ✓ Total files in bucket: 3

Starting ingestion job...
✓ Ingestion job started: JOB789GHI
  Status: STARTING

✅ Upload complete!
```

### Manual Upload (Alternative)

If you prefer to upload manually:

```bash
# Get bucket name from stack outputs
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
  --output text)

# Upload files
aws s3 cp sample-data/knowledge-docs/ s3://$BUCKET/ --recursive
```

### Adding Your Own Documents

You can add any supported document format:

**Supported Formats:**
- Markdown (`.md`)
- Plain Text (`.txt`)
- PDF (`.pdf`)
- Word (`.doc`, `.docx`)
- HTML (`.html`)

**Example:**
```bash
# Add your own document
aws s3 cp my-document.pdf s3://$BUCKET/my-document.pdf
```

**Best Practices:**
- Use clear, descriptive filenames
- Organize in folders for easier management
- Keep documents focused on specific topics
- Avoid very large files (split into smaller chunks)

## Knowledge Base Ingestion

### What is Ingestion?

Ingestion is the process of:
1. Reading documents from S3
2. Splitting into chunks
3. Generating embeddings
4. Storing vectors in OpenSearch

### Trigger Ingestion

After uploading documents:

```bash
# Get IDs from stack outputs
KB_ID=$(aws cloudformation describe-stacks \
  --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseIdOutput`].OutputValue' \
  --output text)

DS_ID=$(aws cloudformation describe-stacks \
  --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DataSourceIdOutput`].OutputValue' \
  --output text)

# Start ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID
```

**Note:** The upload script does this automatically!

### Monitor Ingestion Status

```bash
# List all ingestion jobs
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID

# Get specific job status
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID \
  --ingestion-job-id $JOB_ID
```

**Status Values:**
- `STARTING` - Job is initializing
- `IN_PROGRESS` - Processing documents
- `COMPLETE` - Successfully finished
- `FAILED` - Something went wrong

**Typical Duration:** 2-5 minutes for small datasets

### Ingestion Process Deep Dive

```
┌─────────────────────┐
│ S3 Documents        │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ 1. Document Parsing │ ← Extract text
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ 2. Chunking         │ ← Split into pieces
│    - Size: 300      │
│    - Overlap: 20    │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ 3. Embedding        │ ← Generate vectors
│    Model: Titan v2  │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ 4. Vector Storage   │ ← Store in OpenSearch
│    Index: KB index  │
└─────────────────────┘
```

## Testing Your Agent

### Using the Test Script

Run the interactive test:

```bash
npm run test-agent
```

**Interactive Mode:**
```
🚀 S3 RAG Tutorial - Agent Test

Fetching agent information...
✓ Agent ID: AGENT123ABC
✓ Alias ID: ALIAS456DEF
✓ Region: us-east-1

🤖 Interactive Chat Mode
Type your questions and press Enter. Type "exit" to quit.

You: What is RAG?

Agent: RAG stands for Retrieval-Augmented Generation. It's a technique
that enhances large language models by providing them with relevant
context from external data sources...

📚 Sources:
  1. s3://bedrock-rag-docs-.../getting-started.md

You: How do I customize the agent?

Agent: There are several ways to customize your RAG agent...
```

### Demo Mode

Run preset questions:

```bash
npm run test-agent demo
```

This runs through sample queries automatically.

## Understanding Agent Responses

### Response Structure

```typescript
{
  completion: AsyncIterable<Event>,
  sessionId: string
}
```

### Event Types

**1. Chunk Events**
Partial response text:

```json
{
  "chunk": {
    "bytes": "UmV0cmlldmFs...",  // Base64 encoded text
    "attribution": {
      "citations": [...]
    }
  }
}
```

**2. Trace Events** (if enabled)
Agent's reasoning:

```json
{
  "trace": {
    "orchestrationTrace": {
      "invocationInput": {
        "knowledgeBaseLookupInput": {
          "text": "RAG",
          "knowledgeBaseId": "KB456DEF"
        }
      },
      "observation": {
        "knowledgeBaseLookupOutput": {
          "retrievedReferences": [
            {
              "location": { "s3Location": { "uri": "s3://..." } },
              "content": { "text": "..." }
            }
          ]
        }
      }
    }
  }
}
```

## The RAG Workflow in Action

### Query Flow

```
1. User Input
   └─> "What is RAG?"

2. Agent Planning
   └─> Determine need for knowledge base search

3. Knowledge Base Retrieval
   ├─> Convert query to embedding
   ├─> Search vector database
   └─> Return top 5 matches

4. Context Augmentation
   └─> Combine query + retrieved chunks

5. LLM Generation
   └─> Generate response with citations

6. Response Delivery
   └─> Return response to user
```

### Example Trace

Enable traces to see the workflow:

```typescript
const response = await client.send(new InvokeAgentCommand({
  agentId,
  agentAliasId,
  sessionId,
  inputText: 'What is RAG?',
  enableTrace: true  // ← Enable this
}));
```

**Trace Output:**
```json
{
  "trace": {
    "orchestrationTrace": {
      "invocationInput": {
        "invocationType": "KNOWLEDGE_BASE",
        "knowledgeBaseLookupInput": {
          "text": "What is RAG?",
          "knowledgeBaseId": "KB456DEF"
        }
      },
      "modelInvocationInput": {
        "text": "Based on this context:\n[Retrieved chunks...]\n\nAnswer: What is RAG?"
      },
      "observation": {
        "type": "KNOWLEDGE_BASE",
        "knowledgeBaseLookupOutput": {
          "retrievedReferences": [
            {
              "content": { "text": "RAG stands for..." },
              "location": { "s3Location": { "uri": "s3://..." } },
              "metadata": {}
            }
          ]
        }
      }
    }
  }
}
```

## Testing Different Queries

### Good Queries

Questions likely in your documents:

```
✓ "What is RAG?"
✓ "How do I deploy this?"
✓ "What models are available?"
✓ "How can I customize the agent?"
```

### Out-of-Scope Queries

Questions not in documents:

```
✗ "What's the weather today?"
✗ "Who won the election?"
```

**Expected Response:**
```
"I don't have information about that in my knowledge base.
I can help you with questions about RAG, deployment, and
agent customization."
```

## Multi-Turn Conversations

The agent maintains context within a session:

```
Session: abc123

Turn 1:
You: What is RAG?
Agent: RAG stands for Retrieval-Augmented Generation...

Turn 2:
You: How does it work?
Agent: [Knows "it" refers to RAG from Turn 1]
       RAG works by first retrieving relevant documents...

Turn 3:
You: Show me an example
Agent: [Still in context of RAG]
       Here's an example of RAG implementation...
```

**Key:** Use the same `sessionId` for all turns.

## Performance Tips

### Faster Responses

1. **Use Claude Haiku:**
   ```typescript
   foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0'
   ```

2. **Reduce Retrieved Results:**
   ```typescript
   retrievalConfiguration: {
     numberOfResults: 3  // Instead of 5
   }
   ```

3. **Citations:**
   Already enabled by default with Bedrock Agents!

### Better Quality

1. **Use Claude Opus:**
   ```typescript
   foundationModel: 'anthropic.claude-3-opus-20240229-v1:0'
   ```

2. **Increase Retrieved Results:**
   ```typescript
   retrievalConfiguration: {
     numberOfResults: 10
   }
   ```

3. **Improve Instructions:**
   More detailed agent instructions lead to better responses.

## Common Issues

### Issue: Agent says "I don't have that information"

**Possible Causes:**
1. Ingestion not complete
2. Documents don't contain the answer
3. Query too different from document content

**Solutions:**
```bash
# Check ingestion status
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID

# Verify documents are in S3
aws s3 ls s3://$BUCKET/

# Try more specific queries
```

### Issue: Slow responses

**Solutions:**
- Switch to Haiku model
- Reduce chunk size
- Check AWS region latency

### Issue: Generic/unhelpful answers

**Solutions:**
- Improve agent instructions
- Add more detailed documents
- Increase chunk size for more context

## Monitoring

### CloudWatch Metrics

Bedrock automatically logs:
- Invocation count
- Latency
- Errors

**View in Console:**
AWS Console → CloudWatch → Metrics → Bedrock

### Custom Logging

Add logging to your test script:

```typescript
console.log({
  timestamp: new Date().toISOString(),
  sessionId,
  query: inputText,
  responseLength: fullResponse.length,
  citationCount: citations.length
});
```

## What You've Learned

✅ How to upload documents to S3
✅ How to trigger knowledge base ingestion
✅ How to test your agent interactively
✅ Understanding the RAG workflow
✅ Reading traces and citations
✅ Managing multi-turn conversations

## Next Steps

Now let's customize your agent to fit your specific needs!

→ Continue to [Step 4: Customizing Your Agent](04-customization.md)

## Quick Reference

```bash
# Upload documents
npm run upload-docs

# Test agent (interactive)
npm run test-agent

# Test agent (demo mode)
npm run test-agent demo

# Check ingestion status
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID

# List documents in bucket
aws s3 ls s3://$BUCKET/ --recursive
```
