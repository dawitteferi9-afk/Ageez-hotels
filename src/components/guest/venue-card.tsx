import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Guest Experience Enhancement — Phase C. A distinct visual identity for
 * one named dining venue (e.g. Axum Restaurant, Buna Lounge), rather than
 * every venue sharing one paragraph. `name`/`tagline` are supplied by the
 * caller, derived from the live `dining` `AiKnowledgeDocument` content
 * (`src/lib/guest/knowledgeHighlights.ts`) — nothing here is hardcoded
 * hotel data.
 *
 * IMAGE-READY (Phase C3): the hero block below is a fixed `aspect-[4/3]`
 * container so real photography (Phase G, not yet approved) can later
 * replace its children with a plain `<img src="..." alt={name}
 * className="h-full w-full object-cover" />` — no `next/image` (out of
 * this phase's approved scope) and no redesign of this card required.
 * Until then, an icon-on-gradient illustration honestly fills the same
 * space as a placeholder, never pretending to be a photograph.
 */
export function VenueCard({ name, tagline, icon: Icon }: { name: string; tagline: string; icon: LucideIcon }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-ochre-500/15 via-parchment-100 to-basalt-900/10">
        {/* IMAGE-READY SLOT — swap for a real <img> once photography exists. */}
        <Icon className="h-12 w-12 text-ochre-600/60" aria-hidden />
      </div>
      <CardContent className="flex flex-col gap-1.5 pt-5">
        <h3 className="font-display text-xl text-basalt-950">{name}</h3>
        <p className="text-sm text-basalt-700">{tagline}</p>
      </CardContent>
    </Card>
  );
}
