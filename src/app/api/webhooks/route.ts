/**
 * Webhook endpoint management — not to be confused with the Clerk webhook receiver.
 *
 * POST /api/webhooks — register a new delivery endpoint
 * GET  /api/webhooks — list the caller's active endpoints
 */

import { NextResponse } from "next/server";
import { auth }         from "@clerk/nextjs/server";
import { randomBytes }  from "crypto";
import { db }           from "@/lib/db";

export const runtime = "nodejs";

const VALID_EVENTS = new Set(["analysis.completed", "analysis.failed"]);

// GET — list active endpoints for the current user
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const endpoints = await db.webhookEndpoint.findMany({
    where:   { userId, active: true },
    orderBy: { createdAt: "desc" },
    select:  { id: true, url: true, events: true, createdAt: true },
  });

  return NextResponse.json({ endpoints });
}

// POST — create a new endpoint and return the signing secret once
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "url is required." }, { status: 422 });

  // Basic URL validation
  try { new URL(url); }
  catch { return NextResponse.json({ error: "url must be a valid HTTPS URL." }, { status: 422 }); }

  // events: array of known event names, or empty (= subscribe to all)
  const rawEvents = Array.isArray(body.events) ? body.events : [];
  const events: string[] = rawEvents
    .filter((e): e is string => typeof e === "string" && VALID_EVENTS.has(e));

  // Generate signing secret — returned ONCE, stored plaintext for HMAC signing
  const secret = `ts_whsec_${randomBytes(32).toString("hex")}`;

  const endpoint = await db.webhookEndpoint.create({
    data:   { userId, url, secret, events },
    select: { id: true, url: true, events: true, createdAt: true },
  });

  return NextResponse.json({
    ...endpoint,
    // Secret returned only at creation — never retrievable again
    secret,
    note: "Store this secret — it will not be shown again. Use it to verify X-TrustStack-Signature headers.",
  }, { status: 201 });
}
