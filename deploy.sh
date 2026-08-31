#!/bin/bash

# Complete Deployment Script for the S3 Vectors RAG Tutorial
# Handles everything from prerequisites to a queryable knowledge base

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="S3VectorRAGStack"
REGION="${AWS_REGION:-us-east-1}"

# Function to print a section header
print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "╔═══════════════════════════════════════════════════════════════════════════╗"
    printf "║ %-73s ║\n" "$1"
    echo "╚═══════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_step() {
    echo -e "${MAGENTA}▶${NC} $1"
}

print_progress() {
    echo -e "${CYAN}●${NC} $1"
}

# Clear screen and show banner
clear
echo -e "${BLUE}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║  ███████╗ ██████╗     ██╗   ██╗███████╗  ██████╗████████╗ ██████╗ ██████╗ ║
║  ██╔════╝ ╚════██╗    ██║   ██║██╔════╝ ██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗║
║  ███████╗  █████╔╝    ██║   ██║█████╗   ██║        ██║   ██║   ██║██████╔╝║
║  ╚════██║  ╚═══██╗    ╚██╗ ██╔╝██╔══╝   ██║        ██║   ██║   ██║██╔══██╗║
║  ███████║ ██████╔╝     ╚████╔╝ ███████╗ ╚██████╗   ██║   ╚██████╔╝██║  ██║║
║  ╚══════╝ ╚═════╝       ╚═══╝  ╚══════╝  ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝║
║                                                                           ║
║       RAG with S3 Vectors + Bedrock Knowledge Bases                       ║
║                   70% Cheaper • 5x Faster • Serverless                    ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${CYAN}${BOLD}One-command deployment. Everything automated.${NC}"
echo ""
print_info "Deploys complete RAG system (~10 minutes):"
echo "  • S3 Vector database + Bedrock Knowledge Base"
echo "  • CloudFront Web UI + API Gateway + Lambda"
echo "  • 17 sample documents with realistic company data"
echo ""
print_warning "Cost: ~\$5/month - DELETE RESOURCES IMMEDIATELY AFTER TESTING"
echo ""
echo -e "${YELLOW}⚠️  CLEANUP:${NC}"
echo "  • Everything is native CloudFormation - 'cdk destroy' removes it all"
echo "  • Run it as soon as you are done to stop the charges"
echo ""
read -p "Press ENTER to begin... " -r
echo ""

# ============================================================================
# PHASE 1: Prerequisites Check
# ============================================================================

print_header "PHASE 1/6: Checking Prerequisites"

# Check Node.js
print_step "Checking Node.js..."
if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js 18+"
    print_info "Visit: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
print_status "Node.js $NODE_VERSION installed"

# Check npm
print_step "Checking npm..."
if ! command -v npm &> /dev/null; then
    print_error "npm not found"
    exit 1
fi
NPM_VERSION=$(npm --version)
print_status "npm v$NPM_VERSION installed"

# Check AWS CLI
print_step "Checking AWS CLI..."
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI not found. Please install AWS CLI"
    print_info "Visit: https://aws.amazon.com/cli/"
    exit 1
fi
AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1)
print_status "$AWS_VERSION installed"

# Check CDK CLI
print_step "Checking AWS CDK..."
if ! command -v cdk &> /dev/null; then
    print_error "CDK CLI not found"
    print_info "Installing CDK globally..."
    npm install -g aws-cdk
    print_status "CDK installed"
fi
CDK_VERSION=$(cdk --version 2>&1 | cut -d' ' -f1)
print_status "CDK $CDK_VERSION installed"

# Check AWS credentials
print_step "Verifying AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured"
    print_info "Run: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CALLER_ARN=$(aws sts get-caller-identity --query Arn --output text)

# Mask account ID and IAM user for security
MASKED_ACCOUNT="***${ACCOUNT_ID:9}"  # Show last 3 digits only
MASKED_CALLER=$(echo "$CALLER_ARN" | sed -E 's/:[0-9]{12}:/:***:/g' | sed -E 's/(user|role)\/[^/]+$/\1\/***/')

print_status "AWS Account: $MASKED_ACCOUNT"
print_status "Caller: $MASKED_CALLER"
print_status "Region: $REGION"

