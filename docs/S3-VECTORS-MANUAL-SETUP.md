# Manual S3 Vectors Setup Guide

> **Note**: As of January 2025, Amazon S3 Vectors is in **preview** and AWS CDK does not yet support creating S3 vector buckets and indexes via CloudFormation. This guide shows you how to create these resources manually via the AWS Console, then reference them in your CDK deployment.

## Why Manual Setup?

Amazon S3 Vectors integration with Amazon Bedrock Knowledge Bases is a new feature (announced July 2025) and is still in preview. While the AWS API and Console fully support S3 Vectors, the CloudFormation resource definitions have not been published yet, which means:

- ✅ **AWS Console**: Full support for creating S3 vector buckets and indexes
- ✅ **AWS CLI**: Full support via `aws s3vectors` commands
- ✅ **AWS SDK**: Full programmatic support
- ❌ **AWS CloudFormation/CDK**: Not yet available (coming soon)

Once AWS publishes the CloudFormation schema for S3 Vectors, this tutorial will be updated to use pure CDK.

## Prerequisites

**Supported Regions** (S3 Vectors preview):
- `us-east-1` (US East - N. Virginia)
- `us-east-2` (US East - Ohio)
- `us-west-2` (US West - Oregon)
- `eu-central-1` (Europe - Frankfurt)
- `ap-southeast-2` (Asia Pacific - Sydney)

Ensure you deploy your CDK stack in one of these regions.

## Step 1: Create S3 Vector Bucket

### Via AWS Console

1. **Open the Amazon S3 Console**
   - Navigate to https://console.aws.amazon.com/s3/

2. **Create a new bucket**
   - Click **"Create bucket"**

3. **Configure bucket settings**:
   - **Bucket type**: Select **"Vector bucket"** (this is the key difference!)
   - **Bucket name**: `bedrock-kb-vectors-<your-account-id>-<region>`
     - Example: `bedrock-kb-vectors-123456789012-us-east-1`
     - Must be globally unique
     - Use lowercase letters, numbers, and hyphens only
   - **AWS Region**: Select the same region where you'll deploy the CDK stack
   - **Encryption**: Leave as default (Server-side encryption with Amazon S3 managed keys - SSE-S3)
   - Click **"Create bucket"**

4. **Copy the Vector Bucket ARN**
   - After creation, click on your new vector bucket
   - You'll see the bucket details page
   - **Copy the ARN** (format: `arn:aws:s3vectors:REGION:ACCOUNT:bucket/BUCKET-NAME`)
   - Example: `arn:aws:s3vectors:us-east-1:123456789012:bucket/bedrock-kb-vectors-123456789012-us-east-1`
   - **Save this ARN** - you'll need it in Step 3

### Via AWS CLI (Alternative)

```bash
# Set your variables
BUCKET_NAME="bedrock-kb-vectors-$(aws sts get-caller-identity --query Account --output text)-$(aws configure get region)"

# Create vector bucket
aws s3vectors create-vector-bucket \
  --vector-bucket-name $BUCKET_NAME

# Get the ARN (you'll need this later)
aws s3vectors get-vector-bucket \
  --vector-bucket-name $BUCKET_NAME \
  --query 'VectorBucketArn' \
  --output text
```

## Step 2: Create Vector Index

### Via AWS Console

1. **Navigate to your Vector Bucket**
   - In the S3 Console, click on your newly created vector bucket
   - Click the **"Indexes"** tab

2. **Create a new index**
   - Click **"Create index"**

3. **Configure index settings**:
   - **Index name**: `bedrock-knowledge-base-index`
   - **Vector data type**: `float32`
   - **Dimensions**: `1024`
     - This matches Amazon Titan Embed Text V2 model (1024 dimensions)
     - If using a different embedding model, adjust accordingly
   - **Distance metric**: `Cosine`
     - Cosine similarity is standard for text embeddings
   - Click **"Create index"**

4. **Copy the Vector Index ARN**
   - After creation, click on the index name
   - **Copy the ARN** (format: `arn:aws:s3vectors:REGION:ACCOUNT:bucket/BUCKET-NAME/index/INDEX-NAME`)
   - Example: `arn:aws:s3vectors:us-east-1:123456789012:bucket/bedrock-kb-vectors-123456789012-us-east-1/index/bedrock-knowledge-base-index`
   - **Save this ARN** - you'll need it in Step 3

### Via AWS CLI (Alternative)

```bash
# Using the bucket name from Step 1
INDEX_NAME="bedrock-knowledge-base-index"

# Create vector index
aws s3vectors create-index \
  --vector-bucket-name $BUCKET_NAME \
  --index-name $INDEX_NAME \
  --data-type float32 \
  --dimension 1024 \
  --distance-metric cosine

# Get the ARN (you'll need this later)
aws s3vectors get-index \
  --vector-bucket-name $BUCKET_NAME \
  --index-name $INDEX_NAME \
  --query 'IndexArn' \
  --output text
```

## Step 3: Configure CDK Deployment

Now that you have the S3 vector resources created, configure your CDK deployment to use them.

### Option A: Using cdk.json (Recommended)

1. **Open `cdk.json`** in the project root

