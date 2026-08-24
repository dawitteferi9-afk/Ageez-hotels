import type { NextConfig } from "next";

/**
 * Ageez Hotels — Next.js configuration.
 *
 * Kept intentionally minimal for M0. Do not add tenant-specific, hotel-specific,
 * or client-specific logic here — this file is reusable platform configuration only.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Remote patterns will be added when real image hosting (branding uploads,
    // room photos) is approved. Left empty deliberately in M0.
    remotePatterns: [],
  },
};

export default nextConfig;
