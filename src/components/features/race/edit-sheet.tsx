"use client";

import { CupSoda, Timer, Trash, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  formatDuration,
  formatElevation,
  formatKm,
  formatPace,
  parseKm,
  roundKm,
} from "@/lib/race/format";
import { kmToDistance, plannedTimeAt } from "@/lib/race/plan";
import { sampleAt, type Track } from "@/lib/race/track";
import type { AidStation, Checkpoint } from "@/lib/race/types";
import { createId } from "@/lib/utils/id";

export type EditTarget =
  | { kind: "checkpoint"; item: Checkpoint | null; km: number }
  | { kind: "aid"; item: AidStation | null; km: number };

type Props = {
  target: EditTarget;
  track: Track;
  checkpoints: Checkpoint[];
  onSaveCheckpoint: (checkpoint: Checkpoint) => void;
  onSaveAid: (aid: AidStation) => void;
  onDelete: (target: EditTarget) => void;
  onKmPreview: (distance: number) => void;
  onClose: () => void;
};

const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function EditSheet({
  target,
  track,
  checkpoints,
  onSaveCheckpoint,
  onSaveAid,
  onDelete,
  onKmPreview,
  onClose,
}: Props) {
  const isCheckpoint = target.kind === "checkpoint";
  const checkpoint = target.kind === "checkpoint" ? target.item : null;
  const aid = target.kind === "aid" ? target.item : null;

  const [kmText, setKmText] = useState(String(roundKm(target.km)).replace(".", ","));
  const [label, setLabel] = useState(checkpoint?.label ?? aid?.name ?? "");
  const [notes, setNotes] = useState(aid?.notes ?? "");
  const initialPlanned = plannedTimeAt(track, checkpoints, kmToDistance(track, target.km));
  const initialSec = checkpoint?.timeSec ?? Math.round((initialPlanned?.timeSec ?? 0) / 60) * 60;
  const [hours, setHours] = useState(String(Math.floor(initialSec / 3600)));
  const [minutes, setMinutes] = useState(String(Math.round((initialSec % 3600) / 60)));

  const totalKm = track.totalDistance / 1000;
  const km = parseKm(kmText);
  const kmError =
    km === null ? "Distance invalide" : km > totalKm + 0.005 ? `Max ${formatKm(track.totalDistance)} km` : null;
  const h = Number.parseInt(hours || "0", 10);
  const min = Number.parseInt(minutes || "0", 10);
  const timeError =
    isCheckpoint && (!Number.isInteger(h) || h < 0 || !Number.isInteger(min) || min < 0 || min > 59)
      ? "Heures ≥ 0 et minutes entre 0 et 59"
      : null;
  const timeSec = h * 3600 + min * 60;

  const distance = km === null ? null : kmToDistance(track, km);
  const sample = distance === null ? null : sampleAt(track, distance);

  // Aperçu de l'allure depuis le passage précédent, pour vérifier la cohérence du plan.
  const others = checkpoints.filter((c) => c.id !== checkpoint?.id);
  const previous =
    distance === null
      ? null
      : others
          .map((c) => ({ c, d: kmToDistance(track, c.km) }))
          .filter(({ d }) => d < distance)
          .sort((a, b) => b.d - a.d)[0] ?? null;
  const previousDistance = previous?.d ?? 0;
  const previousTime = previous?.c.timeSec ?? 0;
  const previousSample = sampleAt(track, previousDistance);
  const segmentDistance = distance === null ? 0 : distance - previousDistance;
  const segmentDuration = timeSec - previousTime;
  const aidPlanned = distance === null ? null : plannedTimeAt(track, checkpoints, distance);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (km === null || kmError || timeError) return;
    const cleanKm = roundKm(Math.min(km, totalKm));
    if (target.kind === "checkpoint") {
      onSaveCheckpoint({
        id: checkpoint?.id ?? createId(),
        km: cleanKm,
        label: label.trim(),
        timeSec,
      });
    } else {
      onSaveAid({
        id: aid?.id ?? createId(),
        km: cleanKm,
        name: label.trim(),
        notes: notes.trim(),
      });
    }
  };

  const existing = target.item !== null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center gap-2">
          {isCheckpoint ? (
            <Timer className="size-5 text-checkpoint" />
          ) : (
            <CupSoda className="size-5 text-aid" />
          )}
          <h2 className="flex-1 text-lg font-semibold">
            {existing ? "Modifier" : "Ajouter"} {isCheckpoint ? "un temps de passage" : "un ravitaillement"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-stone-100" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Field
            label="Kilomètre"
            hint={
              kmError ??
              (sample &&
                `Altitude ${formatElevation(sample.ele)} · D+ depuis le départ ${formatElevation(sample.gain)}`)
            }
          >
            <input
              className={inputClass}
              inputMode="decimal"
              value={kmText}
              onChange={(e) => {
                setKmText(e.target.value);
                const value = parseKm(e.target.value);
                if (value !== null && value <= totalKm) onKmPreview(value * 1000);
              }}
              placeholder="ex. 5,1"
              required
            />
          </Field>

          <Field label={isCheckpoint ? "Repère" : "Nom du ravito"}>
            <input
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={isCheckpoint ? "ex. Sommet du mur" : "ex. Ravito de la vallée"}
              maxLength={120}
            />
          </Field>

          {isCheckpoint ? (
            <Field
              label="Temps de passage (depuis le départ)"
              hint={
                timeError ??
                (segmentDistance > 0 &&
                  `Depuis ${previous ? `km ${formatKm(previousDistance)}` : "le départ"} : ${formatKm(segmentDistance)} km · D+ ${formatElevation((sample?.gain ?? 0) - previousSample.gain)} · ${segmentDuration > 0 ? formatPace(segmentDuration / (segmentDistance / 1000)) : "temps incohérent"}`)
              }
            >
              <div className="flex items-center gap-2">
                <input
                  className={`${inputClass} text-center`}
                  inputMode="numeric"
                  value={hours}
                  onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))}
                  aria-label="Heures"
                />
                <span className="font-semibold">h</span>
                <input
                  className={`${inputClass} text-center`}
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
                  aria-label="Minutes"
                />
                <span className="font-semibold">min</span>
              </div>
            </Field>
          ) : (
            <Field
              label="Notes"
              hint={
                aidPlanned && `Passage estimé ≈ ${formatDuration(aidPlanned.timeSec)} après le départ`
              }
            >
              <textarea
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ex. eau + coca, prendre 2 gels"
                rows={2}
                maxLength={500}
              />
            </Field>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          {existing && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Supprimer cet élément ?")) onDelete(target);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2.5 font-medium text-red-700 hover:bg-red-50"
            >
              <Trash className="size-4" />
              Supprimer
            </button>
          )}
          <button
            type="submit"
            disabled={Boolean(kmError || timeError)}
            className="flex-1 rounded-lg bg-stone-900 px-4 py-2.5 font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
