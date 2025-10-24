import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { NextRequest } from 'next/server';

const client = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const AGENT_ID = process.env.AGENT_ID!;
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID!;

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { message, sessionId } = await req.json();

    if (!message || !sessionId) {
      return new Response(
        JSON.stringify({ error: 'Missing message or sessionId' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!AGENT_ID || !AGENT_ALIAS_ID) {
      return new Response(
        JSON.stringify({
          error: 'Server configuration error. Please set AGENT_ID and AGENT_ALIAS_ID in .env',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const command = new InvokeAgentCommand({
            agentId: AGENT_ID,
            agentAliasId: AGENT_ALIAS_ID,
            sessionId,
            inputText: message,
            enableTrace: false,
          });

          const response = await client.send(command);

          if (!response.completion) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: 'error', data: 'No completion returned' }) + '\n'
              )
            );
            controller.close();
            return;
          }

          let fullResponse = '';
          const citations: any[] = [];

          for await (const event of response.completion) {
            // Handle text chunks
            if (event.chunk?.bytes) {
              const text = new TextDecoder().decode(event.chunk.bytes);
              fullResponse += text;

              // Send chunk to client
              controller.enqueue(
                encoder.encode(JSON.stringify({ type: 'chunk', data: text }) + '\n')
              );
            }

            // Handle citations
            if (event.chunk?.attribution?.citations) {
              citations.push(...event.chunk.attribution.citations);
            }

            // Handle trace (for debugging)
            if (event.trace) {
              console.log('Trace:', JSON.stringify(event.trace, null, 2));
            }
          }

          // Send citations
          if (citations.length > 0) {
            const sources = new Set<string>();
            for (const citation of citations) {
              const refs = citation.retrievedReferences || [];
              for (const ref of refs) {
                if (ref.location?.s3Location?.uri) {
                  sources.add(ref.location.s3Location.uri);
                }
              }
            }

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'citations',
                  data: Array.from(sources),
                }) + '\n'
              )
            );
          }

          // Send completion signal
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'done' }) + '\n')
          );

          controller.close();
        } catch (error: any) {
          console.error('Agent invocation error:', error);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                data: error.message || 'An error occurred',
              }) + '\n'
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Request error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
