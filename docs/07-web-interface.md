# Step 7: Building a Web Interface

Now that you have a working RAG agent, let's build a beautiful web interface to interact with it!

## Why a Web Interface?

The CLI is great for testing, but a web UI offers:
- **Better user experience** - Visual chat interface
- **Real-time streaming** - See responses appear word-by-word
- **Easier sharing** - Send a link instead of CLI commands
- **Customizable design** - Match your brand and style
- **Production ready** - Deploy for end users

## What You'll Build

A modern chat interface with:
- Real-time streaming responses
- Dark mode support
- Citation display
- Responsive design (mobile, tablet, desktop)
- Sample question buttons
- Session management

## Prerequisites

Before starting, ensure:
- [ ] RAG stack is deployed (`cdk deploy`)
- [ ] Documents are uploaded and ingested
- [ ] Agent tested with CLI (`npm run test-agent`)
- [ ] Node.js 18+ installed

## Project Structure

The web UI lives in the `web/` directory:

```
web/
├── app/
│   ├── api/chat/route.ts    # Backend: Bedrock integration
│   ├── page.tsx             # Frontend: Chat UI
│   ├── layout.tsx           # App layout
│   └── globals.css          # Styles
├── scripts/
│   └── setup-env.sh         # Auto-configuration
├── .env.example             # Environment template
├── package.json             # Dependencies
├── tailwind.config.ts       # Tailwind config
└── README.md                # Web UI docs
```

## Step 1: Install Dependencies

```bash
# Navigate to web directory
cd web

# Install packages
npm install
```

**What gets installed:**
- **Next.js** - React framework with server-side rendering
- **Tailwind CSS** - Utility-first CSS framework
- **AWS SDK** - Bedrock Agent Runtime client
- **React Markdown** - Render formatted responses

## Step 2: Configure Environment

You need to tell the web UI which agent to connect to.

### Option A: Automatic Configuration (Recommended)

```bash
npm run setup
```

This script:
1. Fetches Agent ID from CloudFormation outputs
2. Gets Alias ID automatically
3. Creates `.env` file with correct values

**Output:**
```
🔍 Fetching RAG Agent configuration...
✓ Found stack: S3VectorRAGStack
✓ Agent ID: ABCDEF123456
✓ Alias ID: TSTALIASID
✓ Region: us-east-1
📝 Creating .env...
✅ Environment file created!
```

### Option B: Manual Configuration

If automatic setup doesn't work:

```bash
# Copy template
cp .env.example .env

# Get Agent ID
aws cloudformation describe-stacks \
  --stack-name S3VectorRAGStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentIdOutput`].OutputValue' \
  --output text

# Edit .env
nano .env
```

Your `.env` should look like:
```env
AWS_REGION=us-east-1
AGENT_ID=YOUR_AGENT_ID
AGENT_ALIAS_ID=YOUR_ALIAS_ID
```

## Step 3: Start Development Server

```bash
npm run dev
```

**Expected output:**
```
▲ Next.js 14.0.4
- Local:        http://localhost:3000
- Environments: .env

✓ Ready in 2.3s
```

Open http://localhost:3000 in your browser!

## Understanding the Architecture

### Request Flow

```
Browser                Next.js Server           AWS Bedrock
   │                          │                      │
   ├─ POST /api/chat ────────>│                      │
   │                          ├─ InvokeAgent ───────>│
   │                          │                      │
   │<──── Stream chunk ───────┤<──── Chunk ──────────┤
   │<──── Stream chunk ───────┤<──── Chunk ──────────┤
   │<──── Citations ──────────┤<──── Citations ──────┤
   │<──── Done ───────────────┤<──── Done ───────────┤
```

### Key Components

**1. API Route (`app/api/chat/route.ts`)**

This is the backend that talks to Bedrock:

```typescript
export async function POST(req: NextRequest) {
  const { message, sessionId } = await req.json();

  // Invoke Bedrock agent
  const response = await client.send(new InvokeAgentCommand({
    agentId: AGENT_ID,
    agentAliasId: AGENT_ALIAS_ID,
    sessionId,
    inputText: message,
  }));

  // Stream response chunks back to client
  for await (const event of response.completion) {
    if (event.chunk?.bytes) {
      const text = new TextDecoder().decode(event.chunk.bytes);
      // Send to browser
    }
  }
}
```

**Key points:**
- Runs on the server (your AWS credentials stay safe)
- Uses Server-Sent Events for streaming
- Extracts citations automatically
- Handles errors gracefully

**2. Chat Interface (`app/page.tsx`)**

This is the frontend React component:

```typescript
export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    // Send to API
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: input, sessionId })
    });

    // Stream response
    const reader = response.body?.getReader();
    // Display chunks as they arrive
  };

  return (
    <div className="chat-interface">
      {/* Messages */}
      {/* Input */}
    </div>
  );
}
```

**Key points:**
- React hooks for state management
- Streaming response handler
- Tailwind CSS for styling
- Responsive layout

## Step 4: Test the Interface

### First Message

1. Open http://localhost:3000
2. You'll see the welcome screen with sample questions
3. Click "What is RAG?" or type your own question
4. Press Send or hit Enter

### Watch the Magic

- Response appears **word-by-word** in real-time
- Citations show up below the message
- Timestamp appears
- Typing indicator while processing

### Multi-Turn Conversation

1. Ask: "What is RAG?"
2. Wait for response
3. Follow up: "How does it work?"
4. Notice the agent remembers context!

Each browser tab has its own session, maintaining conversation history.

## Understanding the UI Components

### Header

```
┌──────────────────────────────────────┐
│ RAG Agent Chat        [Connected]    │
│ Powered by Amazon Bedrock            │
└──────────────────────────────────────┘
```

**Code:**
```tsx
<header className="bg-white border-b px-6 py-4">
  <h1 className="text-2xl font-bold">RAG Agent Chat</h1>
  <span className="text-green-800 bg-green-100 px-3 py-1 rounded-full">
    Connected
  </span>
