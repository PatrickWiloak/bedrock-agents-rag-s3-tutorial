import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { KnowledgeBaseConstruct } from './knowledge-base-construct';
import { BedrockAgentConstruct } from './bedrock-agent-construct';
import { WebHostingConstruct } from './web-hosting-construct';

export class S3VectorRAGStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Generate deployment ID from context or timestamp
    // This ensures each deployment has unique resource names to avoid conflicts
    // Pass via: cdk deploy --context deploymentId=251021-1540
    // Format: YYMMDD-HHMM (shorter to fit S3's 63-char bucket name limit)
    const deploymentId = this.node.tryGetContext('deploymentId') || (() => {
      const now = new Date();
      const yy = now.getUTCFullYear().toString().slice(-2);
      const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
      const dd = now.getUTCDate().toString().padStart(2, '0');
      const hh = now.getUTCHours().toString().padStart(2, '0');
      const min = now.getUTCMinutes().toString().padStart(2, '0');
      return `${yy}${mm}${dd}-${hh}${min}`;
    })();

    // Create S3 bucket for all documents
    // Documents will be organized in folders: Financial-Data/, Human-Resources/, Meeting-Notes/
    // Ultra-short prefix "docs" to maximize space for vector bucket (63-char limit)
    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      bucketName: `docs-${this.account}-${this.region}-${deploymentId}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For tutorial purposes only
      autoDeleteObjects: true, // For tutorial purposes only
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // Create a single Knowledge Base that indexes all documents
    // The S3 bucket will contain 3 folders:
    // - Financial-Data/
    // - Human-Resources/
    // - Meeting-Notes/
    // Using S3 Vectors for cost-effective, serverless vector storage
    // Note: Uses cdk-s3-vectors community library (S3 Vectors not yet in official CDK)
    // Ultra-short prefix "kb" to fit vector bucket's 63-char limit
    const knowledgeBase = new KnowledgeBaseConstruct(this, 'KnowledgeBase', {
      dataBucket: dataBucket,
      // No dataPrefix - index the entire bucket (all folders)
      knowledgeBaseName: `kb-${this.account}-${deploymentId}`,
      embeddingModelId: 'amazon.titan-embed-text-v2:0',
      chunkSize: 300,
      chunkOverlap: 20,
    });

    // Create Bedrock Agent with access to the Knowledge Base
    // Ultra-short prefix "agent" for consistency
    const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
      agentName: `agent-${this.account}-${deploymentId}`,
      knowledgeBaseId: knowledgeBase.knowledgeBaseId,
      foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
      prepareAgent: true, // Prepare the agent and create alias
      instruction: `You are a helpful AI assistant for Nobler Works Inc., a SaaS company. You have access to a knowledge base containing company information organized into three categories.

**Your Knowledge Base Contains:**

1. **Financial Data** (in Financial-Data/ folder): Financial reports, budgets, expense policies, and accounts receivable information.
   - Use for: Financial questions, budget inquiries, expense policy questions, revenue/profit questions

2. **Human Resources** (in Human-Resources/ folder): Employee handbook, benefits guide, remote work policy, and performance review guidelines.
   - Use for: Benefits questions, HR policies, PTO/leave policies, performance review process, remote work guidelines

3. **Meeting Notes** (in Meeting-Notes/ folder): Executive leadership meetings, product roadmap planning, and engineering sprint retrospectives.
   - Use for: Company strategy, product plans, recent decisions, team updates, project status

**How to Respond:**

1. **Search Thoroughly**: Search the knowledge base for relevant information across all document categories
2. **Provide Context**: When answering, mention which category/document the information comes from (e.g., "According to the HR Benefits Guide..." or "Based on the Q4 Financial Report...")
3. **Be Specific**: Include relevant details like dates, amounts, percentages, or policy specifics
4. **Cite Sources**: Reference the specific document when possible (e.g., "employee handbook", "Q4 2024 report")
5. **Multi-domain Answers**: If a question spans multiple categories, synthesize information from all relevant documents
6. **Clarify When Needed**: If the question is ambiguous, ask for clarification
7. **Admit Gaps**: If information isn't in the knowledge base, clearly state that

**Example Interactions:**

User: "What are our PTO benefits?"
You: "According to the Employee Handbook in our HR documentation, Nobler Works provides: [details from KB]"

User: "What was our Q4 revenue?"
You: "Based on the Q4 2024 Financial Report, Nobler Works achieved $12.4M in revenue for Q4 2024, which was 108% of our $11.4M target..."

User: "What are the company's priorities for 2025?"
You: "According to the January 2025 Executive Leadership Meeting notes, the top 5 strategic priorities for 2025 are: [list from meeting notes]"

Remember: You're helping employees and stakeholders understand Nobler Works' operations, policies, and performance. Be accurate, helpful, and professional.`,
      idleSessionTTLInSeconds: 600,
    });

    // Deploy web UI with CloudFront + API Gateway
    // Note: Requires Next.js to be built first (npm run build in web/)
    const webHosting = new WebHostingConstruct(this, 'WebHosting', {
      agentId: agent.agentId,
      agentAliasId: agent.agentAliasId || 'TSTALIASID', // Fallback for build time
    });

    // Stack Outputs
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

    // Note: AgentIdOutput and AgentAliasIdOutput are already created by BedrockAgentConstruct

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });

    new cdk.CfnOutput(this, 'DocumentFolders', {
      value: 'Financial-Data/, Human-Resources/, Meeting-Notes/',
      description: 'S3 folders for organizing documents',
    });

    new cdk.CfnOutput(this, 'DeploymentInstructions', {
      value: 'Run "npm run upload-docs" to upload sample documents, then "npm run test-agent" to test',
      description: 'Next Steps',
    });
  }
}
