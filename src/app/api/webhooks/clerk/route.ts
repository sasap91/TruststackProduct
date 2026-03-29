import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

type ClerkUserCreatedEvent = {
  type: string;
  data: {
    email_addresses: { email_address: string }[];
    first_name?: string;
  };
};

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;

  // Verify Svix signature if secret is configured
  if (secret) {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing svix headers." }, { status: 400 });
    }

    // Dynamic import to avoid edge runtime issues
    const { Webhook } = await import("svix");
    const body = await request.text();
    const wh = new Webhook(secret);

    try {
      wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    const event = JSON.parse(body) as ClerkUserCreatedEvent;
    await handleEvent(event);
  } else {
    const event = (await request.json()) as ClerkUserCreatedEvent;
    await handleEvent(event);
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: ClerkUserCreatedEvent) {
  if (event.type !== "user.created") return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const email = event.data.email_addresses[0]?.email_address;
  const name = event.data.first_name ?? "there";
  if (!email) return;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "TrustStack <hello@yourdomain.com>",
    to: email,
    subject: "Welcome to TrustStack",
    html: `
      <p>Hi ${name},</p>
      <p>Welcome to TrustStack — your 3-layer claim fraud detection console is ready.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard">Open your console →</a></p>
      <p>Questions? Just reply to this email.</p>
      <p>— The TrustStack team</p>
    `,
  });
}
