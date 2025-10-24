#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { S3VectorRAGStack } from '../lib/s3-rag-stack';

const app = new cdk.App();

new S3VectorRAGStack(app, 'S3VectorRAGStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'S3 RAG with Amazon Bedrock Agents Tutorial Stack',
});

app.synth();
