import { ChevronRight, Mountain } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { DeleteRaceButton } from "@/components/features/race/delete-race-button";
import { GpxImport } from "@/components/features/race/gpx-import";
import { formatElevation, formatKm } from "@/lib/race/format";
import { listRaceSummaries } from "@/lib/race/storage";

export default async function Home() {
  await connection();
  const races = await listRaceSummaries();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-stone-900 p-2.5 text-white">
          <Mountain className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pacing Run</h1>
          <p className="text-sm text-stone-600">Ta trace, tes temps de passage, tes ravitos.</p>
        </div>
      </div>

      <GpxImport />

      <h2 className="mt-8 mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">
        Mes courses
      </h2>
      {races.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Aucune course pour l&apos;instant. Importe le GPX de ton trail pour commencer.
        </p>
      ) : (
        <ul className="space-y-2">
          {races.map((race) => (
            <li key={race.id} className="flex items-center rounded-xl bg-white pr-1 shadow-sm ring-1 ring-stone-200">
              <Link href={`/races/${race.id}`} className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{race.name}</div>
                  <div className="text-sm text-stone-600">
                    {formatKm(race.distanceM)} km · D+ {formatElevation(race.gainM)} · {race.checkpointCount}{" "}
                    passage{race.checkpointCount > 1 ? "s" : ""} · {race.aidStationCount} ravito
                    {race.aidStationCount > 1 ? "s" : ""}
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-stone-400" />
              </Link>
              <DeleteRaceButton id={race.id} name={race.name} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs text-stone-500">
        Tout reste sur ton ordinateur : chaque course est un fichier JSON dans{" "}
        <code className="rounded bg-stone-200 px-1">data/races/</code>.
      </p>
    </main>
  );
}
