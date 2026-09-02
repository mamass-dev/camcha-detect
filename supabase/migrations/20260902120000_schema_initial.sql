-- Schéma initial du moteur de détection CAMCHA

create table entreprise (
  siren text primary key,
  raison_sociale text not null,
  sigle text,
  commune text,
  code_postal text,
  adresse text,
  effectif_tranche text,
  effectif_annee text,
  idcc text[] default '{}',
  date_creation date,
  latitude double precision,
  longitude double precision,
  est_ess boolean default false,
  est_societe_mission boolean default false,
  nature_juridique text,
  activite_principale text,
  domaine text,
  domaine_statut text not null default 'non_tente' check (domaine_statut in ('non_tente','resolu','non_resolu')),
  domaine_methode text,
  domaine_preuve text,
  telephone text,
  nb_avis integer,
  disqualifie boolean not null default false,
  disqualifie_motif text,
  signals_statut text not null default 'non_tente' check (signals_statut in ('non_tente','fait','erreur')),
  infer_statut text not null default 'non_tente' check (infer_statut in ('non_tente','fait','sans_domaine','erreur')),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

-- Un signal par clé et par entreprise : les re-runs mettent à jour, jamais de doublon.
create table signal (
  id bigint generated always as identity primary key,
  siren text not null references entreprise(siren) on delete cascade,
  cle text not null,
  valeur text not null,
  confiance real,
  verbatim text,
  source_url text,
  methode text not null check (methode in ('structure','infere','declare')),
  hallucination boolean not null default false,
  observe_le timestamptz not null default now(),
  expire_le timestamptz,
  unique (siren, cle)
);
create index signal_siren_idx on signal (siren);
create index signal_cle_idx on signal (cle);

-- Cache disque de tout appel réseau, avec sa date : relancer = 0 appel payant.
create table http_cache (
  cle text primary key,
  url text,
  statut integer,
  corps jsonb,
  corps_texte text,
  recupere_le timestamptz not null default now()
);

-- Journal de coût : chaque appel réseau réel y passe (cache_hit = false).
create table appel_api (
  id bigint generated always as identity primary key,
  fournisseur text not null,
  endpoint text,
  cache_hit boolean not null default false,
  tokens_entree integer,
  tokens_sortie integer,
  cout_eur numeric(12,6) not null default 0,
  cree_le timestamptz not null default now()
);
create index appel_api_fournisseur_idx on appel_api (fournisseur);

-- Configuration modifiable sans toucher au code (poids, tarifs, plafonds).
create table config (
  cle text primary key,
  valeur jsonb not null,
  maj_le timestamptz not null default now()
);

insert into config (cle, valeur) values
('poids', '{
  "fit": {
    "idcc_renseigne": 1,
    "anciennete_3ans": 1,
    "ess_ou_mission": 2,
    "demarche_rse": 2,
    "avantages_salaries_existants": 3,
    "effectif_20_49": 1
  },
  "moment": {
    "offres_actives": 3,
    "changement_dirigeant": 2,
    "augmentation_capital": 2,
    "transfert_siege": 1,
    "seminaire": 2,
    "evenement_fin_annee": 2,
    "croissance_effectif": 2
  },
  "valeur_probable": 0.6
}'::jsonb),
('parametres', '{
  "taux_usd_eur": 0.92,
  "prix_modele_usd": {"entree_par_mtok": 3.0, "sortie_par_mtok": 15.0},
  "modele": "claude-sonnet-4-6",
  "plafond_tokens_envoi": 12000,
  "plafond_pages": 8,
  "plafond_ko_texte": 200,
  "ttl_jours": {"recrutement": 7, "bodacc": 90, "seminaire": 180, "rse": 365, "statique": 365}
}'::jsonb);

-- Verrouillage : l''app n''utilise que la clé service côté serveur.
alter table entreprise enable row level security;
alter table signal enable row level security;
alter table http_cache enable row level security;
alter table appel_api enable row level security;
alter table config enable row level security;
