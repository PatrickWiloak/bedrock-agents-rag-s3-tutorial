# RAG Agent Web UI

A beautiful chat interface for your Amazon Bedrock RAG agent built with Next.js and Tailwind CSS.

## Features

- **Agent Responses** - Get responses from your Bedrock Agent using the Agents API
- **Beautiful UI** - Modern, responsive design with dark mode support
- **Citations** - Displays source documents used for each response
- **Session Management** - Maintains conversation context across multiple queries
- **Sample Questions** - Quick-start buttons for common queries
- **Markdown Support** - Renders formatted responses with code blocks, lists, etc.

## Prerequisites

1. **Deployed RAG Stack** - You must have deployed the CDK stack first:
   ```bash
   cd ..
   cdk deploy
   ```

2. **AWS Credentials** - Configure AWS credentials locally:
   ```bash
   aws configure
   # or use AWS_PROFILE environment variable
   ```

3. **Stack Outputs** - Get your Agent ID and Alias ID from deployment outputs

## Quick Start

### 1. Install Dependencies

```bash
cd web
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```env
AWS_REGION=us-east-1
AGENT_ID=YOUR_AGENT_ID_HERE
AGENT_ALIAS_ID=YOUR_ALIAS_ID_HERE
```

**Getting Agent IDs:**

From CDK deployment outputs:
```bash
# In the root directory
aws cloudformation describe-stacks \
  --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs' \
  --output table
```

Or check the deployment output after running `cdk deploy`.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
web/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts      # Bedrock API integration
│   ├── globals.css           # Tailwind styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main chat interface
├── .env.example              # Environment template
├── next.config.js            # Next.js config
├── tailwind.config.ts        # Tailwind config
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies
```

## How It Works

### Architecture

```
Browser ←→ Next.js API Route ←→ Bedrock Agent ←→ Knowledge Base
                                      ↓
                               Agent Response
```

### API Flow

1. **User sends message** via web form
2. **Next.js API route** (`/api/chat`) receives request
3. **Bedrock Agent invoked** with user query
4. **Response collected** from agent
5. **Citations extracted** and displayed
6. **Session maintained** for multi-turn conversations

### Response Implementation

The API route collects the complete response from the Bedrock Agent and returns it to the client. The client displays the response with a typing effect for better UX.

## Customization

### Styling

Edit `tailwind.config.ts` to customize colors:

```typescript
colors: {
  primary: {
    500: '#your-color',
    // ...
  }
}
```

### Sample Questions

Edit the sample questions in `app/page.tsx`:

```typescript
const sampleQuestions = [
  'Your custom question 1',
  'Your custom question 2',
  // ...
];
```

### Message Display

Customize how messages are rendered in `app/page.tsx`:
- Change avatar icons
- Modify message bubble styles
- Add custom markdown components
- Adjust citation display

### Dark Mode

The app automatically detects system preference. To force a theme:

```typescript
// In app/layout.tsx
<html lang="en" className="dark"> {/* or remove for light */}
```

## Features in Detail

### Response Display

Responses are displayed with a typing effect for better UX:

```typescript
// Simulate typing effect character by character
for (let i = 0; i <= fullResponse.length; i++) {
  setCurrentResponse(fullResponse.substring(0, i));
  await new Promise(resolve => setTimeout(resolve, 10));
}
```

### Session Management

Each browser tab gets a unique session ID:
```typescript
const [sessionId] = useState(() => `session-${Date.now()}`);
```

Sessions maintain conversation context, allowing follow-up questions.

### Citations

Source documents are extracted and displayed below responses:

```typescript
if (event.chunk?.attribution?.citations) {
  // Extract S3 URIs
  // Display as pills below message
}
```

### Error Handling

Graceful handling of:
- Network errors
- Agent errors
- Missing configuration
- Timeout issues

## Troubleshooting

### "Server configuration error"

**Problem**: Agent ID or Alias ID not set

