# AI Knowledge Layer

Structured, versioned hotel knowledge (policies, amenities, FAQ-style facts)
that grounds the AI concierge, stored per-tenant so it can be swapped for a
future client without code changes. The AI must never fabricate policies,
prices, availability, or services — anything not present here or retrievable
via src/lib/ai/tools is out of bounds for the model to assert as fact.

Not implemented yet — scope is M6.
