#!/bin/bash

# RAG diagnostic script.
#
# Walks the deployment from the bottom up and stops at the first thing that is
# actually broken, so you get a specific cause instead of a generic
# AccessDeniedException from the web UI.
#
#   ./test-bedrock.sh

set -uo pipefail

STACK_NAME="S3VectorRAGStack"
REGION="${AWS_REGION:-us-east-1}"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; }
info() { echo "  · $1"; }

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              Bedrock RAG Diagnostic                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ---------------------------------------------------------------------------
# 1. Credentials
# ---------------------------------------------------------------------------
echo "▶ AWS credentials"
if ! IDENTITY=$(aws sts get-caller-identity --output json 2>&1); then
  fail "No usable AWS credentials"
  echo "$IDENTITY" | sed 's/^/    /'
  exit 1
fi
ACCOUNT_ID=$(echo "$IDENTITY" | jq -r .Account)
pass "Account: $ACCOUNT_ID"
pass "Region:  $REGION"
echo ""

# ---------------------------------------------------------------------------
# 2. Stack outputs
# ---------------------------------------------------------------------------
echo "▶ CloudFormation stack"
if ! OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query 'Stacks[0].Outputs' --output json 2>&1); then
  fail "Stack '$STACK_NAME' not found in $REGION"
  info "Deploy it first: ./scripts/deploy.sh full"
  exit 1
fi

get_output() {
  echo "$OUTPUTS" | jq -r --arg k "$1" '.[] | select(.OutputKey==$k) | .OutputValue'
}

KB_ID=$(get_output KnowledgeBaseIdOutput)
DS_ID=$(get_output DataSourceIdOutput)
MODEL_ID=$(get_output ModelId)
CHAT_ENDPOINT=$(get_output ChatEndpoint)

if [ -z "$KB_ID" ]; then
  fail "KnowledgeBaseIdOutput missing from stack outputs"
  exit 1
fi
pass "Knowledge Base: $KB_ID"
pass "Data Source:    $DS_ID"
pass "Model:          $MODEL_ID"
echo ""

# ---------------------------------------------------------------------------
# 3. Model access
#
# The most common failure in this tutorial: the model exists, but the account
# has never enabled access to it in the Bedrock console.
# ---------------------------------------------------------------------------
echo "▶ Model access"
PROFILE_STATUS=$(aws bedrock list-inference-profiles --region "$REGION" \
  --query "inferenceProfileSummaries[?inferenceProfileId=='${MODEL_ID}'].status" \
  --output text 2>/dev/null)

if [ -z "$PROFILE_STATUS" ]; then
  fail "Inference profile '$MODEL_ID' is not available in $REGION"
  info "List what is: aws bedrock list-inference-profiles --region $REGION"
else
  pass "Inference profile status: $PROFILE_STATUS"
fi
echo ""

# ---------------------------------------------------------------------------
# 4. Knowledge base state
# ---------------------------------------------------------------------------
echo "▶ Knowledge base"
if ! KB_JSON=$(aws bedrock-agent get-knowledge-base \
  --knowledge-base-id "$KB_ID" --region "$REGION" --output json 2>&1); then
  fail "Cannot read the knowledge base"
  echo "$KB_JSON" | sed 's/^/    /'
  exit 1
fi
KB_STATUS=$(echo "$KB_JSON" | jq -r .knowledgeBase.status)
KB_STORE=$(echo "$KB_JSON" | jq -r .knowledgeBase.storageConfiguration.type)
if [ "$KB_STATUS" = "ACTIVE" ]; then
  pass "Status: $KB_STATUS (storage: $KB_STORE)"
else
  fail "Status: $KB_STATUS"
  echo "$KB_JSON" | jq -r '.knowledgeBase.failureReasons[]?' | sed 's/^/    /'
fi
echo ""

# ---------------------------------------------------------------------------
# 5. Ingestion
# ---------------------------------------------------------------------------
echo "▶ Ingestion"
JOB=$(aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id "$KB_ID" --data-source-id "$DS_ID" \
  --region "$REGION" --max-results 1 \
  --query 'ingestionJobSummaries[0]' --output json 2>/dev/null)

if [ -z "$JOB" ] || [ "$JOB" = "null" ]; then
  fail "No ingestion job has ever run"
  info "Upload and ingest documents: npm run upload-docs"
else
  JOB_STATUS=$(echo "$JOB" | jq -r .status)
  INDEXED=$(echo "$JOB" | jq -r '.statistics.numberOfModifiedDocumentsIndexed // 0')
  FAILED=$(echo "$JOB" | jq -r '.statistics.numberOfDocumentsFailed // 0')
  if [ "$JOB_STATUS" = "COMPLETE" ]; then
    pass "Latest job: $JOB_STATUS ($INDEXED indexed, $FAILED failed)"
  else
    fail "Latest job: $JOB_STATUS ($INDEXED indexed, $FAILED failed)"
    info "Details: npm run check-status"
  fi
fi
echo ""

# ---------------------------------------------------------------------------
# 6. End-to-end query
#
# This one costs a few cents - it actually runs retrieval and generation.
# ---------------------------------------------------------------------------
echo "▶ End-to-end query (this invokes the model)"
QUESTION="What is the remote work policy?"
info "Asking: $QUESTION"

RESULT=$(aws bedrock-agent-runtime retrieve-and-generate \
  --region "$REGION" \
  --input "{\"text\":\"${QUESTION}\"}" \
  --retrieve-and-generate-configuration "{
    \"type\": \"KNOWLEDGE_BASE\",
    \"knowledgeBaseConfiguration\": {
      \"knowledgeBaseId\": \"${KB_ID}\",
      \"modelArn\": \"arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:inference-profile/${MODEL_ID}\"
    }
  }" --output json 2>&1)

if echo "$RESULT" | jq -e .output.text >/dev/null 2>&1; then
  pass "Got an answer:"
  echo "$RESULT" | jq -r .output.text | head -5 | sed 's/^/    /'
  CITES=$(echo "$RESULT" | jq '[.citations[].retrievedReferences[]?] | length')
  pass "Citations: $CITES"
else
  fail "Query failed"
  echo "$RESULT" | sed 's/^/    /'
  echo ""
  info "AccessDeniedException on the model usually means model access is not"
  info "enabled for this account. Enable it in the Bedrock console under"
  info "'Model access', then retry."
  exit 1
fi
echo ""

# ---------------------------------------------------------------------------
# 7. Streaming endpoint
#
# Verifies the whole browser-facing path: CloudFront -> Lambda Function URL ->
# Bedrock, and that the response actually streams as NDJSON rather than arriving
# as one buffered blob.
# ---------------------------------------------------------------------------
if [ -n "$CHAT_ENDPOINT" ]; then
  echo "▶ Streaming endpoint"
  info "POST $CHAT_ENDPOINT"

  FIRST_LINES=$(curl -s --max-time 60 -X POST "$CHAT_ENDPOINT" \
    -H 'Content-Type: application/json' \
    -d '{"message":"What is the remote work policy?"}' | head -5)

  if echo "$FIRST_LINES" | jq -e 'select(.type)' >/dev/null 2>&1; then
    pass "Endpoint returned NDJSON events:"
    echo "$FIRST_LINES" | jq -rc 'select(.type) | .type' 2>/dev/null | sort -u | sed 's/^/    /'
  else
    fail "Endpoint did not return NDJSON"
    echo "$FIRST_LINES" | head -3 | sed 's/^/    /'
    info "CloudFront can take a few minutes to propagate after a first deploy."
  fi
  echo ""
fi
echo "✅ All checks passed."
