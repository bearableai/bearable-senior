# Bearable Senior — Standalone Deployment Guide

**Status:** Ready for independent deployment and marketing  
**Target Market:** Seniors (65+) and their adult children/caretakers  
**Business Model:** B2C subscription ($20/month per senior)

---

## Phase 1: Quick Deployment (< 1 hour)

### 1. Create New GitHub Repo

```bash
cd /Users/jefflevine/Projects/bearable-senior
git init
git add -A
git commit -m "Initial Bearable Senior standalone app"
git branch -M main
git remote add origin https://github.com/yourusername/bearable-senior.git
git push -u origin main
```

### 2. Set Up Database (Neon - Free Tier)

1. Go to [neon.tech](https://neon.tech)
2. Create account
3. Create database: `bearable-senior-prod`
4. Copy connection string
5. Run migrations:

```bash
export DATABASE_URL="postgresql://..."
npm run db:generate
npm run db:push
```

### 3. Deploy to Vercel

1. Import GitHub repo in Vercel
2. Add environment variables (see below)
3. Deploy

**Environment Variables:**
```
DATABASE_URL=postgresql://...@neon.tech/bearable-senior
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+15125551234
NEXT_PUBLIC_APP_URL=https://bearable-senior.vercel.app
CRON_SECRET=generate_random_256bit
```

### 4. Configure Twilio Webhook

Point Twilio number to: `https://your-domain.vercel.app/api/sms/inbound`

### 5. Set Up EventBridge Cron

```bash
# Medication reminders every 15 minutes
aws events put-rule \
  --name bearable-senior-meds \
  --schedule-expression "rate(15 minutes)"

# Target: Lambda that POSTs to /api/cron/medication-reminders
```

---

## Phase 2: Custom Domain & Branding

### Domain Setup
- Register: `bearablesenior.com` (~$12/year on Namecheap)
- Add to Vercel project
- SSL automatic via Vercel

### Brand Identity
- **Name:** Bearable Senior
- **Tagline:** "Peace of mind for your family"
- **Colors:** 
  - Primary: `#E87D3E` (warm orange)
  - Success: `#7FB069` (reassuring green)
  - Background: High contrast white/black
- **Logo:** Heart icon with stylized "B" (commission on Fiverr: $50)

### Landing Page (`app/page.tsx`)

Key elements:
- Hero: "Stay connected with your loved ones"
- 3-column features (Check-ins, Meds, Alerts)
- Video demo (senior using app, family receiving alert)
- Pricing: $20/month, 14-day free trial
- CTA: "Start Free Trial"

---

## Phase 3: Go-to-Market Strategy

### Target Customer

**Primary:** Adult children (40-60) caring for aging parents  
**Pain Points:**
- Worry about parent living alone
- Can't check in daily due to work/distance
- Medication adherence concerns
- Want early warning signs

**Value Prop:** "Know your mom is okay without calling 3x/day"

### Pricing

| Plan | Price | Features |
|------|-------|----------|
| **Senior Solo** | $20/mo | 1 senior, unlimited caretakers |
| **Family Plan** | $35/mo | Up to 3 seniors, shared dashboard |
| **Care Provider** | Custom | Bulk licenses for care facilities |

**14-day free trial, cancel anytime**

### Marketing Channels

**Month 1-2: Validation**
1. **Friends & Family Beta** (free)
   - Recruit 10 seniors from your network
   - Weekly feedback calls
   - Iterate on UX

2. **Local Senior Center** ($0)
   - Partner with 1-2 centers in Austin
   - Run free 30-day pilot
   - Collect testimonials

**Month 3-6: Paid Acquisition**

1. **Facebook Ads** ($500/mo)
   - Target: Adults 40-60, interested in "senior care", "aging parents"
   - Ad creative: "I used to worry about Mom every day. Now I get a simple ✓ each morning."
   - Landing page → Free trial signup

2. **Google Ads** ($300/mo)
   - Keywords: "medication reminder app for seniors", "senior wellness check app"
   - Long-tail focus (lower CPC)

3. **Content Marketing** ($0, time investment)
   - Blog: "10 Signs Your Parent Needs More Support"
   - SEO target: "best apps for seniors living alone"
   - Guest posts on Caring.com, AgingCare.com

4. **Partnerships**
   - **Senior living communities** — Offer as "aging in place" support
   - **Primary care practices** — Handout cards in waiting rooms
   - **Medicare/Medicaid consultants** — Referral program (10% commission)

**Month 6-12: Scale**

1. **Care Provider Portal** (B2B2C)
   - White-label for home health agencies
   - $50/seat/month + $10/senior
   - Target: 1000+ person agencies

2. **Insurance Partnerships**
   - Pitch as preventative care → reduced ER visits
   - Medicare Advantage add-on

### Success Metrics

| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| MRR | $1,000 (50 seniors) | $5,000 (250) | $20,000 (1000) |
| CAC | $50 | $40 | $30 |
| LTV | $240 (12mo avg) | $360 (18mo) | $480 (24mo) |
| Churn | < 10%/mo | < 5%/mo | < 3%/mo |

---

## Phase 4: Feature Roadmap

### v1.0 (Launch) — Current Build
- Daily check-ins
- Medication reminders
- Caretaker dashboard
- SMS alerts

### v1.1 (Month 2)
- **Voice call reminders** (Twilio TTS) — "Press 1 when you've taken your medication"
- **Photo sharing** — Seniors can send photos to caretakers
- **Emergency contacts** — One-tap 911 or designated contact

### v1.2 (Month 4)
- **Weekly email digest** for caretakers
- **Multi-caretaker coordination** — Shared care calendar
- **Appointment reminders** — Sync with Google Calendar

### v1.3 (Month 6)
- **Fall detection** (Apple Watch, Fitbit integration)
- **Activity tracking** — Steps, sleep (light Oura-style)
- **Care provider portal** — For home health nurses

### v2.0 (Month 12)
- **AI health insights** — "Mom's check-ins have been declining on Mondays"
- **Video calls** — Built-in simplified Zoom
- **Group family updates** — Private feed like Facebook

---

## Technical Architecture

### Why This Stack?

**Next.js 16:**
- Server Components → fast page loads
- App Router → simple structure
- Vercel deployment → zero config

**PostgreSQL (Neon):**
- Relational data (seniors ↔ caretakers)
- pgvector support (future: AI features)
- Generous free tier

**Twilio:**
- SMS reminders (5¢/message)
- Future: voice calls (1¢/min)
- Scales to millions

**AWS Bedrock (Claude Sonnet 4.6):**
- Medication conflict detection
- Escalation pattern analysis
- Weekly summary generation
- $3/million tokens (< $10/mo at 1000 users)

### Cost Structure (per 1000 seniors)

| Service | Monthly Cost | Per Senior |
|---------|--------------|------------|
| Vercel Pro | $20 | $0.02 |
| Neon DB | $0 (free tier) | $0 |
| Twilio SMS | $150 (3000 msgs @ 5¢) | $0.15 |
| AWS Bedrock | $10 | $0.01 |
| **Total** | **$180** | **$0.18** |

**Gross margin:** $20 revenue - $0.18 COGS = **99% margin**

---

## Competitive Analysis

### Existing Solutions

| Product | Price | Pros | Cons | Our Advantage |
|---------|-------|------|------|---------------|
| **GrandPad** | $80/mo | Purpose-built tablet | Expensive, requires hardware | Software-only, use existing phone |
| **MedMinder** | $40/mo | Medication focus | No wellness check-ins | Holistic (meds + check-ins) |
| **CareZone** | Free | Med tracking | No caretaker alerts | Proactive escalation |
| **GreatCall Lively** | $25/mo | Wearable + SMS | Seniors resistant to wearables | Works on any phone |

**Our Differentiation:**
1. **Phone-first** — No special hardware required
2. **Simplicity** — Just 3 buttons on senior side
3. **Proactive** — Alerts before crisis (3-day pattern detection)
4. **Affordable** — $20 vs $40-80 competitors

---

## Legal & Compliance

### HIPAA
**Not HIPAA-covered entity** — We're consumer wellness, not healthcare provider.

However, implement HIPAA-grade security:
- Encrypted at rest (DB-level)
- Encrypted in transit (HTTPS)
- Access logs (audit trail)
- BAA with Twilio (for future provider partnerships)

### Terms of Service

Key clauses:
- **Medical Disclaimer:** "Not a substitute for professional medical advice"
- **Emergency Clause:** "Call 911 for emergencies, not this app"
- **Data Ownership:** User owns all health data, can export anytime
- **Liability Limit:** No liability for missed medication reminders

### Privacy Policy

**Data Collection:**
- Name, phone, email
- Check-in responses (yes/no)
- Medication names (not prescriptions)
- Voice notes (if user opts in)

**Not Collected:**
- Social Security Number
- Medical records
- Payment info (Stripe handles)

**Data Retention:**
- Active accounts: indefinite
- Deleted accounts: 30-day grace period, then purged

---

## Sales Collateral

### One-Pager (for senior centers)

```
Bearable Senior
Peace of Mind for Your Family

Simple daily check-ins + medication reminders + family alerts

How it works:
1. Mom taps 👍 or 👎 each morning
2. Gets SMS when it's time for meds
3. You see her week at a glance
4. Automatic alert if 3+ bad days

$20/month, cancel anytime
14-day free trial

bearablesenior.com/senior-centers
```

### Email Template (for adult children)

```
Subject: Never worry about your mom forgetting her meds again

Hi [Name],

Does this sound familiar?

You call your mom every day to make sure she's okay.
You remind her about medications.
You worry she won't tell you if something's wrong.

Bearable Senior is a simple app that:
✓ Checks in with your mom every morning (just a tap)
✓ Sends her med reminders via text
✓ Alerts you if she reports 3+ bad days

She doesn't need to learn anything complicated.
You get peace of mind without being intrusive.

Try it free for 14 days: [link]

[Testimonial quote from beta user]

- The Bearable Team
```

---

## Launch Checklist

### Pre-Launch (Week 1-2)
- [ ] Run full QA cycle (onboarding → check-in → alert)
- [ ] Set up monitoring (Sentry, Vercel Analytics)
- [ ] Create demo account with fake data
- [ ] Write help docs (5 FAQs minimum)
- [ ] Set up support email (support@bearablesenior.com)

### Launch Day (Week 3)
- [ ] Announce on Product Hunt
- [ ] Post in relevant subreddits (/r/AgingParents, /r/Caregivers)
- [ ] Send to beta users for testimonials
- [ ] Start Facebook ads ($20/day budget)
- [ ] Press release to local Austin news

### Week 1 Post-Launch
- [ ] Daily check-in on signups/churn
- [ ] Monitor error rates (Sentry)
- [ ] Reply to all support emails within 4h
- [ ] Weekly call with first 5 paying customers

### Month 1
- [ ] Hit 50 paid seniors (= ramen profitable)
- [ ] Collect 10 video testimonials
- [ ] A/B test pricing ($20 vs $25)
- [ ] Start outreach to senior centers

---

## Fundraising (Optional)

If you want to accelerate:

**Pre-Seed Round:** $250K
- **Use:**
  - $100K: Founder salary (6 months)
  - $75K: Marketing spend
  - $50K: Contractor (iOS app)
  - $25K: Legal, AWS, misc

- **Traction to raise:**
  - 500 paying seniors (= $10K MRR)
  - 20% MoM growth
  - < 5% churn
  - 3 care provider partnerships

- **Pitch:**
  - Market: 54M Americans 65+, 34M living alone
  - TAM: $13B (seniors) + $50B (care providers)
  - Traction: [your numbers]
  - Advantage: Fable 5 reasoning → better escalation than rules-based

**Valuation:** $2M pre-money (standard pre-seed)

**Investors to target:**
- **Andreessen Horowitz** (a16z Bio + Health)
- **Homebrew** (consumer-focused)
- **Texas angels** (Austin Ventures, Capital Factory)

---

## Summary

**Bearable Senior is a standalone, marketable product ready for deployment.**

**Next 24 hours:**
1. Create GitHub repo
2. Deploy to Vercel
3. Register domain
4. Set up Twilio webhook

**Next 2 weeks:**
5. Recruit 10 beta users
6. Iterate on UX feedback
7. Launch on Product Hunt

**Next 90 days:**
8. Hit $1K MRR (50 paying seniors)
9. Prove unit economics (LTV > 3x CAC)
10. Scale or fundraise

**Exit scenarios (3-5 years):**
- Acquisition by GrandPad, Best Buy Health, CVS Health ($10-50M)
- Continue as profitable indie ($240K ARR @ 1000 seniors)
- Scale to B2B2C and fundraise for $100M+ outcome

🎯 **This is a real business, not just a feature. Go build it.**
