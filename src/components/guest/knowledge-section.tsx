import { type LucideIcon } from "lucide-react";

/**
 * Renders one AiKnowledgeDocument as a titled content block. Reused across
 * Restaurant/Services/About/Contact — those pages are thin wrappers over
 * DB-sourced knowledge content, not hardcoded copy (docs/DECISIONS.md, M2).
 */
export function KnowledgeSection({
  title,
  content,
  icon: Icon,
}: {
  title: string;
  content: string | null;
  icon?: LucideIcon;
}) {
  if (!content) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-2xl text-basalt-950">
        {Icon && <Icon className="h-5 w-5 text-ochre-600" aria-hidden />}
        {title}
      </h2>
      <p className="max-w-2xl text-base leading-relaxed text-basalt-800">{content}</p>
    </section>
  );
}
