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
   * The Bedrock Agent ID
   */
  agentId: string;

  /**
   * The Bedrock Agent Alias ID (optional)
   *
   * AWS Bedrock agents require an alias for invocation. If not provided,
   * this construct will use 'TSTALIASID', which is AWS's built-in test
   * alias that automatically exists for all DRAFT agents.
   *
   * @default 'TSTALIASID' - Built-in test alias for DRAFT agents
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/agents-deploy.html
   */
  agentAliasId?: string;

  /**
   * Path to the built Next.js static export
   * @default '../web/out'
   */
  webBuildPath?: string;
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

    // ========================================
    // 1. Create Lambda function for Bedrock API
    // ========================================

    /**
     * Bedrock API Lambda Function
     *
     * This Lambda handles chat requests from the frontend and invokes the Bedrock Agent.
     *
     * Code location: lambda/ folder contains JavaScript files (.js)
     * - bedrock-api.js is already compiled JavaScript (not TypeScript)
     * - We bundle it with dependencies during CDK deployment
     *
     * Bundling: Installs node_modules and packages everything together
     * so the Lambda has all required AWS SDK dependencies.
     */
    const bedrockApiLambda = new lambda.Function(this, 'BedrockApiFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'bedrock-api.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda'), {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install --production && cp -r /asset-input/* /asset-output/',
          ],
        },
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        AGENT_ID: props.agentId,
        /**
         * AGENT_ALIAS_ID: AWS Bedrock requires an alias ID to invoke agents
         *
         * We use 'TSTALIASID' as the default fallback, which is AWS's built-in
         * test alias that automatically exists for every DRAFT agent. This means:
         * - No need to manually create an alias during development
         * - The agent is immediately invokable after deployment
         * - Perfect for tutorials and testing
         *
         * For production deployments, you can create a custom alias via the
         * Bedrock console or add alias creation to your CDK stack.
         */
        AGENT_ALIAS_ID: props.agentAliasId || 'TSTALIASID',
      },
    });

    // Grant Lambda permissions to invoke Bedrock Agent
    bedrockApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeAgent',
          'bedrock-agent:InvokeAgent',
          'bedrock:InvokeModel',
        ],
        resources: ['*'],
      })
    );

    // ========================================
    // 2. Create API Gateway REST API
    // ========================================

    const api = new apigateway.RestApi(this, 'BedrockApi', {
      restApiName: 'Bedrock Agent API',
      description: 'API Gateway for Bedrock Agent invocations',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      /**
       * CORS Configuration for API Gateway
       *
       * This handles preflight OPTIONS requests from the browser.
       * The actual POST/GET responses must include CORS headers from Lambda.
       *
       * Settings:
       * - allowOrigins: ALL_ORIGINS allows CloudFront (or any domain) to call the API
       *   For production, replace with specific CloudFront domain
       * - allowMethods: Only POST and OPTIONS (tighten security)
       * - allowHeaders: Standard headers for JSON API calls
       */
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

    // Add /chat endpoint
    const chat = api.root.addResource('chat');
    chat.addMethod(
      'POST',
      new apigateway.LambdaIntegration(bedrockApiLambda, {
        proxy: true,
      })
    );

    this.apiEndpoint = api.url;

    // ========================================
    // 3. Create S3 bucket for static website
    // ========================================

    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `rag-tutorial-web-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      // DON'T set websiteIndexDocument/websiteErrorDocument - those create a website endpoint
      // which conflicts with OAI. We handle routing via CloudFront error responses instead.
      publicReadAccess: false, // CloudFront will access via OAI
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ========================================
    // 4. Create CloudFront Distribution
    // ========================================

    // Origin Access Identity for S3
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'WebsiteOAI',
      {
        comment: 'OAI for RAG Tutorial Website',
      }
    );

    // Grant CloudFront read access to S3 bucket
    this.websiteBucket.grantRead(originAccessIdentity);

    // CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(this.websiteBucket, {
          originAccessIdentity,
        }),
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
    // 5. Deploy static files to S3
    // ========================================

    /**
     * Deploy website files AND config.json in a single BucketDeployment
     *
     * IMPORTANT: We combine the Next.js static export and config.json into a
     * single BucketDeployment to avoid conflicts. Previously, using two separate
     * BucketDeployments (one for website, one for config) caused issues:
     * - Both tried to invalidate the same CloudFront distribution simultaneously
     * - The config.json deployment would sometimes fail silently
     * - Users would get "config not found" errors in the frontend
     *
     * By combining them, we ensure:
     * - Single atomic deployment operation
     * - Config.json is always deployed alongside the website
     * - Single CloudFront invalidation at the end
     * - More reliable deployments
     *
     * The config.json contains the API Gateway endpoint URL, which is injected
     * at deployment time so the frontend knows where to send API requests.
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
      distributionPaths: ['/*'], // Invalidate CloudFront cache
    });

    // ========================================
    // 6. Outputs
    // ========================================

    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: this.distributionUrl,
      description: 'CloudFront URL for the web UI',
      exportName: 'RagTutorialWebsiteURL',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.apiEndpoint,
      description: 'API Gateway endpoint for Bedrock Agent',
      exportName: 'RagTutorialApiEndpoint',
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
