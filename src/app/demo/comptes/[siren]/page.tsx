import Link from "next/link";
import { notFound } from "next/navigation";
import { comptes, CRITERE_CDC, dateFr, nomAffiche, parSiren, SECTEURS } from "@/lib/demo";
import { Score, Feu, LigneSignal, Etiquette } from "../../ui";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() { return comptes().map((c) => ({ siren: c.siren })); }

const NIVEAU = { oui: "Oui", souhaite: "Souhaité", dispo: "Oui si disponible" } as const;

export default async function Fiche({ params }: { params: Promise<{ siren: string }> }) {
  const { siren } = await params;
  const c = parSiren(siren);
  if (!c) notFound();
  const dec = c.decideurs[0];
  const nbOffres = c.offres?.length ?? 0;
  const actus = c.signaux.filter((s) => !["idcc_renseigne", "anciennete_3ans", "effectif_20_49", "multi_etablissements"].includes(s.cle)).sort((a, b) => b.date.localeCompare(a.date));

  const manque = (texte: string) => <span style={{ color: "var(--muted)" }}>{texte}</span>;
  const lignes: Array<{ info: string; niveau: keyof typeof NIVEAU; valeur: React.ReactNode; source?: string }> = [
    { info: "Nom commercial", niveau: "oui", valeur: nomAffiche(c) },
    { info: "Raison sociale", niveau: "oui", valeur: c.raison_sociale },
    { info: "Ville", niveau: "oui", valeur: `${c.commune} (${c.code_postal})` },
    { info: "Adresse", niveau: "oui", valeur: c.adresse },
    { info: "Distance", niveau: "oui", valeur: Object.entries(c.distances).map(([v, km]) => `${v} ${km} km`).join(" · ") },
    { info: "Nombre de salariés estimé", niveau: "oui", valeur: `${c.effectif_libelle}${c.effectif_annee ? ` (INSEE ${c.effectif_annee})` : ""}` },
    { info: "Secteur d'activité", niveau: "oui", valeur: SECTEURS[c.secteur ?? ""] ?? c.ape },
    { info: "Code APE", niveau: "souhaite", valeur: c.ape },
    { info: "SIREN", niveau: "souhaite", valeur: <a href={c.source_fiche} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}</a> },
    { info: "Site internet", niveau: "dispo", valeur: c.site ? <a href={c.site.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.site.url.replace(/^https?:\/\//, "")}</a> : manque("Non identifié automatiquement (Google Places non activé sur la démo)"), source: c.site ? `preuve : ${c.site.preuve}` : undefined },
    { info: "Nom du dirigeant / décideur", niveau: "dispo", valeur: dec ? dec.nom : c.morales[0] ? `${c.morales[0].nom} (personne morale)` : manque("Non publié au registre") },
    { info: "Fonction", niveau: "oui", valeur: dec?.fonction ?? c.morales[0]?.fonction ?? manque("—") },
    { info: "LinkedIn entreprise", niveau: "souhaite", valeur: <a href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(nomAffiche(c))}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Rechercher sur LinkedIn</a>, source: "pas d'API : lien de recherche, vérification manuelle" },
    { info: "LinkedIn décideur", niveau: "souhaite", valeur: dec ? <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${dec.nom} ${nomAffiche(c)}`)}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Rechercher {dec.nom}</a> : manque("—"), source: "manuel" },
    { info: "Téléphone professionnel", niveau: "souhaite", valeur: c.telephone ?? manque("Non trouvé (site ou Google Places)") },
    { info: "E-mail professionnel", niveau: "souhaite", valeur: manque("Enrichissement payant à la ligne, non inclus dans la démo") },
    { info: "Entreprise qui recrute ?", niveau: "oui", valeur: nbOffres > 0 ? <b style={{ color: "var(--moment-ink)" }}>Oui</b> : "Non (aucune offre France Travail sur 90 j)" },
    { info: "Nombre d'offres détectées", niveau: "souhaite", valeur: String(nbOffres) },
    { info: "Santé financière", niveau: "oui", valeur: <span className="flex flex-wrap items-center gap-2"><Feu niveau={c.sante.niveau} detail /><span className="text-[12.5px]">{c.sante.motif}</span></span>, source: "BODACC + comptes publiés" },
    { info: "Actualité récente détectée", niveau: "oui", valeur: actus.length ? `${actus.length} signal(aux), voir ci-dessous` : "Aucune sur la période" },
    { info: "Source et date de l'information", niveau: "oui", valeur: "Indiquées sur chaque signal ci-dessous" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/demo" className="text-[13px] underline underline-offset-2" style={{ color: "var(--muted)" }}>← Digest du matin</Link>
      <header className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 min-w-64">
          <h1 className="text-[26px] font-bold leading-tight" style={{ fontFamily: "var(--font-display), sans-serif" }}>{nomAffiche(c)}</h1>
          <p className="text-[13.5px] mt-1" style={{ color: "var(--muted)" }}>
            {c.raison_sociale} · {c.commune} · {c.effectif_libelle} salariés · créée le {dateFr(c.date_creation)}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Feu niveau={c.sante.niveau} />
            {c.est_mission && <Etiquette ton="fit">Société à mission</Etiquette>}
            {c.est_ess && <Etiquette ton="fit">ESS</Etiquette>}
            {c.disqualifie && <Etiquette>Écartée : {c.disqualifie}</Etiquette>}
          </div>
        </div>
        <div className="flex gap-2">
          <Score valeur={c.moment} n={c.moment_n} axe="moment" />
          <Score valeur={c.fit} n={c.fit_n} axe="fit" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="carte overflow-hidden">
          <h2 className="px-4 py-3 font-semibold text-[14px] border-b" style={{ fontFamily: "var(--font-display), sans-serif", borderColor: "var(--line)" }}>
            Fiche prospect <span className="font-normal text-[12px]" style={{ color: "var(--muted)" }}>— format du cahier des charges (section 06)</span>
          </h2>
          <table className="w-full text-[13px]">
            <tbody>
              {lignes.map((l) => (
                <tr key={l.info} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2 w-44" style={{ color: "var(--muted)" }}>
                    {l.info}
                    <div className="text-[10.5px] uppercase tracking-wider mt-0.5" style={{ fontFamily: "var(--font-mono), monospace", opacity: 0.7 }}>{NIVEAU[l.niveau]}</div>
                  </td>
                  <td className="px-4 py-2">
                    {l.valeur}
                    {l.source && <div className="text-[11.5px] mt-0.5" style={{ color: "var(--muted)" }}>{l.source}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="flex flex-col gap-6">
          <section className="carte p-4 flex flex-col gap-3">
            <h2 className="font-semibold text-[14px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>Signaux détectés ({c.signaux.length})</h2>
            {c.signaux.length === 0 && <p className="text-[13px]" style={{ color: "var(--muted)" }}>Aucun signal sur la période.</p>}
            <ul className="flex flex-col gap-2.5">
              {c.motifs.map((m) => (
                <div key={m.cle}>
                  <LigneSignal s={m.signal} axe={m.axe} />
                  <div className="pl-3.5 text-[11px] mt-0.5" style={{ color: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}>critère CDC : {CRITERE_CDC[m.cle] ?? "—"} · confiance {Math.round(m.signal.confiance * 100)} %</div>
                </div>
              ))}
            </ul>
          </section>

          {c.offres && c.offres.length > 0 && (
            <section className="carte p-4 flex flex-col gap-2">
              <h2 className="font-semibold text-[14px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>Offres d&apos;emploi ({c.offres.length})</h2>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {c.offres.map((o) => (
                  <li key={o.id} className="flex flex-wrap gap-x-2">
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{o.intitule}</a>
                    <span style={{ color: "var(--muted)" }}>{o.type} · {o.lieu} · {dateFr(o.date)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(c.decideurs.length > 1 || c.morales.length > 0) && (
            <section className="carte p-4 flex flex-col gap-2">
              <h2 className="font-semibold text-[14px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>Dirigeants au registre</h2>
              <ul className="text-[13px] flex flex-col gap-1">
                {c.decideurs.map((d) => <li key={d.nom + d.fonction}><b>{d.nom}</b> <span style={{ color: "var(--muted)" }}>· {d.fonction}</span></li>)}
                {c.morales.map((d) => <li key={d.siren}>{d.nom} <span style={{ color: "var(--muted)" }}>· {d.fonction} (personne morale)</span></li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
