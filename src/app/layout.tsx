import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Ageez Hotels",
  description: "Ageez Hotels platform (M0 scaffold — no product pages implemented yet).",
};

/**
 * Root layout. Deliberately generic in M0: no Ageez Grand Hotel branding is
 * applied here. Per-hotel branding will be resolved from tenant data starting
 * in M2/M3 via src/lib/tenant, not hardcoded in this file.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body bg-parchment-50 text-basalt-950 antialiased">{children}</body>
    </html>
  );
}
