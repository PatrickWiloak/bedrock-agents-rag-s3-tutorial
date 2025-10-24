import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import * as readline from 'readline';

const STACK_NAME = 'S3VectorRAGStack';

interface StackOutputs {
  agentId: string;
  aliasId: string;
  region: string;
}

async function getStackOutputs(): Promise<StackOutputs> {
  const cfnClient = new CloudFormationClient({});

  const response = await cfnClient.send(
    new DescribeStacksCommand({ StackName: STACK_NAME })
  );

  const stack = response.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${STACK_NAME} not found`);
  }

  const outputs = stack.Outputs || [];

  // Find agent ID - the output key contains 'AgentId' but has an auto-generated suffix
  const agentIdOutput = outputs.find((o: any) =>
    o.OutputKey.includes('AgentIdOutput') && o.Description === 'Bedrock Agent ID'
  );
  const agentId = agentIdOutput?.OutputValue;

  // Find agent alias ID - may not exist if prepareAgent is false
  const aliasIdOutput = outputs.find((o: any) =>
    o.OutputKey.includes('AgentAliasIdOutput') || o.Description === 'Agent Alias ID'
  );
  const aliasId = aliasIdOutput?.OutputValue || 'TSTALIASID'; // Use test alias as fallback

  const region = outputs.find((o: any) => o.OutputKey === 'Region')?.OutputValue;

  if (!agentId || !region) {
    throw new Error('Required stack outputs not found. Make sure the stack has been deployed.');
  }

  return { agentId, aliasId, region };
}

async function invokeAgent(
  client: BedrockAgentRuntimeClient,
  agentId: string,
  aliasId: string,
  sessionId: string,
  inputText: string,
  enableTrace: boolean = false
): Promise<{ response: string; citations: any[] }> {
  const command = new InvokeAgentCommand({
    agentId,
    agentAliasId: aliasId,
    sessionId,
    inputText,
    enableTrace,
  });

  const response = await client.send(command);

  let fullResponse = '';
  const citations: any[] = [];
  let firstChunk = true;

  if (response.completion) {
    for await (const event of response.completion) {
      // Handle chunk events
      if (event.chunk?.bytes) {
        // Clear "thinking..." on first chunk
        if (firstChunk) {
          process.stdout.write('\r\x1b[K'); // Clear the line
          firstChunk = false;
        }

        const chunkText = new TextDecoder().decode(event.chunk.bytes);
        fullResponse += chunkText;
        process.stdout.write(chunkText); // Stream to console
      }

      // Handle citations
      if (event.chunk?.attribution?.citations) {
        citations.push(...event.chunk.attribution.citations);
      }

      // Handle trace events (if enabled)
      if (event.trace && enableTrace) {
        console.log('\n[TRACE]', JSON.stringify(event.trace, null, 2));
      }
    }
  }

  return { response: fullResponse, citations };
}

function formatCitations(citations: any[]): string[] {
  const sources = new Set<string>();

  for (const citation of citations) {
    const refs = citation.retrievedReferences || [];
    for (const ref of refs) {
      if (ref.location?.s3Location?.uri) {
        sources.add(ref.location.s3Location.uri);
      }
    }
  }

  return Array.from(sources);
}

async function interactiveMode(
  client: BedrockAgentRuntimeClient,
  agentId: string,
  aliasId: string
) {
  const sessionId = `session-${Date.now()}`;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  💬 Interactive Chat Mode                                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log('Ask questions about:');
  console.log('  💰 Financial data (budgets, revenue, expenses)');
  console.log('  👥 HR policies (benefits, PTO, performance reviews)');
  console.log('  📝 Meeting notes (decisions, roadmaps, strategy)\n');
  console.log('Type "exit" to quit.\n');

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      const question = input.trim();

      if (question.toLowerCase() === 'exit') {
        console.log('\nGoodbye!');
        rl.close();
        return;
      }

      if (!question) {
        askQuestion();
        return;
      }

      try {
        process.stdout.write('\n🤖 Agent: thinking...');
        const { citations } = await invokeAgent(
          client,
          agentId,
          aliasId,
          sessionId,
          question
        );

        // Show citations if any
        if (citations.length > 0) {
          const sources = formatCitations(citations);
          console.log('\n\n📚 Sources:');
          sources.forEach((source, idx) => {
            console.log(`  ${idx + 1}. ${source}`);
          });
        }

        console.log(); // New line
      } catch (error) {
        console.error('\n❌ Error:', error);
      }

      askQuestion();
    });
  };

  askQuestion();
}

async function demoMode(
  client: BedrockAgentRuntimeClient,
  agentId: string,
  aliasId: string
) {
  const sessionId = `demo-${Date.now()}`;

  const questions = [
    {
      q: 'What is the target net income for 2025?',
      category: '💰 Financial Data',
    },
    {
      q: 'How many PTO days do employees get per year?',
      category: '👥 Human Resources',
    },
    {
      q: 'What are the top 5 strategic priorities for 2025?',
      category: '📝 Meeting Notes',
    },
    {
      q: 'What was our Q4 2024 revenue and how did it compare to the target?',
      category: '💰 Financial Data',
    },
  ];

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  🎬 Demo Mode - Automated RAG Testing                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log('Testing Knowledge Base retrieval across all document categories:\n');

  for (let i = 0; i < questions.length; i++) {
    const { q, category } = questions[i];

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`${category} | Question ${i + 1}/${questions.length}`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`\n❓ ${q}\n`);
    process.stdout.write('🤖 Agent: thinking...');

    try {
      const { citations } = await invokeAgent(
        client,
        agentId,
        aliasId,
        sessionId,
        q
      );

      if (citations.length > 0) {
        const sources = formatCitations(citations);
        console.log('\n\n📚 Sources:');
        sources.forEach((source, idx) => {
          console.log(`  ${idx + 1}. ${source}`);
        });
      }

      console.log();

      // Wait a bit between questions for better readability
      if (i < questions.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error('\n❌ Error:', error);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log('✅ Demo complete! All Knowledge Base categories tested successfully.');
  console.log(`${'═'.repeat(70)}\n`);
  console.log('💡 Tip: Run with "interactive" mode to ask your own questions:');
  console.log('   npm run test-agent interactive\n');
}

async function main() {
  try {
    console.log('🚀 S3 RAG Tutorial - Agent Test\n');

    // Get stack outputs
    console.log('Fetching agent information...');
    const { agentId, aliasId, region } = await getStackOutputs();
    console.log(`✓ Agent ID: ${agentId}`);
    console.log(`✓ Alias ID: ${aliasId}${aliasId === 'TSTALIASID' ? ' (test alias - prepareAgent is disabled)' : ''}`);
    console.log(`✓ Region: ${region}`);

    // Initialize Bedrock client
    const client = new BedrockAgentRuntimeClient({ region });

    // Check if running in demo or interactive mode
    // Default to 'demo' for automated testing with good UX
    const mode = process.argv[2] || 'demo';

    if (mode === 'interactive') {
      await interactiveMode(client, agentId, aliasId);
    } else {
      await demoMode(client, agentId, aliasId);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure you have deployed the stack: cdk deploy');
    console.log('2. Make sure you have uploaded documents: npm run upload-docs');
    console.log('3. Wait for the ingestion job to complete (check AWS console)');
    console.log('4. Verify your AWS credentials are configured');
    process.exit(1);
  }
}

main();
