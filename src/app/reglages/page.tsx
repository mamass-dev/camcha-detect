"use client";

import { useEffect, useState } from "react";

type Poids = { fit: Record<string, number>; moment: Record<string, number>; valeur_probable: number };

const LIBELLES: Record<string, string> = {
  idcc_renseigne: "Convention collective renseignée",
  anciennete_3ans: "Entreprise établie (3 ans+)",
  ess_ou_mission: "ESS ou société à mission",
  effectif_20_49: "Effectif 20-49",
  demarche_rse: "Démarche RSE",
  avantages_salaries_existants: "Avantages salariés existants",
  offres_actives: "Offres d'emploi actives",
  changement_dirigeant: "Changement de dirigeant",
  augmentation_capital: "Augmentation de capital",
  transfert_siege: "Transfert de siège",
  seminaire: "Séminaires internes",
  evenement_fin_annee: "Événement de fin d'année",
  croissance_effectif: "Croissance d'effectif",
};

export default function Reglages() {
  const [poids, setPoids] = useState<Poids | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config").then(async (r) => setPoids((await r.json()).poids));
  }, []);

  async function enregistrer() {
    setMessage(null);
    const r = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poids }),
    });
    const d = await r.json();
    setMessage(d.ok ? "Enregistré — le classement se recalcule immédiatement avec ces poids." : `Erreur : ${d.erreur}`);
  }

  if (!poids) return <p style={{ color: "var(--muted)" }}>Chargement…</p>;

  // Rendu via appel de fonction (pas un composant JSX) : évite le démontage/remontage
  // à chaque frappe qui ferait perdre le focus aux inputs.
  const axeBloc = ({ axe, titre, couleur }: { axe: "fit" | "moment"; titre: string; couleur: string }) => (
    <div className="carte p-5 flex flex-col gap-3" style={{ borderTop: `4px solid ${couleur}` }}>
      <h2 className="font-semibold" style={{ fontFamily: "var(--font-display), sans-serif" }}>{titre}</h2>
      {Object.entries(poids[axe]).map(([cle, v]) => (
        <label key={cle} className="flex items-center justify-between gap-4 text-[13.5px]">
          <span>{LIBELLES[cle] ?? cle}</span>
          <input
            type="number" min={0} max={10} step={0.5} value={v}
            onChange={(e) => setPoids({ ...poids, [axe]: { ...poids[axe], [cle]: Number(e.target.value) } })}
            className="carte w-20 px-2 py-1 text-right tabular-nums"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          />
        </label>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Poids de scoring</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Modifiables sans toucher au code. Un critère « inconnu » est exclu du calcul — le score se normalise sur les critères réellement renseignés.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {axeBloc({ axe: "fit", titre: "Axe FIT — statique", couleur: "var(--fit)" })}
        {axeBloc({ axe: "moment", titre: "Axe MOMENT — dynamique", couleur: "var(--moment)" })}
      </div>
      <label className="carte p-5 flex items-center justify-between gap-4 text-[13.5px]">
        <span>Valeur d&apos;un signal « probable » (entre 0 et 1)</span>
        <input
          type="number" min={0} max={1} step={0.1} value={poids.valeur_probable}
          onChange={(e) => setPoids({ ...poids, valeur_probable: Number(e.target.value) })}
          className="carte w-20 px-2 py-1 text-right tabular-nums"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        />
      </label>
      <div className="flex items-center gap-4">
        <button className="bouton" onClick={enregistrer}>Enregistrer</button>
        {message && <span className="text-[13px]" style={{ color: "var(--muted)" }}>{message}</span>}
      </div>
    </div>
  );
}
