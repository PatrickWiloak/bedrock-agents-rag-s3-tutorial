#!/bin/bash
#
# Deployment entry point for the Bedrock RAG + S3 Vectors tutorial.
#
#   ./scripts/deploy.sh full        # everything: infra -> docs -> ingest -> health check
#   ./scripts/deploy.sh infra       # cdk deploy only (builds the web export first)
#   ./scripts/deploy.sh frontend    # rebuild the UI and redeploy it
#   ./scripts/deploy.sh backend     # redeploy the chat Lambda only
#   ./scripts/deploy.sh docs        # upload sample documents + start ingestion
#   ./scripts/deploy.sh ingest      # start ingestion (documents already in S3)
#   ./scripts/deploy.sh diff        # cdk diff
#   ./scripts/deploy.sh status      # resource IDs and URLs
#   ./scripts/deploy.sh destroy     # tear everything down (typed confirmation)
#
# Environment:
#   AWS_REGION      target region (default us-east-1)
#   MODEL_ID        override the generation model for this deploy
#   SKIP_HEALTH=1   skip the post-deploy smoke test

set -euo pipefail

STACK_NAME="${STACK_NAME:-S3VectorRAGStack}"
REGION="${AWS_REGION:-us-east-1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_START_TS=$(date +%s)
CMD_NAME="${1:-full}"

cd "$REPO_ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────────────────────
if [ -t 2 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[0;31m'; C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[1;33m'; C_CYAN=$'\033[0;36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''
fi

header()  { printf "\n%s%s══ %s ══%s\n" "$C_CYAN" "$C_BOLD" "$*" "$C_RESET" >&2; }
step()    { printf "\n%s▶%s %s\n" "$C_CYAN" "$C_RESET" "$*" >&2; }
info()    { printf "  %s→%s %s\n" "$C_DIM" "$C_RESET" "$*" >&2; }
success() { printf "  %s✓%s %s\n" "$C_GREEN" "$C_RESET" "$*" >&2; }
warn()    { printf "  %s!%s %s\n" "$C_YELLOW" "$C_RESET" "$*" >&2; }
err_msg() { printf "  %s✗%s %s\n" "$C_RED" "$C_RESET" "$*" >&2; }
die()     { err_msg "$*"; exit 1; }

format_duration() {
  local s=$1
  if [ "$s" -lt 60 ]; then printf "%ds" "$s"; else printf "%dm %ds" $((s / 60)) $((s % 60)); fi
}

on_error() {
  local code=$?
  err_msg "Failed at line $1 (exit $code) during '$CMD_NAME'."
  info "Nothing is rolled back automatically - run './scripts/deploy.sh status' to see current state."
  exit "$code"
}
trap 'on_error $LINENO' ERR

# ─────────────────────────────────────────────────────────────────────────────
# Preflight
# ─────────────────────────────────────────────────────────────────────────────
check_prereqs() {
  step "Checking prerequisites"

  command -v aws >/dev/null  || die "AWS CLI not found."
  command -v node >/dev/null || die "Node.js not found (need 20+)."
  command -v jq >/dev/null   || die "jq not found."

  local major
  major="$(node --version | sed 's/^v//' | cut -d. -f1)"
  [ "$major" -ge 20 ] || die "Node $major found; this project needs Node 20 or newer."

  # CDK bundles the Lambda inside a container, so Docker has to be up.
  docker info >/dev/null 2>&1 || die "Docker is not running - CDK needs it to bundle the Lambda."

  local identity
  identity="$(aws sts get-caller-identity --output json)" || die "AWS credentials are not usable."
  success "Account $(echo "$identity" | jq -r .Account) in $REGION"
  success "Node $(node --version), Docker up"
}

# ─────────────────────────────────────────────────────────────────────────────
# Stack helpers
# ─────────────────────────────────────────────────────────────────────────────
stack_exists() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" >/dev/null 2>&1
}

stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null | grep -v '^None$' || true
}

