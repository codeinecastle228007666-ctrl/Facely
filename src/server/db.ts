import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Auto-append pgbouncer flags when connecting via Supabase pooler.
 *
 * Vercel serverless functions spawn a new Prisma client per cold-start, and
 * the pooler (pgbouncer in transaction mode) caps connections aggressively.
 * Without pgbouncer=true, Prisma uses prepared-statement protocol which the
 * pooler doesn't support. Without connection_limit=1, you'll exhaust the
 * pooler quota (default 15) within seconds of traffic.
 */
function buildDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || "";
  // Already configured → leave alone (idempotent re-runs of `prisma generate`).
  if (url.includes("pgbouncer=") || !url.includes("pooler.supabase.com")) {
    return url;
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}pgbouncer=true&connection_limit=1`;
}

function createPrismaClient(): PrismaClient {
  const url = buildDatabaseUrl();
  return new PrismaClient({
    datasourceUrl: url,
    log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["query", "warn", "error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
