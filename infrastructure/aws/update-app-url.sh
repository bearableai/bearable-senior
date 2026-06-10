#!/bin/bash
# Update EventBridge API destination with deployed app URL

set -e

if [ -z "$1" ]; then
    echo "Usage: ./update-app-url.sh <app-url>"
    echo "Example: ./update-app-url.sh https://bearable-senior.vercel.app"
    exit 1
fi

APP_URL="$1"
REGION="us-east-1"

echo "🔄 Updating EventBridge API destination..."

CONNECTION_ARN=$(aws events describe-connection \
  --name bearable-senior-connection \
  --region $REGION \
  --query 'ConnectionArn' \
  --output text)

# Update API destination with new URL
aws events update-api-destination \
  --name bearable-senior-api \
  --connection-arn $CONNECTION_ARN \
  --invocation-endpoint "$APP_URL/api/cron" \
  --http-method POST \
  --invocation-rate-limit-per-second 10 \
  --region $REGION

echo "✅ API destination updated to: $APP_URL/api/cron"
