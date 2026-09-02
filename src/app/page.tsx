"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Rapport = {
  echantillon: number;
  etapes: { signals_faites: number; resolve_faites: number; infer_faites: number };
  taux_resolution_domaine: number;
  domaines_resolus: number;
  domaines_non_resolus: number;
  disqualifiees: number;
  hallucinations_detectees: number;
  distribution_criteres: Record<string, number>;
  couts: Record<string, { appels: number; cout_eur: number }>;
  cout_total_eur: number;
};

const FOURNISSEURS: Record<string, string> = {
  recherche_entreprises: "Recherche d'entreprises",
  bodacc: "BODACC",
  france_travail: "France Travail",
  places: "Google Places",
  anthropic: "Claude (inférence)",
  crawl: "Crawl sites",
};

export default function Pipeline() {
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [journal, setJournal] = useState<string[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [taille, setTaille] = useState(20);
  const stopRef = useRef(false);

  const log = (m: string) => setJournal((j) => [...j.slice(-200), `${new Date().toLocaleTimeString("fr-FR")}  ${m}`]);

  const rafraichir = useCallback(async () => {
    const r = await fetch("/api/score");
    if (r.ok) setRapport((await r.json()).rapport);
  }, []);

  useEffect(() => { rafraichir(); }, [rafraichir]);

  async function lancerCollect() {
    setEnCours("collect");
    log(`collect — échantillon de ${taille} entreprises…`);
    try {
      const r = await fetch("/api/pipeline/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taille }),
      });
      const d = await r.json();
      if (d.erreur) log(`⛔ ${d.erreur}`);
      else if (d.statut === "deja_fait") log(`Échantillon déjà figé (${d.retenues} entreprises) — collect est idempotent.`);
      else log(`✓ ${d.retenues} entreprises retenues (${d.pagesApi} pages API). Exclusions : ${JSON.stringify(d.exclusions)}`);
    } catch (e) { log(`⛔ ${String(e)}`); }
    await rafraichir();
    setEnCours(null);
  }

  async function lancerBoucle(etape: "signals" | "resolve" | "infer", limite: number) {
    setEnCours(etape);
    stopRef.current = false;
    log(`${etape} — démarrage (lots de ${limite})…`);
    try {
      let garde = 0;
      while (!stopRef.current && garde++ < 200) {
        const r = await fetch(`/api/pipeline/${etape}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limite }),
        });
        const d = await r.json();
        if (d.erreur) { log(`⛔ ${d.erreur}`); break; }
        for (const a of d.avertissements ?? []) log(`⚠ ${a}`);
        for (const err of d.erreurs ?? []) log(`⚠ ${err}`);
        log(`… ${d.traitees} traitée(s), ${d.restantes} restante(s)` + (d.coutEur ? ` — ${d.coutEur.toFixed(3)} €` : ""));
        await rafraichir();
        if (d.restantes <= 0 || d.traitees === 0) { log(`✓ ${etape} terminé.`); break; }
      }
    } catch (e) { log(`⛔ ${String(e)}`); }
    setEnCours(null);
  }

  const total = rapport?.echantillon ?? 0;
  const barres = [
    { nom: "1 · collect", fait: total > 0 ? 1 : 0, sur: 1, detail: total > 0 ? `${total} entreprises figées` : "échantillon vide" },
    { nom: "2 · signals", fait: rapport?.etapes.signals_faites ?? 0, sur: total, detail: `${rapport?.disqualifiees ?? 0} disqualifiée(s)` },
    { nom: "3 · resolve", fait: rapport?.etapes.resolve_faites ?? 0, sur: total, detail: `${rapport?.taux_resolution_domaine ?? 0} % résolus` },
    { nom: "4 · infer", fait: rapport?.etapes.infer_faites ?? 0, sur: rapport?.domaines_resolus ?? 0, detail: `${rapport?.hallucinations_detectees ?? 0} hallucination(s) bloquée(s)` },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Pipeline</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Chaque étape est idempotente : la relancer ne duplique rien et ne re-paye aucun appel déjà en cache.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {barres.map((b) => (
          <div key={b.nom} className="carte p-4 flex flex-col gap-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ fontFamily: "var(--font-mono), monospace", color: "var(--muted)" }}>{b.nom}</span>
              <span className="text-[12px] tabular-nums" style={{ color: "var(--muted)" }}>{b.fait}/{b.sur || "—"}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: b.sur > 0 ? `${(100 * b.fait) / b.sur}%` : "0%", background: "var(--fit)" }} />
            </div>
            <span className="text-[12px]" style={{ color: "var(--muted)" }}>{b.detail}</span>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="carte p-5 flex flex-col gap-4">
          <h2 className="font-semibold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Exécution</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-[13px]" style={{ color: "var(--muted)" }}>Taille échantillon</label>
            <input
              type="number" min={1} max={300} value={taille}
              onChange={(e) => setTaille(Number(e.target.value))}
              className="carte w-20 px-2 py-1 text-sm tabular-nums"
              style={{ fontFamily: "var(--font-mono), monospace" }}
              disabled={enCours !== null || total > 0}
            />
            <button className="bouton" onClick={lancerCollect} disabled={enCours !== null}>
              {total > 0 ? "collect (déjà figé)" : "1 · collect"}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="bouton" onClick={() => lancerBoucle("signals", 10)} disabled={enCours !== null || total === 0}>2 · signals</button>
            <button className="bouton" onClick={() => lancerBoucle("resolve", 5)} disabled={enCours !== null || total === 0}>3 · resolve</button>
            <button className="bouton" onClick={() => lancerBoucle("infer", 2)} disabled={enCours !== null || total === 0}>4 · infer</button>
            {enCours && (
              <button className="bouton bouton-secondaire" onClick={() => { stopRef.current = true; }}>
                ■ arrêter après ce lot
              </button>
            )}
          </div>
          <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            Le classement (étape 5) n&apos;est jamais stocké : il se recalcule à chaque affichage de la page Comptes.
          </p>
        </div>

        <div className="carte p-5 flex flex-col gap-3">
          <h2 className="font-semibold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Coûts ventilés</h2>
          <table className="text-[13px] w-full">
            <tbody>
              {Object.entries(rapport?.couts ?? {}).map(([f, c]) => (
                <tr key={f} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="py-1.5">{FOURNISSEURS[f] ?? f}</td>
                  <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--muted)" }}>{c.appels} appel(s)</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{c.cout_eur.toFixed(3)} €</td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 font-semibold">Total</td>
                <td />
                <td className="pt-2 text-right tabular-nums font-semibold">{(rapport?.cout_total_eur ?? 0).toFixed(3)} €</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>
            Seuls les appels réels sont comptés — les lectures servies par le cache sont gratuites.
          </p>
        </div>
      </section>

      <section className="carte p-5 flex flex-col gap-2">
        <h2 className="font-semibold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Journal</h2>
        <pre
          className="text-[12px] leading-relaxed overflow-x-auto whitespace-pre-wrap rounded-lg p-4 max-h-80 overflow-y-auto"
          style={{ fontFamily: "var(--font-mono), monospace", background: "var(--code-bg)", color: "var(--code-ink)" }}
        >
          {journal.length === 0 ? "En attente d'une exécution…" : journal.join("\n")}
        </pre>
      </section>
    </div>
  );
}
