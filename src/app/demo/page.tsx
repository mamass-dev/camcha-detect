import { comptes, digest, DONNEES, nomAffiche, SECTEURS, villeReference } from "@/lib/demo";
import { Score, Feu, LigneSignal, LienFiche, Etiquette } from "./ui";

export const dynamic = "force-static";

export default function Digest() {
  const tous = comptes();
  const selection = digest(8);
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const nbSignauxMoment = tous.reduce((a, c) => a + c.moment_n, 0);
  const recrutent = tous.filter((c) => c.signaux.some((s) => s.cle === "offres_actives")).length;
  const marches = tous.filter((c) => c.signaux.some((s) => s.cle === "marche_public")).length;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="text-[12px] uppercase tracking-widest" style={{ fontFamily: "var(--font-mono), monospace", color: "var(--muted)" }}>
          Envoyé chaque matin à 6 h · {aujourdhui}
        </span>
        <h1 className="text-[28px] font-bold leading-tight" style={{ fontFamily: "var(--font-display), sans-serif" }}>
          {selection.length} comptes à appeler aujourd&apos;hui
        </h1>
        <p className="text-[14.5px] max-w-3xl" style={{ color: "var(--muted)" }}>
          Sélectionnés parmi {tous.length} PME de 10 à 49 salariés dont le siège est à moins de {DONNEES.zone.rayon_km} km de Nuits-Saint-Georges, Beaune ou Chalon-sur-Saône.
          Classement par <b style={{ color: "var(--moment-ink)" }}>MOMENT</b> (le bon timing) puis par <b style={{ color: "var(--fit-ink)" }}>FIT</b> (le bon profil). Chaque motif renvoie vers sa source publique, avec sa date.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { v: tous.length, l: "PME analysées dans la zone" },
          { v: nbSignauxMoment, l: "signaux de timing détectés" },
          { v: recrutent, l: "recrutent en ce moment (France Travail)" },
          { v: marches, l: "ont remporté un marché public (BOAMP)" },
        ].map((k) => (
          <div key={k.l} className="carte p-4">
            <div className="text-[26px] font-bold tabular-nums leading-none" style={{ fontFamily: "var(--font-display), sans-serif" }}>{k.v}</div>
            <div className="text-[12.5px] mt-1.5" style={{ color: "var(--muted)" }}>{k.l}</div>
          </div>
        ))}
      </section>

      <ol className="flex flex-col gap-4">
        {selection.map((c, i) => {
          const ref = villeReference(c);
          const dec = c.decideurs[0];
          return (
            <li key={c.siren} className="carte p-5 flex flex-col gap-4">
              <div className="flex flex-wrap gap-4 items-start">
                <span className="text-[13px] font-semibold tabular-nums w-6 pt-1" style={{ fontFamily: "var(--font-mono), monospace", color: "var(--muted)" }}>{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 min-w-60 flex flex-col gap-1.5">
                  <h2 className="text-[18px] font-bold leading-tight" style={{ fontFamily: "var(--font-display), sans-serif" }}>
                    <LienFiche c={c}>{nomAffiche(c)}</LienFiche>
                  </h2>
                  {nomAffiche(c) !== c.raison_sociale && <div className="text-[12.5px] -mt-1" style={{ color: "var(--muted)" }}>{c.raison_sociale}</div>}
                  <div className="text-[13px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: "var(--muted)" }}>
                    <span>{c.commune} · {ref.km} km de {ref.ville}</span>
                    <span>{c.effectif_libelle} salariés</span>
                    <span>{SECTEURS[c.secteur ?? ""] ?? c.ape}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Feu niveau={c.sante.niveau} />
                    {c.signaux.some((s) => s.cle === "offres_actives") && <Etiquette ton="moment">Recrute · {c.signaux.find((s) => s.cle === "offres_actives")?.nb} offre(s)</Etiquette>}
                    {c.signaux.some((s) => s.cle === "marche_public") && <Etiquette ton="moment">Marché public</Etiquette>}
                    {c.signaux.some((s) => ["bien_etre_affiche", "demarche_rse"].includes(s.cle)) && <Etiquette ton="fit">RSE / bien-être</Etiquette>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Score valeur={c.moment} n={c.moment_n} axe="moment" />
                  <Score valeur={c.fit} n={c.fit_n} axe="fit" />
                </div>
              </div>

              <ul className="flex flex-col gap-2 pl-10">
                {c.motifs.slice(0, 4).map((m) => <LigneSignal key={m.cle} s={m.signal} axe={m.axe} />)}
              </ul>

              <div className="pl-10 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] pt-3 border-t" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                <span>{dec ? <><b style={{ color: "var(--ink)" }}>{dec.nom}</b> · {dec.fonction}</> : "Décideur : voir fiche (registre)"}</span>
                {c.site && <a href={c.site.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.site.url.replace(/^https?:\/\/(www\.)?/, "")}</a>}
                {c.telephone && <span>{c.telephone}</span>}
                <LienFiche c={c}><span className="ml-auto font-medium" style={{ color: "var(--ink)" }}>Fiche complète →</span></LienFiche>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
