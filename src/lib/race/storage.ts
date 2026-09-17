import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildTrack } from "./track";
import {
  RACE_ID_PATTERN,
  raceSchema,
  type CreateRaceInput,
  type Race,
  type RaceSummary,
  type UpdateRaceInput,
} from "./types";

// Une course = un fichier JSON lisible dans data/races/<id>.json
export const RACES_DIR = path.join(process.cwd(), "data", "races");

export function raceFilePath(id: string): string {
  if (!RACE_ID_PATTERN.test(id)) throw new Error(`Identifiant de course invalide : ${id}`);
  return path.join(RACES_DIR, `${id}.json`);
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "course"
  );
}

/** JSON indenté, mais un point GPS par ligne pour garder un fichier lisible. */
function serialize(race: Race): string {
  const marker = "__POINTS__";
  const head = JSON.stringify({ ...race, points: marker }, null, 2);
  const points = race.points.map((p) => `    ${JSON.stringify(p)}`).join(",\n");
  return `${head.replace(`"${marker}"`, `[\n${points}\n  ]`)}\n`;
}

async function writeRace(race: Race): Promise<void> {
  await fs.mkdir(RACES_DIR, { recursive: true });
  const file = raceFilePath(race.id);
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, serialize(race), "utf8");
  try {
    await fs.rename(tmp, file);
  } catch {
    // Windows peut refuser le rename si le fichier est ouvert ailleurs (éditeur, antivirus).
    await fs.writeFile(file, serialize(race), "utf8");
    await fs.rm(tmp, { force: true });
  }
}

export async function getRace(id: string): Promise<Race | null> {
  if (!RACE_ID_PATTERN.test(id)) return null;
  try {
    const raw = await fs.readFile(raceFilePath(id), "utf8");
    return raceSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listRaceSummaries(): Promise<RaceSummary[]> {
  let files: string[];
  try {
    files = await fs.readdir(RACES_DIR);
  } catch {
    return [];
  }
  const summaries: RaceSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const race = await getRace(file.slice(0, -".json".length)).catch(() => null);
    if (!race) continue;
    const track = buildTrack(race.points);
    summaries.push({
      id: race.id,
      name: race.name,
      updatedAt: race.updatedAt,
      distanceM: track.totalDistance,
      gainM: track.totalGain,
      checkpointCount: race.checkpoints.length,
      aidStationCount: race.aidStations.length,
    });
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createRace(input: CreateRaceInput): Promise<Race> {
  const now = new Date().toISOString();
  const race: Race = {
    version: 1,
    id: `${slugify(input.name)}-${randomBytes(3).toString("hex")}`,
    name: input.name,
    sourceFile: input.sourceFile,
    createdAt: now,
    updatedAt: now,
    startTime: null,
    checkpoints: [],
    aidStations: input.aidStations,
    points: input.points,
  };
  await writeRace(race);
  return race;
}

// Sérialise les écritures d'une même course (lecture → fusion → écriture).
const pendingWrites = new Map<string, Promise<unknown>>();

export async function updateRace(id: string, patch: UpdateRaceInput): Promise<Race | null> {
  const run = async () => {
    const race = await getRace(id);
    if (!race) return null;
    const updated: Race = { ...race, ...patch, updatedAt: new Date().toISOString() };
    await writeRace(updated);
    return updated;
  };
  const next = (pendingWrites.get(id) ?? Promise.resolve()).catch(() => undefined).then(run);
  pendingWrites.set(id, next);
  try {
    return await next;
  } finally {
    if (pendingWrites.get(id) === next) pendingWrites.delete(id);
  }
}

export async function deleteRace(id: string): Promise<boolean> {
  if (!RACE_ID_PATTERN.test(id)) return false;
  try {
    await fs.unlink(raceFilePath(id));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
