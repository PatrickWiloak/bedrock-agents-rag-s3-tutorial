import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { KnowledgeBaseConstruct } from './knowledge-base-construct';
import { WebHostingConstruct } from './web-hosting-construct';

/**
 * Default generation model.
 *
 * Every current Claude model on Bedrock is served exclusively through a
 * cross-Region inference profile - none of them support ON_DEMAND invocation -
 * so this is a profile ID, not a bare foundation model ID. Check what your
 * account and Region can reach with:
 *
 *   aws bedrock list-inference-profiles --region us-east-1
 *
 * Swap to `us.anthropic.claude-haiku-4-5-20251001-v1:0` for a markedly cheaper
 * (and faster) tutorial run.
 */
const DEFAULT_MODEL_ID = 'us.anthropic.claude-opus-5';

/**
 * How the answer should be written.
 *
 * With Bedrock Agents this lived in the agent's `instruction`. RetrieveAndGenerate
 * takes the equivalent as a prompt template, which must contain the
 * `$search_results$` placeholder for the retrieved chunks.
 */
const PROMPT_TEMPLATE = `You are a helpful AI assistant for Nobler Works Inc., a SaaS company. You answer questions using the company documents retrieved below, which cover three areas:

1. Financial Data - financial reports, budgets, expense policies, accounts receivable.
2. Human Resources - employee handbook, benefits guide, remote work policy, performance reviews.
3. Meeting Notes - executive leadership meetings, product roadmap planning, engineering sprint retrospectives.

Here are the search results:
$search_results$

How to respond:
- Answer only from the search results above. If they do not contain the answer, say so plainly rather than guessing.
- Name the document an answer came from, e.g. "According to the HR Benefits Guide..." or "Based on the Q4 2024 Financial Report...".
- Be specific: include the relevant dates, amounts, percentages, or policy details.
- If a question spans several areas, synthesise across all the relevant documents.
- Be accurate, helpful, and professional. You are helping employees and stakeholders understand Nobler Works' operations, policies, and performance.`;

export class S3VectorRAGStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Deployment ID
     *
     * Vector bucket and knowledge base names must be unique per account, and S3
     * caps bucket names at 63 characters. A short timestamp keeps repeated
     * teardown/redeploy cycles from colliding while leaving room for prefixes.
     *
     * Pass your own with: cdk deploy --context deploymentId=251021-1540
     */
    const deploymentId =
      this.node.tryGetContext('deploymentId') ||
      (() => {
        const now = new Date();
        const yy = now.getUTCFullYear().toString().slice(-2);
        const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
        const dd = now.getUTCDate().toString().padStart(2, '0');
        const hh = now.getUTCHours().toString().padStart(2, '0');
        const min = now.getUTCMinutes().toString().padStart(2, '0');
        return `${yy}${mm}${dd}-${hh}${min}`;
      })();

    // Model is overridable from the CLI:
    //   cdk deploy --context modelId=us.anthropic.claude-haiku-4-5-20251001-v1:0
    const modelId = this.node.tryGetContext('modelId') || DEFAULT_MODEL_ID;

    // ========================================
    // 1. Document bucket
    // ========================================

    // Documents are organised into folders: Financial-Data/, Human-Resources/,
    // Meeting-Notes/. The short "docs" prefix leaves room under the 63-char limit.
    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      bucketName: `docs-${this.account}-${this.region}-${deploymentId}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For tutorial purposes only
      autoDeleteObjects: true, // For tutorial purposes only
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // ========================================
    // 2. Knowledge base over the whole bucket
    // ========================================

    const knowledgeBase = new KnowledgeBaseConstruct(this, 'KnowledgeBase', {
      dataBucket,
      // No dataPrefix - index every folder in the bucket.
      knowledgeBaseName: `kb-${this.account}-${deploymentId}`,
      embeddingModelId: 'amazon.titan-embed-text-v2:0',
      embeddingDimension: 1024,
      chunkSize: 300,
      chunkOverlapPercentage: 7,
    });

    // ========================================
    // 3. Web UI + chat API
    // ========================================

    // Requires the Next.js static export to exist first (npm run build:web).
    new WebHostingConstruct(this, 'WebHosting', {
      knowledgeBaseId: knowledgeBase.knowledgeBaseId,
      knowledgeBaseArn: knowledgeBase.knowledgeBaseArn,
      modelId,
      numberOfResults: 5,
      promptTemplate: PROMPT_TEMPLATE,
    });

    // ========================================
    // 4. Outputs
    // ========================================

    new cdk.CfnOutput(this, 'DataBucketName', {
      value: dataBucket.bucketName,
      description: 'S3 bucket for storing documents',
      exportName: `${this.stackName}-DataBucketName`,
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseIdOutput', {
      value: knowledgeBase.knowledgeBaseId,
      description: 'Knowledge Base ID',
      exportName: `${this.stackName}-KbId`,
    });

    new cdk.CfnOutput(this, 'DataSourceIdOutput', {
      value: knowledgeBase.dataSourceId,
      description: 'Data Source ID',
      exportName: `${this.stackName}-DsId`,
    });

    new cdk.CfnOutput(this, 'ModelId', {
      value: modelId,
      description: 'Inference profile used to generate answers',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });

    new cdk.CfnOutput(this, 'DocumentFolders', {
      value: 'Financial-Data/, Human-Resources/, Meeting-Notes/',
      description: 'S3 folders for organizing documents',
    });

    new cdk.CfnOutput(this, 'DeploymentInstructions', {
      value:
        'Run "npm run upload-docs" to upload sample documents, then "npm run test-rag" to query them',
      description: 'Next Steps',
    });
  }
}
