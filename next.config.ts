import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3", "pg", "bcryptjs"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
