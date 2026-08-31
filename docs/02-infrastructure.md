# Step 2: Setting Up Infrastructure

Walk through the CDK stack resource by resource, then deploy it.

## What we'll deploy

| Resource | Type | Purpose |
|---|---|---|
| Document bucket | `AWS::S3::Bucket` | Holds the source documents |
| Vector bucket | `AWS::S3Vectors::VectorBucket` | Container for vector indexes |
| Vector index | `AWS::S3Vectors::Index` | 1024-dim, cosine, stores the embeddings |
| Knowledge base role | `AWS::IAM::Role` | What Bedrock assumes to do the work |
| Knowledge base | `AWS::Bedrock::KnowledgeBase` | Ties the index and embedding model together |
| Data source | `AWS::Bedrock::DataSource` | Points the KB at the document bucket |
| Chat handler | `AWS::Lambda::Function` | Calls `RetrieveAndGenerate` |
| Chat API | `AWS::ApiGateway::RestApi` | `POST /chat` |
| Website bucket | `AWS::S3::Bucket` | Next.js static export |
| CDN | `AWS::CloudFront::Distribution` | Serves the UI over HTTPS |

Everything is native CloudFormation. The only custom resources in the template are CDK's own `S3AutoDeleteObjects` and `CDKBucketDeployment`, which come from `autoDeleteObjects: true` and the static site upload.

## Project structure review

```
bin/s3-rag-app.ts                 # CDK app entry point
lib/
  s3-rag-stack.ts                 # The stack: buckets, KB, web hosting, outputs
  knowledge-base-construct.ts     # S3 Vectors + Knowledge Base + data source
  web-hosting-construct.ts        # Lambda + API Gateway + CloudFront + S3
lambda/bedrock-api.ts             # RetrieveAndGenerate handler
```

Three constructs, roughly 350 lines total.

## Understanding the stack

### Main stack (`lib/s3-rag-stack.ts`)

The stack does four things.

**1. Generates a deployment ID.** Vector bucket and knowledge base names must be unique per account, and S3 caps bucket names at 63 characters. A `YYMMDD-HHMM` stamp keeps teardown/redeploy cycles from colliding:

```typescript
const deploymentId = this.node.tryGetContext('deploymentId') || /* timestamp */;
```

Override it: `cdk deploy --context deploymentId=251021-1540`

**2. Creates the document bucket.**

```typescript
const dataBucket = new s3.Bucket(this, 'DataBucket', {
  bucketName: `docs-${this.account}-${this.region}-${deploymentId}`,
  removalPolicy: cdk.RemovalPolicy.DESTROY,  // tutorial only
  autoDeleteObjects: true,                   // tutorial only
  encryption: s3.BucketEncryption.S3_MANAGED,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
});
```

`DESTROY` + `autoDeleteObjects` are deliberate tutorial choices so `cdk destroy` leaves nothing behind. **Do not carry them into production** - they mean a stack deletion silently deletes your documents.

**3. Instantiates the knowledge base and web hosting constructs.**

**4. Declares the model and prompt template.**

```typescript
const DEFAULT_MODEL_ID = 'us.anthropic.claude-opus-5';
const modelId = this.node.tryGetContext('modelId') || DEFAULT_MODEL_ID;
```

Note the `us.` prefix - that's an inference profile, not a bare foundation model. See [chapter 01](01-understanding.md#foundation-models-and-inference-profiles).

### Knowledge base construct (`lib/knowledge-base-construct.ts`)

**The vector bucket and index:**

```typescript
this.vectorBucket = new s3vectors.CfnVectorBucket(this, 'VectorBucket', {
  vectorBucketName: `${props.knowledgeBaseName}-vectors`,
});

this.vectorIndex = new s3vectors.CfnIndex(this, 'VectorIndex', {
  vectorBucketName: this.vectorBucket.vectorBucketName,
  indexName: `${props.knowledgeBaseName}-index`,
  dataType: 'float32',
  dimension: embeddingDimension,   // must match the embedding model
  distanceMetric: 'cosine',
  metadataConfiguration: {
    nonFilterableMetadataKeys: ['AMAZON_BEDROCK_TEXT', 'AMAZON_BEDROCK_METADATA'],
  },
});
```

> **`nonFilterableMetadataKeys` is load-bearing.** S3 Vectors allows 40KB of metadata per vector but only **2KB of filterable metadata**. Bedrock stores the chunk text in `AMAZON_BEDROCK_TEXT`, which routinely exceeds 2KB. Without this declaration, ingestion fails with `metadata must have at most 2048 bytes`.

