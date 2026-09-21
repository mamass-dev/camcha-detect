/**
 * Constitue le jeu de données de la démo CAMCHA (zone Nuits / Beaune / Chalon, 10-49 salariés)
 * à partir des sources gratuites uniquement. Sortie : src/data/demo.json.
 * Idempotent : chaque appel HTTP est mis en cache dans scripts/.cache/demo-http.json.
 *
 *   node --env-file=.env.local scripts/build-demo.mjs [--rayon 15] [--max 400] [--sans-sites]
 */
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const RAYON = Number(opt("rayon", 15));
const MAX = Number(opt("max", 400));
const SANS_SITES = args.includes("--sans-sites");

const CENTRES = {
  "Nuits-Saint-Georges": { lat: 47.1373, lon: 4.9497 },
  Beaune: { lat: 47.024, lon: 4.84 },
  "Chalon-sur-Saône": { lat: 46.7806, lon: 4.8536 },
  Dijon: { lat: 47.322, lon: 5.0415 },
};
const ZONE = ["Nuits-Saint-Georges", "Beaune", "Chalon-sur-Saône"];

// --- cache HTTP -------------------------------------------------------------
const CACHE_PATH = path.join("scripts", ".cache", "demo-http.json");
const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) : {};
let appels = {};
function noteAppel(f, hit) { appels[f] ??= { reels: 0, cache: 0 }; appels[f][hit ? "cache" : "reels"]++; }
function sauverCache() { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache)); }
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(fournisseur, url, init = {}, { timeout = 20000, pause = 0 } = {}) {
  const cle = `${fournisseur}|${url}`;
  if (cache[cle]) { noteAppel(fournisseur, true); return cache[cle].corps; }
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url} — ${(await res.text()).slice(0, 200)}`);
  const brut = await res.text();
  const corps = brut ? JSON.parse(brut) : null;
  cache[cle] = { statut: res.status, corps };
  noteAppel(fournisseur, false);
  if (pause) await dodo(pause);
  return corps;
}
async function getText(fournisseur, url, { timeout = 8000, max = 400000 } = {}) {
  const cle = `${fournisseur}|text|${url}`;
  if (cache[cle]) { noteAppel(fournisseur, true); return cache[cle]; }
  let out = { statut: 0, texte: null, finale: url };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeout), redirect: "follow",
      headers: { "User-Agent": "CamchaDetectBot/0.2 (prototype de ciblage B2B ; contact : https://globecreateur.fr)" },
    });
    out.statut = res.status; out.finale = res.url || url;
    if (res.ok) out.texte = (await res.text()).slice(0, max);
  } catch { /* réseau / timeout */ }
  cache[cle] = out; noteAppel(fournisseur, false);
  return out;
}

// --- utilitaires ------------------------------------------------------------
function distKm(a, b) {
  const p = Math.PI / 180, R = 6371;
  const x = Math.sin(((b.lat - a.lat) * p) / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(((b.lon - a.lon) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function normaliserNom(nom) {
  return (nom ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(sarl|sas|sasu|eurl|sa|sci|scop|scm|selarl|snc|societe|ste|ets|etablissements?|groupe|cie|compagnie)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
/** Rapprochement de noms : égalité, ou inclusion si le plus court fait ≥ 8 caractères et ≥ 60 % du plus long. */
function nomsCorrespondent(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [c, l] = a.length <= b.length ? [a, b] : [b, a];
  return c.length >= 8 && c.length / l.length >= 0.6 && l.includes(c);
}
function texteDePage(html) {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,iframe").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}
const norm = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function titreCase(s) { return (s ?? "").toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }

// --- 1. zone ----------------------------------------------------------------
console.log(`\n1 · Zone : rayon ${RAYON} km autour de ${ZONE.join(", ")}`);
const communes = new Map(); // code INSEE → { nom, cp[], centre }
for (const dep of ["21", "71"]) {
  const liste = await getJson("geo", `https://geo.api.gouv.fr/departements/${dep}/communes?fields=nom,code,codesPostaux,centre,population&format=json`);
  for (const c of liste) {
    if (!c.centre) continue;
    const pt = { lat: c.centre.coordinates[1], lon: c.centre.coordinates[0] };
    const d = Math.min(...ZONE.map((z) => distKm(pt, CENTRES[z])));
    if (d <= RAYON) communes.set(c.code, { nom: c.nom, cps: c.codesPostaux, pt, dep });
  }
}
const cps = [...new Set([...communes.values()].flatMap((c) => c.cps))].sort();
console.log(`   ${communes.size} communes, ${cps.length} codes postaux`);

