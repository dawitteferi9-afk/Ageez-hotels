"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";

/**
 * Guest-site error boundary (Next.js convention — must be a Client
 * Component). Catches unexpected errors from any page or Server Action in
 * this route group (e.g. the M3 booking flow hitting an unreachable
 * database) so a guest sees a graceful message instead of the framework's
 * default error overlay.
 */
export default function GuestError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Errors");

  return (
    <section className="py-24">
      <Container className="flex flex-col items-center gap-6 text-center">
        <h1 className="font-display text-3xl text-basalt-950">{t("heading")}</h1>
        <p className="max-w-md text-basalt-700">{t("description")}</p>
        <div className="flex gap-3">
          <Button onClick={reset}>{t("tryAgain")}</Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {t("backToHome")}
          </Link>
        </div>
      </Container>
    </section>
  );
}
