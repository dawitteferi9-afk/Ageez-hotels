import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient singleton.
 *
 * Next.js dev mode hot-reloads modules on every change; without caching the
 * client on `globalThis`, each reload would open a new DB connection pool
 * and eventually exhaust available connections. This is the standard
 * pattern for Prisma + Next.js.
 *
 * Nothing outside `src/lib/db` and `src/lib/tenant` should import this
 * directly — route handlers, server components, and AI tools go through
 * `src/lib/tenant` (see docs/ARCHITECTURE.md, docs/SECURITY.md).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
