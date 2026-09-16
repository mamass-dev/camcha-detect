import donnees from "@/data/demo.json";

export type Signal = {
  cle: string; valeur: "oui" | "probable"; confiance: number; verbatim: string | null;
  source: string; source_url: string; date: string; methode: "structure" | "infere"; nb?: number;
};
export type Offre = { id: string; intitule: string; type?: string; date?: string; lieu?: string; url: string };
export type Entreprise = {
  siren: string; raison_sociale: string; nom_commercial: string | null; enseigne: string | null;
  commune: string; code_postal: string; departement: string; adresse: string;
  lat: number; lon: number; distances: Record<string, number>;
  effectif_tranche: string; effectif_annee: string | null; effectif_libelle: string;
  ape: string; secteur: string | null; nature_juridique: string; date_creation: string;
  est_ess: boolean; est_mission: boolean; idcc: string[]; nb_etablissements: number | null;
  decideurs: Array<{ nom: string; fonction: string }>;
  morales: Array<{ nom: string; fonction: string; siren: string }>;
  finances: { annee: string; ca: number | null; resultat_net: number | null } | null;
  signaux: Signal[]; offres?: Offre[];
  site: { url: string; preuve: string; date: string } | null; telephone: string | null;
  sante: { niveau: "vert" | "orange" | "rouge"; motif: string; source_url: string; date: string };
  disqualifie: string | null; source_fiche: string;
};
export type Donnees = {
  genere_le: string; zone: { villes: string[]; rayon_km: number; communes: number; codes_postaux: number };
  exclusions: Record<string, number>; appels: Record<string, { reels: number; cache: number }>;
  entreprises: Entreprise[];
};

export const DONNEES = donnees as unknown as Donnees;

/** Poids éditables : FIT = l'entreprise ressemble à un bon client ; MOMENT = c'est le bon moment pour l'appeler. */
export const POIDS = {
  fit: {
    bien_etre_affiche: 3, demarche_rse: 2, engagement_emploi: 2, ess_ou_mission: 2, reseau_entreprendre: 2,
    effectif_20_49: 1, multi_etablissements: 1, idcc_renseigne: 1, anciennete_3ans: 1, sponsoring_sport: 1,
  } as Record<string, number>,
  moment: {
    offres_actives: 3, marche_public: 3, recrutement_multiple: 2, tension_recrutement: 2, changement_dirigeant: 2,
    augmentation_capital: 2, ouverture_etablissement: 2, transfert_siege: 1, nouvelle_activite: 1, alternance: 1, page_carrieres: 1,
  } as Record<string, number>,
  valeur_probable: 0.6,
};

export const LIBELLES: Record<string, string> = {
  offres_actives: "Recrute actuellement",
  recrutement_multiple: "Plusieurs postes ouverts",
  alternance: "Recrute en alternance",
  tension_recrutement: "Difficulté à recruter (offre ancienne)",
  changement_dirigeant: "Changement de dirigeant",
  augmentation_capital: "Modification du capital",
  transfert_siege: "Déménagement du siège",
  ouverture_etablissement: "Ouverture d'un établissement",
  nouvelle_activite: "Nouvelle activité déclarée",
  marche_public: "Marché public remporté",
  page_carrieres: "Page recrutement sur le site",
  bien_etre_affiche: "Bien-être / marque employeur affichés",
  demarche_rse: "Démarche RSE affichée",
  engagement_emploi: "Engagement emploi, alternance, handicap",
  ess_ou_mission: "Société à mission ou ESS",
  reseau_entreprendre: "Cite Réseau Entreprendre",
  sponsoring_sport: "Sponsoring ou mécénat",
  effectif_20_49: "Effectif 20 à 49",
  multi_etablissements: "Plusieurs établissements",
  idcc_renseigne: "Convention collective renseignée",
  anciennete_3ans: "Établie depuis 3 ans ou plus",
};

