# 🚨 URGENT FIXES - Before Test User Onboarding

## Critical Blockers (MUST FIX)

### 1. Authentication - NO PASSWORD PROTECTION
**File:** `/app/api/auth/login/route.ts`
**Issue:** Anyone can create accounts with any email
**Fix Needed:** Add basic password authentication or magic link system

### 2. Schema Mismatch - DATA LOSS RISK
**Files:** `/lib/db/migrate.ts` vs `/lib/db/schema.ts`
**Issue:** Migration creates different schema than app expects
**Fix Needed:** Regenerate migration from schema.ts exactly

### 3. Multi-Agent AI - NOT WORKING
**File:** `/lib/ai/multi-agent.ts`
**Issue:** Uses keyword matching, not actual Bedrock AI calls
**Fix Needed:** Implement real AWS Bedrock integration or remove feature

### 4. SMS Verification - SECURITY HOLE
**Issue:** Users can claim any phone number without verification
**Fix Needed:** Implement Twilio verification flow

### 5. Rate Limiting - COST RISK
**Issue:** SMS webhook and APIs have no rate limits
**Fix Needed:** Add AWS WAF rules or API rate limiting

## High Priority (Should Fix)

### 6. RDS Endpoint Hardcoded
**Issue:** Won't work if database is recreated
**Fix:** Store in SSM parameter

### 7. No Error Monitoring
**Issue:** Production failures will be silent
**Fix:** Add CloudWatch Alarms + SNS notifications

### 8. Connection Pooling
**Issue:** Will hit connection limits under load
**Fix:** Add RDS Proxy or increase pool size

## Test User Onboarding Requirements

### Minimum Viable Setup:
1. ✅ Database working
2. ✅ API endpoints responding
3. ❌ **User authentication** (critical)
4. ❌ **SMS verification** (critical)
5. ⏳ SMS webhook configured
6. ⏳ Twilio credentials added
7. ⏳ Simple login UI
8. ⏳ Caretaker invitation flow

### User Journey:
1. Senior receives invitation link
2. Senior signs up with phone number
3. SMS verification code sent
4. Senior confirms code
5. Caretaker gets notification
6. Daily SMS check-ins begin

## Estimated Time to Fix:
- Authentication: 1 hour
- SMS verification: 1 hour
- Schema fix: 30 min
- Simple login UI: 1 hour
- Testing: 1 hour
- **Total: 4.5 hours**

## Which fixes do you want me to prioritize?
