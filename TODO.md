# TODO

Working task list for the Bedrock RAG + S3 Vectors tutorial. The v2 rewrite (2026-08-31) moved the stack onto native S3 Vectors CloudFormation and replaced the Bedrock Agent with `RetrieveAndGenerate`; the v2.1 pass swapped API Gateway for a streaming Lambda Function URL. What follows is what's left.

---

## 🔴 Before publishing v2

- [ ] **Deploy end to end in a real account and confirm it works.** Everything so far is verified by `tsc`, `cdk synth`, and `next build` - the stack has **not** been deployed. Specifically unverified: knowledge base creation against a native `S3VectorsConfiguration`, ingestion into the natively-created index, a live `RetrieveAndGenerateStream` call, and **that the response actually streams through CloudFront rather than arriving buffered**. Run `./scripts/deploy.sh full` then `./test-bedrock.sh`.
- [ ] **Rename the repository.** `bedrock-agents-rag-s3-tutorial` now misdescribes the content - there is no agent. Something like `bedrock-rag-s3-vectors-tutorial` fits. GitHub redirects the old URL, but README/QUICKSTART clone commands and the badge links need updating in the same pass.
- [ ] **Re-check the default model before publishing.** `us.anthropic.claude-opus-5` was current on 2026-08-31. Verify with `aws bedrock list-inference-profiles` and update `DEFAULT_MODEL_ID` in `lib/s3-rag-stack.ts` plus the model tables in README / QUICKSTART / docs/04 if it has moved.

## 🟠 Worth doing

- [ ] **Record the Agents Classic problem in `~/coding/strategic-bedrock-demo`.** That repo is built on `aws_bedrockagent_agent` + `InvokeAgent`. It still deploys in the Nobler Works account (allowlisted), but its model catalog is frozen at the 2026-07-30 cutoff and `terraform apply` will fail with a 403 in any client account without prior Bedrock Agents usage - which matters for a demo shown to clients.

- [ ] **Consider Server-Sent Events instead of raw NDJSON** if browser `EventSource` semantics (automatic reconnection) turn out to be worth the content-negotiation overhead.
- [ ] **Add a v1 branch or tag.** Anyone running the original agent-based stack needs the old manual-teardown instructions. The README links to commit `e7b0810`; a `v1` tag would be friendlier.
- [ ] **Automate ingestion.** `npm run upload-docs` is a manual step. An S3 event notification triggering `StartIngestionJob` would make the tutorial more production-shaped - and is a good chapter-06 exercise.
- [ ] **Add a `.github/workflows` CI job** running `npm ci`, `tsc --noEmit`, `npm run build:web`, and `cdk synth` on PRs. All four pass locally today; nothing enforces that they keep passing.
- [ ] **Regenerate the `.docx` sample documents' companion `.md` files or drop the duplication.** `Human-Resources/` currently ships both `employee-handbook.docx` and `employee-handbook.md`, so the same content is indexed twice and can be cited twice for one answer.

## 🟡 Nice to have

- [ ] **A chapter on migrating to AgentCore**, for readers who genuinely need tool-calling. The knowledge base built here plugs into AgentCore Gateway unchanged, which is a good story to tell concretely.
- [ ] **Evaluate reranking** and document whether it measurably improves answers on this corpus, rather than just describing the option in docs/06.
- [ ] **Confirm whether S3 Vectors supports `HYBRID` search.** docs/04 and docs/06 both hedge on this because it wasn't verified against the live service.
- [ ] **Screenshots of the web UI** in README and docs/07.

---

## Done - v2.1 (streaming pass, 2026-08-31)

- [x] ~~Replace API Gateway with a Lambda Function URL (`RESPONSE_STREAM`) behind CloudFront `/api/*`; real token streaming via `RetrieveAndGenerateStream`~~ ✅ done 2026-08-31
- [x] ~~Delete the `config.json` runtime lookup and all CORS handling - the API is same-origin now~~ ✅ done 2026-08-31
- [x] ~~Fix the Lambda that could never have run: `lambda/bedrock-api.ts` was excluded from `tsconfig.json`, so raw TypeScript was bundled into the asset. Handler is now `lambda/chat.mjs`~~ ✅ done 2026-08-31
- [x] ~~Replace the 403/404 → index.html error-page hack with a viewer-request CloudFront Function~~ ✅ done 2026-08-31
- [x] ~~Enrich citations with readable titles, category, and excerpts instead of raw S3 URIs~~ ✅ done 2026-08-31
- [x] ~~Restructure the monolithic root `deploy.sh` into `scripts/deploy.sh` with subcommands, prerequisite checks, ingestion wait, and a health check~~ ✅ done 2026-08-31
- [x] ~~Add `.nvmrc`, `MisconfiguredBanner`, and `QuickStarters`~~ ✅ done 2026-08-31

## Done - v2 (architecture rewrite, 2026-08-31)

- [x] ~~Replace `cdk-s3-vectors` community library with native `aws-cdk-lib/aws-s3vectors`~~ ✅ done 2026-08-31
- [x] ~~Replace the Bedrock Agent with `RetrieveAndGenerate` (Agents Classic closed to new customers 2026-07-30)~~ ✅ done 2026-08-31
- [x] ~~Delete both custom-resource Lambdas (`associate-kb`, `prepare-agent`) - `AWS::Bedrock::Agent` gained `KnowledgeBases` + `AutoPrepare`, then the agent went away entirely~~ ✅ done 2026-08-31
- [x] ~~Fix dead model ID `anthropic.claude-3-sonnet-20240229-v1:0`, which no longer exists in the Bedrock catalog~~ ✅ done 2026-08-31
- [x] ~~Handle inference-profile model IDs and the two-ARN IAM requirement~~ ✅ done 2026-08-31
- [x] ~~Fix root `.gitignore` `*.js` rule that silently excluded `web/next.config.js` and `web/postcss.config.js`, making the web UI unbuildable from a fresh clone~~ ✅ done 2026-08-31
- [x] ~~Fix session handling - the UI was generating its own session IDs, which `RetrieveAndGenerate` rejects~~ ✅ done 2026-08-31
- [x] ~~Remove three stale tutorial-meta documents from the ingested corpus (they taught the removed agent workflow and were being cited as authoritative answers)~~ ✅ done 2026-08-31
- [x] ~~Correct the document count (11 → 17) across README, QUICKSTART, deploy.sh, and docs~~ ✅ done 2026-08-31
- [x] ~~Bump aws-cdk-lib 2.120→2.267, aws-cdk 2.120→2.1139, AWS SDK 3.470→3.1121, Next 15→16, Lambda runtime Node 20→22~~ ✅ done 2026-08-31
- [x] ~~Replace deprecated `S3Origin`/OAI with `S3BucketOrigin.withOriginAccessControl`~~ ✅ done 2026-08-31
- [x] ~~Rewrite all documentation for the new architecture~~ ✅ done 2026-08-31
