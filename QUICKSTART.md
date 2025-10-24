# Quick Start Guide

Get your **multi-knowledge-base RAG agent** running in less than 10 minutes!

## What Gets Deployed

This tutorial deploys a complete RAG system with:
- **1 S3 Data Bucket** with organized sample documents
- **1 S3 Vector Bucket** - serverless vector database (NEW!)
- **1 Vector Index** - enables fast similarity search
- **1 Knowledge Base** - manages document ingestion and embeddings
- **1 Bedrock Agent** - Claude 3.5 Haiku with knowledge base access
- **Sample Documents** - 17 realistic company documents (financial reports, HR policies, meeting notes)

## Prerequisites

**Required software installed:**
- AWS Account with Bedrock access enabled
- Node.js 18+ installed
- AWS CLI configured
- CDK CLI: `npm install -g aws-cdk`

**Not set up yet?** → Watch this [AWS Account & User Setup Tutorial](https://www.youtube.com/watch?v=DuUmIMW0Xr0) for step-by-step guidance on configuring your AWS account and CLI credentials

---

## About Bedrock Model Access

**Good news!** AWS Bedrock now automatically enables access to most foundation models, including Claude 3.5 Haiku (used by default) and Amazon Titan Embeddings v2.

**Note:** Some newer models (like Claude Sonnet 4.5) may require first-time users to submit use case details. Claude 3.5 Haiku typically works immediately without additional approval steps.

If you encounter model access issues during deployment, see the "Foundation Model Selection" section in the main README for alternatives.

## Installation & Deployment

```bash
# Clone the repository
git clone https://github.com/PatrickWiloak/bedrock-agents-rag-s3-tutorial.git
cd bedrock-agents-rag-s3-tutorial

# Deploy infrastructure only
./deploy.sh

# Then manually upload documents
npm run upload-docs
```

**Time:** ~15 minutes + manual upload step

## Upload Documents

```bash
# Upload sample documents and trigger ingestion
npm run upload-docs

# You'll see:
# ✓ Uploaded 17 documents to S3
# ✓ Knowledge Base ingestion started

# Wait 5-8 minutes for ingestion to complete
```

The script uploads all documents to S3 and triggers ingestion for the knowledge base.
All documents from the three folders are indexed together in a single knowledge base with S3 Vectors

## Test Your Agent

```bash
# Interactive chat
npm run test-agent
```

**Try these domain-specific questions:**

Financial Data:
- "What was our Q4 2024 revenue?"
- "What's the 2025 budget for engineering?"
- "What's the expense policy for business travel?"
- "What's our DSO (Days Sales Outstanding)?"

Human Resources:
- "What are our PTO benefits?"
- "How much is the home office stipend?"
- "What's the remote work policy?"
- "Explain the performance review rating scale"

Meeting Notes:
- "What are the company's top priorities for 2025?"
- "What features are planned for Q1?"
- "What were the action items from the executive meeting?"
- "What was discussed in the sprint retrospective?"

**Cross-domain questions** (agent searches multiple KBs):
- "How many employees do we plan to hire this year?" (Budget + Meeting Notes)
- "What's our company's approach to remote work and related costs?" (HR + Financial)

## What You Just Built

**Infrastructure:**
- 1 S3 data bucket with organized document folders
- 1 S3 Vector bucket + index (serverless vector database)
- 1 Bedrock Knowledge Base (indexes all documents)
- 1 Bedrock Agent with knowledge base access
- Agent responses with citations

**Sample Data:**
- 17 realistic company documents
- Financial reports, budgets, expense policies
- Employee handbook, benefits guide, HR policies
- Executive meetings, product plans, sprint retros

**Single Knowledge Base with Organized Data:**
All documents are indexed together in one knowledge base, organized by folders. The agent can search across all domains to answer questions!

## Next Steps

1. **Add your own documents**
   ```bash
   # Add to the appropriate knowledge base folder
   aws s3 cp my-financial-report.pdf s3://YOUR-BUCKET-NAME/Financial-Data/
   aws s3 cp my-policy.md s3://YOUR-BUCKET-NAME/Human-Resources/
   aws s3 cp my-meeting-notes.md s3://YOUR-BUCKET-NAME/Meeting-Notes/

   # Re-run to ingest new docs
   npm run upload-docs
   ```

2. **Add a new knowledge base domain**
   - Edit `lib/s3-rag-stack.ts`
   - Add new entry to `knowledgeBases` array
   - Update agent instructions
   - Redeploy: `cdk deploy`

3. **Customize the agent**
   - Edit `lib/s3-rag-stack.ts` - change model, instructions, chunk size
   - Edit `lib/knowledge-base-construct.ts` - adjust embedding model, chunk overlap
   - Edit `lib/bedrock-agent-construct.ts` - modify agent behavior
   - Redeploy: `cdk deploy`

4. **Build a web UI**
   - See [docs/07-web-interface.md](docs/07-web-interface.md)
   - Next.js app with dark mode, citations, chat interface
   - Run: `cd web && npm run dev` (dependencies already installed at root)

5. **Learn more**
   - Read [docs/01-understanding.md](docs/01-understanding.md) for fundamentals
   - Follow the full tutorial in the [docs/](docs/) folder
   - Explore multi-KB patterns and best practices

## Troubleshooting

### "Model access denied" or "AccessDeniedException"
→ See "Foundation Model Selection" in README.md for alternative models that don't require use case submission (e.g., Amazon Nova Pro)

### "Agent says 'I don't have that information'"
→ Wait for ingestion to complete. Check status:
```bash
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id YOUR_KB_ID \
  --data-source-id YOUR_DS_ID
```

### "Stack deployment fails"
→ Check you have sufficient AWS permissions and Bedrock is available in your region

## Clean Up

When done testing:

```bash
# Destroy all resources to avoid charges
cdk destroy

# Confirm with 'y'
```

**Important**: OpenSearch Serverless costs ~$0.24/hour, so destroy when not in use!

## Cost Estimate & Cleanup

**For completing this tutorial:**
- S3: < $0.01
- S3 Vectors: < $0.10 (pay-per-request)
- Bedrock: ~$1-5 (depending on usage)
- **Total**: ~$1-5

### ⚠️ CRITICAL: Delete Resources to Avoid Ongoing Costs!

**When you're done, follow the manual cleanup steps in the main README:**

👉 **[See README.md Cleanup Section](README.md#two-cleanup-options)** for detailed step-by-step instructions

**Why manual cleanup?**
- ❌ `cdk destroy` is unreliable with S3 Vectors (preview feature)
- ❌ Automated scripts may leave orphaned resources
- ✅ Manual deletion works 100% of the time
- ✅ Takes 3-5 minutes following the guide

**Verify cleanup worked:**
1. Check AWS Console: https://console.aws.amazon.com/cloudformation
2. Verify no S3 buckets: https://s3.console.aws.amazon.com/s3/buckets
3. Check Cost Explorer after 24-48 hours: https://console.aws.amazon.com/cost-management/home#/cost-explorer

## Support

- Tutorial issues: Check [docs/](docs/) folder
- AWS Bedrock: [Documentation](https://docs.aws.amazon.com/bedrock/)
- CDK: [AWS CDK Guide](https://docs.aws.amazon.com/cdk/)

## Architecture Diagram

```
┌─────────────┐
│ Your Query  │
└──────┬──────┘
       │
       v
┌─────────────────────┐
│ Bedrock Agent       │ ← Claude 3.5 Haiku
│ (with citations)    │
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│ Knowledge Base      │ ← Searches documents
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│ S3 Vector Database  │ ← Serverless, up to 90% cheaper!
│ (Embeddings)        │
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│ S3 Documents        │ ← Your data
│ - getting-started.md│
│ - api-reference.md  │
│ - customization.md  │
└─────────────────────┘
```

Happy building with RAG! 🚀