// --- 2. entreprises ---------------------------------------------------------
console.log(`\n2 · Entreprises (Annuaire des entreprises, tranches 11-19 et 20-49, sociétés commerciales, siège dans la zone)`);
const brutes = new Map();
const exclusions = { hors_zone: 0, nature_juridique: 0, non_diffusible: 0, inactive: 0 };
for (let i = 0; i < cps.length; i += 8) {
  const lot = cps.slice(i, i + 8).join(",");
  let page = 1, pages = 1;
  do {
    const url = `https://recherche-entreprises.api.gouv.fr/search?code_postal=${lot}&tranche_effectif_salarie=11,12&etat_administratif=A&per_page=25&page=${page}`;
    const d = await getJson("recherche_entreprises", url, {}, { pause: 180 });
    pages = d.total_pages ?? 1;
    for (const r of d.results ?? []) {
      if (!r.siren || brutes.has(r.siren)) continue;
      if (r.statut_diffusion && r.statut_diffusion !== "O") { exclusions.non_diffusible++; continue; }
      if (r.etat_administratif !== "A") { exclusions.inactive++; continue; }
      if (!r.nature_juridique?.startsWith("5")) { exclusions.nature_juridique++; continue; }
      if (!communes.has(r.siege?.commune)) { exclusions.hors_zone++; continue; }
      brutes.set(r.siren, r);
    }
    page++;
  } while (page <= pages && page <= 40);
}
sauverCache();
console.log(`   ${brutes.size} entreprises retenues — exclusions ${JSON.stringify(exclusions)}`);

const QUALITES_DECIDEUR = /pr[ée]sident|g[ée]rant|directeur g[ée]n[ée]ral|directrice g[ée]n[ée]rale|dirigeant/i;
const entreprises = [...brutes.values()].sort((a, b) => a.siren.localeCompare(b.siren)).slice(0, MAX).map((r) => {
  const c = communes.get(r.siege.commune);
  const coords = (r.siege.coordonnees ?? "").split(",").map(Number);
  const pt = coords.length === 2 && !Number.isNaN(coords[0]) ? { lat: coords[0], lon: coords[1] } : c.pt;
  const distances = Object.fromEntries(Object.entries(CENTRES).map(([n, p]) => [n, Math.round(distKm(pt, p))]));
  const decideurs = (r.dirigeants ?? [])
    .filter((d) => d.type_dirigeant === "personne physique" && d.qualite && QUALITES_DECIDEUR.test(d.qualite))
    .map((d) => ({ nom: `${titreCase(d.prenoms?.split(" ")[0])} ${(d.nom ?? "").toUpperCase()}`.trim(), fonction: d.qualite }));
  const morales = (r.dirigeants ?? []).filter((d) => d.type_dirigeant === "personne morale").map((d) => ({ nom: d.denomination, fonction: d.qualite, siren: d.siren }));
  const dernieresFinances = r.finances ? Object.entries(r.finances).sort((a, b) => b[0].localeCompare(a[0]))[0] : null;
  return {
    siren: r.siren,
    raison_sociale: r.nom_raison_sociale || r.nom_complet,
    nom_commercial: r.sigle || (r.nom_complet && r.nom_complet !== r.nom_raison_sociale ? r.nom_complet : null),
    enseigne: (r.siege?.liste_enseignes ?? [])[0] ?? null,
    commune: c.nom,
    code_postal: r.siege.code_postal,
    departement: c.dep,
    adresse: titreCase(r.siege.adresse ?? ""),
    lat: pt.lat, lon: pt.lon, distances,
    effectif_tranche: r.tranche_effectif_salarie, effectif_annee: r.annee_tranche_effectif_salarie,
    effectif_libelle: r.tranche_effectif_salarie === "12" ? "20 à 49" : "10 à 19",
    ape: r.activite_principale, secteur: r.section_activite_principale ?? null,
    nature_juridique: r.nature_juridique, date_creation: r.date_creation,
    est_ess: !!r.complements?.est_ess, est_mission: !!r.complements?.est_societe_a_mission,
    idcc: r.complements?.liste_idcc ?? [],
    nb_etablissements: r.nombre_etablissements_ouverts ?? null,
    decideurs, morales,
    finances: dernieresFinances ? { annee: dernieresFinances[0], ca: dernieresFinances[1].ca ?? null, resultat_net: dernieresFinances[1].resultat_net ?? null } : null,
    signaux: [], site: null, telephone: null, actualites: [],
    source_fiche: `https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}`,
  };
});

