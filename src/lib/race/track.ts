import { geodesicDistance } from "./geo";
import type { TrackPoint } from "./types";

/** Lissage de l'altitude pour le calcul du D+ / D- et des pentes (fenêtre centrée, en m). */
const ELEVATION_SMOOTHING_M = 40;
/** Demi-fenêtre utilisée pour calculer la pente affichée (en m). */
const GRADE_HALF_WINDOW_M = 50;

export type Track = {
  count: number;
  lat: Float64Array;
  lon: Float64Array;
  /** Altitude brute du GPX (trous comblés par interpolation). */
  ele: Float64Array;
  /** Altitude lissée, sert au D+ / D- et aux pentes. */
  eleSmooth: Float64Array;
  /** Distance cumulée depuis le départ, en mètres. */
  dist: Float64Array;
  /** D+ et D- cumulés, en mètres. */
  gain: Float64Array;
  loss: Float64Array;
  hasElevation: boolean;
  totalDistance: number;
  totalGain: number;
  totalLoss: number;
  minEle: number;
  maxEle: number;
};

export type TrackSample = {
  distance: number;
  lat: number;
  lon: number;
  ele: number;
  gain: number;
  loss: number;
};

function fillElevationGaps(points: TrackPoint[], dist: Float64Array): Float64Array {
  const n = points.length;
  const ele = new Float64Array(n);
  const known: number[] = [];
  for (let i = 0; i < n; i++) if (points[i][2] !== null) known.push(i);
  if (known.length === 0) return ele;

  let k = 0;
  for (let i = 0; i < n; i++) {
    while (k < known.length - 1 && known[k + 1] <= i) k++;
    const a = known[k];
    // Avant la première ou après la dernière altitude connue : on la prolonge.
    if (i <= a || k === known.length - 1) {
      ele[i] = points[a][2] as number;
      continue;
    }
    const b = known[k + 1];
    const span = dist[b] - dist[a];
    const t = span > 0 ? (dist[i] - dist[a]) / span : 0;
    ele[i] = (points[a][2] as number) + t * ((points[b][2] as number) - (points[a][2] as number));
  }
  return ele;
}

function smoothElevation(ele: Float64Array, dist: Float64Array): Float64Array {
  const n = ele.length;
  const out = new Float64Array(n);
  const half = ELEVATION_SMOOTHING_M / 2;
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && dist[hi] <= dist[i] + half) sum += ele[hi++];
    while (dist[lo] < dist[i] - half) sum -= ele[lo++];
    out[i] = sum / (hi - lo);
  }
  return out;
}

export function buildTrack(points: TrackPoint[]): Track {
  const n = points.length;
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const dist = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    lat[i] = points[i][0];
    lon[i] = points[i][1];
    if (i > 0) dist[i] = dist[i - 1] + geodesicDistance(lat[i - 1], lon[i - 1], lat[i], lon[i]);
  }

  const hasElevation = points.some((p) => p[2] !== null);
  const ele = fillElevationGaps(points, dist);
  const eleSmooth = smoothElevation(ele, dist);

  const gain = new Float64Array(n);
  const loss = new Float64Array(n);
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (let i = 0; i < n; i++) {
    if (ele[i] < minEle) minEle = ele[i];
    if (ele[i] > maxEle) maxEle = ele[i];
    if (i === 0) continue;
    const diff = eleSmooth[i] - eleSmooth[i - 1];
    gain[i] = gain[i - 1] + (diff > 0 ? diff : 0);
    loss[i] = loss[i - 1] + (diff < 0 ? -diff : 0);
  }

  return {
    count: n,
    lat,
    lon,
    ele,
    eleSmooth,
    dist,
    gain,
    loss,
    hasElevation,
    totalDistance: dist[n - 1],
    totalGain: gain[n - 1],
    totalLoss: loss[n - 1],
    minEle,
    maxEle,
  };
}

