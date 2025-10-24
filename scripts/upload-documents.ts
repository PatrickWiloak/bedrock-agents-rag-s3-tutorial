import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { BedrockAgentClient, StartIngestionJobCommand } from '@aws-sdk/client-bedrock-agent';
import * as fs from 'fs';
import * as path from 'path';

const STACK_NAME = 'S3VectorRAGStack';
const SAMPLE_DOCS_DIR = path.join(__dirname, '..', 'sample-data', 'knowledge-docs');

interface StackOutputs {
  bucketName: string;
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
  const bucketName = outputs.find((o: any) => o.OutputKey === 'DataBucketName')?.OutputValue;
  const knowledgeBaseId = outputs.find((o: any) => o.OutputKey === 'KnowledgeBaseIdOutput')?.OutputValue;
  const dataSourceId = outputs.find((o: any) => o.OutputKey === 'DataSourceIdOutput')?.OutputValue;
  const region = outputs.find((o: any) => o.OutputKey === 'Region')?.OutputValue;

  if (!bucketName || !knowledgeBaseId || !dataSourceId || !region) {
    throw new Error('Required stack outputs not found');
  }

  return { bucketName, knowledgeBaseId, dataSourceId, region };
}

async function uploadFile(
  s3Client: S3Client,
  bucketName: string,
  filePath: string,
  key: string
): Promise<void> {
  const fileContent = fs.readFileSync(filePath);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileContent,
    ContentType: getContentType(filePath),
  });

  await s3Client.send(command);
  console.log(`✓ Uploaded: ${key}`);
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.html': 'text/html',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

async function uploadDirectory(
  s3Client: S3Client,
  bucketName: string,
  dirPath: string,
  prefix: string = ''
): Promise<number> {
  let uploadedCount = 0;

  if (!fs.existsSync(dirPath)) {
    console.log(`Directory not found: ${dirPath}`);
    return 0;
  }

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      const subPrefix = prefix ? `${prefix}/${file}` : file;
      uploadedCount += await uploadDirectory(s3Client, bucketName, filePath, subPrefix);
    } else {
      const key = prefix ? `${prefix}/${file}` : file;
      await uploadFile(s3Client, bucketName, filePath, key);
      uploadedCount++;
    }
  }

  return uploadedCount;
}

async function startIngestion(
  bedrockClient: BedrockAgentClient,
  knowledgeBaseId: string,
  dataSourceId: string
): Promise<void> {
  console.log('\nStarting ingestion job...');

  const command = new StartIngestionJobCommand({
    knowledgeBaseId,
    dataSourceId,
    description: 'Ingesting sample documents',
  });

  const response = await bedrockClient.send(command);
  const jobId = response.ingestionJob?.ingestionJobId;

  console.log(`✓ Ingestion job started: ${jobId}`);
  console.log('  Status: STARTING');
  console.log('\nThis may take a few minutes. You can check the status with:');
  console.log(`aws bedrock-agent get-ingestion-job \\`);
  console.log(`  --knowledge-base-id ${knowledgeBaseId} \\`);
  console.log(`  --data-source-id ${dataSourceId} \\`);
  console.log(`  --ingestion-job-id ${jobId}`);
}

async function main() {
  try {
    console.log('🚀 S3 RAG Tutorial - Document Upload\n');

    // Get stack outputs
    console.log('1. Fetching stack information...');
    const { bucketName, knowledgeBaseId, dataSourceId, region } = await getStackOutputs();
    console.log(`   ✓ Bucket: ${bucketName}`);
    console.log(`   ✓ Knowledge Base ID: ${knowledgeBaseId}`);
    console.log(`   ✓ Data Source ID: ${dataSourceId}`);
    console.log(`   ✓ Region: ${region}\n`);

    // Initialize S3 client
    const s3Client = new S3Client({ region });

    // Upload sample documents
    console.log('2. Uploading sample documents to all folders...');
    const uploadedCount = await uploadDirectory(s3Client, bucketName, SAMPLE_DOCS_DIR);
    console.log(`   ✓ Uploaded ${uploadedCount} files\n`);

    // List uploaded files
    console.log('3. Verifying uploads...');
    const listCommand = new ListObjectsV2Command({ Bucket: bucketName });
    const listResponse = await s3Client.send(listCommand);
    const fileCount = listResponse.Contents?.length || 0;
    console.log(`   ✓ Total files in bucket: ${fileCount}\n`);

    // Start ingestion
    console.log('4. Starting ingestion job...');
    const bedrockClient = new BedrockAgentClient({ region });
    await startIngestion(bedrockClient, knowledgeBaseId, dataSourceId);

    console.log('\n✅ Upload complete!');
    console.log('\nNext steps:');
    console.log('1. Wait for ingestion job to complete (usually 2-5 minutes)');
    console.log('   Run "npm run check-status" to monitor progress');
    console.log('2. Once complete, run "npm run test-agent" to test your agent');
    console.log('3. Add your own documents to the appropriate folders and re-run ingestion');
    console.log('\nKnowledge Base Folders:');
    console.log('  • Financial-Data/     - Financial reports, budgets, policies');
    console.log('  • Human-Resources/     - HR policies, benefits, employee info');
    console.log('  • Meeting-Notes/       - Executive meetings, product planning, retros');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