The index references its bucket **by name**, so CloudFormation can't infer creation order. Hence the explicit dependency:

```typescript
this.vectorIndex.addResourceDependency(this.vectorBucket);
```

`dimension`, `distanceMetric`, `dataType`, and `metadataConfiguration` are all **create-only** properties. Changing any of them replaces the index, which discards every stored vector - you must re-run ingestion afterwards.

**The knowledge base:**

```typescript
this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
  name: props.knowledgeBaseName,
  roleArn: this.role.roleArn,
  knowledgeBaseConfiguration: {
    type: 'VECTOR',
    vectorKnowledgeBaseConfiguration: {
      embeddingModelArn,
      embeddingModelConfiguration: {
        bedrockEmbeddingModelConfiguration: {
          dimensions: embeddingDimension,
          embeddingDataType: 'FLOAT32',
        },
      },
    },
  },
  storageConfiguration: {
    type: 'S3_VECTORS',
    s3VectorsConfiguration: { indexArn: this.vectorIndex.attrIndexArn },
  },
});
```

`S3_VECTORS` is one of seven storage types the resource accepts, alongside `OPENSEARCH_SERVERLESS`, `PINECONE`, `RDS`, `NEPTUNE_ANALYTICS`, `MONGO_DB_ATLAS`, and `OPENSEARCH_MANAGED_CLUSTER`.

**The data source:**

```typescript
this.dataSource = new bedrock.CfnDataSource(this, 'DataSource', {
  knowledgeBaseId: this.knowledgeBaseId,
  dataSourceConfiguration: {
    type: 'S3',
    s3Configuration: { bucketArn: props.dataBucket.bucketArn },
  },
  vectorIngestionConfiguration: {
    chunkingConfiguration: {
      chunkingStrategy: 'FIXED_SIZE',
      fixedSizeChunkingConfiguration: { maxTokens: 300, overlapPercentage: 7 },
    },
  },
  dataDeletionPolicy: 'RETAIN',
});
```

### Web hosting construct (`lib/web-hosting-construct.ts`)

A Lambda calling `RetrieveAndGenerate`, an API Gateway REST API in front of it, and a CloudFront distribution serving the Next.js export from a private S3 bucket via **Origin Access Control**.

The Lambda's environment carries the knowledge base ID, the model ARN, retrieval depth, and the prompt template - so tuning any of those is a `cdk deploy`, not a code change.

## Customization points

### 1. Bucket naming

`lib/s3-rag-stack.ts` - the `docs-` and `kb-` prefixes are short on purpose. The vector bucket name is derived from the KB name, and the total must stay under 63 characters.

### 2. Knowledge base settings

```typescript
const knowledgeBase = new KnowledgeBaseConstruct(this, 'KnowledgeBase', {
  dataBucket,
  knowledgeBaseName: `kb-${this.account}-${deploymentId}`,
  embeddingModelId: 'amazon.titan-embed-text-v2:0',
  embeddingDimension: 1024,
  chunkSize: 300,
  chunkOverlapPercentage: 7,
});
```

Add `dataPrefix: 'Financial-Data/'` to index only one folder.

### 3. Model selection

No code change needed:

```bash
cdk deploy --context modelId=us.anthropic.claude-haiku-4-5-20251001-v1:0
```

### 4. Answer style

Edit `PROMPT_TEMPLATE` in `lib/s3-rag-stack.ts`. It must contain `$search_results$`. Covered in [chapter 04](04-customization.md).

## Deployment steps

### Step 1: Install dependencies

```bash
npm install
```

This installs both the CDK dependencies and the `web` workspace.

### Step 2: Configure AWS credentials

```bash
aws configure
aws sts get-caller-identity
```

### Step 3: Bootstrap CDK (first time per account/Region)

```bash
cdk bootstrap
```

### Step 4: Build the web UI

```bash
npm run build:web
```

**Do this before `cdk deploy`.** The stack uploads `web/out`, and synthesis fails if it doesn't exist.

### Step 5: Review the stack

```bash
npm run synth     # render the CloudFormation template
npm run diff      # compare against what's deployed
```

Worth doing once - `cdk synth` shows exactly what CDK generates from those 350 lines.

### Step 6: Deploy

```bash
cdk deploy
```

