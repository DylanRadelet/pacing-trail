import type { NextRequest } from "next/server";
import { deleteRace, getRace, IS_HOSTED, READ_ONLY_RESPONSE, updateRace } from "@/lib/race/storage";
import { updateRaceSchema } from "@/lib/race/types";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/races/[id]">) {
  const { id } = await ctx.params;
  const race = await getRace(id);
  if (!race) return Response.json({ error: "Course introuvable" }, { status: 404 });
  // ?download=1 : fichier à envoyer sur le téléphone puis à importer dans la version en ligne.
  if (request.nextUrl.searchParams.get("download") === "1") {
    return Response.json(race, {
      headers: { "Content-Disposition": `attachment; filename="${race.id}.json"` },
    });
  }
  return Response.json(race);
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/races/[id]">) {
  if (IS_HOSTED) return READ_ONLY_RESPONSE();
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateRaceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Modification invalide", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const race = await updateRace(id, parsed.data);
  if (!race) return Response.json({ error: "Course introuvable" }, { status: 404 });
  return Response.json({ updatedAt: race.updatedAt });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/races/[id]">) {
  if (IS_HOSTED) return READ_ONLY_RESPONSE();
  const { id } = await ctx.params;
  const deleted = await deleteRace(id);
  if (!deleted) return Response.json({ error: "Course introuvable" }, { status: 404 });
  return new Response(null, { status: 204 });
}
