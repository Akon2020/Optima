# CLAUDE.md : OPTIMA

Document de référence pour développer OPTIMA avec Claude Code. **À lire en entier avant toute intervention dans ce dépôt.**

---

## 0. Avant de commencer

### 0.1 Documents du projet

| Fichier | Contenu | Quand le lire |
|---|---|---|
| `CLAUDE.md` (ce fichier) | Vision, architecture, sécurité, conventions, règles de travail | Toujours, en premier |
| `docs/SPECIFICATIONS.md` | Les 161 exigences numérotées (EF, RG, ENF), le glossaire et la matrice des droits | Avant d'implémenter ou de modifier une fonctionnalité |
| `docs/DESIGN_SYSTEM.md` | Les deux chartes graphiques, les tokens et les thèmes clair et sombre | Avant de toucher à un composant, un style ou un écran |
| `docs/DECISIONS.md` | Le registre des décisions prises (D-xxx) et des questions ouvertes (D-Qxx) | Avant toute décision structurante ; à mettre à jour après chaque décision |
| `docs/LANDING_PAGE.md` | Le contenu et la structure de la landing page | Avant de travailler sur les pages publiques |
| `docs/reference/` | Cahier des charges d'origine (Word) | En cas de doute sur la formulation exacte |

### 0.2 Statut des informations

Chaque affirmation de la documentation porte l'un de ces statuts. **Ne traite jamais un élément [PROPOSÉ] ou [À DÉCIDER] comme une décision définitive.**

| Statut | Signification | Ce que tu peux faire |
|---|---|---|
| **[CONFIRMÉ]** | Décidé explicitement par le porteur du projet | L'appliquer tel quel |
| **[SPÉCIFIÉ]** | Écrit dans le cahier des charges v1.0, soumis pour validation mais pas encore signé | L'implémenter. Signaler toute incohérence plutôt que de la corriger en silence |
| **[DÉDUIT]** | Tiré d'un document existant (fiches Excel, vidéos AkivioFlow, maquettes) | L'appliquer, en restant prêt à corriger |
| **[PROPOSÉ]** | Recommandation technique non encore validée | L'appliquer par défaut si la tâche l'exige. Si le choix est difficile à défaire, le signaler avant |
| **[À DÉCIDER]** | Question ouverte, listée dans `docs/DECISIONS.md` | Ne pas trancher seul. Implémenter de façon à ce que le choix reste possible, ou demander |
| **[ENVISAGÉ]** | Fonctionnalité future, hors périmètre de la version en cours | Ne pas implémenter. Ne pas fermer la porte par une architecture qui l'empêcherait |

### 0.3 État du dépôt au 7 novembre 2026

- Le projet est initialisé (Next.js 16.4, React 19.3, TypeScript strict, Tailwind CSS v4, pnpm, Vitest). **[CONFIRMÉ : D-014]**
- Existent : le design system (deux chartes, clair et sombre), une page d'accueil provisoire, et le **module Restaurant en interface locale** (tableau de bord, commandes, prise de commande, menus, stock du matin) sur une base IndexedDB alimentée par des **données de démonstration** (D-018). Il n'y a encore **ni base PostgreSQL, ni authentification, ni synchronisation serveur**.
- Aperçu : `/e/demo/restaurant`. Seul l'établissement de démonstration est servi ; ses routes ne lisent aucune donnée serveur. Le contrôle d'accès côté serveur sera posé dans le layout du module avec le socle serveur.
- La pile technique décrite au § 3 est celle **proposée par le cahier des charges** (chapitre 6). Elle est **[PROPOSÉ]** tant que D-Q18 n'est pas tranchée. Si un code existant contredit ce document, c'est le code qui décrit la réalité : il faut alors le signaler et mettre ce fichier à jour, pas réécrire le code pour suivre le document.
- Prochaine étape **[CONFIRMÉ]** : initialiser le projet, poser le design system et le mécanisme des thèmes, puis implémenter la landing page (voir § 10).

---

## 1. Présentation générale du système

### 1.1 Vision

OPTIMA est un **logiciel de gestion commerciale multi-établissements**. Il permet à un propriétaire de piloter plusieurs activités commerciales (un restaurant, une boutique, etc.) depuis un seul outil. Chaque établissement garde ses données, son gérant et son personnel, strictement séparés des autres. **[CONFIRMÉ]**

OPTIMA est **destiné uniquement aux établissements du propriétaire**. Il n'est pas vendu à des tiers, et il n'y a donc ni abonnements, ni facturation de clients, ni inscription publique. **[CONFIRMÉ]**

### 1.2 Problème à résoudre [DÉDUIT des documents transmis]

Aujourd'hui, chaque activité se suit sur des fiches Excel et des souches de factures papier. Les fiches analysées montrent :

- des calculs refaits à la main ;
- des dates incohérentes, par exemple une expédition antérieure à l'entrée en stock ;
- un bénéfice calculé à partir des achats valorisés au prix de vente, et non des ventes réelles ;
- des manquants de caisse constatés sans pouvoir être attribués ;
- aucune vue d'ensemble pour le propriétaire.

### 1.3 Objectifs [SPÉCIFIÉ, cahier § 1.2]

1. Réunir tous les établissements dans un seul outil, avec des données strictement séparées.
2. Donner au propriétaire un espace de pilotage pour suivre, comparer, contrôler et agir (suspendre, exporter, activer des fonctionnalités).
3. Rendre la caisse défendable : chaque facture est rattachée à un serveur et à un point de service, chaque clôture est comparée au montant attendu.
4. Rendre le stock fiable : stock du matin, réquisitions, ventes et écarts suivis article par article.
5. Permettre de travailler **sans Internet**, avec synchronisation automatique au retour du réseau. **[CONFIRMÉ]**
6. Tracer toute action sensible (« qui a fait quoi, et quand ? »).

### 1.4 Utilisateurs

