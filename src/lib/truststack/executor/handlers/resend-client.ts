/**
 * resend-client.ts
 *
 * Lazy Resend singleton. Returns null when RESEND_API_KEY is absent so callers
 * can degrade gracefully instead of throwing.
 */

import { Resend } from "resend";

let _resend: Resend | null | undefined;

function getResend(): Resend | null {
  if (_resend === undefined) {
    const key = process.env.RESEND_API_KEY;
    _resend = key ? new Resend(key) : null;
  }
  return _resend;
}

export type SendEmailParams = {
  to:       string | string[];
  subject:  string;
  html:     string;
  text:     string;
  from?:    string;
  replyTo?: string;
};

/**
 * Send an email via Resend.
 * Returns the message id on success, null when RESEND_API_KEY is absent.
 * Throws on Resend API errors so callers can record failures.
 */
export async function sendEmail(params: SendEmailParams): Promise<string | null> {
  const resend = getResend();
  if (!resend) return null;

  const from =
    params.from ??
    process.env.RESEND_FROM_EMAIL ??
    "TrustStack <onboarding@resend.dev>";

  const result = await resend.emails.send({
    from,
    to:      params.to,
    subject: params.subject,
    html:    params.html,
    text:    params.text,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  });

  if (result.error) {
    throw new Error(result.error.message ?? "Resend error");
  }

  return result.data?.id ?? null;
}
