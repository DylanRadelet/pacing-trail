import type { CreateRaceInput, Race } from "./types";

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "course"
  );
}

function randomHex(bytes: number): string {
  // getRandomValues existe aussi hors HTTPS (contrairement à randomUUID).
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Nouvelle course à partir d'un GPX importé (utilisé côté PC et côté téléphone). */
export function buildNewRace(input: CreateRaceInput): Race {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: `${slugify(input.name)}-${randomHex(3)}`,
    name: input.name,
    sourceFile: input.sourceFile,
    createdAt: now,
    updatedAt: now,
    startTime: null,
    checkpoints: [],
    aidStations: input.aidStations,
    points: input.points,
  };
}
