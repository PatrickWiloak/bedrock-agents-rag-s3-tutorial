# S3 Vectors Manual Setup Guide

This guide walks you through manually creating an S3 vector bucket and index for use with Amazon Bedrock Knowledge Bases.

## Prerequisites

- AWS Account with access to Amazon S3 Vectors (preview feature)
- S3 Vectors is available in: `us-east-1`, `us-east-2`, `us-west-2`, `eu-central-1`, `ap-southeast-2`
- Ensure you're deploying to one of these supported regions

## Step 1: Create S3 Vector Bucket

1. **Open the Amazon S3 Console**
   - Navigate to https://console.aws.amazon.com/s3/

2. **Create a Vector Bucket**
   - Click "Create bucket"
   - **Bucket type**: Select "Vector bucket"
   - **Bucket name**: `bedrock-kb-vectors-<your-account-id>-<region>`
     - Replace `<your-account-id>` with your AWS account ID
     - Replace `<region>` with your deployment region (e.g., `us-east-1`)
   - **Region**: Select the same region where you'll deploy the CDK stack
   - **Encryption**: Leave as default (AES-256)
   - Click "Create bucket"

3. **Note the Vector Bucket ARN**
   - After creation, click on the bucket name
   - Copy the ARN (format: `arn:aws:s3vectors:REGION:ACCOUNT:bucket/BUCKET-NAME`)
   - Save this ARN - you'll need it for deployment

## Step 2: Create Vector Index

1. **Navigate to your Vector Bucket**
   - In the S3 console, click on your newly created vector bucket

2. **Create a Vector Index**
   - Click the "Indexes" tab
   - Click "Create index"
   - **Index name**: `bedrock-knowledge-base-index`
   - **Vector data type**: `float32`
   - **Dimensions**: `1024` (for Amazon Titan Embed Text V2 model)
   - **Distance metric**: `Cosine`
   - Click "Create index"

3. **Note the Vector Index ARN**
   - After creation, click on the index name
   - Copy the ARN (format: `arn:aws:s3vectors:REGION:ACCOUNT:bucket/BUCKET-NAME/index/INDEX-NAME`)
   - Save this ARN - you'll need it for deployment

## Step 3: Update CDK Configuration

1. **Open `cdk.json`** in the project root

2. **Add the following context values**:
   ```json
   {
     "context": {
       "vectorBucketArn": "arn:aws:s3vectors:REGION:ACCOUNT:bucket/BUCKET-NAME",
       "vectorIndexArn": "arn:aws:s3vectors:REGION:ACCOUNT:bucket/BUCKET-NAME/index/INDEX-NAME"
     }
   }
   ```

3. **Replace the ARN values** with the actual ARNs you copied in Steps 1 and 2

## Step 4: Deploy the CDK Stack

Now you can proceed with the normal CDK deployment:

```bash
npm run build
cdk deploy
```

The CDK stack will:
- Create an S3 bucket for your documents
- Create a Bedrock Knowledge Base that uses your manually-created S3 vector store
- Create a Bedrock Agent with access to the Knowledge Base
- Set up all necessary IAM permissions

## Verification

After deployment, verify the Knowledge Base is using S3 Vectors:

```bash
aws bedrock-agent get-knowledge-base --knowledge-base-id <KB-ID-FROM-OUTPUT>
```

Look for `"type": "S3_VECTORS"` in the `storageConfiguration` section.

## Cost Considerations

**S3 Vectors Pricing** (Preview - subject to change):
- Storage: Significantly lower than OpenSearch Serverless
- Queries: Pay per query
- No infrastructure costs (serverless)

Estimated monthly cost for this tutorial (with minimal usage): **~$1-5**

## Cleanup

To avoid ongoing charges:

1. **Delete the CDK stack**:
   ```bash
   cdk destroy
   ```

2. **Manually delete the S3 Vector resources**:
   - Go to the S3 Console
   - Select your vector bucket
   - Click "Delete index" for the index
   - Click "Delete bucket"

## Troubleshooting

### "S3 Vectors not available in this region"
- Ensure you're in one of the supported regions listed in Prerequisites

### "Insufficient permissions"
- Ensure your IAM user/role has permissions for:
  - `s3vectors:CreateVectorBucket`
  - `s3vectors:CreateIndex`
  - `s3vectors:PutVector`
  - `s3vectors:QueryVectors`

### "Knowledge Base creation fails with 403"
- Verify the vector bucket and index ARNs are correct in `cdk.json`
- Ensure the Knowledge Base role has proper s3vectors permissions (CDK handles this automatically)

## Next Steps

After successful deployment:
1. Upload sample documents: `npm run upload-docs`
2. Test the agent: `npm run test-agent`
3. Check ingestion status: `npm run check-status`
