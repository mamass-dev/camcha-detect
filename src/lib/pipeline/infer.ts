import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { cachedText, logAppel } from "../cache";
import { db, getConfig, Parametres } from "../db";
import { poserSignal } from "../signaux";

const MOTIFS_URL = /recrut|carriere|carrière|nous-rejoindre|rejoindre|equipe|équipe|valeurs|rse|engagement|actualite|actualité|blog/i;

const CHAMPS = [
  "seminaire",
  "evenement_fin_annee",
  "demarche_rse",
  "avantages_salaries_existants",
  "croissance_effectif",
] as const;

const TTL_PAR_CHAMP: Record<(typeof CHAMPS)[number], string> = {
  seminaire: "seminaire",
  evenement_fin_annee: "seminaire",
  demarche_rse: "rse",
  avantages_salaries_existants: "rse",
  croissance_effectif: "bodacc",
};

const ChampSchema = z.object({
  valeur: z.enum(["oui", "probable", "inconnu"]),
  confiance: z.number().min(0).max(1),
  verbatim: z.string(),
  source_url: z.string(),
});
const ReponseSchema = z.object({
  seminaire: ChampSchema,
  evenement_fin_annee: ChampSchema,
  demarche_rse: ChampSchema,
  avantages_salaries_existants: ChampSchema,
  croissance_effectif: ChampSchema,
});

type Entreprise = { siren: string; raison_sociale: string; domaine: string };
type Page = { url: string; texte: string };

// --- Collecte -------------------------------------------------------------

function cheminsInterdits(robots: string | null): string[] {
  if (!robots) return [];
  const interdits: string[] = [];
  let concerne = false;
  for (const ligne of robots.split("\n")) {
    const l = ligne.trim();
    if (/^user-agent:/i.test(l)) concerne = /user-agent:\s*\*/i.test(l);
    else if (concerne && /^disallow:/i.test(l)) {
      const chemin = l.replace(/^disallow:\s*/i, "").trim();
      if (chemin) interdits.push(chemin);
    }
  }
  return interdits;
}

function autorisee(url: string, interdits: string[]): boolean {
  try {
    const chemin = new URL(url).pathname;
    return !interdits.some((i) => chemin.startsWith(i.replace(/\*.*$/, "")));
  } catch {
    return false;
  }
}

async function urlsSitemap(domaine: string): Promise<string[]> {
  const parser = new XMLParser();
  const urls: string[] = [];
  const { text } = await cachedText({ fournisseur: "crawl", url: `${domaine}/sitemap.xml`, timeoutMs: 10000 });
  if (!text) return urls;
  try {
    const xml = parser.parse(text);
    const sousSitemaps: string[] = [];
    const pousse = (loc: unknown) => { if (typeof loc === "string") urls.push(loc); };
    const entrees = xml?.urlset?.url ?? [];
    for (const u of Array.isArray(entrees) ? entrees : [entrees]) pousse(u?.loc);
    const index = xml?.sitemapindex?.sitemap ?? [];
    for (const s of Array.isArray(index) ? index : [index]) if (typeof s?.loc === "string") sousSitemaps.push(s.loc);
    // Un niveau d'index maximum, 3 sous-sitemaps — on reste un crawler poli.
    for (const sm of sousSitemaps.slice(0, 3)) {
      const { text: t2 } = await cachedText({ fournisseur: "crawl", url: sm, timeoutMs: 10000 });
      if (!t2) continue;
      const xml2 = parser.parse(t2);
      const e2 = xml2?.urlset?.url ?? [];
      for (const u of Array.isArray(e2) ? e2 : [e2]) pousse(u?.loc);
    }
  } catch {
    // sitemap illisible : on continuera avec la seule page d'accueil
  }
  return urls;
}

