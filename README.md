<div align="center">

<a href="https://noblerworks.com/"><img src="https://raw.githubusercontent.com/NoblerWorks-HQ/IRONSIGHT/main/nobler-works-banner.JPG" alt="Nobler Works" width="240"></a>

### Built by [Patrick Wiloak](https://patrickwiloak.com) at [Nobler Works](https://noblerworks.com/)

We build custom software and products at Nobler Works. Open source projects and tutorials like this one are our way of giving back - we're nothing without the community that supports us.<br>
If you need custom software built, [get in touch](https://noblerworks.com/).

[![Website](https://img.shields.io/badge/Website-000000?style=for-the-badge&logo=googlechrome&logoColor=white)](https://noblerworks.com/)
[![X](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Nobler_Works)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/@NoblerWorks)
[![TikTok](https://img.shields.io/badge/TikTok-000000?style=for-the-badge&logo=tiktok&logoColor=white)](https://www.tiktok.com/@noblerworks)
[![Threads](https://img.shields.io/badge/Threads-000000?style=for-the-badge&logo=threads&logoColor=white)](https://www.threads.com/@noblerworks)

</div>

---

<div align="center">

# AWS Bedrock RAG Tutorial with S3 Vectors

**Build a retrieval-augmented Q&A agent on Amazon Bedrock Knowledge Bases and S3 Vectors -
one CDK command, a Next.js UI, and the debugging tools to see what the retriever actually returned.**

[![License: MIT](https://img.shields.io/badge/License-MIT-3d5a80?style=flat-square)](LICENSE)
[![AWS Bedrock](https://img.shields.io/badge/AWS-Bedrock-FF9900?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/bedrock/)
[![AWS CDK](https://img.shields.io/badge/IaC-AWS%20CDK-FF9900?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/cdk/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Deploy time](https://img.shields.io/badge/deploy-%3C10%20min-2f7757?style=flat-square)](#quick-start)
![Cost vs OpenSearch](https://img.shields.io/badge/vs%20OpenSearch-up%20to%2090%25%20cheaper-2f7757?style=flat-square)

</div>


> **Tutorial:** Build a Q&A agent with AWS Bedrock Agents, Knowledge Bases, and S3 Vectors (preview). Includes CDK deployment, web UI, and comprehensive debugging tools.

Learn how to build and deploy a **Retrieval-Augmented Generation (RAG)** system using Amazon Bedrock Agents, Knowledge Bases, S3 Vectors, and AWS CDK!

> **📢 Important Note about S3 Vectors**
>
> This tutorial uses **Amazon S3 Vectors** for vector storage - a new preview feature announced in July 2025. Benefits:
> - ✅ **Up to 90% lower cost** than OpenSearch Serverless
> - ✅ **Fully serverless** - no infrastructure to manage
> - ✅ **Fast deployment** - less than 10 minutes vs 20-25 minutes (includes document ingestion!)
>
> **CDK Limitation & Workarounds**: S3 Vectors is not yet supported in official AWS CDK/CloudFormation (preview feature).
> This tutorial uses the **[cdk-s3-vectors](https://github.com/bimnett/cdk-s3-vectors)** community library by [@bimnett](https://github.com/bimnett) as a temporary workaround.
> 🙏 **Special thanks to Bimnet Tesfamariam** for creating and maintaining this excellent library!
>
> ⚠️ **Important**: Due to custom resource limitations, **`cdk destroy` is unreliable** - follow the manual cleanup steps in the "Cleaning Up" section below instead.
>
> Once AWS publishes official CloudFormation support, we'll update to use native CDK constructs.

## What You'll Build

By the end of this tutorial, you'll have a fully functional **RAG system** that:
- Stores documents in S3 organized by domain (Financial, HR, Meeting Notes)
- Creates a **Bedrock Knowledge Base** using S3 Vectors for vector storage
- Uses **Amazon S3 Vectors** - a cost-effective, serverless vector database (up to 90% cheaper than OpenSearch)
- Deploys a **Bedrock Agent** with knowledge base access
- Provides intelligent responses using Bedrock Agents
- Includes a beautiful **Next.js web UI** with dark mode and citations
- **Single-command deployment** that works on the first try (no manual interventions)
- Includes **comprehensive test script** with detailed logging for debugging

## Architecture

This tutorial demonstrates a **S3 Vectors-based RAG architecture** - using AWS's newest serverless vector database:

```
┌─────────────────┐
│  Users/Browsers │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────────────────────────────────────────────┐
│  CloudFront CDN (Global Edge Locations)                 │
│  • Caches static assets                                 │
│  • HTTPS termination                                    │
│  • Low latency worldwide                                │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│  S3 Static Website Bucket                               │
│  • Next.js static export (HTML/CSS/JS)                  │
│  • Beautiful dark mode UI                               │
│  • Citation display, markdown rendering                 │
└─────────────────────────────────────────────────────────┘
         │
         │ API calls
         ↓
┌─────────────────────────────────────────────────────────┐
│  API Gateway REST API                                   │
│  • CORS enabled                                         │
│  • Rate limiting                                        │
│  • /chat endpoint                                       │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│  Lambda Function (bedrock-api)                          │
│  • Invokes Bedrock Agent                                │
│  • Collects agent responses                             │
│  • Returns JSON with response + citations               │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│  Bedrock Agent (Claude 3 Sonnet)                        │
│  • Routes questions to KB                               │
│  • Semantic search via S3 Vectors                       │
│  • Streams responses (Claude 3.5 Haiku)                 │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│  S3 Vectors (Vector Database)                           │
│  • Serverless vector storage                            │
│  • 1024-dim embeddings (Titan v2)                       │
│  • Cosine similarity search                             │
│  • Up to 90% cheaper than OpenSearch                    │
└────────┬────────────────────────────────────────────────┘
         │
         ↑ (indexed from)
┌─────────────────────────────────────────────────────────┐
│  Bedrock Knowledge Base                                 │
│  • Chunks documents                                     │
│  • Generates embeddings (Titan v2)                      │
│  • Manages ingestion pipeline                           │
└────────┬────────────────────────────────────────────────┘
         │
         ↑ (reads from)
┌─────────────────────────────────────────────────────────┐
│  S3 Data Bucket                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Financial-Data/                                  │  │
│  │  Human-Resources/                                 │  │
│  │  Meeting-Notes/                                   │  │
│  │  - Q4 Reports, Budgets                            │  │
│  │  - Employee Handbook, Benefits                    │  │
│  │  - Meeting notes, Plans                           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Why S3 Vectors?**

This architecture provides:
- **Cost Efficiency**: Up to 90% cheaper than OpenSearch Serverless
- **Serverless**: No infrastructure to manage, scales automatically
- **Fast Deployment**: Less than 10 minutes vs 20-25 minutes for OpenSearch (includes document ingestion!)
- **Simple Architecture**: Fewer moving parts, easier to maintain
- **Preview Feature**: Early access to AWS's newest vector database technology

## Prerequisites

> **🎓 New to AWS?**
>
> If you don't have an AWS account yet or need help setting up an IAM admin user, MFA, and billing alerts, watch this tutorial first:
>
> **[AWS Account Setup for Beginners](https://youtu.be/DuUmIMW0Xr0?si=teRTToyPucL9Zf3Y)** (15 minutes)
>
> It covers:
> - Creating a new AWS account
> - Setting up an IAM admin user (best practice - don't use root!)
> - Enabling MFA for security
> - Setting up billing alerts to avoid surprises
> - Configuring AWS CLI credentials
>
> Once you have your admin user set up, come back here to continue!

**Quick check** - You need:
- ✅ AWS Account with Bedrock access enabled
- ✅ Node.js 18+ installed
- ✅ AWS CLI configured with credentials
- ✅ AWS CDK installed globally: `npm install -g aws-cdk`
- ✅ **Required IAM permissions** (see below)

> **Note**: This project uses npm workspaces. If you use `./deploy-complete.sh`, the script handles all dependency installation automatically. For manual deployment, run `npm install` at the root directory - it installs dependencies for both the CDK infrastructure and Next.js web UI.

### Foundation Model Selection

**This tutorial uses Claude 3.5 Haiku by default** (`anthropic.claude-3-5-haiku-20241022-v1:0`) - a fast, cost-effective model from Anthropic's Claude 3.5 family.

**About Model Access:**

AWS Bedrock now automatically grants access to most foundation models. However, **some newer models (like Claude Sonnet 4.5, Claude Opus 4) may require first-time users to submit use case details** before they can be used. This is a great strategy by AWS to ensure model availability for users with real, approved use cases!

**Claude 3.5 Haiku** typically doesn't require use case submission for most users, but if you encounter access issues, you can:
- Submit use case details (usually approved within 1-2 business days), OR
- Switch to Amazon Nova models (guaranteed immediate access)

**Want to use different models?**

Just update the `foundationModel` parameter in `lib/s3-rag-stack.ts`:

```typescript
const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
  // ... other props
  foundationModel: 'amazon.nova-pro-v1:0', // Switch to Nova Pro
  // OR
  foundationModel: 'anthropic.claude-sonnet-4-5-20250929-v1:0', // Latest Claude
});
```

**Recommended alternatives:**
- ✅ `anthropic.claude-3-5-haiku-20241022-v1:0` (default - fast, cost-effective, Claude 3.5 quality)
- ✅ `amazon.nova-pro-v1:0` (no use case needed, great for RAG)
- ✅ `anthropic.claude-sonnet-4-5-20250929-v1:0` (best quality, may need use case)
- ✅ `deepseek.r1-v1:0` (strong reasoning, usually available)

### Required IAM Permissions

> **⚠️ IMPORTANT: Complete this step BEFORE running the deploy script!**
>
> The deploy script **cannot grant you permissions** - you (or your AWS administrator) must attach the required IAM policy to your user/role first.

Your AWS user/role needs the following permissions to deploy and clean up this tutorial:

**Option 1: Use the provided IAM policy (Recommended)**

This repository includes a ready-to-use IAM policy in `iam-policy.json` with all required permissions.

**Who can do this?**
- Your AWS account administrator
- OR any user with `iam:CreatePolicy` and `iam:AttachUserPolicy` permissions
- OR yourself, if you already have `AdministratorAccess`

**Steps:**

```bash
# 1. Clone the repository first
git clone https://github.com/PatrickWiloak/bedrock-agents-rag-s3-tutorial.git
cd bedrock-agents-rag-s3-tutorial

# 2. Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Your AWS Account ID: $AWS_ACCOUNT_ID"

# 3. Get your IAM username
IAM_USERNAME=$(aws sts get-caller-identity --query 'Arn' --output text | cut -d'/' -f2)
echo "Your IAM Username: $IAM_USERNAME"

# 4. Create the IAM policy
aws iam create-policy \
  --policy-name BedrockRAGTutorialPolicy \
  --policy-document file://iam-policy.json \
  --description "Permissions for AWS Bedrock RAG Tutorial"

# 5. Attach policy to your user
aws iam attach-user-policy \
  --user-name $IAM_USERNAME \
  --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/BedrockRAGTutorialPolicy

echo "✅ IAM policy attached! You can now run the deploy script."
```

**Option 2: Use AdministratorAccess (Development only)**

For development/learning purposes, you can use the AWS managed `AdministratorAccess` policy, which includes all required permissions. If you already have this, skip to "Quick Start" below.

**What permissions are included?**

The `iam-policy.json` file grants permissions for:
- **Bedrock**: Create/delete agents, knowledge bases, data sources, invoke models
- **S3 Vectors**: Create/delete vector buckets and indexes
- **S3**: Manage buckets and objects for document storage
- **IAM**: Pass roles to Bedrock service
- **Plus**: CloudFormation, Lambda, API Gateway, CloudFront (for CDK deployment)

> **💡 Why this approach?**
>
> We provide a minimal IAM policy (principle of least privilege) so you can:
> - Deploy and clean up the tutorial without `AdministratorAccess`
> - Understand exactly what permissions are needed
> - Use this in organizational AWS accounts with permission restrictions
> - Avoid "Access Denied" errors during deployment or cleanup

## Quick Start

> **💡 Which option should I choose?**
> - **Just want the gist of it?** → Option 1 (Complete Automated) - Our script handles everything!
> - **Want to understand the deployment process?** → Option 2 (Infrastructure Only)
> - **Want to learn everything in depth?** → Option 3 (Manual CDK)
> - **Building a production system?** → Read the full tutorial in `docs/`

### Option 1: Complete Automated Setup (Fastest) 🚀

**Perfect for:** Just want the gist of it? Our deployment script takes care of everything!

**Best if:** You want to see the system working immediately without manual steps

```bash
# Clone and deploy - everything automated!
git clone https://github.com/PatrickWiloak/bedrock-agents-rag-s3-tutorial.git
cd bedrock-agents-rag-s3-tutorial
./deploy-complete.sh
```

**This single script handles:**
- ✅ Prerequisites check (Node.js, AWS CLI, CDK)
- ✅ AWS credentials verification
- ✅ **Dependency installation** (CDK + web UI via npm workspaces)
- ✅ CDK bootstrap (if needed)
- ✅ Infrastructure deployment (15 mins)
- ✅ Document upload (17 sample docs)
- ✅ Ingestion monitoring (waits until ready)
- ✅ Ready-to-use RAG system!

**No manual `npm install` needed** - the script does it all! 🎯

**Time:** Less than 10 minutes total (hands-off) - includes full deployment AND document ingestion!

**What happens during deployment:**

- **~10 seconds**: Prerequisites check and project setup
- **~5-7 minutes**: CloudFormation deployment (S3 Vectors is FAST!)
  - S3 buckets, S3 Vector buckets, and indexes
  - IAM roles, Knowledge Bases, and Bedrock Agent creation
  - CloudFormation stack finalization
- **~30 seconds**: Uploading 17 sample documents to S3
- **~2-3 minutes**: Knowledge Base ingestion (AWS chunks documents, generates embeddings, indexes vectors)
  - Documents are split into chunks
  - Each chunk gets embedded using Titan Embeddings v2
  - Vectors are stored in S3 Vector buckets for similarity search
  - Processing happens in parallel

**The speed advantage?** S3 Vectors deploys in less than 10 minutes total vs 20-25 minutes for OpenSearch Serverless - that's more than 2x faster! ⚡

### Option 2: Infrastructure Only (Understanding the Process) 📚

**Perfect for:** Learning how RAG systems work, understanding deployment steps

**Best if:** You want to see each phase of deployment and understand what's happening

```bash
# Deploy CDK stack only
./deploy.sh

# Then manually upload and test
npm run upload-docs
npm run test-agent
```

**Why this option?**
- See exactly what `npm run upload-docs` does
- Understand document ingestion process
- Learn how Knowledge Bases are populated
- Good balance of automation and understanding

### Option 3: Manual CDK Deployment (Deep Learning) 🎓

**Perfect for:** Developers who want to master CDK, customize everything, learn in depth

**Best if:** You want complete control and deep understanding of every component

**Why this option?**
- Understand every CDK construct
- See how each resource is created
- Learn CloudFormation stack structure
- Perfect foundation for customization
- **Recommended if:** You're planning to build production RAG systems

```bash
# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy the stack
cdk deploy

# Upload sample documents
npm run upload-docs

# Test your RAG system
npm run test-agent
```

**Why this option?**
- Full control over each deployment step
- Learn CDK patterns and best practices
- Understand AWS service interactions
- Customize resources before deployment
- Troubleshoot issues at granular level

### Option 4: Web UI (Best Experience) 🌐

**Perfect for:** Interactive exploration, demos, production-like usage

**Best if:** You want a beautiful interface with citations and chat functionality

```bash
# Deploy infrastructure (same as above)
npm install
cdk bootstrap
cdk deploy
npm run upload-docs

# Start web interface
npm run build:web        # Build Next.js app
cd web
npm run setup            # Auto-configures from CloudFormation
npm run dev

# Open http://localhost:3000
```

---

## 📖 Suggested Learning Path

**New to RAG systems?** We recommend this progressive approach:

### Week 1: Quick Win
1. Run `./deploy-complete.sh` to see the system working
2. Try the sample questions
3. Play with the web UI (after root `npm install`, then `cd web && npm run dev`)
4. **Goal:** Understand what's possible with RAG

### Week 2: Understanding
1. Follow manual cleanup steps (see "Cleaning Up" section below)
2. Deploy again using `./deploy.sh`
3. Manually run `npm run upload-docs` and watch the process
4. Read `docs/01-understanding.md` while ingestion runs
5. **Goal:** Understand the RAG workflow

### Week 3: Deep Dive
1. Destroy and redeploy using manual CDK commands
2. Read through all `lib/*.ts` CDK constructs
3. Follow the full tutorial in `docs/` folder
4. Customize the agent instructions
5. Add your own documents
6. **Goal:** Master the architecture and customize it

### Week 4: Production
1. Implement multi-environment setup (dev/staging/prod)
2. Add monitoring and logging
3. Implement security best practices
4. Optimize for cost and performance
5. **Goal:** Production-ready RAG system

**Don't have 4 weeks?** No problem! Just pick the level that matches your needs.

---

## Sample Data: Nobler Works

This tutorial includes **realistic sample documents** for a fictional SaaS company called Nobler Works The documents are organized into three knowledge base domains:

### 📊 Financial-Data/
- **Q4 2024 Quarterly Report** - Complete financial results ($12.4M revenue, profitability metrics)
- **2025 Annual Budget** - Departmental budgets, headcount plan, $52.8M total budget
- **Corporate Expense Policy** - Travel, meals, equipment reimbursement guidelines
- **Accounts Receivable Aging Report** - AR analysis, collection strategies, DSO metrics

### 👥 Human-Resources/
- **Employee Handbook** - Employment policies, compensation, benefits overview
- **Benefits Guide 2025** - Detailed medical, dental, vision, 401(k), PTO information
- **Remote Work Policy** - Hybrid/full-remote guidelines, home office stipends
- **Performance Review Guidelines** - Rating scale, calibration process, PIP procedures

### 📝 Meeting-Notes/
- **Executive Leadership Meeting (Jan 2025)** - Q4 results, 2025 strategy, org changes
- **Product Roadmap Planning (Q1 2025)** - AI features, mobile app, API marketplace
- **Engineering Sprint Retrospective** - Sprint 24 review, velocity, technical debt

**Try these sample questions:**
- "What was our Q4 2024 revenue?"
- "What are our PTO benefits?"
- "What are the company's top priorities for 2025?"
- "What's our remote work policy?"
- "How much is the home office stipend?"
- "What were the action items from the executive meeting?"

## Tutorial Structure

This tutorial is organized into progressive steps:

### 📘 Step 1: Understanding the Basics
Learn about RAG, Bedrock, and the components we'll use.

### 🏗️ Step 2: Setting Up Infrastructure
Deploy S3 buckets and Bedrock Knowledge Base using CDK.

### 🤖 Step 3: Creating Your First Agent
Build a basic Bedrock agent with knowledge base integration.

### 🎨 Step 4: Customizing Your Agent
Add custom instructions, guardrails, and tool integration.

### 🚀 Step 5: Testing & Deployment
Test your agent and deploy to production.

### 🔧 Step 6: Advanced Customization
Add Lambda functions, API Gateway, and custom tools.

### 💻 Step 7: Building a Web Interface
Create a beautiful chat UI with Next.js, Tailwind CSS, and Bedrock Agents.

## Project Structure

```
bedrock-agents-rag-s3-tutorial/
├── README.md                    # This file
├── LOCAL_DEVELOPMENT.md         # Web UI development guide
├── QUICKSTART.md                # 10-minute quick start
├── docs/                        # Tutorial documentation
│   ├── 01-understanding.md
│   ├── 02-infrastructure.md
│   ├── 03-first-agent.md
│   ├── 04-customization.md
│   ├── 05-testing.md
│   └── 06-advanced.md
├── lib/                         # CDK constructs
│   ├── s3-rag-stack.ts
│   ├── knowledge-base-construct.ts
│   └── bedrock-agent-construct.ts
├── bin/                         # CDK app entry point
│   └── s3-rag-app.ts
├── sample-data/                 # Sample documents
│   └── knowledge-docs/
├── scripts/                     # Utility scripts
│   ├── upload-documents.ts
│   ├── test-agent.ts
│   └── check-status.ts
├── web/                         # Next.js web UI
│   ├── app/                     # Next.js app directory
│   │   ├── api/chat/           # Bedrock API integration
│   │   ├── page.tsx            # Chat interface
│   │   └── globals.css         # Tailwind styles
│   ├── package.json
│   └── README.md               # Web UI documentation
└── cdk.json                     # CDK configuration
```

## What You'll Learn

### AWS Services
- Amazon S3 for document storage
- Amazon S3 Vectors for serverless vector search
- Amazon Bedrock for AI/ML capabilities (Knowledge Bases, Agents, Models)
- AWS Lambda for custom resources
- IAM roles and policies

### CDK Concepts
- Stack and Construct patterns
- Infrastructure as Code best practices
- Resource dependencies
- Environment configuration

### RAG Concepts
- Document chunking and embeddings
- Vector similarity search
- Prompt engineering
- Context retrieval

### Bedrock Agents API
- Agent configuration
- Knowledge base integration
- Agent responses
- Multi-turn conversations

## Customization Points

Throughout this tutorial, you'll learn how to customize:

1. **Document Processing**
   - Chunk size and overlap
   - Metadata extraction
   - File format support

2. **Agent Behavior**
   - System prompts and instructions
   - Response style and tone
   - Guardrails and content filtering

3. **Knowledge Retrieval**
   - Number of retrieved chunks
   - Similarity thresholds
   - Metadata filtering

4. **Tool Integration**
   - Custom Lambda functions
   - API integrations
   - Database queries

## Cost Estimation & Cleanup

Running this tutorial will incur AWS costs:
- **S3**: ~$0.023/GB/month (minimal - just document storage)
- **S3 Vectors**: Pay-per-request (very low for testing)
- **Bedrock**: Pay per token (varies by model)
- **Lambda**: Free tier covers testing

**Total estimated cost**: ~$1-5 for completing the tutorial

### ⚠️ IMPORTANT: Cleanup to Avoid Ongoing Costs

**When you're done with the tutorial, DELETE ALL RESOURCES to avoid charges.**

## Two Cleanup Options

| | Option A: Proper Order | Option B: Force Delete |
|---|---|---|
| **Method** | Delete resources manually in correct order | CloudFormation stack force delete |
| **Time** | 3-5 minutes | 30 seconds |
| **Result** | ✅ Clean - no orphans | ⚠️ May leave orphaned KB |
| **Cost Risk** | None | None (orphans cost $0) |
| **Best For** | Clean teardown | Stuck stacks, urgent cleanup |

### Option A: Proper Order (Recommended - Clean Deletion)

**Deleting in the correct order prevents orphaned resources:**

1. Delete Bedrock Agent first
2. Delete Knowledge Base second
3. Delete S3 Vector buckets
4. Delete S3 data bucket
5. Delete CloudFormation stack last

**Result**: ✅ Clean deletion, no orphaned resources
**Time**: 3-5 minutes
**Follow the detailed steps below** →

---

### Option B: Force Delete CloudFormation Stack (Faster)

**When to use**: Stack is stuck in `ROLLBACK_FAILED` or you're in a hurry

```bash
aws cloudformation delete-stack --stack-name S3VectorRAGStack --region us-east-1
```

**⚠️ What Happens**:
- CloudFormation stack deleted immediately
- **May leave orphaned Knowledge Base** in `DELETE_UNSUCCESSFUL` status
- **No charges incurred**: Orphaned KBs cost $0 (no underlying vector store)
- **Won't affect future deployments**: Next deployment uses unique timestamp

**Orphaned Resources Are Safe**:
- ✅ No cost - KB metadata only, no compute/storage
- ✅ No conflicts - your next deployment has unique names
- ✅ Optional removal - contact AWS Support if you want it cleaned up

**To check for orphans**:
```bash
aws bedrock-agent list-knowledge-bases --region us-east-1 --query "knowledgeBaseSummaries[?starts_with(name, 'kb-')]"
```

If you see KB with `DELETE_UNSUCCESSFUL`, it's harmless. Leave it or contact AWS Support.

---

## Detailed Cleanup Steps (Option A)

**Delete resources in this exact order:**

### Step 1: Delete Bedrock Agent

**Why first?** The agent uses the knowledge base, so delete the agent before the KB.

1. Open [Bedrock Agents Console](https://console.aws.amazon.com/bedrock/home?region=us-east-1#/agents)
2. Find agent: `agent-{YOUR_ACCOUNT_ID}-{TIMESTAMP}` (e.g., `agent-791588190257-251021-1540`)
3. Select the agent → Click **Delete**
4. Confirm deletion
5. ✅ Wait for "Agent deleted successfully" message

---

### Step 2: Delete Knowledge Base

**Why second?** The KB uses S3 Vectors, so delete the KB before the vector store.

1. Open [Bedrock Knowledge Bases Console](https://console.aws.amazon.com/bedrock/home?region=us-east-1#/knowledge-bases)
2. Find KB: `kb-{YOUR_ACCOUNT_ID}-{TIMESTAMP}` (e.g., `kb-791588190257-251021-1540`)
3. Select the KB → Click **Delete**
4. ⚠️ **IMPORTANT**: When prompted:
   - **DO check** "Delete associated data sources"
   - This deletes the S3 data source connection
5. Confirm deletion
6. ✅ Wait for deletion to complete (may take 30-60 seconds)

**⚠️ Troubleshooting**: If the KB gets stuck in `DELETE_UNSUCCESSFUL` status:
- Don't worry - this happens if S3 Vectors were already deleted
- The KB will eventually be cleaned up (may take a few minutes)
- Continue with next steps

---

### Step 3: Delete S3 Vector Store

**Why third?** Must delete indexes before deleting the vector bucket.

1. Open [S3 Vectors Console](https://console.aws.amazon.com/s3/home?region=us-east-1#/vectors)
2. Find vector bucket: `kb-{YOUR_ACCOUNT_ID}-{TIMESTAMP}-vectors-{YOUR_ACCOUNT_ID}-us-east-1`
   - Example: `kb-791588190257-251021-1540-vectors-791588190257-us-east-1`
3. **First: Delete all indexes**
   - Click on the vector bucket
   - Select all indexes (should be `kb-{YOUR_ACCOUNT_ID}-{TIMESTAMP}-index`)
   - Click **Delete** → Confirm
   - ✅ Wait for indexes to be deleted
4. **Then: Delete the vector bucket**
   - Go back to vector buckets list
   - Select the vector bucket
   - Click **Delete** → Confirm

**⚠️ Note**: You MUST delete indexes before the bucket, or deletion will fail.

---

### Step 4: Delete S3 Data Bucket

**Why fourth?** This bucket holds your documents - can be deleted anytime after the KB.

1. Open [S3 Console](https://s3.console.aws.amazon.com/s3/buckets?region=us-east-1)
2. Find bucket: `docs-{YOUR_ACCOUNT_ID}-us-east-1-{TIMESTAMP}`
   - Example: `docs-791588190257-us-east-1-251021-1540`
3. **First: Empty the bucket**
   - Click on the bucket name
   - Click **Empty** button (top right)
   - Type `permanently delete` to confirm
   - Click **Empty**
   - ✅ Wait for "Successfully emptied" message
4. **Then: Delete the bucket**
   - Go back to buckets list
   - Select `bedrock-rag-tutorial-docs-{YOUR_ACCOUNT_ID}-us-east-1`
   - Click **Delete**
   - Type the bucket name to confirm
   - Click **Delete bucket**

---

### Step 5: Delete CloudFormation Stack (Optional)

**Why optional?** All actual AWS resources are already deleted - the stack is just metadata.

1. Open [CloudFormation Console](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks)
2. Find stack: `S3VectorRAGStack`
3. Select the stack → Click **Delete**
4. Confirm deletion

**⚠️ If CloudFormation delete fails**:
- This is NORMAL and expected with S3 Vectors custom resources
- The stack might show `DELETE_FAILED` status
- **Don't worry** - all actual resources are already deleted (Steps 1-4)
- The CloudFormation stack is just metadata and costs nothing
- You can safely leave it or contact AWS Support to remove it

**⚠️ If Knowledge Base gets stuck in DELETE_UNSUCCESSFUL**:
- This happens if the S3 Vector store was deleted before the KB
- The KB is trying to reference vectors that no longer exist
- **Don't worry** - the KB costs nothing and can't be used (no underlying resources)
- Your new deployments will NOT be affected (globally-unique resource names)
- The KB will eventually be cleaned up by AWS (may take days/weeks)
- Or contact AWS Support to manually remove it

**Why does it fail?** CloudFormation tries to delete custom resources (S3 Vectors) that are already gone, causing timeouts. This is a limitation of the `cdk-s3-vectors` community library and S3 Vectors' lack of official CDK support.

**✅ Verification**: Check [AWS Cost Explorer](https://console.aws.amazon.com/cost-management/home#/cost-explorer) 24-48 hours after cleanup to ensure no costs are accruing.

---

## ⚠️ Why Not Use `cdk destroy`?

You might be wondering why we recommend manual cleanup instead of `cdk destroy`:

**The Problem:**
- S3 Vectors is a preview feature without official CDK support
- This tutorial uses `cdk-s3-vectors` (community library with custom CloudFormation resources)
- When you run `cdk destroy`, CloudFormation tries to delete custom resources
- Custom resources often timeout or fail when trying to clean up S3 Vector stores
- This leaves your stack in `DELETE_FAILED` state - very frustrating!

**The Solution:**
- Follow the manual steps above to delete actual AWS resources
- CloudFormation stack failures are harmless (just metadata, no cost)
- Manual cleanup works 100% of the time

**Future**: Once AWS releases official CDK support for S3 Vectors, `cdk destroy` should work reliably.

## Getting Help

### Resources
- Check the [docs/](docs/) folder for detailed step-by-step guides
- Review CDK patterns in [lib/](lib/) folder
- [QUICKSTART.md](QUICKSTART.md) - 10-minute quick start guide

### Official AWS Documentation
- **S3 Vectors**: [Overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html) | [Getting Started](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-getting-started.html)
- **Bedrock**: [Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html) | [Agents](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- **AWS CDK**: [Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/home.html)

---

## Credits & Acknowledgments

### Community Libraries

This tutorial relies on the excellent **[cdk-s3-vectors](https://github.com/bimnett/cdk-s3-vectors)** library:
- **Author**: Bimnet Tesfamariam ([@bimnett](https://github.com/bimnett))
- **Purpose**: CDK constructs for Amazon S3 Vectors (preview feature)
- **Why we use it**: S3 Vectors is not yet available in official AWS CDK/CloudFormation
- **License**: Apache 2.0
- 🙏 **Huge thanks** to Bimnet for creating and maintaining this library, making S3 Vectors accessible to the CDK community!

Without this community contribution, building S3 Vectors-based applications with CDK would be significantly more complex.

### Tutorial Authors

- **Patrick Wiloak** - Architecture, implementation, and documentation
- **Daniel Casale** - Collaboration and testing
