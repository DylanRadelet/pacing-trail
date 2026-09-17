"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { nearestOnTrack, sampleAt, type Track } from "@/lib/race/track";

export type MapMarker = {
  key: string;
  kind: "checkpoint" | "aid";
  distance: number;
  label: string;
  title: string;
};

type Props = {
  track: Track;
  markers: MapMarker[];
  cursor: number | null;
  onCursorChange: (distance: number | null) => void;
};

/** Rayon (px) autour de la trace dans lequel un tap place le curseur. */
const TAP_TOLERANCE_PX = 30;

const BASE_LAYERS = {
  Topo: () =>
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxNativeZoom: 17,
      maxZoom: 20,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    }),
  Plan: () =>
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxNativeZoom: 19,
      maxZoom: 20,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }),
  Satellite: () =>
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxNativeZoom: 19, maxZoom: 20, attribution: "Imagerie © Esri" },
    ),
};

function element(className: string, text: string, background?: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  if (background) el.style.background = background;
  return el;
}

function kmStep(totalKm: number): number {
  if (totalKm <= 40) return 1;
  if (totalKm <= 100) return 5;
  return 10;
}

export default function RaceMap({ track, markers, cursor, onCursorChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const cursorMarkerRef = useRef<L.Marker | null>(null);
  const onCursorChangeRef = useRef(onCursorChange);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, { preferCanvas: true, maxZoom: 20, zoomSnap: 0.5 });
    const layers = Object.fromEntries(
      Object.entries(BASE_LAYERS).map(([name, create]) => [name, create()]),
    );
    layers.Topo.addTo(map);
    L.control.layers(layers, undefined, { position: "topright" }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    // Tous les points GPS sont tracés, sans simplification (smoothFactor 0).
    const latLngs: L.LatLngTuple[] = [];
    for (let i = 0; i < track.count; i++) latLngs.push([track.lat[i], track.lon[i]]);
    const renderer = L.canvas({ tolerance: 10 });
    L.polyline(latLngs, {
      color: "#ffffff",
      weight: 8,
      opacity: 0.85,
      smoothFactor: 0,
      renderer,
      interactive: false,
    }).addTo(map);
    const line = L.polyline(latLngs, {
      color: "#dc2626",
      weight: 4,
      smoothFactor: 0,
      renderer,
      interactive: false,
    }).addTo(map);

    const totalKm = track.totalDistance / 1000;
    const step = kmStep(totalKm);
    for (let km = step; km < totalKm - step * 0.3; km += step) {
      const s = sampleAt(track, km * 1000);
      L.marker([s.lat, s.lon], {
        icon: L.divIcon({ className: "", html: element("map-km", String(km)), iconSize: [20, 20] }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
    }

    const endpoint = (i: number, text: string, color: string, title: string) =>
      L.marker([track.lat[i], track.lon[i]], {
        icon: L.divIcon({
          className: "",
          html: element("map-endpoint", text, color),
          iconSize: [26, 26],
        }),
        title,
        keyboard: false,
      }).addTo(map);
    endpoint(track.count - 1, "A", "#1c1917", "Arrivée");
    endpoint(0, "D", "#16a34a", "Départ");

    markersLayerRef.current = L.layerGroup().addTo(map);
    // Marqueur HTML (et non canvas) pour rester au-dessus des bornes kilométriques.
    cursorMarkerRef.current = L.marker([track.lat[0], track.lon[0]], {
      icon: L.divIcon({ className: "", html: element("map-cursor", ""), iconSize: [18, 18] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 10000,
    });

    map.on("click", (event: L.LeafletMouseEvent) => {
      const near = nearestOnTrack(track, event.latlng.lat, event.latlng.lng);
      const s = sampleAt(track, near.distance);
      const px = map.latLngToContainerPoint([s.lat, s.lon]).distanceTo(event.containerPoint);
      onCursorChangeRef.current(px <= TAP_TOLERANCE_PX ? near.distance : null);
    });

    map.fitBounds(line.getBounds(), { padding: [24, 24] });
    mapRef.current = map;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      cursorMarkerRef.current = null;
    };
  }, [track]);

  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const marker of markers) {
      const s = sampleAt(track, marker.distance);
      L.marker([s.lat, s.lon], {
        icon: L.divIcon({
          className: "",
          html: element(`map-pin map-pin--${marker.kind}`, marker.label),
          iconSize: [0, 0],
        }),
        title: marker.title,
        keyboard: false,
        zIndexOffset: marker.kind === "checkpoint" ? 200 : 100,
      })
        .on("click", () => onCursorChangeRef.current(marker.distance))
        .addTo(layer);
    }
  }, [markers, track]);

  useEffect(() => {
    const map = mapRef.current;
    const cursorMarker = cursorMarkerRef.current;
    if (!map || !cursorMarker) return;
    if (cursor === null) {
      cursorMarker.remove();
      return;
    }
    const s = sampleAt(track, cursor);
    cursorMarker.setLatLng([s.lat, s.lon]).addTo(map);
    if (!map.getBounds().pad(-0.1).contains([s.lat, s.lon])) map.panTo([s.lat, s.lon]);
  }, [cursor, track]);

  return <div ref={containerRef} className="h-full w-full" />;
}