| Profil | Rattachement | Responsabilités principales |
|---|---|---|
| **Propriétaire** (super-administrateur) | Tous les établissements | Tableau de bord consolidé ; créer, suspendre, supprimer et exporter un établissement ; activer ou désactiver des modules par établissement ; créer et suspendre les gérants ; journal d'audit **[CONFIRMÉ]** |
| **Gérant** (administrateur d'établissement) | Un établissement | Menus et prix, achats, réquisitions, stock du matin, personnel, validation des annulations et des clôtures, rapports **[CONFIRMÉ pour le stock du matin ; SPÉCIFIÉ pour le reste]** |
| **Serveur ou serveuse** | Un établissement | Prise de commande, impression des factures d'avance, encaissement, sa propre clôture **[CONFIRMÉ : principaux utilisateurs du restaurant]** |
| **Poste de préparation** (comptoir, cuisine, grillade) | Un point de service | Reçoit les commandes, signale « prêt » et « épuisé ». Ne voit aucun montant **[SPÉCIFIÉ]** |
| **Livreur** | Un établissement | Ses livraisons, confirmation de la remise et de l'encaissement **[SPÉCIFIÉ]** |
| **Lecteur** | Un établissement | Consultation des rapports, sans modification **[SPÉCIFIÉ]** |

La matrice détaillée des droits se trouve dans `docs/SPECIFICATIONS.md`, § 3.

### 1.5 Établissements et phasage

| Établissement | Phase | Statut |
|---|---|---|
| **Espace propriétaire** (commun à tous) | Phase 1 | **[CONFIRMÉ]** C'est le point commun de tous les modules |
| **Restaurant Best Food I** (Bukavu) | Phase 1, priorité | **[CONFIRMÉ]** |
| **Gold Detector M Congo** (vente de détecteurs Minelab, Bukavu, expéditions vers d'autres villes) | Phase 2 | **[CONFIRMÉ]** Règles non encore spécifiées (D-Q27 à D-Q30) |
| Autres établissements | Plus tard | **[ENVISAGÉ]** L'architecture doit permettre d'en ajouter sans refaire le socle (§ 2.6) |

### 1.6 Modules et responsabilités

Les fonctionnalités sont découpées en **modules activables par établissement** (EF-MOD-01 à RG-MOD-02). **[CONFIRMÉ : le propriétaire active ou désactive des fonctionnalités par établissement]**

| Module | Responsabilité | Dépend de | Exigences |
|---|---|---|---|
| **Noyau** (non désactivable) | Comptes, rôles, appareils, synchronisation, audit, paramètres d'établissement | aucun | EF-AUT, EF-OFF, EF-CPT, EF-ETB, EF-AUD |
| **Espace propriétaire** (non désactivable) | Tableau de bord consolidé, gestion des établissements et des modules | Noyau | EF-PRO, EF-ETB, EF-MOD |
| Catalogue et prix | Articles, catégories, marques, unités, prix de revient, règles de marge, taux de change | Noyau | EF-CAT, EF-PRX |
| Stock | État, opérations, inventaires, emplacements | Catalogue | EF-STK |
| Achats et fournisseurs | Fournisseurs, bons de commande, réceptions, conversions d'unités | Stock | EF-ACH |
| Caisse et ventes | Panier, paiements multiples, devis, pro forma, crédit | Catalogue | EF-VTE |
| Documents | Numérotation, tickets, factures A4, bons de livraison, QR de vérification | Caisse | EF-DOC |
| Trésorerie et dépenses | Caisses, dépenses, solde prévisionnel | Caisse | EF-TRE |
| Clients et dettes | Fiches clients, crédits, remboursements | Caisse | EF-VTE-05, EF-TRE-03 |
| Lots et péremption | Suivi par lots, ordre de péremption, blocage des lots périmés | Stock | EF-CAT-04, EF-STK-04, RG-STK-02 |
| Code-barres et étiquettes | Scan par caméra, impression d'étiquettes | Catalogue | EF-CAT-03, EF-CAT-05 |
| **Restaurant** | Points de service, menus, tables, réquisitions, stock du matin, prise de commande, encaissement, clôtures | Catalogue, Stock, Caisse, Documents | EF-RES, EF-REQ, EF-CMD, EF-ENC, EF-CLO |
| Postes de préparation | Écrans comptoir, cuisine et grillade | Restaurant | EF-PRE |
| Fiches recettes | Coût des plats, contrôle des consommations | Restaurant, Stock | EF-RCT |
| Livraison | Commandes livrées, livreurs, statuts | Restaurant | EF-LIV |
| Rapports | Rapports et exports | Selon les données | EF-RAP, EF-TDB |

Les fonctionnalités du socle reprennent celles du logiciel **AkivioFlow**, analysé à partir de deux vidéos de démonstration **[CONFIRMÉ : « inclure toutes les fonctionnalités vues dans AkivioFlow »]**.

### 1.7 Interactions entre modules

```
Propriétaire ──► Espace propriétaire ──► lit les agrégats de tous les établissements
                                     └─► agit : suspendre, exporter, modules, gérants

Établissement (ex. Restaurant)
  Achats ──réception──► Stock (magasin) ──réquisition──► Stock (point de service)
                                                              │
  Gérant : stock du matin (bouteilles / plats / morceaux) ───► │
                                                              ▼
  Serveur : commande ──► répartition par point de service ──► factures d'avance
                     ──► Caisse (paiement) ──► Trésorerie
                     ──► Stock (décrément dès validation, RG-CMD-01)
  Fin de service : Clôture = souches vs montant compté ; stock attendu vs stock compté
                 ──► rapport ──► tableau de bord du gérant et du propriétaire
  Fiches recettes : réquisition (ingrédients) ──► plats attendus ──► contrôle des écarts
  Toute action sensible ──► Journal d'audit
```

---

## 2. Architecture fonctionnelle

### 2.1 Organisation générale

```
Système OPTIMA
└── Propriétaire (1 ou plus, RG-CPT-01)
    └── Établissement (N)            type, devise de base figée (RG-ETB-01), modules actifs
        ├── Utilisateurs             un rôle par établissement
        ├── Appareils enregistrés    code appareil (D01, D02...) utilisé dans la numérotation
        ├── Emplacements             ex. magasin
        └── Points de service        Restaurant uniquement : comptoir, cuisine, grillade
            ├── caisse propre
            ├── menu propre
            └── stock propre
```

### 2.2 Le restaurant tel qu'il fonctionne aujourd'hui [CONFIRMÉ par l'équipe du restaurant]

- **Trois services, trois caisses** :
  - **Boissons / comptoir** ;
  - **Cuisine** : viande de porc, poisson salé, tilapia, zingaro, sambaza, frites, bisamunyu, birayi, foufou ;
  - **Grillade (muchoma)** : viande de chèvre.
- **Réquisition chaque jour** des boissons et de la nourriture vers la cuisine et la grillade.
- **Chaque matin, le gérant fait entrer le stock** dans le système : les boissons en **bouteilles**, la nourriture en **plats**, la viande de chèvre en **morceaux**.
- **Le serveur passe la commande en imprimant la facture d'avance**, puis la dépose au comptoir, à la cuisine et/ou au muchoma.
- Les **utilisateurs** sont les serveurs et serveuses.
- **En fin de service, on compte les souches de factures** pour l'inventaire de caisse.
- Il existe **deux menus** : boissons et nourriture.
- Gestion attendue **complète** : caisse, commandes en cuisine, recettes, livraison, inventaire.
- Les achats de boissons se font **en casiers**, et la vente **à la bouteille** **[DÉDUIT de la fiche d'inventaire]**.
- La monnaie du restaurant est le **franc congolais** **[DÉDUIT de la fiche d'inventaire]**.

### 2.3 Parcours utilisateurs clés

**P1. Ouverture (gérant)** **[CONFIRMÉ + SPÉCIFIÉ]**
1. Réceptionner les achats (casiers convertis en bouteilles).
2. Établir la réquisition de chaque point de service.
3. Saisir le stock du matin : le logiciel propose la clôture de la veille plus la réquisition, le gérant confirme ou corrige (motif obligatoire si écart).

**P2. Service en salle (serveur)** **[CONFIRMÉ + SPÉCIFIÉ]**
1. Se connecter sur l'appareil par code PIN.
2. Choisir une table, une vente à emporter ou une livraison.
3. Ajouter des éléments des deux menus, puis valider.
4. Une facture d'avance est imprimée **par point de service concerné**.
5. Les déposer.
6. Encaisser.
7. Imprimer l'addition récapitulative si besoin.

**P3. Préparation** **[SPÉCIFIÉ, optionnel]** : l'écran du poste reçoit les commandes ; « prêt » notifie le serveur ; « épuisé » retire l'élément des menus.

**P4. Livraison** **[SPÉCIFIÉ]** : commande avec adresse et frais par zone ; attribution à un livreur ; statuts ; encaissement à la livraison ; remise de l'argent au retour.

**P5. Clôture (serveur puis gérant)** **[CONFIRMÉ + SPÉCIFIÉ]**
1. Le montant attendu est calculé à partir des souches, par mode de paiement.
2. Le serveur déclare le montant compté.
3. L'écart est figé, avec commentaire s'il n'est pas nul.
4. Le stock attendu est comparé au stock compté.
5. Le gérant valide.
6. Le rapport remonte au propriétaire.

**P6. Pilotage (propriétaire)** **[CONFIRMÉ + SPÉCIFIÉ]** : il consulte les indicateurs consolidés, ouvre un établissement, agit (suspendre, exporter, modules, gérants) et reçoit les alertes.

### 2.4 Règles métier transversales

Les règles détaillées sont dans `docs/SPECIFICATIONS.md`. Les invariants suivants **ne doivent jamais être violés** :

1. **Rien ne se supprime physiquement** dans les données métier. On archive (articles), on annule avec motif (ventes, factures, paiements) ou on ajuste (stock, clôtures). RG-CAT-01, RG-VTE-02, RG-STK-01, RG-CLO-02, ENF-14.
2. **Les journaux sont en ajout seul** : mouvements de stock, paiements, journal d'audit, clôtures validées. RG-STK-01, RG-AUD-01.
3. **Un numéro de document n'est jamais réutilisé** et reste unique hors connexion grâce au code appareil (`FAC-2026-D01-000052`). EF-DOC-01, RG-DOC-01.
4. **Le taux de change est figé sur chaque paiement**. Un taux n'est jamais modifié : on en ajoute un nouveau. RG-PRX-02.
5. **La devise de base d'un établissement ne change jamais.** RG-ETB-01.
6. **Un article sans prix ne se vend pas.** RG-PRX-01.
7. **Une opération est idempotente** : envoyée deux fois, elle n'est comptée qu'une fois. RG-OFF-01.
8. **Les ventes et les mouvements s'additionnent**, ils ne s'écrasent jamais (pas de conflit). RG-OFF-03.
9. **La marge se calcule sur les ventes réalisées** ; le stock restant est valorisé au prix de revient. RG-RAP-01.
10. **Toute action du propriétaire dans un établissement est auditée** et visible du gérant. RG-PRO-01.
11. **Aucune donnée d'un établissement n'est accessible depuis un autre.** ENF-08.

Les hypothèses encore non confirmées (qui encaisse, fréquence de clôture, tables, crédit, emballages) sont listées en tête de `docs/SPECIFICATIONS.md` et dans `docs/DECISIONS.md` (D-Q03 à D-Q10). **Le code doit les isoler dans des paramètres ou des fonctions faciles à modifier.**

### 2.5 Paramètres et configuration [PROPOSÉ]

| Niveau | Exemples | Qui modifie | Stockage |
|---|---|---|---|
| Système | Liste des modules disponibles, types d'établissement | Développeurs (code) | Code source (`src/modules/registry.ts`) |
| Établissement | Identité, devise de base, modules actifs, règles de marge, seuils d'alerte, zones de livraison, plafonds de remise | Propriétaire, gérant selon la matrice | Table `establishment_settings` (JSON typé et validé par Zod, versionné) |
| Point de service | Imprimante associée, menu | Gérant | Table `service_points` |
| Utilisateur | Thème, langue (français seul pour l'instant), code PIN | Utilisateur | Table `users` / `user_preferences` |
| Environnement | URL, secrets, connexion base | Exploitation | Variables d'environnement validées au démarrage |

Toute valeur métier susceptible de changer (par exemple les seuils de marge de 30, 20 et 50 %) est un **paramètre avec une valeur par défaut**, jamais une constante dispersée dans le code.

### 2.6 Principes d'évolution

- Un nouveau type d'établissement s'ajoute en créant un **module** dans `src/modules/<module>/`. Il s'enregistre dans le registre des modules, avec ses dépendances, ses permissions, ses routes et, si besoin, son identité visuelle. Le socle ne doit pas changer.
- La phase 2 (boutique de gold detectors) introduira le **suivi par numéro de série**, les **expéditions et réexpéditions** vers d'autres villes et les **ventes à crédit par tranches**. Le modèle du stock doit le permettre sans migration destructive : les emplacements doivent pouvoir représenter des villes ou des dépôts tiers.

---

## 3. Architecture technique

### 3.1 Pile technique [CONFIRMÉ : D-014]

| Domaine | Choix | Raison |
|---|---|---|
| Langage | **TypeScript** en mode strict | Un seul langage du navigateur à la base de données |
| Framework | **Next.js** (App Router, React Server Components, Server Actions) | Interface et serveur dans une seule base de code |
| Base de données | **PostgreSQL** (version 16 ou plus) | Transactions fiables, sécurité au niveau des lignes (RLS) pour isoler les établissements |
| ORM | **Prisma** avec migrations versionnées | Typage de bout en bout, migrations traçables |
| Validation | **Zod** (schémas partagés client et serveur) | Une seule source de vérité pour les formes de données |
| Styles | **Tailwind CSS v4** alimenté par des variables CSS | Thèmes et chartes par tokens (voir `docs/DESIGN_SYSTEM.md`) |
| Composants de base | **Radix UI** (primitives accessibles), stylées par nos tokens | Accessibilité clavier et lecteurs d'écran |
| Thèmes | **next-themes** (`attribute="data-theme"`) | Script anti-flash, mode système, persistance |
| Hors connexion | **Service Worker** (via Serwist) et **IndexedDB** (via Dexie) | PWA installable, file d'attente d'opérations |
| PDF | **Playwright / Chromium** côté serveur | Rendu A4 identique à l'aperçu |
| Tâches de fond | **pg-boss** (file adossée à PostgreSQL) | Exports, rapports, alertes, sans serveur supplémentaire |
| Excel et CSV | **ExcelJS** | Imports et exports |
| Images | **sharp** | Réencodage et redimensionnement des photos |
| Journalisation | **pino** avec masquage des champs sensibles | Logs structurés |
| Tests | **Vitest**, Testing Library, **Playwright** (e2e, accessibilité, captures) | Voir § 6 |
| Gestionnaire de paquets | **pnpm** | Rapide, verrouillage strict |
| Hébergement | **Docker** sur VPS Linux (Hetzner, Contabo ou équivalent), **Caddy** pour HTTPS | Cahier, § 6.3 |
| Authentification | **Implémentation maison [CONFIRMÉ : D-015]** : Argon2id, sessions en base, TOTP, PIN | Voir § 5.1 |

Règle : **ne remplace aucune de ces briques** une fois le projet initialisé sans exposer la raison, les conséquences et l'alternative, puis consigner la décision dans `docs/DECISIONS.md`.

### 3.2 Structure des dossiers [PROPOSÉ]

```
.
├── CLAUDE.md
├── docs/                         SPECIFICATIONS, DESIGN_SYSTEM, DECISIONS, LANDING_PAGE, reference/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── sql/                      politiques RLS, triggers d'ajout seul (appliqués par migration)
├── public/                       icônes PWA, manifest, images statiques
├── src/
│   ├── app/                      routes Next.js uniquement (fines : elles composent, ne calculent pas)
│   │   ├── (public)/             landing, connexion, vérification de documents
│   │   ├── (owner)/proprietaire/ espace propriétaire
│   │   ├── (establishment)/e/[etablissement]/   espace d'un établissement
│   │   └── api/                  route handlers : synchronisation, impression, webhooks
│   ├── modules/                  un dossier par module métier
│   │   └── <module>/
│   │       ├── domain/           logique pure, sans I/O (calculs, règles, invariants)
│   │       ├── server/           services, requêtes, server actions (import "server-only")
│   │       ├── offline/          lecture et écriture locales, opérations de synchronisation
│   │       ├── schemas/          schémas Zod
│   │       ├── components/       composants propres au module
│   │       ├── permissions.ts    permissions déclarées par le module
│   │       └── index.ts          déclaration au registre des modules
│   ├── shared/
│   │   ├── ui/                   design system : Button, Card, Table, Sheet, Dialog...
│   │   ├── theme/                ThemeProvider, ThemeSwitcher, ModuleScope
│   │   ├── lib/                  utilitaires génériques (money, dates, ids)
│   │   └── i18n/                 libellés (français), formats
│   ├── server/                   infrastructure serveur
│   │   ├── db/                   client Prisma, contexte RLS
│   │   ├── auth/                 sessions, mots de passe, PIN, 2FA
│   │   ├── authz/                vérification des permissions
│   │   ├── audit/                écriture du journal d'audit
│   │   ├── sync/                 réception et diffusion des opérations
│   │   ├── jobs/                 tâches pg-boss
│   │   ├── files/                stockage des fichiers
│   │   └── env.ts                variables d'environnement validées par Zod
│   ├── offline/                  moteur hors connexion côté client (Dexie, file, synchronisation)
│   └── styles/                   tokens et thèmes (voir docs/DESIGN_SYSTEM.md § 2.4)
└── tests/
    ├── integration/              tests contre une vraie base PostgreSQL
    └── e2e/                      Playwright
```

Règles de dépendance entre dossiers :

- `app/` peut importer `modules/`, `shared/` et `server/`. L'inverse est interdit.
- `modules/<a>` n'importe **jamais** les internes de `modules/<b>`, seulement son `index.ts` public. C'est ce qui empêche un module de dépendre des détails d'un autre.
- `domain/` n'importe ni Prisma, ni React, ni `fetch` : c'est du TypeScript pur, testable unitairement.
- `shared/ui` ne connaît aucun module métier.
- Les écrans du module Restaurant vivent dans `modules/restaurant/components/screens/` ; les fichiers de `app/` se contentent de les rendre.

### 3.3 Routes [PROPOSÉ]

Les URL sont en **français** (elles sont visibles par les utilisateurs). Le code, lui, est en **anglais**.

| Route | Accès | Rendu |
|---|---|---|
| `/` | Public | Landing page (statique) |
| `/connexion` | Public | Connexion |
| `/verification/[code]` | Public | Vérification d'un document par QR code (EF-DOC-04) |
| `/proprietaire` | Propriétaire | Tableau de bord consolidé |
| `/proprietaire/etablissements`, `/proprietaire/etablissements/[id]` | Propriétaire | Gestion des établissements et des modules |
| `/proprietaire/gerants`, `/proprietaire/audit` | Propriétaire | Gérants, journal global |
| `/e/[etablissement]` | Membres de l'établissement | Tableau de bord d'établissement |
| `/e/[etablissement]/catalogue`, `/stock`, `/achats`, `/caisse`, `/tresorerie`, `/rapports`, `/parametres`, `/equipe` | Selon la matrice des droits | Socle |
| `/e/[etablissement]/restaurant/commandes`, `/tables`, `/menus`, `/requisitions`, `/stock-du-matin`, `/preparation/[poste]`, `/livraisons`, `/clotures`, `/fiches-recettes` | Selon la matrice des droits | Module Restaurant, sous `<ModuleScope module="restaurant">` |

Chaque layout protégé vérifie **côté serveur** la session, l'appartenance à l'établissement, l'activation du module et la permission. Masquer un lien dans le menu ne protège rien.

### 3.4 Composants

- Tout composant visuel réutilisable vit dans `src/shared/ui/` et consomme **uniquement des tokens sémantiques** (voir `docs/DESIGN_SYSTEM.md`).
- Composants serveur par défaut. `"use client"` seulement si le composant a besoin d'état, d'effets ou d'APIs du navigateur. Le module Restaurant, qui fonctionne hors connexion, est en majorité côté client.
- Les variantes passent par des props (`variant`, `size`), avec une table de classes typée. Pas de composants copiés pour une autre couleur.
- Avant de créer un composant, **chercher s'il existe déjà** dans `src/shared/ui/` ou dans le module.

### 3.5 Gestion des états [PROPOSÉ]

| Type d'état | Où |
|---|---|
| Données serveur des écrans en ligne (espace propriétaire, rapports) | Composants serveur et Server Actions, avec `revalidatePath` / `revalidateTag` |
| Données des écrans utilisables hors connexion (restaurant, caisse) | **IndexedDB** (Dexie) comme source locale, lue par `useLiveQuery`. Les écritures passent par la file d'opérations |
| État d'interface éphémère (panier en cours, panneau ouvert) | État React local ; contexte si partagé dans un écran |
| Préférences (thème) | next-themes, plus le profil utilisateur |

Aucune bibliothèque d'état global n'est ajoutée tant qu'un besoin réel ne l'impose pas.

### 3.6 API et synchronisation hors connexion [PROPOSÉ ; exigences CONFIRMÉES]

**Server Actions** pour les mutations en ligne (espace propriétaire, paramètres). **Route handlers** (`/api/...`) pour la synchronisation, l'impression et les fichiers.

Le moteur de synchronisation applique le **patron outbox** :

1. Toute écriture métier d'un écran hors connexion crée une **opération**. Elle contient : un `id` UUIDv7 généré sur l'appareil, un `type` (ex. `order.created`), un `payload` validé par Zod, l'`establishmentId`, l'`userId`, le `deviceId`, l'horodatage local et une `version` de schéma.
2. L'opération est appliquée **localement** (optimiste) et placée dans la file `outbox` d'IndexedDB.
3. **Envoi** : `POST /api/sync/push` par lots, toutes les 30 secondes et quelques secondes après chaque opération (EF-OFF-01). Le serveur, dans une transaction par opération :
   - vérifie l'authentification de l'appareil et les permissions **au moment de l'envoi** ;
   - vérifie l'idempotence (`id` déjà connu : réponse « déjà reçue ») ;
   - valide le payload ;
   - applique les règles métier ;
   - écrit l'audit.
4. **Réponse par opération** : `accepted`, `duplicate` ou `rejected` avec un code et un message en français (EF-OFF-04). Les rejets sont visibles dans l'interface, jamais silencieux.
5. **Réception** : `GET /api/sync/pull?cursor=...`. Le serveur renvoie les changements de l'établissement depuis un curseur monotone (séquence par établissement).
6. **Conflits** :
   - entités modifiables (fiche article, paramètres) : la dernière modification validée l'emporte (`updatedAt` serveur plus `version`) et l'historique conserve l'autre ;
   - faits (ventes, paiements, mouvements) : ajout seul, donc jamais de conflit (RG-OFF-03).
7. **Numérotation** : chaque appareil reçoit un code (`D01`...) à son enregistrement, et ses compteurs sont locaux. Le numéro final est `TYPE-ANNÉE-CODEAPPAREIL-SÉQUENCE`.
8. **Stock négatif hors connexion** : il est accepté puis signalé (RG-STK-03), jamais bloquant au moment de la synchronisation.
9. Ce qui exige le réseau : la création d'un établissement ou d'un compte, la première connexion d'un appareil (RG-OFF-02), l'espace propriétaire et les écrans de préparation (RG-PRE-02).

### 3.7 Couche métier

- Les règles métier vivent dans `modules/<module>/domain/` sous forme de **fonctions pures** (ex. `computeWeightedAverageCost`, `splitOrderByServicePoint`, `computeClosingVariance`).
- Elles sont utilisées **à la fois** sur l'appareil (application optimiste) et sur le serveur (application autoritaire). Le serveur fait toujours foi.
- Les services serveur (`server/`) orchestrent : contexte, permission, validation, appel du domaine, persistance, audit, le tout dans **une seule transaction**.

### 3.8 Base de données [PROPOSÉ]

- **Isolation des établissements** :
  - chaque table métier porte `establishment_id` (non nul, indexé) ;
  - la **sécurité au niveau des lignes (RLS)** de PostgreSQL est activée sur ces tables ;
  - chaque requête s'exécute dans une transaction qui fait d'abord `SET LOCAL app.establishment_id`, `app.user_id` et `app.role` (extension du client Prisma dans `src/server/db/`).
- **Rôles PostgreSQL** :
  - l'application se connecte avec un rôle **sans** `BYPASSRLS` ni droits de superutilisateur ;
  - les migrations utilisent un rôle distinct ;
  - les lectures consolidées du propriétaire passent par des fonctions dédiées qui vérifient le rôle propriétaire.
- **Identifiants** : UUIDv7, générables hors connexion et triables par date.
- **Montants** : entiers en **unité minimale** (`BIGINT`) avec un code devise (`CDF`, `USD`), jamais de flottants. Les taux de change sont en `NUMERIC(18,6)`. Le prix de revient moyen pondéré est en `NUMERIC`, arrondi seulement à l'affichage et à la facturation. La règle d'arrondi des prix en CDF est **[À DÉCIDER : D-Q15]**.
- **Dates** : stockées en `timestamptz` (UTC). L'affichage se fait dans le fuseau de l'établissement, **Africa/Lubumbashi** (UTC+2) pour Bukavu. Une « journée d'exploitation » est délimitée par la clôture, pas par minuit **[À DÉCIDER : D-Q10]**.
- **Tables en ajout seul** (`stock_movements`, `payments`, `audit_log`, `closings` validées, `exchange_rates`, `price_history`) : un trigger refuse `UPDATE` et `DELETE`.
- **Suppression** : `archived_at` ou `cancelled_at` avec un motif, jamais de `DELETE` sur les données métier. Seule exception : la suppression définitive d'un établissement (EF-ETB-04), par une tâche dédiée, auditée, après export.
- **Entités principales** (cahier, § 6.4) :
  - établissement et paramètres, module activé ;
  - utilisateur, appartenance et rôle, appareil ;
  - article, catégorie, marque, unité, conversion d'unités ;
  - fournisseur, achat et réception ;
  - emplacement et point de service, mouvement de stock, inventaire ;
  - réquisition, stock du matin, fiche recette ;
  - table, commande, facture et souche ;
  - paiement, taux de change ;
  - client et dette, livraison, dépense ;
  - clôture et écart ;
  - opération de synchronisation, journal d'audit.

### 3.9 Validation des données

- **Un schéma Zod par entrée** dans `modules/<module>/schemas/`. Il est utilisé par le formulaire (retour immédiat), par la Server Action ou le route handler (contrôle autoritaire) et par la file de synchronisation.
- La validation serveur est **obligatoire**, même si le client a déjà validé. On ne fait jamais confiance à un `establishmentId`, un prix, un total ou un rôle envoyé par le client : le serveur les **recalcule** ou les **relit** depuis la base.
- Les messages d'erreur sont en français, compréhensibles et disent quoi faire.

### 3.10 Gestion des erreurs

- Côté serveur :
  - les erreurs métier attendues sont typées (`DomainError` avec un `code`, ex. `PRICE_NOT_SET`, `PERIOD_CLOSED`) ;
  - les erreurs inattendues sont journalisées avec un **identifiant de corrélation** ;
  - l'utilisateur ne voit qu'un message générique et cet identifiant.
- Les Server Actions renvoient un résultat discriminé `{ ok: true, data } | { ok: false, code, message, fieldErrors? }`. Les exceptions ne remontent pas brutes jusqu'au client.
- Aucune trace d'appel, requête SQL, chemin de fichier ou secret n'est envoyé au navigateur.
- Côté client : un `error.tsx` par segment de route, des états vides et d'erreur conçus (pas d'écran blanc), et des réessais automatiques pour la synchronisation.

### 3.11 Fichiers et médias [PROPOSÉ ; stockage : D-Q23]

- Fichiers concernés : logos d'établissement, photos d'articles et de plats, justificatifs de dépenses (EF-TRE-02), exports et PDF générés.
- Contrôles :
  - taille maximale de 5 Mo ;
  - types autorisés : JPEG, PNG, WebP et PDF pour les justificatifs, vérifiés **par signature** et non par extension ;
  - **pas de SVG** téléversé.
- Les images sont **réencodées** par sharp (ce qui supprime les métadonnées EXIF, dont la géolocalisation), avec plusieurs tailles.
- Les fichiers reçoivent un nom aléatoire et sont stockés hors du dossier public. Ils sont servis par une route qui vérifie les droits sur l'établissement.
- Hors connexion, les photos prises sont mises en file avec l'opération et envoyées au retour du réseau.

### 3.12 Impression [PROPOSÉ]

- Tickets thermiques de 58 et 80 mm en ESC/POS, par **Web Bluetooth** ou **WebUSB** depuis Chrome sur Android, ou par un **relais d'impression local** sur le poste du restaurant. L'impression navigateur reste le recours.
- Facture A4 et rapports en PDF, générés par le serveur. Hors connexion, une version HTML imprimable est produite localement.
- Le matériel exact est **[À DÉCIDER : D-Q13]**.

### 3.13 Dépendances

- **Avant d'ajouter une dépendance**, vérifier :
  - qu'elle est nécessaire (la plateforme, une dépendance existante ou 30 lignes de code ne suffisent-elles pas ?) ;
  - qu'elle est maintenue (publication récente, licence compatible) ;
  - son poids dans le bundle client.
- Toute nouvelle dépendance est mentionnée dans le message de commit et, si elle est structurante, dans `docs/DECISIONS.md`.
- Versions verrouillées par `pnpm-lock.yaml`. Pas de `*` ni de `latest`.

### 3.14 Conventions de développement

| Élément | Convention |
|---|---|
| Langue du code (variables, fonctions, tables, commits) | Anglais |
| Langue de l'interface, des messages et des URL | Français |
| Fichiers et dossiers | `kebab-case` (`order-summary.tsx`) |
| Composants React | `PascalCase` |
| Fonctions et variables | `camelCase` ; booléens préfixés `is`, `has`, `can` |
| Constantes | `SCREAMING_SNAKE_CASE` |
| Tables et colonnes SQL | `snake_case`, tables au pluriel (`stock_movements`) ; Prisma `@@map` / `@map` |
| Types | `PascalCase`, sans préfixe `I` |
| Tests | `*.test.ts` à côté du code ; e2e dans `tests/e2e/*.spec.ts` |
| Références aux exigences | Citer l'identifiant (`EF-CMD-02`) dans les tests et les commentaires utiles |
| Montants | Toujours via `src/shared/lib/money.ts` (création, addition, conversion, formatage `fr-CD`) |
| Dates | Toujours via `src/shared/lib/dates.ts` (fuseau de l'établissement) |

---

## 4. Identité visuelle, expérience utilisateur et thèmes

Le détail complet se trouve dans **`docs/DESIGN_SYSTEM.md`**. L'essentiel :

### 4.1 Deux chartes, un seul jeu de composants [CONFIRMÉ]

- **Charte générale** (bleu nuit `#1F3864` et blanc, sobre) : landing page, pages publiques, connexion, espace propriétaire, interfaces communes, et tout module sans charte propre.
- **Charte Restaurant** (maquettes « Yum Slice ») : uniquement le module Restaurant. Elle se caractérise par :
  - un fond gris clair et des cartes blanches à grands rayons ;
  - un doré moutarde `#D9A22A`, un orange `#E2691C` et une encre `#2F2F2F` ;
  - des cartes vitrines anthracite et des tuiles KPI pastel ;
  - des tableaux sans grille et des formulaires en panneau latéral.
- La charte Restaurant **ne doit jamais** déborder sur les autres espaces. La portée est assurée par `<ModuleScope module="restaurant">` (attribut `data-module`), qui gère aussi les **portails** (dialogues, menus, toasts).

### 4.2 Tokens

- **Trois couches** : primitives, sémantiques, module.
- Les composants **n'utilisent que les tokens sémantiques** (`--color-surface`, `--color-action`...). Les couleurs littérales sont interdites hors de `src/styles/tokens/` et `src/styles/modules/`.

### 4.3 Thèmes clair et sombre [CONFIRMÉ : obligatoires partout]

- Trois préférences : **Clair**, **Sombre**, **Système** (par défaut).
- Thème porté par `data-theme` sur `<html>` et posé avant le rendu (pas de flash).
- Persistance dans `localStorage` (`optima:theme`) et, pour les utilisateurs connectés, dans leur profil.
- `ThemeSwitcher` unique, présent sur la landing page, dans les barres supérieures et dans le menu utilisateur.
- Les **quatre combinaisons** (2 chartes × 2 thèmes) sont maintenues et testées.
- Les graphiques, les portails, les états vides, les skeletons, les icônes et les illustrations suivent le thème.
- **Exception** : les documents imprimés et les PDF sont toujours en clair.

### 4.4 Responsive et accessibilité

- Approche **mobile d'abord** pour le module Restaurant : téléphones Android d'entrée de gamme, 360px minimum (ENF-05, ENF-06).
- Zones tactiles d'au moins 44px.
- WCAG 2.2 AA dans les quatre combinaisons. Focus visible, statuts jamais portés par la seule couleur, `lang="fr"`, `aria-label` sur les boutons-icônes, `prefers-reduced-motion` respecté.
- Écart volontaire par rapport aux maquettes : **texte encre (et non blanc) sur le doré**, et texte secondaire plus foncé, pour respecter les contrastes (`docs/DESIGN_SYSTEM.md` § 8, D-Q12).

---

## 5. Sécurité et contrôle des accès

La sécurité fait partie de la conception. Aucune fonctionnalité n'est livrée en la contournant, même temporairement, même en développement.

### 5.1 Authentification [exigences SPÉCIFIÉES ; implémentation maison CONFIRMÉE : D-015]

- Identifiant : adresse e-mail ou numéro de téléphone. Mot de passe d'au moins 10 caractères, haché en **Argon2id** (ENF-07). Jamais stocké en clair, jamais envoyé par e-mail (RG-AUT-01).
- Mot de passe provisoire à la création, **changement obligatoire** à la première connexion (EF-AUT-02).
- **Double authentification TOTP obligatoire pour le propriétaire** (EF-AUT-03). Codes de secours générés une seule fois et stockés hachés.
- **Code PIN à 4 chiffres** pour reprendre la main sur un appareil partagé du restaurant (EF-AUT-01, EF-AUT-05) :
  - il n'est valable que sur un **appareil enregistré** de l'établissement, et seulement pour un utilisateur qui s'y est déjà connecté avec son mot de passe ;
  - il est stocké haché (Argon2id) ;
  - 5 essais au maximum, puis verrouillage et mot de passe exigé ;
  - le PIN ne remplace jamais le mot de passe pour les actions de gérant ou de propriétaire.
- **Blocage temporaire** après plusieurs échecs (RG-AUT-02) : 5 échecs en 15 minutes par compte et par adresse IP.
- **Hors connexion** :
  - seuls les utilisateurs déjà connectés sur l'appareil peuvent travailler ;
  - le contrôle du PIN se fait sur un vérificateur haché local ;
  - les opérations sont signées par l'appareil et **revalidées par le serveur à la synchronisation** : un utilisateur suspendu entre-temps voit ses opérations marquées pour revue, mais jamais perdues.

### 5.2 Sessions et jetons

- Sessions **côté serveur** (table `sessions`), identifiant opaque dans un cookie `HttpOnly`, `Secure`, `SameSite=Lax`, préfixé `__Host-`.
- Expiration après inactivité (RG-AUT-03), plus courte pour le propriétaire. Rotation de l'identifiant à la connexion et à l'élévation de privilège.
- **Jeton d'appareil** : chaque appareil enregistré reçoit un identifiant et un secret (stocké haché côté serveur), révocables à distance (EF-CPT-04). La révocation efface les données locales à la reconnexion suivante (ENF-09).
- Déconnexion forcée possible par le propriétaire et le gérant (EF-CPT-01) : toutes les sessions de l'utilisateur sont invalidées.
- Pas de JWT longue durée stocké dans `localStorage`.

### 5.3 Autorisation

- **Permissions déclarées par module** (`modules/<module>/permissions.ts`), par exemple `restaurant.order.create` ou `restaurant.closing.validate`. Les rôles sont des ensembles de permissions, conformes à la matrice des droits.
- **Contrôle obligatoire côté serveur à chaque requête**, Server Action et opération synchronisée, via une seule fonction : `authorize(ctx, permission, resource?)`. Elle vérifie, dans cet ordre :
  1. la session valide ;
  2. l'établissement actif (non suspendu) ;
  3. l'appartenance de l'utilisateur à l'établissement ;
  4. le module actif ;
  5. la permission du rôle ;
  6. la propriété de la ressource si nécessaire, par exemple « ses commandes » (RG-CMD-03).
- Le **filtrage des données se fait sur le serveur** : une donnée non autorisée n'est jamais envoyée au client (cahier, chapitre 3). La base applique en plus la RLS : c'est une **défense en profondeur**, pas un substitut au contrôle applicatif.
- Le propriétaire qui agit dans un établissement passe par les mêmes contrôles, avec un contexte d'audit « propriétaire » (RG-PRO-01).
- Le gérant ne peut pas attribuer un droit qu'il n'a pas (EF-CPT-03). Le dernier propriétaire ne peut pas se retirer son rôle (RG-CPT-01).

### 5.4 Protection contre les vulnérabilités courantes

| Risque | Mesure |
|---|---|
| Injection SQL | Prisma et requêtes paramétrées uniquement. `$queryRaw` seulement en gabarit balisé. `$queryRawUnsafe` et `$executeRawUnsafe` **interdits** |
| XSS | Échappement de React. `dangerouslySetInnerHTML` interdit, sauf contenu assaini et justifié. **CSP stricte avec nonce** (`script-src 'self' 'nonce-...'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`) |
| CSRF | Cookies `SameSite=Lax`. Contrôle de l'en-tête `Origin` sur toutes les requêtes modifiantes des route handlers (les Server Actions le font nativement). Aucune modification par `GET` |
| Accès à une ressource d'un autre établissement (IDOR) | Toute ressource est relue avec la condition `establishment_id = contexte`. RLS en second rempart. Tests d'intégration dédiés |
| Téléversements malveillants | Contrôle par signature, réencodage, pas de SVG, stockage hors du dossier public, service authentifié (§ 3.11) |
| Force brute | Limitation de débit (§ 5.6), verrouillage du PIN |
| Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| En-têtes | `Strict-Transport-Security` (1 an, sous-domaines), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` limitée (caméra autorisée **uniquement** pour l'origine propre, pour le scan des codes-barres EF-CAT-03) |
| Dépendances vulnérables | `pnpm audit` en intégration continue. Mises à jour de sécurité suivies |
| Manipulation des montants | Totaux, prix, remises et taux **recalculés côté serveur**. Les valeurs envoyées par le client ne servent qu'à détecter un écart |

### 5.5 Données sensibles et secrets

- Les secrets (base, sessions, stockage, e-mail) sont lus **uniquement** dans des variables d'environnement, validées au démarrage par `src/server/env.ts` : l'application refuse de démarrer si une variable manque.
- `.env*` est dans `.gitignore`. Seul `.env.example` (sans valeurs réelles) est versionné.
- Les modules serveur importent `"server-only"`. Aucune variable `NEXT_PUBLIC_*` ne contient de secret.
- Aucun secret, mot de passe, PIN, jeton ou donnée personnelle dans le code, les tests, les journaux, les messages d'erreur ou les commits.
- **Données locales des appareils** : seules les données de l'établissement courant et nécessaires au travail du jour sont conservées (catalogue, menus, commandes et clôtures récentes). Pas d'historique complet, pas d'autres établissements.

### 5.6 Limitation des requêtes [PROPOSÉ]

| Point d'entrée | Limite indicative |
|---|---|
| Connexion | 5 essais / 15 min par compte et par IP |
| Code PIN | 5 essais, puis verrouillage |
| Réinitialisation de mot de passe | 3 / heure par compte |
| Synchronisation | 120 requêtes / minute par appareil, lots de 200 opérations au plus |
| Vérification publique de document | 30 / minute par IP |
| Exports | 5 simultanés par établissement (file pg-boss) |

### 5.7 Journal d'audit

- **Ce qui est tracé** (EF-AUD-01) : connexions et échecs, prix, annulations, remises, réquisitions, ajustements de stock, clôtures et écarts, changements de droits et de paramètres, actions du propriétaire, suspensions, exports, suppressions d'établissement, révocations d'appareils.
- **Champs** : `id`, `establishment_id`, `actor_user_id`, `actor_role`, `device_id`, `action`, `entity`, `entity_id`, `before` et `after` (JSON, sans secrets), `reason`, `ip`, `created_at`, `correlation_id`.
- Table en **ajout seul**, protégée par un trigger (RG-AUD-01). Jamais purgée. Exports en PDF, Excel et CSV (EF-AUD-04).
- Les journaux techniques (pino) sont distincts du journal d'audit. Ils masquent automatiquement `password`, `pin`, `token`, `secret`, `authorization` et `cookie`.

### 5.8 Sauvegardes et reprise

- Sauvegarde PostgreSQL **chaque nuit**, **chiffrée**, copiée sur un **stockage externe** distinct du serveur, conservée **30 jours** (ENF-12).
- **Restauration de test chaque mois**, documentée (ENF-12).
- Objectifs **[PROPOSÉ]** : perte maximale d'une journée côté serveur, mais quasi nulle en pratique puisque les appareils conservent leurs opérations non synchronisées ; rétablissement en moins de 4 heures ouvrables.
- Une panne du serveur n'arrête pas les établissements (ENF-13).

### 5.9 Erreurs sans fuite d'information

Le client reçoit un message générique et un identifiant de corrélation. Le détail (pile d'appels, requête, valeurs) ne va que dans les journaux serveur. Les écrans d'erreur publics ne révèlent ni la version du framework ni la structure interne.

---

## 6. Qualité et maintenabilité

### 6.1 Typage et code

- TypeScript `strict`, avec `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes`. Pas de `any`, sauf justification commentée. Pas de `@ts-ignore` (au besoin `@ts-expect-error` avec la raison).
- ESLint (règles Next.js, accessibilité `jsx-a11y`, ordre des imports, frontières entre dossiers) et Prettier.
- Fonctions courtes. La logique métier est dans `domain/`, jamais dans les composants ni les routes.
- Pas de duplication : avant d'écrire une fonction, chercher si elle existe (`src/shared/lib`, `domain/` du module).

### 6.2 Tests

| Niveau | Outil | Ce qui est couvert obligatoirement |
|---|---|---|
| Unitaire | Vitest | Toute fonction de `domain/` : prix de revient pondéré, règles de marge et arrondis, conversions d'unités, répartition des commandes, calculs de clôture et d'écarts, numérotation, montants et devises |
| Composants | Vitest + Testing Library | Composants partagés, états (vide, chargement, erreur), accessibilité de base |
| Intégration | Vitest + PostgreSQL réel (conteneur de test) | Permissions (chaque ligne de la matrice des droits), **isolation entre établissements** (RLS et IDOR), idempotence de la synchronisation, tables en ajout seul, audit |
| Bout en bout | Playwright | Parcours P1 à P6 ; **travail hors connexion** (`context.setOffline`) ; **deux appareils** synchronisés ; changement de thème ; captures dans les quatre combinaisons ; contrôle d'accessibilité axe |

Les tests citent les identifiants d'exigences. Une correction de bug commence par un test qui reproduit le bug.

### 6.3 Performance (ENF-01 à ENF-04)

- Commande enregistrée en moins de 2 secondes hors connexion, impression en moins de 5 secondes.
- Écrans courants en moins de 3 secondes en 3G.
- Synchronisation d'une journée en moins d'une minute.
- Landing page : LCP inférieur à 2,5 s en 4G moyenne, JavaScript client minimal (composants serveur), images `next/image` en AVIF/WebP, polices `next/font`.
- Budget **[PROPOSÉ]** : 170 Ko de JavaScript compressé au premier chargement pour les écrans du serveur.

### 6.4 Documentation

- Toute décision structurante est ajoutée à `docs/DECISIONS.md` (contexte, décision, conséquences).
- Toute exigence implémentée, modifiée ou abandonnée est annotée dans `docs/SPECIFICATIONS.md`.
- Ce `CLAUDE.md` est mis à jour **dans le même commit** que le changement qui le rend inexact : commandes, structure, pile, conventions.
- Les fonctions de `domain/` complexes ont un commentaire qui explique le **pourquoi** et cite la règle.

---

## 7. Git et livraison

### 7.1 Branches [CONFIRMÉ]

- **Tout le développement se fait sur `develop`.**
- Avant toute modification :
  1. `git status` ;
  2. vérifier la branche active ;
  3. vérifier les modifications non commitées ;
  4. vérifier les branches locales et distantes (`git branch -a`) et les remotes (`git remote -v`).
- Si `develop` n'existe pas, la créer à partir de la branche par défaut à jour (`main` ou `master`), **sans écraser ni perdre** de modification existante.
- **Jamais** de commit ni de push direct sur `main`, `master` ou une branche de production. Le passage en production se fait par fusion validée par le porteur du projet.
- **Jamais** de `push --force`, `reset --hard`, `rebase` de commits publiés, `branch -D` ou nettoyage de fichiers non suivis **sans autorisation explicite**.
- Ne jamais supprimer ni écraser des modifications préexistantes qui ne sont pas de ton fait.

### 7.2 Commits [CONFIRMÉ]

- Commits **petits, cohérents et vérifiés** (typage, lint et tests concernés passés), à chaque étape terminée.
- Format **Conventional Commits** en anglais : `feat:`, `fix:`, `style:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`, `build:`, `ci:`. Exemple : `feat: add light and dark theme support`.
- **Aucune mention de Claude ou d'Anthropic** dans les messages de commit : pas de « Generated by », pas de `Co-Authored-By: Claude`, ni aucune mention équivalente. Les messages décrivent uniquement la modification.
- Ne pas falsifier l'auteur Git et ne pas réécrire l'historique.
- Ne jamais committer de secret, de fichier `.env`, de donnée réelle de client ou de base de données.

### 7.3 Push [CONFIRMÉ]

- Après chaque commit cohérent, `git push origin develop`, si le remote est configuré et que l'opération est sans risque.
- En cas d'échec (rejet, conflit, authentification) : identifier la cause, ne rien forcer, informer le porteur du projet et proposer une solution sûre, par exemple `git pull --rebase` sur des commits **non publiés** uniquement, après accord.
- Ne jamais annoncer qu'un commit ou un push a réussi sans l'avoir vérifié (`git log -1`, `git status`, sortie du push).

### 7.4 Environnements [PROPOSÉ]

| Environnement | Branche | Usage |
|---|---|---|
| Local | toute branche de travail | Développement (PostgreSQL natif Windows, D-016) |
| Préproduction | `develop` | Démonstrations, recette (cahier, § 6.3) |
| Production | `main` | Établissements réels. Déploiement validé manuellement |

---

## 8. Règles de collaboration pour Claude Code

1. **Lire avant d'agir** : ce fichier, puis les documents de `docs/` concernés par la tâche, puis le code existant autour de la modification.
2. **Comprendre avant de modifier** : identifier le rôle d'un élément, ses dépendances et ses appelants avant de le changer. Ne pas remplacer un élément parce que ce serait plus simple.
3. **Rester dans le périmètre demandé.** Pas de refactorisation, de renommage ni de « nettoyage » non sollicités. Les améliorations repérées sont proposées, pas imposées.
4. **Ne pas dupliquer** : chercher l'existant (composant, fonction, schéma, permission) avant d'en créer.
5. **Préserver ce qui fonctionne.** Toute modification d'un comportement existant est signalée et justifiée.
6. **Ne pas trancher les [À DÉCIDER]** : implémenter de façon réversible (paramètre, fonction isolée) ou poser la question. Les hypothèses retenues sont écrites dans le code (commentaire `// HYPOTHÈSE D-Qxx`) et dans le compte rendu.
7. **Ne pas inventer** de règle métier, de donnée, de chiffre, de témoignage, de client, de tarif ou de certification. Le contenu provisoire est marqué `[À COMPLÉTER]` et regroupé pour être remplacé facilement.
8. **Aucune dépendance sans nécessité** (§ 3.13). La signaler dans le compte rendu.
9. **Ne jamais contourner la sécurité** pour faciliter le développement : pas de désactivation de RLS, de contrôle de permission, de CSP ou de validation, même temporaire. Pas de compte « admin/admin » ni de porte dérobée. Les données de démonstration utilisent des mots de passe générés et ne vont jamais en production.
10. **Vérifier avant de déclarer terminé**, à chaque modification significative :
    - `pnpm typecheck` ;
    - `pnpm lint` ;
    - `pnpm test` (tests concernés) ;
    - `pnpm build` si la configuration ou les routes changent ;
    - tests e2e concernés.

    Pour toute interface, contrôler aussi le rendu à 360, 768 et 1280px et dans les thèmes clair et sombre (et la charte concernée). Une interface visible n'est pas une fonctionnalité terminée.
11. **Signaler les décisions techniques importantes** avant de les prendre si elles sont difficiles à défaire (schéma de base, structure des URL, bibliothèque structurante), et les consigner dans `docs/DECISIONS.md`.
12. **Tenir la documentation à jour** dans le même commit que le changement.
13. **Compte rendu à chaque étape importante** :
    - ce qui a été analysé ;
    - ce qui a été fait ;
    - les fichiers créés ou modifiés ;
    - les vérifications effectuées et leurs résultats réels ;
    - les commits et push (avec leurs identifiants) ;
    - les difficultés ;
    - les décisions qui demandent l'intervention du porteur du projet.
14. **Ne jamais affirmer** qu'un test, un build, un commit ou un push a réussi sans l'avoir exécuté et vérifié.
15. En cas de contradiction entre ce fichier, les spécifications et une demande du porteur du projet, la **demande explicite du porteur du projet** prévaut, à condition de ne pas violer les règles de sécurité. Il faut alors mettre la documentation à jour en conséquence.

---

## 9. Commandes du projet

Scripts existants dans `package.json` :

| Commande | Rôle |
|---|---|
| `pnpm dev` | Serveur de développement |
| `pnpm build` / `pnpm start` | Build et démarrage de production |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (règles Next.js) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` / `pnpm test:watch` | Tests unitaires Vitest (`*.test.ts` à côté du code ; IndexedDB simulée par `fake-indexeddb`) |

Prévus, pas encore créés **[PROPOSÉ]** : `pnpm test:integration` (PostgreSQL natif, D-016), `pnpm test:e2e` (Playwright), `pnpm db:migrate` / `pnpm db:seed` (Prisma), Stylelint.

---

## 10. Feuille de route immédiate

| Étape | Contenu | Statut |
|---|---|---|
| 1 | Analyse, spécifications, `CLAUDE.md`, `docs/` | Fait le 07/11/2026 |
| 2 | Initialisation : Next.js, TypeScript strict, pnpm, ESLint, Prettier, Vitest | Fait le 07/11/2026. Restent Stylelint et Playwright |
| 3 | Design system : tokens (deux chartes, clair et sombre), `ThemeProvider`, `ThemeSwitcher`, `ModuleScope`, composants de base | Fait le 07/11/2026 |
| 4 | Module Restaurant, interface locale : coquille responsive, tableau de bord, commandes, prise de commande avec factures d'avance, menus | Fait le 07/11/2026, sur données de démonstration (D-018) |
| 5 | Module Restaurant, suite : stock du matin (fait le 07/11/2026), réquisitions (après D-Q14), tables, encaissement (après D-Q03 et D-Q04), clôtures (après D-Q10), livraison (après D-Q07), PWA hors connexion (Serwist) | En cours |
| 6 | Socle serveur : PostgreSQL, Prisma, RLS, authentification maison (D-015), autorisation, audit, synchronisation `/api/sync` | À faire ; D-Q20 (hébergement) reste ouverte |
| 7 | **Landing page** complète selon `docs/LANDING_PAGE.md` | À faire ; contenu bloqué par D-Q26 |

L'ordre a été revu le 07/11/2026 (D-018). Les décisions encore ouvertes sont listées dans **`docs/DECISIONS.md`**. Les plus bloquantes pour la suite du Restaurant sont **D-Q03** et **D-Q04** (encaissement), **D-Q10** (clôtures), **D-Q14** (magasin et réquisitions) et **D-Q06** (accompagnements).
