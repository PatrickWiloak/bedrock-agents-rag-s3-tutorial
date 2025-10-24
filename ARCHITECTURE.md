# Architecture & Request Flow

This document explains how requests flow through the system, from the user's browser to Bedrock and back.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           User's Browser                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          CloudFront CDN                             │
│  • Serves static Next.js website from S3                            │
│  • HTTPS only (redirects HTTP → HTTPS)                              │
│  • Error handling: 404/403 → index.html (SPA routing)               │
│  • Caches static files (GET/HEAD/OPTIONS)                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
        ┌──────────────────────┐    ┌──────────────────────┐
        │     S3 Bucket        │    │  API Gateway         │
        │  (Static Website)    │    │  (Bedrock API)       │
        │  • index.html        │    │  • /prod/chat        │
        │  • config.json       │    │  • CORS enabled      │
        │  • JS/CSS bundles    │    │  • POST only         │
        └──────────────────────┘    └──────────────────────┘
                                              │
                                              │ Lambda Proxy
                                              ▼
                                  ┌──────────────────────┐
                                  │   Lambda Function    │
                                  │  (bedrock-api.ts)    │
                                  │  • CORS headers      │
                                  │  • Agent invocation  │
                                  └──────────────────────┘
                                              │
                                              │ AWS SDK
                                              ▼
                                  ┌──────────────────────┐
                                  │  Amazon Bedrock      │
                                  │  • Agent ID          │
                                  │  • Alias: TSTALIASID │
                                  │  • Streaming         │
                                  └──────────────────────┘
                                              │
                                              │ RAG Query
                                              ▼
                                  ┌──────────────────────┐
                                  │  Knowledge Base      │
                                  │  • S3 Vectors        │
                                  │  • Titan Embeddings  │
                                  │  • Document retrieval│
                                  └──────────────────────┘
```

## Learn More

- [AWS Bedrock Agents](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [API Gateway CORS](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html)
- [CloudFront + S3 Static Hosting](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web.html)
- [S3 Vectors (Preview)](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-s3-vector-storage/)
