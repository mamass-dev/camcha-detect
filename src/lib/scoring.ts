import { db, getConfig, Poids } from "./db";

const LIBELLES: Record<string, string> = {
  idcc_renseigne: "Convention collective renseignée",
  anciennete_3ans: "Entreprise établie (3 ans ou plus)",
  ess_ou_mission: "ESS ou société à mission",
  effectif_20_49: "Effectif dans le haut de la cible (20-49)",
  demarche_rse: "Démarche RSE affichée",
  avantages_salaries_existants: "Avantages salariés déjà en place",
  offres_actives: "Recrute activement (offres publiées sous 90 j)",
  changement_dirigeant: "Changement de dirigeant récent (BODACC)",
  augmentation_capital: "Augmentation de capital récente (BODACC)",
  transfert_siege: "Transfert de siège récent (BODACC)",
  seminaire: "Organise des séminaires internes",
  evenement_fin_annee: "Événement de fin d'année pour les salariés",
  croissance_effectif: "Croissance d'effectif visible",
};

export type Motif = { texte: string; source_url: string | null; observe_le: string };

export type Compte = {
  siren: string;
  raison_sociale: string;
  commune: string | null;
  effectif_tranche: string | null;
  effectif_annee: string | null;
  domaine: string | null;
  domaine_statut: string;
  telephone: string | null;
  disqualifie: boolean;
  disqualifie_motif: string | null;
  fit: number | null;
  fit_criteres: number;
  fit_criteres_total: number;
  moment: number | null;
  moment_criteres: number;
  moment_criteres_total: number;
  motifs: Motif[];
};

type SignalRow = {
  siren: string;
  cle: string;
  valeur: string;
  confiance: number | null;
  verbatim: string | null;
  source_url: string | null;
  observe_le: string;
  expire_le: string | null;
};

function valeurNumerique(valeur: string, probable: number): number | null {
  if (valeur === "oui") return 1;
  if (valeur === "probable") return probable;
  if (valeur === "non") return 0;
  return null; // « inconnu » : exclu du calcul, jamais compté comme zéro
}

function axe(
  poids: Record<string, number>,
  signaux: Map<string, SignalRow>,
  probable: number
): { score: number | null; criteres: number; total: number; contributions: Array<{ cle: string; produit: number; s: SignalRow }> } {
  let somme = 0;
  let sommePoids = 0;
  let criteres = 0;
  const contributions: Array<{ cle: string; produit: number; s: SignalRow }> = [];
  const maintenant = Date.now();
  for (const [cle, p] of Object.entries(poids)) {
    const s = signaux.get(cle);
    if (!s) continue;
    if (s.expire_le && new Date(s.expire_le).getTime() < maintenant) continue;
    const v = valeurNumerique(s.valeur, probable);
    if (v == null) continue;
    somme += p * v;
    sommePoids += p;
    criteres++;
    if (v > 0) contributions.push({ cle, produit: p * v, s });
  }
  return {
    score: sommePoids > 0 ? Math.round((100 * somme) / sommePoids) : null,
    criteres,
    total: Object.keys(poids).length,
    contributions,
  };
}

