"use client";

import { ArrowLeft, Maximize, Minimize, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useWakeLock } from "@/hooks/use-wake-lock";
import {
  formatClock,
  formatDuration,
  formatElevation,
  formatGrade,
  formatKm,
} from "@/lib/race/format";
import { buildTimeline, plannedTimeAt } from "@/lib/race/plan";
import { buildTrack, gradeAt, sampleAt, type Track } from "@/lib/race/track";
import type { Race } from "@/lib/race/types";
import { ElevationProfile, profilePlotArea, type ProfileView } from "./elevation-profile";
import { buildMarkers } from "./markers";

/** Zoom maximum : 300 m affichés sur la largeur de l'écran. */
const MIN_SPAN_M = 300;
const TAP_SLOP_PX = 8;
const DOUBLE_TAP_MS = 320;
const PRESETS_KM = [1, 2, 5];

type Gesture =
  | { type: "pan"; startX: number; startY: number; view: ProfileView; moved: boolean }
  | { type: "pinch"; startDistance: number; anchor: number; view: ProfileView };

const noopSubscribe = () => () => {};
const subscribeFullscreen = (callback: () => void) => {
  document.addEventListener("fullscreenchange", callback);
  return () => document.removeEventListener("fullscreenchange", callback);
};

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    // Android : on verrouille en portrait une fois en plein écran.
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "portrait") => Promise<void>;
    };
    await orientation.lock?.("portrait");
  } catch {
    // Plein écran ou verrouillage refusé : la vue reste utilisable telle quelle.
  }
}

