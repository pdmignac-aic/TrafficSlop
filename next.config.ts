import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to this project (TrafficSlop), not the parent folder that has an extra package-lock.json. */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Fixes: "multiple lockfiles" → Next picked ~/ as root and Turbopack broke / returned 500.
  turbopack: {
    root: projectRoot,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "webcams.nyctmc.org", pathname: "/**" }],
  },
};

export default nextConfig;
