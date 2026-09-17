"use client";

import { useEffect } from "react";

/** Garde l'écran allumé tant que le composant est affiché (HTTPS ou localhost uniquement). */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (disposed) void sentinel.release();
        else lock = sentinel;
      } catch {
        // Refusé (batterie faible, contexte non sécurisé) : l'écran se mettra en veille normalement.
      }
    };

    // Le verrou est perdu quand l'onglet passe en arrière-plan : on le reprend au retour.
    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, []);
}