Expect 5-8 minutes. Docker must be running; CDK bundles the Lambda in a `public.ecr.aws/sam/build-nodejs22.x` container.

### Step 7: Save the outputs

```bash
aws cloudformation describe-stacks --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs' --output table
```

Key outputs: `DataBucketName`, `KnowledgeBaseIdOutput`, `DataSourceIdOutput`, `ModelId`, `WebsiteURL`, `ApiEndpoint`.

## Understanding IAM roles

### Knowledge base role

Assumed by `bedrock.amazonaws.com`, scoped with `aws:SourceAccount`:

```typescript
assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
  conditions: { StringEquals: { 'aws:SourceAccount': account } },
}),
```

It grants exactly three things: invoke the embedding model, read the document bucket, and read/write the vector index.

> **Why no `aws:SourceArn` condition?** The knowledge base needs this role's ARN when it is created. Referencing the knowledge base ARN back from the role would be a circular dependency CloudFormation can't resolve.

### Lambda role

```typescript
actions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
resources: [props.knowledgeBaseArn],
```

plus `bedrock:InvokeModel` on **both** the inference profile ARN and the underlying foundation model ARN:

```typescript
const modelArn = `arn:aws:bedrock:${region}:${account}:inference-profile/${modelId}`;
const baseModelArn = `arn:aws:bedrock:*::foundation-model/${baseModelIdOf(modelId)}`;
```

Granting only the profile produces an `AccessDeniedException` naming a Region you never configured - because the profile routed there. See [ARCHITECTURE.md](../ARCHITECTURE.md#iam-and-why-inference-profiles-complicate-it).

## Verifying deployment

```bash
# Stack status
aws cloudformation describe-stacks --stack-name S3VectorRAGStack \
  --query 'Stacks[0].StackStatus' --output text

# Everything the stack created
aws cloudformation list-stack-resources --stack-name S3VectorRAGStack \
  --query 'StackResourceSummaries[].[ResourceType,LogicalResourceId,ResourceStatus]' --output table

# Knowledge base - should be ACTIVE with storage type S3_VECTORS
KB_ID=$(aws cloudformation describe-stacks --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseIdOutput`].OutputValue' --output text)
aws bedrock-agent get-knowledge-base --knowledge-base-id "$KB_ID" \
  --query 'knowledgeBase.[status,storageConfiguration.type]' --output text

# The vector index
aws s3vectors list-vector-buckets --region us-east-1
```

Or run the whole check at once:

```bash
./test-bedrock.sh
```

## Troubleshooting

| Error | Cause and fix |
|---|---|
| `Model access not enabled` / `AccessDeniedException` on the model | Enable it in the Bedrock console under **Model access**. The error may name an unfamiliar Region - that's inference-profile routing. |
| `metadata must have at most 2048 bytes` during ingestion | The index is missing `nonFilterableMetadataKeys`. |
| `Cannot find asset ... web/out` | Run `npm run build:web` first. |
| Bundling fails / cannot pull image | Docker isn't running. |
| `Bucket already exists` | Deploy with a fresh ID: `cdk deploy --context deploymentId=$(date -u +%y%m%d-%H%M)` |
| `Rate exceeded` | Bedrock throttling. Wait and retry. |
| `Stack already exists` in `ROLLBACK_COMPLETE` | `cdk destroy` then redeploy - CloudFormation can't update from that state. |
| Insufficient permissions | Attach [iam-policy.json](../iam-policy.json). |

## Cost implications

What accrues while the stack is up:

- **S3 storage** - fractions of a cent for the sample documents
- **S3 Vectors** - per GB stored and per request; no provisioned capacity, so idle cost is essentially nil
- **CloudFront + API Gateway + Lambda** - free tier covers tutorial usage
- **Bedrock** - only when you ingest or query

The important difference from an OpenSearch Serverless backend: **there is no always-on capacity charge.** An idle stack costs close to nothing. Delete it anyway when you're done:

```bash
npm run destroy
```

## What we created

A complete RAG pipeline in three CDK constructs, with no custom resources, no manual console steps, and a clean teardown.

## Next steps

→ **[Step 3: Querying Your Knowledge Base](03-querying.md)** - upload documents, run ingestion, and ask questions.

## Additional resources

- [AWS::Bedrock::KnowledgeBase](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrock-knowledgebase.html)
- [AWS::S3Vectors::Index](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-s3vectors-index.html)
- [CDK Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