function extraireTexte(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,nav,footer,header form,iframe").remove();
  return $("body").text().replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

async function collecterPages(e: Entreprise, params: Parametres): Promise<Page[]> {
  const { text: robots } = await cachedText({ fournisseur: "crawl", url: `${e.domaine}/robots.txt`, timeoutMs: 8000 });
  const interdits = cheminsInterdits(robots);

  const toutes = await urlsSitemap(e.domaine);
  const filtrees = toutes.filter((u) => MOTIFS_URL.test(u));
  const cibles = [...new Set([e.domaine, ...filtrees])]
    .filter((u) => autorisee(u, interdits))
    .slice(0, params.plafond_pages);

  const pages: Page[] = [];
  let totalOctets = 0;
  const plafondOctets = params.plafond_ko_texte * 1024;
  for (const url of cibles) {
    if (totalOctets >= plafondOctets) break;
    const { text, fromCache } = await cachedText({ fournisseur: "crawl", url, timeoutMs: 12000 });
    if (text) {
      const texte = extraireTexte(text).slice(0, plafondOctets - totalOctets);
      if (texte.length > 200) {
        pages.push({ url, texte });
        totalOctets += texte.length;
      }
    }
    if (!fromCache) await new Promise((r) => setTimeout(r, 1000)); // 1 req/s par domaine
  }
  return pages;
}

// --- Garde-fous -----------------------------------------------------------

const normaliser = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const REGEX_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const REGEX_TEL = /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/;

// --- Inférence ------------------------------------------------------------

function construirePrompt(e: Entreprise, pages: Page[], plafondChars: number): string {
  let corpus = "";
  for (const p of pages) {
    const bloc = `\n\n=== SOURCE: ${p.url} ===\n${p.texte}`;
    if (corpus.length + bloc.length > plafondChars) {
      corpus += bloc.slice(0, plafondChars - corpus.length);
      break;
    }
    corpus += bloc;
  }
  return `Tu analyses les pages publiques du site web de l'entreprise « ${e.raison_sociale} » (personne morale uniquement).

À partir du texte fourni EXCLUSIVEMENT, renseigne ces 5 champs : seminaire (l'entreprise organise des séminaires internes), evenement_fin_annee (fête ou événement de fin d'année pour les salariés), demarche_rse (démarche RSE ou engagement sociétal formalisé), avantages_salaries_existants (avantages salariés déjà en place : CSE, tickets restaurant, mutuelle renforcée, comité d'entreprise, œuvres sociales…), croissance_effectif (l'effectif croît : recrutements multiples, ouverture de site, annonce de croissance).

Réponds UNIQUEMENT avec un objet JSON, sans texte autour, de la forme :
{"seminaire": {"valeur": "oui|probable|inconnu", "confiance": 0.0, "verbatim": "extrait exact copié du texte", "source_url": "url de la source"}, ...} pour les 5 champs.

Règles strictes :
- "verbatim" est une citation EXACTE, copiée caractère pour caractère depuis le texte fourni. Si aucun passage ne prouve le champ, mets valeur "inconnu", verbatim "" et confiance 0.
- "source_url" est l'une des URL marquées === SOURCE: ===.
- INTERDIT : tout nom, prénom, adresse e-mail ou numéro de téléphone d'une personne physique, dans quelque champ que ce soit.

TEXTE COLLECTÉ :${corpus}`;
}

export async function infererEntreprise(
  e: Entreprise,
  params: Parametres
): Promise<{ hallucinations: number; coutEur: number; pages: number }> {
  const pages = await collecterPages(e, params);
  if (pages.length === 0) {
    await db().from("entreprise").update({ infer_statut: "erreur", maj_le: new Date().toISOString() }).eq("siren", e.siren);
    throw new Error(`${e.domaine} : aucune page exploitable`);
  }

  const plafondChars = params.plafond_tokens_envoi * 3.5; // ≈ chars/token en français
  const prompt = construirePrompt(e, pages, plafondChars);

  const anthropic = new Anthropic();
  const reponse = await anthropic.messages.create({
    model: params.modele,
    max_tokens: 1500,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const coutEur =
    ((reponse.usage.input_tokens * params.prix_modele_usd.entree_par_mtok +
      reponse.usage.output_tokens * params.prix_modele_usd.sortie_par_mtok) /
      1_000_000) *
    params.taux_usd_eur;
  await logAppel({
    fournisseur: "anthropic",
    endpoint: params.modele,
    cacheHit: false,
    tokensEntree: reponse.usage.input_tokens,
    tokensSortie: reponse.usage.output_tokens,
    coutEur,
  });

  const brut = reponse.content.find((b) => b.type === "text")?.text ?? "";
  const json = brut.slice(brut.indexOf("{"), brut.lastIndexOf("}") + 1);
  const parse = ReponseSchema.safeParse(JSON.parse(json));
  if (!parse.success) throw new Error(`sortie modèle invalide (${e.siren}) : ${parse.error.message}`);

  // Garde-fou obligatoire, côté code : le verbatim doit exister dans le texte collecté.
  const corpusNorm = normaliser(pages.map((p) => p.texte).join(" "));
  let hallucinations = 0;
  for (const champ of CHAMPS) {
    const c = parse.data[champ];
    let { valeur, confiance, verbatim } = c;
    let hallucination = false;
    const sourceValide = pages.some((p) => p.url === c.source_url);

    if (valeur !== "inconnu") {
      const verbatimOk = verbatim.length > 0 && corpusNorm.includes(normaliser(verbatim));
      const piiDetectee = REGEX_EMAIL.test(verbatim) || REGEX_TEL.test(verbatim);
      if (!verbatimOk || !sourceValide || piiDetectee) {
        valeur = "inconnu";
        confiance = 0;
        verbatim = "";
        hallucination = !piiDetectee; // une PII purgée n'est pas comptée comme hallucination
        if (!verbatimOk || !sourceValide) hallucinations++;
      }
    }

    await poserSignal({
      siren: e.siren,
      cle: champ,
      valeur,
      confiance,
      verbatim: verbatim || null,
      sourceUrl: sourceValide ? c.source_url : e.domaine,
      methode: "infere",
      hallucination,
      ttlJours: params.ttl_jours[TTL_PAR_CHAMP[champ]] ?? 90,
    });
  }

  await db().from("entreprise").update({ infer_statut: "fait", maj_le: new Date().toISOString() }).eq("siren", e.siren);
  return { hallucinations, coutEur, pages: pages.length };
}

export async function inferChunk(limite: number): Promise<{
  traitees: number;
  restantes: number;
  hallucinations: number;
  coutEur: number;
  anthropicActif: boolean;
  erreurs: string[];
}> {
  const anthropicActif = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!anthropicActif) {
    return { traitees: 0, restantes: -1, hallucinations: 0, coutEur: 0, anthropicActif, erreurs: ["ANTHROPIC_API_KEY absente : étape infer désactivée."] };
  }
  const params: Parametres = await getConfig("parametres");
  const erreurs: string[] = [];
  let hallucinations = 0;
  let coutEur = 0;

  const { data: lot, error } = await db()
    .from("entreprise")
    .select("siren,raison_sociale,domaine")
    .eq("domaine_statut", "resolu")
    .eq("infer_statut", "non_tente")
    .order("siren")
    .limit(limite);
  if (error) throw new Error(error.message);

  for (const e of lot ?? []) {
    try {
      const r = await infererEntreprise(e as Entreprise, params);
      hallucinations += r.hallucinations;
      coutEur += r.coutEur;
    } catch (err) {
      erreurs.push(err instanceof Error ? err.message : String(err));
      await db().from("entreprise").update({ infer_statut: "erreur" }).eq("siren", e.siren);
    }
  }

  const restantes = await db()
    .from("entreprise")
    .select("siren", { count: "exact", head: true })
    .eq("domaine_statut", "resolu")
    .eq("infer_statut", "non_tente");
  return { traitees: lot?.length ?? 0, restantes: restantes.count ?? 0, hallucinations, coutEur, anthropicActif, erreurs };
}
