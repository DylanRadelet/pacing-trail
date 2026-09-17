"use client";

import { Component, type ReactNode } from "react";

/** Hors-ligne, le code de la carte peut ne pas être en cache : on garde le reste de la page utilisable. */
export class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-stone-500">
        Carte indisponible sans réseau. Le profil, le plan et le mode course fonctionnent.
      </div>
    );
  }
}
