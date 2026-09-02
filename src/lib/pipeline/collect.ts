import { cachedJson } from "../cache";
import { db, getConfig, Parametres } from "../db";
import { poserSignal, ttl } from "../signaux";

const BASE = "https://recherche-entreprises.api.gouv.fr/search";

type ResultatApi = {
  results: Array<{
    siren: string;
    nom_complet?: string;
    nom_raison_sociale?: string;
    sigle?: string | null;
    nature_juridique?: string;
    activite_principale?: string;
    tranche_effectif_salarie?: string;
    annee_tranche_effectif_salarie?: string;
    date_creation?: string;
    etat_administratif?: string;
    statut_diffusion?: string;
    complements?: {
      est_ess?: boolean;
      est_societe_a_mission?: boolean;
      liste_idcc?: string[];
      convention_collective_renseignee?: boolean;
    };
    siege?: {
      adresse?: string;
      code_postal?: string;
      libelle_commune?: string;
      latitude?: string | number;
      longitude?: string | number;
      departement?: string;
      commune?: string;
    };
  }>;
  total_results: number;
  total_pages: number;
  page: number;
};

function annuaireUrl(siren: string): string {
  return `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`;
}

/**
 * Constitue l'échantillon (figé au premier run) : entreprises actives du dépt 21,
 * tranches d'effectif 11-19 et 20-49, sociétés commerciales (nature juridique 5xxx),
 * diffusibles uniquement. Idempotent : si l'échantillon existe, ne fait rien.
 */
export async function collect(taille: number): Promise<{
  statut: "deja_fait" | "fait";
  retenues: number;
  pagesApi: number;
  exclusions: Record<string, number>;
}> {
  const existant = await db().from("entreprise").select("siren", { count: "exact", head: true });
  if ((existant.count ?? 0) > 0) {
    return { statut: "deja_fait", retenues: existant.count ?? 0, pagesApi: 0, exclusions: {} };
  }

  const params: Parametres = await getConfig("parametres");
  const exclusions: Record<string, number> = {
    non_diffusible: 0,
    nature_juridique: 0,
    inactive: 0,
    sans_siren: 0,
    siege_hors_21: 0,
  };
  const retenues: ResultatApi["results"] = [];
  let page = 1;
  let pagesApi = 0;

  while (retenues.length < taille && page <= 200) {
    const url = `${BASE}?departement=21&tranche_effectif_salarie=11,12&etat_administratif=A&per_page=25&page=${page}`;
    const { data, fromCache } = await cachedJson<ResultatApi>({
      fournisseur: "recherche_entreprises",
      url,
    });
    pagesApi++;
    for (const r of data.results) {
      if (retenues.length >= taille) break;
      if (!r.siren) { exclusions.sans_siren++; continue; }
      if (r.statut_diffusion && r.statut_diffusion !== "O") { exclusions.non_diffusible++; continue; }
      if (r.etat_administratif && r.etat_administratif !== "A") { exclusions.inactive++; continue; }
      // Sociétés commerciales uniquement : exclut administrations (7xxx) et associations (92xx).
      if (!r.nature_juridique?.startsWith("5")) { exclusions.nature_juridique++; continue; }
      // « departement=21 » matche tout établissement dans le 21 ; la cible CAMCHA est
      // l'entreprise locale — on exige un siège en Côte-d'Or.
      const dept = r.siege?.departement ?? r.siege?.code_postal?.slice(0, 2);
      if (dept !== "21") { exclusions.siege_hors_21++; continue; }
      retenues.push(r);
    }
    if (page >= data.total_pages) break;
    page++;
    // 7 req/s max — inutile de se presser, et pas de pause si servi du cache.
    if (!fromCache) await new Promise((r) => setTimeout(r, 200));
  }

  // Tri déterministe par SIREN avant insertion : l'échantillon est reproductible.
  retenues.sort((a, b) => a.siren.localeCompare(b.siren));

  const lignes = retenues.map((r) => ({
    siren: r.siren,
    raison_sociale: r.nom_raison_sociale || r.nom_complet || r.siren,
    sigle: r.sigle ?? null,
    commune: r.siege?.libelle_commune ?? null,
    code_postal: r.siege?.code_postal ?? null,
    adresse: r.siege?.adresse ?? null,
    effectif_tranche: r.tranche_effectif_salarie ?? null,
    effectif_annee: r.annee_tranche_effectif_salarie ?? null,
    idcc: r.complements?.liste_idcc ?? [],
    date_creation: r.date_creation ?? null,
    latitude: r.siege?.latitude != null ? Number(r.siege.latitude) : null,
    longitude: r.siege?.longitude != null ? Number(r.siege.longitude) : null,
    est_ess: r.complements?.est_ess ?? false,
    est_societe_mission: r.complements?.est_societe_a_mission ?? false,
    nature_juridique: r.nature_juridique ?? null,
    activite_principale: r.activite_principale ?? null,
  }));
  if (lignes.length > 0) {
    const { error } = await db().from("entreprise").upsert(lignes, { onConflict: "siren" });
    if (error) throw new Error(`insertion entreprises : ${error.message}`);
  }

  // Signaux FIT statiques, méthode « structure », source vérifiable = annuaire officiel.
  const ttlStatique = ttl(params, "statique");
  const maintenant = Date.now();
  for (const r of retenues) {
    const src = annuaireUrl(r.siren);
    const commun = { siren: r.siren, methode: "structure" as const, sourceUrl: src, ttlJours: ttlStatique, confiance: 1 };
    await poserSignal({ ...commun, cle: "idcc_renseigne", valeur: (r.complements?.liste_idcc?.length ?? 0) > 0 ? "oui" : "non", verbatim: r.complements?.liste_idcc?.join(", ") || null });
    const age = r.date_creation ? (maintenant - new Date(r.date_creation).getTime()) / 31_557_600_000 : null;
    await poserSignal({ ...commun, cle: "anciennete_3ans", valeur: age == null ? "inconnu" : age >= 3 ? "oui" : "non", verbatim: r.date_creation ? `créée le ${r.date_creation}` : null });
    await poserSignal({ ...commun, cle: "ess_ou_mission", valeur: r.complements?.est_ess || r.complements?.est_societe_a_mission ? "oui" : "non", verbatim: r.complements?.est_societe_a_mission ? "société à mission" : r.complements?.est_ess ? "économie sociale et solidaire" : null });
    await poserSignal({ ...commun, cle: "effectif_20_49", valeur: r.tranche_effectif_salarie === "12" ? "oui" : "non", verbatim: r.tranche_effectif_salarie === "12" ? "tranche 20 à 49 salariés" : "tranche 11 à 19 salariés" });
  }

  return { statut: "fait", retenues: retenues.length, pagesApi, exclusions };
}
