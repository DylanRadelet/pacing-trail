"use client";

import { CupSoda, Flag, Footprints, Timer, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import {
  formatClock,
  formatDuration,
  formatElevation,
  formatKm,
  formatPace,
  formatShortDuration,
} from "@/lib/race/format";
import type { PlannedTime, TimelineEntry } from "@/lib/race/plan";

type Props = {
  entries: TimelineEntry[];
  startTime: string | null;
  onSelect: (entry: TimelineEntry) => void;
};

function Planned({
  planned,
  startTime,
}: {
  planned: PlannedTime | null;
  startTime: string | null;
}) {
  if (!planned) return <span className="text-sm text-stone-400">pas de plan</span>;
  const approx = planned.kind !== "target";
  const clock = formatClock(startTime, planned.timeSec);
  return (
    <div className="text-right">
      <div
        className={`font-mono text-lg leading-tight font-bold tabular-nums ${approx ? "text-stone-500" : "text-stone-900"}`}
      >
        {approx && "≈"}
        {formatDuration(planned.timeSec)}
      </div>
      {clock && (
        <div className="font-mono text-xs text-stone-500 tabular-nums">
          {approx && "≈"}
          {clock}
        </div>
      )}
    </div>
  );
}

function Row({
  icon,
  title,
  meta,
  right,
  children,
  onClick,
}: {
  icon: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  right: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold break-words text-stone-900">{title}</div>
        <div className="text-xs text-stone-500">{meta}</div>
        {children}
      </div>
      <div className="shrink-0">{right}</div>
    </>
  );
  const className = "flex w-full items-start gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-stone-200";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:ring-stone-400`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function PlanTimeline({ entries, startTime, onSelect }: Props) {
  return (
    <ol className="space-y-1.5">
      {entries.map((entry) => (
        <li key={entry.key}>
          {entry.type === "checkpoint" && (
            <div
              className={`ml-5 flex flex-wrap items-center gap-x-2 border-l-2 border-dashed py-1.5 pl-4 text-xs ${entry.segment.inconsistent ? "border-red-400 text-red-700" : "border-stone-300 text-stone-600"}`}
            >
              {entry.segment.inconsistent && <TriangleAlert className="size-3.5" />}
              <span>{formatKm(entry.segment.distance)} km</span>
              <span>D+ {formatElevation(entry.segment.gain)}</span>
              <span>D- {formatElevation(entry.segment.loss)}</span>
              <span>{formatShortDuration(entry.segment.durationSec)}</span>
              <span className="font-semibold">
                {entry.segment.inconsistent ? "temps incohérent" : formatPace(entry.segment.paceSecPerKm)}
              </span>
            </div>
          )}

          {entry.type === "start" && (
            <Row
              icon={<Footprints className="size-5 text-green-600" />}
              title="Départ"
              meta={`km 0,00 · ${formatElevation(entry.ele)}`}
              right={<Planned planned={{ timeSec: 0, kind: "target" }} startTime={startTime} />}
            />
          )}

          {entry.type === "checkpoint" && (
            <Row
              onClick={() => onSelect(entry)}
              icon={<Timer className="size-5 text-checkpoint" />}
              title={entry.checkpoint.label || `Passage km ${formatKm(entry.distance, 1)}`}
              meta={`km ${formatKm(entry.distance)} · ${formatElevation(entry.ele)}`}
              right={<Planned planned={{ timeSec: entry.checkpoint.timeSec, kind: "target" }} startTime={startTime} />}
            />
          )}

          {entry.type === "aid" && (
            <Row
              onClick={() => onSelect(entry)}
              icon={<CupSoda className="size-5 text-aid" />}
              title={entry.aid.name || "Ravitaillement"}
              meta={
                <>
                  km {formatKm(entry.distance)} · {formatElevation(entry.ele)} ·{" "}
                  {formatKm(entry.sincePreviousAid.distance)} km
                  {entry.sincePreviousAid.durationSec !== null &&
                    ` (≈${formatShortDuration(entry.sincePreviousAid.durationSec)})`}{" "}
                  depuis {entry.sincePreviousAid.label}
                </>
              }
              right={<Planned planned={entry.planned} startTime={startTime} />}
            >
              {entry.aid.notes && (
                <div className="mt-1 text-sm whitespace-pre-line text-stone-700">{entry.aid.notes}</div>
              )}
            </Row>
          )}

          {entry.type === "finish" && (
            <Row
              icon={<Flag className="size-5 text-stone-900" />}
              title="Arrivée"
              meta={`km ${formatKm(entry.distance)} · ${formatElevation(entry.ele)}${entry.planned?.kind === "extrapolated" ? " · estimation à l'allure moyenne du plan" : ""}`}
              right={<Planned planned={entry.planned} startTime={startTime} />}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
