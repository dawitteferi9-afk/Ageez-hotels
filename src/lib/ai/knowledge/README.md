# AI Knowledge Layer

Structured, versioned hotel knowledge (policies, amenities, FAQ-style facts)
that grounds the AI concierge, stored per-tenant so it can be swapped for a
future client without code changes. The AI must never fabricate policies,
prices, availability, or services — anything not present here or retrievable
via src/lib/ai/tools is out of bounds for the model to assert as fact.

The knowledge itself is the existing `AiKnowledgeDocument` model (M1) — no
new storage was added here. **M6a** retrieves it via deterministic category
lookup (`src/lib/ai/tools/getHotelKnowledge.ts`), not search/RAG
(docs/DECISIONS.md M6 design §3/§9: "no embeddings, no vector database, no
RAG infrastructure" for v0.1's fixed, small category set).
