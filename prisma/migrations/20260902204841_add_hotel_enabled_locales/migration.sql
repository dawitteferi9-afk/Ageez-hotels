-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "enabledLocales" TEXT[] DEFAULT ARRAY['en']::TEXT[];
