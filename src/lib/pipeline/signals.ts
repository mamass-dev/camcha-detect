import { cachedJson } from "../cache";
import { db, getConfig, Parametres } from "../db";
import { poserSignal, ttl } from "../signaux";

const BODACC_BASE =
  "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";

type Entreprise = {
  siren: string;
  raison_sociale: string;
  commune: string | null;
};

type BodaccRecord = {
  id?: string;
  dateparution?: string;
  familleavis?: string;
  familleavis_lib?: string;
  typeavis_lib?: string;
  commercant?: string;
  modificationsgenerales?: string;
  listepersonnes?: string;
  jugement?: string | null;
  depot?: string;
  url_complete?: string;
};

type BodaccApi = { total_count: number; results: BodaccRecord[] };

function bodaccUrlPublique(siren: string): string {
  return `https://www.bodacc.fr/pages/annonces-commerciales/?sort=dateparution&q=${siren}`;
}

async function signauxBodacc(e: Entreprise, params: Parametres, avertissements: string[]) {
  const depuis = new Date(Date.now() - 548 * 86_400_000).toISOString().slice(0, 10); // 18 mois
  const where = encodeURIComponent(`registre like "%${e.siren}%" and dateparution >= date'${depuis}'`);
  const url = `${BODACC_BASE}?where=${where}&limit=50&order_by=dateparution desc`;
  const { data } = await cachedJson<BodaccApi>({ fournisseur: "bodacc", url });

  let procedureCollective: BodaccRecord | null = null;
  type Detection = { rec: BodaccRecord; valeur: "oui" | "probable"; confiance: number; verbatim: string };
  const modifs: Record<string, Detection | null> = {
    changement_dirigeant: null,
    augmentation_capital: null,
    transfert_siege: null,
  };

  for (const r of data.results) {
    const famille = (r.familleavis ?? r.familleavis_lib ?? "").toLowerCase();
    // Procédure collective : famille dédiée, ou champ jugement renseigné.
    if (famille.includes("procol") || famille.includes("collective") || (r.jugement && r.jugement !== "null")) {
      procedureCollective = procedureCollective ?? r;
      continue;
    }
    if (!famille.includes("modification")) continue;
    // Le descriptif est structuré : « Modification survenue sur l'administration. »,
    // « … sur le capital. », « … transfert du siège social. » — pas de mots-clés flous.
    let descriptif = "";
    try {
      descriptif = (JSON.parse(r.modificationsgenerales ?? "{}") as { descriptif?: string }).descriptif ?? "";
    } catch {
      descriptif = r.modificationsgenerales ?? "";
    }
    const d = descriptif.toLowerCase();
    if (!modifs.changement_dirigeant && d.includes("administration"))
      modifs.changement_dirigeant = { rec: r, valeur: "oui", confiance: 0.9, verbatim: descriptif };
    if (!modifs.augmentation_capital && d.includes("capital")) {
      // Le BODACC dit « modification du capital » sans préciser le sens : « probable ».
      let montant = "";
      try {
        const p = (JSON.parse(r.listepersonnes ?? "{}") as { personne?: { capital?: { montantCapital?: string; devise?: string } } }).personne;
        if (p?.capital?.montantCapital) montant = ` Nouveau capital : ${p.capital.montantCapital} ${p.capital.devise ?? "EUR"}.`;
      } catch { /* montant absent */ }
      modifs.augmentation_capital = { rec: r, valeur: "probable", confiance: 0.6, verbatim: `${descriptif}${montant}` };
    }
    if (!modifs.transfert_siege && /transfert du si[èe]ge/.test(d))
      modifs.transfert_siege = { rec: r, valeur: "oui", confiance: 0.9, verbatim: descriptif };
  }

  const ttlBodacc = ttl(params, "bodacc");
  for (const [cle, det] of Object.entries(modifs)) {
    await poserSignal({
      siren: e.siren,
      cle,
      valeur: det ? det.valeur : "non",
      confiance: det ? det.confiance : 1,
      verbatim: det ? `${det.verbatim} Parution BODACC du ${det.rec.dateparution}.` : null,
      sourceUrl: det?.rec.url_complete ?? bodaccUrlPublique(e.siren),
      methode: "structure",
      ttlJours: ttlBodacc,
      observeLe: det?.rec.dateparution ? new Date(det.rec.dateparution) : new Date(),
    });
  }

  if (procedureCollective) {
    await db()
      .from("entreprise")
      .update({
        disqualifie: true,
        disqualifie_motif: `Procédure collective — BODACC, parution du ${procedureCollective.dateparution}`,
        maj_le: new Date().toISOString(),
      })
      .eq("siren", e.siren);
  }
  if (data.total_count > 50) {
    avertissements.push(`${e.siren} : ${data.total_count} annonces BODACC, seules les 50 dernières analysées`);
  }
}

// --- France Travail -------------------------------------------------------

let ftToken: { valeur: string; expire: number } | null = null;