// --- 3. BODACC --------------------------------------------------------------
console.log(`\n3 · BODACC (18 mois) : modifications, dépôts de comptes, procédures collectives`);
const BODACC = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";
const depuis18 = new Date(Date.now() - 548 * 86400000).toISOString().slice(0, 10);
for (const e of entreprises) {
  const where = encodeURIComponent(`registre like "%${e.siren}%" and dateparution >= date'${depuis18}'`);
  const d = await getJson("bodacc", `${BODACC}?where=${where}&limit=50&order_by=dateparution desc`, {}, { pause: 120 });
  e.bodacc = { dpc: null, procol: null, vente: null };
  for (const r of d.results ?? []) {
    const fam = (r.familleavis ?? "").toLowerCase();
    const src = r.url_complete ?? `https://www.bodacc.fr/pages/annonces-commerciales/?sort=dateparution&q=${e.siren}`;
    if (fam === "dpc") { e.bodacc.dpc ??= { date: r.dateparution, src }; continue; }
    if (fam === "collective" || fam === "retablissement_professionnel" || (r.jugement && r.jugement !== "null")) { e.bodacc.procol ??= { date: r.dateparution, src }; continue; }
    if (fam === "vente") { e.bodacc.vente ??= { date: r.dateparution, src }; continue; }
    if (fam !== "modification") continue;
    let descriptif = "";
    try { descriptif = JSON.parse(r.modificationsgenerales ?? "{}").descriptif ?? ""; } catch { descriptif = r.modificationsgenerales ?? ""; }
    const dl = descriptif.toLowerCase();
    const pose = (cle, valeur, confiance, verbatim) => {
      if (e.signaux.some((s) => s.cle === cle)) return;
      e.signaux.push({ cle, valeur, confiance, verbatim, source: "BODACC", source_url: src, date: r.dateparution, methode: "structure" });
    };
    if (dl.includes("administration")) pose("changement_dirigeant", "oui", 0.9, descriptif);
    if (dl.includes("capital")) {
      let montant = "";
      try { const p = JSON.parse(r.listepersonnes ?? "{}").personne; if (p?.capital?.montantCapital) montant = ` Nouveau capital : ${p.capital.montantCapital} ${p.capital.devise ?? "EUR"}.`; } catch {}
      pose("augmentation_capital", "probable", 0.6, descriptif + montant);
    }
    if (/transfert du si[èe]ge/.test(dl)) pose("transfert_siege", "oui", 0.9, descriptif);
    if (/[ée]tablissement/.test(dl) && /(ouverture|cr[ée]ation|adjonction)/.test(dl)) pose("ouverture_etablissement", "oui", 0.85, descriptif);
    if (/(activit[ée]|objet social)/.test(dl) && /(adjonction|extension|modification de l'objet|nouvelle)/.test(dl)) pose("nouvelle_activite", "probable", 0.6, descriptif);
  }
}
sauverCache();
console.log(`   procédures collectives : ${entreprises.filter((e) => e.bodacc.procol).length}, comptes déposés : ${entreprises.filter((e) => e.bodacc.dpc).length}`);

// --- 4. France Travail ------------------------------------------------------
console.log(`\n4 · France Travail : offres publiées sur 90 jours`);
let ftOk = Boolean(process.env.FRANCE_TRAVAIL_CLIENT_ID && process.env.FRANCE_TRAVAIL_CLIENT_SECRET);
let token = null;
if (ftOk) {
  const res = await fetch("https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.FRANCE_TRAVAIL_CLIENT_ID, client_secret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET, scope: "api_offresdemploiv2 o2dsoffre" }),
  });
  if (res.ok) token = (await res.json()).access_token; else { ftOk = false; console.log(`   ⚠ OAuth France Travail HTTP ${res.status}`); }
}
if (ftOk) {
  const fin = new Date(new Date().toISOString().slice(0, 10) + "T23:59:59Z");
  const debut = new Date(fin.getTime() - 90 * 86400000);
  const iso = (d) => d.toISOString().slice(0, 19) + "Z";
  const H = { headers: { Authorization: `Bearer ${token}` } };
  // Toutes les offres de la zone (par codes INSEE), puis rattachement local par nom d'employeur :
  // « motsCles » cherche dans le texte des offres, pas dans le nom de l'employeur.
  const offresZone = new Map();
  const essais = {};
  async function collecter(codes, d0, d1) {
    const base = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?commune=${codes.join(",")}&minCreationDate=${encodeURIComponent(iso(d0))}&maxCreationDate=${encodeURIComponent(iso(d1))}`;
    let debutRange = 0, total = null;
    while (true) {
      const url = `${base}&range=${debutRange}-${debutRange + 149}`;
      const cle = `france_travail|${url}`;
      let corps, contentRange;
      if (cache[cle]) { ({ corps, contentRange } = cache[cle]); noteAppel("france_travail", true); }
      else {
        const r = await fetch(url, { ...H, signal: AbortSignal.timeout(20000) });
        if (r.status === 429 || r.status >= 500) { // transitoire côté France Travail : on réessaie, puis on abandonne le lot
          essais[url] = (essais[url] ?? 0) + 1;
          if (essais[url] <= 4) { await dodo(2000 * essais[url]); continue; }
          console.log(`   ⚠ lot abandonné après 4 essais (HTTP ${r.status}) : communes ${codes.join(",")}`); return;
        }
        if (![200, 206, 204].includes(r.status)) throw new Error(`FT HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
        contentRange = r.headers.get("content-range");
        corps = r.status === 204 ? null : await r.json();
        cache[cle] = { corps, contentRange }; noteAppel("france_travail", false);
        await dodo(250);
      }
      total ??= Number((contentRange ?? "").split("/")[1] ?? 0);
      if (total > 3150 && codes.length > 1) { // trop de résultats : on scinde le lot
        const m = Math.ceil(codes.length / 2);
        await collecter(codes.slice(0, m), d0, d1); await collecter(codes.slice(m), d0, d1); return;
      }
      if (total > 3150) { // une seule commune : on scinde la fenêtre temporelle
        const mid = new Date((d0.getTime() + d1.getTime()) / 2);
        await collecter(codes, d0, mid); await collecter(codes, new Date(mid.getTime() + 1000), d1); return;
      }
      for (const o of corps?.resultats ?? []) offresZone.set(o.id, o);
      debutRange += 150;
      if (debutRange >= total || debutRange >= 3150) break;
    }
  }
  const codesZone = [...communes.keys()];
  for (let i = 0; i < codesZone.length; i += 5) await collecter(codesZone.slice(i, i + 5), debut, fin);
  sauverCache();
  console.log(`   ${offresZone.size} offres publiées dans la zone sur 90 jours`);

  const index = new Map(); // nom normalisé → entreprise
  for (const e of entreprises) for (const n of [e.raison_sociale, e.nom_commercial, e.enseigne]) { const k = normaliserNom(n); if (k.length >= 4) index.set(k, e); }
  const cles = [...index.keys()].filter((k) => k.length >= 6);
  const parEntreprise = new Map();
  for (const o of offresZone.values()) {
    const n = normaliserNom(o.entreprise?.nom ?? "");
    if (!n) continue;
    let e = index.get(n);
    if (!e) { const k = cles.find((k) => nomsCorrespondent(n, k)); if (k) e = index.get(k); }
    if (!e) continue;
    if (!parEntreprise.has(e.siren)) parEntreprise.set(e.siren, []);
    parEntreprise.get(e.siren).push(o);
  }
  for (const [siren, offres] of parEntreprise) {
    const e = entreprises.find((x) => x.siren === siren);
    const plusAncienne = offres.map((o) => o.dateCreation).filter(Boolean).sort()[0];
    const ageJours = plusAncienne ? Math.round((Date.now() - new Date(plusAncienne).getTime()) / 86400000) : null;
    const types = [...new Set(offres.map((o) => o.typeContrat).filter(Boolean))];
    const alternance = offres.some((o) => /alternance|apprentissage/i.test(`${o.intitule} ${o.natureContrat ?? ""} ${o.typeContratLibelle ?? ""}`));
    e.offres = offres.map((o) => ({ id: o.id, intitule: o.intitule, type: o.typeContrat, date: o.dateCreation?.slice(0, 10), lieu: o.lieuTravail?.libelle, url: o.origineOffre?.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}` }));
    const srcListe = `https://candidat.francetravail.fr/offres/recherche?motsCles=${encodeURIComponent(e.raison_sociale)}&lieux=${e.departement}D`;
    const dateMax = offres.map((o) => o.dateCreation).sort().at(-1)?.slice(0, 10);
    const exact = index.get(normaliserNom(offres[0].entreprise?.nom)) === e;
    e.signaux.push({ cle: "offres_actives", valeur: "oui", confiance: exact ? 0.85 : 0.65, verbatim: `${offres.length} offre(s) sur 90 j (${types.join(", ")}) : ${offres.slice(0, 4).map((o) => o.intitule).join(" · ")}`, source: "France Travail", source_url: srcListe, date: dateMax, methode: "structure", nb: offres.length });
    if (offres.length >= 3) e.signaux.push({ cle: "recrutement_multiple", valeur: "oui", confiance: exact ? 0.85 : 0.65, verbatim: `${offres.length} postes ouverts simultanément`, source: "France Travail", source_url: srcListe, date: dateMax, methode: "structure" });
    if (alternance) e.signaux.push({ cle: "alternance", valeur: "oui", confiance: 0.8, verbatim: "au moins une offre en alternance ou apprentissage", source: "France Travail", source_url: srcListe, date: dateMax, methode: "structure" });
    if (ageJours != null && ageJours >= 60) e.signaux.push({ cle: "tension_recrutement", valeur: "probable", confiance: 0.5, verbatim: `offre ouverte depuis ${ageJours} jours (proxy de tension)`, source: "France Travail", source_url: srcListe, date: plusAncienne.slice(0, 10), methode: "structure" });
  }
  console.log(`   ${parEntreprise.size} entreprises de l'échantillon avec au moins une offre`);
} else console.log("   ⚠ France Travail désactivé (clés absentes)");

// --- 5. BOAMP attributions --------------------------------------------------
console.log(`\n5 · BOAMP : attributions de marchés publics (18 mois, départements 21 et 71)`);
const BOAMP = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";
const parNom = new Map(entreprises.map((e) => [normaliserNom(e.raison_sociale), e]));
let attributions = 0;
for (const dep of ["21", "71"]) {
  for (let offset = 0; offset < 3000; offset += 100) {
    const where = encodeURIComponent(`code_departement="${dep}" and nature="ATTRIBUTION" and dateparution >= date'${depuis18}'`);
    const d = await getJson("boamp", `${BOAMP}?where=${where}&limit=100&offset=${offset}&order_by=dateparution desc`, {}, { pause: 150 });
    for (const r of d.results ?? []) {
      for (const t of r.titulaire ?? []) {
        const n = normaliserNom(t);
        const e = parNom.get(n) ?? [...parNom.entries()].find(([k]) => nomsCorrespondent(n, k))?.[1];
        if (!e || e.signaux.some((s) => s.cle === "marche_public")) continue;
        attributions++;
        e.signaux.push({ cle: "marche_public", valeur: "oui", confiance: 0.85, verbatim: `Attributaire du marché « ${(r.objet ?? "").slice(0, 120)} » — acheteur : ${r.nomacheteur}`, source: "BOAMP", source_url: r.url_avis, date: r.dateparution, methode: "structure" });
      }
    }
    if ((d.results ?? []).length < 100) break;
  }
}
sauverCache();
console.log(`   ${attributions} attribution(s) rattachée(s)`);

// --- 6. sites web (heuristique gratuite, preuve exigée) --------------------
if (!SANS_SITES) {
  console.log(`\n6 · Sites web : slug du nom + preuve (SIREN, code postal + commune, ou nom dans le titre)`);
  const LEX = [
    { cle: "demarche_rse", re: /\b(rse|responsabilit[ée] soci[ée]tale|d[ée]veloppement durable|bilan carbone|ecovadis|b ?corp|iso ?14001)\b/i, libelle: "RSE" },
    { cle: "bien_etre_affiche", re: /\b(bien[- ]?[êe]tre au travail|qualit[ée] de vie au travail|qvt|qvct|marque employeur|fid[ée]lis(er|ation) (de )?(nos |les )?(collaborateurs|salari[ée]s|[ée]quipes))\b/i, libelle: "bien-être / marque employeur" },
    { cle: "engagement_emploi", re: /\b(alternance|apprentissage|apprentis?|insertion|handicap|rqth|entreprise adapt[ée]e|jeunes dipl[ôo]m[ée]s|seniors?)\b/i, libelle: "engagement emploi / insertion" },
    { cle: "page_carrieres", re: /\b(rejoignez[- ]nous|nous recrutons|on recrute|offres? d'emploi|carri[èe]res?|recrutement|candidature spontan[ée]e)\b/i, libelle: "page recrutement" },
    { cle: "reseau_entreprendre", re: /r[ée]seau entreprendre/i, libelle: "Réseau Entreprendre" },
    { cle: "sponsoring_sport", re: /\b(sponsor|m[ée]c[ée]nat|partenaire officiel|soutien (à|de) (l')?athl[èe]te|sportifs? de haut niveau)\b/i, libelle: "sponsoring / mécénat" },
  ];
  const slugsDe = (raison) => {
    const base = norm(raison).replace(/\b(sarl|sas|sasu|eurl|sa|sci|scop|selarl|snc|societe|ste|ets|etablissements?)\b/g, "").trim();
    const colle = base.replace(/[^a-z0-9]+/g, ""), tirets = base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return [...new Set([colle, tirets].filter((s) => s.length >= 4))];
  };
  let resolus = 0;
  const file = [...entreprises];
  const worker = async () => {
    while (file.length) {
      const e = file.shift();
      const nomNorm = normaliserNom(e.raison_sociale);
      candidats: for (const slug of slugsDe(e.raison_sociale)) {
        for (const tld of [".fr", ".com"]) {
          const url = `https://www.${slug}${tld}`;
          const { statut, texte, finale } = await getText("crawl", url);
          if (statut !== 200 || !texte || finale.includes("sedo") || finale.includes("parking")) continue;
          const $ = cheerio.load(texte);
          const titre = norm($("title").first().text());
          const corps = norm(texteDePage(texte));
          const sirenEsp = `${e.siren.slice(0, 3)} ${e.siren.slice(3, 6)} ${e.siren.slice(6)}`;
          let preuve = null;
          if (corps.includes(e.siren) || corps.includes(sirenEsp)) preuve = "SIREN dans la page";
          else if (corps.includes(e.code_postal) && corps.includes(norm(e.commune))) preuve = "adresse dans la page";
          else if (nomNorm.length >= 6 && titre.includes(nomNorm) && (corps.includes(norm(e.commune)) || /bourgogne|saone|cote d'or|cote-d'or/.test(corps))) preuve = "nom dans le titre + ancrage local";
          else {
            for (const chemin of ["/mentions-legales", "/mentions-legales/", "/mentions_legales", "/mentions", "/legal"]) {
              const m = await getText("crawl", `${url}${chemin}`);
              if (m.statut === 200 && m.texte) { const t = norm(texteDePage(m.texte)); if (t.includes(e.siren) || t.includes(sirenEsp)) { preuve = "SIREN dans les mentions légales"; break; } }
            }
          }
          if (!preuve) continue;
          e.site = { url: finale.replace(/\/$/, ""), preuve, date: new Date().toISOString().slice(0, 10) };
          resolus++;
          const tels = [...corps.matchAll(/(?:\+33\s?\(?0?\)?\s?|0)([1-9])(?:[\s.-]?\d{2}){4}/g)]
            .map((m) => ({ brut: m[0], num: "0" + m[0].replace(/\D/g, "").replace(/^(33|0)/, "").slice(0, 9) }))
            .filter((t) => t.num.length === 10 && !/^(\d)\1{5}/.test(t.num) && t.num !== "0000000000" && (/[\s.-]/.test(t.brut) || /^0[3467]/.test(t.num)))
            .sort((a, b) => (/^03/.test(b.num) ? 1 : 0) - (/^03/.test(a.num) ? 1 : 0));
          if (tels[0]) e.telephone = tels[0].num.replace(/(\d{2})(?=\d)/g, "$1 ");
          // Pages internes utiles : recrutement, à propos, RSE, engagements (3 max), même origine uniquement.
          const pages = [{ url: e.site.url, corps }];
          const origine = new URL(e.site.url).origin;
          const liens = [...new Set($("a[href]").map((_, a) => $(a).attr("href")).get()
            .map((h) => { try { return new URL(h, e.site.url).href.split("#")[0]; } catch { return null; } })
            .filter((h) => h && h.startsWith(origine) && /recrut|carri|emploi|rejoign|job|talent|propos|about|qui-sommes|rse|engag|valeur|equipe/i.test(h)))].slice(0, 3);
          for (const lien of liens) {
            const pg = await getText("crawl", lien);
            if (pg.statut === 200 && pg.texte) pages.push({ url: lien, corps: norm(texteDePage(pg.texte)) });
          }
          e.site.pages = pages.length;
          for (const l of LEX) {
            for (const pg of pages) {
              const m = pg.corps.match(l.re);
              if (!m) continue;
              const i = Math.max(0, m.index - 70);
              e.signaux.push({ cle: l.cle, valeur: "probable", confiance: 0.55, verbatim: `« … ${pg.corps.slice(i, m.index + m[0].length + 70).trim()} … »`, source: "Site web (détection lexicale)", source_url: pg.url, date: e.site.date, methode: "infere" });
              break;
            }
          }
          break candidats;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  sauverCache();
  console.log(`   ${resolus} site(s) résolu(s) sur ${entreprises.length} (${Math.round((100 * resolus) / entreprises.length)} %)`);
}

// --- 7. signaux structurels, santé financière -------------------------------
console.log(`\n7 · Signaux statiques et santé financière`);
for (const e of entreprises) {
  const push = (cle, valeur, confiance, verbatim, source, source_url, date) => e.signaux.push({ cle, valeur, confiance, verbatim, source, source_url, date, methode: "structure" });
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (e.est_mission || e.est_ess) push("ess_ou_mission", "oui", 1, e.est_mission ? "société à mission" : "économie sociale et solidaire", "Annuaire des entreprises", e.source_fiche, aujourdhui);
  if (e.idcc.length) push("idcc_renseigne", "oui", 1, `convention collective ${e.idcc.join(", ")}`, "Annuaire des entreprises", e.source_fiche, aujourdhui);
  const age = e.date_creation ? (Date.now() - new Date(e.date_creation).getTime()) / 31557600000 : null;
  if (age != null && age >= 3) push("anciennete_3ans", "oui", 1, `créée le ${e.date_creation}`, "Annuaire des entreprises", e.source_fiche, aujourdhui);
  if (e.effectif_tranche === "12") push("effectif_20_49", "oui", 1, "tranche 20 à 49 salariés", "Annuaire des entreprises", e.source_fiche, aujourdhui);
  if ((e.nb_etablissements ?? 0) >= 2) push("multi_etablissements", "oui", 1, `${e.nb_etablissements} établissements ouverts`, "Annuaire des entreprises", e.source_fiche, aujourdhui);

  // Feu tricolore : rouge = procédure collective ; orange = pas de dépôt de comptes sur 18 mois ou résultat net négatif ; vert sinon.
  if (e.bodacc.procol) e.sante = { niveau: "rouge", motif: `Procédure collective publiée au BODACC le ${e.bodacc.procol.date}`, source_url: e.bodacc.procol.src, date: e.bodacc.procol.date };
  else if (e.finances && e.finances.resultat_net != null && e.finances.resultat_net < 0) e.sante = { niveau: "orange", motif: `Résultat net négatif sur l'exercice ${e.finances.annee} (${Math.round(e.finances.resultat_net / 1000)} k€)`, source_url: e.source_fiche, date: aujourdhui };
  else if (!e.bodacc.dpc) e.sante = { niveau: "orange", motif: "Aucun dépôt de comptes publié au BODACC sur 18 mois", source_url: `https://www.bodacc.fr/pages/annonces-commerciales/?sort=dateparution&q=${e.siren}`, date: aujourdhui };
  else e.sante = { niveau: "vert", motif: `Comptes déposés (BODACC du ${e.bodacc.dpc.date})${e.finances?.ca ? `, CA ${e.finances.annee} : ${Math.round(e.finances.ca / 1000)} k€` : ""}`, source_url: e.bodacc.dpc.src, date: e.bodacc.dpc.date };
  e.disqualifie = e.bodacc.procol ? `Procédure collective (BODACC ${e.bodacc.procol.date})` : null;
  delete e.bodacc;
}

// --- 8. écriture ------------------------------------------------------------
const sortie = {
  genere_le: new Date().toISOString(),
  zone: { villes: ZONE, rayon_km: RAYON, communes: communes.size, codes_postaux: cps.length },
  exclusions,
  appels,
  entreprises,
};
fs.writeFileSync(path.join("src", "data", "demo.json"), JSON.stringify(sortie, null, 1));
const stats = {};
for (const e of entreprises) for (const s of e.signaux) stats[s.cle] = (stats[s.cle] ?? 0) + 1;
console.log(`\n✓ src/data/demo.json — ${entreprises.length} entreprises`);
console.log("   signaux :", JSON.stringify(stats));
console.log("   santé :", JSON.stringify(entreprises.reduce((a, e) => ((a[e.sante.niveau] = (a[e.sante.niveau] ?? 0) + 1), a), {})));
console.log("   appels :", JSON.stringify(appels));
