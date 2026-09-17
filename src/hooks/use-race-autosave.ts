"use client";

import { useEffect, useRef, useState } from "react";
import { updateLocalRace } from "@/lib/race/browser-store";
import type { UpdateRaceInput } from "@/lib/race/types";

export type SaveStatus = "saved" | "saving" | "error";

/** server = JSON sur le disque du PC (API locale) ; browser = stockage du téléphone (version en ligne). */
export type PersistenceMode = "server" | "browser";

const DEBOUNCE_MS = 500;
const RETRY_MS = 3000;

async function persist(mode: PersistenceMode, raceId: string, body: string, keepalive = false) {
  if (mode === "browser") {
    updateLocalRace(raceId, JSON.parse(body) as UpdateRaceInput);
    return;
  }
  const response = await fetch(`/api/races/${raceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Enregistre automatiquement le plan de la course, dans l'ordre des modifications. */
export function useRaceAutosave(
  raceId: string,
  data: UpdateRaceInput,
  mode: PersistenceMode = "server",
): SaveStatus {
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
            await persist(mode, raceId, serialized, true);
            setFailedAttempts(0);
            setSavedSerialized(serialized);
          } catch {
            // Relance automatique tant que l'enregistrement échoue.
            setFailedAttempts((n) => n + 1);
          }
        });
      },
      failedAttempts > 0 ? RETRY_MS : DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [mode, raceId, serialized, savedSerialized, failedAttempts]);

  // En quittant la page (lien interne), on envoie tout de suite une modification encore en attente.
  const pending = useRef({ serialized, savedSerialized });
  useEffect(() => {
    pending.current = { serialized, savedSerialized };
  });
  useEffect(
    () => () => {
      const { serialized: latest, savedSerialized: saved } = pending.current;
      if (latest !== saved) void persist(mode, raceId, latest, true).catch(() => undefined);
    },
    [mode, raceId],
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
