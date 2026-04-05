# TrustStack Eval Benchmark — Baseline

Baseline scores established **2026-04-04** on commit `main`.

Run with: `npm run eval`

---

## Scores

| Metric    | Score  |
|-----------|--------|
| Precision | 100.0% |
| Recall    | 100.0% |
| F1        | 100.0% |
| Pass rate | 100% (20/20 fixtures) |

**Confusion matrix** (positive class = `reject` | `review`)

|                   | Predicted flagged | Predicted not-flagged |
|-------------------|:-----------------:|:---------------------:|
| **Actually flagged**     | TP = 15 | FN = 0 |
| **Actually not-flagged** | FP = 0  | TN = 5 |

**Outcome accuracy**

| Outcome | Correct | Total | Accuracy |
|---------|---------|-------|----------|
| approve | 5       | 5     | 100%     |
| review  | 11      | 11    | 100%     |
| reject  | 4       | 4     | 100%     |

---

## Fixture set (20 total)

### Clearly legitimate — approve (5)

| ID | Scenario |
|----|----------|
| `clear-damaged-strong-evidence` | Damaged laptop, photo + text agree, clean history |
| `legit-photo-proof-clean-account` | Damaged tablet, 0.82 image confidence, first claim |
| `legit-missing-package-in-transit` | Package in transit, not delivered, first claim |
| `legit-wrong-item-receipt-proof` | Wrong SKU received, receipt corroborates |
| `legit-damaged-item-timely-filing` | Shattered mug, timely, 0.76 image confidence |

### Obviously fraudulent — reject (4)

| ID | Trigger |
|----|---------|
| `fraud-carrier-delivered-repeat-no-receipt` | `reject_delivered_repeat_no_evidence` override — carrier scan + 4 prior claims + no receipt |
| `fraud-critical-manipulation-legal-language` | `reject_critical_multimodal_fraud` override — critical risk + 0.89 manipulation + scripted legal text |
| `fraud-auto-reject-signal-saturation` | Auto-reject threshold ≥ 0.88 — 8 prior claims + 0.82 refund rate + 0.92 manipulation |
| `fraud-copy-paste-scripted-template` | `reject_critical_multimodal_fraud` — 8 suspicious patterns + 0.78 manipulation |

> **Note:** `fraud-high-refund-late-weak-evidence` (very late + high refund + repeat) resolves to
> `review` rather than `reject` because the repeat claimant signal raises the fusion's evidence
> strength above the "weak/insufficient" threshold that `reject_refund_late_weak` requires.
> The outcome is still correctly classified as a TP (flagged).

### Ambiguous — review (6)

| ID | Reason |
|----|--------|
| `late-missing-weak-evidence` | Late + high refund + text-only |
| `contradictory-multimodal` | Strong text/image contradiction |
| `repeat-claimant-suspicious` | Repeat + manipulation + suspicious language |
| `document-invoice-mismatch` | Receipt shows ~$92; customer claims $500 |
| `fraud-high-refund-late-weak-evidence` | Very late + 75% refund rate + 4 prior claims |
| `ambiguous-mixed-borderline-signals` | Borderline damage confidence + repeat claimant |

### High-value escalations — review (5)

| ID | Escalation trigger |
|----|--------------------|
| `high-value-no-video` | `review_high_value_no_video_risk_account` — no video + high refund |
| `high-value-luxury-high-refund` | no video + refundRate=0.45 |
| `high-value-repeat-account` | no video + 4 prior claims |
| `high-value-electronics-contradiction` | Strong text/image contradiction + no video + high refund |
| `high-value-missing-item-high-refund` | Delivered but claimed missing + high refund + no video |

---

## What the benchmark measures

**Fraud detection framing**

The benchmark treats this as a binary classification problem:

- **Positive class (flagged):** outcome is `reject` or `review`
- **Negative class:** outcome is `approve` or `request_more_evidence`

This mirrors the real operating decision: does TrustStack correctly stop a fraudulent or
ambiguous claim from being auto-approved?

**What it does NOT measure**

- LLM judge reasoning quality (eval runs in demo mode — no Anthropic API calls)
- Latency or throughput
- Real image or document processing (scripted providers are used)
- Production edge cases (velocity signals from DB, Shopify order lookups)

---

## How to use this baseline

After making a change that could affect fraud detection (signal weights, policy rules, fusion
logic, agent thresholds), run `npm run eval` and compare the output against the scores above.

A regression is any drop in F1 below **100.0%** or pass rate below **100%**.

To add new fixtures, follow the pattern in
`src/lib/truststack/eval/fixtures/benchmark-fixtures.ts` and add them to `BENCHMARK_FIXTURES`.
The runner will pick them up automatically.

Results are written to `src/lib/truststack/eval/results/benchmark-results.json` — commit
this file after any intentional calibration change so the baseline stays in sync with the
fixture set.
