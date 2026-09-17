import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Autorise l'ouverture de `pnpm dev` depuis un téléphone sur le même Wi-Fi (http://<ip-du-pc>:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  async headers() {
    return [
      {
        // Le service worker doit toujours être relu pour que les mises à jour arrivent sur le téléphone.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
