// Courses importées sur le téléphone (version en ligne) : stockées dans le navigateur, disponibles hors-ligne.
import { raceSchema, type Race, type UpdateRaceInput } from "./types";

const KEY_PREFIX = "pacing-run:race:";
const CHANGE_EVENT = "pacing-run:races-changed";
/** Incrémenté à chaque écriture : invalide la liste même si les identifiants ne changent pas. */
let revision = 0;

function notifyChange() {
  revision++;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function subscribeLocalRaces(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key && !event.key.startsWith(KEY_PREFIX)) return;
    revision++;
    callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

/** Révision puis identifiants des courses, une par ligne (chaîne stable pour useSyncExternalStore). */
export function localRacesSnapshot(): string {
  const store = storage();
  if (!store) return String(revision);
  const ids: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(KEY_PREFIX)) ids.push(key.slice(KEY_PREFIX.length));
  }
  return [revision, ...ids.sort()].join("\n");
}

export function readLocalRace(id: string): Race | null {
  const raw = storage()?.getItem(KEY_PREFIX + id);
  if (!raw) return null;
  return raceSchema.parse(JSON.parse(raw));
}

export function saveLocalRace(race: Race): void {
  const store = storage();
  if (!store) throw new Error("Le stockage du navigateur est indisponible (navigation privée ?).");
  try {
    store.setItem(KEY_PREFIX + race.id, JSON.stringify(race));
  } catch {
    throw new Error("Plus de place dans le stockage du téléphone : supprime une ancienne course.");
  }
  notifyChange();
}

export function updateLocalRace(id: string, patch: UpdateRaceInput): void {
  const race = readLocalRace(id);
  if (!race) throw new Error("Course introuvable sur ce téléphone.");
  saveLocalRace({ ...race, ...patch, updatedAt: new Date().toISOString() });
}

export function deleteLocalRace(id: string): void {
  storage()?.removeItem(KEY_PREFIX + id);
  notifyChange();
}

/** Valide un fichier JSON exporté depuis le PC et l'enregistre. Renvoie la course et si elle existait déjà. */
export function importRaceJson(text: string): { race: Race; replaced: boolean } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  const parsed = raceSchema.safeParse(data);
  if (!parsed.success) throw new Error("Ce JSON n'est pas une course Pacing Run.");
  const replaced = storage()?.getItem(KEY_PREFIX + parsed.data.id) != null;
  saveLocalRace(parsed.data);
  return { race: parsed.data, replaced };
}
