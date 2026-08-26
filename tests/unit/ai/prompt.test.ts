import { describe, it, expect } from "vitest";
import { buildAnonymousConciergeSystemPrompt } from "../../../src/lib/ai/prompt";

/**
 * M6a — the anonymous-tier system prompt builder. Pure function, no DB/
 * network — asserts tenant identity is correctly interpolated and that no
 * secret ever appears in the built prompt (docs/DECISIONS.md M6 design
 * §10: "no secrets in the prompt, ever").
 */

const HOTEL = {
  name: "Ageez Grand Hotel",
  city: "Addis Ababa",
  country: "Ethiopia",
  contactPhone: "+251-11-000-0000",
  contactEmail: "info@ageezgrandhotel.example",
};

describe("buildAnonymousConciergeSystemPrompt", () => {
  it("interpolates the tenant's own identity", () => {
    const prompt = buildAnonymousConciergeSystemPrompt(HOTEL);
    expect(prompt).toContain("Ageez Grand Hotel");
    expect(prompt).toContain("Addis Ababa");
    expect(prompt).toContain("Ethiopia");
  });

  it("includes contact info when provided", () => {
    const prompt = buildAnonymousConciergeSystemPrompt(HOTEL);
    expect(prompt).toContain("+251-11-000-0000");
    expect(prompt).toContain("info@ageezgrandhotel.example");
  });

  it("gracefully omits a contact suffix when neither phone nor email is provided", () => {
    const prompt = buildAnonymousConciergeSystemPrompt({
      name: "Some Hotel",
      city: "Nowhere",
      country: "Testland",
      contactPhone: null,
      contactEmail: null,
    });
    expect(prompt).not.toContain("null");
    expect(prompt).not.toMatch(/front desk at\s*[.,]/);
  });

  it("enforces grounding: instructs the model to use only the two anonymous-tier tools and never guess", () => {
    const prompt = buildAnonymousConciergeSystemPrompt(HOTEL);
    expect(prompt).toContain("getHotelKnowledge");
    expect(prompt).toContain("getRoomTypesSummary");
    expect(prompt.toLowerCase()).toContain("never guess");
  });

  it("never contains any secret-shaped value or env var reference", () => {
    const prompt = buildAnonymousConciergeSystemPrompt(HOTEL);
    expect(prompt).not.toMatch(/ANTHROPIC_API_KEY/i);
    expect(prompt).not.toMatch(/sk-ant-/i);
    expect(prompt).not.toContain(process.env.DATABASE_URL ?? "__no_db_url__");
  });

  it("is identical in shape for a second, differently-named hotel — no hardcoded tenant identity", () => {
    const promptA = buildAnonymousConciergeSystemPrompt(HOTEL);
    const promptB = buildAnonymousConciergeSystemPrompt({
      name: "Second Hotel",
      city: "Elsewhere",
      country: "Otherland",
      contactPhone: null,
      contactEmail: null,
    });
    expect(promptA).not.toContain("Second Hotel");
    expect(promptB).not.toContain("Ageez Grand Hotel");
    // Same structural rules present in both, just different identity data.
    expect(promptB).toContain("getHotelKnowledge");
  });
});
