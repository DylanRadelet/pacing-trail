"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { locateOnTrack, type TrackLocation } from "@/lib/race/locate";
import type { Track } from "@/lib/race/track";

export type GpsFix = TrackLocation & {
  /** Précision annoncée par le téléphone, en mètres. */
  accuracy: number;
  /** Heure de la mesure (ms). */
  timestamp: number;
};

/** Au-delà, la dernière position connue n'aide plus à départager les passages (boucle, aller-retour). */
const RECENT_MATCH_MS = 10 * 60 * 1000;

type Options = {
  enabled: boolean;
  track: Track;
  raceId: string;
  /** Distance où le plan prévoit d'être maintenant (si le chrono ou l'heure de départ sont connus). */
  planHint: () => number | null;
};

type LastMatch = { d: number; t: number };

const noopSubscribe = () => () => {};

function readLastMatch(key: string): LastMatch | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as LastMatch | null;
    return value && Number.isFinite(value.d) && Number.isFinite(value.t) ? value : null;
  } catch {
    return null;
  }
}

/** Suit la position GPS et la place sur le parcours. Ne fonctionne qu'en HTTPS (ou localhost). */
export function useGpsPosition({ enabled, track, raceId, planHint }: Options) {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const planHintRef = useRef(planHint);

  useEffect(() => {
    planHintRef.current = planHint;
  });

  // La géolocalisation du navigateur exige HTTPS (ou localhost).
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => window.isSecureContext && "geolocation" in navigator,
    () => true,
  );

  useEffect(() => {
    if (!enabled || !supported) return;

    const key = `pacing-run:gps-last:${raceId}`;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const last = readLastMatch(key);
        const hint =
          last && position.timestamp - last.t < RECENT_MATCH_MS ? last.d : planHintRef.current();
        const location = locateOnTrack(track, latitude, longitude, accuracy, hint);
        if (location.onTrack) {
          try {
            window.localStorage.setItem(key, JSON.stringify({ d: location.distance, t: position.timestamp }));
          } catch {
            // Sans stockage, seule la position courante sert d'indice.
          }
        }
        setError(null);
        setFix({ ...location, accuracy, timestamp: position.timestamp });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError("Localisation refusée : autorise-la pour ce site dans les réglages de Chrome.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Signal GPS indisponible, nouvel essai…");
        }
        // TIMEOUT : on continue simplement d'attendre un signal.
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, supported, track, raceId]);

  return {
    fix,
    error: enabled && !supported ? "GPS disponible uniquement sur la version en ligne (HTTPS)." : error,
  };
}
