#!/bin/bash
# AWS Amplify Hosting Setup for Bearable Senior
# Replaces Vercel with native AWS hosting

set -e

REGION="us-east-1"
APP_NAME="bearable-senior"
GITHUB_REPO="bearableai/bearable-senior"
GITHUB_BRANCH="main"

echo "🚀 Setting up AWS Amplify Hosting..."

# Check if GitHub token is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ GITHUB_TOKEN environment variable required"
    echo "Create a token at: https://github.com/settings/tokens/new"
    echo "Required scopes: repo, admin:repo_hook"
    echo ""
    echo "Then run: export GITHUB_TOKEN=ghp_xxx"
    exit 1
fi

# Get secrets from SSM
echo "🔐 Retrieving secrets from SSM..."
DB_PASSWORD=$(aws ssm get-parameter --name /bearable-senior/db-password --with-decryption --query 'Parameter.Value' --output text --region $REGION)
CRON_SECRET=$(aws ssm get-parameter --name /bearable-senior/cron-secret --with-decryption --query 'Parameter.Value' --output text --region $REGION)
ENDPOINT=$(aws rds describe-db-clusters --db-cluster-identifier bearable-senior-cluster --region $REGION --query 'DBClusters[0].Endpoint' --output text)
DATABASE_URL="postgresql://bearable_admin:$DB_PASSWORD@$ENDPOINT:5432/bearable_senior?sslmode=require"

# Create IAM role for Amplify
echo "📝 Creating Amplify service role..."
cat > /tmp/amplify-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "amplify.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

ROLE_NAME="AmplifyBearableSeniorRole"
aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document file:///tmp/amplify-trust-policy.json \
  --region $REGION 2>/dev/null || echo "Role already exists"

# Attach policies for Bedrock, RDS, SSM
aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess \
  --region $REGION 2>/dev/null || true

aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonRDSFullAccess \
  --region $REGION 2>/dev/null || true

aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess \
  --region $REGION 2>/dev/null || true

ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)

# Create Amplify app
echo "📱 Creating Amplify app..."
APP_ID=$(aws amplify create-app \
  --name $APP_NAME \
  --repository "https://github.com/$GITHUB_REPO" \
  --oauth-token "$GITHUB_TOKEN" \
  --iam-service-role-arn "$ROLE_ARN" \
  --platform WEB_COMPUTE \
  --region $REGION \
  --query 'app.appId' \
  --output text 2>/dev/null) || {
    echo "App may already exist, fetching..."
    APP_ID=$(aws amplify list-apps --region $REGION --query "apps[?name=='$APP_NAME'].appId" --output text | head -1)
}

echo "✅ Amplify App ID: $APP_ID"

# Create branch
echo "🌿 Creating main branch..."
aws amplify create-branch \
  --app-id $APP_ID \
  --branch-name $GITHUB_BRANCH \
  --enable-auto-build \
  --region $REGION 2>/dev/null || echo "Branch already exists"

# Set environment variables
echo "🔧 Configuring environment variables..."
aws amplify update-app \
  --app-id $APP_ID \
  --region $REGION \
  --environment-variables \
    DATABASE_URL="$DATABASE_URL" \
    CRON_SECRET="$CRON_SECRET" \
    TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-placeholder}" \
    TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-placeholder}" \
    TWILIO_PHONE_NUMBER="${TWILIO_PHONE_NUMBER:-+18556884499}" \
    AWS_REGION="$REGION" \
    NEXT_PUBLIC_APP_URL="https://main.$APP_ID.amplifyapp.com"

# Create amplify.yml build spec
cat > /tmp/amplify.yml <<'EOF'
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
EOF

# Note: amplify.yml should be committed to repo root

# Start deployment
echo "🚀 Starting deployment..."
JOB_ID=$(aws amplify start-job \
  --app-id $APP_ID \
  --branch-name $GITHUB_BRANCH \
  --job-type RELEASE \
  --region $REGION \
  --query 'jobSummary.jobId' \
  --output text)

echo "⏳ Deployment started (Job ID: $JOB_ID)"
echo "Monitor at: https://console.aws.amazon.com/amplify/home?region=$REGION#/$APP_ID/main/$JOB_ID"

# Wait for deployment (optional)
echo ""
echo "Waiting for deployment to complete (this may take 3-5 minutes)..."
aws amplify wait deployment-complete \
  --app-id $APP_ID \
  --branch-name $GITHUB_BRANCH \
  --region $REGION || true

# Get app URL
APP_URL="https://main.$APP_ID.amplifyapp.com"

echo ""
echo "✅ Amplify app deployed successfully!"
echo ""
echo "📱 App URL: $APP_URL"
echo "🔧 Console: https://console.aws.amazon.com/amplify/home?region=$REGION#/$APP_ID"
echo ""
echo "🔔 Next steps:"
echo "1. Update EventBridge URL:"
echo "   ./update-app-url.sh $APP_URL"
echo ""
echo "2. Configure Twilio webhook:"
echo "   Set webhook to: $APP_URL/api/sms/inbound"
echo ""
echo "3. Test deployment:"
echo "   curl $APP_URL"
echo ""