/** Mini-profil de tout le parcours avec la zone affichée ; toucher ou glisser pour s'y déplacer. */
function Overview({
  track,
  view,
  cursor,
  onCenter,
}: {
  track: Track;
  view: ProfileView;
  cursor: number | null;
  onCenter: (distance: number) => void;
}) {
  const W = 1000;
  const H = 40;
  const total = track.totalDistance;
  const path = useMemo(() => {
    const range = Math.max(track.maxEle - track.minEle, 1);
    const samples = 200;
    let d = "";
    for (let i = 0; i <= samples; i++) {
      const s = sampleAt(track, (i / samples) * total);
      const y = H - 3 - ((s.ele - track.minEle) / range) * (H - 8);
      d += `${i === 0 ? "M" : "L"}${((i / samples) * W).toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  }, [track, total]);

  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onCenter(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * total);
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-10 w-full touch-none"
      aria-label="Vue d'ensemble du parcours"
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointeur déjà relâché.
        }
        move(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) move(e);
      }}
    >
      <path d={`${path}L${W},${H}L0,${H}Z`} fill="#d6d3d1" />
      <path d={path} fill="none" stroke="#57534e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <rect
        x={(view.start / total) * W}
        y={1}
        width={Math.max(4, ((view.end - view.start) / total) * W)}
        height={H - 2}
        fill="rgb(37 99 235 / 0.18)"
        stroke="var(--checkpoint)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {cursor !== null && (
        <line
          x1={(cursor / total) * W}
          x2={(cursor / total) * W}
          y1={0}
          y2={H}
          stroke="#1c1917"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

export function RaceFocus({ race, backHref }: { race: Race; backHref: string }) {
  const track = useMemo(() => buildTrack(race.points), [race.points]);
  const markers = useMemo(
    () => buildMarkers(buildTimeline(track, race.checkpoints, race.aidStations), race.startTime),
    [track, race.checkpoints, race.aidStations, race.startTime],
  );
  const total = track.totalDistance;

  const [view, setView] = useState<ProfileView>({ start: 0, end: total });
  const [cursor, setCursor] = useState<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ time: number; x: number } | null>(null);

  useWakeLock();
  const fullscreenSupported = useSyncExternalStore(
    noopSubscribe,
    () => document.fullscreenEnabled === true,
    () => false,
  );
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement !== null,
    () => false,
  );

  const clampView = useCallback(
    (start: number, span: number): ProfileView => {
      const s = Math.min(total, Math.max(Math.min(MIN_SPAN_M, total), span));
      const st = Math.min(Math.max(0, start), total - s);
      return { start: st, end: st + s };
    },
    [total],
  );

  const applyView = (next: ProfileView) => {
    viewRef.current = next;
    setView(next);
  };

  const plotRatioAt = (clientX: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return 0.5;
    const { left, plotW } = profilePlotArea(rect.width, "focus");
    return Math.min(1, Math.max(0, (clientX - rect.left - left) / plotW));
  };

  const distanceAt = (clientX: number) => {
    const v = viewRef.current;
    return v.start + plotRatioAt(clientX) * (v.end - v.start);
  };

  /** Point autour duquel zoomer : le curseur s'il est visible, sinon le centre de la vue. */
  const focusPoint = () => {
    const v = viewRef.current;
    return cursor !== null && cursor >= v.start && cursor <= v.end ? cursor : (v.start + v.end) / 2;
  };

  const zoom = (factor: number, anchor = focusPoint()) => {
    const v = viewRef.current;
    const span = v.end - v.start;
    const nextSpan = span / factor;
    applyView(clampView(anchor - ((anchor - v.start) / span) * nextSpan, nextSpan));
  };

  const showSpan = (span: number) => applyView(clampView(focusPoint() - span / 2, span));

  const centerOn = (distance: number) => {
    const v = viewRef.current;
    const span = v.end - v.start;
    applyView(clampView(distance - span / 2, span));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 1) {
      gesture.current = { type: "pan", startX: e.clientX, startY: e.clientY, view: viewRef.current, moved: false };
    } else if (points.length === 2) {
      const [a, b] = points;
      gesture.current = {
        type: "pinch",
        startDistance: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)),
        anchor: distanceAt((a.x + b.x) / 2),
        view: viewRef.current,
      };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.type === "pinch") {
      const points = [...pointers.current.values()];
      if (points.length < 2) return;
      const [a, b] = points;
      const distance = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      const span = ((g.view.end - g.view.start) * g.startDistance) / distance;
      // Le point pincé reste sous les doigts (zoom + déplacement simultanés).
      applyView(clampView(g.anchor - plotRatioAt((a.x + b.x) / 2) * span, span));
      return;
    }

    const dx = e.clientX - g.startX;
    if (!g.moved && Math.hypot(dx, e.clientY - g.startY) > TAP_SLOP_PX) g.moved = true;
    if (!g.moved) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const span = g.view.end - g.view.start;
    applyView(clampView(g.view.start - (dx / profilePlotArea(rect.width, "focus").plotW) * span, span));
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    const remaining = [...pointers.current.values()];

    if (g?.type === "pinch") {
      // Un doigt reste posé : on continue en déplacement, sans déclencher de tap.
      gesture.current =
        remaining.length === 1
          ? { type: "pan", startX: remaining[0].x, startY: remaining[0].y, view: viewRef.current, moved: true }
          : null;
      lastTap.current = null;
      return;
    }

    gesture.current = null;
    if (g?.type !== "pan" || g.moved || e.type !== "pointerup") return;

    const distance = distanceAt(e.clientX);
    const previous = lastTap.current;
    if (previous && e.timeStamp - previous.time < DOUBLE_TAP_MS && Math.abs(e.clientX - previous.x) < 40) {
      zoom(2, distance);
      lastTap.current = null;
    } else {
      setCursor(distance);
      lastTap.current = { time: e.timeStamp, x: e.clientX };
    }
  };

  const span = view.end - view.start;
  const sample = cursor === null ? null : sampleAt(track, cursor);
  const planned = cursor === null ? null : plannedTimeAt(track, race.checkpoints, cursor);
  const clock = planned ? formatClock(race.startTime, planned.timeSec) : null;
  const zoomedOut = span >= total - 1;
  const zoomedIn = span <= Math.min(MIN_SPAN_M, total) + 1;

  const control = (active = false) =>
    `flex h-12 items-center justify-center rounded-xl text-base font-semibold ring-1 disabled:opacity-35 ${
      active ? "bg-stone-900 text-white ring-stone-900" : "bg-white ring-stone-300 active:bg-stone-200"
    }`;

  return (
    <div className="fixed inset-0 flex h-dvh flex-col overscroll-none bg-background">
      <header className="flex h-12 shrink-0 items-center gap-1 px-1 pt-[env(safe-area-inset-top)]">
        <Link href={backHref} className="rounded-full p-2.5 active:bg-stone-200" aria-label="Retour à la préparation">
          <ArrowLeft className="size-6" />
        </Link>
        <div className="min-w-0 flex-1 truncate text-base font-bold">{race.name}</div>
        {fullscreenSupported && (
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="rounded-full p-2.5 active:bg-stone-200"
            aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
          >
            {isFullscreen ? <Minimize className="size-6" /> : <Maximize className="size-6" />}
          </button>
        )}
      </header>

      <div className="mx-2 flex min-h-16 shrink-0 items-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-white">
        {sample ? (
          <>
            <div className="grid flex-1 grid-cols-4 gap-x-2 font-mono tabular-nums">
              <div>
                <div className="text-[10px] text-stone-400 uppercase">Km</div>
                <div className="text-lg leading-tight font-bold">{formatKm(sample.distance, 1)}</div>
              </div>
              <div>
                <div className="text-[10px] text-stone-400 uppercase">Alt.</div>
                <div className="text-lg leading-tight font-bold">{Math.round(sample.ele)}</div>
              </div>
              <div>
                <div className="text-[10px] text-stone-400 uppercase">Pente</div>
                <div className="text-lg leading-tight font-bold">{formatGrade(gradeAt(track, sample.distance))}</div>
              </div>
              <div>
                <div className="text-[10px] text-stone-400 uppercase">Prévu</div>
                <div className="text-lg leading-tight font-bold">
                  {planned ? `${planned.kind === "target" ? "" : "≈"}${formatDuration(planned.timeSec)}` : "–"}
                </div>
                {clock && <div className="text-xs text-stone-300">{clock}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCursor(null)}
              className="rounded-full p-1.5 text-stone-400 active:bg-stone-700"
              aria-label="Effacer le point"
            >
              <X className="size-5" />
            </button>
          </>
        ) : (
          <p className="text-sm leading-snug text-stone-300">
            Touche le profil pour lire un point. Pince ou double-tape pour zoomer, glisse pour te déplacer.
          </p>
        )}
      </div>

      <div
        ref={surfaceRef}
        className="relative min-h-0 flex-1 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.25 : 0.8, distanceAt(e.clientX))}
      >
        <ElevationProfile track={track} markers={markers} cursor={cursor} view={view} variant="focus" />
      </div>

      <div className="shrink-0 px-2 pt-1">
        <div className="mb-1 flex justify-between text-xs text-stone-600 tabular-nums">
          <span>
            km {formatKm(view.start, 1)} → {formatKm(view.end, 1)}
          </span>
          <span>
            {formatKm(span, 1)} km affichés · D+ {formatElevation(sampleAt(track, view.end).gain - sampleAt(track, view.start).gain)}
          </span>
        </div>
        <Overview track={track} view={view} cursor={cursor} onCenter={centerOn} />
      </div>

      <div className="grid shrink-0 grid-cols-6 gap-1.5 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" className={control()} onClick={() => zoom(0.5)} disabled={zoomedOut} aria-label="Dézoomer">
          <Minus className="size-6" />
        </button>
        {PRESETS_KM.map((km) => (
          <button
            key={km}
            type="button"
            className={control(Math.abs(span - km * 1000) < 5)}
            onClick={() => showSpan(km * 1000)}
            disabled={km * 1000 >= total}
          >
            {km} km
          </button>
        ))}
        <button
          type="button"
          className={control(zoomedOut)}
          onClick={() => applyView({ start: 0, end: total })}
        >
          Tout
        </button>
        <button type="button" className={control()} onClick={() => zoom(2)} disabled={zoomedIn} aria-label="Zoomer">
          <Plus className="size-6" />
        </button>
      </div>
    </div>
  );
}
