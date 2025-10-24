# Step 5: Testing & Deployment

Learn comprehensive testing strategies and best practices for deploying your RAG agent to production.

## Testing Strategy

### 1. Unit Testing Documents

Test individual document ingestion:

```bash
# Upload single document
aws s3 cp test-doc.md s3://$BUCKET/test-doc.md

# Start ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID

# Verify ingestion
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID
```

### 2. Query Testing

Create a test suite for your agent:

```typescript
// tests/agent-qa.ts
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

interface TestCase {
  query: string;
  expectedKeywords: string[];
  expectCitations: boolean;
}

const testCases: TestCase[] = [
  {
    query: 'What is RAG?',
    expectedKeywords: ['retrieval', 'augmented', 'generation'],
    expectCitations: true
  },
  {
    query: 'How do I deploy?',
    expectedKeywords: ['cdk', 'deploy', 'npm'],
    expectCitations: true
  },
  {
    query: 'What is the weather today?',
    expectedKeywords: ['knowledge base', 'cannot', 'don\'t have'],
    expectCitations: false
  }
];

async function runTests(agentId: string, aliasId: string) {
  const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const sessionId = `test-${Date.now()}`;

    try {
      const response = await client.send(new InvokeAgentCommand({
        agentId,
        agentAliasId: aliasId,
        sessionId,
        inputText: test.query
      }));

      let fullResponse = '';
      let citations: any[] = [];

      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          fullResponse += new TextDecoder().decode(event.chunk.bytes);
        }
        if (event.chunk?.attribution?.citations) {
          citations.push(...event.chunk.attribution.citations);
        }
      }

      // Check keywords
      const hasKeywords = test.expectedKeywords.some(keyword =>
        fullResponse.toLowerCase().includes(keyword.toLowerCase())
      );

      // Check citations
      const hasCitations = citations.length > 0;

      if (hasKeywords && hasCitations === test.expectCitations) {
        console.log(`✓ PASS: ${test.query}`);
        passed++;
      } else {
        console.log(`✗ FAIL: ${test.query}`);
        console.log(`  Expected keywords: ${test.expectedKeywords}`);
        console.log(`  Response: ${fullResponse.substring(0, 100)}...`);
        failed++;
      }
    } catch (error) {
      console.log(`✗ ERROR: ${test.query}`);
      console.error(error);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Run tests
runTests(process.env.AGENT_ID!, process.env.ALIAS_ID!);
```

### 3. Performance Testing

Measure latency and throughput:

```typescript
// tests/performance.ts
async function performanceTest(agentId: string, aliasId: string) {
  const queries = [
    'What is RAG?',
    'How do I deploy?',
    'What models are available?'
  ];

  const results = [];

  for (const query of queries) {
    const start = Date.now();

    await invokeAgent(agentId, aliasId, `perf-${Date.now()}`, query);

    const latency = Date.now() - start;
    results.push({ query, latency });
  }

  // Calculate statistics
  const latencies = results.map(r => r.latency);
  const avg = latencies.reduce((a, b) => a + b) / latencies.length;
  const max = Math.max(...latencies);
  const min = Math.min(...latencies);

  console.log('Performance Results:');
  console.log(`  Average: ${avg}ms`);
  console.log(`  Min: ${min}ms`);
  console.log(`  Max: ${max}ms`);

  results.forEach(r => {
    console.log(`  ${r.query}: ${r.latency}ms`);
  });
}
```

### 4. Load Testing

Test concurrent requests:

```typescript
// tests/load-test.ts
async function loadTest(agentId: string, aliasId: string, concurrency: number) {
  const queries = Array(concurrency).fill('What is RAG?');

  const start = Date.now();

  await Promise.all(
    queries.map((query, i) =>
      invokeAgent(agentId, aliasId, `load-${i}`, query)
    )
  );

  const duration = Date.now() - start;
  const throughput = concurrency / (duration / 1000);

  console.log(`Load Test (${concurrency} concurrent requests):`);
  console.log(`  Duration: ${duration}ms`);
  console.log(`  Throughput: ${throughput.toFixed(2)} req/s`);
}
```

## Validation Checklist

### Pre-Deployment Checks

- [ ] All ingestion jobs completed successfully
- [ ] Test queries return relevant answers
- [ ] Citations are present and accurate
- [ ] Out-of-scope queries handled gracefully
- [ ] Multi-turn conversations maintain context
- [ ] Response latency is acceptable
- [ ] Cost estimates reviewed

### Knowledge Base Quality

```bash
# 1. Check document count
aws s3 ls s3://$BUCKET/ --recursive | wc -l

# 2. Verify ingestion status
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id $KB_ID \
  --data-source-id $DS_ID \
  --max-results 1

# 3. Test direct retrieval
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id $KB_ID \
  --retrieval-query text="test query"
```

