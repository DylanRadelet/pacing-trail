"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { RaceEditor } from "@/components/features/race/race-editor";
import { RaceFocus } from "@/components/features/race/race-focus";
import { readLocalRace } from "@/lib/race/browser-store";
import type { Race } from "@/lib/race/types";

const noopSubscribe = () => () => {};

export function PhoneLoading() {
  return <p className="p-6 text-center text-sm text-stone-500">Chargement…</p>;
}

/** Course stockée sur le téléphone, affichée en plan (éditable) ou en mode course. */
export function LocalRaceView({ view }: { view: "plan" | "course" }) {
  const id = useSearchParams().get("id");
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // Lu une seule fois par course : les enregistrements automatiques ne rechargent pas la vue.
  const race = useMemo<Race | null>(() => {
    if (!hydrated || !id) return null;
    try {
      return readLocalRace(id);
    } catch {
      return null;
    }
  }, [hydrated, id]);

  if (!hydrated) return <PhoneLoading />;
  if (!race) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="mb-4 font-semibold">Course introuvable sur ce téléphone.</p>
        <Link href="/telephone" className="rounded-xl bg-stone-900 px-4 py-3 font-semibold text-white">
          Mes courses
        </Link>
      </main>
    );
  }

  return view === "plan" ? (
    <RaceEditor race={race} mode="browser" />
  ) : (
    <RaceFocus race={race} backHref={`/telephone/plan?id=${encodeURIComponent(race.id)}`} />
  );
}
