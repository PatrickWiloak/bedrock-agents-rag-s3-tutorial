import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export interface WebHostingConstructProps {
  /**
   * The Bedrock Knowledge Base to answer questions from
   */
  knowledgeBaseId: string;

  /**
   * ARN of the knowledge base, used to scope the Lambda's IAM policy
   */
  knowledgeBaseArn: string;

  /**
   * The model that generates answers from retrieved chunks.
   *
   * Every current Claude model on Bedrock is served through a cross-Region
   * inference profile, so this is a profile ID such as
   * `us.anthropic.claude-opus-5` rather than a bare foundation model ID.
   */
  modelId: string;

  /**
   * Number of chunks to retrieve per question
   * @default 5
   */
  numberOfResults?: number;

  /**
   * Prompt template controlling how answers are written.
   *
   * This is the RetrieveAndGenerate equivalent of an agent's instructions. It
   * must contain the `$search_results$` placeholder. Omit it to use Bedrock's
   * built-in template.
   */
  promptTemplate?: string;

  /**
   * Path to the built Next.js static export
   * @default '../web/out'
   */
  webBuildPath?: string;
}

/**
 * Strips the cross-Region routing prefix off an inference profile ID.
 *
 * `us.anthropic.claude-opus-5` -> `anthropic.claude-opus-5`
 *
 * An inference profile routes to the same foundation model in several Regions,
 * and `bedrock:InvokeModel` is authorized against the underlying foundation
 * model in whichever Region serves the request - so the policy needs the base
 * model ID as well as the profile.
 */
function baseModelIdOf(modelId: string): string {
  return modelId.replace(/^(us|eu|apac|global)\./, '');
}

export class WebHostingConstruct extends Construct {
  public readonly distributionDomainName: string;
  public readonly distributionUrl: string;
  public readonly apiEndpoint: string;
  public readonly websiteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebHostingConstructProps) {
    super(scope, id);

    const webBuildPath = props.webBuildPath || path.join(__dirname, '../web/out');
    const stack = cdk.Stack.of(this);

    const modelArn = `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/${props.modelId}`;
    const baseModelArn = `arn:aws:bedrock:*::foundation-model/${baseModelIdOf(props.modelId)}`;

    // ========================================
    // 1. Lambda function backing the chat API
    // ========================================

    const ragApiLambda = new lambda.Function(this, 'BedrockApiFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'bedrock-api.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda'), {
        bundling: {
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install --omit=dev --cache /tmp/npm-cache && cp -r /asset-input/* /asset-output/',
          ],
        },
      }),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        MODEL_ARN: modelArn,
        NUMBER_OF_RESULTS: String(props.numberOfResults ?? 5),
        ...(props.promptTemplate ? { PROMPT_TEMPLATE: props.promptTemplate } : {}),
      },
    });

    // Retrieve is scoped to this one knowledge base.
    ragApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
        resources: [props.knowledgeBaseArn],
      })
    );

    // Generation runs through the inference profile, which in turn invokes the
    // foundation model in one of the Regions the profile spans.
    ragApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [modelArn, baseModelArn],
      })
    );

    // ========================================
    // 2. API Gateway REST API
    // ========================================

    const api = new apigateway.RestApi(this, 'BedrockApi', {
      restApiName: 'Bedrock RAG API',
      description: 'API Gateway for Bedrock Knowledge Base queries',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    const chat = api.root.addResource('chat');
    chat.addMethod('POST', new apigateway.LambdaIntegration(ragApiLambda, { proxy: true }));

    this.apiEndpoint = api.url;

    // ========================================
    // 3. S3 bucket for the static site
    // ========================================

    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      // No websiteIndexDocument here - that would create an S3 website endpoint,
      // which cannot be locked down to CloudFront. Routing is handled by the
      // CloudFront error responses below instead.
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ========================================
    // 4. CloudFront distribution
    // ========================================

    this.distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        // Origin Access Control - the current mechanism for private S3 origins.
        // It supersedes Origin Access Identity and needs no extra construct;
        // CDK writes the matching bucket policy for us.
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA routing
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html', // SPA routing
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Europe, Canada
    });

    this.distributionDomainName = this.distribution.distributionDomainName;
    this.distributionUrl = `https://${this.distributionDomainName}`;

    // ========================================
    // 5. Deploy the static files
    // ========================================

    /**
     * The site and its config.json go up in a single BucketDeployment on
     * purpose. Two separate deployments race each other invalidating the same
     * distribution, and the config would sometimes lose - leaving the UI live
     * but pointing at nothing.
     *
     * config.json carries the API Gateway URL, which only exists at deploy time.
     */
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset(webBuildPath),
        s3deploy.Source.jsonData('config.json', {
          apiEndpoint: this.apiEndpoint,
        }),
      ],
      destinationBucket: this.websiteBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    // ========================================
    // 6. Outputs
    // ========================================

    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: this.distributionUrl,
      description: 'CloudFront URL for the web UI',
      exportName: `${stack.stackName}-WebsiteURL`,
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiEndpoint,
      description: 'API Gateway endpoint for knowledge base queries',
      exportName: `${stack.stackName}-ApiEndpoint`,
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: this.websiteBucket.bucketName,
      description: 'S3 bucket name for static website',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
    });
  }
}
