"use client";
export function BoutonImprimer() {
  return <button type="button" onClick={() => window.print()} className="bouton bouton-secondaire">Imprimer / enregistrer en PDF</button>;
}
