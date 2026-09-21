"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export type Point = { siren: string; nom: string; commune: string; lat: number; lon: number; moment: number; fit: number; sante: "vert" | "orange" | "rouge"; accroche: string; effectif: string };

const CENTRES: Array<[string, number, number]> = [["Nuits-Saint-Georges", 47.1373, 4.9497], ["Beaune", 47.024, 4.84], ["Chalon-sur-Saône", 46.7806, 4.8536]];

export function Carte({ points, rayon }: { points: Point[]; rayon: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    let annule = false;
    import("leaflet").then((L) => {
      if (annule || !ref.current) return;
      const map = L.map(ref.current, { scrollWheelZoom: true }).setView([46.95, 4.87], 10);
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 18, className: "tuiles-douces" }).addTo(map);
      for (const [nom, lat, lon] of CENTRES) {
        L.circle([lat, lon], { radius: rayon * 1000, color: "#146c60", weight: 1, fillOpacity: 0.04, dashArray: "4 4" }).addTo(map);
        L.marker([lat, lon], { icon: L.divIcon({ className: "", html: `<div style="font:600 11px/1 IBM Plex Mono, monospace;color:#146c60;background:#fff;border:1px solid #146c60;border-radius:4px;padding:3px 6px;white-space:nowrap;transform:translate(-50%,-50%)">${nom}</div>` }) }).addTo(map);
      }
      const tries = [...points].sort((a, b) => a.moment - b.moment);
      for (const p of tries) {
        const chaud = p.moment > 0;
        const couleur = p.sante === "rouge" ? "#b3372f" : chaud ? "#c05a17" : "#9aa7b3";
        const r = chaud ? 5 + Math.min(6, p.moment / 8) : 3.5;
        L.circleMarker([p.lat, p.lon], { radius: r, color: couleur, weight: 1, fillColor: couleur, fillOpacity: chaud ? 0.8 : 0.45 })
          .bindPopup(`<div style="font:13px/1.4 IBM Plex Sans, sans-serif;min-width:200px"><b>${p.nom}</b><br><span style="color:#5b6875">${p.commune} · ${p.effectif} salariés</span><br><span style="color:#c05a17;font-weight:600">MOMENT ${p.moment}</span> · <span style="color:#146c60;font-weight:600">FIT ${p.fit}</span><br><span style="display:block;margin-top:4px">${p.accroche}</span><a href="/demo/comptes/${p.siren}" style="display:inline-block;margin-top:6px;color:#146c60">Fiche complète →</a></div>`)
          .addTo(map);
      }
    });
    return () => { annule = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [points, rayon]);

  return <div ref={ref} className="carte w-full" style={{ height: "min(72vh, 720px)" }} />;
}
