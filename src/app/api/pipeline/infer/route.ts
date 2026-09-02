import { NextRequest, NextResponse } from "next/server";
import { inferChunk } from "@/lib/pipeline/infer";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { limite } = await req.json().catch(() => ({ limite: 2 }));
    return NextResponse.json(await inferChunk(Math.min(Number(limite) || 2, 5)));
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
