#!/bin/bash
# Deploy Cloud Functions for Wedding Smile Catcher
# Usage: ./scripts/deploy-functions.sh [webhook|scoring|all]

set -e

PROJECT_ID="wedding-smile-catcher"
REGION="asia-northeast1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

function print_error() {
    echo -e "${RED}✗ $1${NC}"
}

function print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

function deploy_webhook() {
    print_info "Deploying Webhook Function..."

    # Get scoring URL if scoring function exists
    SCORING_URL=$(gcloud functions describe scoring \
        --gen2 \
        --region=$REGION \
        --format="value(serviceConfig.uri)" 2>/dev/null || echo "")

    local ENV_VARS="GCP_PROJECT_ID=${PROJECT_ID},STORAGE_BUCKET=wedding-smile-images-wedding-smile-catcher"
    if [ -n "$SCORING_URL" ]; then
        ENV_VARS="${ENV_VARS},SCORING_FUNCTION_URL=${SCORING_URL}"
        print_info "Scoring URL: $SCORING_URL"
    else
        print_info "Scoring function not found, skipping SCORING_FUNCTION_URL"
    fi

    cd src/functions/webhook

    gcloud functions deploy webhook \
        --gen2 \
        --runtime=python311 \
        --region=$REGION \
        --source=. \
        --entry-point=webhook \
        --trigger-http \
        --allow-unauthenticated \
        --service-account=webhook-function-sa@${PROJECT_ID}.iam.gserviceaccount.com \
        --set-secrets="LINE_CHANNEL_SECRET=line-channel-secret:latest,LINE_CHANNEL_ACCESS_TOKEN=line-channel-access-token:latest" \
        --set-env-vars="${ENV_VARS}" \
        --timeout=60s \
        --memory=512MB

    cd ../../..

    # Get webhook URL
    WEBHOOK_URL=$(gcloud functions describe webhook \
        --gen2 \
        --region=$REGION \
        --format="value(serviceConfig.uri)")

    print_success "Webhook Function deployed!"
    print_info "Webhook URL: $WEBHOOK_URL"
    print_info "Configure this URL in LINE Developers Console"
}

function deploy_scoring() {
    print_info "Deploying Scoring Function..."

    cd src/functions/scoring

    gcloud functions deploy scoring \
        --gen2 \
        --runtime=python311 \
        --region=$REGION \
        --source=. \
        --entry-point=scoring \
        --trigger-http \
        --no-allow-unauthenticated \
        --service-account=scoring-function-sa@${PROJECT_ID}.iam.gserviceaccount.com \
        --set-secrets="LINE_CHANNEL_ACCESS_TOKEN=line-channel-access-token:latest" \
        --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID}" \
        --timeout=300s \
        --memory=1GB

    cd ../../..

    # Get scoring URL
    SCORING_URL=$(gcloud functions describe scoring \
        --gen2 \
        --region=$REGION \
        --format="value(serviceConfig.uri)")

    print_success "Scoring Function deployed!"
    print_info "Scoring URL: $SCORING_URL"
    print_info "Update SCORING_FUNCTION_URL in webhook function"
}

function update_webhook_scoring_url() {
    print_info "Updating webhook function with scoring URL..."

    SCORING_URL=$(gcloud functions describe scoring \
        --gen2 \
        --region=$REGION \
        --format="value(serviceConfig.uri)")

    cd src/functions/webhook

    gcloud functions deploy webhook \
        --gen2 \
        --runtime=python311 \
        --region=$REGION \
        --source=. \
        --entry-point=webhook \
        --trigger-http \
        --allow-unauthenticated \
        --service-account=webhook-function-sa@${PROJECT_ID}.iam.gserviceaccount.com \
        --set-secrets="LINE_CHANNEL_SECRET=line-channel-secret:latest,LINE_CHANNEL_ACCESS_TOKEN=line-channel-access-token:latest" \
        --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},STORAGE_BUCKET=wedding-smile-images-wedding-smile-catcher,SCORING_FUNCTION_URL=${SCORING_URL}" \
        --timeout=60s \
        --memory=512MB

    cd ../../..

    print_success "Webhook function updated with scoring URL!"
}

# Check gcloud authentication
print_info "Checking gcloud authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    print_error "Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
fi

# Set project
gcloud config set project $PROJECT_ID

# Main script logic
FUNCTION=${1:-all}

case $FUNCTION in
    webhook)
        deploy_webhook
        ;;
    scoring)
        deploy_scoring
        ;;
    all)
        print_info "Deploying all functions..."
        deploy_scoring
        deploy_webhook
        echo ""
        print_info "Both functions deployed. Updating webhook with scoring URL..."
        update_webhook_scoring_url
        echo ""
        print_success "All functions deployed successfully!"
        echo ""
        print_info "Next steps:"
        echo "1. Configure LINE Bot webhook URL in LINE Developers Console"
        echo "2. Test by sending a message to your LINE Bot"
        ;;
    *)
        print_error "Invalid argument: $FUNCTION"
        echo "Usage: $0 [webhook|scoring|all]"
        exit 1
        ;;
esac
