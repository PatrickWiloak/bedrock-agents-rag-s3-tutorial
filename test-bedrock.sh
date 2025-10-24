#!/bin/bash

# Bedrock Agent Test Script with Enhanced Logging
# Tests agent invocation and shows detailed permission/error information

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Bedrock Agent Test - Enhanced Logging                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Get AWS account and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-1"

echo "▶ AWS Configuration"
echo "  Account: $ACCOUNT_ID"
echo "  Region: $REGION"
echo ""

# Get agent ID from CloudFormation outputs
echo "▶ Fetching Agent ID from CloudFormation..."
AGENT_ID=$(aws cloudformation describe-stacks \
  --stack-name S3VectorRAGStack \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?contains(OutputKey, 'AgentIdOutput')].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -z "$AGENT_ID" ]; then
  echo "  ✗ ERROR: Could not find Agent ID in CloudFormation outputs"
  echo ""
  echo "  Stack outputs:"
  aws cloudformation describe-stacks \
    --stack-name S3VectorRAGStack \
    --region "$REGION" \
    --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" \
    --output table 2>/dev/null || echo "  Stack not found"
  exit 1
fi

echo "  ✓ Agent ID: $AGENT_ID"
echo ""

# Check agent status
echo "▶ Checking Agent Status..."
AGENT_STATUS=$(aws bedrock-agent get-agent \
  --agent-id "$AGENT_ID" \
  --region "$REGION" \
  --query 'agent.[agentStatus,agentName,foundationModel]' \
  --output json 2>&1)

if [ $? -eq 0 ]; then
  echo "$AGENT_STATUS" | jq -r '. | "  Status: \(.[0])\n  Name: \(.[1])\n  Model: \(.[2])"'
else
  echo "  ✗ ERROR getting agent status:"
  echo "$AGENT_STATUS" | grep -i "error\|denied\|exception" || echo "$AGENT_STATUS"
  exit 1
fi
echo ""

# Check IAM permissions
echo "▶ Checking IAM Permissions..."
CALLER_ARN=$(aws sts get-caller-identity --query Arn --output text)
echo "  Caller: $CALLER_ARN"

# Test InvokeAgent permission
echo "  Testing bedrock-agent:InvokeAgent permission..."
TEST_INVOKE=$(aws bedrock-agent-runtime invoke-agent \
  --agent-id "$AGENT_ID" \
  --agent-alias-id "TSTALIASID" \
  --session-id "test-permissions-$(date +%s)" \
  --input-text "test" \
  --region "$REGION" \
  /tmp/test-output.txt 2>&1)

if [ $? -eq 0 ]; then
  echo "  ✓ InvokeAgent permission: OK"
else
  if echo "$TEST_INVOKE" | grep -iq "AccessDeniedException\|not authorized"; then
    echo "  ✗ InvokeAgent permission: DENIED"
    echo ""
    echo "  Full error:"
    echo "$TEST_INVOKE"
    echo ""
    echo "  Required IAM policy:"
    cat << 'EOF'
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "bedrock-agent:InvokeAgent",
          "bedrock-agent-runtime:InvokeAgent"
        ],
        "Resource": "*"
      }
    ]
  }
EOF
    exit 1
  else
    echo "  ? Permission check inconclusive"
    echo "  Error: $TEST_INVOKE"
  fi
fi
echo ""

# Run actual test
echo "▶ Testing Agent with Question..."
SESSION_ID="test-session-$(date +%s)"
QUESTION="What are the company's PTO benefits?"

echo "  Question: $QUESTION"
echo "  Session: $SESSION_ID"
echo ""

echo "  Invoking agent (this may take 10-30 seconds)..."
echo ""

# Invoke agent and capture output
OUTPUT_FILE="/tmp/bedrock-agent-response-$(date +%s).txt"
ERROR_LOG="/tmp/bedrock-agent-error-$(date +%s).txt"

aws bedrock-agent-runtime invoke-agent \
  --agent-id "$AGENT_ID" \
  --agent-alias-id "TSTALIASID" \
  --session-id "$SESSION_ID" \
  --input-text "$QUESTION" \
  --region "$REGION" \
  "$OUTPUT_FILE" 2>"$ERROR_LOG"

INVOKE_STATUS=$?

echo "═══════════════════════════════════════════════════════════════"
echo "                           RESULTS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ $INVOKE_STATUS -eq 0 ]; then
  echo "✓ SUCCESS - Agent responded"
  echo ""

  # Parse response
  if [ -f "$OUTPUT_FILE" ]; then
    RESPONSE=$(cat "$OUTPUT_FILE")
    echo "Response:"
    echo "─────────────────────────────────────────────────────────────"
    echo "$RESPONSE"
    echo "─────────────────────────────────────────────────────────────"
    echo ""
    echo "Response length: $(echo "$RESPONSE" | wc -c) characters"
  fi
else
  echo "✗ FAILED - Agent invocation failed"
  echo ""

  # Show error details
  if [ -f "$ERROR_LOG" ] && [ -s "$ERROR_LOG" ]; then
    echo "Error details:"
    echo "─────────────────────────────────────────────────────────────"
    cat "$ERROR_LOG"
    echo "─────────────────────────────────────────────────────────────"
    echo ""

    # Check for common errors
    ERROR_CONTENT=$(cat "$ERROR_LOG")

    if echo "$ERROR_CONTENT" | grep -iq "AccessDeniedException"; then
      echo "🔒 Permission Issue Detected"
      echo ""
      echo "The IAM user/role lacks permission to invoke the agent."
      echo ""
      echo "Add this policy to your IAM user/role:"
      cat << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agent:InvokeAgent",
        "bedrock-agent-runtime:InvokeAgent"
      ],
      "Resource": "*"
    }
  ]
}
EOF
    elif echo "$ERROR_CONTENT" | grep -iq "ResourceNotFoundException"; then
      echo "🔍 Agent Not Found"
      echo ""
      echo "The agent or alias doesn't exist. Check:"
      echo "  - Agent ID: $AGENT_ID"
      echo "  - Alias ID: TSTALIASID"
      echo "  - Agent status must be PREPARED or DRAFT"
    elif echo "$ERROR_CONTENT" | grep -iq "ValidationException"; then
      echo "⚠️  Validation Error"
      echo ""
      echo "The request parameters are invalid. Check:"
      echo "  - Agent must be in PREPARED or DRAFT status"
      echo "  - Alias must exist (TSTALIASID is automatic for DRAFT agents)"
    fi
  fi

  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test completed successfully!"
echo ""
echo "To view CloudWatch logs:"
echo "  aws logs tail /aws/lambda/S3VectorRAGStack-WebHostingBedrockApiFunction --follow"
echo ""
