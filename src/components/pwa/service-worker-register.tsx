"use client";

import { useEffect } from "react";

/** Enregistre le service worker (HTTPS ou localhost) pour que l'app marche sans réseau. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // Fichiers déjà chargés avant l'activation du service worker : on les lui confie.
        const urls = [
          location.href,
          ...performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((name) => name.startsWith(`${location.origin}/_next/static/`)),
        ];
        registration.active?.postMessage({ type: "CACHE_URLS", urls });
      })
      .catch(() => {
        // Sans service worker l'app fonctionne, mais pas hors-ligne.
      });
  }, []);

  return null;
}
