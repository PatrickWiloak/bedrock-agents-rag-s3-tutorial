# Architecture & Request Flow

This document traces what actually happens when a document is ingested and when a question is asked.

## System Architecture

```
                          ┌──────────────────┐
                          │  Users/Browsers  │
                          └────────┬─────────┘
                                   │ HTTPS
                                   ▼
                    ┌──────────────────────────────┐
                    │  CloudFront Distribution     │
                    │  (Origin Access Control)     │
                    └──────┬────────────────┬──────┘
                           │                │
              static files │                │ (browser calls the API
                           ▼                │  directly, not through
              ┌────────────────────┐        │  CloudFront)
              │  S3 website bucket │        │
              │  Next.js export    │        │
              │  + config.json     │        │
              └────────────────────┘        │
                                            ▼
                              ┌──────────────────────────┐
                              │  API Gateway  POST /chat │
                              └────────────┬─────────────┘
                                           ▼
                              ┌──────────────────────────┐
                              │  Lambda: bedrock-api     │
                              │  RetrieveAndGenerate     │
                              └────────────┬─────────────┘
                                           ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │                    Bedrock Knowledge Base                         │
   │                                                                   │
   │   1. embed question    ──►  amazon.titan-embed-text-v2:0          │
   │   2. similarity search ──►  S3 Vectors index (cosine, 1024-dim)   │
   │   3. build prompt      ──►  top-k chunks + PROMPT_TEMPLATE        │
   │   4. generate          ──►  Claude via inference profile          │
   │                             → answer + citations                  │
   └───────────────────────────────────────────────────────────────────┘
                                           ▲
                                           │ ingestion
   ┌───────────────────────────────────────┴───────────────────────────┐
   │  S3 document bucket                                               │
   │  Financial-Data/ · Human-Resources/ · Meeting-Notes/              │
   └───────────────────────────────────────────────────────────────────┘
```

## Ingestion flow

Ingestion runs when you call `StartIngestionJob` (which `npm run upload-docs` does for you). It is **not** automatic on upload.

1. **Upload** - documents land in the S3 document bucket under a category folder.
2. **Scan** - the data source enumerates objects under its `inclusionPrefixes` (this stack indexes the whole bucket).
3. **Parse** - Bedrock extracts text. Markdown, PDF, DOCX, TXT, HTML, and CSV are supported.
4. **Chunk** - `FIXED_SIZE` chunking at 300 tokens with 7% overlap. Overlap keeps a sentence that straddles a boundary retrievable from either chunk.
5. **Embed** - each chunk goes through Titan Text Embeddings V2, producing a 1024-dimension float32 vector.
6. **Store** - vectors are written into the S3 Vectors index, alongside metadata: `AMAZON_BEDROCK_TEXT` (the chunk text) and `AMAZON_BEDROCK_METADATA` (source URI and friends).

Track it with `npm run check-status`.

> **Why those two metadata keys are marked non-filterable.** S3 Vectors allows 40KB of metadata per vector but only **2KB of *filterable* metadata**. The chunk text alone usually exceeds 2KB. Declaring `AMAZON_BEDROCK_TEXT` and `AMAZON_BEDROCK_METADATA` as `nonFilterableMetadataKeys` on the index is what prevents ingestion failing with `metadata must have at most 2048 bytes`. See [lib/knowledge-base-construct.ts](lib/knowledge-base-construct.ts).

## Query flow

```
browser                Lambda                    Bedrock KB
   │                     │                            │
   │ POST /chat          │                            │
   │ {message,           │                            │
   │  sessionId?}        │                            │
   ├────────────────────►│                            │
   │                     │ RetrieveAndGenerate        │
   │                     ├───────────────────────────►│
   │                     │                            │ embed question
   │                     │                            │ search index
   │                     │                            │ prompt + generate
   │                     │  {output.text,             │
   │                     │   citations[],             │
   │                     │   sessionId}               │
   │                     │◄───────────────────────────┤
   │ {response,          │                            │
   │  citations[],       │                            │
   │  sessionId}         │                            │
   │◄────────────────────┤                            │
```

One API call does the whole loop. The Lambda's job is only to translate between HTTP and the Bedrock SDK, flatten citations, and add CORS headers.

### Sessions

`RetrieveAndGenerate` keeps conversation history server-side and **issues its own session IDs**. This has one consequence worth internalising:

- The **first** request of a conversation must omit `sessionId` entirely.
- The response carries a `sessionId`; send that back on subsequent requests to continue the conversation.
- A client-invented session ID is rejected with a validation error.

Both [lambda/bedrock-api.ts](lambda/bedrock-api.ts) and [web/app/page.tsx](web/app/page.tsx) implement this - the browser's `sessionId` state starts empty and is only ever populated from a response.

### Citations

The response groups references by the span of generated text they support, so the same document commonly appears several times. The Lambda flattens them into a deduplicated list of S3 URIs for the UI.

## IAM, and why inference profiles complicate it

Two roles matter:

**The knowledge base role** (`KnowledgeBaseRole`) is assumed by `bedrock.amazonaws.com` and needs:
- `bedrock:InvokeModel` on the embedding model
- `s3:GetObject` / `s3:ListBucket` on the document bucket
- `s3vectors:PutVectors` / `QueryVectors` / `GetVectors` / `ListVectors` / `DeleteVectors` / `GetIndex` on the index

Its trust policy is scoped with `aws:SourceAccount`. It deliberately does **not** use `aws:SourceArn` against the knowledge base ARN, because the knowledge base needs the role ARN at creation time - referencing the knowledge base from the role would be a circular dependency.

**The Lambda role** needs:
- `bedrock:Retrieve` and `bedrock:RetrieveAndGenerate` on the knowledge base ARN
- `bedrock:InvokeModel` on **both** the inference profile ARN **and** the underlying foundation model ARN

That last point catches people out. An inference profile like `us.anthropic.claude-opus-5` routes requests to the same model in one of several Regions, and authorization is evaluated against the foundation model in whichever Region serves the request. So the policy needs both:

```
arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-opus-5
arn:aws:bedrock:*::foundation-model/anthropic.claude-opus-5
```

Granting only the profile ARN produces an `AccessDeniedException` that names a Region you never configured. [lib/web-hosting-construct.ts](lib/web-hosting-construct.ts) derives the base model ARN by stripping the Region prefix.

## Resource inventory

Everything below is native CloudFormation. There are no custom resources except CDK's own `S3AutoDeleteObjects` and `CDKBucketDeployment`, which come from `autoDeleteObjects: true` and the static site upload.

| Resource | Type |
|---|---|
| Document bucket | `AWS::S3::Bucket` |
| Vector bucket | `AWS::S3Vectors::VectorBucket` |
| Vector index | `AWS::S3Vectors::Index` |
| Knowledge base | `AWS::Bedrock::KnowledgeBase` (`S3VectorsConfiguration`) |
| Data source | `AWS::Bedrock::DataSource` |
| Chat API handler | `AWS::Lambda::Function` |
| Chat API | `AWS::ApiGateway::RestApi` |
| Website bucket | `AWS::S3::Bucket` |
| CDN | `AWS::CloudFront::Distribution` + `OriginAccessControl` |

## Learn More

- [docs/01-understanding.md](docs/01-understanding.md) - RAG concepts from scratch
- [docs/02-infrastructure.md](docs/02-infrastructure.md) - the CDK stack line by line
- [docs/03-querying.md](docs/03-querying.md) - the query API in depth