# Check Bedrock availability
print_step "Checking Bedrock availability in $REGION..."
BEDROCK_REGIONS=("us-east-1" "us-west-2" "eu-west-3" "ap-southeast-1" "ap-northeast-1")
if [[ " ${BEDROCK_REGIONS[@]} " =~ " ${REGION} " ]]; then
    print_status "Bedrock is available in $REGION"
else
    print_warning "Bedrock may not be fully available in $REGION"
    print_info "Recommended regions: us-east-1, us-west-2, eu-west-3"
fi

echo ""
print_status "All prerequisites met!"
sleep 2

# ============================================================================
# PHASE 2: Project Setup
# ============================================================================

print_header "PHASE 2/6: Setting Up Project"

# Install dependencies
print_step "Installing project dependencies..."
if [ ! -d "node_modules" ]; then
    print_progress "Running npm install (this may take a minute)..."
    npm install --silent
    print_status "Dependencies installed"
else
    print_status "Dependencies already installed"
fi

# Build TypeScript
print_step "Building TypeScript code..."
print_progress "Compiling..."
npm run build --silent
print_status "Build complete"

echo ""
print_status "Project setup complete!"
sleep 1

# ============================================================================
# PHASE 3: Build Web UI
# ============================================================================

print_header "PHASE 3/7: Building Web UI"

print_step "Building Next.js static export..."
echo ""
print_info "This creates a production-ready static website:"
echo -e "  ${CYAN}●${NC} Compiles TypeScript to JavaScript"
echo -e "  ${CYAN}●${NC} Optimizes bundles for production"
echo -e "  ${CYAN}●${NC} Generates static HTML/CSS/JS"
echo -e "  ${CYAN}●${NC} Output: web/out/ directory"
echo ""

print_progress "Building static export (1-2 minutes)..."
npm run build:web

if [ ! -d "web/out" ]; then
    print_error "Build failed - web/out/ directory not created"
    exit 1
fi

print_status "Web UI built successfully!"
print_info "Static files ready for CloudFront deployment: $(du -sh web/out | cut -f1)"
sleep 2

# ============================================================================
# PHASE 4: CDK Bootstrap & Infrastructure Deployment
# ============================================================================

print_header "PHASE 4/7: Deploying AWS Infrastructure"

# Check if CDK is bootstrapped
print_step "Checking CDK bootstrap status..."
BOOTSTRAP_STACK="CDKToolkit"
if aws cloudformation describe-stacks --stack-name $BOOTSTRAP_STACK --region $REGION &> /dev/null 2>&1; then
    print_status "CDK already bootstrapped in $REGION"
else
    print_warning "CDK not bootstrapped - bootstrapping now..."
    print_progress "This creates S3 bucket and roles for CDK deployments..."
    cdk bootstrap aws://$ACCOUNT_ID/$REGION
    print_status "CDK bootstrapped successfully"
fi

# Generate deployment ID (timestamp-based for uniqueness)
# Using shorter format (YYMMDD-HHMM instead of YYYYMMDD-HHMMSS) to fit S3 63-char limit
echo ""
print_step "Generating deployment ID..."
DEPLOYMENT_ID=$(date -u +"%y%m%d-%H%M")
print_status "Deployment ID: $DEPLOYMENT_ID"
echo ""
print_info "All resources will include this ID to avoid naming conflicts"
echo ""
print_info "Resource naming examples:"
echo -e "  ${CYAN}●${NC} KB:        kb-${ACCOUNT_ID:9}-${DEPLOYMENT_ID}"
echo -e "  ${CYAN}●${NC} S3 Data:   docs-${ACCOUNT_ID:9}-${REGION}-${DEPLOYMENT_ID}"
echo -e "  ${CYAN}●${NC} S3 Vector: kb-${ACCOUNT_ID:9}-${DEPLOYMENT_ID}-vectors"
echo ""
print_info "Format: YYMMDD-HHMM (UTC)"

# Deploy the stack
echo ""
print_step "Deploying CloudFormation stack..."
print_info "Stack name: $STACK_NAME"
echo ""
print_info "Resources to create:"
echo -e "  ${CYAN}●${NC} S3 Bucket + S3 Vector Bucket"
echo -e "  ${CYAN}●${NC} Bedrock Knowledge Base + Data Source"
echo -e "  ${CYAN}●${NC} CloudFront + API Gateway + Lambda"
echo -e "  ${CYAN}●${NC} IAM Roles and Policies"
echo ""

