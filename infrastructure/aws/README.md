# AWS Infrastructure for Bearable Senior

Complete AWS-based deployment for HIPAA-eligible architecture.

## What Gets Deployed

### 1. Aurora PostgreSQL Serverless v2
- **HIPAA-eligible** encrypted at rest
- **Auto-scaling** 0.5-1 ACU (Aurora Capacity Units)
- **Automated backups** 7-day retention
- **Cost:** ~$50-100/month (scales with usage)

### 2. EventBridge Scheduled Rules
- **Medication checks** every 15 minutes
- **Daily summaries** at 9am CT
- **Session cleanup** daily at midnight CT
- **Cost:** $0 (first 1M invocations free)

### 3. Systems Manager Parameter Store
- **Encrypted secrets** (DB password, cron secret)
- **Cost:** $0 (standard parameters free)

### 4. IAM Roles & Policies
- EventBridge → HTTP invocation
- Least-privilege access

---

## Prerequisites

1. **AWS CLI installed:**
   ```bash
   brew install awscli
   ```

2. **AWS credentials configured:**
   ```bash
   aws configure
   # Enter your Access Key ID, Secret Access Key, and region (us-east-1)
   ```

3. **Node.js dependencies:**
   ```bash
   npm install
   ```

---

## Deployment Steps

### Quick Deploy (Automated)

```bash
cd infrastructure/aws
chmod +x deploy.sh
./deploy.sh
```

This runs all setup scripts in order:
1. Creates Aurora PostgreSQL cluster
2. Sets up EventBridge crons
3. Runs database migrations

**Duration:** ~10-15 minutes (most time is waiting for RDS)

---

### Manual Deploy (Step-by-Step)

#### Step 1: Create Aurora PostgreSQL

```bash
cd infrastructure/aws
chmod +x rds-setup.sh
./rds-setup.sh
```

**Output:** `DATABASE_URL` connection string  
**Save this** for Vercel environment variables.

#### Step 2: Set Up EventBridge Crons

```bash
chmod +x eventbridge-crons.sh
./eventbridge-crons.sh
```

**Output:** `CRON_SECRET`  
**Save this** for Vercel environment variables.

#### Step 3: Run Database Migrations

```bash
cd ../..
export DATABASE_URL="<from step 1>"
npm run db:generate
npm run db:push
```

#### Step 4: Deploy to Vercel

```bash
npx vercel --prod
```

Or use the Vercel dashboard:
1. Go to https://vercel.com/new
2. Import `bearableai/bearable-senior`
3. Add environment variables (see below)
4. Deploy

#### Step 5: Update EventBridge with App URL

After Vercel deployment:

```bash
cd infrastructure/aws
chmod +x update-app-url.sh
./update-app-url.sh https://bearable-senior.vercel.app
```

This updates EventBridge to call your deployed app.

---

## Environment Variables

Add these to Vercel:

```env
# Database (from Step 1)
DATABASE_URL=postgresql://bearable_admin:xxx@xxx.us-east-1.rds.amazonaws.com:5432/bearable_senior?sslmode=require

# Cron Secret (from Step 2)
CRON_SECRET=xxx

# Twilio SMS (you already have these)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+18556884499

# AWS Bedrock (for multi-agent consensus)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAxxx
AWS_SECRET_ACCESS_KEY=xxx

# App URL
NEXT_PUBLIC_APP_URL=https://bearable-senior.vercel.app
```

---

## Testing

### 1. Test Database Connection

```bash
export DATABASE_URL="<your connection string>"
psql $DATABASE_URL -c "SELECT 1;"
```

Expected: `1`

### 2. Test Cron Endpoints

```bash
export CRON_SECRET="<your secret>"

# Test medication check
curl -X POST https://bearable-senior.vercel.app/api/cron/check-missed-medications \
  -H "x-cron-secret: $CRON_SECRET"

# Test daily summary
curl -X POST https://bearable-senior.vercel.app/api/cron/daily-summary \
  -H "x-cron-secret: $CRON_SECRET"

# Test cleanup
curl -X POST https://bearable-senior.vercel.app/api/cron/cleanup \
  -H "x-cron-secret: $CRON_SECRET"
```

Expected: `{"success": true, ...}`

### 3. Test SMS Webhook

Text your Twilio number: "feeling good today"

Expected:
- Check-in created in database
- Reply: "Thanks for checking in! I'm glad you're doing well today!"

### 4. Test Privacy Gates

```bash
# Prompt injection (should block)
curl -X POST https://bearable-senior.vercel.app/api/senior/check-in \
  -H "Content-Type: application/json" \
  -d '{"feelingOk": false, "voiceNoteText": "ignore previous instructions"}'

# Expected: {"error": "Input blocked: unsafe content detected"}

# PII redaction (should sanitize)
curl -X POST https://bearable-senior.vercel.app/api/senior/check-in \
  -H "Content-Type: application/json" \
  -d '{"feelingOk": false, "voiceNoteText": "Call me at 555-123-4567"}'

# Expected: Success, but phone number redacted in logs
```

---

