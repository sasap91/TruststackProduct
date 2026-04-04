# TrustStack

**Multimodal claim verification and fraud detection platform for commerce workflows.**

TrustStack combines AI-powered evidence analysis across text, images, and documents with deterministic policy rules to make defensible fraud, dispute, and returns decisions — and then autonomously executes those decisions.

---

## What It Does

When a customer submits a claim (damaged item, not received, wrong item), TrustStack:

1. **Ingests** the claim and all attached evidence (text description, photos, receipts, order data)
2. **Analyzes** each piece of evidence with modality-specific AI agents
3. **Fuses** signals across modalities to detect corroboration and contradiction
4. **Scores** risk using a category-weighted model (fraud evidence, claim integrity, account risk, procedural)
5. **Applies** policy rules to reach a decision: `approve`, `reject`, `review`, or `request_more_evidence`
6. **Explains** the decision in plain language using Claude Haiku
7. **Acts autonomously** — sends emails, flags fraud, routes to human review, requests evidence — without human intervention

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            CLIENTS                                  │
│                                                                     │
│   Dashboard (React 19 / Next.js)    REST API (API Key or Clerk)    │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  NEXT.JS API ROUTES (App Router)                    │
│                                                                     │
│  POST /api/cases                  Create a new case                │
│  POST /api/cases/:id/evidence     Attach evidence artifact         │
│  POST /api/cases/:id/analyze      Run analysis pipeline            │
│  POST /api/cases/:id/review       Submit human review decision     │
│  POST /api/analyze/claim          Legacy single-shot endpoint      │
│  GET|POST|DELETE /api/keys        API key management               │
│  POST /api/webhooks/clerk         Clerk user sync                  │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│           ORCHESTRATOR  (MultimodalClaimOrchestrator)               │
│                                                                     │
│  STAGE 1 — Evidence Agents  (parallel, per-artifact isolated)      │
│  ┌─────────────────────┐  ┌─────────────────────┐                 │
│  │  TextEvidenceAgent  │  │ ImageEvidenceAgent  │ ← Claude Vision │
│  └─────────────────────┘  └─────────────────────┘                 │
│  ┌─────────────────────┐  ┌─────────────────────┐                 │
│  │ DocumentEvidence    │  │ MetadataEvidence    │                 │
│  │ Agent               │  │ Agent               │                 │
│  └─────────────────────┘  └─────────────────────┘                 │
│           │  Each emits normalized Signals[]                       │
│           ▼                                                         │
│  STAGE 2 — SignalFusionAgent  (deterministic)                      │
│           Reinforces corroborated signals, flags contradictions    │
│           ▼                                                         │
│  STAGE 3 — RiskAgent  (deterministic)                              │
│           Fraud 35% · Claim integrity 30% · Account 20% · Proc 15%│
│           → riskScore 0–1, riskLevel low|medium|high|critical      │
│           ▼                                                         │
│  STAGE 4 — PolicyAgent  (deterministic rule engine)                │
│           OVERRIDE rules (stop early) + STANDARD rules (max sev.) │
│           → outcome: approve | review | reject | more_evidence     │
│           ▼                                                         │
│  STAGE 5 — JudgeAgent  (Claude Haiku)                              │
│           Human-readable justification — template fallback if no key│
│           ▼                                                         │
│  STAGE 6 — ActionAgent  (deterministic)                            │
│           Maps outcome → ActionExecution[]  (data only, no effects)│
└────────────────────────┬────────────────────────────────────────────┘
                         │  persist to DB
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              ACTION EXECUTOR  (autonomous execution layer)          │
│                                                                     │
│  Runs after persistence. Each action: pending → executing → done   │
│                                                                     │
│  auto_refund           → email claimant/merchant (Resend)          │
│  auto_reject           → email claimant with reason (Resend)       │
│  send_to_human_review  → email reviewer queue (Resend)             │
│  request_more_evidence → email claimant with gaps (Resend)         │
│  block_and_flag        → fraud_flagged CaseEvent + admin alert     │
│  generate_evidence_pack→ evidence_pack_generated CaseEvent         │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL  (via Prisma)                        │
│                                                                     │
│  Case                  Primary unit of work, full lifecycle        │
│  EvidenceArtifact      Raw evidence (text inline, media by ref)    │
│  DecisionRun           One analysis pass — fully reproducible      │
│  ExtractedSignal       Normalized signal with fusion metadata       │
│  PolicyVersion         Snapshot of policy config (SHA-keyed)       │
│  ActionExecution       Action record with status transitions        │
│  HumanReview           Reviewer override decision                  │
│  CaseEvent             Append-only immutable audit log             │
│  OutcomeFeedback       Post-decision outcome for calibration       │
│  ApiKey                User API keys (hashed, prefixed)            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## How Systems Link Together

