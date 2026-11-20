import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-leaflet 5 cannot survive React 19 Strict Mode's dev-only double mount: the map is
  // removed and a stale instance re-used, which crashes with "reading 'appendChild'".
  reactStrictMode: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