**Solution**: Check your `.env` file has correct values:
```bash
cat .env
```

### No responses appear

**Problem**: AWS credentials not configured

**Solution**: Verify credentials:
```bash
aws sts get-caller-identity
```

### "Failed to get response"

**Problem**: Agent not ready or permissions issue

**Solution**:
1. Check agent status:
   ```bash
   aws bedrock-agent get-agent --agent-id YOUR_AGENT_ID
   ```
2. Verify ingestion completed:
   ```bash
   npm run check-status
   ```

### Slow responses

**Problem**: Large knowledge base or complex query

**Solutions**:
- Switch to Haiku model (faster, cheaper)
- Reduce number of retrieved chunks
- Check AWS region latency

### CORS errors

**Problem**: API route configuration

**Solution**: Next.js API routes handle CORS automatically. If issues persist, check:
```typescript
// In app/api/chat/route.ts
headers: {
  'Access-Control-Allow-Origin': '*',
  // ...
}
```

## Production Deployment

### Environment Variables

For production, use proper secret management:

```bash
# Vercel
vercel env add AGENT_ID
vercel env add AGENT_ALIAS_ID

# AWS Amplify
# Use Amplify console to add environment variables

# Docker
docker run -e AGENT_ID=xxx -e AGENT_ALIAS_ID=xxx ...
```

### Building for Production

```bash
npm run build
npm run start
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Deploy to AWS Amplify

1. Connect your Git repository
2. Set build settings:
   - Build command: `npm run build`
   - Output directory: `.next`
3. Add environment variables
4. Deploy

### Security Considerations

1. **Authentication** - Add auth before production:
   ```typescript
   // Use NextAuth.js, Cognito, or similar
   import { useSession } from 'next-auth/react';
   ```

2. **Rate Limiting** - Prevent abuse:
   ```typescript
   // Add rate limiting middleware
   import rateLimit from 'express-rate-limit';
   ```

3. **Input Validation** - Sanitize user input:
   ```typescript
   if (message.length > 1000) {
     return error('Message too long');
   }
   ```

4. **API Keys** - Never expose in client:
   - Keep AWS credentials server-side
   - Use environment variables
   - Rotate regularly

## Advanced Features

### Adding Authentication

```typescript
// app/api/chat/route.ts
import { getServerSession } from 'next-auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ...
}
```

### User-Specific Sessions

```typescript
const [sessionId] = useState(() =>
  `session-${userId}-${Date.now()}`
);
```

### Message History Persistence

```typescript
// Save to database
useEffect(() => {
  localStorage.setItem('messages', JSON.stringify(messages));
}, [messages]);

// Load on mount
useEffect(() => {
  const saved = localStorage.getItem('messages');
  if (saved) setMessages(JSON.parse(saved));
}, []);
```

### Custom Tools Integration

If your agent has custom Lambda tools, they work automatically:

```typescript
// Agent will invoke tools as needed
// Results appear in the streamed response
```

## Performance Optimization

1. **Lazy Loading**: Messages render progressively
2. **Debouncing**: Input changes are debounced
3. **Virtualization**: For very long conversations, add virtual scrolling
4. **Caching**: Browser caches static assets

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile: ✅ Responsive design

## Development Tips

### Hot Reload

Next.js automatically reloads on file changes:
```bash
npm run dev
# Edit files and see changes instantly
```

### TypeScript

Full type safety throughout:
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // ...
}
```

### Debugging

View API events in browser console:
```typescript
console.log('Event:', event);
```

Server logs appear in terminal where `npm run dev` runs.

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Bedrock Agent Runtime API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvokeAgent.html)
- [React Markdown](https://github.com/remarkjs/react-markdown)

## Support

- Main tutorial: See [../README.md](../README.md)
- API issues: Check AWS Bedrock console
- UI issues: Check browser console

---

Built with ❤️ using Next.js, Tailwind CSS, and Amazon Bedrock
