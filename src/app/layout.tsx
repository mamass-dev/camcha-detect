import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Moteur de détection CAMCHA",
  description: "Détection de comptes prioritaires — PME de 10 à 49 salariés, Bourgogne",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body
        className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} antialiased min-h-screen`}
        style={{ fontFamily: "var(--font-sans), sans-serif" }}
      >
        <nav className="border-b" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center gap-8">
            <Link href="/" className="font-bold text-[15px]" style={{ fontFamily: "var(--font-display), sans-serif" }}>
              CAMCHA<span style={{ color: "var(--muted)" }}> · détection</span>
            </Link>
            <div className="flex gap-5 text-[13.5px] font-medium" style={{ color: "var(--muted)" }}>
              <Link href="/" className="hover:opacity-70">Pipeline</Link>
              <Link href="/comptes" className="hover:opacity-70">Comptes</Link>
              <Link href="/reglages" className="hover:opacity-70">Réglages</Link>
              <Link href="/demo" className="hover:opacity-70 font-semibold" style={{ color: "var(--moment)" }}>Démo Nuits · Beaune · Chalon</Link>
            </div>
            <span
              className="ml-auto text-[11px] uppercase tracking-widest"
              style={{ fontFamily: "var(--font-mono), monospace", color: "var(--muted)" }}
            >
              Prototype · Bourgogne
            </span>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
