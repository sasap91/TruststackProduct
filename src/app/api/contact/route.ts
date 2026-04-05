import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, email, company, message } = body as Record<string, string>;

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
  }

  // Store in database
  await db.contactInquiry.create({
    data: {
      name: name.trim(),
      email: email.trim(),
      company: company?.trim() || null,
      message: message.trim(),
    },
  });

  // Send email notification
  const resend = getResend();
  if (resend) {
    await resend.emails.send({
      from: "TrustStack <onboarding@resend.dev>",
      to: "sasakorn.kao@gmail.com",
      replyTo: email.trim(),
      subject: `New inquiry from ${name.trim()}${company?.trim() ? ` (${company.trim()})` : ""}`,
      text: [
        `Name: ${name.trim()}`,
        `Email: ${email.trim()}`,
        `Company: ${company?.trim() || "—"}`,
        ``,
        `Message:`,
        message.trim(),
        ``,
        `---`,
        `Sent via jointruststack.com contact form`,
      ].join("\n"),
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
