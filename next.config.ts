import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs the minimal server from .next/standalone; `npm start` keeps the regular build.
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Keeps other sites from framing the Radar (clickjacking on Configurações).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
