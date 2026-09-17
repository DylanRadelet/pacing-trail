"use client";

import { Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteRaceButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Supprimer ${name}`}
      className="rounded-full p-2.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      onClick={async () => {
        if (!window.confirm(`Supprimer « ${name} » et son fichier JSON ?`)) return;
        setBusy(true);
        await fetch(`/api/races/${id}`, { method: "DELETE" });
        router.refresh();
        setBusy(false);
      }}
    >
      <Trash className="size-5" />
    </button>
  );
}
