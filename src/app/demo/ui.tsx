import Link from "next/link";
import type { Compte, Signal } from "@/lib/demo";
import { dateFr, LIBELLES } from "@/lib/demo";

export function Score({ valeur, n, axe }: { valeur: number; n: number; axe: "fit" | "moment" }) {
  const titre = axe === "moment" ? "MOMENT : le bon timing. Somme des poids des signaux de timing détectés, sur 100. Sert à classer, pas à noter." : "FIT : le bon profil. Somme des poids des signaux de profil détectés, sur 100. Sert à classer, pas à noter.";
  const couleur = axe === "fit" ? "var(--fit-ink)" : "var(--moment-ink)";
  const fond = axe === "fit" ? "var(--fit-soft)" : "var(--moment-soft)";
  return (
    <span title={titre} className="inline-flex flex-col items-center px-3 py-1.5 rounded-md tabular-nums min-w-16 cursor-help" style={{ background: fond, color: couleur }}>
      <span className="text-[10px] uppercase tracking-widest opacity-80" style={{ fontFamily: "var(--font-mono), monospace" }}>{axe}</span>
      <span className="leading-tight"><b className="text-[19px]">{valeur}</b><span className="text-[10.5px] opacity-70">/100</span></span>
      <span className="text-[10.5px] opacity-75">{n} signal{n > 1 ? "x" : ""}</span>
    </span>
  );
}

const FEU = {
  vert: { c: "var(--ok)", f: "var(--ok-soft)", l: "Saine" },
  orange: { c: "var(--warn)", f: "var(--warn-soft)", l: "À vérifier" },
  rouge: { c: "var(--err)", f: "var(--err-soft)", l: "Alerte" },
};
export function Feu({ niveau, detail }: { niveau: "vert" | "orange" | "rouge"; detail?: boolean }) {
  const s = FEU[niveau];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-medium" style={{ background: s.f, color: s.c }}>
      <span className="w-2 h-2 rounded-full" style={{ background: s.c }} />
      {detail ? s.l : `Santé : ${s.l.toLowerCase()}`}
    </span>
  );
}

export function Etiquette({ children, ton = "neutre" }: { children: React.ReactNode; ton?: "neutre" | "moment" | "fit" }) {
  const st = ton === "moment" ? { background: "var(--moment-soft)", color: "var(--moment-ink)" } : ton === "fit" ? { background: "var(--fit-soft)", color: "var(--fit-ink)" } : { background: "var(--bg)", color: "var(--muted)", border: "1px solid var(--line)" };
  return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-medium whitespace-nowrap" style={st}>{children}</span>;
}

export function LigneSignal({ s, axe }: { s: Signal; axe?: "fit" | "moment" }) {
  return (
    <li className="flex flex-col gap-0.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: axe === "fit" ? "var(--fit)" : "var(--moment)" }} />
        <span className="font-medium">{LIBELLES[s.cle] ?? s.cle}</span>
        {s.valeur === "probable" && <Etiquette>probable</Etiquette>}
        {s.methode === "infere" && <Etiquette>détection sur le site</Etiquette>}
        <span className="text-[12px] ml-auto shrink-0" style={{ color: "var(--muted)" }}>
          <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{s.source}</a> · {dateFr(s.date)}
        </span>
      </div>
      {s.verbatim && <p className="pl-3.5 text-[12.5px] leading-snug" style={{ color: "var(--muted)" }}>{s.verbatim.length > 220 ? s.verbatim.slice(0, 220) + "…" : s.verbatim}</p>}
    </li>
  );
}

export function LienFiche({ c, children }: { c: Compte; children: React.ReactNode }) {
  return <Link href={`/demo/comptes/${c.siren}`} className="hover:underline underline-offset-2">{children}</Link>;
}

export function LireScores({ compact }: { compact?: boolean }) {
  return (
    <details className="carte px-4 py-3 text-[13px]" style={{ color: "var(--muted)" }}>
      <summary className="cursor-pointer font-medium" style={{ color: "var(--ink)" }}>Comment lire MOMENT et FIT</summary>
      <div className="mt-2 flex flex-col gap-1.5 max-w-3xl">
        <p>Deux scores sur 100, indépendants, jamais additionnés. <b style={{ color: "var(--moment-ink)" }}>MOMENT</b> répond à « est-ce le bon moment pour appeler ? » (recrutement, marché remporté, changement de dirigeant, capital, déménagement). <b style={{ color: "var(--fit-ink)" }}>FIT</b> répond à « est-ce le bon profil de client ? » (bien-être, RSE, engagement emploi, taille, ancienneté).</p>
        <p>Chaque signal détecté apporte son poids (de 1 à 3). Le score est la somme des poids obtenus rapportée au total possible de l&apos;axe. Un signal « probable » compte 60 % de son poids. Un 100 est donc théorique : aucune entreprise ne cumule tous les signaux. <b>Un score sert à classer les comptes entre eux, pas à les noter.</b> 40 en MOMENT veut dire « en haut de la pile aujourd&apos;hui ».</p>
        {!compact && <p>Les poids sont réglables. Barème complet sur la page <Link href="/demo/methode#scores" className="underline underline-offset-2">Méthode, sources et coûts</Link>.</p>}
      </div>
    </details>
  );
}
