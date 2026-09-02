// Pilote une étape du pipeline en local : node --env-file=.env.local scripts/run-etape.mjs <etape> [limite]
const [etape, limiteArg] = process.argv.slice(2);
const base = process.env.CAMCHA_URL ?? "http://localhost:3777";
const limite = Number(limiteArg) || 10;

if (!etape) {
  console.error("usage : node --env-file=.env.local scripts/run-etape.mjs <collect|signals|resolve|infer|score> [limite]");
  process.exit(1);
}

const login = await fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ motDePasse: process.env.APP_PASSWORD }),
});
if (!login.ok) { console.error("login refusé"); process.exit(1); }
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

if (etape === "score") {
  const r = await fetch(`${base}/api/score`, { headers: { cookie } });
  console.log(JSON.stringify(await r.json(), null, 2));
  process.exit(0);
}

if (etape === "collect") {
  const r = await fetch(`${base}/api/pipeline/collect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ taille: limite }),
  });
  console.log(JSON.stringify(await r.json(), null, 2));
  process.exit(0);
}

// étapes en boucle jusqu'à épuisement
for (let i = 0; i < 100; i++) {
  const r = await fetch(`${base}/api/pipeline/${etape}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ limite }),
  });
  const d = await r.json();
  console.log(JSON.stringify(d, null, 2));
  if (d.erreur || d.restantes <= 0 || d.traitees === 0) break;
}
