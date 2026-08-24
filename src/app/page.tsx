/**
 * Temporary M0 placeholder root page.
 *
 * This will be replaced in M2 with the real guest homepage (route group
 * src/app/(guest)/). It exists only so the scaffold has a renderable route
 * to verify the build/dev server wiring.
 */
export default function ScaffoldRootPage() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Ageez Hotels — v0.1 scaffold</h1>
      <p>
        Milestone M0 (Repository + Architecture) scaffold. No product features
        are implemented yet. See docs/V0.1_SCOPE.md and docs/DEMO_SCRIPT.md.
      </p>
    </main>
  );
}
