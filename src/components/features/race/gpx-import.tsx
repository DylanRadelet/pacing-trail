"use client";

import { LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveLocalRace } from "@/lib/race/browser-store";
import { buildNewRace } from "@/lib/race/create";
import { roundKm } from "@/lib/race/format";
import { parseGpx } from "@/lib/race/gpx";
import { buildTrack, nearestOnTrack } from "@/lib/race/track";
import type { AidStation, CreateRaceInput } from "@/lib/race/types";
import { createId } from "@/lib/utils/id";

/** Un waypoint du GPX à moins de cette distance de la trace devient un ravito. */
const WAYPOINT_MAX_OFFSET_M = 150;

type Props = {
  /** server = JSON sur le disque du PC ; browser = stockage du téléphone (version en ligne). */
  target?: "server" | "browser";
};

async function saveOnServer(body: CreateRaceInput): Promise<string> {
  const response = await fetch("/api/races", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Enregistrement impossible (HTTP ${response.status}).`);
  const { id } = (await response.json()) as { id: string };
  return `/races/${id}`;
}

function saveInBrowser(body: CreateRaceInput): string {
  const race = buildNewRace(body);
  saveLocalRace(race);
  void navigator.storage?.persist?.();
  return `/telephone/plan?id=${encodeURIComponent(race.id)}`;
}

export function GpxImport({ target = "server" }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const gpx = parseGpx(await file.text());
      const track = buildTrack(gpx.points);
      const aidStations: AidStation[] = gpx.waypoints.flatMap((wpt) => {
        const near = nearestOnTrack(track, wpt.lat, wpt.lon);
        if (near.offset > WAYPOINT_MAX_OFFSET_M) return [];
        return [{ id: createId(), km: roundKm(near.distance / 1000), name: wpt.name, notes: wpt.notes }];
      });

      const body: CreateRaceInput = {
        name: gpx.name ?? file.name.replace(/\.gpx$/i, ""),
        sourceFile: file.name,
        points: gpx.points,
        aidStations: aidStations.sort((a, b) => a.km - b.km),
      };
      router.push(target === "browser" ? saveInBrowser(body) : await saveOnServer(body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Pas d'attribut accept : sur iPhone, accept=".gpx" grise les fichiers GPX. */}
      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-stone-900 px-5 py-4 text-lg font-semibold text-white shadow-sm hover:bg-stone-800 ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Upload className="size-5" />}
        {busy ? "Import en cours…" : "Importer un fichier GPX"}
        <input
          type="file"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </label>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
