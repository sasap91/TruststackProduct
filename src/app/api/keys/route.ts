import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

// GET — list keys for the current user
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const keys = await db.apiKey.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsed: true },
  });

  return NextResponse.json({ keys });
}

// POST — create a new key
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { name?: string };
  const name = (body.name ?? "").trim() || "My API key";

  const raw = `ts_live_${randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 16);
  const keyHash = hashKey(raw);

  await db.apiKey.create({ data: { userId, name, keyHash, prefix } });

  // Return the full key ONCE — never stored in plaintext
  return NextResponse.json({ key: raw, prefix, name });
}

// DELETE — revoke a key by id
export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  await db.apiKey.updateMany({
    where: { id, userId },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}
