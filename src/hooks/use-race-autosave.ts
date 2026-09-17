"use client";

import { useEffect, useRef, useState } from "react";
import type { UpdateRaceInput } from "@/lib/race/types";

export type SaveStatus = "saved" | "saving" | "error";

const DEBOUNCE_MS = 500;
const RETRY_MS = 3000;

/** Enregistre automatiquement le plan dans le JSON de la course, dans l'ordre des modifications. */
export function useRaceAutosave(raceId: string, data: UpdateRaceInput): SaveStatus {
  const serialized = JSON.stringify(data);
  const [savedSerialized, setSavedSerialized] = useState(serialized);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (serialized === savedSerialized) return;

    const timer = setTimeout(
      () => {
        queue.current = queue.current.then(async () => {
          try {
            const response = await fetch(`/api/races/${raceId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: serialized,
              keepalive: true,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setFailedAttempts(0);
            setSavedSerialized(serialized);
          } catch {
            // Relance automatique tant que le serveur ne répond pas.
            setFailedAttempts((n) => n + 1);
          }
        });
      },
      failedAttempts > 0 ? RETRY_MS : DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [raceId, serialized, savedSerialized, failedAttempts]);

  // En quittant la page (lien interne), on envoie tout de suite une modification encore en attente.
  const pending = useRef({ serialized, savedSerialized });
  useEffect(() => {
    pending.current = { serialized, savedSerialized };
  });
  useEffect(
    () => () => {
      const { serialized: latest, savedSerialized: saved } = pending.current;
      if (latest === saved) return;
      void fetch(`/api/races/${raceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: latest,
        keepalive: true,
      });
    },
    [raceId],
  );

  const status: SaveStatus =
    serialized === savedSerialized ? "saved" : failedAttempts > 0 ? "error" : "saving";

  useEffect(() => {
    if (status === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  return status;
}
