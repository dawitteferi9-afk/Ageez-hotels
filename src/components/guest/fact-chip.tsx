import type { LucideIcon } from "lucide-react";

/**
 * Guest Experience Enhancement — Phase C. A small, scannable "this hotel
 * has X" chip — used on the Services & Facilities page instead of one
 * long paragraph. `label` is always supplied by the caller, derived from
 * live `AiKnowledgeDocument` content (`src/lib/guest/knowledgeHighlights.ts`)
 * — never a hardcoded hotel capability.
 */
export function FactChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-basalt-700/15 bg-parchment-50 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-ochre-600" aria-hidden />
      <span className="text-sm font-medium text-basalt-900">{label}</span>
    </div>
  );
}
