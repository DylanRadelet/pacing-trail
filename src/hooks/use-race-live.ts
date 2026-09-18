"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// État « jour de course » gardé dans le navigateur : survit à un rechargement de la page en pleine course.
const CHANGE_EVENT = "pacing-run:live-changed";
const GPS_KEY = "pacing-run:gps-on";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : l'état reste valable jusqu'au rechargement.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** GPS activé ou non ; retenu pour repartir tout seul si la page se recharge. */
export function useGpsEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, () => read(GPS_KEY) === "1", () => false);
  return [enabled, (value) => write(GPS_KEY, value ? "1" : null)];
}

/** Top départ (heure en ms) de la course, retenu par course. */
export function useRaceChrono(raceId: string) {
  const key = `pacing-run:chrono:${raceId}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const start = raw === null ? null : Number(raw);
  return {
    start: start !== null && Number.isFinite(start) ? start : null,
    startNow: () => write(key, String(Date.now())),
    reset: () => write(key, null),
  };
}

/** Heure courante rafraîchie régulièrement (0 avant l'hydratation). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