cdk_context_args() {
  # Model can be overridden per-deploy without editing any source.
  [ -n "${MODEL_ID:-}" ] && printf -- '--context\nmodelId=%s\n' "$MODEL_ID"
}

# ─────────────────────────────────────────────────────────────────────────────
# Steps
# ─────────────────────────────────────────────────────────────────────────────
step_build_web() {
  step "Building the web UI"
  info "Next.js static export -> web/out"
  npm run build:web >/dev/null
  [ -d web/out ] || die "web/out was not produced; run 'npm run build:web' directly to see why."
  success "Static export ready ($(find web/out -type f | wc -l | tr -d ' ') files)"
}

step_deploy() {
  step "Deploying the CDK stack"
  local args=()
  while IFS= read -r line; do [ -n "$line" ] && args+=("$line"); done < <(cdk_context_args)

  if stack_exists; then
    info "Updating existing stack '$STACK_NAME'"
  else
    info "Creating stack '$STACK_NAME' (first deploy takes 5-8 minutes)"
  fi

  npx cdk deploy --require-approval never "${args[@]+"${args[@]}"}"
  success "Stack deployed"
}

step_upload_docs() {
  step "Uploading sample documents"
  npm run upload-docs
  success "Documents uploaded and ingestion started"
}

step_ingest() {
  step "Starting ingestion"
  local kb ds
  kb="$(stack_output KnowledgeBaseIdOutput)"
  ds="$(stack_output DataSourceIdOutput)"
  [ -n "$kb" ] && [ -n "$ds" ] || die "Knowledge base or data source not found in stack outputs."

  aws bedrock-agent start-ingestion-job \
    --knowledge-base-id "$kb" --data-source-id "$ds" --region "$REGION" >/dev/null
  success "Ingestion job started"
}

step_wait_ingestion() {
  step "Waiting for ingestion"
  local kb ds status
  kb="$(stack_output KnowledgeBaseIdOutput)"
  ds="$(stack_output DataSourceIdOutput)"
  [ -n "$kb" ] && [ -n "$ds" ] || { warn "No knowledge base yet; skipping."; return 0; }

  for attempt in $(seq 1 40); do
    status="$(aws bedrock-agent list-ingestion-jobs \
      --knowledge-base-id "$kb" --data-source-id "$ds" --region "$REGION" \
      --max-results 1 --query 'ingestionJobSummaries[0].status' --output text 2>/dev/null || echo UNKNOWN)"

    case "$status" in
      COMPLETE) success "Ingestion complete"; return 0 ;;
      FAILED)   err_msg "Ingestion failed - run 'npm run check-status' for the reasons"; return 1 ;;
      *)        info "Attempt $attempt/40: $status - checking again in 15s"; sleep 15 ;;
    esac
  done

  warn "Ingestion still running after 10 minutes. Check with 'npm run check-status'."
}

step_backend() {
  step "Redeploying the chat Lambda"
  # There is no code-only path with CDK the way there is with Terraform; the
  # stack deploy is already incremental and only replaces the changed asset.
  step_deploy
}

step_health_check() {
  [ "${SKIP_HEALTH:-0}" = "1" ] && { warn "SKIP_HEALTH=1, skipping smoke test."; return 0; }
  step "Health check"

  local url code
  url="$(stack_output WebsiteURL)"
  [ -n "$url" ] || { warn "No WebsiteURL output; skipping."; return 0; }

  info "Polling $url ..."
  for attempt in 1 2 3 4 5; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url/" || echo 000)"
    if [ "$code" = "200" ]; then
      success "Site returned 200 on attempt $attempt"
      return 0
    fi
    info "Attempt $attempt/5: HTTP $code - retrying in 5s"
    sleep 5
  done
  warn "Site not returning 200 yet (last: $code). CloudFront may still be propagating."
}

