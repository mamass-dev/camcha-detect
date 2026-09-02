import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig, Poids } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ poids: await getConfig<Poids>("poids") });
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { poids } = (await req.json()) as { poids: Poids };
    if (!poids?.fit || !poids?.moment) {
      return NextResponse.json({ erreur: "structure attendue : { fit, moment, valeur_probable }" }, { status: 400 });
    }
    for (const axe of [poids.fit, poids.moment]) {
      for (const [cle, v] of Object.entries(axe)) {
        if (typeof v !== "number" || v < 0 || v > 10) {
          return NextResponse.json({ erreur: `poids invalide pour ${cle} (0 à 10)` }, { status: 400 });
        }
      }
    }
    await setConfig("poids", poids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
