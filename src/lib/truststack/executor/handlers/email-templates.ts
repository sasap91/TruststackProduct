/**
 * email-templates.ts
 *
 * Pure template functions — no I/O, no side effects.
 * Each returns { subject, html, text } given an ActionExecutorContext.
 */

import type { ActionExecutorContext } from "../action-executor";

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ?? "https://truststack.app";

const dashboardLink = (caseRef: string) =>
  `${appUrl()}/dashboard`;

const riskBadge = (level: string) => {
  const colours: Record<string, string> = {
    low:      "#16a34a",
    medium:   "#d97706",
    high:     "#dc2626",
    critical: "#7f1d1d",
  };
  return colours[level] ?? "#6b7280";
};

// ── Auto-refund ───────────────────────────────────────────────────────────────

export function autoRefundTemplate(ctx: ActionExecutorContext) {
  const subject = `[TrustStack] Claim ${ctx.caseRef} Approved — Refund Processing`;

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
  <h2 style="color:#16a34a;margin-top:0">Claim Approved</h2>
  <p>Your claim <strong>${ctx.caseRef}</strong> has been reviewed and approved.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 0;color:#6b7280">Case reference</td><td style="padding:6px 0"><strong>${ctx.caseRef}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Decision</td><td style="padding:6px 0"><span style="color:#16a34a;font-weight:600">Approved</span></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Risk level</td><td style="padding:6px 0"><span style="color:${riskBadge(ctx.riskLevel)}">${ctx.riskLevel.toUpperCase()}</span></td></tr>
  </table>
  <p>Your refund is being processed. Please allow 3–5 business days for it to appear in your account.</p>
  <p>If you have questions, reply to this email or <a href="${dashboardLink(ctx.caseRef)}">view your case in the dashboard</a>.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">TrustStack — Automated Claim Verification</p>
</div>`.trim();

  const text = [
    `Claim Approved — ${ctx.caseRef}`,
    ``,
    `Your claim has been reviewed and approved.`,
    `Case reference: ${ctx.caseRef}`,
    `Decision: Approved`,
    `Risk level: ${ctx.riskLevel.toUpperCase()}`,
    ``,
    `Your refund is being processed. Please allow 3–5 business days.`,
    ``,
    `Dashboard: ${dashboardLink(ctx.caseRef)}`,
  ].join("\n");

  return { subject, html, text };
}

// ── Auto-reject ───────────────────────────────────────────────────────────────

export function autoRejectTemplate(ctx: ActionExecutorContext) {
  const subject = `[TrustStack] Claim ${ctx.caseRef} Decision`;

  const rulesText = ctx.triggeredRules.length
    ? ctx.triggeredRules.map((r) => `<li>${r}</li>`).join("")
    : "<li>Insufficient supporting evidence</li>";

  const rulesPlain = ctx.triggeredRules.length
    ? ctx.triggeredRules.map((r) => `  - ${r}`).join("\n")
    : "  - Insufficient supporting evidence";

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
  <h2 style="color:#dc2626;margin-top:0">Claim Decision</h2>
  <p>After reviewing your claim <strong>${ctx.caseRef}</strong>, we were unable to approve it at this time.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 0;color:#6b7280">Case reference</td><td style="padding:6px 0"><strong>${ctx.caseRef}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Decision</td><td style="padding:6px 0"><span style="color:#dc2626;font-weight:600">Not approved</span></td></tr>
  </table>
  <p><strong>Reasons for this decision:</strong></p>
  <ul style="color:#374151">${rulesText}</ul>
  <p>If you believe this decision is incorrect, please contact our support team with additional documentation. Reference your case number <strong>${ctx.caseRef}</strong> in all correspondence.</p>
  <p><a href="${dashboardLink(ctx.caseRef)}">View case details</a></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">TrustStack — Automated Claim Verification</p>
</div>`.trim();

  const text = [
    `Claim Decision — ${ctx.caseRef}`,
    ``,
    `After reviewing your claim, we were unable to approve it at this time.`,
    `Case reference: ${ctx.caseRef}`,
    `Decision: Not approved`,
    ``,
    `Reasons for this decision:`,
    rulesPlain,
    ``,
    `If you believe this is incorrect, contact support with your case number: ${ctx.caseRef}`,
    ``,
    `Dashboard: ${dashboardLink(ctx.caseRef)}`,
  ].join("\n");

  return { subject, html, text };
}

// ── Human review ──────────────────────────────────────────────────────────────

