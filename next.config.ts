import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Erlaubt das Testen der UI im Dev- und Build-Modus auch bei externen unvollständigen Typen
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
