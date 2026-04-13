# TrustStack — Claude Code Instructions

## Overview

TrustStack is a deterministic, multi-stage LLM pipeline for evaluating e-commerce dispute claims. It is built **alongside** the existing orchestrator — existing files must never be touched. Every evaluation runs at most 4 LLM calls in a fixed order. The policy engine is pure TypeScript and makes all final decisions; no LLM ever decides approve or reject.

---

## Golden Rule

> **Never use an LLM to decide approve/reject. Never modify existing orchestrator files. Never add agent frameworks.**

---

## 4 Fixed LLM Calls

| Step | Function             | Model                       | Returns             | Runs when                        |
|------|----------------------|-----------------------------|---------------------|----------------------------------|
| 1    | `classify_claim()`   | `claude-haiku-4-5-20251001` | `ClassifierOutput`  | Always                           |
| 2    | `extract_visual()`   | `claude-opus-4-6`           | `VisualSignals`     | Skip if no photos; skip if claim type is `never_arrived` or `chargeback` |
| 3    | `extract_text()`     | `claude-haiku-4-5-20251001` | `TextSignals`       | Always                           |
| 4    | `check_consistency()`| `claude-sonnet-4-6`         | `ConsistencySignals`| Always                           |

**Execution order:**
1. `classify_claim()` runs first (Step 1).
2. `extract_visual()` and `extract_text()` run **in parallel** via `Promise.all()` (Steps 2 & 3).
3. `check_consistency()` runs after Steps 2 & 3 complete (Step 4).

---

## 8 Claim Types

```typescript
enum ClaimType {
  low_quality_product    = "low_quality_product",
  counterfeit_product    = "counterfeit_product",
  never_arrived          = "never_arrived",
  wrong_item             = "wrong_item",
  damaged_in_transit     = "damaged_in_transit",
  warranty_dispute       = "warranty_dispute",
  chargeback             = "chargeback",
  marketplace_seller     = "marketplace_seller",
}
```

`never_arrived` and `chargeback` always skip `extract_visual()` — no photos are expected for these claim types.

---

## Files to Create

Do **not** modify any existing file. Create only the files listed below.

```
src/lib/truststack/pipeline/index.ts          — Pipeline orchestrator
src/lib/truststack/pipeline/classifier.ts     — classify_claim() LLM call
src/lib/truststack/pipeline/visual.ts         — extract_visual() LLM call
src/lib/truststack/pipeline/text.ts           — extract_text() LLM call
src/lib/truststack/pipeline/consistency.ts    — check_consistency() LLM call
src/lib/truststack/pipeline/doc-parser.ts     — Evidence document parser (no LLM)
src/lib/truststack/pipeline/policy-engine.ts  — Pure TypeScript policy engine
src/lib/truststack/pipeline/signal-merge.ts   — Merges all signals before policy run
src/lib/truststack/pipeline/audit.ts          — Immutable audit log writer
src/lib/truststack/types/claim.ts             — ClaimType enum + input types
src/lib/truststack/types/signals.ts           — All signal interfaces
src/lib/truststack/types/decision.ts          — Decision + audit types
src/lib/truststack/rules/base-rules.ts        — HARD, FRAUD, ELIG, POLICY rules
src/lib/truststack/rules/retailer-rules.ts    — Per-retailer rule overrides
src/app/api/pipeline/route.ts                 — Next.js API endpoint (POST)
```

---

## Type Definitions

### `src/lib/truststack/types/claim.ts`

