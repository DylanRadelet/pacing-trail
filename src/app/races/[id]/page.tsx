import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaceEditor } from "@/components/features/race/race-editor";
import { getRace } from "@/lib/race/storage";

export async function generateMetadata(props: PageProps<"/races/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const race = await getRace(id);
  return { title: race ? `${race.name} · Pacing Run` : "Course introuvable" };
}

export default async function RacePage(props: PageProps<"/races/[id]">) {
  const { id } = await props.params;
  const race = await getRace(id);
  if (!race) notFound();
  return <RaceEditor race={race} />;
}
