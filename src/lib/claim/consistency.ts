import type { ClaimMetadata, Signal } from "@/lib/detection/types";

/**
 * Layer 2: Signal Fusion Engine.
 *
 * Each modality agent produces a raw detection score. This engine converts
 * those scores + claim metadata into a normalized set of Signals and a
 * 0–1 inconsistency score.
 *
 * Signals are the ONLY output from this layer. The policy engine (Layer 3)
 * must consume signals exclusively — never raw scores.
 */
export function buildSignals(
  imageAiProb: number,
  textAiProb: number,
  claimText: string,
  meta: ClaimMetadata,
): { signals: Signal[]; consistencyScore: number } {
  const signals: Signal[] = [];
  let riskPoints = 0;
  let maxPoints = 0;

  // ── Signal: Image authenticity ────────────────────────────────────────────
  maxPoints += 3;
  if (imageAiProb >= 0.75) {
    riskPoints += 3;
    signals.push({
      key: "image_authenticity",
      name: "Image authenticity",
      value: `${Math.round(imageAiProb * 100)}% AI-generated likelihood`,
      flag: "risk",
      weight: "high",
      score: imageAiProb,
      detail: "Image shows strong indicators of synthetic generation.",
    });
  } else if (imageAiProb >= 0.45) {
    riskPoints += 1;
    signals.push({
      key: "image_authenticity",
      name: "Image authenticity",
      value: `${Math.round(imageAiProb * 100)}% AI-generated likelihood`,
      flag: "neutral",
      weight: "high",
      score: imageAiProb,
      detail: "Image shows some synthetic generation indicators.",
    });
  } else {
    signals.push({
      key: "image_authenticity",
      name: "Image authenticity",
      value: `${Math.round(imageAiProb * 100)}% AI-generated likelihood`,
      flag: "clean",
      weight: "high",
      score: imageAiProb,
      detail: "Image appears consistent with real photography.",
    });
  }

  // ── Signal: Claim text authenticity ──────────────────────────────────────
  maxPoints += 2;
  if (textAiProb >= 0.75) {
    riskPoints += 2;
    signals.push({
      key: "text_authenticity",
      name: "Claim text authenticity",
      value: `${Math.round(textAiProb * 100)}% AI-generated likelihood`,
      flag: "risk",
      weight: "medium",
      score: textAiProb,
      detail: "Claim language patterns suggest machine-generated copy.",
    });
  } else if (textAiProb >= 0.45) {
    riskPoints += 1;
    signals.push({
      key: "text_authenticity",
      name: "Claim text authenticity",
      value: `${Math.round(textAiProb * 100)}% AI-generated likelihood`,
      flag: "neutral",
      weight: "medium",
      score: textAiProb,
    });
  } else {
    signals.push({
      key: "text_authenticity",
      name: "Claim text authenticity",
      value: `${Math.round(textAiProb * 100)}% AI-generated likelihood`,
      flag: "clean",
      weight: "medium",
      score: textAiProb,
    });
  }

  // ── Signal: Logistics vs claim conflict ───────────────────────────────────
  const isDamageClaim =
    meta.claimType === "damaged_item" ||
    /damage|broken|crack|shatter|dent|scratch/i.test(claimText);

  if (meta.deliveryStatus) {
    maxPoints += 3;
    if (meta.deliveryStatus === "delivered_intact" && isDamageClaim) {
      riskPoints += 3;
      signals.push({
        key: "logistics_conflict",
        name: "Logistics vs claim conflict",
        value: "Delivered intact — damage claimed",
        flag: "risk",
        weight: "high",
        detail:
          "Logistics partner reported no damage on delivery, contradicting the damage claim.",
      });
    } else if (
      meta.deliveryStatus === "not_delivered" &&
      meta.claimType === "not_received"
    ) {
      signals.push({
        key: "logistics_consistency",
        name: "Logistics consistency",
        value: "Delivery status matches claim",
        flag: "clean",
        weight: "high",
      });
    } else if (meta.deliveryStatus === "unknown") {
      signals.push({
        key: "logistics_status",
        name: "Logistics status",
        value: "Delivery status unavailable",
        flag: "neutral",
        weight: "medium",
        detail: "No delivery scan data available to cross-check claim.",
      });
    } else {
      signals.push({
        key: "logistics_consistency",
        name: "Logistics consistency",
        value: "Delivery status consistent with claim",
        flag: "clean",
        weight: "high",
      });
    }
  }

  // ── Signal: Claim timeliness ──────────────────────────────────────────────
  if (meta.claimAgeHours !== undefined) {
    maxPoints += 2;
    if (meta.claimAgeHours > 48) {
      riskPoints += 2;
      signals.push({
        key: "claim_timeliness",
        name: "Claim timeliness",
        value: `Filed ${meta.claimAgeHours}h after incident`,
        flag: "risk",
        weight: "medium",
        score: meta.claimAgeHours,
        detail: "Policy requires damage to be reported within 48 hours.",
      });
    } else {
      signals.push({
        key: "claim_timeliness",
        name: "Claim timeliness",
        value: `Filed ${meta.claimAgeHours}h after incident`,
        flag: "clean",
        weight: "low",
        score: meta.claimAgeHours,
      });
    }
  }

  // ── Signal: Customer refund history ──────────────────────────────────────
  if (meta.refundRate !== undefined) {
    maxPoints += 2;
    if (meta.refundRate >= 0.4) {
      riskPoints += 2;
      signals.push({
        key: "refund_history",
        name: "Customer refund history",
        value: `${Math.round(meta.refundRate * 100)}% refund rate`,
        flag: "risk",
        weight: "medium",
        score: meta.refundRate,
        detail: "Unusually high historical refund rate for this account.",
      });
    } else if (meta.refundRate >= 0.2) {
      riskPoints += 1;
      signals.push({
        key: "refund_history",
        name: "Customer refund history",
        value: `${Math.round(meta.refundRate * 100)}% refund rate`,
        flag: "neutral",
        weight: "low",
        score: meta.refundRate,
      });
    } else {
      signals.push({
        key: "refund_history",
        name: "Customer refund history",
        value: `${Math.round(meta.refundRate * 100)}% refund rate`,
        flag: "clean",
        weight: "low",
        score: meta.refundRate,
      });
    }
  }

  // ── Signal: Evidence quality (high-value) ─────────────────────────────────
  if (meta.highValue) {
    maxPoints += 2;
    if (!meta.hasVideoProof) {
      riskPoints += 1;
      signals.push({
        key: "evidence_quality",
        name: "Evidence quality",
        value: "High-value item — no video proof",
        flag: "neutral",
        weight: "medium",
        detail: "Policy requires video evidence for high-value item claims.",
      });
    } else {
      signals.push({
        key: "evidence_quality",
        name: "Evidence quality",
        value: "High-value item — video proof provided",
        flag: "clean",
        weight: "medium",
      });
    }
  }

  const consistencyScore = maxPoints > 0 ? riskPoints / maxPoints : 0;

  return { signals, consistencyScore };
}

/** Convenience: look up a signal's raw score by its stable key. */
export function getSignalScore(signals: Signal[], key: string): number | undefined {
  return signals.find((s) => s.key === key)?.score;
}

/** Convenience: look up a signal's flag by its stable key. */
export function getSignalFlag(signals: Signal[], key: string) {
  return signals.find((s) => s.key === key)?.flag;
}
