import { NextRequest, NextResponse } from "next/server";
import { jetonSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { motDePasse } = await req.json().catch(() => ({ motDePasse: "" }));
  if (!process.env.APP_PASSWORD || motDePasse !== process.env.APP_PASSWORD) {
    return NextResponse.json({ erreur: "Mot de passe incorrect" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("camcha_session", await jetonSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
