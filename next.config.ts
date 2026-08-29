import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: ["192.168.56.1"],
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
