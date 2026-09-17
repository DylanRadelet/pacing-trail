import { formatClock, formatDuration, formatKm } from "@/lib/race/format";
import type { TimelineEntry } from "@/lib/race/plan";
import type { ProfileMarker } from "./elevation-profile";
import type { MapMarker } from "./race-map";

export type RaceMarker = MapMarker & ProfileMarker;

/** Marqueurs communs à la carte et au profil : passages (temps) et ravitos (temps estimé). */
export function buildMarkers(timeline: TimelineEntry[], startTime: string | null): RaceMarker[] {
  return timeline.flatMap((entry): RaceMarker[] => {
    if (entry.type === "checkpoint") {
      const time = formatDuration(entry.checkpoint.timeSec);
      return [
        {
          key: entry.key,
          kind: "checkpoint",
          distance: entry.distance,
          label: time,
          sublabel: formatClock(startTime, entry.checkpoint.timeSec) ?? undefined,
          title: `${entry.checkpoint.label || "Passage"} · km ${formatKm(entry.distance)} · ${time}`,
        },
      ];
    }
    if (entry.type === "aid") {
      const clock = entry.planned ? formatClock(startTime, entry.planned.timeSec) : null;
      return [
        {
          key: entry.key,
          kind: "aid",
          distance: entry.distance,
          label: `🥤 ${entry.planned ? `≈${formatDuration(entry.planned.timeSec)}` : entry.aid.name || "Ravito"}`,
          sublabel: clock ? `≈${clock}` : undefined,
          title: `${entry.aid.name || "Ravito"} · km ${formatKm(entry.distance)}`,
        },
      ];
    }
    return [];
  });
}
