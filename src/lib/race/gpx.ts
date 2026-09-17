import type { TrackPoint } from "./types";

export type GpxWaypoint = { name: string; notes: string; lat: number; lon: number };

export type ParsedGpx = {
  name: string | null;
  points: TrackPoint[];
  waypoints: GpxWaypoint[];
};

function childText(el: Element, tag: string): string | null {
  for (const child of Array.from(el.children)) {
    if (child.localName === tag) return child.textContent?.trim() || null;
  }
  return null;
}

function readPoint(el: Element): TrackPoint | null {
  const lat = Number.parseFloat(el.getAttribute("lat") ?? "");
  const lon = Number.parseFloat(el.getAttribute("lon") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const eleText = childText(el, "ele");
  const ele = eleText === null ? null : Number.parseFloat(eleText);
  return [lat, lon, ele !== null && Number.isFinite(ele) ? ele : null];
}

/** Lit un GPX (navigateur uniquement) : tous les trkseg de toutes les traces, sinon la route. */
export function parseGpx(xml: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Le fichier n'est pas un GPX valide (XML illisible).");
  }
  const root = doc.documentElement;
  if (root.localName !== "gpx") {
    throw new Error("Le fichier n'est pas un GPX (balise <gpx> absente).");
  }

  const collect = (tag: string) =>
    Array.from(doc.getElementsByTagNameNS("*", tag))
      .map(readPoint)
      .filter((p): p is TrackPoint => p !== null);

  let points = collect("trkpt");
  if (points.length < 2) points = collect("rtept");
  if (points.length < 2) {
    throw new Error("Aucune trace trouvée dans le GPX (il faut au moins 2 points).");
  }

  const waypoints = Array.from(doc.getElementsByTagNameNS("*", "wpt")).flatMap((el) => {
    const p = readPoint(el);
    if (!p) return [];
    return [
      {
        name: childText(el, "name") ?? "Point",
        notes: childText(el, "desc") ?? childText(el, "cmt") ?? "",
        lat: p[0],
        lon: p[1],
      },
    ];
  });

  const metadata = Array.from(root.children).find((c) => c.localName === "metadata");
  const trk = doc.getElementsByTagNameNS("*", "trk")[0];
  const name =
    (metadata && childText(metadata, "name")) || (trk && childText(trk, "name")) || null;

  return { name, points, waypoints };
}
