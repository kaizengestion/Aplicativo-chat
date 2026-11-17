import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servidor autónomo en .next/standalone para correr en Docker (deploy/); Vercel lo ignora.
  output: "standalone",
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
