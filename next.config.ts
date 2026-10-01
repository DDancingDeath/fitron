import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Data import sends up to 5,000 CSV rows, and member documents up to 10 MB, to server actions.
    serverActions: { bodySizeLimit: "12mb" },
  },
  // The invoice PDF reads its font from disk; ship it with the server build.
  outputFileTracingIncludes: {
    "/invoices/[id]/pdf": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf", "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          // Browsers only honour this over HTTPS, so it is harmless in development.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
