"use client";

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { gradeBetween, indexAtDistance, sampleAt, type Track } from "@/lib/race/track";

export type ProfileMarker = {
  key: string;
  kind: "checkpoint" | "aid";
  distance: number;
  label: string;
  /** Heure de passage, affichée en mode course. */
  sublabel?: string;
};

/** Portion du parcours affichée, en mètres. */
export type ProfileView = { start: number; end: number };

export type ProfileVariant = "compact" | "focus";

type Props = {
  track: Track;
  markers: ProfileMarker[];
  cursor: number | null;
  /** Sans ce callback, le profil ne gère pas le pointeur (le parent gère zoom et déplacement). */
  onCursorChange?: (distance: number | null) => void;
  view?: ProfileView;
  variant?: ProfileVariant;
  /** Position GPS du coureur sur le parcours (stale = signal perdu depuis un moment). */
  position?: { distance: number; stale: boolean } | null;
};

const LAYOUTS = {
  compact: {
    height: 210 as number | null,
    margin: { top: 34, right: 12, bottom: 22, left: 42 },
    tickFont: 10,
    label: { width: 34, height: 13, top: 2, rowGap: 14 },
    aid: { width: 0, height: 0 },
  },
  focus: {
    // Hauteur = celle du conteneur.
    height: null as number | null,
    margin: { top: 88, right: 14, bottom: 28, left: 46 },
    tickFont: 13,
    label: { width: 62, height: 38, top: 4, rowGap: 44 },
    aid: { width: 74, height: 34 },
  },
} satisfies Record<ProfileVariant, unknown>;

export const GRADE_CLASSES = [
  { max: 5, color: "#86efac", label: "< 5 %" },
  { max: 10, color: "#fde047", label: "5–10 %" },
  { max: 15, color: "#fdba74", label: "10–15 %" },
  { max: 25, color: "#f87171", label: "15–25 %" },
  { max: Infinity, color: "#a21caf", label: "> 25 %" },
];

function gradeColor(grade: number): string {
  const abs = Math.abs(grade);
  return (GRADE_CLASSES.find((c) => abs < c.max) ?? GRADE_CLASSES[GRADE_CLASSES.length - 1]).color;
}

function niceStep(range: number, targetTicks: number, steps: number[]): number {
  return steps.find((s) => range / s <= targetTicks) ?? steps[steps.length - 1];
}

/** Position horizontale de la zone de tracé, pour convertir un clientX en distance. */
export function profilePlotArea(width: number, variant: ProfileVariant) {
  const { margin } = LAYOUTS[variant];
  return { left: margin.left, plotW: Math.max(0, width - margin.left - margin.right) };
}

