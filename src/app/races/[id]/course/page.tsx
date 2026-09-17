import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaceFocus } from "@/components/features/race/race-focus";
import { getRace } from "@/lib/race/storage";

export async function generateMetadata(props: PageProps<"/races/[id]/course">): Promise<Metadata> {
  const { id } = await props.params;
  const race = await getRace(id);
  return { title: race ? `Course · ${race.name}` : "Course introuvable" };
}

export default async function RaceCoursePage(props: PageProps<"/races/[id]/course">) {
  const { id } = await props.params;
  const race = await getRace(id);
  if (!race) notFound();
  return <RaceFocus race={race} backHref={`/races/${race.id}`} />;
}
