# CLAUDE.md

Context for AI assistants working in this repository.

## What this is

A **public teaching repository**: a tutorial for building RAG on AWS with Amazon Bedrock Knowledge Bases and S3 Vectors. It is not a production service.

That framing drives most decisions here. The audience is people who have never used Bedrock, so **clarity beats cleverness**, comments explain *why* rather than *what*, and anything surprising gets called out explicitly rather than left for the reader to discover through a failed deploy.

## Architecture in one paragraph

Documents in S3 → Bedrock Knowledge Base ingests, chunks (300 tokens, 7% overlap), and embeds them with Titan Text Embeddings V2 → vectors land in an S3 Vectors index → questions go through `RetrieveAndGenerateStream` → answers stream back with citations. A streaming Lambda Function URL sits behind CloudFront at `/api/*`, on the same distribution that serves the static Next.js UI. Three CDK constructs, ~400 lines. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Facts that are easy to get wrong

These caused real bugs. Verify before changing anything nearby.

1. **Bedrock Agents Classic closed to new customers on 2026-07-30.** Do not reintroduce `AWS::Bedrock::Agent`, `CreateAgent`, or `InvokeAgent` - accounts without prior usage get a 403 and there is no exception process. This tutorial deliberately uses `RetrieveAndGenerate` instead. If agents are genuinely needed, the path is AgentCore (`AWS::BedrockAgentCore::*`).

2. **Every current Claude model on Bedrock is inference-profile only.** Model IDs need a Region prefix (`us.anthropic.claude-opus-5`). There is no `ON_DEMAND` variant. Verify with `aws bedrock list-inference-profiles`.

3. **`bedrock:InvokeModel` needs two ARNs**, the inference profile *and* the underlying foundation model with a wildcard Region:
   ```
   arn:aws:bedrock:<region>:<account>:inference-profile/us.anthropic.claude-opus-5
   arn:aws:bedrock:*::foundation-model/anthropic.claude-opus-5
   ```
   Granting only the profile fails at runtime with an error naming an unrelated Region.

4. **`nonFilterableMetadataKeys` on the S3 Vectors index is load-bearing.** S3 Vectors allows 2KB of *filterable* metadata; Bedrock's `AMAZON_BEDROCK_TEXT` exceeds it. Without the declaration, ingestion fails with `metadata must have at most 2048 bytes`. The property is create-only.

5. **`RetrieveAndGenerate` issues session IDs.** The first request must omit `sessionId`; a client-generated one is rejected. The UI's `sessionId` state starts empty and is only ever set from a response.

6. **The root `.gitignore` must not contain a bare `*.js`.** It previously did, which silently excluded `web/next.config.js` and `web/postcss.config.js` and made the web UI unbuildable from a fresh clone. The rules are now scoped to `/bin`, `/lib`, `/lambda`, `/scripts`.

7. **`npm run build:web` must run before `cdk deploy`.** The stack uploads `web/out`; synthesis fails if it doesn't exist. `./scripts/deploy.sh` does it for you.

8. **CloudFront `compress` must stay `false` on the `/api/*` behaviour.** Compression buffers the response and silently stops streaming - no error, the answer just arrives all at once.

9. **The Lambda handler is `lambda/chat.mjs`, deliberately plain JavaScript.** It was previously `bedrock-api.ts` while `tsconfig.json` excluded `lambda/`, so nothing compiled it and the runtime could not load it. Do not reintroduce a TypeScript handler without also wiring up a build step.

10. **`RetrieveAndGenerateStream` reports failures as members of the stream union**, not as thrown exceptions. Check `chunk.validationException`, `chunk.accessDeniedException`, and friends explicitly, or errors become silent empty answers.

11. **The URL-rewrite CloudFront Function must skip `/api/`.** Without the guard it rewrites `/api/chat` to `/api/chat/index.html` and the Lambda is never reached.

## Common commands

```bash
npm install                     # root + web workspace
./scripts/deploy.sh full        # everything: build, deploy, upload, ingest, health check
./scripts/deploy.sh infra       # cdk deploy only
./scripts/deploy.sh frontend    # rebuild + redeploy the UI
./scripts/deploy.sh docs        # re-upload documents and re-ingest
./scripts/deploy.sh diff        # cdk diff
./scripts/deploy.sh status      # resource IDs and URLs
./scripts/deploy.sh destroy     # tear down (typed confirmation)

npm run build:web               # Next.js static export → web/out (before any cdk deploy)
npm run check-status            # ingestion job progress
npm run test-rag                # query from the CLI (add `interactive`)
./test-bedrock.sh               # bottom-up diagnostic - run this first when broken
```

Override the model without editing code:

```bash
MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0 ./scripts/deploy.sh infra
```

## Safety guardrails

- **Never deploy or destroy without being asked.** Deploys cost money and `./scripts/deploy.sh destroy` deletes the document bucket (`autoDeleteObjects: true`).
- **`removalPolicy: DESTROY` and `autoDeleteObjects: true` are deliberate tutorial choices.** They make teardown clean. Do not copy them into production advice without flagging the consequence.
- **The chat API is unauthenticated by design.** The Function URL is locked to CloudFront by OAC, but the CloudFront URL is open. This is called out in the docs as a thing to fix before sharing a deployment - don't silently "fix" it in a way that breaks the tutorial's simplicity, and don't remove the warnings.
- **Verify AWS facts against the live API**, not from memory. Model IDs, lifecycle status, and CloudFormation resource schemas all move:
  ```bash
  aws bedrock list-foundation-models --by-provider anthropic --region us-east-1
  aws cloudformation describe-type --type RESOURCE --type-name AWS::Bedrock::KnowledgeBase --region us-east-1
  ```

## Documentation discipline

Documentation *is* the deliverable here - a wrong doc is a worse bug than a wrong line of code.

- The seven chapters in `docs/` are sequential and cross-linked. Changing behaviour means updating the chapter that teaches it.
- Numbers that appear in prose (document count, chunk size, dimensions, model IDs, timings) must match the code. They have drifted before.
- `README.md` and `QUICKSTART.md` overlap intentionally; keep them consistent.
- Sample documents under `sample-data/knowledge-docs/` **get ingested and cited as authoritative answers**. Do not put tutorial instructions in there - three stale meta-documents were removed for exactly this reason.

## Conventions

- TypeScript throughout; CDK L1 constructs where no L2 exists (all of `aws-s3vectors`).
- Comments explain *why*. Constraints that cost debugging time get a full explanation.
- No em dashes in prose - regular dashes.
- Tutorial-only shortcuts are labelled as such inline.

## Current state

See [TODO.md](TODO.md). The most important open item: **v2 has been verified by `tsc`, `cdk synth`, and `next build`, but has never been deployed to a real account.**