```
Request
  │
  ├─ Auth ──────────────────────► Clerk (OAuth / SSO)
  │                                └─ Webhook → welcome email via Resend
  │
  ├─ Rate limit ────────────────► UsageRecord (PostgreSQL)
  │
  ├─ Orchestrator
  │    ├─ ImageEvidenceAgent ───► Claude Vision  (Anthropic SDK)
  │    │                          └─ fallback: DemoVisionProvider (deterministic)
  │    ├─ TextEvidenceAgent ────► HeuristicTextReasoningProvider (local)
  │    │                          └─ optional: HuggingFace text models
  │    ├─ DocumentEvidenceAgent ► MockOcrProvider (local)
  │    ├─ MetadataEvidenceAgent ► Heuristic rules (local)
  │    └─ JudgeAgent ──────────► Claude Haiku (Anthropic SDK)
  │                               └─ fallback: template string
  │
  ├─ Persistence ───────────────► PostgreSQL via Prisma + PrismaPg adapter
  │
  ├─ Action Executor ───────────► Resend (transactional email)
  │    ├─ approval/rejection emails
  │    ├─ reviewer queue notifications
  │    ├─ evidence request emails
  │    └─ fraud alert emails
  │
  ├─ Monitoring ────────────────► Sentry (server + client + edge)
  └─ Analytics ─────────────────► PostHog (product events)
```

---

## Decision Pipeline (Data Flow)

```
Evidence (text, image, doc, metadata)
    │
    ▼  [Evidence Agents — parallel]
Signals[]         key · value · flag · confidence · modality
    │
    ▼  [SignalFusionAgent]
FusedSignals[]    + reinforced · contradictedBy · corroboratedBy
ContradictionReport[]
    │
    ▼  [RiskAgent]
RiskAssessment    riskScore 0–1 · riskLevel · consistencyScore
    │
    ▼  [PolicyAgent]
PolicyDecision    outcome · matchedRules[] · evidenceReferences · confidence
    │
    ▼  [JudgeAgent]
justification     human-readable string
    │
    ▼  [ActionAgent]
ActionExecution[] action · status · auditMessage
    │
    ▼  [Action Executor — autonomous]
Real-world effects: emails · CaseEvents · fraud flags
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript (strict) |
| Database | PostgreSQL + Prisma 7 (PrismaPg adapter) |
| Auth | Clerk (OAuth, SSO, webhooks) |
| AI — Vision | Anthropic Claude (Vision) |
| AI — Judge | Anthropic Claude Haiku |
| AI — Detection | Hugging Face Inference API (optional) |
| AI — Moderation | OpenAI Moderation API (optional) |
| Email | Resend |
| Monitoring | Sentry (server, client, edge) |
| Analytics | PostHog |
| Deployment | Vercel / Docker (standalone output) |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    Landing page
│   ├── dashboard/                  Claim analyzer + case history
│   ├── pricing/                    Pricing page
│   ├── contact/                    Contact form
│   ├── settings/                   API key management
│   └── api/
│       ├── cases/                  Case CRUD + analyze + review
│       ├── analyze/                Legacy multimodal + image + text endpoints
│       ├── keys/                   API key management
│       ├── contact/                Contact form handler
│       └── webhooks/clerk/         Clerk user sync
│
├── components/
│   ├── DecisionPanel.tsx           Decision + signals + actions display
│   ├── RiskGauge.tsx               Visual risk score
│   ├── SignalBadge.tsx             Individual signal display
│   └── SiteHeader / SiteFooter
│
└── lib/
    ├── db.ts                       Prisma client singleton
    ├── apikey-auth.ts              API key validation
    ├── ratelimit.ts                20 req/min per user
    ├── case-storage.ts             DB persistence bridge
    ├── truststack-repo.ts          Low-level DB helpers
    │
    └── truststack/                 Core decision engine
        ├── orchestrator.ts         MultimodalClaimOrchestrator (main entry)
        ├── agents/                 Evidence + pipeline agents
        │   ├── evidence/           Text, image, document, metadata agents
        │   ├── signal-fusion-agent.ts
        │   ├── risk-agent.ts
        │   ├── policy-agent.ts
        │   ├── judge-agent.ts
        │   └── action-agent.ts
        ├── providers/              Swappable vendor adapters
        │   ├── vision-provider.ts  Claude Vision / Demo
        │   ├── ocr-provider.ts     Mock / Real OCR
        │   └── text-reasoning-provider.ts
        ├── executor/               Autonomous action execution layer
        │   ├── action-executor.ts  Dispatch loop + DB status transitions
        │   └── handlers/           Per-action side effects (email, events)
        ├── types/                  Domain type definitions
        ├── eval/                   Evaluation harness + fixtures
        └── api.ts                  HTTP request/response bridge
```