/** Répartit les étiquettes sur deux lignes pour limiter les chevauchements. */
function assignRows<T extends { px: number }>(items: T[], minGap: number): (T & { row: number })[] {
  const last = [-Infinity, -Infinity];
  return [...items]
    .sort((a, b) => a.px - b.px)
    .map((item) => {
      let row = item.px - last[0] >= minGap ? 0 : item.px - last[1] >= minGap ? 1 : -1;
      if (row === -1) row = last[0] <= last[1] ? 0 : 1;
      last[row] = item.px;
      return { ...item, row };
    });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function ElevationProfile({
  track,
  markers,
  cursor,
  onCursorChange,
  view,
  variant = "compact",
  position = null,
}: Props) {
  const layout = LAYOUTS[variant];
  const M = layout.margin;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // Mesure immédiate : le ResizeObserver peut tarder (onglet en arrière-plan).
    const rect = el.getBoundingClientRect();
    setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = track.totalDistance;
  const start = view?.start ?? 0;
  const end = view?.end ?? total;
  const span = Math.max(1, end - start);
  const width = size.width;
  const height = layout.height ?? size.height;
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = Math.max(0, height - M.top - M.bottom);
  const plotBottom = M.top + plotH;

  const chart = useMemo(() => {
    if (plotW <= 0 || plotH <= 0) return null;
    const columns = Math.max(1, Math.round(plotW));

    // Enveloppe exacte de la trace par colonne de pixels : altitude aux bords + points GPS inclus.
    const edges = new Float64Array(columns + 1);
    for (let c = 0; c <= columns; c++) edges[c] = sampleAt(track, start + (c / columns) * span).ele;
    const colMax = new Float64Array(columns);
    for (let c = 0; c < columns; c++) colMax[c] = Math.max(edges[c], edges[c + 1]);
    const last = Math.min(track.count - 1, indexAtDistance(track, end) + 1);
    for (let i = indexAtDistance(track, start); i <= last; i++) {
      const ratio = (track.dist[i] - start) / span;
      if (ratio < 0 || ratio >= 1) continue;
      const col = Math.floor(ratio * columns);
      if (track.ele[i] > colMax[col]) colMax[col] = track.ele[i];
    }

    // Échelle d'altitude fixe (tout le parcours) : les pentes restent comparables en zoomant.
    const range = Math.max(track.maxEle - track.minEle, 20);
    const eleStep = niceStep(range, Math.max(3, Math.floor(plotH / 70)), [10, 20, 25, 50, 100, 200, 250, 500, 1000]);
    const yMin = Math.floor((track.minEle - range * 0.05) / eleStep) * eleStep;
    const yMax = Math.ceil((track.maxEle + range * 0.05) / eleStep) * eleStep;
    const y = (ele: number) => M.top + ((yMax - ele) / (yMax - yMin)) * plotH;

    // Couleur = pente moyenne par tronçon homogène (~1/120 de la vue, 100 m min) : lisible, sans bruit GPS.
    const sectionLength = Math.max(100, span / 120);
    const sectionColors = new Map<number, string>();
    const colorAt = (distance: number) => {
      const s = Math.floor(distance / sectionLength);
      let color = sectionColors.get(s);
      if (!color) {
        color = gradeColor(gradeBetween(track, s * sectionLength, (s + 1) * sectionLength));
        sectionColors.set(s, color);
      }
      return color;
    };

    const bars = Array.from({ length: columns }, (_, c) => ({
      x: M.left + (c / columns) * plotW,
      y: y(colMax[c]),
      color: colorAt(start + ((c + 0.5) / columns) * span),
    }));
    const line = bars
      .map((b, c) => `${c === 0 ? "M" : "L"}${b.x.toFixed(1)},${b.y.toFixed(1)}`)
      .join("");

    const eleTicks: number[] = [];
    for (let e = yMin; e <= yMax; e += eleStep) eleTicks.push(e);

    const kmStep = niceStep(span / 1000, Math.max(3, Math.floor(plotW / 60)), [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]);
    const kmTicks: { km: number; text: string }[] = [];
    for (let k = Math.ceil(start / 1000 / kmStep - 1e-9); k * kmStep <= end / 1000 + 1e-9; k++) {
      const km = Math.round(k * kmStep * 10) / 10;
      kmTicks.push({ km, text: kmStep < 1 ? km.toFixed(1).replace(".", ",") : String(km) });
    }

    return { bars, line, y, eleTicks, kmTicks, columnWidth: plotW / columns };
  }, [track, start, end, span, plotW, plotH, M]);

  const x = (distance: number) => M.left + ((distance - start) / span) * plotW;
  const inView = (distance: number) => distance >= start - 1 && distance <= end + 1;

  const checkpointLabels = useMemo(
    () =>
      assignRows(
        markers
          .filter((m) => m.kind === "checkpoint" && m.distance >= start - 1 && m.distance <= end + 1)
          .map((m) => ({ ...m, px: M.left + ((m.distance - start) / span) * plotW })),
        layout.label.width + 4,
      ),
    [markers, start, end, span, plotW, M, layout],
  );

  const aidLabels = useMemo(
    () =>
      assignRows(
        markers
          .filter((m) => m.kind === "aid" && m.distance >= start - 1 && m.distance <= end + 1)
          .map((m) => ({ ...m, px: M.left + ((m.distance - start) / span) * plotW })),
        layout.aid.width + 4,
      ),
    [markers, start, end, span, plotW, M, layout],
  );

  const distanceFromEvent = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - M.left) / plotW;
    return start + Math.min(1, Math.max(0, ratio)) * span;
  };

  const cursorSample = cursor === null || !inView(cursor) ? null : sampleAt(track, cursor);
  const positionSample = position && inView(position.distance) ? sampleAt(track, position.distance) : null;
  // Partie déjà courue (grisée), limitée à la zone affichée.
  const doneWidth = position ? Math.min(plotW, Math.max(0, x(position.distance) - M.left)) : 0;
  const focus = variant === "focus";
  const { label } = layout;

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full select-none ${focus ? "h-full" : ""}`}
      style={focus ? undefined : { height: layout.height ?? undefined }}
    >
      {chart && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={`block ${onCursorChange ? "touch-pan-y" : ""}`}
          role="img"
          aria-label="Profil altimétrique"
          onPointerDown={
            onCursorChange &&
            ((e) => {
              onCursorChange(distanceFromEvent(e));
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Pointeur déjà relâché : le glisser ne sera simplement pas capturé.
              }
            })
          }
          onPointerMove={
            onCursorChange &&
            ((e) => {
              if (e.pointerType === "mouse" || e.buttons > 0) onCursorChange(distanceFromEvent(e));
            })
          }
        >
          <defs>
            <clipPath id={`plot-${variant}`}>
              <rect x={M.left} y={0} width={plotW} height={height} />
            </clipPath>
          </defs>

          {chart.eleTicks.map((e) => (
            <g key={`e${e}`}>
              <line x1={M.left} x2={M.left + plotW} y1={chart.y(e)} y2={chart.y(e)} stroke="#e7e5e4" />
              <text
                x={M.left - 6}
                y={chart.y(e) + layout.tickFont * 0.35}
                textAnchor="end"
                fontSize={layout.tickFont}
                className="fill-stone-500"
              >
                {e}
              </text>
            </g>
          ))}

          {chart.bars.map((b, i) => (
            <rect
              key={i}
              x={b.x}
              y={b.y}
              width={chart.columnWidth + 0.6}
              height={Math.max(0, plotBottom - b.y)}
              fill={b.color}
            />
          ))}
          <path d={chart.line} fill="none" stroke="#44403c" strokeWidth={focus ? 2 : 1.4} />
          {doneWidth > 0 && (
            <rect x={M.left} y={M.top} width={doneWidth} height={plotH} fill="#f5f5f4" opacity={0.6} />
          )}

          {chart.kmTicks.map((t) => (
            <text
              key={`k${t.km}`}
              x={x(t.km * 1000)}
              y={height - (focus ? 8 : 6)}
              textAnchor="middle"
              fontSize={layout.tickFont}
              className="fill-stone-500"
            >
              {t.text}
            </text>
          ))}

          <g clipPath={`url(#plot-${variant})`}>
            {aidLabels.map((m) => {
              const pillY = plotBottom - 6 - layout.aid.height - m.row * (layout.aid.height + 6);
              return (
                <g key={m.key}>
                  <line
                    x1={m.px}
                    x2={m.px}
                    y1={M.top}
                    y2={focus ? pillY : plotBottom}
                    stroke="var(--aid)"
                    strokeWidth={focus ? 2 : 1.5}
                  />
                  {focus ? (
                    <>
                      <rect
                        x={m.px - layout.aid.width / 2}
                        y={pillY}
                        width={layout.aid.width}
                        height={layout.aid.height}
                        rx={6}
                        fill="var(--aid)"
                        stroke="#fff"
                        strokeWidth={1.5}
                      />
                      <text
                        x={m.px}
                        y={pillY + (m.sublabel ? 15 : 22)}
                        textAnchor="middle"
                        fontSize={13}
                        fontWeight={700}
                        className="fill-white"
                      >
                        {truncate(m.label, 10)}
                      </text>
                      {m.sublabel && (
                        <text x={m.px} y={pillY + 29} textAnchor="middle" fontSize={11} className="fill-white">
                          {m.sublabel}
                        </text>
                      )}
                    </>
                  ) : (
                    <>
                      <circle cx={m.px} cy={plotBottom - 7} r={6} fill="var(--aid)" stroke="#fff" strokeWidth={1.5} />
                      <text x={m.px} y={plotBottom - 4} textAnchor="middle" fontSize={8} fontWeight={700} className="fill-white">
                        R
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {checkpointLabels.map((m) => {
            const rectY = label.top + m.row * label.rowGap;
            return (
              <g key={m.key}>
                <line
                  x1={m.px}
                  x2={m.px}
                  y1={rectY + label.height}
                  y2={plotBottom}
                  stroke="var(--checkpoint)"
                  strokeWidth={focus ? 2 : 1.5}
                  strokeDasharray="4 3"
                />
                <rect
                  x={m.px - label.width / 2}
                  y={rectY}
                  width={label.width}
                  height={label.height}
                  rx={focus ? 6 : 3}
                  fill="var(--checkpoint)"
                />
                {focus ? (
                  <>
                    <text
                      x={m.px}
                      y={rectY + (m.sublabel ? 17 : 25)}
                      textAnchor="middle"
                      fontSize={16}
                      fontWeight={700}
                      className="fill-white"
                    >
                      {m.label}
                    </text>
                    {m.sublabel && (
                      <text x={m.px} y={rectY + 33} textAnchor="middle" fontSize={12} className="fill-white">
                        {m.sublabel}
                      </text>
                    )}
                  </>
                ) : (
                  <text x={m.px} y={rectY + 10} textAnchor="middle" fontSize={10} fontWeight={600} className="fill-white">
                    {m.label}
                  </text>
                )}
              </g>
            );
          })}

          {cursorSample && (
            <g pointerEvents="none">
              <line
                x1={x(cursorSample.distance)}
                x2={x(cursorSample.distance)}
                y1={M.top - 4}
                y2={plotBottom}
                stroke="#1c1917"
                strokeWidth={focus ? 2 : 1.5}
              />
              <circle
                cx={x(cursorSample.distance)}
                cy={chart.y(cursorSample.ele)}
                r={focus ? 7 : 5}
                fill="#1c1917"
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          )}

          {positionSample && (
            <g pointerEvents="none" opacity={position?.stale ? 0.45 : 1}>
              <line
                x1={x(positionSample.distance)}
                x2={x(positionSample.distance)}
                y1={M.top - 4}
                y2={plotBottom}
                stroke="var(--me)"
                strokeWidth={focus ? 3 : 2}
              />
              <circle cx={x(positionSample.distance)} cy={chart.y(positionSample.ele)} r={focus ? 17 : 11} fill="var(--me)" opacity={0.25} />
              <circle
                cx={x(positionSample.distance)}
                cy={chart.y(positionSample.ele)}
                r={focus ? 9 : 6}
                fill="var(--me)"
                stroke="#fff"
                strokeWidth={3}
              />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
