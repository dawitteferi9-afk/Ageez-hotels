/*
  Warnings:

  - Added the required column `passwordHash` to the `StaffUser` table without a default value. This is not possible if the table is not empty.

  Resolution: the 5 seeded StaffUser rows have no application-created
  passwords to preserve (StaffUser is only ever written by
  prisma/seed/index.ts, which upserts by email and immediately overwrites
  every row's passwordHash with a real bcrypt hash right after this
  migration runs — see docs/DECISIONS.md 2026-08-25 entry). Added nullable,
  backfilled with a placeholder that is never valid as a bcrypt hash (so it
  can never match any login attempt), then made required, rather than
  supplying a fabricated default password hash.
*/
-- AlterTable: add as nullable first
ALTER TABLE "StaffUser" ADD COLUMN "passwordHash" TEXT;

-- Backfill existing rows with a placeholder that cannot match any bcrypt
-- comparison (bcrypt hashes always start with "$2"); reseeding immediately
-- replaces this with a real hash for every row.
UPDATE "StaffUser" SET "passwordHash" = 'unset-pending-reseed' WHERE "passwordHash" IS NULL;

-- Now enforce NOT NULL
ALTER TABLE "StaffUser" ALTER COLUMN "passwordHash" SET NOT NULL;
