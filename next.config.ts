import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Data import sends up to 5,000 CSV rows, member documents up to 10 MB, and backup files
    // (Settings › Backup › Restore from file) up to 60 MB, to server actions.
    serverActions: { bodySizeLimit: "64mb" },
  },
  // The invoice PDF reads its font from disk; ship it with the server build.
  outputFileTracingIncludes: {
    "/invoices/[id]/pdf": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf", "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"],
  },
  // fitron.in itself is the static marketing site in public/site; the console lives under its own paths.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/site/index.html" },
        // The AI Trainer member app is a static page in public/trainer.
        { source: "/trainer", destination: "/trainer/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
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
