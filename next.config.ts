import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  images: {
    // Player headshots
    remotePatterns: [{ protocol: "https", hostname: "sleepercdn.com", pathname: "/content/nfl/players/**" }],
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
};

export default nextConfig;
