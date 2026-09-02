import { NextResponse } from "next/server";
import { calculerComptes, classer, rapport } from "@/lib/scoring";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const comptes = await calculerComptes();
    return NextResponse.json({
      classement: classer(comptes),
      disqualifies: comptes.filter((c) => c.disqualifie),
      rapport: await rapport(),
    });
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
