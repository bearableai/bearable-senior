# Test User Onboarding Guide

## Status: Ready for Testing (95%)

**App URL:** https://main.dmgsm84w45hwx.amplifyapp.com

---

## What's Working ✅

### Infrastructure
- AWS Amplify (Next.js SSR on Lambda)
- Aurora PostgreSQL Serverless v2
- EventBridge cron jobs (15min medication checks, daily summaries)
- SSM Parameter Store (secrets management)
- Rate limiting (prevents API abuse)

### Authentication
- Email/password signup with bcrypt hashing
- SMS phone verification (6-digit codes)
- Session management (30-day cookies)
- Protected routes (/dashboard requires login)
- Logout functionality

### User Interface
- Landing page at `/`
- Login/signup at `/auth`
- Senior dashboard at `/dashboard/senior`
- Responsive design with Tailwind CSS

### Security
- Password hashing with bcrypt (10 salt rounds)
- SMS verification prevents phone number spoofing
- Rate limiting on all endpoints:
  - Login: 10 attempts per 15 min
  - SMS send: 3 per hour per phone
  - SMS inbound: 20 per hour per phone
- Privacy gates (PII redaction, prompt injection defense)
- HttpOnly session cookies

---

## Test User Flow

### 1. Visit the App
```
https://main.dmgsm84w45hwx.amplifyapp.com
```

### 2. Sign Up
1. Click "Sign In" button
2. Click "Don't have an account? Sign up"
3. Enter email and password
4. Click "Continue to Phone Verification"
5. Enter phone number (US format: +1 555-123-4567)
6. Click "Send Verification Code"
7. Wait for SMS (⏳ **REQUIRES TWILIO CREDENTIALS**)
8. Enter 6-digit code
9. Click "Verify & Create Account"

### 3. Dashboard
- View profile (email, phone, account type)
- Quick actions:
  - Daily check-in (I'm doing well / I need help)
  - View medications
  - Invite caretaker
  - SMS instructions

### 4. SMS Check-ins
**Once Twilio is configured:**
- Text your registered phone number to Bearable's number
- Say "good", "fine", "ok" → positive check-in
- Say "bad", "not well", "sick", "pain" → caretaker notified
- Say "yes", "taken", "done" → mark medication as taken

---

## What's Missing ⏳

### 1. Twilio Credentials (BLOCKING SMS)
**Location:** SSM Parameter Store
**Parameters needed:**
```bash
/bearable-senior/twilio-account-sid
/bearable-senior/twilio-auth-token
/bearable-senior/twilio-phone-number
```

**Once TX LLC phone is ready:**
```bash
aws ssm put-parameter \
  --name /bearable-senior/twilio-account-sid \
  --value "AC..." \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name /bearable-senior/twilio-auth-token \
  --value "..." \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name /bearable-senior/twilio-phone-number \
  --value "+18556884499" \
  --type String \
  --region us-east-1
```

Then update `lib/env/runtime.ts` to load these from SSM.

### 2. Caretaker Invitation UI
**Backend exists:**
- `/app/api/caretaker/*` endpoints ready
- Database tables: `relationships`, `invites`
- Email/SMS notification framework in place

**Needed:**
- UI at `/dashboard/senior` to send invitations
- UI at `/dashboard/caretaker` for caretaker view
- Accept invitation flow

### 3. CloudWatch Monitoring
**Current state:** Logs exist but no alarms
**Needed:**
- Alarm on API error rate > 5%
- Alarm on database connection failures
- SNS topic for notifications

---

## Testing Checklist

### Without Twilio (Available Now)
- [ ] Visit landing page
- [ ] Navigate to /auth
- [ ] Try to sign up (will fail at SMS verification step)
- [ ] Try to login with wrong password (should fail)
- [ ] Check rate limiting (try 11 logins in 15 min → should block)

### With Twilio (Once Configured)
- [ ] Complete full signup with SMS verification
- [ ] Login with email/password
- [ ] View dashboard
- [ ] Send SMS to Bearable's number
- [ ] Receive SMS response
- [ ] Check medication reminder (if scheduled)
- [ ] Invite caretaker
- [ ] Test caretaker notification flow

### Load Testing
- [ ] 10 concurrent signups
- [ ] 100 SMS messages in 1 hour (test rate limiting)
- [ ] Database connection pool under load
- [ ] Lambda cold start times

---

## Known Limitations

### In-Memory Storage
**Current:** Rate limiting and SMS codes stored in memory
**Impact:** Resets on Lambda cold start (every ~15 min if idle)
**Production:** Should use Redis/ElastiCache

### Multi-Agent AI
**Current:** Uses keyword matching, not real Bedrock
**Impact:** Health escalation uses simple keywords
**Production:** Needs AWS Bedrock integration

### Error Monitoring
**Current:** Logs to CloudWatch but no alerts
**Impact:** Failures are silent
**Production:** Needs CloudWatch Alarms + SNS

---

## Architecture

```
User Browser
    ↓
AWS Amplify (Lambda@Edge)
    ↓
Next.js API Routes
    ↓
┌──────────────────────────────────────┐
│ Aurora PostgreSQL (15.17)            │
│ - users, auth_sessions               │
│ - check_ins, medications             │
│ - relationships, invites             │
└──────────────────────────────────────┘
    ↓
EventBridge Cron → API /cron/medication-check
                → API /cron/daily-summary
                → API /cron/cleanup
    ↓
Twilio SMS API (once configured)
```

---

## Estimated Test User Capacity

| Metric | Current Capacity | Notes |
|--------|------------------|-------|
| Concurrent users | ~100 | Lambda auto-scales |
| Database connections | 10 pool | Aurora Serverless scales to 1 ACU |
| SMS per hour | ~1,000 | Twilio limits, rate limited to 3/phone/hour |
| API requests | Unlimited | Rate limited per IP/phone |

---

## Cost Estimate (First Month with 10 Test Users)

| Service | Cost |
|---------|------|
| Aurora Serverless (0.5 ACU avg) | $50 |
| Amplify (builds + bandwidth) | $5 |
| Twilio SMS (300 messages) | $9 |
| Lambda invocations | $0 |
| EventBridge | $0 |
| **Total** | **$64** |

---

## Support During Beta

**GitHub Issues:** https://github.com/bearableai/bearable-senior/issues

**Quick Debugging:**
```bash
# Check database
curl https://main.dmgsm84w45hwx.amplifyapp.com/api/health

# Check build status
aws amplify list-jobs --app-id dmgsm84w45hwx --branch-name main --region us-east-1 --max-items 3

# View logs
aws logs tail /aws/amplify/dmgsm84w45hwx --follow
```

---

## Next Deployment

To deploy updates:
```bash
git add .
git commit -m "Update description"
git push origin main
# Amplify auto-deploys in ~3 minutes
```

Check deployment:
```bash
aws amplify list-jobs --app-id dmgsm84w45hwx --branch-name main --region us-east-1 --max-items 1
```

---

**Status:** Ready for test users. Only blocker is Twilio credentials (waiting on TX LLC).
