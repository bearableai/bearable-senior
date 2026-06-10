#!/bin/bash
# AWS RDS Aurora PostgreSQL Setup for Bearable Senior
# HIPAA-eligible, encrypted at rest, automated backups

set -e

# Configuration
DB_CLUSTER_ID="bearable-senior-cluster"
DB_INSTANCE_ID="bearable-senior-instance"
DB_NAME="bearable_senior"
DB_USERNAME="bearable_admin"
REGION="us-east-1"

echo "🔒 Creating HIPAA-eligible Aurora PostgreSQL cluster..."

# Generate secure password
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

# Create DB subnet group (assumes default VPC)
echo "📡 Creating DB subnet group..."
aws rds create-db-subnet-group \
  --db-subnet-group-name bearable-senior-subnet-group \
  --db-subnet-group-description "Bearable Senior RDS subnet group" \
  --subnet-ids $(aws ec2 describe-subnets --region $REGION --query 'Subnets[*].SubnetId' --output text | tr '\t' ' ') \
  --region $REGION || echo "Subnet group may already exist"

# Create security group
echo "🔐 Creating security group..."
VPC_ID=$(aws ec2 describe-vpcs --region $REGION --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text)
SG_ID=$(aws ec2 create-security-group \
  --group-name bearable-senior-rds-sg \
  --description "Bearable Senior RDS security group" \
  --vpc-id $VPC_ID \
  --region $REGION \
  --query 'GroupId' \
  --output text 2>/dev/null || aws ec2 describe-security-groups --region $REGION --filters "Name=group-name,Values=bearable-senior-rds-sg" --query 'SecurityGroups[0].GroupId' --output text)

# Allow inbound PostgreSQL from anywhere (lock down in production)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --cidr 0.0.0.0/0 \
  --region $REGION 2>/dev/null || echo "Security group rule may already exist"

# Create Aurora Serverless v2 cluster (HIPAA-eligible)
echo "🚀 Creating Aurora Serverless v2 cluster..."
aws rds create-db-cluster \
  --db-cluster-identifier $DB_CLUSTER_ID \
  --engine aurora-postgresql \
  --engine-version 15.4 \
  --master-username $DB_USERNAME \
  --master-user-password "$DB_PASSWORD" \
  --database-name $DB_NAME \
  --db-subnet-group-name bearable-senior-subnet-group \
  --vpc-security-group-ids $SG_ID \
  --storage-encrypted \
  --backup-retention-period 7 \
  --enable-cloudwatch-logs-exports '["postgresql"]' \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1 \
  --region $REGION

echo "⏳ Waiting for cluster to be available..."
aws rds wait db-cluster-available --db-cluster-identifier $DB_CLUSTER_ID --region $REGION

# Create Aurora instance
echo "📦 Creating Aurora instance..."
aws rds create-db-instance \
  --db-instance-identifier $DB_INSTANCE_ID \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --db-cluster-identifier $DB_CLUSTER_ID \
  --region $REGION

echo "⏳ Waiting for instance to be available..."
aws rds wait db-instance-available --db-instance-identifier $DB_INSTANCE_ID --region $REGION

# Get connection endpoint
ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier $DB_CLUSTER_ID \
  --region $REGION \
  --query 'DBClusters[0].Endpoint' \
  --output text)

# Output connection string
echo ""
echo "✅ Aurora PostgreSQL cluster created successfully!"
echo ""
echo "📝 Connection details:"
echo "DATABASE_URL=postgresql://$DB_USERNAME:$DB_PASSWORD@$ENDPOINT:5432/$DB_NAME?sslmode=require"
echo ""
echo "🔐 Save this connection string to your .env.local and Vercel environment variables"
echo ""
echo "⚠️  IMPORTANT: Store the password securely. You cannot retrieve it later."
echo ""

# Save to SSM Parameter Store (encrypted)
aws ssm put-parameter \
  --name /bearable-senior/db-password \
  --value "$DB_PASSWORD" \
  --type SecureString \
  --region $REGION \
  --overwrite 2>/dev/null || echo "Password already in SSM"

echo "🔑 Password also stored in AWS SSM Parameter Store: /bearable-senior/db-password"
