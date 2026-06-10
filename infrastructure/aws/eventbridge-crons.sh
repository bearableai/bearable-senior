#!/bin/bash
# AWS EventBridge Rules for Bearable Senior Crons
# Replaces Vercel crons with proper AWS scheduling

set -e

REGION="us-east-1"
APP_URL="https://bearable-senior.vercel.app"  # Update after deployment
CRON_SECRET=$(openssl rand -hex 32)

echo "⏰ Setting up EventBridge cron rules..."

# Create IAM role for EventBridge to invoke HTTP endpoints
ROLE_NAME="BearableSeniorEventBridgeRole"

echo "📝 Creating IAM role..."
cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "events.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document file:///tmp/trust-policy.json \
  --region $REGION 2>/dev/null || echo "Role already exists"

# Attach policy for HTTP invocation
aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name BearableSeniorEventBridgePolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "events:InvokeApiDestination"
        ],
        "Resource": "*"
      }
    ]
  }' \
  --region $REGION

ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)

echo "🎯 Creating API Destination for HTTP invocation..."

# Create connection for authentication
aws events create-connection \
  --name bearable-senior-connection \
  --authorization-type API_KEY \
  --auth-parameters '{
    "ApiKeyAuthParameters": {
      "ApiKeyName": "x-cron-secret",
      "ApiKeyValue": "'"$CRON_SECRET"'"
    }
  }' \
  --region $REGION 2>/dev/null || echo "Connection already exists"

CONNECTION_ARN=$(aws events describe-connection \
  --name bearable-senior-connection \
  --region $REGION \
  --query 'ConnectionArn' \
  --output text)

# Create API destination
aws events create-api-destination \
  --name bearable-senior-api \
  --connection-arn $CONNECTION_ARN \
  --invocation-endpoint "$APP_URL/api/cron" \
  --http-method POST \
  --invocation-rate-limit-per-second 10 \
  --region $REGION 2>/dev/null || echo "API destination already exists"

API_DESTINATION_ARN=$(aws events describe-api-destination \
  --name bearable-senior-api \
  --region $REGION \
  --query 'ApiDestinationArn' \
  --output text)

# Rule 1: Check missed medications (every 15 minutes)
echo "💊 Creating medication check rule..."
aws events put-rule \
  --name bearable-senior-medication-check \
  --schedule-expression "rate(15 minutes)" \
  --state ENABLED \
  --region $REGION

aws events put-targets \
  --rule bearable-senior-medication-check \
  --targets '[
    {
      "Id": "1",
      "Arn": "'"$API_DESTINATION_ARN"'",
      "RoleArn": "'"$ROLE_ARN"'",
      "HttpParameters": {
        "PathParameterValues": [],
        "HeaderParameters": {},
        "QueryStringParameters": {}
      },
      "Input": "{\"path\":\"/api/cron/check-missed-medications\"}"
    }
  ]' \
  --region $REGION

# Rule 2: Daily health summary (9am CT = 3pm UTC)
echo "📊 Creating daily summary rule..."
aws events put-rule \
  --name bearable-senior-daily-summary \
  --schedule-expression "cron(0 15 * * ? *)" \
  --state ENABLED \
  --region $REGION

aws events put-targets \
  --rule bearable-senior-daily-summary \
  --targets '[
    {
      "Id": "1",
      "Arn": "'"$API_DESTINATION_ARN"'",
      "RoleArn": "'"$ROLE_ARN"'",
      "HttpParameters": {
        "PathParameterValues": [],
        "HeaderParameters": {},
        "QueryStringParameters": {}
      },
      "Input": "{\"path\":\"/api/cron/daily-summary\"}"
    }
  ]' \
  --region $REGION

# Rule 3: Cleanup old sessions (daily at midnight)
echo "🧹 Creating cleanup rule..."
aws events put-rule \
  --name bearable-senior-cleanup \
  --schedule-expression "cron(0 6 * * ? *)" \
  --state ENABLED \
  --region $REGION

aws events put-targets \
  --rule bearable-senior-cleanup \
  --targets '[
    {
      "Id": "1",
      "Arn": "'"$API_DESTINATION_ARN"'",
      "RoleArn": "'"$ROLE_ARN"'",
      "HttpParameters": {
        "PathParameterValues": [],
        "HeaderParameters": {},
        "QueryStringParameters": {}
      },
      "Input": "{\"path\":\"/api/cron/cleanup\"}"
    }
  ]' \
  --region $REGION

echo ""
echo "✅ EventBridge crons configured successfully!"
echo ""
echo "📝 Add this to your Vercel environment variables:"
echo "CRON_SECRET=$CRON_SECRET"
echo ""
echo "⏰ Schedules:"
echo "  - Medication check: Every 15 minutes"
echo "  - Daily summary: 9am CT (3pm UTC)"
echo "  - Cleanup: Daily at midnight CT (6am UTC)"
echo ""
echo "🔑 Cron secret also stored in SSM Parameter Store"

# Store in SSM
aws ssm put-parameter \
  --name /bearable-senior/cron-secret \
  --value "$CRON_SECRET" \
  --type SecureString \
  --region $REGION \
  --overwrite 2>/dev/null || echo "Secret already in SSM"
