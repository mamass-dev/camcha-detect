import { NextResponse } from "next/server";
import { calculerComptes, classer } from "@/lib/scoring";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function champCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  try {
    const top30 = classer(await calculerComptes()).slice(0, 30);
    const entetes = [
      "raison_sociale", "commune", "effectif", "score_fit", "criteres_fit",
      "score_moment", "criteres_moment", "motif_1", "source_motif_1",
      "motif_2", "source_motif_2", "motif_3", "source_motif_3",
    ];
    const lignes = top30.map((c) =>
      [
        c.raison_sociale,
        c.commune,
        c.effectif_tranche === "12" ? "20 à 49" : "11 à 19",
        c.fit ?? "",
        `${c.fit_criteres}/${c.fit_criteres_total}`,
        c.moment ?? "",
        `${c.moment_criteres}/${c.moment_criteres_total}`,
        ...[0, 1, 2].flatMap((i) => [c.motifs[i]?.texte ?? "", c.motifs[i]?.source_url ?? ""]),
      ]
        .map(champCsv)
        .join(";")
    );
    const csv = "﻿" + [entetes.join(";"), ...lignes].join("\n"); // BOM pour Excel
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="camcha-top30-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
