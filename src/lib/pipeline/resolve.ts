import * as cheerio from "cheerio";
import { cachedJson, cachedText } from "../cache";
import { db } from "../db";

type Entreprise = {
  siren: string;
  raison_sociale: string;
  commune: string | null;
  code_postal: string | null;
  adresse: string | null;
};

function normaliser(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function texteDePage(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").remove();
  return normaliser($("body").text().replace(/\s+/g, " "));
}

/** Le SIREN (avec ou sans espaces) ou l'adresse postale doit figurer dans la page. */
function preuveDansPage(texte: string, e: Entreprise): string | null {
  const siren = e.siren;
  const sirenEspace = `${siren.slice(0, 3)} ${siren.slice(3, 6)} ${siren.slice(6)}`;
  if (texte.includes(siren) || texte.includes(sirenEspace)) return "siren_dans_page";
  if (e.code_postal && e.commune) {
    if (texte.includes(e.code_postal) && texte.includes(normaliser(e.commune))) return "adresse_dans_page";
  }
  return null;
}

const PAGES_MENTIONS = ["/mentions-legales", "/mentions-legales/", "/mentions_legales", "/mentions", "/legal"];

/** Cherche la preuve sur la page d'accueil, puis sur les mentions légales (où vit le SIREN). */
async function chercherPreuve(url: string, e: Entreprise): Promise<string | null> {
  const { text } = await cachedText({ fournisseur: "crawl", url, timeoutMs: 8000 });
  if (!text) return null;
  const pr = preuveDansPage(texteDePage(text), e);
  if (pr) return pr;
  for (const chemin of PAGES_MENTIONS) {
    const { text: tm, statut } = await cachedText({ fournisseur: "crawl", url: `${url}${chemin}`, timeoutMs: 8000 });
    if (statut === 200 && tm) {
      const prm = preuveDansPage(texteDePage(tm), e);
      if (prm) return prm;
    }
  }
  return null;
}

function slugs(raison: string): string[] {
  const base = raison
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(sarl|sas|sasu|eurl|sa|sci|scop|selarl|snc|societe|ste|ets|etablissements?)\b/g, "")
    .trim();
  const colle = base.replace(/[^a-z0-9]+/g, "");
  const tirets = base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return [...new Set([colle, tirets])].filter((s) => s.length >= 4);
}

type PlacesApi = {
  places?: Array<{
    websiteUri?: string;
    nationalPhoneNumber?: string;
    userRatingCount?: number;
    displayName?: { text?: string };
  }>;
};

async function viaPlaces(e: Entreprise): Promise<{ domaine: string; telephone: string | null; nbAvis: number | null } | null> {
  const cle = process.env.GOOGLE_PLACES_API_KEY;
  if (!cle) return null;
  const { data } = await cachedJson<PlacesApi>({
    fournisseur: "places",
    url: "https://places.googleapis.com/v1/places:searchText",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cle,
        "X-Goog-FieldMask": "places.websiteUri,places.nationalPhoneNumber,places.userRatingCount,places.displayName",
      },
      body: JSON.stringify({ textQuery: `${e.raison_sociale} ${e.commune ?? ""} Côte-d'Or`, languageCode: "fr" }),
    },
    coutEur: 0.03, // Text Search (Pro) ≈ 32 $/1000 → comptabilisé même si palier gratuit
  });
  const place = data.places?.find((p) => p.websiteUri);
  if (!place?.websiteUri) return null;
  try {
    const u = new URL(place.websiteUri);
    // Les fiches Google pointent parfois vers des réseaux sociaux : on ne les retient pas.
    if (/facebook|instagram|linkedin|pagesjaunes/.test(u.hostname)) return null;
    return {
      domaine: `${u.protocol}//${u.hostname}`,
      telephone: place.nationalPhoneNumber ?? null,
      nbAvis: place.userRatingCount ?? null,
    };
  } catch {
    return null;
  }
}

export async function resolveChunk(limite: number): Promise<{
  traitees: number;
  restantes: number;
  resolues: number;
  nonResolues: number;
  placesActif: boolean;
  erreurs: string[];
}> {
  const placesActif = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const erreurs: string[] = [];
  let resolues = 0;
  let nonResolues = 0;

  const { data: lot, error } = await db()
    .from("entreprise")
    .select("siren,raison_sociale,commune,code_postal,adresse")
    .eq("domaine_statut", "non_tente")
    .order("siren")
    .limit(limite);
  if (error) throw new Error(error.message);

  for (const e of lot ?? []) {
    try {
      let domaine: string | null = null;
      let methode: string | null = null;
      let preuve: string | null = null;
      let telephone: string | null = null;
      let nbAvis: number | null = null;

      // 1. Google Places (si clé présente) — la mise en correspondance est faite par Google.
      const p = await viaPlaces(e);
      if (p) {
        domaine = p.domaine;
        methode = "places";
        preuve = "places";
        telephone = p.telephone;
        nbAvis = p.nbAvis;
      }

      // 2. Devinette slug.fr / slug.com (avec ou sans www) — retenue uniquement
      // avec preuve (SIREN ou adresse) sur la home ou les mentions légales.
      if (!domaine) {
        candidats: for (const slug of slugs(e.raison_sociale)) {
          for (const hote of [`${slug}.fr`, `${slug}.com`, `www.${slug}.fr`, `www.${slug}.com`]) {
            const url = `https://${hote}`;
            const pr = await chercherPreuve(url, e);
            if (pr) {
              domaine = url;
              methode = "slug";
              preuve = pr;
              break candidats;
            }
          }
        }
      }

      await db()
        .from("entreprise")
        .update({
          domaine,
          domaine_statut: domaine ? "resolu" : "non_resolu",
          domaine_methode: methode,
          domaine_preuve: preuve,
          telephone,
          nb_avis: nbAvis,
          maj_le: new Date().toISOString(),
        })
        .eq("siren", e.siren);
      if (domaine) resolues++;
      else nonResolues++;
    } catch (err) {
      erreurs.push(`${e.siren} : ${err instanceof Error ? err.message : String(err)}`);
      await db().from("entreprise").update({ domaine_statut: "non_resolu", domaine_preuve: "erreur" }).eq("siren", e.siren);
      nonResolues++;
    }
  }

  const restantes = await db()
    .from("entreprise")
    .select("siren", { count: "exact", head: true })
    .eq("domaine_statut", "non_tente");
  return { traitees: lot?.length ?? 0, restantes: restantes.count ?? 0, resolues, nonResolues, placesActif, erreurs };
}