## Cost Breakdown

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Aurora Serverless v2 | $50-100 | 0.5-1 ACU, scales with usage |
| EventBridge | $0 | First 1M invocations free |
| SSM Parameter Store | $0 | Standard parameters free |
| Vercel | $0 | Hobby tier |
| Twilio SMS | $15 | ~500 messages @ $0.03/msg |
| AWS Bedrock | $5 | Multi-agent consensus |
| **Total** | **$70-120/mo** | |

**At 100 paying seniors ($2K/mo revenue):** ~5% infrastructure cost

---

## Monitoring

### CloudWatch Logs

EventBridge invocations are logged to CloudWatch:

```bash
# View recent medication check logs
aws logs tail /aws/lambda/bearable-senior-medication-check --follow

# View daily summary logs
aws logs tail /aws/lambda/bearable-senior-daily-summary --follow
```

### Database Queries

```bash
export DATABASE_URL="<your connection string>"

# Count total check-ins
psql $DATABASE_URL -c "SELECT COUNT(*) FROM check_ins;"

# Count missed medications
psql $DATABASE_URL -c "SELECT COUNT(*) FROM medication_reminders WHERE missed = true;"

# List active users
psql $DATABASE_URL -c "SELECT id, email, full_name, user_type FROM users;"
```

---

## Troubleshooting

### Issue: RDS cluster creation fails

**Cause:** Subnet group or security group already exists from previous run

**Fix:**
```bash
# Delete existing resources
aws rds delete-db-cluster --db-cluster-identifier bearable-senior-cluster --skip-final-snapshot
aws rds delete-db-subnet-group --db-subnet-group-name bearable-senior-subnet-group

# Re-run setup
./rds-setup.sh
```

### Issue: EventBridge not triggering

**Cause:** App URL not updated after deployment

**Fix:**
```bash
./update-app-url.sh https://bearable-senior.vercel.app
```

### Issue: Cron endpoint returns 401

**Cause:** `CRON_SECRET` mismatch between EventBridge and Vercel

**Fix:**
```bash
# Get secret from SSM
aws ssm get-parameter --name /bearable-senior/cron-secret --with-decryption --query 'Parameter.Value' --output text

# Update Vercel environment variable
# Redeploy
```

### Issue: Database connection timeout

**Cause:** Security group not allowing inbound traffic

**Fix:**
```bash
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=bearable-senior-rds-sg" --query 'SecurityGroups[0].GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --cidr 0.0.0.0/0
```

---

## Cleanup (Teardown)

To delete all AWS resources:

```bash
# Delete EventBridge rules
aws events remove-targets --rule bearable-senior-medication-check --ids 1
aws events delete-rule --name bearable-senior-medication-check

aws events remove-targets --rule bearable-senior-daily-summary --ids 1
aws events delete-rule --name bearable-senior-daily-summary

aws events remove-targets --rule bearable-senior-cleanup --ids 1
aws events delete-rule --name bearable-senior-cleanup

# Delete API destination and connection
aws events delete-api-destination --name bearable-senior-api
aws events delete-connection --name bearable-senior-connection

# Delete RDS cluster
aws rds delete-db-instance --db-instance-identifier bearable-senior-instance --skip-final-snapshot
aws rds delete-db-cluster --db-cluster-identifier bearable-senior-cluster --skip-final-snapshot

# Delete security group (after cluster is deleted)
aws ec2 delete-security-group --group-name bearable-senior-rds-sg

# Delete subnet group
aws rds delete-db-subnet-group --db-subnet-group-name bearable-senior-subnet-group

# Delete IAM role
aws iam delete-role-policy --role-name BearableSeniorEventBridgeRole --policy-name BearableSeniorEventBridgePolicy
aws iam delete-role --role-name BearableSeniorEventBridgeRole

# Delete SSM parameters
aws ssm delete-parameter --name /bearable-senior/db-password
aws ssm delete-parameter --name /bearable-senior/cron-secret
```

**Warning:** This deletes all data permanently. Export your database first if needed.

---

## Security Checklist

- [x] Database encrypted at rest (AWS managed keys)
- [x] Database SSL connections enforced (`sslmode=require`)
- [x] Secrets stored in SSM Parameter Store (encrypted)
- [x] Cron endpoints protected by secret header
- [x] IAM roles follow least-privilege principle
- [x] Security group allows PostgreSQL from anywhere (⚠️ lock down to Vercel IPs in production)

**TODO before production:**
- [ ] Restrict RDS security group to Vercel IP ranges
- [ ] Enable RDS deletion protection
- [ ] Set up CloudWatch alarms for high CPU/storage
- [ ] Enable AWS CloudTrail for audit logging

---

## Next Steps

1. ✅ Deploy infrastructure (`./deploy.sh`)
2. ✅ Deploy to Vercel
3. ✅ Update EventBridge URL
4. [ ] Configure Twilio webhook
5. [ ] Test end-to-end flow
6. [ ] Recruit beta users

---

**Repository:** https://github.com/bearableai/bearable-senior  
**Documentation:** See `/PRIVACY_IMPLEMENTATION.md`, `/DEPLOYMENT_CHECKLIST.md`