step_summary() {
  header "Summary"
  local duration
  duration="$(format_duration $(( $(date +%s) - DEPLOY_START_TS )))"

  printf "  %sCommand%s        %s\n"  "$C_BOLD" "$C_RESET" "$CMD_NAME" >&2
  printf "  %sDuration%s       %s\n"  "$C_BOLD" "$C_RESET" "$duration" >&2
  printf "\n" >&2
  printf "  %sSite%s           %s\n"  "$C_BOLD" "$C_RESET" "$(stack_output WebsiteURL || echo '-')" >&2
  printf "  %sChat endpoint%s  %s\n"  "$C_BOLD" "$C_RESET" "$(stack_output ChatEndpoint || echo '-')" >&2
  printf "\n" >&2
  printf "  %sKnowledge base%s %s\n"  "$C_BOLD" "$C_RESET" "$(stack_output KnowledgeBaseIdOutput || echo '-')" >&2
  printf "  %sData source%s    %s\n"  "$C_BOLD" "$C_RESET" "$(stack_output DataSourceIdOutput || echo '-')" >&2
  printf "  %sModel%s          %s\n"  "$C_BOLD" "$C_RESET" "$(stack_output ModelId || echo '-')" >&2
  printf "  %sDocuments%s      %s\n"  "$C_BOLD" "$C_RESET" "$(stack_output DataBucketName || echo '-')" >&2
  printf "\n" >&2
  printf "  %sNext:%s npm run test-rag   ·   ./test-bedrock.sh   ·   ./scripts/deploy.sh destroy\n" \
    "$C_DIM" "$C_RESET" >&2
  printf "\n" >&2
  warn "This costs money while it exists. Destroy it when you are done."
}

# ─────────────────────────────────────────────────────────────────────────────
# Subcommands
# ─────────────────────────────────────────────────────────────────────────────
cmd_full() {
  header "Full deployment"
  check_prereqs
  step_build_web
  step_deploy
  step_upload_docs
  step_wait_ingestion
  step_health_check
  step_summary
}

cmd_infra() {
  header "Infrastructure"
  check_prereqs
  step_build_web
  step_deploy
  step_summary
}

cmd_frontend() {
  header "Frontend"
  check_prereqs
  step_build_web
  step_deploy
  step_health_check
  step_summary
}

cmd_backend() {
  header "Backend"
  check_prereqs
  step_backend
  step_summary
}

cmd_docs() {
  header "Documents"
  stack_exists || die "Stack '$STACK_NAME' not found - deploy it first."
  step_upload_docs
  step_wait_ingestion
}

cmd_ingest() {
  header "Ingestion"
  stack_exists || die "Stack '$STACK_NAME' not found - deploy it first."
  step_ingest
  step_wait_ingestion
}

cmd_diff() {
  header "Diff"
  local args=()
  while IFS= read -r line; do [ -n "$line" ] && args+=("$line"); done < <(cdk_context_args)
  npx cdk diff "${args[@]+"${args[@]}"}"
}

cmd_status() {
  header "Status"
  stack_exists || die "Stack '$STACK_NAME' does not exist in $REGION."
  DEPLOY_START_TS=$(date +%s)
  step_summary
}

cmd_destroy() {
  header "Destroy"
  stack_exists || die "Stack '$STACK_NAME' does not exist in $REGION."

  warn "This deletes the knowledge base, the vector index and every stored embedding,"
  warn "and the document bucket along with its contents."
  printf "\n  Type the stack name (%s) to confirm: " "$STACK_NAME" >&2
  read -r reply
  [ "$reply" = "$STACK_NAME" ] || die "Confirmation did not match - nothing was deleted."

  npx cdk destroy --force
  success "Stack destroyed"
  info "Verify: aws s3vectors list-vector-buckets --region $REGION"
}

cmd_help() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

case "$CMD_NAME" in
  full)      cmd_full ;;
  infra)     cmd_infra ;;
  frontend)  cmd_frontend ;;
  backend)   cmd_backend ;;
  docs)      cmd_docs ;;
  ingest)    cmd_ingest ;;
  diff)      cmd_diff ;;
  status)    cmd_status ;;
  destroy)   cmd_destroy ;;
  help|-h|--help) cmd_help ;;
  *) err_msg "Unknown command: $CMD_NAME"; cmd_help; exit 1 ;;
esac
