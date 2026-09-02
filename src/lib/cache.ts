import { createHash } from "crypto";
import { db } from "./db";

export type Fournisseur =
  | "recherche_entreprises"
  | "bodacc"
  | "france_travail"
  | "places"
  | "anthropic"
  | "crawl";

export async function logAppel(opts: {
  fournisseur: Fournisseur;
  endpoint: string;
  cacheHit: boolean;
  tokensEntree?: number;
  tokensSortie?: number;
  coutEur?: number;
}): Promise<void> {
  await db().from("appel_api").insert({
    fournisseur: opts.fournisseur,
    endpoint: opts.endpoint,
    cache_hit: opts.cacheHit,
    tokens_entree: opts.tokensEntree ?? null,
    tokens_sortie: opts.tokensSortie ?? null,
    cout_eur: opts.coutEur ?? 0,
  });
}

function cacheKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

type FetchResult<T> = { data: T; fromCache: boolean };

/**
 * GET JSON avec cache en base : un re-run ne relance jamais l'appel.
 * `coutEur` n'est comptabilisé que sur un appel réel.
 */
export async function cachedJson<T>(opts: {
  fournisseur: Fournisseur;
  url: string;
  init?: RequestInit;
  coutEur?: number;
  timeoutMs?: number;
}): Promise<FetchResult<T>> {
  const cle = cacheKey([opts.fournisseur, opts.url, JSON.stringify(opts.init?.body ?? "")]);
  // La présence de la ligne fait foi : un « 204 sans contenu » est aussi mis en cache (corps null).
  const hit = await db().from("http_cache").select("corps,statut").eq("cle", cle).maybeSingle();
  if (hit.data) {
    return { data: hit.data.corps as T, fromCache: true };
  }
  const res = await fetch(opts.url, {
    ...opts.init,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} sur ${opts.url} — ${body.slice(0, 300)}`);
  }
  const brut = await res.text();
  const data = (brut ? JSON.parse(brut) : null) as T; // 204 No Content → null
  await db().from("http_cache").upsert({ cle, url: opts.url, statut: res.status, corps: data });
  await logAppel({
    fournisseur: opts.fournisseur,
    endpoint: new URL(opts.url).pathname,
    cacheHit: false,
    coutEur: opts.coutEur ?? 0,
  });
  return { data, fromCache: false };
}

/** GET texte (HTML, robots.txt, sitemap) avec cache. Retourne null si le fetch échoue. */
export async function cachedText(opts: {
  fournisseur: Fournisseur;
  url: string;
  timeoutMs?: number;
  maxOctets?: number;
}): Promise<{ text: string | null; statut: number | null; fromCache: boolean }> {
  const cle = cacheKey([opts.fournisseur, "text", opts.url]);
  const hit = await db().from("http_cache").select("corps_texte,statut").eq("cle", cle).maybeSingle();
  if (hit.data && hit.data.statut != null) {
    return { text: hit.data.corps_texte, statut: hit.data.statut, fromCache: true };
  }
  let text: string | null = null;
  let statut: number | null = null;
  try {
    const res = await fetch(opts.url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
      headers: {
        "User-Agent":
          "CamchaDetectBot/0.1 (prototype de ciblage B2B ; contact : https://globecreateur.fr)",
      },
      redirect: "follow",
    });
    statut = res.status;
    if (res.ok) {
      text = await res.text();
      const max = opts.maxOctets ?? 500_000;
      if (text.length > max) text = text.slice(0, max);
    }
  } catch {
    statut = 0; // réseau/timeout : mémorisé pour ne pas réessayer en boucle
  }
  await db().from("http_cache").upsert({ cle, url: opts.url, statut, corps_texte: text });
  await logAppel({ fournisseur: opts.fournisseur, endpoint: opts.url.slice(0, 200), cacheHit: false });
  return { text, statut, fromCache: false };
}
