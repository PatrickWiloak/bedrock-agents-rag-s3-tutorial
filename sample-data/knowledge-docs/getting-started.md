# Getting Started with RAG Tutorial

## Overview

This tutorial teaches you how to build a Retrieval-Augmented Generation (RAG) system using Amazon Bedrock and S3.

## What is RAG?

RAG combines the power of large language models with your own data. Instead of relying solely on the model's training data, RAG:

1. **Retrieves** relevant information from your documents
2. **Augments** the prompt with this context
3. **Generates** responses based on your specific data

## Prerequisites

Before starting, ensure you have:

- AWS Account with Bedrock access enabled
- Node.js 18 or later installed
- AWS CLI configured with credentials
- Basic understanding of TypeScript

## Installation Steps

### Step 1: Clone and Install

```bash
git clone <your-repo>
cd bedrock-agents-rag-s3-tutorial
npm install
```

### Step 2: Bootstrap CDK

If this is your first time using CDK in this AWS account/region:

```bash
cdk bootstrap
```

### Step 3: Deploy Infrastructure

```bash
cdk deploy
```

This will create:
- S3 bucket for documents
- OpenSearch Serverless collection for vectors
- Bedrock Knowledge Base
- Bedrock Agent with knowledge base integration

### Step 4: Upload Documents

```bash
npm run upload-docs
```

### Step 5: Sync Knowledge Base

After uploading documents, you need to trigger ingestion:

```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id <your-kb-id> \
  --data-source-id <your-ds-id>
```

The IDs are available in the CloudFormation outputs.

### Step 6: Test Your Agent

```bash
npm run test-agent
```

## Architecture Components

### S3 Bucket
Stores your source documents in various formats (PDF, TXT, MD, DOCX).

### Knowledge Base
Processes documents into embeddings using Amazon Titan or other models.

### Vector Store
OpenSearch Serverless provides fast similarity search.

### Bedrock Agent
Orchestrates the RAG workflow and generates responses.

## Next Steps

- Upload your own documents to the S3 bucket
- Customize the agent's instructions
- Add custom tools for additional functionality
- Integrate with your application

## Troubleshooting

### Issue: Agent not finding documents

**Solution**: Make sure you ran the ingestion job after uploading documents.

### Issue: Access denied errors

**Solution**: Check that your AWS credentials have the necessary Bedrock permissions.

### Issue: Deployment fails

**Solution**: Ensure Bedrock is enabled in your region and you have quota for the services.
