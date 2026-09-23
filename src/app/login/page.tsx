"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  async function connexion(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motDePasse }),
    });
    if (r.ok) router.push("/demo");
    else setErreur("Mot de passe incorrect.");
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
        <button type="submit" className="bouton">Entrer</button>
      </form>
    </div>
  );
}
