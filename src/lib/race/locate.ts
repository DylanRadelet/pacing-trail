import { nearestOnTrack, trackPassesNear, type Track, type TrackPoint2D } from "./track";

export type TrackLocation = {
  /** Distance le long du parcours, en mètres. */
  distance: number;
  /** Écart entre la position GPS et la trace, en mètres. */
  offset: number;
  onTrack: boolean;
};

/** Hors trace, on cherche encore le bon tronçon dans ce rayon (évite de sauter ailleurs sur le parcours). */
const OFF_TRACK_SEARCH_M = 1000;

/** Écart max (m) pour se considérer sur la trace, selon la précision annoncée par le GPS. */
export function onTrackTolerance(accuracy: number): number {
  return Math.min(150, Math.max(40, accuracy * 1.5));
}

/**
 * Parmi plusieurs passages au même endroit, celui le plus proche de l'indice ;
 * sans indice, le premier des plus proches (au départ d'une boucle : km 0, pas l'arrivée).
 */
function pickPass(passes: TrackPoint2D[], hint: number | null): TrackPoint2D {
  if (hint !== null) {
    return passes.reduce((best, p) =>
      Math.abs(p.distance - hint) < Math.abs(best.distance - hint) ? p : best,
    );
  }
  const minOffset = Math.min(...passes.map((p) => p.offset));
  return passes.find((p) => p.offset <= minOffset + 20) ?? passes[0];
}

/**
 * Position le long du parcours. Quand la trace passe plusieurs fois au même endroit
 * (départ = arrivée d'une boucle, aller-retour), `hint` départage : la dernière position connue,
 * ou à défaut l'endroit où le plan prévoit d'être.
 */
export function locateOnTrack(
  track: Track,
  lat: number,
  lon: number,
  accuracy: number,
  hint: number | null,
): TrackLocation {
  const passes = trackPassesNear(track, lat, lon, onTrackTolerance(accuracy));
  if (passes.length > 0) return { ...pickPass(passes, hint), onTrack: true };

  const wide = trackPassesNear(track, lat, lon, OFF_TRACK_SEARCH_M);
  const best = wide.length > 0 ? pickPass(wide, hint) : nearestOnTrack(track, lat, lon);
  return { ...best, onTrack: false };
}