```typescript
export enum ClaimType {
  low_quality_product = "low_quality_product",
  counterfeit_product = "counterfeit_product",
  never_arrived       = "never_arrived",
  wrong_item          = "wrong_item",
  damaged_in_transit  = "damaged_in_transit",
  warranty_dispute    = "warranty_dispute",
  chargeback          = "chargeback",
  marketplace_seller  = "marketplace_seller",
}

export interface ClaimInput {
  claimId: string;
  retailerId: string;
  customerId: string;
  orderDate: string;         // ISO 8601
  claimDate: string;         // ISO 8601
  orderValue: number;        // In minor currency units (e.g. cents)
  currency: string;          // ISO 4217
  productTitle: string;
  productSku: string;
  claimDescription: string;
  evidenceUrls: string[];    // May be empty
  photoUrls: string[];       // May be empty
  metadata: Record<string, string>;
}

export interface ClassifierOutput {
  claimType: ClaimType;
  confidence: number;        // 0.0–1.0
  reasoning: string;
}
```

### `src/lib/truststack/types/signals.ts`

```typescript
export interface VisualSignals {
  skipped: boolean;          // true when extract_visual was not called
  aiGeneratedPhotoDetected: boolean;
  photoMatchesDescription: boolean | null;
  damageVisible: boolean | null;
  suspiciousElements: string[];
  rawAssessment: string;
}

export interface TextSignals {
  claimsConsistentWithType: boolean;
  timelineAnomaly: boolean;
  highValueLanguage: boolean;       // "urgent", "lawyer", "lawsuit", etc.
  evidenceDocumentsPresent: boolean;
  parsedDocuments: ParsedDocument[];
  redFlags: string[];
}

export interface ParsedDocument {
  url: string;
  docType: "receipt" | "tracking" | "photo" | "correspondence" | "other";
  extractedText: string;
  anomalies: string[];
}

export interface ConsistencySignals {
  score: number;             // 0.0–1.0
  crossSignalConflicts: string[];
  timelineConsistent: boolean;
  narrativeCoherent: boolean;
  rawAssessment: string;
}

export interface MergedSignals {
  classifier: import("./claim").ClassifierOutput;
  visual: VisualSignals;
  text: TextSignals;
  consistency: ConsistencySignals;
}
```

### `src/lib/truststack/types/decision.ts`

```typescript
export type DecisionOutcome = "approve" | "approve_flagged" | "reject";

export interface TriggeredRule {
  ruleId: string;
  ruleName: string;
  severity: "hard" | "fraud" | "eligibility" | "policy";
  outcome: DecisionOutcome;
  details: string;
}

export interface PolicyDecision {
  claimId: string;
  outcome: DecisionOutcome;
  fraudScore: number;        // 0–100, additive from FRAUD rules
  triggeredRules: TriggeredRule[];
  requiredActions: string[];
  timestamp: string;         // ISO 8601
}

export interface AuditRecord {
  claimId: string;
  input: import("./claim").ClaimInput;
  classifierOutput: import("./claim").ClassifierOutput;
  visualSignals: VisualSignals;
  textSignals: TextSignals;
  consistencySignals: ConsistencySignals;
  decision: PolicyDecision;
  pipelineDurationMs: number;
  modelVersions: {
    classifier: string;
    visual: string | null;
    text: string;
    consistency: string;
  };
}
```

---

## Policy Engine

`policy-engine.ts` is a **pure synchronous TypeScript function**. No async, no LLM calls, no external I/O, no randomness. Deterministic given the same inputs.

```typescript
export function runPolicyEngine(
  input: ClaimInput,
  signals: MergedSignals,
  retailerRules: RetailerRuleSet
): PolicyDecision
```

### Rule Evaluation Order

Rules evaluate in this fixed order. Hard rules short-circuit — if any HARD rule triggers, evaluation stops and the outcome is `reject` immediately.

1. HARD rules (short-circuit on first match → `reject`)
2. ELIG rules (all evaluated; any fail → `reject`)
3. FRAUD rules (all evaluated; additive score)
4. POLICY rules (all evaluated; outcome based on score + flags)

### Final Outcome Logic (after all rules run)

```
if any HARD or ELIG rule triggered → reject
else if fraudScore >= 60           → reject
else if fraudScore >= 30           → approve_flagged
else                               → approve
```

---

