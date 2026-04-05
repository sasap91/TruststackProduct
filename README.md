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
│  POST /api/cases/:id/analyze      Trigger async analysis (202)     │
│  GET  /api/cases/:id/status       Poll analysis status             │
│  POST /api/cases/:id/review       Submit human review decision     │
│  GET|POST /api/webhooks           Webhook endpoint management      │
│  DELETE /api/webhooks/:id         Remove webhook endpoint          │
│  POST /api/analyze/claim          Legacy single-shot endpoint      │
│  GET|POST|DELETE /api/keys        API key management               │
│  GET|PUT /api/settings/policy     Risk weights + policy rules      │
│  GET /api/integrations/shopify    Shopify connection status        │
│  GET /api/integrations/shopify/connect  Start OAuth flow          │
│  GET /api/integrations/shopify/callback OAuth callback            │
│  DELETE /api/integrations/shopify Delete connection               │
│  POST /api/webhooks/shopify       Shopify event receiver           │
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

### Optional — Shopify integration

```env
SHOPIFY_CLIENT_ID=...                # From your Shopify Partner app
SHOPIFY_CLIENT_SECRET=...            # From your Shopify Partner app
SHOPIFY_WEBHOOK_SECRET=...           # HMAC key for inbound Shopify webhook verification
NEXT_PUBLIC_APP_URL=https://your-domain.com  # Used to build OAuth callback URL
ENCRYPTION_KEY=<64 hex chars>        # AES-256-GCM key for storing Shopify access tokens
                                     # Generate: openssl rand -hex 32
```

### Optional — action executor email routing

```env
RESEND_FROM_EMAIL="TrustStack <noreply@yourdomain.com>"
TRUSTSTACK_ADMIN_EMAIL=admin@yourcompany.com
TRUSTSTACK_REVIEWER_EMAIL=claims-review@yourcompany.com
```

Without `ANTHROPIC_API_KEY` the system runs in demo mode (deterministic placeholder scores). Without `RESEND_API_KEY` all analysis still works — emails are silently skipped and actions are marked `completed`. Without Shopify env vars the integration is simply disabled — core case processing is unaffected.

---

## API

### Case-based flow (async, recommended)

Analysis is **non-blocking**. `POST /api/cases/:id/analyze` returns `202 Accepted` immediately; the pipeline runs in the background. Poll for completion or receive the result via webhook.

```bash
# 1. Create a case
POST /api/cases
{ "claimType": "not_received", "description": "My package never arrived" }
→ { "caseId": "...", "ref": "TS-2026-A3F9" }

# 2. Attach evidence
POST /api/cases/:id/evidence
multipart: file (image) or JSON { "text": "...", "type": "text" }

# 3. Trigger analysis — returns 202 immediately
POST /api/cases/:id/analyze
→ 202 { "status": "processing", "caseId": "...", "pollUrl": "/api/cases/:id/status" }

# 4a. Poll for result
GET /api/cases/:id/status
→ { "status": "processing" }
→ { "status": "completed", "decisionRunId": "..." }
→ { "status": "failed",    "error": "..." }

# 4b. Or receive the result via webhook (see below)
```

If `POST /api/cases/:id/analyze` is called while a case is already `ANALYZING`, it returns `202` idempotently — no duplicate pipeline is started.

### Webhooks

Register an HTTPS endpoint to receive analysis results without polling:

```bash
# Register an endpoint
POST /api/webhooks
{ "url": "https://your-server.com/hooks", "events": ["analysis.completed", "analysis.failed"] }
→ 201 {
    "id": "...",
    "url": "...",
    "events": [...],
    "secret": "ts_whsec_...",   ← store this, shown only once
    "note": "Store this secret — it will not be shown again."
  }

# List registered endpoints
GET /api/webhooks
→ { "endpoints": [{ "id", "url", "events", "createdAt" }] }

# Remove an endpoint
DELETE /api/webhooks/:id
→ { "ok": true }
```

#### Webhook payload

Every delivery is a `POST` to your URL with:

```
Content-Type:            application/json
X-TrustStack-Event:      analysis.completed   (or analysis.failed)
X-TrustStack-Signature:  sha256=<hmac>
```

```jsonc
{
  "event": "analysis.completed",
  "caseId": "clx...",
  "timestamp": "2026-04-04T22:57:00.000Z",
  "data": { /* ClaimAnalysisResponse */ }
}
```

#### Verifying signatures

```typescript
import { createHmac } from "crypto";

function isValidSignature(rawBody: string, header: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return header === expected;
}
```

TrustStack retries once on non-2xx, with a 2 s delay. After two failures the delivery is dropped and the error is logged. Respond with `2xx` quickly — do your processing asynchronously.

#### Supported events

| Event | Fired when |
|-------|-----------|
| `analysis.completed` | Pipeline finished; decision is available |
| `analysis.failed` | Orchestrator threw before persisting a run |

### Legacy single-shot

```bash
POST /api/analyze/claim
multipart: file + claimText + optional policy fields
→ ClaimAnalysisResponse   (synchronous, waits for full pipeline)
```

### Standalone detection

```bash
POST /api/analyze/image   multipart: file
POST /api/analyze/text    JSON: { "text": "..." }
```

### API Keys & Settings

```bash
GET|POST|DELETE /api/keys             API key management
GET|PUT /api/settings/policy          Risk weights + routing thresholds + custom rules
```

### Shopify Integration

```bash
GET  /api/integrations/shopify           Connection status (shop, webhookCount, syncEnabled)
GET  /api/integrations/shopify/connect   Start OAuth — redirects to Shopify authorize
GET  /api/integrations/shopify/callback  OAuth callback — exchanges code, stores encrypted token
DELETE /api/integrations/shopify         Disconnect — deletes webhooks from Shopify + DB row
POST /api/webhooks/shopify               Shopify event receiver (orders/fulfilled, refunds/create)
                                          Verifies X-Shopify-Hmac-Sha256 header
```

The connect flow uses a signed state token (`HMAC(userId‖shop‖ts, SHOPIFY_CLIENT_SECRET)`) to prevent CSRF — no cookie or session required. Access tokens are stored encrypted at rest using AES-256-GCM (`ENCRYPTION_KEY`).

### Iterative evidence gathering

When a case is set to `AWAITING_EVIDENCE` (outcome `request_more_evidence`), `POST /api/cases/:id/evidence` automatically re-triggers analysis once new evidence is submitted. The pipeline runs up to **3 iterations**; on the 4th it force-escalates to human review. Evidence windows default to **72 hours**; claims past the window are auto-rejected.

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