/** Les scores ne sont jamais stockés : tout est recalculé ici depuis les signaux. */
export async function calculerComptes(): Promise<Compte[]> {
  const poids: Poids = await getConfig("poids");
  const [entreprises, signaux] = await Promise.all([
    db().from("entreprise").select("siren,raison_sociale,commune,effectif_tranche,effectif_annee,domaine,domaine_statut,telephone,disqualifie,disqualifie_motif").order("siren"),
    db().from("signal").select("siren,cle,valeur,confiance,verbatim,source_url,observe_le,expire_le"),
  ]);
  if (entreprises.error) throw new Error(entreprises.error.message);
  if (signaux.error) throw new Error(signaux.error.message);

  const parSiren = new Map<string, Map<string, SignalRow>>();
  for (const s of (signaux.data ?? []) as SignalRow[]) {
    if (!parSiren.has(s.siren)) parSiren.set(s.siren, new Map());
    parSiren.get(s.siren)!.set(s.cle, s);
  }

  return (entreprises.data ?? []).map((e) => {
    const sigs = parSiren.get(e.siren) ?? new Map<string, SignalRow>();
    const fit = axe(poids.fit, sigs, poids.valeur_probable);
    const moment = axe(poids.moment, sigs, poids.valeur_probable);
    const motifs = [...fit.contributions, ...moment.contributions]
      .sort((a, b) => b.produit - a.produit)
      .slice(0, 3)
      .map((c) => ({
        texte: `${LIBELLES[c.cle] ?? c.cle}${c.s.verbatim ? ` — « ${c.s.verbatim.slice(0, 140)} »` : ""}`,
        source_url: c.s.source_url,
        observe_le: c.s.observe_le.slice(0, 10),
      }));
    return {
      siren: e.siren,
      raison_sociale: e.raison_sociale,
      commune: e.commune,
      effectif_tranche: e.effectif_tranche,
      effectif_annee: e.effectif_annee,
      domaine: e.domaine,
      domaine_statut: e.domaine_statut,
      telephone: e.telephone,
      disqualifie: e.disqualifie,
      disqualifie_motif: e.disqualifie_motif,
      fit: fit.score,
      fit_criteres: fit.criteres,
      fit_criteres_total: fit.total,
      moment: moment.score,
      moment_criteres: moment.criteres,
      moment_criteres_total: moment.total,
      motifs,
    };
  });
}

export function classer(comptes: Compte[]): Compte[] {
  // Classement par MOMENT puis FIT — les deux axes restent visibles séparément.
  return comptes
    .filter((c) => !c.disqualifie)
    .sort((a, b) => (b.moment ?? -1) - (a.moment ?? -1) || (b.fit ?? -1) - (a.fit ?? -1));
}

export async function rapport() {
  const [entreprises, halluc, appels, signauxInferes] = await Promise.all([
    db().from("entreprise").select("domaine_statut,signals_statut,infer_statut,disqualifie"),
    db().from("signal").select("id", { count: "exact", head: true }).eq("hallucination", true),
    db().from("appel_api").select("fournisseur,cout_eur,tokens_entree,tokens_sortie"),
    db().from("signal").select("id", { count: "exact", head: true }).eq("methode", "infere").neq("valeur", "inconnu"),
  ]);
  const rows = entreprises.data ?? [];
  const total = rows.length;
  const resolues = rows.filter((r) => r.domaine_statut === "resolu").length;
  const nonResolues = rows.filter((r) => r.domaine_statut === "non_resolu").length;
  const couts: Record<string, { appels: number; cout_eur: number }> = {};
  for (const a of appels.data ?? []) {
    couts[a.fournisseur] ??= { appels: 0, cout_eur: 0 };
    couts[a.fournisseur].appels++;
    couts[a.fournisseur].cout_eur += Number(a.cout_eur);
  }
  const comptes = await calculerComptes();
  const distributionCriteres: Record<string, number> = {};
  for (const c of comptes) {
    const n = String(c.fit_criteres + c.moment_criteres);
    distributionCriteres[n] = (distributionCriteres[n] ?? 0) + 1;
  }
  return {
    echantillon: total,
    etapes: {
      signals_faites: rows.filter((r) => r.signals_statut === "fait").length,
      resolve_faites: resolues + nonResolues,
      infer_faites: rows.filter((r) => r.infer_statut === "fait").length,
    },
    taux_resolution_domaine: total > 0 ? Math.round((100 * resolues) / (resolues + nonResolues || 1)) : 0,
    domaines_resolus: resolues,
    domaines_non_resolus: nonResolues,
    disqualifiees: rows.filter((r) => r.disqualifie).length,
    hallucinations_detectees: halluc.count ?? 0,
    signaux_inferes_valides: signauxInferes.count ?? 0,
    distribution_criteres: distributionCriteres,
    couts,
    cout_total_eur: Object.values(couts).reduce((s, c) => s + c.cout_eur, 0),
  };
}
