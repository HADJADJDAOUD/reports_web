import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow browser preview during development
  allowedDevOrigins: ["127.0.0.1"],
  // pdfkit ships its own font/AFM data loading and must not be bundled by webpack.
  serverExternalPackages: ["pdfkit"],
  // The PDF renderer reads TTF files from assets/fonts at runtime, so they have to
  // travel with the serverless function bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/reports/[id]/export": ["./assets/fonts/**"],
  },
};

export default nextConfig;
