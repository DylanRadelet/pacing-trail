"use client";

import { Download, FileBraces, Mountain, Smartphone, Timer, Trash } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GpxImport } from "@/components/features/race/gpx-import";
import {
  deleteLocalRace,
  importRaceJson,
  localRacesSnapshot,
  readLocalRace,
  subscribeLocalRaces,
} from "@/lib/race/browser-store";
import { formatElevation, formatKm } from "@/lib/race/format";
import { buildTrack } from "@/lib/race/track";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return event;
}

export function PhoneHome() {
  const snapshot = useSyncExternalStore(subscribeLocalRaces, localRacesSnapshot, () => null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const installPrompt = useInstallPrompt();

  const races = useMemo(() => {
    if (snapshot === null) return null;
    return snapshot
      .split("\n")
      .slice(1)
      .flatMap((id) => {
        try {
          const race = readLocalRace(id);
          if (!race) return [];
          const track = buildTrack(race.points);
          return [{ race, distance: track.totalDistance, gain: track.totalGain }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.race.updatedAt.localeCompare(a.race.updatedAt));
  }, [snapshot]);

  const importJson = async (file: File) => {
    try {
      const { race, replaced } = importRaceJson(await file.text());
      void navigator.storage?.persist?.();
      setMessage({ ok: true, text: `« ${race.name} » ${replaced ? "mise à jour" : "importée"}.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Import impossible." });
    }
  };

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-2xl bg-stone-900 p-2.5 text-white">
          <Mountain className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pacing Run</h1>
          <p className="text-sm text-stone-600">Tes courses sur ce téléphone, même sans réseau.</p>
        </div>
      </div>

      <GpxImport target="browser" />

      <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold ring-1 ring-stone-300 hover:bg-stone-100">
        <FileBraces className="size-4" />
        Importer un JSON préparé sur le PC
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importJson(file);
          }}
        />
      </label>
      {message && (
        <p className={`mt-2 text-sm font-medium ${message.ok ? "text-green-700" : "text-red-700"}`}>
          {message.text}
        </p>
      )}

      <h2 className="mt-7 mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">Mes courses</h2>
      {races === null ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : races.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Aucune course sur ce téléphone. Importe le GPX de ton trail pour commencer.
        </p>
      ) : (
        <ul className="space-y-2">
          {races.map(({ race, distance, gain }) => {
            const query = `?id=${encodeURIComponent(race.id)}`;
            return (
              <li key={race.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-200">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{race.name}</div>
                    <div className="text-sm text-stone-600">
                      {formatKm(distance)} km · D+ {formatElevation(gain)} · {race.checkpoints.length} passage
                      {race.checkpoints.length > 1 ? "s" : ""} · {race.aidStations.length} ravito
                      {race.aidStations.length > 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Supprimer ${race.name}`}
                    className="rounded-full p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      if (window.confirm(`Supprimer « ${race.name} » de ce téléphone ?`)) deleteLocalRace(race.id);
                    }}
                  >
                    <Trash className="size-5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Link
                    href={`/telephone/course${query}`}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    <Mountain className="size-4" /> Mode course
                  </Link>
                  <Link
                    href={`/telephone/plan${query}`}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2.5 text-sm font-semibold ring-1 ring-stone-300"
                  >
                    <Timer className="size-4" /> Plan & carte
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {installPrompt && (
        <button
          type="button"
          onClick={() => void installPrompt.prompt()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-checkpoint px-4 py-3 font-semibold text-white"
        >
          <Download className="size-5" /> Installer l&apos;application
        </button>
      )}

      <div className="mt-6 rounded-xl bg-white p-4 text-sm leading-relaxed text-stone-700 ring-1 ring-stone-200">
        <div className="mb-1 flex items-center gap-2 font-semibold text-stone-900">
          <Smartphone className="size-4" /> Pour le jour de la course
        </div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Installe l&apos;app : Chrome ⋮ → « Ajouter à l&apos;écran d&apos;accueil ».</li>
          <li>Ouvre une fois le mode course avec du réseau : ensuite il marche hors-ligne.</li>
          <li>Tout est enregistré dans ce téléphone (rien sur un serveur).</li>
        </ol>
      </div>
    </main>
  );
}
