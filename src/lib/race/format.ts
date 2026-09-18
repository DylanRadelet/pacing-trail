/** 5100 → "5,10" */
export function formatKm(meters: number, digits = 2): string {
  return (meters / 1000).toFixed(digits).replace(".", ",");
}

/** 2220 → "0h37" (arrondi à la minute). */
export function formatDuration(totalSec: number): string {
  const minutes = Math.round(totalSec / 60);
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

/** Durée courte pour les écarts : "12 min", "1h05". */
export function formatShortDuration(totalSec: number): string {
  const minutes = Math.round(totalSec / 60);
  return Math.abs(minutes) < 60 ? `${minutes} min` : formatDuration(totalSec);
}

/** 435 → "7'15/km" */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm)) return "–";
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, "0")}/km`;
}

/** Heure de passage à partir de l'heure de départ "HH:MM". */
export function formatClock(startTime: string | null, elapsedSec: number): string | null {
  if (!startTime) return null;
  const [h, m] = startTime.split(":").map(Number);
  const minutes = (((h * 60 + m + Math.round(elapsedSec / 60)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatElevation(meters: number): string {
  return `${Math.round(meters)} m`;
}

export function formatGrade(percent: number): string {
  const rounded = Math.round(percent);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

/** Accepte "5,1", "5.1", " 16,40 ". */
export function parseKm(text: string): number | null {
  const value = Number.parseFloat(text.trim().replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Arrondi au mètre pour éviter les 5.1000000001 dans le JSON. */
export function roundKm(km: number): number {
  return Math.round(km * 1000) / 1000;
}

/** 3733 → "1:02:13" (chrono). */
export function formatElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Écart au plan : 125 → "+2:05" (retard), -80 → "−1:20" (avance). */
export function formatDelta(deltaSec: number): string {
  const s = Math.round(Math.abs(deltaSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}` : String(m);
  return `${deltaSec < 0 ? "−" : "+"}${body}:${String(s % 60).padStart(2, "0")}`;
}
