"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SECTEURS } from "@/lib/demo";

export type Ligne = {
  siren: string; nom: string; raison_sociale: string; commune: string; departement: string; effectif: string; secteur: string; ape: string;
  fit: number; moment: number; moment_n: number; sante: "vert" | "orange" | "rouge"; recrute: boolean; marche: boolean; site: boolean; decideur: boolean;
  dernier: string | null; ville_ref: [string, number];
};

const FEU = { vert: "var(--ok)", orange: "var(--warn)", rouge: "var(--err)" };

export function Tableau({ lignes }: { lignes: Ligne[] }) {
  const [q, setQ] = useState("");
  const [ville, setVille] = useState("");
  const [secteur, setSecteur] = useState("");
  const [uniquement, setUniquement] = useState<"" | "moment" | "recrute" | "marche" | "site">("");
  const [tri, setTri] = useState<"moment" | "fit" | "dernier">("moment");

  const villes = useMemo(() => [...new Set(lignes.map((l) => l.ville_ref[0]))].sort(), [lignes]);
  const secteurs = useMemo(() => [...new Set(lignes.map((l) => l.secteur))].filter(Boolean).sort(), [lignes]);

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return lignes
      .filter((l) => !n || l.nom.toLowerCase().includes(n) || l.raison_sociale.toLowerCase().includes(n) || l.commune.toLowerCase().includes(n))
      .filter((l) => !ville || l.ville_ref[0] === ville)
      .filter((l) => !secteur || l.secteur === secteur)
      .filter((l) => uniquement === "" || (uniquement === "moment" ? l.moment_n > 0 : uniquement === "recrute" ? l.recrute : uniquement === "marche" ? l.marche : l.site))
      .sort((a, b) => tri === "fit" ? b.fit - a.fit || b.moment - a.moment : tri === "dernier" ? (b.dernier ?? "").localeCompare(a.dernier ?? "") : b.moment - a.moment || b.fit - a.fit);
  }, [lignes, q, ville, secteur, uniquement, tri]);

  const sel = "text-[13px] px-2.5 py-1.5 rounded-md border bg-transparent";
  const st = { borderColor: "var(--line)", color: "var(--ink)", background: "var(--surface)" };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, une commune…" className={`${sel} min-w-56`} style={st} />
        <select value={ville} onChange={(e) => setVille(e.target.value)} className={sel} style={st}>
          <option value="">Toutes les villes de référence</option>
          {villes.map((v) => <option key={v} value={v}>Autour de {v}</option>)}
        </select>
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className={sel} style={st}>
          <option value="">Tous les secteurs</option>
          {secteurs.map((s) => <option key={s} value={s}>{SECTEURS[s] ?? s}</option>)}
        </select>
        <select value={uniquement} onChange={(e) => setUniquement(e.target.value as typeof uniquement)} className={sel} style={st}>
          <option value="">Toutes</option>
          <option value="moment">Avec un signal de timing</option>
          <option value="recrute">Recrutent en ce moment</option>
          <option value="marche">Marché public remporté</option>
          <option value="site">Site web identifié</option>
        </select>
        <select value={tri} onChange={(e) => setTri(e.target.value as typeof tri)} className={sel} style={st}>
          <option value="moment">Tri : MOMENT puis FIT</option>
          <option value="fit">Tri : FIT puis MOMENT</option>
          <option value="dernier">Tri : signal le plus récent</option>
        </select>
        <span className="text-[12.5px] ml-auto tabular-nums" style={{ color: "var(--muted)" }}>{filtrees.length} compte(s)</span>
      </div>

      <div className="carte overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}>
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Entreprise</th>
              <th className="px-3 py-2.5 font-medium">Commune</th>
              <th className="px-3 py-2.5 font-medium">Effectif</th>
              <th className="px-3 py-2.5 font-medium">Secteur</th>
              <th className="px-3 py-2.5 font-medium text-right">Moment</th>
              <th className="px-3 py-2.5 font-medium text-right">Fit</th>
              <th className="px-3 py-2.5 font-medium">Santé</th>
              <th className="px-3 py-2.5 font-medium">Signaux</th>
              <th className="px-3 py-2.5 font-medium">Dernier signal</th>
            </tr>
          </thead>
          <tbody>
            {filtrees.map((l, i) => (
              <tr key={l.siren} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--muted)" }}>{i + 1}</td>
                <td className="px-3 py-2">
                  <Link href={`/demo/comptes/${l.siren}`} className="font-medium hover:underline underline-offset-2">{l.nom}</Link>
                  {l.nom !== l.raison_sociale && <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>{l.raison_sociale}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{l.commune} <span style={{ color: "var(--muted)" }}>· {l.ville_ref[1]} km</span></td>
                <td className="px-3 py-2 whitespace-nowrap">{l.effectif}</td>
                <td className="px-3 py-2">{SECTEURS[l.secteur] ?? l.ape}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: l.moment > 0 ? "var(--moment-ink)" : "var(--muted)" }}>{l.moment}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--fit-ink)" }}>{l.fit}</td>
                <td className="px-3 py-2"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: FEU[l.sante] }} /></td>
                <td className="px-3 py-2 whitespace-nowrap text-[12px]" style={{ color: "var(--muted)" }}>
                  {l.recrute && "Recrute "}{l.marche && "· Marché "}{l.site && "· Site "}{l.decideur && "· Décideur"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "var(--muted)" }}>{l.dernier ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