---

## Database Schema (Key Models)

```
Case ──────────────────── one-to-many ──► EvidenceArtifact
  │                                            │
  ├── one-to-many ──────────────────────► DecisionRun
  │                                            │
  │                                            ├──► ExtractedSignal
  │                                            ├──► ActionExecution
  │                                            └──► HumanReview
  │
  ├── one-to-many ──────────────────────► CaseEvent  (append-only audit log)
  └── one-to-many ──────────────────────► OutcomeFeedback
```

**ActionExecution status lifecycle:**
```
pending  →  executing  →  completed
                       →  failed  (error in notes field)
```

---

## Setup

```bash
cp .env.example .env.local
# Fill in required vars (see below)
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required Environment Variables

```env
DATABASE_URL=postgres://...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Optional — enables AI features

```env
ANTHROPIC_API_KEY=sk-ant-...         # Claude Vision + Haiku judge
HUGGINGFACE_ACCESS_TOKEN=hf_...      # Image/text AI detection models
OPENAI_API_KEY=sk-...                # OpenAI Moderation (text safety)
RESEND_API_KEY=re_...                # Transactional email for actions
```

### Optional — action executor email routing

```env
RESEND_FROM_EMAIL="TrustStack <noreply@yourdomain.com>"
TRUSTSTACK_ADMIN_EMAIL=admin@yourcompany.com
TRUSTSTACK_REVIEWER_EMAIL=claims-review@yourcompany.com
```

Without `ANTHROPIC_API_KEY` the system runs in demo mode (deterministic placeholder scores). Without `RESEND_API_KEY` all analysis still works — emails are silently skipped and actions are marked `completed`.

---

## API

### Case-based flow (recommended)

```bash
# 1. Create a case
POST /api/cases
{ "claimType": "not_received", "description": "My package never arrived" }
→ { "caseId": "...", "ref": "TS-2026-A3F9" }

# 2. Attach evidence
POST /api/cases/:id/evidence
multipart: file (image) or JSON { "text": "...", "type": "text" }

# 3. Run analysis — autonomous actions fire automatically
POST /api/cases/:id/analyze
→ ClaimAnalysisResponse
```

### Legacy single-shot

```bash
POST /api/analyze/claim
multipart: file + claimText + optional policy fields
→ ClaimAnalysisResponse
```

### Standalone detection

```bash
POST /api/analyze/image   multipart: file
POST /api/analyze/text    JSON: { "text": "..." }
```

All endpoints accept either a Clerk session (dashboard) or an API key (`Authorization: Bearer ts_...`).

---

## Deployment

### Vercel
Push to GitHub and connect the repo. Set env vars in project settings.

### Docker
```bash
docker build -t truststack .
docker run -p 3000:3000 --env-file .env truststack
```

The Dockerfile uses Next.js standalone output for minimal image size.
