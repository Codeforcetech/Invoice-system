import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SEIQ_DEV_DIST || ".next",
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  outputFileTracingIncludes: {
    "/api/invoices/*/pdf": ["./assets/fonts/*.ttf"],
    "/api/accounting/export": ["./assets/fonts/*.ttf"],
    "/api/reports/export": ["./assets/fonts/*.ttf"],
  },
  async headers() {
    return [
      {
        // Public invoice links: not for search engines, never cached.
        source: "/share/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app only frames itself (the invoice preview). Nobody else may frame it.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