### Agent Quality

```bash
# 1. Check agent status
aws bedrock-agent get-agent --agent-id $AGENT_ID

# 2. Verify KB association
aws bedrock-agent list-agent-knowledge-bases \
  --agent-id $AGENT_ID \
  --agent-version DRAFT

# 3. Test invocation
npm run test-agent demo
```

## Monitoring & Observability

### CloudWatch Metrics

Key metrics to monitor:

1. **Invocation Count**
   - Metric: `InvocationCount`
   - Dimension: AgentId

2. **Invocation Latency**
   - Metric: `InvocationLatency`
   - Dimension: AgentId

3. **Errors**
   - Metric: `Errors`
   - Dimension: AgentId

### Setting Up Alarms

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';

// Create SNS topic for alerts
const alertTopic = new sns.Topic(this, 'AgentAlerts', {
  displayName: 'RAG Agent Alerts'
});

// Alarm for high latency
new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/Bedrock',
    metricName: 'InvocationLatency',
    dimensionsMap: {
      AgentId: agent.agentId
    },
    statistic: 'Average',
    period: cdk.Duration.minutes(5)
  }),
  threshold: 5000,  // 5 seconds
  evaluationPeriods: 2,
  alarmDescription: 'Agent response time is high',
  actionsEnabled: true
});

// Alarm for errors
new cloudwatch.Alarm(this, 'ErrorRateAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/Bedrock',
    metricName: 'Errors',
    dimensionsMap: {
      AgentId: agent.agentId
    },
    statistic: 'Sum',
    period: cdk.Duration.minutes(5)
  }),
  threshold: 5,
  evaluationPeriods: 1,
  alarmDescription: 'Agent error rate is high'
});
```

### Custom Logging

Add structured logging:

```typescript
import * as winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'agent.log' })
  ]
});

async function invokeAgentWithLogging(agentId, aliasId, sessionId, query) {
  const start = Date.now();

  try {
    logger.info('Agent invocation started', {
      agentId,
      sessionId,
      query: query.substring(0, 100)
    });

    const response = await invokeAgent(agentId, aliasId, sessionId, query);

    logger.info('Agent invocation completed', {
      agentId,
      sessionId,
      latency: Date.now() - start,
      citationCount: response.citations.length
    });

    return response;
  } catch (error) {
    logger.error('Agent invocation failed', {
      agentId,
      sessionId,
      error: error.message
    });
    throw error;
  }
}
```

## Production Deployment

### Environment Strategy

Use separate stacks for dev/prod:

```typescript
// bin/s3-rag-app.ts
const app = new cdk.App();

const env = app.node.tryGetContext('env') || 'dev';