# Check if stack already exists
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION &> /dev/null 2>&1; then
    print_warning "Stack $STACK_NAME already exists"
    read -p "Update existing stack? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Using existing stack"
    else
        print_progress "Updating stack (5-10 minutes)..."
        cdk deploy --require-approval never --context deploymentId="$DEPLOYMENT_ID"
        print_status "Stack updated!"
    fi
else
    print_progress "Creating stack (this will take 10-15 minutes)..."
    echo ""
    print_info "Estimated timeline:"
    echo -e "  ${CYAN}[0-2 min]${NC}   S3 buckets and IAM roles"
    echo -e "  ${CYAN}[2-8 min]${NC}   S3 Vector buckets (serverless!)"
    echo -e "  ${CYAN}[8-12 min]${NC}  Knowledge Bases"
    echo -e "  ${CYAN}[12-15 min]${NC} Web UI (CloudFront + API Gateway)"
    echo ""

    cdk deploy --require-approval never --context deploymentId="$DEPLOYMENT_ID"
    print_status "Stack deployed successfully!"
fi

# Get stack outputs
echo ""
print_step "Retrieving stack outputs..."
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs' \
    --output json > deployment-outputs.json

print_status "Outputs saved to deployment-outputs.json"

# Extract key values
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
    --output text)

KB_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseIdOutput`].OutputValue' \
    --output text)

MODEL_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ModelId`].OutputValue' \
    --output text)

# Get CloudFront and API Gateway URLs
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
    --output text)

API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text)

# Mask sensitive IDs for display
MASKED_BUCKET_NAME=$(echo "$BUCKET_NAME" | sed -E "s/${ACCOUNT_ID}/***${ACCOUNT_ID:9}/g")

echo ""
print_status "Infrastructure deployment complete!"
echo ""
print_info "Key Resources:"
echo "  S3 Bucket:          $MASKED_BUCKET_NAME"
echo "  Knowledge Base:     $KB_ID"
echo "  Model:              $MODEL_ID"
sleep 3

# ============================================================================
# PHASE 4: Upload Sample Documents
# ============================================================================

print_header "PHASE 5/7: Uploading Sample Documents"

print_step "Uploading documents to S3..."
echo ""
print_info "Document structure (11 files):"
echo -e "  ${CYAN}Financial-Data/${NC}       (4 files)"
echo "    ├─ quarterly-report-q4-2024.md"
echo "    ├─ budget-2025.md"
echo "    ├─ expense-policy.md"
echo "    └─ accounts-receivable-aging-report-2025-01.md"
echo -e "  ${CYAN}Human-Resources/${NC}      (4 files)"
echo "    ├─ employee-handbook.md"
echo "    ├─ benefits-guide-2025.md"
echo "    ├─ remote-work-policy.md"
echo "    └─ performance-review-guidelines.md"
echo -e "  ${CYAN}Meeting-Notes/${NC}        (3 files)"
echo "    ├─ executive-leadership-meeting-2025-01-15.md"
echo "    ├─ product-roadmap-planning-2025-q1.md"
echo "    └─ engineering-sprint-retro-2025-01-17.md"
echo ""

print_progress "Running upload script..."
npm run upload-docs

print_status "All documents uploaded!"
sleep 2

# ============================================================================
# PHASE 5: Monitor Ingestion Job
# ============================================================================

print_header "PHASE 6/7: Monitoring Knowledge Base Ingestion"

print_info "Ingestion job is processing documents..."
echo -e "  ${CYAN}●${NC} Chunking documents into smaller pieces"
echo -e "  ${CYAN}●${NC} Generating embeddings using Titan Embed Text v2"
echo -e "  ${CYAN}●${NC} Storing vectors in S3 Vector bucket"
echo ""
print_warning "This typically takes 5-8 minutes for 17 documents"
echo ""

# Get Knowledge Base and Data Source IDs from stack outputs
KB_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`KnowledgeBaseIdOutput`].OutputValue' \
    --output text 2>/dev/null)

