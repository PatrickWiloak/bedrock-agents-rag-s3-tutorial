#!/bin/bash

# Writes web/public/config.json so `next dev` can talk to the deployed backend.
#
# The built site gets its config.json from CDK at deploy time. The dev server
# has no such step, so this fetches the API Gateway endpoint from the stack
# outputs and writes the same file by hand.
#
#   npm run setup --workspace=web

set -euo pipefail

STACK_NAME="${STACK_NAME:-S3VectorRAGStack}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$(dirname "$SCRIPT_DIR")/public"

command -v aws >/dev/null || { echo "❌ AWS CLI not found."; exit 1; }
command -v jq  >/dev/null || { echo "❌ jq not found."; exit 1; }

echo "🔍 Fetching configuration from stack '$STACK_NAME'..."

if ! OUTPUTS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
      --query 'Stacks[0].Outputs' --output json 2>/dev/null); then
  echo "❌ Stack '$STACK_NAME' not found."
  echo "   Deploy it first, from the repository root:  cdk deploy"
  exit 1
fi

API_ENDPOINT=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="ApiEndpoint") | .OutputValue')

if [ -z "$API_ENDPOINT" ] || [ "$API_ENDPOINT" = "null" ]; then
  echo "❌ ApiEndpoint not found in stack outputs."
  exit 1
fi

mkdir -p "$PUBLIC_DIR"
printf '{\n  "apiEndpoint": "%s"\n}\n' "$API_ENDPOINT" > "$PUBLIC_DIR/config.json"

echo "✓ Wrote $PUBLIC_DIR/config.json"
echo "  apiEndpoint: $API_ENDPOINT"
echo ""
echo "Now run:  npm run dev --workspace=web"
