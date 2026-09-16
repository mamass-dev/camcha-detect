import Link from "next/link";
import type { Compte, Signal } from "@/lib/demo";
import { dateFr, LIBELLES } from "@/lib/demo";

export function Score({ valeur, n, axe }: { valeur: number; n: number; axe: "fit" | "moment" }) {
  const couleur = axe === "fit" ? "var(--fit-ink)" : "var(--moment-ink)";
  const fond = axe === "fit" ? "var(--fit-soft)" : "var(--moment-soft)";
  return (
    <span className="inline-flex flex-col items-center px-3 py-1.5 rounded-md tabular-nums min-w-16" style={{ background: fond, color: couleur }}>
      <span className="text-[10px] uppercase tracking-widest opacity-80" style={{ fontFamily: "var(--font-mono), monospace" }}>{axe}</span>
      <b className="text-[19px] leading-tight">{valeur}</b>
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
