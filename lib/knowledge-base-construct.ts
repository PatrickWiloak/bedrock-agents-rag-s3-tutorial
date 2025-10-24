import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';
import * as s3vectors from 'cdk-s3-vectors';

export interface KnowledgeBaseConstructProps {
  /**
   * S3 bucket containing the documents for the knowledge base
   */
  dataBucket: s3.IBucket;

  /**
   * S3 prefix (folder path) for this knowledge base's documents
   * @example 'Financial-Data/' or 'Human-Resources/'
   */
  dataPrefix?: string;

  /**
   * Name prefix for the knowledge base
   */
  knowledgeBaseName: string;

  /**
   * Bedrock embedding model ID
   * @default 'amazon.titan-embed-text-v2:0'
   */
  embeddingModelId?: string;

  /**
   * Chunk size for document splitting
   * @default 300
   */
  chunkSize?: number;

  /**
   * Chunk overlap for document splitting
   * @default 20
   */
  chunkOverlap?: number;
}

export class KnowledgeBaseConstruct extends Construct {
  public readonly knowledgeBase: s3vectors.KnowledgeBase;
  public readonly knowledgeBaseId: string;
  public readonly knowledgeBaseArn: string;
  public readonly dataSource: bedrock.CfnDataSource;
  public readonly dataSourceId: string;
  public readonly vectorBucket: s3vectors.Bucket;
  public readonly vectorIndex: s3vectors.Index;

  constructor(scope: Construct, id: string, props: KnowledgeBaseConstructProps) {
    super(scope, id);

    const embeddingModelId = props.embeddingModelId || 'amazon.titan-embed-text-v2:0';
    const chunkSize = props.chunkSize || 300;
    const chunkOverlap = props.chunkOverlap || 20;

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    // Create S3 Vector Bucket using cdk-s3-vectors (community library)
    // Note: This library works around CloudFormation limitations for S3 Vectors (preview feature)
    this.vectorBucket = new s3vectors.Bucket(this, 'VectorBucket', {
      vectorBucketName: `${props.knowledgeBaseName}-vectors-${account}-${region}`,
    });

    // Create Vector Index (Titan Embed Text V2 uses 1024 dimensions)
    this.vectorIndex = new s3vectors.Index(this, 'VectorIndex', {
      vectorBucketName: this.vectorBucket.vectorBucketName,
      indexName: `${props.knowledgeBaseName}-index`,
      dataType: 'float32',
      dimension: 1024, // Titan Embed Text V2 dimensions
      distanceMetric: 'cosine',
      // CRITICAL: Configure non-filterable metadata keys to avoid "must have at most 2048 bytes" error
      // S3 Vectors has 2KB limit for filterable metadata but 40KB for total metadata
      // AMAZON_BEDROCK_TEXT contains the chunk content (can be large)
      // AMAZON_BEDROCK_METADATA contains system metadata
      metadataConfiguration: {
        nonFilterableMetadataKeys: [
          'AMAZON_BEDROCK_TEXT',
          'AMAZON_BEDROCK_METADATA',
        ],
      },
    });

    // Create Knowledge Base with S3 Vectors
    // This uses the cdk-s3-vectors library which handles the CloudFormation workarounds
    this.knowledgeBase = new s3vectors.KnowledgeBase(this, 'KnowledgeBase', {
      knowledgeBaseName: props.knowledgeBaseName,
      vectorBucketArn: this.vectorBucket.vectorBucketArn,
      indexArn: this.vectorIndex.indexArn,
      knowledgeBaseConfiguration: {
        embeddingModelArn: `arn:aws:bedrock:${region}::foundation-model/${embeddingModelId}`,
        embeddingDataType: 'FLOAT32',
      },
      description: `Knowledge base for RAG tutorial - ${props.knowledgeBaseName}`,
    });

    this.knowledgeBaseId = this.knowledgeBase.knowledgeBaseId;
    this.knowledgeBaseArn = this.knowledgeBase.knowledgeBaseArn;

    // Grant the knowledge base role permission to read from the data bucket
    props.dataBucket.grantRead(this.knowledgeBase.role);

    // Grant S3 Vectors write permissions to the knowledge base role
    this.vectorIndex.grantWrite(this.knowledgeBase.role);

    // CRITICAL: Add QueryVectors permission explicitly
    // The grantWrite() method doesn't include QueryVectors which is needed for KB validation
    this.knowledgeBase.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3vectors:QueryVectors',
          's3vectors:GetVector',
        ],
        resources: [
          this.vectorIndex.indexArn,
          this.vectorBucket.vectorBucketArn,
          `${this.vectorBucket.vectorBucketArn}/*`,
        ],
      })
    );

    // Create S3 Data Source
    const dataSourceConfig: bedrock.CfnDataSource.DataSourceConfigurationProperty = {
      type: 'S3',
      s3Configuration: {
        bucketArn: props.dataBucket.bucketArn,
        inclusionPrefixes: props.dataPrefix ? [props.dataPrefix] : undefined,
      },
    };

    const vectorIngestionConfig: bedrock.CfnDataSource.VectorIngestionConfigurationProperty = {
      chunkingConfiguration: {
        chunkingStrategy: 'FIXED_SIZE',
        fixedSizeChunkingConfiguration: {
          maxTokens: chunkSize,
          overlapPercentage: Math.round((chunkOverlap / chunkSize) * 100),
        },
      },
    };

    this.dataSource = new bedrock.CfnDataSource(this, 'DataSource', {
      name: `${props.knowledgeBaseName}-s3-datasource`,
      knowledgeBaseId: this.knowledgeBaseId,
      dataSourceConfiguration: dataSourceConfig,
      vectorIngestionConfiguration: vectorIngestionConfig,
      dataDeletionPolicy: 'RETAIN', // CRITICAL: Prevents CloudFormation from trying to delete vector store data
    });

    this.dataSourceId = this.dataSource.attrDataSourceId;

    // Outputs
    new cdk.CfnOutput(this, 'VectorBucketName', {
      value: this.vectorBucket.vectorBucketName,
      description: 'S3 Vector Bucket Name',
    });

    new cdk.CfnOutput(this, 'VectorIndexArn', {
      value: this.vectorIndex.indexArn,
      description: 'Vector Index ARN',
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseIdOutput', {
      value: this.knowledgeBaseId,
      description: 'Knowledge Base ID',
      exportName: `${cdk.Stack.of(this).stackName}-${id}-KbId`,
    });

    new cdk.CfnOutput(this, 'DataSourceIdOutput', {
      value: this.dataSourceId,
      description: 'Data Source ID',
      exportName: `${cdk.Stack.of(this).stackName}-${id}-DsId`,
    });
  }
}
