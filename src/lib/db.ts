import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Return a proxy that no-ops all calls when DB is not configured.
    // Lets the app boot without a database in development.
    return new Proxy({} as PrismaClient, {
      get: () =>
        new Proxy(() => Promise.resolve(null), {
          get: () => () => Promise.resolve(null),
          apply: () => Promise.resolve(null),
        }),
    });
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
