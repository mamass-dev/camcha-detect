import { classer, comptes, ligneCsv } from "@/lib/demo";

export const dynamic = "force-static";

export function GET() {
  const lignes: Array<Record<string, string | number>> = classer(comptes()).map((c, i) => ({ ...ligneCsv(c), rang: i + 1 }));
  const colonnes = Object.keys(lignes[0]);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = "﻿" + [colonnes.join(";"), ...lignes.map((l) => colonnes.map((k) => esc(l[k])).join(";"))].join("\r\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="camcha-comptes-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
