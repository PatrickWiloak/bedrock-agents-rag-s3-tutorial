# RAG Chat Web UI

The Next.js front end for the [Bedrock RAG tutorial](../README.md). A chat interface over a Bedrock Knowledge Base, with markdown rendering, dark mode, and citations.

For the full explanation of how it fits together, see [docs/07-web-interface.md](../docs/07-web-interface.md).

## Features

- Chat interface with markdown rendering and syntax highlighting
- Source citations linking back to the S3 documents that grounded each answer
- Multi-turn conversations via Bedrock-issued session IDs
- Dark mode
- Responsive layout
- **Fully static** - no server side, no secrets in the browser

## How it works

This is a **static export** (`output: 'export'` in [next.config.ts](next.config.ts)). There are no Next.js route handlers and no server runtime. CDK uploads the built output to S3 and serves it through CloudFront.

```
Browser
  │ 1. GET /              ──► CloudFront ──► S3 (Origin Access Control)
  │ 2. GET /config.json   ──► CloudFront ──► S3
  │ 3. POST {apiEndpoint}/chat ──► API Gateway ──► Lambda ──► Bedrock
```

The API Gateway URL doesn't exist until the stack deploys, so it can't be baked into the build. Instead CDK writes a `config.json` next to the site at deploy time, and the browser reads it at runtime.

All AWS credentials live in the Lambda's IAM role. Nothing sensitive reaches the browser.

## Prerequisites

- Node.js 20+
- The CDK stack deployed (see the [root README](../README.md)) if you want a working backend

## Quick start

### Build and deploy

From the repository root:

```bash
npm install
npm run build:web     # produces web/out
cdk deploy            # uploads web/out and writes config.json
```

**Build before deploying.** `cdk deploy` fails at synthesis if `web/out` doesn't exist.

Get your URL:

```bash
aws cloudformation describe-stacks --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' --output text
```

### Local development

```bash
npm run dev --workspace=web     # http://localhost:3000
```

The dev server has no `config.json`, so sending a message shows "Application not deployed". To develop against your deployed backend, create one:

```bash
mkdir -p web/public
API=$(aws cloudformation describe-stacks --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)
echo "{\"apiEndpoint\":\"$API\"}" > web/public/config.json
```

Hot reload works normally.

## Project structure

```
web/
├── next.config.ts        # output: 'export', images unoptimized
├── postcss.config.mjs    # Tailwind + autoprefixer
├── tailwind.config.ts    # Theme
├── app/
│   ├── layout.tsx        # Root layout, fonts, metadata
│   ├── page.tsx          # The entire chat interface
│   └── globals.css       # Tailwind directives
└── out/                  # Build output (gitignored) - what CDK uploads
```

## Key implementation details

### Session IDs come from the server

`RetrieveAndGenerate` issues session IDs and keeps conversation history server-side. A client-invented ID is rejected with a `ValidationException`, so `sessionId` starts empty and is only ever set from a response:

```typescript
const [sessionId, setSessionId] = useState('');

// Omitted on the first request of a conversation
body: JSON.stringify({
  message: input,
  ...(sessionId ? { sessionId } : {}),
}),

if (data.sessionId) setSessionId(data.sessionId);
```

### Trailing-slash normalisation

API Gateway stage URLs end with `/`. Appending `/chat` naively produces `/prod//chat`, which fails as a CORS error that looks like a permissions problem:

```typescript
const cleanEndpoint = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
```

### The typing effect is cosmetic

The full answer arrives in one response; the UI reveals it character by character. Real token streaming needs a different API surface than API Gateway REST with Lambda proxy integration, which buffers the whole response. See [docs/06-advanced.md](../docs/06-advanced.md#streaming-responses).

### API response shape

```jsonc
{
  "response": "According to the Remote Work Policy...",
  "citations": [{ "uri": "s3://.../remote-work-policy.md", "text": "..." }],
  "sessionId": "issued-by-bedrock"
}
```

Citations are already flattened and deduplicated by the Lambda.

## Customization

| What | Where |
|---|---|
| Theme colours | `tailwind.config.ts`, `app/globals.css` |
| Sample questions on the welcome screen | `app/page.tsx` |
| Message bubble styling | `app/page.tsx` |
| Page title and metadata | `app/layout.tsx` |

The default sample questions reference the Nobler Works sample data - change them to match your own corpus.

After any change:

```bash
npm run build:web && cdk deploy
```

CloudFront is invalidated on every deploy (`distributionPaths: ['/*']`), so changes appear immediately.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Application not deployed" | `config.json` is missing. Re-run `npm run build:web && cdk deploy`, or create it locally as shown above. |
| CORS error in the console | Look for `//chat` in the request URL, or a Lambda error response that didn't include CORS headers. |
| `ValidationException` mentioning `sessionId` | A client-generated session ID was sent. Only send back one Bedrock issued. |
| Empty or unhelpful answers | Usually the knowledge base, not the UI. Run `npm run check-status` and `./test-bedrock.sh` from the root. |
| 500 from `/chat` | Check the Lambda logs - every request logs with a `[RAG]` prefix. |
| Slow responses | Generation latency. Try `cdk deploy --context modelId=us.anthropic.claude-haiku-4-5-20251001-v1:0`. |
| `cdk deploy` fails on a missing asset | `web/out` doesn't exist. Run `npm run build:web`. |

Watch the backend:

```bash
FN=$(aws cloudformation describe-stack-resources --stack-name S3VectorRAGStack \
  --query "StackResources[?ResourceType=='AWS::Lambda::Function' && contains(LogicalResourceId,'BedrockApi')].PhysicalResourceId" \
  --output text)
aws logs tail "/aws/lambda/$FN" --follow
```

## ⚠️ Before sharing a deployment

The chat endpoint is **unauthenticated and open to the internet**, with `Access-Control-Allow-Origin: '*'`. Anyone who finds the URL can spend your Bedrock budget.

Before giving anyone the link, add an authorizer, restrict CORS to your CloudFront domain, add rate limiting, and set an AWS Budget alert. See [docs/05-testing.md](../docs/05-testing.md#taking-this-to-production).

## Deploying elsewhere

This UI is a plain static export, so it will host anywhere - Vercel, Amplify, Cloudflare Pages, any bucket. The only requirement is that a `config.json` containing `{"apiEndpoint": "..."}` is served from the site root.

The CDK stack already handles this end to end, so there's no reason to host it separately unless you want a custom domain.
