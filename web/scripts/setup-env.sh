#!/bin/bash

# Setup environment variables for the web UI
# This script fetches Agent ID and Alias ID from CloudFormation outputs

set -e

echo "🔍 Fetching RAG Agent configuration..."

STACK_NAME="S3VectorRAGStack"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first."
    exit 1
fi

# Check if stack exists
if ! aws cloudformation describe-stacks --stack-name $STACK_NAME &> /dev/null; then
    echo "❌ Stack '$STACK_NAME' not found."
    echo "   Please deploy the CDK stack first:"
    echo "   cd .. && cdk deploy"
    exit 1
fi

echo "✓ Found stack: $STACK_NAME"

# Get stack outputs
OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs' \
    --output json)

# Extract values
AGENT_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="AgentIdOutput") | .OutputValue')
ALIAS_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="AgentAliasIdOutput") | .OutputValue')
REGION=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="Region") | .OutputValue')

if [ -z "$AGENT_ID" ] || [ -z "$ALIAS_ID" ] || [ -z "$REGION" ]; then
    echo "❌ Failed to get required outputs from stack"
    echo "   Make sure the stack deployment completed successfully"
    exit 1
fi

echo "✓ Agent ID: $AGENT_ID"
echo "✓ Alias ID: $ALIAS_ID"
echo "✓ Region: $REGION"

# Create .env file
ENV_FILE=".env"

echo ""
echo "📝 Creating $ENV_FILE..."

cat > $ENV_FILE << EOF
# AWS Configuration
AWS_REGION=$REGION

# Bedrock Agent Configuration
AGENT_ID=$AGENT_ID
AGENT_ALIAS_ID=$ALIAS_ID

# Generated at: $(date)
EOF

echo "✅ Environment file created!"
echo ""
echo "You can now run the development server:"
echo "  npm run dev"
echo ""
echo "Or edit $ENV_FILE to customize settings"
