import { classer, comptes } from "@/lib/demo";
import { Tableau } from "./tableau";

export const dynamic = "force-static";

export default function Comptes() {
  const liste = classer(comptes());
  const disqualifies = comptes().filter((c) => c.disqualifie);
  const lignes = liste.map((c) => ({
    siren: c.siren, nom: c.enseigne ?? c.nom_commercial ?? c.raison_sociale, raison_sociale: c.raison_sociale,
    commune: c.commune, departement: c.departement, effectif: c.effectif_libelle, secteur: c.secteur ?? "", ape: c.ape,
    fit: c.fit, moment: c.moment, moment_n: c.moment_n, sante: c.sante.niveau,
    recrute: c.signaux.some((s) => s.cle === "offres_actives"), marche: c.signaux.some((s) => s.cle === "marche_public"),
    site: Boolean(c.site), decideur: Boolean(c.decideurs.length), dernier: c.dernier_signal,
    ville_ref: Object.entries(c.distances).filter(([v]) => v !== "Dijon").sort((a, b) => a[1] - b[1])[0],
  }));
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Tous les comptes de la zone</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {liste.length} PME classées, {disqualifies.length} écartées pour procédure collective. Les scores sont recalculés depuis les signaux, jamais stockés.
        </p>
      </header>
      <Tableau lignes={lignes} />
      {disqualifies.length > 0 && (
        <details className="carte p-4">
          <summary className="cursor-pointer text-[13px] font-medium" style={{ color: "var(--err)" }}>Écartées ({disqualifies.length}) — procédure collective au BODACC</summary>
          <ul className="mt-2 flex flex-col gap-1 text-[13px]" style={{ color: "var(--muted)" }}>
            {disqualifies.map((c) => <li key={c.siren}>{c.raison_sociale} ({c.commune}) — {c.disqualifie}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
