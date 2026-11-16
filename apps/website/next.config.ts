import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  deploymentId: process.env.DEPLOYMENT_VERSION,
  turbopack: {
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