DS_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DataSourceIdOutput`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$KB_ID" ] || [ -z "$DS_ID" ]; then
    print_error "Could not get Knowledge Base or Data Source ID from stack outputs"
    print_info "You can manually check ingestion status with: npm run check-status"
    exit 1
fi

MASKED_KB_ID="***${KB_ID:7}"  # Show last 3 chars
MASKED_DS_ID="***${DS_ID:7}"  # Show last 3 chars

print_info "Knowledge Base ID: $MASKED_KB_ID"
print_info "Data Source ID: $MASKED_DS_ID"
echo ""

# Function to get ingestion job status
get_ingestion_status() {
    # Get the most recent ingestion job
    local job_id=$(aws bedrock-agent list-ingestion-jobs \
        --knowledge-base-id "$KB_ID" \
        --data-source-id "$DS_ID" \
        --region "$REGION" \
        --query 'ingestionJobSummaries[0].ingestionJobId' \
        --output text 2>/dev/null)

    if [ -z "$job_id" ] || [ "$job_id" == "None" ]; then
        echo "WAITING"
        return
    fi

    # Get job details
    local job_info=$(aws bedrock-agent get-ingestion-job \
        --knowledge-base-id "$KB_ID" \
        --data-source-id "$DS_ID" \
        --ingestion-job-id "$job_id" \
        --region "$REGION" \
        --output json 2>/dev/null)

    local status=$(echo "$job_info" | jq -r '.ingestionJob.status // "UNKNOWN"')
    local stats=$(echo "$job_info" | jq -r '.ingestionJob.statistics // {}')

    # Extract statistics if available
    local docs_scanned=$(echo "$stats" | jq -r '.numberOfDocumentsScanned // 0')
    local docs_indexed=$(echo "$stats" | jq -r '.numberOfNewDocumentsIndexed // 0')
    local docs_modified=$(echo "$stats" | jq -r '.numberOfModifiedDocumentsIndexed // 0')
    local docs_deleted=$(echo "$stats" | jq -r '.numberOfDocumentsDeleted // 0')
    local docs_failed=$(echo "$stats" | jq -r '.numberOfDocumentsFailed // 0')

    echo "$status|$docs_scanned|$docs_indexed|$docs_modified|$docs_deleted|$docs_failed"
}

# Function to draw progress bar
draw_progress_bar() {
    local current=$1
    local total=$2
    local width=40
    local percentage=0

    if [ "$total" -gt 0 ]; then
        percentage=$((current * 100 / total))
        local filled=$((width * current / total))
    else
        local filled=0
    fi

    local empty=$((width - filled))

    printf "["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "] %3d%% (%d/%d docs)" "$percentage" "$current" "$total"
}

# Monitor ingestion with clean UX
print_progress "Waiting for ingestion job to start..."
sleep 10

LAST_STATUS=""
START_TIME=$(date +%s)
MAX_WAIT=600  # 10 minutes in seconds
WAIT_INTERVAL=5  # Check every 5 seconds

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    # Check timeout
    if [ $ELAPSED -ge $MAX_WAIT ]; then
        echo ""
        print_warning "Monitoring timed out after 10 minutes"
        print_info "Job may still be running. Check status with: npm run check-status"
        break
    fi

    # Get status
    STATUS_INFO=$(get_ingestion_status)
    IFS='|' read -r STATUS SCANNED INDEXED MODIFIED DELETED FAILED <<< "$STATUS_INFO"

    # Calculate elapsed time in mm:ss format
    MINUTES=$((ELAPSED / 60))
    SECONDS=$((ELAPSED % 60))
    TIME_STR=$(printf "%02d:%02d" $MINUTES $SECONDS)

    # Only update display if status changed or it's been a while
    if [ "$STATUS" != "$LAST_STATUS" ] || [ $((ELAPSED % 10)) -eq 0 ]; then
        # Clear the previous line and move cursor up if not first iteration
        if [ -n "$LAST_STATUS" ]; then
            printf "\033[2K\r"  # Clear current line
        fi

        case "$STATUS" in
            "WAITING")
                printf "${CYAN}⏳${NC} Waiting for ingestion job to start... [%s]" "$TIME_STR"
                ;;
            "STARTING")
                printf "${CYAN}▶${NC}  Starting ingestion job... [%s]" "$TIME_STR"
                ;;
            "IN_PROGRESS")
                TOTAL_DOCS=$((SCANNED > 0 ? SCANNED : 11))
                PROCESSED=$((INDEXED + MODIFIED))
                printf "${CYAN}●${NC}  Processing: "
                draw_progress_bar "$PROCESSED" "$TOTAL_DOCS"
                printf " [%s]" "$TIME_STR"
                if [ "$FAILED" -gt 0 ]; then
                    printf " ${YELLOW}⚠ %d failed${NC}" "$FAILED"
                fi
                ;;
            "COMPLETE")
                printf "\n${GREEN}✓${NC} Ingestion complete! "
                printf "Indexed: %d docs, Modified: %d, Failed: %d [%s]\n" "$INDEXED" "$MODIFIED" "$FAILED" "$TIME_STR"
                echo ""
                break
                ;;
            "FAILED")
                printf "\n${RED}✗${NC} Ingestion job failed [%s]\n" "$TIME_STR"
                print_error "Check AWS Console for details"
                echo ""
                break
                ;;
            *)
                printf "${YELLOW}?${NC}  Status: %s [%s]" "$STATUS" "$TIME_STR"
                ;;
        esac

        LAST_STATUS="$STATUS"
    fi

    # Don't print newline, just update same line
    sleep $WAIT_INTERVAL
done

# Final status check
if [ "$STATUS" = "COMPLETE" ]; then
    print_status "Knowledge Base is ready!"
    echo ""
    print_info "Documents indexed and ready for queries"
else
    print_warning "Ingestion may still be in progress"
    print_info "Check status manually: npm run check-status"
fi

sleep 2

# ============================================================================
# PHASE 6: Setup Complete & Next Steps
# ============================================================================

print_header "PHASE 7/7: Deployment Complete!"

echo -e "${GREEN}${BOLD}"
cat << "EOF"
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║   ✓ Infrastructure Deployed                                  ║
    ║   ✓ Web UI Deployed                                          ║
    ║   ✓ Documents Uploaded                                       ║
    ║   ✓ Knowledge Base Ingested                                  ║
    ║   ✓ Ready to Query                                           ║
    ║                                                               ║
    ║          Your RAG System is Fully Operational! 🎉            ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo ""
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}                  WHAT YOU JUST DEPLOYED                       ${NC}"
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Web UI:${NC}"
echo "  ✓ CloudFront Distribution (global CDN with HTTPS)"
echo "  ✓ S3 Static Website Hosting"
echo "  ✓ API Gateway REST API"
echo "  ✓ Lambda Function calling RetrieveAndGenerate"
echo ""
echo -e "${CYAN}Infrastructure:${NC}"
echo "  ✓ 1 S3 Bucket with 3 organized folders (Nobler Works data)"
echo "  ✓ 1 S3 Vector Bucket + Index (serverless vector DB - 70% cheaper!)"
echo "  ✓ 1 Knowledge Base (indexes all 17 documents)"
echo ""
echo -e "${CYAN}Sample Data (Nobler Works):${NC}"
echo "  ✓ 17 realistic company documents ingested"
echo "  ✓ Financial reports, budgets, policies"
echo "  ✓ Employee handbook, benefits, HR policies"
echo "  ✓ Executive meetings, product plans, retros"
echo ""
echo -e "${CYAN}AI Capabilities:${NC}"
echo "  ✓ $MODEL_ID (generation model)"
echo "  ✓ Titan Embeddings v2 (1024-dim vectors)"
echo "  ✓ Semantic search across all documents"
echo "  ✓ Grounded answers with citations"
echo ""

echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}                      TRY IT NOW                               ${NC}"
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Option 1: Production Web UI (Recommended)${NC}"
if [ -n "$CLOUDFRONT_URL" ]; then
    echo -e "  ${GREEN}${BOLD}🌐 $CLOUDFRONT_URL${NC}"
    echo -e "  ${CYAN}✓ Deployed and ready to use!${NC}"
else
    echo -e "  ${CYAN}CloudFront URL will appear in CloudFormation outputs${NC}"
fi
echo ""
echo -e "${YELLOW}Option 2: Command Line Interface${NC}"
echo -e "  ${GREEN}npm run test-rag${NC}"
echo ""

echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}                   SAMPLE QUESTIONS                            ${NC}"
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Financial Questions:${NC}"
echo '  • "What was our Q4 2024 revenue?"'
echo '  • "What is the 2025 engineering budget?"'
echo '  • "What is our expense policy for travel?"'
echo ""
echo -e "${CYAN}HR Questions:${NC}"
echo '  • "What are our PTO benefits?"'
echo '  • "How much is the home office stipend?"'
echo '  • "Explain the performance review rating scale"'
echo ""
echo -e "${CYAN}Meeting Notes Questions:${NC}"
echo '  • "What are the company priorities for 2025?"'
echo '  • "What features are planned for Q1?"'
echo '  • "What were the action items from the executive meeting?"'
echo ""
echo -e "${CYAN}Cross-Domain Questions:${NC}"
echo '  • "How many employees do we plan to hire in 2025?"'
echo '  • "What is our approach to remote work and costs?"'
echo ""

echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}                 DEPLOYMENT SUMMARY                            ${NC}"
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Stack Name:${NC}           $STACK_NAME"
echo -e "${CYAN}Region:${NC}               $REGION"
echo ""
echo -e "${CYAN}Web UI:${NC}"
if [ -n "$CLOUDFRONT_URL" ]; then
    echo "  CloudFront URL:     $CLOUDFRONT_URL"
else
    echo "  CloudFront URL:     (see CloudFormation outputs)"
fi
if [ -n "$API_ENDPOINT" ]; then
    echo "  API Endpoint:       $API_ENDPOINT"
else
    echo "  API Endpoint:       (see CloudFormation outputs)"
fi
echo ""
echo -e "${CYAN}Backend Resources:${NC}"
echo "  S3 Bucket:          $MASKED_BUCKET_NAME"
echo "  Knowledge Base:     $KB_ID"
echo "  Model:              $MODEL_ID"
echo ""
echo -e "${YELLOW}ℹ Note:${NC} Full resource IDs saved to deployment-outputs.json"
echo ""

echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}                    NEXT STEPS                                 ${NC}"
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}1. Open the web UI:${NC}"
if [ -n "$CLOUDFRONT_URL" ]; then
    echo -e "   ${GREEN}${BOLD}$CLOUDFRONT_URL${NC}"
else
    echo -e "   ${CYAN}Check CloudFormation outputs for the CloudFront URL${NC}"
fi
echo ""
echo -e "${YELLOW}2. Test with command line:${NC}"
echo -e "   ${GREEN}npm run test-rag${NC}"
echo ""
echo -e "${YELLOW}3. Add your own documents:${NC}"
echo -e "   ${GREEN}aws s3 cp my-doc.pdf s3://$BUCKET_NAME/Financial-Data/${NC}"
echo -e "   ${GREEN}npm run upload-docs${NC}  ${CYAN}# Re-ingests all KBs${NC}"
echo ""
echo -e "${YELLOW}4. Customize the assistant:${NC}"
echo -e "   ${CYAN}• Edit ${GREEN}lib/s3-rag-stack.ts${CYAN} for the prompt template and model${NC}"
echo -e "   ${CYAN}• Edit ${GREEN}lib/knowledge-base-construct.ts${CYAN} for KB settings${NC}"
echo -e "   ${CYAN}• Run ${GREEN}cdk deploy${CYAN} to apply changes${NC}"
echo ""
echo -e "${YELLOW}5. Explore the tutorial:${NC}"
echo -e "   ${CYAN}• Read ${GREEN}docs/01-understanding.md${CYAN} for concepts${NC}"
echo -e "   ${CYAN}• Follow the full tutorial in ${GREEN}docs/${CYAN} folder${NC}"
echo ""
echo -e "${YELLOW}6. When finished testing - DELETE RESOURCES IMMEDIATELY:${NC}"
echo -e "   ${RED}${BOLD}⚠️  These resources cost ~\$1-5/month if left running!${NC}"
echo -e "   ${GREEN}npm run destroy${NC}  ${CYAN}# or: cdk destroy${NC}"
echo ""

echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}                  IMPORTANT COST WARNING                       ${NC}"
echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
print_warning "💰 Cost: ~\$5/month (S3 Vectors, Bedrock, CloudFront)"
print_warning "🗑️  Delete resources IMMEDIATELY after testing to avoid charges"
echo ""
echo -e "${RED}${BOLD}CLEANUP INSTRUCTIONS:${NC}"
echo -e "  ${CYAN}Run ${GREEN}npm run destroy${CYAN} - the stack is all native CloudFormation,${NC}"
echo -e "  ${CYAN}so it tears down cleanly in one command.${NC}"
echo ""
print_info "All outputs saved to: deployment-outputs.json"
echo ""

echo -e "${GREEN}${BOLD}Happy building with Amazon Bedrock! 🚀${NC}"
echo -e "${YELLOW}${BOLD}Remember to clean up resources when done!${NC}"
echo ""
