import { accroche, comptes, DONNEES, nomAffiche } from "@/lib/demo";
import { Carte, type Point } from "./carte";

export const dynamic = "force-static";

export default function PageCarte() {
  const tous = comptes();
  const points: Point[] = tous.map((c) => ({ siren: c.siren, nom: nomAffiche(c), commune: c.commune, lat: c.lat, lon: c.lon, moment: c.moment, fit: c.fit, sante: c.sante.niveau, accroche: accroche(c), effectif: c.effectif_libelle }));
  const chauds = tous.filter((c) => c.moment_n > 0 && !c.disqualifie).length;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display), sans-serif" }}>La zone en un coup d&apos;œil</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {tous.length} PME dans un rayon de {DONNEES.zone.rayon_km} km. <span style={{ color: "var(--moment-ink)" }}>●</span> {chauds} avec un signal de timing (plus le point est gros, plus le MOMENT est fort) ·
            <span style={{ color: "var(--muted)" }}> ●</span> sans signal · <span style={{ color: "var(--err)" }}>●</span> procédure collective. Cliquer un point pour l&apos;accroche et la fiche.
          </p>
        </div>
      </header>
      <Carte points={points} rayon={DONNEES.zone.rayon_km} />
    </div>
  );
}
