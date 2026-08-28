# Guest-Facing Presentation Helpers

Pure, framework-agnostic functions that derive guest-facing visual
presentation (which dining-venue card to show, which service/facility
chip to render) from EXISTING `AiKnowledgeDocument` content — never a new
hotel fact, never a new database table or column. Each function only
ever renders a highlight when the underlying concept is actually present
in the live fetched content, so a highlight can never outlive the fact it
was derived from. See `knowledgeHighlights.ts`'s own module comment for
the full rationale (Guest Experience Enhancement, Phase C).
