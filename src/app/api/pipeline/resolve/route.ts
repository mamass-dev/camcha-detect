import { NextRequest, NextResponse } from "next/server";
import { resolveChunk } from "@/lib/pipeline/resolve";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { limite } = await req.json().catch(() => ({ limite: 5 }));
    return NextResponse.json(await resolveChunk(Math.min(Number(limite) || 5, 10)));
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
