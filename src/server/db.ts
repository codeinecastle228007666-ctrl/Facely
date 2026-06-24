import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Ensure pgbouncer mode for serverless (compatible with direct PG and pooler)
function getDbUrl(): string {
  const url = process.env.DATABASE_URL || "";
  const hasPgbouncer = url.includes("pgbouncer=true");
  if (hasPgbouncer) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}pgbouncer=true`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl: getDbUrl() });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
