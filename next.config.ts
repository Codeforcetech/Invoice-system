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
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
