import { NextRequest, NextResponse } from "next/server";
import { collect } from "@/lib/pipeline/collect";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { taille } = await req.json().catch(() => ({ taille: 300 }));
    const resultat = await collect(Math.min(Number(taille) || 300, 300));
    return NextResponse.json(resultat);
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
