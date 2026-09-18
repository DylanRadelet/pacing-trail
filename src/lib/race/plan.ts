import { sampleAt, type Track } from "./track";
import type { AidStation, Checkpoint } from "./types";

/** Convention trail : 100 m de D+ coûtent autant qu'1 km à plat (km-effort). */
const GAIN_M_PER_EFFORT_KM = 100;
/** En dessous de cet écart, un point de passage est considéré comme l'arrivée. */
const FINISH_TOLERANCE_M = 10;

export type PlannedTime = {
  timeSec: number;
  /** target = saisi par toi ; interpolated = entre deux passages ; extrapolated = après le dernier. */
  kind: "target" | "interpolated" | "extrapolated";
};

type Anchor = { distance: number; timeSec: number; effort: number; checkpoint: Checkpoint | null };

export type PlanSegment = {
  distance: number;
  gain: number;
  loss: number;
  durationSec: number;
  paceSecPerKm: number | null;
  effortPaceSecPerKm: number | null;
  /** Temps plus court (ou égal) que le passage précédent. */
  inconsistent: boolean;
};

export type TimelineEntry =
  | { type: "start"; key: string; distance: number; ele: number }
  | {
      type: "checkpoint";
      key: string;
      distance: number;
      ele: number;
      checkpoint: Checkpoint;
      segment: PlanSegment;
    }
  | {
      type: "aid";
      key: string;
      distance: number;
      ele: number;
      aid: AidStation;
      planned: PlannedTime | null;
      sincePreviousAid: { distance: number; durationSec: number | null; label: string };
    }
  | { type: "finish"; key: string; distance: number; ele: number; planned: PlannedTime | null };

export function kmToDistance(track: Track, km: number): number {
  return Math.min(Math.max(km * 1000, 0), track.totalDistance);
}

export function effortAt(track: Track, distance: number): number {
  const s = sampleAt(track, distance);
  return s.distance / 1000 + s.gain / GAIN_M_PER_EFFORT_KM;
}

function buildAnchors(track: Track, checkpoints: Checkpoint[]): Anchor[] {
  const sorted = [...checkpoints]
    .map((checkpoint) => ({ checkpoint, distance: kmToDistance(track, checkpoint.km) }))
    .sort((a, b) => a.distance - b.distance);
  return [
    { distance: 0, timeSec: 0, effort: 0, checkpoint: null },
    ...sorted.map(({ checkpoint, distance }) => ({
      distance,
      timeSec: checkpoint.timeSec,
      effort: effortAt(track, distance),
      checkpoint,
    })),
  ];
}

/**
 * Temps prévu à une distance. Entre deux passages, le temps est réparti au prorata
 * des km-effort (une montée « coûte » plus cher qu'un plat), pas seulement des km.
 */
export function plannedTimeAt(
  track: Track,
  checkpoints: Checkpoint[],
  distance: number,
): PlannedTime | null {
  if (checkpoints.length === 0) return null;
  const anchors = buildAnchors(track, checkpoints);
  const d = Math.min(Math.max(distance, 0), track.totalDistance);

  const exact = anchors.find((a) => Math.abs(a.distance - d) < 0.5);
  if (exact) return { timeSec: exact.timeSec, kind: "target" };

  const effort = effortAt(track, d);
  const last = anchors[anchors.length - 1];

  if (d > last.distance) {
    const rate = last.effort > 0 ? last.timeSec / last.effort : 0;
    return { timeSec: last.timeSec + rate * (effort - last.effort), kind: "extrapolated" };
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (d < a.distance || d > b.distance) continue;
    let fraction = 1;
    if (b.effort > a.effort) fraction = (effort - a.effort) / (b.effort - a.effort);
    else if (b.distance > a.distance) fraction = (d - a.distance) / (b.distance - a.distance);
    return { timeSec: a.timeSec + fraction * (b.timeSec - a.timeSec), kind: "interpolated" };
  }
  return null;
}

function segmentBetween(track: Track, a: Anchor, b: Anchor): PlanSegment {
  const sa = sampleAt(track, a.distance);
  const sb = sampleAt(track, b.distance);
  const distance = b.distance - a.distance;
  const durationSec = b.timeSec - a.timeSec;
  const effortKm = b.effort - a.effort;
  return {
    distance,
    gain: sb.gain - sa.gain,
    loss: sb.loss - sa.loss,
    durationSec,
    paceSecPerKm: distance > 0 && durationSec > 0 ? durationSec / (distance / 1000) : null,
    effortPaceSecPerKm: effortKm > 0 && durationSec > 0 ? durationSec / effortKm : null,
    inconsistent: durationSec <= 0,
  };
}

/** Liste chronologique : départ, passages, ravitos et arrivée, triés par distance. */
export function buildTimeline(
  track: Track,
  checkpoints: Checkpoint[],
  aidStations: AidStation[],
): TimelineEntry[] {
  const anchors = buildAnchors(track, checkpoints);
  const entries: TimelineEntry[] = [
    { type: "start", key: "start", distance: 0, ele: track.ele[0] },
  ];

  for (let i = 1; i < anchors.length; i++) {
    const anchor = anchors[i];
    const checkpoint = anchor.checkpoint as Checkpoint;
    entries.push({
      type: "checkpoint",
      key: `cp-${checkpoint.id}`,
      distance: anchor.distance,
      ele: sampleAt(track, anchor.distance).ele,
      checkpoint,
      segment: segmentBetween(track, anchors[i - 1], anchor),
    });
  }

  const aids = aidStations
    .map((aid) => ({ aid, distance: kmToDistance(track, aid.km) }))
    .sort((a, b) => a.distance - b.distance);
  let previous = { distance: 0, timeSec: 0, label: "départ" };
  for (const { aid, distance } of aids) {
    const planned = plannedTimeAt(track, checkpoints, distance);
    entries.push({
      type: "aid",
      key: `aid-${aid.id}`,
      distance,
      ele: sampleAt(track, distance).ele,
      aid,
      planned,
      sincePreviousAid: {
        distance: distance - previous.distance,
        durationSec: planned ? planned.timeSec - previous.timeSec : null,
        label: previous.label,
      },
    });
    previous = { distance, timeSec: planned?.timeSec ?? 0, label: aid.name || "ravito" };
  }

  const endsAtFinish = anchors.some(
    (a) => a.checkpoint && track.totalDistance - a.distance < FINISH_TOLERANCE_M,
  );
  if (!endsAtFinish) {
    entries.push({
      type: "finish",
      key: "finish",
      distance: track.totalDistance,
      ele: track.ele[track.count - 1],
      planned: plannedTimeAt(track, checkpoints, track.totalDistance),
    });
  }

  const order = { start: 0, checkpoint: 1, aid: 2, finish: 3 };
  return entries.sort((a, b) => a.distance - b.distance || order[a.type] - order[b.type]);
}

/** Distance où le plan prévoit d'être après `elapsedSec` (inverse de plannedTimeAt). */
export function plannedDistanceAt(
  track: Track,
  checkpoints: Checkpoint[],
  elapsedSec: number,
): number | null {
  if (checkpoints.length === 0) return null;
  const timeAt = (distance: number) => plannedTimeAt(track, checkpoints, distance)?.timeSec ?? 0;
  if (elapsedSec <= 0) return 0;
  if (elapsedSec >= timeAt(track.totalDistance)) return track.totalDistance;
  let lo = 0;
  let hi = track.totalDistance;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (timeAt(mid) < elapsedSec) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
