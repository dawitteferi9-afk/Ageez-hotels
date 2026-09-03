import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";

export default function GuestNotFound() {
  return (
    <section className="py-24">
      <Container className="flex flex-col items-center gap-6 text-center">
        <h1 className="font-display text-4xl text-basalt-950">Page not found</h1>
        <p className="text-basalt-700">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/" className={buttonVariants()}>
          Back to Home
        </Link>
      </Container>
    </section>
  );
}
