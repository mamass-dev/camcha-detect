"use client";

import { useEffect, useState } from "react";

type Motif = { texte: string; source_url: string | null; observe_le: string };
type Compte = {
  siren: string;
  raison_sociale: string;
  commune: string | null;
  effectif_tranche: string | null;
  effectif_annee: string | null;
  domaine: string | null;
  telephone: string | null;
  disqualifie_motif: string | null;
  fit: number | null;
  fit_criteres: number;
  fit_criteres_total: number;
  moment: number | null;
  moment_criteres: number;
  moment_criteres_total: number;
  motifs: Motif[];
};

function Score({ valeur, criteres, total, axe }: { valeur: number | null; criteres: number; total: number; axe: "fit" | "moment" }) {
  const couleur = axe === "fit" ? "var(--fit-ink)" : "var(--moment-ink)";
  const fond = axe === "fit" ? "var(--fit-soft)" : "var(--moment-soft)";
  return (
    <span className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-md tabular-nums" style={{ background: fond, color: couleur }}>
      <b className="text-[15px]">{valeur ?? "—"}</b>
      <span className="text-[11px] opacity-80">{criteres}/{total} crit.</span>
    </span>
  );
}

export default function Comptes() {
  const [classement, setClassement] = useState<Compte[]>([]);
  const [disqualifies, setDisqualifies] = useState<Compte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/score")
      .then(async (r) => {
        const d = await r.json();
        if (d.erreur) throw new Error(d.erreur);
        setClassement(d.classement);
        setDisqualifies(d.disqualifies);
      })
      .catch((e) => setErreur(String(e)))
      .finally(() => setChargement(false));
  }, []);

  if (chargement) return <p style={{ color: "var(--muted)" }}>Calcul du classement…</p>;
  if (erreur) return <p style={{ color: "var(--err)" }}>{erreur}</p>;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Comptes classés</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Deux axes séparés — jamais de note fusionnée. Classement affiché : MOMENT puis FIT. Chaque motif est vérifiable via sa source.
          </p>
        </div>
        <a href="/api/export" className="bouton">Exporter le top 30 (CSV)</a>
      </header>

      {classement.length === 0 && <p style={{ color: "var(--muted)" }}>Aucun compte — lancez d&apos;abord le pipeline.</p>}

      <ol className="flex flex-col gap-3">
        {classement.map((c, i) => (
          <li key={c.siren} className="carte p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="w-8 text-right tabular-nums text-[13px] font-semibold" style={{ fontFamily: "var(--font-mono), monospace", color: i < 30 ? "var(--ink)" : "var(--muted)" }}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-52">
                <div className="font-semibold text-[15px]">{c.raison_sociale}</div>
                <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                  {c.commune ?? "—"} · {c.effectif_tranche === "12" ? "20 à 49" : "11 à 19"} salariés
                  {c.effectif_annee ? ` (${c.effectif_annee})` : ""}
                  {c.domaine && (
                    <> · <a href={c.domaine} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.domaine.replace(/^https?:\/\//, "")}</a></>
                  )}
                  {c.telephone && ` · ${c.telephone}`}
                </div>
              </div>
              <div className="flex gap-2">
                <Score valeur={c.fit} criteres={c.fit_criteres} total={c.fit_criteres_total} axe="fit" />
                <Score valeur={c.moment} criteres={c.moment_criteres} total={c.moment_criteres_total} axe="moment" />
              </div>
            </div>
            {c.motifs.length > 0 && (
              <ul className="mt-3 ml-12 flex flex-col gap-1">
                {c.motifs.map((m, j) => (
                  <li key={j} className="text-[13px] flex flex-wrap gap-x-2" style={{ color: "var(--muted)" }}>
                    <span>• {m.texte}</span>
                    {m.source_url && (
                      <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 shrink-0">
                        source ({m.observe_le})
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {disqualifies.length > 0 && (
        <section className="carte p-4" style={{ borderColor: "var(--err)" }}>
          <h2 className="font-semibold mb-2" style={{ fontFamily: "var(--font-display), sans-serif", color: "var(--err)" }}>
            Disqualifiées ({disqualifies.length})
          </h2>
          <ul className="flex flex-col gap-1 text-[13px]" style={{ color: "var(--muted)" }}>
            {disqualifies.map((c) => (
              <li key={c.siren}>{c.raison_sociale} — {c.disqualifie_motif}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
