import { db, Parametres } from "./db";

export type Methode = "structure" | "infere" | "declare";

/** Upsert d'un signal (un par clé et par entreprise), avec TTL selon sa famille. */
export async function poserSignal(opts: {
  siren: string;
  cle: string;
  valeur: string;
  confiance?: number;
  verbatim?: string | null;
  sourceUrl?: string | null;
  methode: Methode;
  hallucination?: boolean;
  ttlJours: number;
  observeLe?: Date;
}): Promise<void> {
  const observe = opts.observeLe ?? new Date();
  const expire = new Date(observe.getTime() + opts.ttlJours * 86_400_000);
  const { error } = await db()
    .from("signal")
    .upsert(
      {
        siren: opts.siren,
        cle: opts.cle,
        valeur: opts.valeur,
        confiance: opts.confiance ?? null,
        verbatim: opts.verbatim ?? null,
        source_url: opts.sourceUrl ?? null,
        methode: opts.methode,
        hallucination: opts.hallucination ?? false,
        observe_le: observe.toISOString(),
        expire_le: expire.toISOString(),
      },
      { onConflict: "siren,cle" }
    );
  if (error) throw new Error(`signal ${opts.cle} (${opts.siren}) : ${error.message}`);
}

export function ttl(params: Parametres, famille: string): number {
  return params.ttl_jours[famille] ?? 90;
}
