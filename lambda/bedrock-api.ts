/**
 * Lambda function that answers chat requests from the web UI.
 *
 * It calls the Bedrock Knowledge Base `RetrieveAndGenerate` API, which does the
 * whole RAG loop server-side in one call: embed the question, search the S3
 * Vectors index, stuff the matching chunks into a prompt, and generate a
 * grounded answer with citations attached.
 */

import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * A single source document backing part of the answer.
 */
interface Citation {
  uri: string;
  text: string;
}

const client = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID!;
const MODEL_ARN = process.env.MODEL_ARN!;

/** How many chunks to retrieve per question. */
const NUMBER_OF_RESULTS = Number(process.env.NUMBER_OF_RESULTS ?? '5');

/**
 * Optional prompt template controlling how the answer is written.
 *
 * This is the RetrieveAndGenerate equivalent of an agent's instructions. If set
 * it must contain the `$search_results$` placeholder, which Bedrock replaces
 * with the retrieved chunks. Leave it unset to use Bedrock's built-in template.
 */
const PROMPT_TEMPLATE = process.env.PROMPT_TEMPLATE;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  /**
   * CORS Headers - Required for CloudFront → API Gateway requests
   *
   * API Gateway's CORS configuration only answers the OPTIONS preflight. The
   * actual POST response needs these headers from the Lambda itself, or the
   * browser discards it.
   */
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // For production, replace with your CloudFront domain
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('[RAG] === Request Start ===');

    if (!event.body) {
      console.error('[RAG] ERROR: Missing request body');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    let message: string;
    let sessionId: string | undefined;
    try {
      const body = JSON.parse(event.body);
      message = body.message;
      sessionId = body.sessionId;
    } catch (parseError) {
      console.error('[RAG] ERROR: JSON parse failed:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          message:
            parseError instanceof Error ? parseError.message : 'JSON parse failed',
        }),
      };
    }

    if (!message) {
      console.error('[RAG] ERROR: Missing message');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing message' }),
      };
    }

    if (!KNOWLEDGE_BASE_ID || !MODEL_ARN) {
      console.error('[RAG] ERROR: KNOWLEDGE_BASE_ID or MODEL_ARN not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Server configuration error. KNOWLEDGE_BASE_ID or MODEL_ARN not set',
        }),
      };
    }

    console.log('[RAG] Configuration:', {
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      modelArn: MODEL_ARN,
      region: process.env.AWS_REGION,
      hasSession: Boolean(sessionId),
    });

    /**
     * Session handling
     *
     * RetrieveAndGenerate issues its own session IDs and uses them to keep
     * conversation history server-side. Only ever send back one that Bedrock
     * gave us - passing a client-invented ID is rejected with a validation
     * error, so the first request in a conversation must omit it entirely.
     */
    const command = new RetrieveAndGenerateCommand({
      input: { text: message },
      ...(sessionId ? { sessionId } : {}),
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: KNOWLEDGE_BASE_ID,
          modelArn: MODEL_ARN,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: NUMBER_OF_RESULTS,
            },
          },
          ...(PROMPT_TEMPLATE
            ? {
                generationConfiguration: {
                  promptTemplate: { textPromptTemplate: PROMPT_TEMPLATE },
                },
              }
            : {}),
        },
      },
    });

    console.log('[RAG] Calling RetrieveAndGenerate...');
    const response = await client.send(command);

    const answer = response.output?.text ?? '';

    /**
     * Citations
     *
     * The response groups references by the span of generated text they
     * support. We flatten them into a single list for the UI and drop
     * duplicates, since the same document often backs several spans.
     */
    const citations: Citation[] = [];
    const seen = new Set<string>();

    for (const citation of response.citations ?? []) {
      for (const ref of citation.retrievedReferences ?? []) {
        const uri = ref.location?.s3Location?.uri;
        if (!uri || seen.has(uri)) continue;
        seen.add(uri);
        citations.push({ uri, text: ref.content?.text ?? '' });
      }
    }

    console.log('[RAG] Response complete:', {
      responseLength: answer.length,
      citationCount: citations.length,
    });
    console.log('[RAG] === Request End ===');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: answer,
        citations,
        // Hand the session ID back so the browser can continue the conversation.
        sessionId: response.sessionId,
      }),
    };
  } catch (error: any) {
    console.error('[RAG] === ERROR ===');
    console.error('[RAG] Error type:', error?.constructor?.name);
    console.error('[RAG] Error message:', error?.message);
    console.error(
      '[RAG] Full error:',
      JSON.stringify(
        {
          name: error?.name,
          message: error?.message,
          statusCode: error?.$metadata?.httpStatusCode,
          requestId: error?.$metadata?.requestId,
        },
        null,
        2
      )
    );

    return {
      statusCode: error?.$metadata?.httpStatusCode || 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to query the knowledge base',
        message: error?.message,
        code: error?.name,
      }),
    };
  }
};
