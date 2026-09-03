"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";

/**
 * Multilingual Support Phase 2 — reached from `notFound()` calls inside
 * pages under `[locale]/(guest)/layout.tsx` (e.g. an unknown room id),
 * where that layout — and its `NextIntlClientProvider` — has already
 * rendered, so `useTranslations()` resolves normally. This is now a
 * Client Component (it was a Server Component before this pass) because
 * `useTranslations` requires one; nothing else about it changed. The
 * separate, untouched `src/app/not-found.tsx` (root, outside `[locale]`)
 * remains the fallback for the rarer case where `(guest)/layout.tsx`
 * itself 404s (an unrecognized/disabled locale segment) — no resolved
 * locale exists at that point, so that page stays English by necessity,
 * not by choice.
 */
export default function GuestNotFound() {
  const t = useTranslations("NotFound");

  return (
    <section className="py-24">
      <Container className="flex flex-col items-center gap-6 text-center">
        <h1 className="font-display text-4xl text-basalt-950">{t("heading")}</h1>
        <p className="text-basalt-700">{t("description")}</p>
        <Link href="/" className={buttonVariants()}>
          {t("backToHome")}
        </Link>
      </Container>
    </section>
  );
}
