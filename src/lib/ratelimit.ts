import { db } from "./db";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 20;

/**
 * Records a usage event and returns true if the request is allowed,
 * false if the rate limit has been exceeded.
 */
export async function checkRateLimit(userId: string, endpoint: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000);

  const count = await db.usageRecord.count({
    where: {
      userId,
      createdAt: { gte: windowStart },
    },
  });

  if (count >= MAX_REQUESTS) return false;

  // Record this call (non-blocking — we don't await failures)
  db.usageRecord.create({ data: { userId, endpoint } }).catch(() => null);

  return true;
}

/** Count calls for a given user in the current calendar month. */
export async function monthlyUsageCount(userId: string): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  return db.usageRecord.count({
    where: { userId, createdAt: { gte: start } },
  });
}
