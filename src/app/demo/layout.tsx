import Link from "next/link";
import { DONNEES } from "@/lib/demo";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const onglets = [
    { href: "/demo", l: "Digest du matin" },
    { href: "/demo/comptes", l: "Tous les comptes" },
    { href: "/demo/methode", l: "Méthode, sources et coûts" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] border-b pb-3" style={{ borderColor: "var(--line)" }}>
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ fontFamily: "var(--font-mono), monospace", color: "var(--moment)" }}>Démo</span>
        {onglets.map((o) => (
          <Link key={o.href} href={o.href} className="font-medium hover:opacity-70">{o.l}</Link>
        ))}
        <span className="ml-auto text-[12px]" style={{ color: "var(--muted)" }}>
          Zone {DONNEES.zone.villes.join(" · ")} · rayon {DONNEES.zone.rayon_km} km · données réelles du {new Date(DONNEES.genere_le).toLocaleDateString("fr-FR")}
        </span>
      </div>
      {children}
    </div>
  );
}
