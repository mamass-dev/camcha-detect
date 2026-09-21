import { comptes, DONNEES, LIBELLES, POIDS } from "@/lib/demo";

export const dynamic = "force-static";

type Faisabilite = "auto" | "partiel" | "manuel";
const FAIS: Record<Faisabilite, { l: string; c: string; f: string }> = {
  auto: { l: "Automatique, fiable", c: "var(--ok)", f: "var(--ok-soft)" },
  partiel: { l: "Automatique, partiel", c: "var(--warn)", f: "var(--warn-soft)" },
  manuel: { l: "Manuel ou hors périmètre", c: "var(--err)", f: "var(--err-soft)" },
};

const CRITERES: Array<{ critere: string; source: string; fais: Faisabilite; cout: string; note: string; cles?: string[] }> = [
  { critere: "Recrutement en cours (CDI, CDD, alternance, plusieurs postes)", source: "France Travail (API Offres v2)", fais: "auto", cout: "Gratuit", note: "Offres des 90 derniers jours, rattachées par nom d'employeur. Indeed, HelloWork et Apec n'ont pas d'API publique : couverts en partie car ils republient sur France Travail.", cles: ["offres_actives", "recrutement_multiple", "alternance"] },
  { critere: "Difficultés à recruter, métiers en tension", source: "France Travail (ancienneté des offres)", fais: "partiel", cout: "Gratuit", note: "Proxy : offre ouverte depuis plus de 60 jours. Pas de source directe.", cles: ["tension_recrutement"] },
  { critere: "Croissance des effectifs", source: "INSEE / SIRENE (tranche d'effectif annuelle)", fais: "partiel", cout: "Gratuit", note: "Une seule tranche par an : détecte un changement de tranche, pas une croissance fine." },
  { critere: "Ouverture ou agrandissement d'un établissement", source: "BODACC, SIRENE (établissements)", fais: "auto", cout: "Gratuit", note: "Avis de modification et établissements secondaires ouverts.", cles: ["ouverture_etablissement", "multi_etablissements"] },
  { critere: "Investissement récent", source: "BODACC (capital)", fais: "partiel", cout: "Gratuit", note: "Le BODACC dit « modification du capital » sans en donner le sens : signal « probable ».", cles: ["augmentation_capital"] },
  { critere: "Développement d'une nouvelle activité", source: "BODACC (objet social)", fais: "partiel", cout: "Gratuit", note: "Détecte une extension d'objet social, pas une nouvelle offre commerciale.", cles: ["nouvelle_activite"] },
  { critere: "Levée de fonds ou croissance annoncée", source: "BODACC, presse", fais: "manuel", cout: "—", note: "Quasi inexistant sur 10-49 salariés en Bourgogne. Le critère produira très peu de résultats." },
  { critere: "Déménagement dans de nouveaux locaux", source: "BODACC (transfert de siège)", fais: "auto", cout: "Gratuit", note: "", cles: ["transfert_siege"] },
  { critere: "Obtention d'un marché important", source: "BOAMP (avis d'attribution)", fais: "auto", cout: "Gratuit", note: "Attributions des 18 derniers mois, départements 21 et 71, rattachées par nom d'attributaire.", cles: ["marche_public"] },
  { critere: "Actualité économique positive", source: "Presse locale (Bien Public, Journal du Palais, Le Progrès)", fais: "manuel", cout: "Abonnements, pas d'API", note: "Paywall, pas d'API. Un suivi de flux de titres est possible mais donne peu de résultats et des faux positifs." },
  { critere: "Communication bien-être, fidélisation, marque employeur", source: "Site web de l'entreprise (lecture par IA)", fais: "partiel", cout: "≈ 0,01 à 0,02 € / entreprise", note: "Sur la démo : détection lexicale simple. En production : lecture par Claude avec citation exacte exigée.", cles: ["bien_etre_affiche"] },
  { critere: "Volonté affichée d'attirer ou fidéliser", source: "Site web (page recrutement)", fais: "partiel", cout: "Gratuit", note: "", cles: ["page_carrieres"] },
  { critere: "Entreprise à mission ou démarche à impact", source: "SIRENE (société à mission, ESS)", fais: "auto", cout: "Gratuit", note: "", cles: ["ess_ou_mission"] },
  { critere: "Politique RSE structurée ou affichée", source: "Site web (lecture par IA)", fais: "partiel", cout: "≈ 0,01 à 0,02 € / entreprise", note: "Détecte une RSE affichée, pas une RSE réelle.", cles: ["demarche_rse"] },
  { critere: "Lauréates ou membres de Réseau Entreprendre", source: "Site de Réseau Entreprendre Bourgogne", fais: "partiel", cout: "Gratuit", note: "Liste publique, relevé mensuel et rapprochement par nom.", cles: ["reseau_entreprendre"] },
  { critere: "Emploi, insertion, jeunes, seniors, handicap", source: "Site web, offres France Travail (alternance)", fais: "partiel", cout: "Gratuit", note: "", cles: ["engagement_emploi", "alternance"] },
  { critere: "Soutien à des sportifs de haut niveau", source: "Site web", fais: "manuel", cout: "—", note: "Aucune source structurée. Seulement si l'entreprise l'affiche sur son site.", cles: ["sponsoring_sport"] },
  { critere: "Dirigeants dans des clubs service (Lions, Rotary…)", source: "—", fais: "manuel", cout: "—", note: "Aucune source structurée, et profilage de personnes sur leur vie associative : recommandé hors périmètre (RGPD)." },
];