new S3VectorRAGStack(app, `S3VectorRAGStack-${env}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  stackName: `S3VectorRAGStack-${env}`,
  tags: {
    Environment: env,
    Project: 'RAG-Tutorial'
  }
});
```

Deploy to different environments:

```bash
# Development
cdk deploy -c env=dev

# Production
cdk deploy -c env=prod
```

### Production Configuration

```typescript
// lib/config.ts
export const config = {
  dev: {
    foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0',
    chunkSize: 300,
    removalPolicy: cdk.RemovalPolicy.DESTROY
  },
  prod: {
    foundationModel: 'anthropic.claude-3-sonnet-20240229-v1:0',
    chunkSize: 500,
    removalPolicy: cdk.RemovalPolicy.RETAIN
  }
};

// In stack:
const env = this.node.tryGetContext('env') || 'dev';
const envConfig = config[env];

const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
  foundationModel: envConfig.foundationModel,
  // ...
});
```

### Blue/Green Deployment

Create multiple agent aliases:

```typescript
// Create new version
const createVersion = new cr.AwsCustomResource(this, 'CreateAgentVersion', {
  onCreate: {
    service: 'BedrockAgent',
    action: 'createAgentVersion',
    parameters: {
      agentId: this.agentId,
      description: 'Version 2.0'
    }
  }
});

// Create new alias pointing to new version
const blueAlias = new cr.AwsCustomResource(this, 'BlueAlias', {
  onCreate: {
    service: 'BedrockAgent',
    action: 'createAgentAlias',
    parameters: {
      agentId: this.agentId,
      agentAliasName: 'blue',
      agentVersion: '1'
    }
  }
});

const greenAlias = new cr.AwsCustomResource(this, 'GreenAlias', {
  onCreate: {
    service: 'BedrockAgent',
    action: 'createAgentAlias',
    parameters: {
      agentId: this.agentId,
      agentAliasName: 'green',
      agentVersion: '2'
    }
  }
});
```

### Gradual Rollout

Route traffic between aliases:

```typescript
// In your application
const aliases = ['blue', 'green'];
const bluePercentage = 90;  // 90% to blue, 10% to green

const selectedAlias = Math.random() * 100 < bluePercentage ? 'blue' : 'green';

const response = await invokeAgent(agentId, selectedAlias, sessionId, query);
```

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/deploy.yml
name: Deploy RAG Agent

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy to Dev
        run: cdk deploy -c env=dev --require-approval never

      - name: Run Tests
        run: npm test

      - name: Deploy to Prod
        if: success()
        run: cdk deploy -c env=prod --require-approval never
```

## Rollback Procedures

### Quick Rollback

If issues occur in production:

```bash
# 1. Switch to previous agent version
aws bedrock-agent update-agent-alias \
  --agent-id $AGENT_ID \
  --agent-alias-id $ALIAS_ID \
  --routing-configuration agentVersion=1

# 2. Or redeploy previous CDK version
git checkout <previous-commit>
cdk deploy -c env=prod
```

### Rollback Checklist

- [ ] Verify issue (check CloudWatch logs)
- [ ] Notify stakeholders
- [ ] Switch to previous version
- [ ] Verify rollback successful
- [ ] Investigate root cause
- [ ] Document incident

## Cost Optimization

### Cost Monitoring

```typescript
// Add cost allocation tags
const agent = new BedrockAgentConstruct(this, 'BedrockAgent', {
  // ...
});

cdk.Tags.of(agent).add('CostCenter', 'AI-Platform');
cdk.Tags.of(agent).add('Environment', 'Production');
```

### Cost Reduction Strategies

1. **Use cheaper models for simple queries**
   ```typescript
   // Route based on complexity
   const model = isComplexQuery(query)
     ? 'claude-3-sonnet'
     : 'claude-3-haiku';
   ```

2. **Implement caching**
   ```typescript
   const cache = new Map();

   async function cachedInvoke(query) {
     if (cache.has(query)) {
       return cache.get(query);
     }
     const response = await invokeAgent(query);
     cache.set(query, response);
     return response;
   }
   ```

3. **Reduce OpenSearch OCUs**
   - Delete unused collections
   - Use scheduled scaling
   - Consider Aurora Serverless for vectors (alternative)

## Security Hardening

### IAM Best Practices

```typescript
// Principle of least privilege
knowledgeBaseRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    's3:GetObject'  // Only what's needed
  ],
  resources: [
    `${dataBucket.bucketArn}/*`  // Specific bucket only
  ]
}));
```

### Enable Encryption

```typescript
const dataBucket = new s3.Bucket(this, 'DataBucket', {
  encryption: s3.BucketEncryption.KMS,  // Use KMS
  encryptionKey: new kms.Key(this, 'BucketKey', {
    enableKeyRotation: true
  })
});
```

### VPC Endpoints (Optional)

```typescript
// For added security, use VPC endpoints
const vpc = new ec2.Vpc(this, 'Vpc');

// Bedrock VPC endpoint
new ec2.InterfaceVpcEndpoint(this, 'BedrockEndpoint', {
  vpc,
  service: new ec2.InterfaceVpcEndpointService(
    `com.amazonaws.${this.region}.bedrock-runtime`
  )
});
```

## Disaster Recovery

### Backup Strategy

```bash
# Export agent configuration
aws bedrock-agent get-agent --agent-id $AGENT_ID > agent-backup.json

# Export KB configuration
aws bedrock-agent get-knowledge-base --knowledge-base-id $KB_ID > kb-backup.json

# Backup S3 documents
aws s3 sync s3://$BUCKET/ ./backup/
```

### Recovery Procedures

```bash
# 1. Redeploy infrastructure
cdk deploy

# 2. Restore documents
aws s3 sync ./backup/ s3://$NEW_BUCKET/

# 3. Trigger ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $NEW_KB_ID \
  --data-source-id $NEW_DS_ID
```

## Production Checklist

Before going live:

- [ ] All tests passing
- [ ] CloudWatch alarms configured
- [ ] Logging implemented
- [ ] Cost budget set
- [ ] Backup procedures documented
- [ ] Rollback plan tested
- [ ] Security review completed
- [ ] Load testing performed
- [ ] Documentation updated
- [ ] Stakeholders notified

## Next Steps

Learn advanced features and integrations!

→ Continue to [Step 6: Advanced Customization](06-advanced.md)

## Resources

- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [Bedrock Best Practices](https://docs.aws.amazon.com/bedrock/latest/userguide/best-practices.html)
- [CDK Testing](https://docs.aws.amazon.com/cdk/v2/guide/testing.html)