/** Critère du cahier des charges (section 03) couvert par chaque signal. */
export const CRITERE_CDC: Record<string, string> = {
  offres_actives: "Recrutement en cours", recrutement_multiple: "Plusieurs postes ouverts", alternance: "Recrutement en alternance",
  tension_recrutement: "Difficultés à recruter", changement_dirigeant: "Actualité économique", augmentation_capital: "Investissement récent",
  transfert_siege: "Déménagement", ouverture_etablissement: "Ouverture d'un établissement", nouvelle_activite: "Nouvelle activité",
  marche_public: "Obtention d'un marché important", page_carrieres: "Volonté d'attirer des collaborateurs",
  bien_etre_affiche: "Communication bien-être / marque employeur", demarche_rse: "Politique RSE", engagement_emploi: "Emploi, insertion, jeunes, handicap",
  ess_ou_mission: "Entreprise à mission / impact", reseau_entreprendre: "Réseau Entreprendre", sponsoring_sport: "Soutien à des sportifs",
  effectif_20_49: "Taille cible", multi_etablissements: "Croissance / implantation", idcc_renseigne: "Structure RH", anciennete_3ans: "Stabilité",
};

export type Compte = Entreprise & {
  fit: number; moment: number; fit_n: number; moment_n: number;
  motifs: Array<{ cle: string; libelle: string; signal: Signal; axe: "fit" | "moment"; poids: number }>;
  dernier_signal: string | null;
};

function axe(poids: Record<string, number>, signaux: Signal[]) {
  const total = Object.values(poids).reduce((a, b) => a + b, 0);
  let somme = 0, n = 0;
  const motifs: Compte["motifs"] = [];
  for (const [cle, p] of Object.entries(poids)) {
    const s = signaux.find((x) => x.cle === cle);
    if (!s) continue;
    const v = s.valeur === "oui" ? 1 : POIDS.valeur_probable;
    somme += p * v; n++;
    motifs.push({ cle, libelle: LIBELLES[cle] ?? cle, signal: s, axe: "fit", poids: p * v });
  }
  return { score: Math.round((100 * somme) / total), n, motifs };
}

export function calculer(e: Entreprise): Compte {
  const f = axe(POIDS.fit, e.signaux);
  const m = axe(POIDS.moment, e.signaux);
  const motifs = [...f.motifs.map((x) => ({ ...x, axe: "fit" as const })), ...m.motifs.map((x) => ({ ...x, axe: "moment" as const }))]
    .sort((a, b) => (a.axe === b.axe ? b.poids - a.poids : a.axe === "moment" ? -1 : 1));
  const dates = e.signaux.filter((s) => s.methode === "structure" && !["idcc_renseigne", "anciennete_3ans", "effectif_20_49", "multi_etablissements", "ess_ou_mission"].includes(s.cle)).map((s) => s.date).sort();
  return { ...e, fit: f.score, moment: m.score, fit_n: f.n, moment_n: m.n, motifs, dernier_signal: dates.at(-1) ?? null };
}

let cacheComptes: Compte[] | null = null;
export function comptes(): Compte[] {
  cacheComptes ??= DONNEES.entreprises.map(calculer);
  return cacheComptes;
}

export function classer(liste: Compte[]): Compte[] {
  return [...liste].filter((c) => !c.disqualifie).sort((a, b) => b.moment - a.moment || b.fit - a.fit || a.raison_sociale.localeCompare(b.raison_sociale));
}

/** Le digest du matin : les comptes avec au moins un signal de MOMENT, classés, en excluant les feux rouges. */
export function digest(n = 8): Compte[] {
  return classer(comptes()).filter((c) => c.moment_n > 0 && c.sante.niveau !== "rouge").slice(0, n);
}

export function parSiren(siren: string): Compte | undefined {
  return comptes().find((c) => c.siren === siren);
}

export function nomAffiche(e: Entreprise): string {
  return e.enseigne ?? e.nom_commercial ?? e.raison_sociale;
}

export function villeReference(e: Entreprise): { ville: string; km: number } {
  const [ville, km] = Object.entries(e.distances).filter(([v]) => v !== "Dijon").sort((a, b) => a[1] - b[1])[0];
  return { ville, km };
}

export const SECTEURS: Record<string, string> = {
  A: "Agriculture, viticulture", B: "Industries extractives", C: "Industrie manufacturière", D: "Énergie", E: "Eau, déchets",
  F: "Construction", G: "Commerce", H: "Transports, logistique", I: "Hébergement, restauration", J: "Information, communication",
  K: "Finance, assurance", L: "Immobilier", M: "Activités spécialisées, conseil", N: "Services administratifs, intérim",
  O: "Administration", P: "Enseignement", Q: "Santé, action sociale", R: "Arts, loisirs", S: "Autres services",
};

export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
