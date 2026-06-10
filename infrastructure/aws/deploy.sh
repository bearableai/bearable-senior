#!/bin/bash
# Complete AWS deployment script for Bearable Senior
# Runs all setup scripts in correct order

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGION="us-east-1"

echo "🚀 Bearable Senior - AWS Deployment"
echo "===================================="
echo ""

# Check AWS CLI is installed and configured
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Install it first:"
    echo "   brew install awscli"
    exit 1
fi

# Check credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Run:"
    echo "   aws configure"
    exit 1
fi

echo "✅ AWS CLI configured"
echo ""

# Step 1: Create RDS Aurora cluster
echo "Step 1/3: Setting up Aurora PostgreSQL..."
echo "=========================================="
chmod +x "$SCRIPT_DIR/rds-setup.sh"
"$SCRIPT_DIR/rds-setup.sh"
echo ""

# Wait for user to save DATABASE_URL
echo "⏸️  PAUSE: Save the DATABASE_URL from above, then press Enter to continue..."
read -r

# Step 2: Set up EventBridge crons
echo "Step 2/3: Setting up EventBridge crons..."
echo "=========================================="
chmod +x "$SCRIPT_DIR/eventbridge-crons.sh"
"$SCRIPT_DIR/eventbridge-crons.sh"
echo ""

# Step 3: Run database migrations
echo "Step 3/3: Running database migrations..."
echo "=========================================="

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL not set in environment"
    echo "Get it from SSM:"
    DB_PASSWORD=$(aws ssm get-parameter --name /bearable-senior/db-password --with-decryption --query 'Parameter.Value' --output text --region $REGION)
    ENDPOINT=$(aws rds describe-db-clusters --db-cluster-identifier bearable-senior-cluster --region $REGION --query 'DBClusters[0].Endpoint' --output text)
    export DATABASE_URL="postgresql://bearable_admin:$DB_PASSWORD@$ENDPOINT:5432/bearable_senior?sslmode=require"
    echo "📡 DATABASE_URL loaded from AWS"
fi

# Run migrations
cd "$SCRIPT_DIR/../.."
npm run db:generate || echo "Schema already generated"
npm run db:push

echo ""
echo "✅ Database migrations complete!"
echo ""

# Output summary
echo "🎉 AWS Infrastructure Deployed!"
echo "================================"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Deploy to Vercel:"
echo "   - Go to vercel.com/new"
echo "   - Import bearableai/bearable-senior"
echo "   - Add environment variables (see below)"
echo ""
echo "2. Required Vercel Environment Variables:"
echo "   DATABASE_URL=<from Step 1 output>"
echo "   CRON_SECRET=<from Step 2 output>"
echo "   TWILIO_ACCOUNT_SID=<your value>"
echo "   TWILIO_AUTH_TOKEN=<your value>"
echo "   TWILIO_PHONE_NUMBER=+18556884499"
echo "   AWS_REGION=$REGION"
echo "   AWS_ACCESS_KEY_ID=<your value>"
echo "   AWS_SECRET_ACCESS_KEY=<your value>"
echo ""
echo "3. Update EventBridge app URL:"
echo "   After Vercel deployment, run:"
echo "   ./infrastructure/aws/update-app-url.sh https://bearable-senior.vercel.app"
echo ""
echo "4. Configure Twilio webhook:"
echo "   Set webhook to: https://bearable-senior.vercel.app/api/sms/inbound"
echo ""
echo "🔐 All secrets stored in AWS SSM Parameter Store:"
echo "   /bearable-senior/db-password"
echo "   /bearable-senior/cron-secret"
echo ""
