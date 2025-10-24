/**
 * Lambda function that handles Bedrock Agent invocations via API Gateway
 * This proxies requests from the web UI to Amazon Bedrock
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Citation object structure for knowledge base references
 */
interface Citation {
  uri: string;
  text: string;
}

const client = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const AGENT_ID = process.env.AGENT_ID!;

/**
 * Agent Alias ID for invoking the Bedrock Agent
 *
 * AWS Bedrock requires an alias ID when invoking agents via InvokeAgentCommand.
 * We use 'TSTALIASID' as the default, which is AWS's built-in test alias that
 * automatically exists for all DRAFT agents.
 *
 * Why TSTALIASID?
 * - It's always available for DRAFT agents (no need to create it)
 * - Perfect for development and testing
 * - For production, you can create a custom alias via AWS Console or CDK
 *
 * Learn more: https://docs.aws.amazon.com/bedrock/latest/userguide/agents-deploy.html
 */
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID || 'TSTALIASID';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  /**
   * CORS Headers - Required for CloudFront → API Gateway requests
   *
   * Even though API Gateway has CORS configured via defaultCorsPreflightOptions,
   * the Lambda function MUST return CORS headers in every response. Here's why:
   *
   * 1. API Gateway CORS only handles OPTIONS preflight requests
   * 2. Actual POST/GET requests need CORS headers from the Lambda response
   * 3. Without these headers, browsers block the response with CORS errors
   *
   * Headers explained:
   * - Access-Control-Allow-Origin: Which domains can call this API
   *   ('*' = any domain, or specify CloudFront domain for security)
   * - Access-Control-Allow-Methods: Which HTTP methods are allowed
   * - Access-Control-Allow-Headers: Which request headers are allowed
   *
   * Learn more: https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html
   */
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // For production, replace with your CloudFront domain
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    console.log('[BEDROCK] === Request Start ===');
    console.log('[BEDROCK] Event:', JSON.stringify({
      httpMethod: event.httpMethod,
      path: event.path,
      headers: event.headers,
      body: event.body?.substring(0, 200) // First 200 chars only
    }, null, 2));

    // Parse request body
    if (!event.body) {
      console.error('[BEDROCK] ERROR: Missing request body');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    // Parse JSON with specific error handling
    let message: string;
    let sessionId: string;
    try {
      const body = JSON.parse(event.body);
      message = body.message;
      sessionId = body.sessionId;
      console.log('[BEDROCK] Parsed request:', {
        messageLength: message?.length || 0,
        sessionId
      });
    } catch (parseError) {
      console.error('[BEDROCK] ERROR: JSON parse failed:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          message: parseError instanceof Error ? parseError.message : 'JSON parse failed'
        }),
      };
    }

    if (!message || !sessionId) {
      console.error('[BEDROCK] ERROR: Missing required fields:', {
        hasMessage: !!message,
        hasSessionId: !!sessionId
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing message or sessionId' }),
      };
    }

    if (!AGENT_ID) {
      console.error('[BEDROCK] ERROR: AGENT_ID not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Server configuration error. AGENT_ID not set',
        }),
      };
    }

    console.log('[BEDROCK] Configuration:', {
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      region: process.env.AWS_REGION,
    });

    // Invoke Bedrock Agent with streaming
    const command = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId,
      inputText: message,
    });

    console.log('[BEDROCK] Invoking agent...');
    const response = await client.send(command);
    console.log('[BEDROCK] Agent invoked successfully');

    // Collect streaming response
    let fullResponse = '';
    const citations: Citation[] = [];
    const decoder = new TextDecoder(); // Create once, reuse for all chunks
    let chunkCount = 0;

    if (response.completion) {
      console.log('[BEDROCK] Processing completion stream...');
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          const text = decoder.decode(event.chunk.bytes);
          fullResponse += text;
          chunkCount++;
        }

        // Collect citations
        if (event.trace?.trace?.orchestrationTrace?.observation?.knowledgeBaseLookupOutput) {
          const kbOutput =
            event.trace.trace.orchestrationTrace.observation.knowledgeBaseLookupOutput;
          if (kbOutput.retrievedReferences) {
            console.log('[BEDROCK] Found KB references:', kbOutput.retrievedReferences.length);
            kbOutput.retrievedReferences.forEach((ref) => {
              if (ref.location?.s3Location?.uri) {
                citations.push({
                  uri: ref.location.s3Location.uri,
                  text: ref.content?.text || '',
                });
              }
            });
          }
        }
      }
    }

    console.log('[BEDROCK] Response complete:', {
      responseLength: fullResponse.length,
      chunkCount,
      citationCount: citations.length
    });
    console.log('[BEDROCK] === Request End ===');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: fullResponse,
        citations,
        sessionId,
      }),
    };
  } catch (error: any) {
    console.error('[BEDROCK] === ERROR ===');
    console.error('[BEDROCK] Error type:', error.constructor.name);
    console.error('[BEDROCK] Error code:', error.code || error.$metadata?.httpStatusCode);
    console.error('[BEDROCK] Error message:', error.message);
    console.error('[BEDROCK] Full error:', JSON.stringify({
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    }, null, 2));

    return {
      statusCode: error.$metadata?.httpStatusCode || 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to invoke agent',
        message: error.message,
        code: error.code || error.name,
        details: error.$fault || 'Unknown error'
      }),
    };
  }
};
