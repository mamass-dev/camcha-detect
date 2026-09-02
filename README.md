# CAMCHA · Moteur de détection

Prototype web de détection de comptes prioritaires pour CAMCHA (CSE externalisé, Dijon).
Périmètre : entreprises de Côte-d'Or, 11 à 49 salariés, sièges dans le 21, sociétés commerciales.

Deux axes, **jamais fusionnés** :
- **FIT** (statique) : le profil correspond-il à la cible ?
- **MOMENT** (dynamique) : y a-t-il une raison d'appeler cette semaine ?

## Stack

Next.js 16 (App Router) · Supabase (Postgres) · SDK Anthropic · Vercel.

## Pipeline (5 étapes idempotentes)

1. **collect** — API Recherche d'entreprises (DINUM). Échantillon figé au premier run.
2. **signals** — BODACC (18 mois, descriptifs structurés ; procédure collective ⇒ disqualification) + France Travail (offres 90 j, rattachement par nom — l'API ne filtre pas par SIREN).
3. **resolve** — Google Places (si clé) puis devinette de domaine ; un domaine n'est retenu qu'avec **preuve** (SIREN ou adresse sur la home ou les mentions légales).
4. **infer** — sitemap filtré, plafonds durs (8 pages, 200 Ko, 1 req/s, robots.txt), 1 appel Claude/entreprise, JSON strict validé (zod). **Garde-fou côté code** : verbatim introuvable dans le texte collecté ⇒ `inconnu` + compteur d'hallucinations. Aucune donnée de personne physique.
5. **score** — jamais stocké, recalculé depuis les signaux. `inconnu` exclu du dénominateur. Poids modifiables dans l'UI (page Réglages).

Tout appel réseau est mis en cache en base (`http_cache`) avec sa date : relancer une étape ne re-paye rien. Chaque appel réel est journalisé (`appel_api`) avec son coût.

## Lancer en local

```bash
npm install
npm run dev
# puis http://localhost:3000 — mot de passe : APP_PASSWORD de .env.local
```

Pilotage CLI : `node --env-file=.env.local scripts/run-etape.mjs <collect|signals|resolve|infer|score> [limite]`
(variable `CAMCHA_URL` pour cibler un autre port/hôte).

## Variables d'environnement (.env.local / Vercel)

| Variable | Rôle | Sans elle |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Base de données | Bloquant |
| `APP_PASSWORD` | Accès à l'app | Bloquant |
| `ANTHROPIC_API_KEY` | Étape infer | Étape désactivée proprement |
| `FRANCE_TRAVAIL_CLIENT_ID` / `_SECRET` | Signal offres d'emploi | Signal désactivé proprement |
| `GOOGLE_PLACES_API_KEY` | Résolution de domaine (fort impact : ~10 % de résolution sans, 60-70 % attendus avec) | Devinette seule |

## TTL des signaux

recrutement 7 j · BODACC 90 j · séminaire/événement 180 j · RSE/avantages 365 j · statiques 365 j.
Un signal expiré sort du calcul (il n'est pas compté zéro).
