"use client";

import Link from "next/link";

/**
 * M10 — root-level error boundary. Next.js requires `global-error.tsx` to
 * render its own complete `<html>`/`<body>` (a Client Component,
 * framework convention) because it fully replaces `src/app/layout.tsx`
 * when triggered — this only fires for an error thrown by the root
 * layout itself (font loading, a root-level crash), which is rare, but
 * without this file that failure mode fell through to Next.js's own
 * bare, unbranded default error page. Distinct from
 * `src/app/(guest)/error.tsx` and `src/app/management/(protected)/error.tsx`,
 * which already handle the much more common case (an error inside one of
 * those route groups) and are untouched by this file. Deliberately
 * inline-styled, not Tailwind classes: if the root layout itself failed,
 * global stylesheet loading is not something this boundary should
 * depend on.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#faf6ef",
          color: "#1c1a17",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: "28rem", margin: 0, color: "#4a4640" }}>
          We couldn&apos;t load this page. Please try again, or head back to the homepage.
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={reset}
            style={{
              height: "2.5rem",
              padding: "0 1.5rem",
              borderRadius: "0.25rem",
              border: "none",
              backgroundColor: "#c8862b",
              color: "#faf6ef",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
          <Link
            href="/"
            style={{
              height: "2.5rem",
              padding: "0 1.5rem",
              borderRadius: "0.25rem",
              border: "1px solid #1c1a17",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#1c1a17",
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Back to Home
          </Link>
        </div>
      </body>
    </html>
  );
}
