import { config } from "dotenv";
import path from "node:path";

/**
 * Integration tests need a real `DATABASE_URL` (and `AUTH_SECRET`, since
 * importing `@/lib/tenant` transitively imports `@/lib/auth`, which
 * constructs a `NextAuth()` instance at module load time). Unlike
 * `next dev`/`next build`, Vitest does not auto-load `.env.local` — the
 * same quirk already recorded for the Prisma CLI (see docs/DECISIONS.md,
 * project memory). This `setupFiles` module runs before each integration
 * test file's own imports are evaluated, so `process.env.DATABASE_URL`
 * is populated before `src/lib/db/client.ts` constructs its
 * `PrismaClient`.
 */
config({ path: path.resolve(__dirname, "../../.env.local") });