## Hard Reject Rules

These rules produce an immediate `reject` and stop evaluation.

### HARD_001 — AI-Generated Photo Detected
- **ID:** `HARD_001`
- **Condition:** `signals.visual.aiGeneratedPhotoDetected === true`
- **Outcome:** `reject`
- **Details:** AI-generated photo detected in evidence. Claim is fraudulent.

### HARD_002 — Consistency Score Below Floor
- **ID:** `HARD_002`
- **Condition:** `signals.consistency.score < 0.20`
- **Outcome:** `reject`
- **Details:** Consistency score below minimum threshold (0.20). Narrative is incoherent.

---

## Fraud Rules (Additive Score)

Each triggered FRAUD rule adds its weight to `fraudScore`. Rules do not short-circuit.

### FRAUD_001 — Timeline Anomaly (+25)
- **ID:** `FRAUD_001`
- **Weight:** `+25`
- **Condition:** `signals.text.timelineAnomaly === true`
- **Details:** Claim timeline contains anomalies inconsistent with reported event.

### FRAUD_002 — High-Value Language (+15)
- **ID:** `FRAUD_002`
- **Weight:** `+15`
- **Condition:** `signals.text.highValueLanguage === true`
- **Details:** Language pattern associated with coached or escalated fraud claims.

### FRAUD_003 — Cross-Signal Conflicts (+20 per conflict, max +40)
- **ID:** `FRAUD_003`
- **Weight:** `+20` per entry in `signals.consistency.crossSignalConflicts`, capped at `+40`
- **Condition:** `signals.consistency.crossSignalConflicts.length > 0`
- **Details:** Conflicts between visual, text, and classifier signals.

### FRAUD_004 — Photo Does Not Match Description (+30)
- **ID:** `FRAUD_004`
- **Weight:** `+30`
- **Condition:** `signals.visual.skipped === false && signals.visual.photoMatchesDescription === false`
- **Details:** Submitted photos do not match the claimed product or damage.

### FRAUD_005 — Suspicious Visual Elements (+20)
- **ID:** `FRAUD_005`
- **Weight:** `+20`
- **Condition:** `signals.visual.skipped === false && signals.visual.suspiciousElements.length > 0`
- **Details:** Visual analysis flagged suspicious elements in submitted photos.

---

## Eligibility Rules

These rules produce `reject` if failed. All are evaluated (no short-circuit among themselves, but they feed into the final reject check).

### ELIG_001 — Return Window
- **ID:** `ELIG_001`
- **Condition:** Days between `input.orderDate` and `input.claimDate` > retailer return window (default 30 days)
- **Outcome on fail:** `reject`
- **Details:** Claim filed outside the eligible return window.

### ELIG_002 — Value Limit
- **ID:** `ELIG_002`
- **Condition:** `input.orderValue` > retailer max claim value (default 50000 minor units)
- **Outcome on fail:** `reject`
- **Details:** Order value exceeds maximum eligible claim amount for this retailer tier.

### ELIG_003 — Classifier Confidence Too Low
- **ID:** `ELIG_003`
- **Condition:** `signals.classifier.confidence < 0.40`
- **Outcome on fail:** `reject`
- **Details:** Classifier confidence too low to proceed. Claim requires manual triage.

### ELIG_004 — Claim Type Mismatch
- **ID:** `ELIG_004`
- **Condition:** Claim type returned by classifier differs from the type declared in input metadata (if provided)
- **Outcome on fail:** `reject`
- **Details:** Declared claim type does not match classifier output.

---

## Policy Rules

Evaluated after ELIG rules. These inform outcome but do not hard-reject by themselves — they contribute to `requiredActions` and can push into `approve_flagged`.

### POLICY_001 — Return Window Advisory
- **ID:** `POLICY_001`
- **Condition:** Days since order date > 14 but ≤ 30 (approaching window close)
- **Action:** Add `"verify_return_window"` to `requiredActions`

