import type { NextConfig } from "next";

const gamesOrigin = new URL(
  process.env.GAMES_ORIGIN?.trim() || "http://localhost:4000",
).origin;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/play/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-src 'self' ${gamesOrigin};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
