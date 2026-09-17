import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildNewRace } from "./create";
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

/** Version en ligne (Vercel) : disque en lecture seule, les courses vivent sur le téléphone. */
export const IS_HOSTED = process.env.VERCEL === "1";

export const READ_ONLY_RESPONSE = () =>
  Response.json(
    { error: "Version en ligne : les courses sont enregistrées dans le téléphone, pas sur le serveur." },
    { status: 403 },
  );

export function raceFilePath(id: string): string {
  if (!RACE_ID_PATTERN.test(id)) throw new Error(`Identifiant de course invalide : ${id}`);
  return path.join(RACES_DIR, `${id}.json`);
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
  const race = buildNewRace(input);
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
