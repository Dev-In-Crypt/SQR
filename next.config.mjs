import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingRoot: __dirname,
  distDir: process.env.SQR_NEXT_DIST_DIR || ".next",
  typescript: {
    tsconfigPath: process.env.SQR_NEXT_TSCONFIG || "tsconfig.json"
  }
};

export default nextConfig;
