"use client";

import { useState } from "react";

export default function Login() {
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function connexion(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motDePasse: motDePasse.trim() }),
        cache: "no-store",
      });
      if (r.ok) {
        // Navigation complète (pas côté client) : le cookie de session est relu par le proxy.
        window.location.assign("/demo");
        return;
      }
      setErreur(r.status === 401 ? "Mot de passe incorrect." : `Erreur ${r.status}, réessayez.`);
    } catch {
      setErreur("Connexion impossible, vérifiez le réseau.");
    }
    setEnCours(false);
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={connexion} className="carte p-8 flex flex-col gap-4 w-full max-w-sm">
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display), sans-serif" }}>
          CAMCHA · détection
        </h1>
        <p className="text-[13px]" style={{ color: "var(--muted)" }}>Accès protégé — prototype interne.</p>
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Mot de passe"
          className="carte px-3 py-2 text-sm"
          autoFocus
        />
        {erreur && <p className="text-[13px]" style={{ color: "var(--err)" }}>{erreur}</p>}
        <button type="submit" className="bouton" disabled={enCours}>{enCours ? "Connexion…" : "Entrer"}</button>
      </form>
    </div>
  );
}
