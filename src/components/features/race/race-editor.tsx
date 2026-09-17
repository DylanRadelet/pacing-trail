"use client";

import {
  ArrowLeft,
  Check,
  CircleAlert,
  CupSoda,
  LoaderCircle,
  Mountain,
  Plus,
  Timer,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRaceAutosave, type SaveStatus } from "@/hooks/use-race-autosave";
import {
  formatClock,
  formatDuration,
  formatElevation,
  formatGrade,
  formatKm,
  roundKm,
} from "@/lib/race/format";
import { buildTimeline, plannedTimeAt, type TimelineEntry } from "@/lib/race/plan";
import { buildTrack, gradeAt, sampleAt } from "@/lib/race/track";
import type { AidStation, Checkpoint, Race } from "@/lib/race/types";
import { EditSheet, type EditTarget } from "./edit-sheet";
import { ElevationProfile, GRADE_CLASSES } from "./elevation-profile";
import { buildMarkers } from "./markers";
import { PlanTimeline } from "./plan-timeline";

const RaceMap = dynamic(() => import("./race-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-stone-500">Chargement de la carte…</div>
  ),
});

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-stone-500">
        <LoaderCircle className="size-3.5 animate-spin" /> Enregistrement…
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600">
        <CircleAlert className="size-3.5" /> Non enregistré, nouvel essai…
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-green-700">
      <Check className="size-3.5" /> Enregistré
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-stone-200">
      <div className="text-[11px] tracking-wide text-stone-500 uppercase">{label}</div>
      <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function RaceEditor({ race }: { race: Race }) {
  const track = useMemo(() => buildTrack(race.points), [race.points]);
  const [name, setName] = useState(race.name);
  const [startTime, setStartTime] = useState<string | null>(race.startTime);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(race.checkpoints);
  const [aidStations, setAidStations] = useState<AidStation[]>(race.aidStations);
  const [cursor, setCursor] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const saveStatus = useRaceAutosave(race.id, {
    name: name.trim() || race.name,
    startTime,
    checkpoints,
    aidStations,
  });

  const timeline = useMemo(
    () => buildTimeline(track, checkpoints, aidStations),
    [track, checkpoints, aidStations],
  );

  const markers = useMemo(() => buildMarkers(timeline, startTime), [timeline, startTime]);

  const handleCursor = useCallback((distance: number | null) => setCursor(distance), []);

  const openNew = (kind: EditTarget["kind"]) => {
    const km = cursor !== null ? roundKm(cursor / 1000) : 0;
    setEditing({ kind, item: null, km });
  };

  const openEntry = (entry: TimelineEntry) => {
    if (entry.type === "checkpoint") {
      setEditing({ kind: "checkpoint", item: entry.checkpoint, km: entry.checkpoint.km });
    } else if (entry.type === "aid") {
      setEditing({ kind: "aid", item: entry.aid, km: entry.aid.km });
    }
    setCursor(entry.distance);
  };

  const upsert = <T extends { id: string }>(list: T[], item: T) =>
    list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

  const cursorSample = cursor === null ? null : sampleAt(track, cursor);
  const cursorPlanned = cursor === null ? null : plannedTimeAt(track, checkpoints, cursor);
  const cursorClock = cursorPlanned ? formatClock(startTime, cursorPlanned.timeSec) : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pb-16 sm:px-5">
      <header className="sticky top-0 z-[1100] -mx-3 mb-3 flex items-center gap-2 border-b border-stone-200 bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <Link href="/" className="rounded-full p-2 hover:bg-stone-200" aria-label="Retour aux courses">
          <ArrowLeft className="size-5" />
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-lg font-bold outline-none focus:bg-white focus:ring-2 focus:ring-stone-300"
          aria-label="Nom de la course"
          maxLength={120}
        />
        <SaveIndicator status={saveStatus} />
      </header>

      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Distance" value={`${formatKm(track.totalDistance)} km`} />
        <Stat label="D+" value={formatElevation(track.totalGain)} />
        <Stat label="D-" value={formatElevation(track.totalLoss)} />
        <Stat label="Alt. min" value={formatElevation(track.minEle)} />
        <Stat label="Alt. max" value={formatElevation(track.maxEle)} />
        <Stat label="Points GPS" value={String(track.count).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} />
      </div>

      {/* Attend l'enregistrement : la page course relit le JSON sur le disque. */}
      <Link
        href={`/races/${race.id}/course`}
        aria-disabled={saveStatus !== "saved"}
        className={`mb-3 flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-stone-800 ${saveStatus !== "saved" ? "pointer-events-none opacity-50" : ""}`}
      >
        <Mountain className="size-5" />
        Mode course · profil plein écran
      </Link>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0 space-y-3">
          <div className="isolate h-[45vh] min-h-[280px] overflow-hidden rounded-xl ring-1 ring-stone-200">
            <RaceMap track={track} markers={markers} cursor={cursor} onCursorChange={handleCursor} />
          </div>

          <div className="rounded-xl bg-white p-2 ring-1 ring-stone-200">
            {!track.hasElevation && (
              <p className="p-2 text-sm text-amber-700">Ce GPX ne contient pas d&apos;altitude.</p>
            )}
            <ElevationProfile track={track} markers={markers} cursor={cursor} onCursorChange={handleCursor} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-1 text-[11px] text-stone-500">
              {GRADE_CLASSES.map((c) => (
                <span key={c.label} className="flex items-center gap-1">
                  <span className="inline-block size-2.5 rounded-sm" style={{ background: c.color }} />
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          {cursorSample ? (
            <div className="sticky bottom-2 z-[1100] rounded-xl bg-stone-900 p-3 text-white shadow-lg">
              <div className="flex items-start gap-3">
                <div className="grid flex-1 grid-cols-3 gap-x-3 gap-y-1 text-sm">
                  <div>
                    <div className="text-[10px] text-stone-400 uppercase">Km</div>
                    <div className="font-mono font-semibold tabular-nums">{formatKm(cursorSample.distance)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-stone-400 uppercase">Altitude</div>
                    <div className="font-mono font-semibold tabular-nums">{formatElevation(cursorSample.ele)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-stone-400 uppercase">Pente</div>
                    <div className="font-mono font-semibold tabular-nums">
                      {formatGrade(gradeAt(track, cursorSample.distance))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-stone-400 uppercase">D+ / D-</div>
                    <div className="font-mono font-semibold tabular-nums">
                      {Math.round(cursorSample.gain)} / {Math.round(cursorSample.loss)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] text-stone-400 uppercase">Passage prévu</div>
                    <div className="font-mono font-semibold tabular-nums">
                      {cursorPlanned
                        ? `${cursorPlanned.kind === "target" ? "" : "≈"}${formatDuration(cursorPlanned.timeSec)}${cursorClock ? ` · ${cursorClock}` : ""}`
                        : "–"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCursor(null)}
                  className="rounded-full p-1 text-stone-400 hover:bg-stone-800 hover:text-white"
                  aria-label="Fermer"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => openNew("checkpoint")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-checkpoint px-3 py-2 text-sm font-semibold"
                >
                  <Timer className="size-4" /> Passage ici
                </button>
                <button
                  type="button"
                  onClick={() => openNew("aid")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-aid px-3 py-2 text-sm font-semibold"
                >
                  <CupSoda className="size-4" /> Ravito ici
                </button>
              </div>
            </div>
          ) : (
            <p className="px-1 text-xs text-stone-500">
              Touche le profil ou la trace pour lire un point précis (km, altitude, pente, temps prévu).
            </p>
          )}
        </section>

        <aside className="min-w-0 space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <label htmlFor="start-time" className="flex-1 text-sm font-medium">
              Heure de départ
            </label>
            <input
              id="start-time"
              type="time"
              value={startTime ?? ""}
              onChange={(e) => setStartTime(e.target.value || null)}
              className="rounded-lg border border-stone-300 px-2 py-1.5 font-mono text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openNew("checkpoint")}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-checkpoint px-3 py-3 text-sm font-semibold text-white"
            >
              <Plus className="size-4" /> Temps de passage
            </button>
            <button
              type="button"
              onClick={() => openNew("aid")}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-aid px-3 py-3 text-sm font-semibold text-white"
            >
              <Plus className="size-4" /> Ravito
            </button>
          </div>

          <PlanTimeline entries={timeline} startTime={startTime} onSelect={openEntry} />

          <p className="px-1 text-xs leading-relaxed text-stone-500">
            ≈ = estimation. Entre deux passages, le temps est réparti selon les km-effort (100 m de D+ = 1 km).
            Distances calculées sur l&apos;ellipsoïde WGS84 à partir de chaque point du GPX. Fichier :{" "}
            <code className="rounded bg-stone-200 px-1">data/races/{race.id}.json</code>
          </p>
        </aside>
      </div>

      {editing && (
        <EditSheet
          key={`${editing.kind}-${editing.item?.id ?? "new"}`}
          target={editing}
          track={track}
          checkpoints={checkpoints}
          onKmPreview={handleCursor}
          onClose={() => setEditing(null)}
          onSaveCheckpoint={(checkpoint) => {
            setCheckpoints((list) => upsert(list, checkpoint).sort((a, b) => a.km - b.km));
            setCursor(checkpoint.km * 1000);
            setEditing(null);
          }}
          onSaveAid={(aid) => {
            setAidStations((list) => upsert(list, aid).sort((a, b) => a.km - b.km));
            setCursor(aid.km * 1000);
            setEditing(null);
          }}
          onDelete={(target) => {
            if (target.kind === "checkpoint") {
              setCheckpoints((list) => list.filter((c) => c.id !== target.item?.id));
            } else {
              setAidStations((list) => list.filter((a) => a.id !== target.item?.id));
            }
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