export function humanReviewTemplate(ctx: ActionExecutorContext) {
  const subject = `[TrustStack] Case ${ctx.caseRef} Escalated for Review`;

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #f59e0b;border-radius:8px">
  <h2 style="color:#d97706;margin-top:0">Case Escalated for Review</h2>
  <p>Case <strong>${ctx.caseRef}</strong> has been routed to the human review queue.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 0;color:#6b7280">Case reference</td><td><strong>${ctx.caseRef}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Risk level</td><td><span style="color:${riskBadge(ctx.riskLevel)}">${ctx.riskLevel.toUpperCase()}</span></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Risk score</td><td>${Math.round(ctx.riskScore * 100)}%</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Evidence strength</td><td>${ctx.evidenceStrength}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Modalities</td><td>${ctx.modalitiesCovered.join(", ") || "—"}</td></tr>
  </table>
  ${ctx.triggeredRules.length ? `<p><strong>Triggered rules:</strong></p><ul>${ctx.triggeredRules.map((r) => `<li>${r}</li>`).join("")}</ul>` : ""}
  <p><a href="${dashboardLink(ctx.caseRef)}" style="background:#d97706;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">Review Case</a></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">TrustStack — Automated Claim Verification</p>
</div>`.trim();

  const text = [
    `[REVIEW REQUIRED] Case ${ctx.caseRef}`,
    ``,
    `Case has been routed to human review queue.`,
    `Risk level: ${ctx.riskLevel.toUpperCase()} (${Math.round(ctx.riskScore * 100)}%)`,
    `Evidence strength: ${ctx.evidenceStrength}`,
    ctx.triggeredRules.length ? `Triggered rules:\n${ctx.triggeredRules.map((r) => `  - ${r}`).join("\n")}` : "",
    ``,
    `Review: ${dashboardLink(ctx.caseRef)}`,
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}

// ── Request more evidence ─────────────────────────────────────────────────────

export function requestMoreEvidenceTemplate(ctx: ActionExecutorContext) {
  const subject = `[TrustStack] Additional Evidence Needed — Claim ${ctx.caseRef}`;

  const gaps = ctx.contradictions.length
    ? ctx.contradictions.map((c) => `<li>${c.description}</li>`).join("")
    : "<li>Supporting documentation for your claim</li><li>Photos or receipts related to the issue</li>";

  const gapsPlain = ctx.contradictions.length
    ? ctx.contradictions.map((c) => `  - ${c.description}`).join("\n")
    : "  - Supporting documentation\n  - Photos or receipts";

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
  <h2 style="color:#2563eb;margin-top:0">Additional Evidence Needed</h2>
  <p>We are reviewing your claim <strong>${ctx.caseRef}</strong> and need a little more information to proceed.</p>
  <p><strong>Please provide the following:</strong></p>
  <ol style="color:#374151">${gaps}</ol>
  <p>You can submit additional evidence by replying to this email or visiting the <a href="${dashboardLink(ctx.caseRef)}">case dashboard</a>.</p>
  <p>Please respond within <strong>7 days</strong> to avoid your claim being closed.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">TrustStack — Automated Claim Verification | Case ${ctx.caseRef}</p>
</div>`.trim();

  const text = [
    `Additional Evidence Needed — ${ctx.caseRef}`,
    ``,
    `We need more information to process your claim.`,
    ``,
    `Please provide:`,
    gapsPlain,
    ``,
    `Respond within 7 days. Submit via: ${dashboardLink(ctx.caseRef)}`,
  ].join("\n");

  return { subject, html, text };
}

// ── Block and flag ────────────────────────────────────────────────────────────

export function blockAndFlagTemplate(ctx: ActionExecutorContext) {
  const subject = `[TrustStack] FRAUD ALERT — Account Flagged — Case ${ctx.caseRef}`;

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:3px solid #dc2626;border-radius:8px">
  <h2 style="color:#dc2626;margin-top:0">⚠ Fraud Alert</h2>
  <p>Case <strong>${ctx.caseRef}</strong> has been flagged for fraud. The associated account has been blocked from submitting further claims.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 0;color:#6b7280">Case reference</td><td><strong>${ctx.caseRef}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Risk level</td><td><span style="color:#dc2626;font-weight:600">${ctx.riskLevel.toUpperCase()}</span></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Risk score</td><td>${Math.round(ctx.riskScore * 100)}%</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Evidence strength</td><td>${ctx.evidenceStrength}</td></tr>
  </table>
  ${ctx.triggeredRules.length ? `<p><strong>Triggered fraud rules:</strong></p><ul style="color:#dc2626">${ctx.triggeredRules.map((r) => `<li>${r}</li>`).join("")}</ul>` : ""}
  <p><a href="${dashboardLink(ctx.caseRef)}" style="background:#dc2626;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block">View Case</a></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
  <p style="color:#9ca3af;font-size:12px">TrustStack — Automated Fraud Detection</p>
</div>`.trim();

  const text = [
    `FRAUD ALERT — Case ${ctx.caseRef}`,
    ``,
    `Account flagged and blocked from further claims.`,
    `Risk level: ${ctx.riskLevel.toUpperCase()} (${Math.round(ctx.riskScore * 100)}%)`,
    `Evidence strength: ${ctx.evidenceStrength}`,
    ctx.triggeredRules.length ? `Fraud rules triggered:\n${ctx.triggeredRules.map((r) => `  - ${r}`).join("\n")}` : "",
    ``,
    `View case: ${dashboardLink(ctx.caseRef)}`,
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}