/** Plus grand index i tel que dist[i] <= distance. */
export function indexAtDistance(track: Track, distance: number): number {
  let lo = 0;
  let hi = track.count - 1;
  if (distance <= 0) return 0;
  if (distance >= track.dist[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (track.dist[mid] <= distance) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function lerp(arr: Float64Array, i: number, t: number): number {
  return t === 0 ? arr[i] : arr[i] + t * (arr[i + 1] - arr[i]);
}

/** Position exacte sur la trace à une distance donnée (interpolée entre deux points GPS). */
export function sampleAt(track: Track, distance: number): TrackSample {
  const d = Math.min(Math.max(distance, 0), track.totalDistance);
  const i = indexAtDistance(track, d);
  let t = 0;
  if (i < track.count - 1) {
    const span = track.dist[i + 1] - track.dist[i];
    t = span > 0 ? (d - track.dist[i]) / span : 0;
  }
  return {
    distance: d,
    lat: lerp(track.lat, i, t),
    lon: lerp(track.lon, i, t),
    ele: lerp(track.ele, i, t),
    gain: lerp(track.gain, i, t),
    loss: lerp(track.loss, i, t),
  };
}

function smoothEleAt(track: Track, distance: number): number {
  const d = Math.min(Math.max(distance, 0), track.totalDistance);
  const i = indexAtDistance(track, d);
  if (i >= track.count - 1) return track.eleSmooth[i];
  const span = track.dist[i + 1] - track.dist[i];
  return lerp(track.eleSmooth, i, span > 0 ? (d - track.dist[i]) / span : 0);
}

/** Pente moyenne en % entre deux distances. */
export function gradeBetween(track: Track, from: number, to: number): number {
  const a = Math.max(0, from);
  const b = Math.min(track.totalDistance, to);
  if (b - a < 1) return 0;
  return ((smoothEleAt(track, b) - smoothEleAt(track, a)) / (b - a)) * 100;
}

/** Pente moyenne en % autour d'une distance. */
export function gradeAt(track: Track, distance: number): number {
  return gradeBetween(track, distance - GRADE_HALF_WINDOW_M, distance + GRADE_HALF_WINDOW_M);
}


export type TrackPoint2D = { distance: number; offset: number };

/** Mètres par degré autour d'une latitude (plan local, précis à l'échelle de quelques km). */
function metersPerDegree(lat: number) {
  return { mLat: 111132.92, mLon: 111412.84 * Math.cos((lat * Math.PI) / 180) };
}

/** Projection d'un point sur le segment [i, i+1] : distance le long de la trace et écart en mètres. */
function projectOnSegment(
  track: Track,
  i: number,
  lat: number,
  lon: number,
  mLat: number,
  mLon: number,
): TrackPoint2D {
  const ax = (track.lon[i] - lon) * mLon;
  const ay = (track.lat[i] - lat) * mLat;
  const bx = (track.lon[i + 1] - lon) * mLon;
  const by = (track.lat[i + 1] - lat) * mLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lenSq)) : 0;
  return {
    distance: track.dist[i] + t * (track.dist[i + 1] - track.dist[i]),
    offset: Math.hypot(ax + t * dx, ay + t * dy),
  };
}

/**
 * Point de la trace le plus proche d'une coordonnée (projection sur chaque segment).
 * Renvoie la distance le long de la trace et l'écart en mètres.
 */
export function nearestOnTrack(track: Track, lat: number, lon: number): TrackPoint2D {
  const { mLat, mLon } = metersPerDegree(lat);
  let best: TrackPoint2D = { distance: 0, offset: Infinity };
  for (let i = 0; i < track.count - 1; i++) {
    const p = projectOnSegment(track, i, lat, lon, mLat, mLon);
    if (p.offset < best.offset) best = p;
  }
  return best;
}

/**
 * Chaque passage de la trace à moins de `maxOffset` m du point (le meilleur point de chaque passage),
 * dans l'ordre du parcours. Une boucle ou un aller-retour donne plusieurs passages au même endroit.
 */
export function trackPassesNear(track: Track, lat: number, lon: number, maxOffset: number): TrackPoint2D[] {
  const { mLat, mLon } = metersPerDegree(lat);
  const passes: TrackPoint2D[] = [];
  let current: TrackPoint2D | null = null;
  for (let i = 0; i < track.count - 1; i++) {
    const p = projectOnSegment(track, i, lat, lon, mLat, mLon);
    if (p.offset <= maxOffset) {
      if (!current || p.offset < current.offset) current = p;
    } else if (current) {
      passes.push(current);
      current = null;
    }
  }
  if (current) passes.push(current);
  return passes;
}
