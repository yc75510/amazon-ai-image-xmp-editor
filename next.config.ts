import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.GITHUB_ACTIONS === "true" ? "/synthetic-performer-xmp-tool" : "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