async function tokenFranceTravail(): Promise<string> {
  if (ftToken && ftToken.expire > Date.now() + 30_000) return ftToken.valeur;
  const id = process.env.FRANCE_TRAVAIL_CLIENT_ID!;
  const secret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET!;
  const res = await fetch(
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
        scope: `api_offresdemploiv2 o2dsoffre`,
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) throw new Error(`OAuth France Travail : HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  ftToken = { valeur: data.access_token, expire: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function normaliserNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(sarl|sas|sasu|eurl|sa|sci|scop|scm|selarl|snc|societe|ste|ets|etablissements?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type OffreFT = {
  id: string;
  intitule?: string;
  dateCreation?: string;
  entreprise?: { nom?: string };
  lieuTravail?: { libelle?: string; codePostal?: string };
};

/**
 * L'API Offres v2 ne filtre pas par SIREN : on cherche par mots-clés + département,
 * puis on ne retient que les offres dont le nom d'employeur correspond (confiance 0.7).
 */
async function signauxFranceTravail(e: Entreprise, params: Parametres) {
  const token = await tokenFranceTravail();
  const nomNorm = normaliserNom(e.raison_sociale);
  if (!nomNorm) return;
  // « publieeDepuis » plafonne à 31 jours ; pour les 90 jours du brief on passe
  // par la fenêtre minCreationDate/maxCreationDate (les deux sont requis ensemble).
  // Dates arrondies au jour : la clé de cache reste stable au sein d'une journée.
  const maintenant = new Date(new Date().toISOString().slice(0, 10) + "T23:59:59Z");
  const il90j = new Date(maintenant.getTime() - 90 * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?departement=21&motsCles=${encodeURIComponent(
    nomNorm.split(" ").slice(0, 3).join(" ")
  )}&minCreationDate=${encodeURIComponent(iso(il90j))}&maxCreationDate=${encodeURIComponent(iso(maintenant))}&range=0-49`;

  const { data } = await cachedJson<{ resultats?: OffreFT[] } | null>({
    fournisseur: "france_travail",
    url,
    init: { headers: { Authorization: `Bearer ${token}` } },
  });

  // 204 No Content (aucune offre pour ces mots-clés) → data null : zéro offre, pas une erreur.
  const offres = (data?.resultats ?? []).filter((o) => {
    const nomOffre = normaliserNom(o.entreprise?.nom ?? "");
    return nomOffre && (nomOffre === nomNorm || nomOffre.includes(nomNorm) || nomNorm.includes(nomOffre));
  });

  const srcVerif = `https://candidat.francetravail.fr/offres/recherche?motsCles=${encodeURIComponent(
    e.raison_sociale
  )}&lieux=21D`;
  await poserSignal({
    siren: e.siren,
    cle: "offres_actives",
    valeur: offres.length > 0 ? "oui" : "non",
    confiance: offres.length > 0 ? 0.7 : 0.9, // rattachement par nom, pas par SIREN
    verbatim:
      offres.length > 0
        ? `${offres.length} offre(s) sur 90 j : ${offres.slice(0, 5).map((o) => o.intitule).filter(Boolean).join(" · ")}`
        : null,
    sourceUrl: srcVerif,
    methode: "structure",
    ttlJours: ttl(params, "recrutement"),
  });
}

// --- Étape complète -------------------------------------------------------

export async function signalsChunk(limite: number): Promise<{
  traitees: number;
  restantes: number;
  franceTravailActif: boolean;
  avertissements: string[];
  erreurs: string[];
}> {
  const params: Parametres = await getConfig("parametres");
  const ftActif = Boolean(process.env.FRANCE_TRAVAIL_CLIENT_ID && process.env.FRANCE_TRAVAIL_CLIENT_SECRET);
  const avertissements: string[] = [];
  const erreurs: string[] = [];
  if (!ftActif)
    avertissements.push(
      "FRANCE_TRAVAIL_CLIENT_ID/SECRET absents : signal « offres_actives » désactivé (aucune donnée inventée)."
    );

  const { data: lot, error } = await db()
    .from("entreprise")
    .select("siren,raison_sociale,commune")
    .eq("signals_statut", "non_tente")
    .order("siren")
    .limit(limite);
  if (error) throw new Error(error.message);

  for (const e of lot ?? []) {
    try {
      await signauxBodacc(e, params, avertissements);
      if (ftActif) await signauxFranceTravail(e, params);
      await db().from("entreprise").update({ signals_statut: "fait", maj_le: new Date().toISOString() }).eq("siren", e.siren);
    } catch (err) {
      erreurs.push(`${e.siren} (${e.raison_sociale}) : ${err instanceof Error ? err.message : String(err)}`);
      await db().from("entreprise").update({ signals_statut: "erreur" }).eq("siren", e.siren);
    }
  }

  const restantes = await db()
    .from("entreprise")
    .select("siren", { count: "exact", head: true })
    .eq("signals_statut", "non_tente");
  return {
    traitees: lot?.length ?? 0,
    restantes: restantes.count ?? 0,
    franceTravailActif: ftActif,
    avertissements,
    erreurs,
  };
}