### POLICY_002 — High-Value Claim Advisory
- **ID:** `POLICY_002`
- **Condition:** `input.orderValue` > 20000 minor units (default threshold)
- **Action:** Add `"escalate_value_review"` to `requiredActions`

---

## Retailer Rule Overrides

`retailer-rules.ts` exports a `RetailerRuleSet` interface and a `getRetailerRules(retailerId: string): RetailerRuleSet` function. Retailers can override:

```typescript
export interface RetailerRuleSet {
  retailerId: string;
  returnWindowDays: number;         // Default: 30
  maxClaimValueMinorUnits: number;  // Default: 50000
  policyValueThresholdMinorUnits: number; // Default: 20000
  disabledRules: string[];          // Rule IDs to skip
}
```

If no retailer config exists, use defaults.

---

## Build Order — Tasks 1–13

Build in strict order. No task begins until the prior task passes.

| #  | Task                    | Deliverable                                                                 |
|----|-------------------------|-----------------------------------------------------------------------------|
| 1  | Types                   | `types/claim.ts`, `types/signals.ts`, `types/decision.ts` — zero `any`     |
| 2  | Policy engine           | `pipeline/policy-engine.ts` — pure function, all rules, no LLM             |
| 3  | Policy unit tests       | `tests/policy/` — one file per rule group, table-driven, no network         |
| 4  | Doc parser              | `pipeline/doc-parser.ts` — parses evidence URLs, returns `ParsedDocument[]` |
| 5  | Base rules              | `rules/base-rules.ts` — HARD, FRAUD, ELIG, POLICY constants + evaluators   |
| 6  | Retailer rules          | `rules/retailer-rules.ts` — `RetailerRuleSet` + `getRetailerRules()`       |
| 7  | Classifier              | `pipeline/classifier.ts` — `classify_claim()` using Haiku                  |
| 8  | Visual                  | `pipeline/visual.ts` — `extract_visual()` using Opus, handles skip logic   |
| 9  | Text                    | `pipeline/text.ts` — `extract_text()` using Haiku                          |
| 10 | Consistency             | `pipeline/consistency.ts` — `check_consistency()` using Sonnet             |
| 11 | Signal merge            | `pipeline/signal-merge.ts` — assembles `MergedSignals` from all outputs    |
| 12 | Audit                   | `pipeline/audit.ts` — writes immutable `AuditRecord`                       |
| 13 | Pipeline orchestrator   | `pipeline/index.ts` — wires all steps, runs parallel Promise.all()         |
| 14 | API endpoint            | `src/app/api/pipeline/route.ts` — POST handler, validates input, returns decision |
| 15 | Integration tests       | `tests/integration/` — fixture-based, recorded LLM responses, no live calls |

---

## What Never to Do

- **Never use an LLM to decide approve/reject.** The policy engine is pure TypeScript. LLMs only return signal structs.
- **Never modify existing orchestrator files.** TrustStack is additive. All new code lives under `src/lib/truststack/` and `src/app/api/pipeline/`.
- **Never add agent frameworks, tool-use loops, or multi-agent orchestration.** This is a deterministic linear pipeline.
- **Never skip a required LLM call** (except `extract_visual` for `never_arrived`, `chargeback`, or when no photos are present).
- **Never merge two LLM steps into one call.** Each step has a dedicated model, prompt, and return type.
- **Never use `any` in TypeScript.** Every value must have an explicit type from the types directory.
- **Never hardcode model IDs outside the pipeline step files.** Model IDs live in their respective `pipeline/*.ts` files.
- **Never make the policy engine async.** It is a synchronous pure function.
- **Never add a new rule without a rule ID** in the `HARD_NNN`, `FRAUD_NNN`, `ELIG_NNN`, or `POLICY_NNN` format.
- **Never renumber existing rule IDs.**
- **Never ship without unit tests for every policy rule** (Task 3) passing before moving to Task 4.
