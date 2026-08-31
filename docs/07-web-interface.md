# Step 7: The Web Interface

A Next.js chat UI, exported as static files, served from S3 through CloudFront, talking to a Lambda over API Gateway.

## What you'll build

- A chat interface with markdown rendering, dark mode, and citation display
- Served globally over HTTPS from CloudFront
- Backed by the same `RetrieveAndGenerate` call the CLI scripts use

The UI is deployed by the same `cdk deploy` as everything else - there is no separate hosting step.

## Architecture

The important structural decision: **the UI is a fully static export with no server side.**

```
  cdk deploy
      │
      ├── uploads web/out/ ──────────────► S3 website bucket
      │                                          ▲
      └── writes config.json ───────────────────┘
          { "apiEndpoint": "https://xxx.execute-api..." }

  Browser
      │ 1. GET / from CloudFront ──────────► S3 (via Origin Access Control)
      │ 2. GET /config.json ───────────────► S3
      │ 3. POST {apiEndpoint}/chat ────────► API Gateway ──► Lambda ──► Bedrock
```

Three consequences follow from that, and they explain most of the code:

1. **There are no Next.js route handlers.** `output: 'export'` in [web/next.config.ts](../web/next.config.ts) forbids them. The browser calls API Gateway directly.
2. **The API URL can't be baked in at build time** - it doesn't exist until the stack deploys. Hence `config.json`, written during deployment and fetched by the browser at runtime.
3. **No secrets can live in the front end.** Everything sensitive is in the Lambda's IAM role.

## Project structure

```
web/
├── next.config.ts        # output: 'export', images unoptimized
├── postcss.config.mjs    # Tailwind + autoprefixer
├── tailwind.config.ts
├── app/
│   ├── layout.tsx        # Root layout, fonts, metadata
│   ├── page.tsx          # The entire chat interface
│   └── globals.css       # Tailwind directives and theme
└── out/                  # Build output - what CDK uploads (gitignored)
```

> **Why `next.config.ts` and not `next.config.js`:** the repository's root `.gitignore` once contained a bare `*.js`, which silently excluded `next.config.js` and `postcss.config.js` from the repo - so a fresh clone could not build the UI at all. The `.gitignore` is now scoped to the compiled CDK output directories, and these config files use extensions that aren't swept up by it.

## Build and deploy

```bash
npm run build:web     # produces web/out
cdk deploy            # uploads web/out and writes config.json
```

**Order matters.** `cdk deploy` fails at synthesis if `web/out` doesn't exist, because `BucketDeployment` needs the asset.

Get the URL:

```bash
aws cloudformation describe-stacks --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' --output text
```

## Local development

```bash
npm run dev --workspace=web     # http://localhost:3000
```

The dev server has no `config.json`, so the UI shows "Application not deployed" when you try to send a message. To develop against a real backend, drop a `config.json` into `web/public/`:

```bash
mkdir -p web/public
API=$(aws cloudformation describe-stacks --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)
echo "{\"apiEndpoint\":\"$API\"}" > web/public/config.json
```

The deployed `config.json` is written by CDK and takes precedence in the built output.

## Key components

### Fetching the endpoint

```typescript
const configResponse = await fetch('/config.json');
if (configResponse.ok) {
  const config = await configResponse.json();
  apiEndpoint = config.apiEndpoint;
}
```

### Normalising the URL

API Gateway stage URLs end in a trailing slash. Appending `/chat` naively yields `/prod//chat`, which fails CORS in a way that looks like a permissions problem:

```typescript
const cleanEndpoint = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
const response = await fetch(`${cleanEndpoint}/chat`, { /* ... */ });
```

### Session handling

The single subtlest piece of the UI:

```typescript
const [sessionId, setSessionId] = useState('');

// Send it only once Bedrock has issued one.
body: JSON.stringify({
  message: input,
  ...(sessionId ? { sessionId } : {}),
}),

// Remember what came back.
if (data.sessionId) {
  setSessionId(data.sessionId);
}
```

`RetrieveAndGenerate` issues session IDs and keeps history server-side. A browser-invented ID is rejected with a validation error, so `sessionId` starts empty and is only ever populated from a response. This is also why there's no `useEffect` generating one on mount - an earlier version did exactly that, and it was wrong.

