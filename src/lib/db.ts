import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Client Supabase avec la clé service — usage strictement côté serveur. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export async function getConfig<T>(cle: string): Promise<T> {
  const { data, error } = await db().from("config").select("valeur").eq("cle", cle).single();
  if (error) throw new Error(`config ${cle} introuvable : ${error.message}`);
  return data.valeur as T;
}

export async function setConfig(cle: string, valeur: unknown): Promise<void> {
  const { error } = await db()
    .from("config")
    .upsert({ cle, valeur, maj_le: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export type Parametres = {
  taux_usd_eur: number;
  prix_modele_usd: { entree_par_mtok: number; sortie_par_mtok: number };
  modele: string;
  plafond_tokens_envoi: number;
  plafond_pages: number;
  plafond_ko_texte: number;
  ttl_jours: Record<string, number>;
};

export type Poids = {
  fit: Record<string, number>;
  moment: Record<string, number>;
  valeur_probable: number;
};
