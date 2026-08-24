export { auth as middleware } from "@/lib/auth/edge";

/**
 * Scoped to `/management/*` only — the guest site and API routes are
 * untouched. This is a coarse "does a session exist" gate (see
 * `src/lib/auth/config.ts`'s `authorized()` callback), not the real
 * authorization boundary; Phase 3 enforces RBAC + tenant isolation
 * server-side on every protected read/mutation.
 */
export const config = {
  matcher: ["/management/:path*"],
};
