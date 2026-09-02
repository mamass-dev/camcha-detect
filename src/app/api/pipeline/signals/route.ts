import { NextRequest, NextResponse } from "next/server";
import { signalsChunk } from "@/lib/pipeline/signals";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { limite } = await req.json().catch(() => ({ limite: 10 }));
    return NextResponse.json(await signalsChunk(Math.min(Number(limite) || 10, 25)));
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
