import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.GITHUB_ACTIONS === "true" ? "/amazon-ai-image-xmp-editor" : "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