### Citations

The Lambda flattens and deduplicates citations by S3 URI before returning them, so the UI just renders a list.

### The typing effect

```typescript
for (let i = 0; i <= fullResponse.length; i++) {
  setCurrentResponse(fullResponse.substring(0, i));
  await new Promise(resolve => setTimeout(resolve, 10));
}
```

This is cosmetic. The full answer has already arrived; the animation just reveals it. Real token streaming needs a different API surface - see [chapter 06](06-advanced.md#streaming-responses).

## Customizing the interface

**Theme colours** - `web/tailwind.config.ts` and `web/app/globals.css`.

**Sample questions** - the welcome-screen suggestions in `web/app/page.tsx`. Match them to your own corpus; the defaults reference the Nobler Works sample data.

**Message styling** - the message bubble markup in `page.tsx`.

**Page title and metadata** - `web/app/layout.tsx`.

After any change:

```bash
npm run build:web && cdk deploy
```

`BucketDeployment` invalidates the CloudFront cache (`distributionPaths: ['/*']`) on every deploy, so changes appear without waiting for TTLs.

## How the pieces are wired in CDK

From [lib/web-hosting-construct.ts](../lib/web-hosting-construct.ts):

**Origin Access Control** - the website bucket is private; CloudFront reads it through OAC, the current mechanism (it supersedes Origin Access Identity):

```typescript
origin: origins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket),
```

**SPA routing** - 403 and 404 both return `/index.html` with a 200, so client-side routes resolve.

**Single deployment** - the static export and `config.json` go up in one `BucketDeployment` on purpose. Two separate deployments race each other invalidating the same distribution, and `config.json` would sometimes lose - leaving a live UI pointing at nothing.

**CORS** - API Gateway answers the OPTIONS preflight, but the Lambda must return CORS headers on the actual POST too, or the browser discards the response. Both are configured; if you change one, change the other.

## Debugging

| Symptom | Cause |
|---|---|
| "Application not deployed" | `config.json` missing. Re-run `npm run build:web && cdk deploy`. |
| CORS error in console | Check for `//chat` in the request URL, or a Lambda error response missing CORS headers. |
| `ValidationException` on `sessionId` | A client-generated session ID was sent. |
| 500 from `/chat` | Check the Lambda logs - the `[RAG]` prefix carries full error detail. |
| UI loads but shows stale content | Hard-refresh; CloudFront was invalidated on deploy but the browser may have cached. |
| `cdk deploy` fails on a missing asset | `web/out` doesn't exist. Run `npm run build:web`. |

Watch the backend live:

```bash
FN=$(aws cloudformation describe-stack-resources --stack-name S3VectorRAGStack \
  --query "StackResources[?ResourceType=='AWS::Lambda::Function' && contains(LogicalResourceId,'BedrockApi')].PhysicalResourceId" \
  --output text)
aws logs tail "/aws/lambda/$FN" --follow
```

## Before anyone else uses this

The chat endpoint is **open to the internet and unauthenticated**, with `Access-Control-Allow-Origin: '*'`. Anyone who finds the URL can spend your Bedrock budget. Before sharing a deployment:

- Add an authorizer (Cognito, Lambda, or IAM)
- Restrict CORS to your CloudFront domain
- Add a usage plan or WAF rate limiting
- Set an AWS Budget alert

See [chapter 05](05-testing.md#taking-this-to-production).

## What you've learned

- Static export plus runtime config is how you deploy a UI that doesn't know its backend URL at build time
- Session IDs come from the server, and the UI must be built around that
- OAC is the current way to keep an S3 origin private behind CloudFront
- The typing animation is cosmetic; real streaming is an architectural change

## Resources

- [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)
- [CloudFront Origin Access Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [API Gateway CORS](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html)

---

## You've finished the tutorial

You've built a complete RAG system: documents in S3, embeddings in S3 Vectors, retrieval and generation through a Bedrock Knowledge Base, a Lambda API, and a global web UI - all defined in CDK and torn down with one command.

**Don't forget:**

```bash
npm run destroy
```
