import type { Metadata } from "next";

/**
 * Multilingual Support Phase 5 — SEO closeout, §21 (security). Applies to
 * every route under `/management/*` (this layout wraps both the public
 * `login` page and the session-gated `(protected)` tree, since both live
 * under this same `src/app/management/` segment) — a second, independent
 * "never index this" signal alongside this route already being excluded
 * from `src/app/sitemap.ts` and (for `/management/*` specifically)
 * `src/app/robots.ts`'s disallow rule. Defense in depth, same principle
 * `middleware.ts`'s comment already documents for the auth gate itself:
 * don't rely on exactly one mechanism.
 *
 * This is metadata only — no auth/RBAC behavior lives here or changes
 * here. The real protection is still `middleware.ts` + `requireStaffAccess()`
 * (`src/lib/tenant/index.ts`), both untouched by this milestone.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