const SOURCES: Array<{ source: string; usage: string; acces: "Gratuit" | "Économique" | "Premium"; cout: string; limites: string; interet: string; cle?: string }> = [
  { source: "Annuaire des entreprises (API Recherche d'entreprises)", usage: "Liste des PME, siège, effectif, APE, dirigeants, finances publiées", acces: "Gratuit", cout: "0 €", limites: "7 requêtes / seconde, 10 000 résultats par requête", interet: "Socle indispensable", cle: "recherche_entreprises" },
  { source: "BODACC (open data)", usage: "Modifications, capital, siège, dirigeants, dépôts de comptes, procédures collectives", acces: "Gratuit", cout: "0 €", limites: "Aucune contraignante", interet: "Fort : timing et santé", cle: "bodacc" },
  { source: "France Travail (API Offres d'emploi v2)", usage: "Offres publiées, type de contrat, ancienneté", acces: "Gratuit", cout: "0 €", limites: "Clé développeur, 5 communes par requête, 3 150 résultats par requête", interet: "Fort : le signal n°1 du brief", cle: "france_travail" },
  { source: "BOAMP (open data)", usage: "Attributions de marchés publics", acces: "Gratuit", cout: "0 €", limites: "Nom de l'attributaire parfois absent", interet: "Moyen à fort selon secteur", cle: "boamp" },
  { source: "Site web de l'entreprise (crawl léger)", usage: "Site, téléphone, page recrutement, RSE, bien-être", acces: "Gratuit", cout: "0 €", limites: "Site trouvé pour 15 % des PME sans Google Places, 60 à 70 % avec", interet: "Fort pour la fiche contact", cle: "crawl" },
  { source: "Google Places (API Places)", usage: "Site web et téléphone officiels", acces: "Économique", cout: "≈ 0,03 € / entreprise, quota gratuit mensuel", limites: "Facturation à l'appel au-delà du quota", interet: "Fort : triple le taux de sites trouvés" },
  { source: "Claude (Anthropic)", usage: "Lecture des sites : RSE, bien-être, séminaires, avantages salariés, avec citation exacte", acces: "Économique", cout: "≈ 0,01 à 0,02 € / entreprise, soit 10 à 15 € / mois pour la zone", limites: "Aucun signal sans citation vérifiable", interet: "Fort pour les critères qualitatifs" },
  { source: "Pappers / Societe.com / Infogreffe", usage: "Comptes détaillés, scores financiers", acces: "Premium", cout: "Pappers API dès ≈ 50 € / mois ; Infogreffe à l'acte", limites: "Comptes confidentiels pour beaucoup de PME", interet: "Faible : le BODACC couvre l'essentiel gratuitement" },
  { source: "LinkedIn (entreprise et décideur)", usage: "Profils, effectif réel, actualités", acces: "Premium", cout: "Sales Navigator ≈ 100 € / mois / utilisateur, usage manuel", limites: "Pas d'API pour la prospection, scraping interdit", interet: "Fort mais manuel uniquement" },
  { source: "Enrichissement e-mail (Dropcontact, Hunter, Kaspr…)", usage: "E-mail et téléphone du décideur", acces: "Économique", cout: "≈ 0,10 à 0,30 € / contact", limites: "40 à 60 % de réussite sur des PME de cette taille", interet: "Moyen : à activer sur les comptes retenus seulement" },
  { source: "Presse économique locale", usage: "Actualité positive, investissements", acces: "Premium", cout: "Abonnements, pas d'API", limites: "Lecture manuelle ou veille de titres", interet: "Faible en automatique" },
  { source: "CCI, clubs d'entreprises, Réseau Entreprendre", usage: "Listes de membres et lauréats", acces: "Gratuit", cout: "0 €", limites: "Pages publiques, relevé périodique", interet: "Moyen" },
];

