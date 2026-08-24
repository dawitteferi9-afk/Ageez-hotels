import { Container } from "@/components/ui/container";

export default function BookRoomLoading() {
  return (
    <section className="py-16">
      <Container className="flex max-w-2xl flex-col gap-8 animate-pulse">
        <div className="h-4 w-40 rounded bg-basalt-700/10" />
        <div className="h-9 w-64 rounded bg-basalt-700/10" />
        <div className="flex flex-col gap-4">
          <div className="h-10 rounded bg-basalt-700/10" />
          <div className="h-10 rounded bg-basalt-700/10" />
          <div className="h-24 rounded bg-basalt-700/10" />
        </div>
      </Container>
    </section>
  );
}
