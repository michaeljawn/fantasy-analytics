import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  images: {
    remotePatterns: [
      // Player headshots
      { protocol: "https", hostname: "sleepercdn.com", pathname: "/content/nfl/players/**" },
      // League manager avatars: Sleeper's stock avatars and custom uploads
      { protocol: "https", hostname: "sleepercdn.com", pathname: "/avatars/**" },
      { protocol: "https", hostname: "sleepercdn.com", pathname: "/uploads/**" },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
};

export default nextConfig;
