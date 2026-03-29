import { createHash } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { db } from "./db";

/**
 * Resolves a userId from either a Clerk session cookie or a
 * `Authorization: Bearer ts_live_...` API key header.
 *
 * Returns null if neither is present or valid.
 */
export async function resolveUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ts_live_")) {
    const raw = authHeader.slice("Bearer ".length).trim();
    const keyHash = createHash("sha256").update(raw).digest("hex");

    const key = await db.apiKey.findUnique({
      where: { keyHash },
      select: { id: true, userId: true, active: true },
    });

    if (!key || !key.active) return null;

    // Update lastUsed in background — don't block the request
    db.apiKey.update({ where: { id: key.id }, data: { lastUsed: new Date() } }).catch(() => null);

    return key.userId;
  }

  // Fall back to Clerk session
  const { userId } = await auth();
  return userId ?? null;
}
