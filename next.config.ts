import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Autorise l'ouverture de `pnpm dev` depuis un téléphone sur le même Wi-Fi (http://<ip-du-pc>:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