export default function Methode() {
  const tous = comptes();
  const nb = (cles?: string[]) => (cles ? tous.filter((c) => c.signaux.some((s) => cles.includes(s.cle))).length : null);
  const appels = DONNEES.appels;
  const totalAppels = Object.values(appels).reduce((a, b) => a + b.reels + b.cache, 0);
  const ex = DONNEES.exclusions;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Méthode, sources et coûts</h1>
        <p className="text-[14px] max-w-3xl" style={{ color: "var(--muted)" }}>
          Réponse aux sections 03, 04 et 05 du cahier des charges. Ce que la démo a réellement fait : {DONNEES.zone.communes} communes dans un rayon de {DONNEES.zone.rayon_km} km,
          {" "}{tous.length + ex.hors_zone + ex.nature_juridique} entreprises examinées, {tous.length} retenues (siège dans la zone, société commerciale, 10 à 49 salariés), {totalAppels} appels d&apos;API, coût total : 0 €.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-[16px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>Critères du cahier des charges → faisabilité</h2>
        <div className="carte overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}>
                <th className="px-3 py-2.5 font-medium">Critère (section 03)</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Faisabilité</th>
                <th className="px-3 py-2.5 font-medium">Coût</th>
                <th className="px-3 py-2.5 font-medium text-right">Détecté sur la zone</th>
              </tr>
            </thead>
            <tbody>
              {CRITERES.map((c) => {
                const n = nb(c.cles);
                return (
                  <tr key={c.critere} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
                    <td className="px-3 py-2.5 min-w-56">
                      <div className="font-medium">{c.critere}</div>
                      {c.note && <div className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{c.note}</div>}
                    </td>
                    <td className="px-3 py-2.5 min-w-44">{c.source}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-medium" style={{ background: FAIS[c.fais].f, color: FAIS[c.fais].c }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: FAIS[c.fais].c }} />{FAIS[c.fais].l}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{c.cout}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{n == null ? <span style={{ color: "var(--muted)" }}>—</span> : n === 0 ? <span style={{ color: "var(--muted)" }}>0 (non activé sur la démo)</span> : <b>{n}</b>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-[16px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>Sources : niveau d&apos;accès, coût, limites, intérêt réel</h2>
        <div className="carte overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}>
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Usage</th>
                <th className="px-3 py-2.5 font-medium">Accès</th>
                <th className="px-3 py-2.5 font-medium">Coût estimatif</th>
                <th className="px-3 py-2.5 font-medium">Limites / quotas</th>
                <th className="px-3 py-2.5 font-medium">Intérêt</th>
                <th className="px-3 py-2.5 font-medium text-right">Appels démo</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => {
                const a = s.cle ? appels[s.cle] : null;
                const ton = s.acces === "Gratuit" ? { c: "var(--ok)", f: "var(--ok-soft)" } : s.acces === "Économique" ? { c: "var(--warn)", f: "var(--warn-soft)" } : { c: "var(--err)", f: "var(--err-soft)" };
                return (
                  <tr key={s.source} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
                    <td className="px-3 py-2.5 font-medium min-w-48">{s.source}</td>
                    <td className="px-3 py-2.5 min-w-48">{s.usage}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium" style={{ background: ton.f, color: ton.c }}>{s.acces}</span></td>
                    <td className="px-3 py-2.5 min-w-40">{s.cout}</td>
                    <td className="px-3 py-2.5 min-w-44" style={{ color: "var(--muted)" }}>{s.limites}</td>
                    <td className="px-3 py-2.5 min-w-36">{s.interet}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{a ? `${a.reels + a.cache}` : <span style={{ color: "var(--muted)" }}>non utilisé</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section id="scores" className="flex flex-col gap-3 scroll-mt-6">
        <h2 className="font-semibold text-[16px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>Barème des scores MOMENT et FIT</h2>
        <p className="text-[13.5px] max-w-3xl" style={{ color: "var(--muted)" }}>
          Deux scores sur 100, indépendants, jamais additionnés. Score = somme des poids des signaux détectés ÷ total des poids de l&apos;axe × 100. Un signal « probable » compte {Math.round(POIDS.valeur_probable * 100)} % de son poids.
          Un 100 est théorique : les scores servent à classer les comptes entre eux, pas à les noter. Les poids ci-dessous sont réglables.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {(["moment", "fit"] as const).map((axe) => {
            const poids = POIDS[axe];
            const total = Object.values(poids).reduce((a, b) => a + b, 0);
            const couleur = axe === "moment" ? "var(--moment-ink)" : "var(--fit-ink)";
            return (
              <div key={axe} className="carte overflow-hidden">
                <div className="px-4 py-3 border-b flex items-baseline justify-between" style={{ borderColor: "var(--line)" }}>
                  <span className="font-semibold uppercase tracking-widest text-[12px]" style={{ fontFamily: "var(--font-mono), monospace", color: couleur }}>{axe}</span>
                  <span className="text-[12px]" style={{ color: "var(--muted)" }}>{axe === "moment" ? "le bon timing" : "le bon profil"} · {Object.keys(poids).length} signaux · {total} points possibles</span>
                </div>
                <table className="w-full text-[13px]">
                  <tbody>
                    {Object.entries(poids).sort((a, b) => b[1] - a[1]).map(([cle, p]) => (
                      <tr key={cle} className="border-t" style={{ borderColor: "var(--line)" }}>
                        <td className="px-4 py-1.5">{LIBELLES[cle] ?? cle}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums" style={{ color: "var(--muted)" }}>{p} pt{p > 1 ? "s" : ""} · <b style={{ color: couleur }}>{Math.round((100 * p) / total)}</b> /100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="carte p-5 flex flex-col gap-2">
          <h2 className="font-semibold text-[15px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>Durée de vie des signaux</h2>
          <p className="text-[13.5px]" style={{ color: "var(--muted)" }}>
            Chaque signal a une source publique, une date et une durée de vie : un recrutement expire au bout de 7 jours sans renouvellement, un avis BODACC au bout de 90 jours, une mention RSE sur le site au bout d&apos;un an. Un compte remonte donc dans le digest quand il se passe quelque chose, et redescend seul ensuite.
          </p>
        </div>
        <div className="carte p-5 flex flex-col gap-2">
          <h2 className="font-semibold text-[15px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>Ce que la production ajoute à la démo</h2>
          <ul className="text-[13.5px] flex flex-col gap-1" style={{ color: "var(--muted)" }}>
            <li>• Google Places pour passer de 15 % à 60-70 % de sites et téléphones trouvés.</li>
            <li>• Lecture des sites par Claude, avec citation exacte exigée, pour la RSE, le bien-être, les séminaires et les avantages salariés.</li>
            <li>• Relance quotidienne des sources et envoi du digest par e-mail à 6 h, avec mémoire des comptes déjà proposés.</li>
            <li>• Feu tricolore financier enrichi des comptes déposés, et enrichissement e-mail à la demande sur les comptes retenus.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
