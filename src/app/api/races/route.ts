import { createRace, listRaceSummaries } from "@/lib/race/storage";
import { createRaceSchema } from "@/lib/race/types";

export async function GET() {
  return Response.json(await listRaceSummaries());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createRaceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Données de course invalides", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const race = await createRace(parsed.data);
  return Response.json({ id: race.id }, { status: 201 });
}