</header>
```

### Welcome Screen

Shows when no messages yet:
```
     [Chat Icon]
  Start a conversation
  Ask me anything about...

  [What is RAG?] [How to deploy?]
  [Customize]    [Models]
```

**Code:**
```tsx
{messages.length === 0 && (
  <div className="text-center py-12">
    <h2>Start a conversation</h2>
    {sampleQuestions.map(q => (
      <button onClick={() => setInput(q)}>{q}</button>
    ))}
  </div>
)}
```

### Message Bubbles

```
👤  Your question here
    10:23 AM

🤖  AI response with markdown
    📄 doc.md  📄 guide.pdf
    10:23 AM
```

**Code:**
```tsx
<div className={message.role === 'user' ? 'bg-blue-600' : 'bg-white'}>
  <ReactMarkdown>{message.content}</ReactMarkdown>
  {message.citations?.map(c => (
    <span className="citation-pill">{c}</span>
  ))}
</div>
```

### Input Area

```
┌────────────────────────────────────┐
│ [Ask me anything...    ] [Send]    │
│ Session ID: session-123            │
└────────────────────────────────────┘
```

**Code:**
```tsx
<form onSubmit={sendMessage}>
  <input
    value={input}
    onChange={e => setInput(e.target.value)}
    placeholder="Ask me anything..."
  />
  <button type="submit">Send</button>
</form>
```

## Customizing the Interface

### Change Theme Colors

Edit `tailwind.config.ts`:

```typescript
theme: {
  extend: {
    colors: {
      primary: {
        500: '#10b981',  // Green instead of blue
        600: '#059669',
        700: '#047857',
      }
    }
  }
}
```

All blue elements become green!

### Modify Sample Questions

Edit `app/page.tsx`:

```typescript
const sampleQuestions = [
  'What are your pricing plans?',
  'How do I get started?',
  'What support do you offer?',
  'Tell me about security',
];
```

### Change Message Styling

In `app/page.tsx`, find the message rendering:

```typescript
// Make bubbles more rounded
className="rounded-3xl px-6 py-4"

// Add shadow
className="shadow-lg"

// Change user message color
className="bg-gradient-to-r from-purple-600 to-pink-600"
```

### Add Custom Features

**Copy Button:**
```tsx
<button onClick={() => navigator.clipboard.writeText(message.content)}>
  Copy
</button>
```

**Timestamp Format:**
```typescript
{message.timestamp.toLocaleTimeString('en-US', {
  hour: '2-digit',
  minute: '2-digit'
})}
```

**Message Counter:**
```tsx
<p>Messages: {messages.length}</p>
```

## Hot Reload in Action

Next.js watches for file changes and reloads automatically:

1. Open `app/page.tsx`
2. Change the header text: `"My Custom RAG Agent"`
3. Save file
4. Browser updates **instantly** without refresh!

Try it:
- Change colors
- Modify text
- Add new components
- Adjust spacing

See changes immediately!

## Understanding Streaming

### How Streaming Works

Traditional approach:
```
User sends query → Wait... → Full response appears
(Takes 10 seconds)
```

Streaming approach:
```
User sends query → "R" → "AG" → " is" → " a" → " technique..."
(Feels instant!)
```

### Implementation

**Server side:**
```typescript
// Send chunks as they arrive
for await (const event of response.completion) {
  if (event.chunk?.bytes) {
    const text = decode(event.chunk.bytes);
    controller.enqueue(JSON.stringify({
      type: 'chunk',
      data: text
    }));
  }
}
```

**Client side:**
```typescript
// Receive and display chunks
for (const line of lines) {
  const event = JSON.parse(line);
  if (event.type === 'chunk') {
    fullResponse += event.data;
    setCurrentResponse(fullResponse);  // Updates UI
  }
}
```

### Event Types

The API sends different event types:

**Chunk:**
```json
{ "type": "chunk", "data": "partial text..." }
```

**Citations:**
```json
{
  "type": "citations",
  "data": ["s3://bucket/doc.md", "s3://bucket/guide.pdf"]
}
```

**Done:**
```json
{ "type": "done" }
```

**Error:**
```json
{ "type": "error", "data": "Error message" }
```

## Dark Mode

The UI automatically detects your system preference.

### How It Works

**Tailwind dark mode:**
```tsx
<div className="bg-white dark:bg-gray-800">
  <p className="text-gray-900 dark:text-white">
    This text adapts to theme!
  </p>