2. **Add the context section** (or update if it exists):
   ```json
   {
     "app": "npx ts-node --prefer-ts-exts bin/s3-rag.ts",
     "context": {
       "vectorBucketArn": "arn:aws:s3vectors:us-east-1:123456789012:bucket/bedrock-kb-vectors-123456789012-us-east-1",
       "vectorIndexArn": "arn:aws:s3vectors:us-east-1:123456789012:bucket/bedrock-kb-vectors-123456789012-us-east-1/index/bedrock-knowledge-base-index"
     }
   }
   ```

3. **Replace with your actual ARNs** from Steps 1 and 2

### Option B: Using CLI Parameters (Alternative)

You can pass the ARNs at deployment time:

```bash
cdk deploy \
  --context vectorBucketArn="arn:aws:s3vectors:..." \
  --context vectorIndexArn="arn:aws:s3vectors:..."
```

## Step 4: Deploy the CDK Stack

Now deploy the stack normally:

```bash
# Build the project
npm run build

# Deploy
cdk deploy
```

The CDK stack will:
- ✅ Create an S3 bucket for your documents
- ✅ Create a Bedrock Knowledge Base using your manually-created S3 vector store
- ✅ Create a Bedrock Agent with access to the Knowledge Base
- ✅ Set up all necessary IAM permissions

**Deployment time**: ~3-5 minutes (much faster than OpenSearch Serverless!)

## Step 5: Verify the Deployment

After deployment completes, verify everything is working:

### Check the Knowledge Base

```bash
# Get the Knowledge Base ID from CDK outputs
KB_ID=$(aws cloudformation describe-stacks \
  --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseIdOutput`].OutputValue' \
  --output text)

# Get Knowledge Base details
aws bedrock-agent get-knowledge-base --knowledge-base-id $KB_ID
```

Look for:
- `"type": "S3_VECTORS"` in the `storageConfiguration` section
- Your vector bucket and index ARNs

### Test the Agent

```bash
# Upload sample documents
npm run upload-docs

# Check ingestion status
npm run check-status

# Test the agent
npm run test-agent
```

## Cost Considerations

### S3 Vectors Pricing (Preview - subject to change)

**Advantages over OpenSearch Serverless**:
- 💰 **Lower storage costs**: Up to 90% cheaper than OpenSearch
- 💰 **No infrastructure costs**: Fully serverless, pay only for what you use
- 💰 **No minimum charges**: Unlike OpenSearch Serverless (minimum ~$700/month)

**Estimated costs for this tutorial**:
- Storage: $0.10 - $1.00/month (for small document sets)
- Queries: $0.001 per 1000 queries
- **Total**: ~$1-5/month for development/testing

## Cleanup

To avoid ongoing charges:

### 1. Delete the CDK Stack

```bash
cdk destroy
```

### 2. Manually Delete S3 Vector Resources

**Via Console**:
1. Go to S3 Console
2. Select your vector bucket
3. Click **"Indexes"** tab
4. Select the index and click **"Delete"**
5. After index deletion completes, delete the vector bucket

**Via CLI**:
```bash
# Delete the index
aws s3vectors delete-index \
  --vector-bucket-name $BUCKET_NAME \
  --index-name $INDEX_NAME

# Delete the vector bucket
aws s3vectors delete-vector-bucket \
  --vector-bucket-name $BUCKET_NAME
```

## Troubleshooting

### "S3 Vectors not available in this region"

**Solution**: Ensure you're in a supported region:
- us-east-1, us-east-2, us-west-2, eu-central-1, ap-southeast-2

### "Insufficient permissions to create vector bucket"

**Solution**: Ensure your IAM user/role has:
- `s3vectors:CreateVectorBucket`
- `s3vectors:CreateIndex`
- `s3vectors:PutVector`
- `s3vectors:QueryVectors`

### "Knowledge Base creation fails"

**Possible causes**:
1. ARNs in `cdk.json` are incorrect
   - Double-check the ARNs match exactly
2. Vector bucket/index in different region than CDK stack
   - Must be in the same region
3. Missing IAM permissions
   - The Knowledge Base role needs `s3vectors:*` permissions (CDK handles this)

### "Property validation failed: S3_VECTORS is not a valid enum value"

This means you tried to create S3 vector resources via CDK/CloudFormation directly. You must:
1. Create vector bucket and index manually (Steps 1-2)
2. Reference them via ARNs in `cdk.json` (Step 3)

## Next Steps

After successful deployment:

1. **Upload documents**:
   ```bash
   npm run upload-docs
   ```

2. **Check ingestion status**:
   ```bash
   npm run check-status
   ```

3. **Test the agent**:
   ```bash
   npm run test-agent
   ```

4. **Try the web UI** (optional):
   ```bash
   cd web
   npm install
   npm run dev
   ```
   Open http://localhost:3000

## When will CDK support S3 Vectors?

AWS typically adds CloudFormation support for new services within 3-6 months of general availability. Since S3 Vectors is currently in preview (as of January 2025), expect:

- **Q2 2025**: General Availability
- **Q3 2025**: CloudFormation/CDK support

This tutorial will be updated to use pure CDK once support is available.

## References

- [Amazon S3 Vectors Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html)
- [Using S3 Vectors with Bedrock Knowledge Bases](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-bedrock-kb.html)
- [AWS CLI S3 Vectors Reference](https://docs.aws.amazon.com/cli/latest/reference/s3vectors/index.html)
