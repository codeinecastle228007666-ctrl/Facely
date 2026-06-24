import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const rawUrl = process.env.DATABASE_URL || "";
const dbUrl = !rawUrl.includes("pgbouncer=true")
  ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1`
  : rawUrl;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: dbUrl });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
