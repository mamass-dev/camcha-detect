import Link from "next/link";
import { accroche, comptes, dateFr, digest, nomAffiche, SECTEURS, villeReference } from "@/lib/demo";
import { BoutonImprimer } from "./imprimer";

export const dynamic = "force-static";

const FEU = { vert: "#2f7d4f", orange: "#96690f", rouge: "#b3372f" };

export default function Email() {
  const selection = digest(8);
  const total = comptes().length;
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const objet = `CAMCHA · ${selection.length} comptes à appeler ce ${date.split(" ")[0]} — ${selection.slice(0, 2).map(nomAffiche).join(", ")}…`;

  return (
    <div className="flex flex-col gap-5">
      <style>{`@media print { nav, .no-print { display: none !important; } main { padding: 0 !important; max-width: none !important; } .email { box-shadow: none !important; border: 0 !important; } body { background: #fff !important; } }`}</style>
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display), sans-serif" }}>Aperçu de l&apos;e-mail du matin</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Tel qu&apos;il arrivera chaque jour à 6 h dans la boîte des commerciaux. Le CSV contient les {total} comptes classés, avec l&apos;accroche et les sources.</p>
        </div>
        <div className="flex gap-2">
          <a href="/demo/export.csv" className="bouton">Télécharger le CSV complet</a>
          <BoutonImprimer />
        </div>
      </header>

      <div className="email mx-auto w-full max-w-2xl rounded-lg overflow-hidden" style={{ background: "#ffffff", color: "#1a222c", border: "1px solid #dce2e8", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div className="px-6 py-3 text-[12px] border-b" style={{ borderColor: "#e8ecf0", color: "#5b6875", background: "#f7f9fa" }}>
          <div><b>De :</b> CAMCHA détection &lt;digest@camcha.fr&gt;</div>
          <div><b>À :</b> équipe commerciale</div>
          <div><b>Objet :</b> {objet}</div>
        </div>
        <div className="px-6 py-6 flex flex-col gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-widest" style={{ color: "#5b6875" }}>{date} · 6 h 00</div>
            <h2 className="text-[22px] font-bold mt-1" style={{ color: "#1a222c" }}>{selection.length} comptes à appeler aujourd&apos;hui</h2>
            <p className="text-[13.5px] mt-1" style={{ color: "#5b6875" }}>Sur {total} PME de 10 à 49 salariés suivies autour de Nuits-Saint-Georges, Beaune et Chalon-sur-Saône. Chaque motif est vérifiable en un clic.</p>
          </div>
          {selection.map((c, i) => {
            const ref = villeReference(c);
            const dec = c.decideurs[0];
            return (
              <div key={c.siren} className="rounded-md p-4" style={{ border: "1px solid #e8ecf0" }}>
                <div className="flex justify-between gap-3 items-start">
                  <div>
                    <div className="text-[11px] font-semibold" style={{ color: "#c05a17" }}>#{i + 1} · MOMENT {c.moment} · FIT {c.fit}</div>
                    <div className="text-[16px] font-bold mt-0.5">{nomAffiche(c)}</div>
                    <div className="text-[12.5px]" style={{ color: "#5b6875" }}>{c.commune}, {ref.km} km de {ref.ville} · {c.effectif_libelle} salariés · {SECTEURS[c.secteur ?? ""] ?? c.ape}</div>
                  </div>
                  <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: FEU[c.sante.niveau] }}>● santé {c.sante.niveau === "vert" ? "saine" : "à vérifier"}</span>
                </div>
                <p className="text-[13.5px] mt-2.5 font-medium">{accroche(c)}</p>
                <ul className="mt-2 flex flex-col gap-1 text-[12.5px]" style={{ color: "#5b6875" }}>
                  {c.motifs.slice(0, 3).map((m) => (
                    <li key={m.cle}>• {m.libelle} — <a href={m.signal.source_url} style={{ color: "#146c60" }}>{m.signal.source}</a>, {dateFr(m.signal.date)}</li>
                  ))}
                </ul>
                <div className="mt-2.5 text-[12.5px] flex flex-wrap gap-x-4 gap-y-1" style={{ color: "#5b6875" }}>
                  {dec && <span><b style={{ color: "#1a222c" }}>{dec.nom}</b>, {dec.fonction}</span>}
                  {c.telephone && <span>{c.telephone}</span>}
                  {c.site && <a href={c.site.url} style={{ color: "#146c60" }}>{c.site.url.replace(/^https?:\/\/(www\.)?/, "")}</a>}
                  <Link href={`/demo/comptes/${c.siren}`} style={{ color: "#146c60" }} className="no-print">Fiche complète</Link>
                </div>
              </div>
            );
          })}
          <p className="text-[11.5px] pt-2 border-t" style={{ color: "#8a96a2", borderColor: "#e8ecf0" }}>
            Sources : Annuaire des entreprises, BODACC, France Travail, BOAMP, sites des entreprises. Un compte proposé n&apos;est pas reproposé avant 30 jours sauf nouveau signal. Répondre à cet e-mail pour signaler un compte à exclure.
          </p>
        </div>
      </div>
    </div>
  );
}
