import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { BedrockAgentClient, ListIngestionJobsCommand, GetIngestionJobCommand } from '@aws-sdk/client-bedrock-agent';

const STACK_NAME = 'S3VectorRAGStack';

interface StackOutputs {
  knowledgeBaseId: string;
  dataSourceId: string;
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
  const knowledgeBaseId = outputs.find((o: any) => o.OutputKey === 'KnowledgeBaseIdOutput')?.OutputValue;
  const dataSourceId = outputs.find((o: any) => o.OutputKey === 'DataSourceIdOutput')?.OutputValue;
  const region = outputs.find((o: any) => o.OutputKey === 'Region')?.OutputValue;

  if (!knowledgeBaseId || !dataSourceId || !region) {
    throw new Error('Required stack outputs not found');
  }

  return { knowledgeBaseId, dataSourceId, region };
}

async function checkIngestionStatus() {
  console.log('🔍 Checking Ingestion Status\n');

  const { knowledgeBaseId, dataSourceId, region } = await getStackOutputs();
  console.log(`Knowledge Base: ${knowledgeBaseId}`);
  console.log(`Data Source: ${dataSourceId}`);
  console.log(`Region: ${region}\n`);

  const bedrockClient = new BedrockAgentClient({ region });

  // List all ingestion jobs
  const listResponse = await bedrockClient.send(
    new ListIngestionJobsCommand({
      knowledgeBaseId,
      dataSourceId,
      maxResults: 10,
    })
  );

  const jobs = listResponse.ingestionJobSummaries || [];

  if (jobs.length === 0) {
    console.log('❌ No ingestion jobs found.');
    console.log('   Run "npm run upload-docs" to upload documents and start ingestion.');
    return;
  }

  console.log(`Found ${jobs.length} ingestion job(s):\n`);

  // Sort by start time (newest first)
  jobs.sort((a, b) => {
    const timeA = a.startedAt?.getTime() || 0;
    const timeB = b.startedAt?.getTime() || 0;
    return timeB - timeA;
  });

  for (const job of jobs) {
    const status = job.status;
    const jobId = job.ingestionJobId;
    const startedAt = job.startedAt?.toLocaleString() || 'N/A';

    // Get detailed info for the latest job
    if (job === jobs[0]) {
      const detailResponse = await bedrockClient.send(
        new GetIngestionJobCommand({
          knowledgeBaseId,
          dataSourceId,
          ingestionJobId: jobId,
        })
      );

      const detail = detailResponse.ingestionJob;
      const stats = detail?.statistics;

      console.log('═══════════════════════════════════════════');
      console.log('Latest Ingestion Job');
      console.log('═══════════════════════════════════════════');
      console.log(`Job ID: ${jobId}`);
      console.log(`Status: ${getStatusIcon(status!)} ${status}`);
      console.log(`Started: ${startedAt}`);

      if (detail?.updatedAt) {
        console.log(`Updated: ${detail.updatedAt.toLocaleString()}`);
      }

      if (stats) {
        console.log('\nStatistics:');
        console.log(`  Documents Scanned: ${stats.numberOfDocumentsScanned || 0}`);
        console.log(`  Documents Modified: ${stats.numberOfModifiedDocumentsIndexed || 0}`);
        console.log(`  Documents Deleted: ${stats.numberOfDocumentsDeleted || 0}`);
        console.log(`  Documents Failed: ${stats.numberOfDocumentsFailed || 0}`);
      }

      if (detail?.failureReasons && detail.failureReasons.length > 0) {
        console.log('\n❌ Failure Reasons:');
        detail.failureReasons.forEach((reason) => {
          console.log(`  - ${reason}`);
        });
      }

      console.log('═══════════════════════════════════════════\n');

      // Show status-specific messages
      if (status === 'COMPLETE') {
        console.log('✅ Ingestion complete! Your agent is ready to use.');
        console.log('   Run "npm run test-agent" to test it.\n');
      } else if (status === 'IN_PROGRESS' || status === 'STARTING') {
        console.log('⏳ Ingestion in progress. This usually takes 2-5 minutes.');
        console.log('   Run this command again to check status.\n');
      } else if (status === 'FAILED') {
        console.log('❌ Ingestion failed. Check the failure reasons above.');
        console.log('   Try running "npm run upload-docs" again.\n');
      }
    } else {
      // Show summary for older jobs
      console.log(`${getStatusIcon(status!)} ${status} - ${jobId} (${startedAt})`);
    }
  }

  // Provide AWS CLI command for manual checking
  console.log('\nTo check status manually, run:');
  console.log(`aws bedrock-agent list-ingestion-jobs \\`);
  console.log(`  --knowledge-base-id ${knowledgeBaseId} \\`);
  console.log(`  --data-source-id ${dataSourceId}`);
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    STARTING: '🔄',
    IN_PROGRESS: '⏳',
    COMPLETE: '✅',
    FAILED: '❌',
  };
  return icons[status] || '❓';
}

async function main() {
  try {
    await checkIngestionStatus();
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.log('\nMake sure you have:');
    console.log('1. Deployed the stack: cdk deploy');
    console.log('2. Configured AWS credentials');
    process.exit(1);
  }
}

main();