</div>
```

**System detection:**
Tailwind checks `prefers-color-scheme: dark` automatically.

### Testing Both Modes

**Mac:**
System Preferences → General → Appearance → Dark/Light

**Windows:**
Settings → Personalization → Colors → Light/Dark

**Browser DevTools:**
Open DevTools → Toggle device toolbar → More tools → Rendering → Emulate CSS media: dark

## Responsive Design

The UI adapts to screen size:

### Mobile (< 768px)
- Full-width messages
- Larger touch targets
- Simplified header
- Vertical layout

### Tablet (768px - 1024px)
- Optimized spacing
- Comfortable message width
- Touch-friendly

### Desktop (> 1024px)
- Max-width container (4xl = 896px)
- Centered layout
- Generous padding

### Testing Responsiveness

**Browser DevTools:**
1. Open DevTools (F12)
2. Click device toolbar icon
3. Choose device: iPhone, iPad, etc.
4. Or drag window edge to resize

**Code:**
```tsx
<div className="px-4 md:px-6 lg:px-8">
  {/* Padding adjusts by screen size */}
</div>

<div className="grid grid-cols-1 md:grid-cols-2">
  {/* 1 column mobile, 2 columns tablet+ */}
</div>
```

## Debugging Tips

### View API Requests

**Browser DevTools:**
1. Open DevTools → Network tab
2. Send a message
3. See POST to `/api/chat`
4. Click to inspect request/response

### Check Server Logs

Terminal where `npm run dev` runs shows:
```
Event: { type: 'chunk', data: 'Hello' }
POST /api/chat 200 in 234ms
```

Add your own logs:
```typescript
console.log('Message sent:', message);
console.log('Session ID:', sessionId);
console.log('Response event:', event);
```

### Common Issues

**"Server configuration error"**
→ Check `.env` file exists and has correct values

**No response appears**
→ Check terminal for errors
→ Verify agent is deployed
→ Test with CLI first: `npm run test-agent`

**Slow responses**
→ Normal for first request (cold start)
→ Subsequent requests should be faster
→ Consider switching to Haiku model

**Styles not updating**
→ Tailwind needs classes in `className`
→ Run `npm run dev` to recompile
→ Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)

## Production Deployment

Ready to share with others?

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in dashboard
vercel env add AGENT_ID
vercel env add AGENT_ALIAS_ID
vercel env add AWS_REGION

# Deploy to production
vercel --prod
```

### Option 2: AWS Amplify

1. Push code to GitHub
2. Go to AWS Amplify console
3. Connect repository
4. Build settings:
   - Build command: `npm run build`
   - Output directory: `.next`
5. Add environment variables
6. Deploy

### Option 3: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t rag-ui .
docker run -p 3000:3000 \
  -e AGENT_ID=xxx \
  -e AGENT_ALIAS_ID=xxx \
  rag-ui
```

## What You've Learned

✅ Setting up a Next.js project
✅ Integrating with Bedrock Agent Runtime API
✅ Implementing real-time streaming
✅ Building responsive UI with Tailwind CSS
✅ Managing React state for chat
✅ Handling citations and metadata
✅ Auto-configuration from CloudFormation
✅ Hot reload for fast development
✅ Dark mode support
✅ Production deployment options

## Next Steps

### Enhance Your UI

1. **Add Authentication**
   - Use NextAuth.js
   - Integrate with Cognito
   - Add user profiles

2. **Message Features**
   - Copy button
   - Export conversation
   - Share links
   - Reactions

3. **Advanced Customization**
   - Custom themes
   - Avatar uploads
   - Sound effects
   - Keyboard shortcuts

4. **Analytics**
   - Track usage
   - Monitor performance
   - User feedback

### Combine with Advanced Features

From [Step 6: Advanced Customization](06-advanced.md):
- Add custom Lambda tools
- Implement guardrails
- Create API Gateway endpoints
- Multi-agent systems

The web UI works seamlessly with all advanced features!

## Resources

- [Web UI README](../web/README.md) - Detailed documentation
- [Local Development Guide](../LOCAL_DEVELOPMENT.md) - Complete setup
- [Web UI Features](../WEB_UI_FEATURES.md) - Full feature list
- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)

## Summary

You now have a production-ready web interface for your RAG agent! The combination of:
- Beautiful, modern design
- Real-time streaming
- Easy customization
- Responsive layout

Makes it perfect for demos, prototypes, and production applications.

→ **Congratulations!** You've completed the full RAG tutorial with web interface!

---

**Next**: Customize the UI to match your brand and deploy to production!
