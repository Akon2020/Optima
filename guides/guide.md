# Guide OPTIMA : de l'installation à la mise en production

Ce guide explique **tout ce qu'il y a à faire** dans le système, du poste de développement jusqu'à l'exploitation au restaurant.

Légende :
- ✅ : existe dans le dépôt ;
- ⬜ : reste à faire ;
- 🔒 : bloqué par une décision ouverte (voir `docs/DECISIONS.md`).

L'état détaillé, étape par étape, est dans [`walkthrough.md`](./walkthrough.md). Les règles de développement sont dans [`CLAUDE.md`](../CLAUDE.md).

---

## 1. Prérequis

| Outil | Version | Remarque |
|---|---|---|
| Node.js | **24 LTS** recommandé | Node.js 26 fonctionne en local avec un avertissement de Prisma ; la production utilise 24 (D-020) |
| pnpm | 12 | `corepack enable` active la version déclarée dans `package.json` |
| PostgreSQL | 18 (16 au minimum) | Installé nativement sous Windows (D-016) |
| Git | récent | Dépôt `github.com/Akon2020/Optima`, branche `develop` |
| Téléphone | Android avec Chrome | Pour tester l'interface Restaurant et la double authentification |
| Application d'authentification | Google Authenticator, Aegis, 2FAS… | Obligatoire pour le compte propriétaire (EF-AUT-03) |

---

## 2. Installer le projet en local ✅

```bash
git clone https://github.com/Akon2020/Optima.git
```

```bash
cd Optima
```

```bash
git switch develop
```

```bash
pnpm install
```

`pnpm install` génère aussi le client Prisma (`src/generated/prisma`, non versionné).

Créez ensuite **`.env.local`** à partir de `.env.example`. Ce fichier n'est jamais committé.

```bash
cp .env.example .env.local
```

Générez la clé de chiffrement des secrets de double authentification et collez-la dans `AUTH_ENCRYPTION_KEY` :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> Sans base de données, l'interface Restaurant de démonstration (`/e/demo/restaurant`) fonctionne déjà : elle n'utilise que le navigateur.

---

## 3. Créer la base de données locale ✅ (faite sur le poste de développement le 07/11/2026)

Le script crée la base `optima` et deux rôles :
- **`optima_migrator`** : migrations, propriétaire du schéma ;
- **`optima_app`** : l'application, sans BYPASSRLS ni droits de super-utilisateur.

**1. Préparez deux mots de passe longs et aléatoires**, un par rôle (sans caractère spécial à encoder dans une URL) :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

**2. Lancez le script** avec le super-utilisateur PostgreSQL. Il vous demande votre mot de passe `postgres`, puis les deux mots de passe à créer :

```bash
psql -U postgres -h localhost -f scripts/db/setup-local.sql
```

Sans questions (script, poste neuf), passez les deux mots de passe en variables ; le mot de passe `postgres` se donne alors par la variable d'environnement `PGPASSWORD`, jamais dans un fichier :

```bash
psql -U postgres -h localhost -v migrator_password=<mot de passe optima_migrator> -v app_password=<mot de passe optima_app> -f scripts/db/setup-local.sql
```

**3. Complétez `.env.local`** :

```
DATABASE_URL=postgresql://optima_app:<mot de passe optima_app>@localhost:5432/optima
MIGRATION_DATABASE_URL=postgresql://optima_migrator:<mot de passe optima_migrator>@localhost:5432/optima
```

**4. Appliquez les migrations** (schéma, RLS, triggers, droits) :

```bash
pnpm db:migrate
```

**5. Créez les données de développement.** Les mots de passe provisoires s'affichent **une seule fois** : notez-les (sur le poste de développement, ils sont gardés dans `.env.accounts.local`, non versionné).

```bash
pnpm db:seed
```

Le seed crée :
- un propriétaire (`proprietaire@optima.local`, ou la valeur de `SEED_OWNER_EMAIL`) ;
- un gérant et un serveur ;
- l'établissement « Restaurant (développement) », avec ses trois points de service, 12 tables et un menu aux prix fictifs.

Il refuse de tourner en production.

**Vérifier l'état des migrations :**

```bash
pnpm db:status
```

---

## 4. Lancer et se connecter ✅

```bash
pnpm dev
```

Ouvrez `http://localhost:3000/connexion`.

**Propriétaire** :
1. Identifiant et mot de passe provisoire du seed.
2. Choix d'un mot de passe personnel (10 caractères au moins).
3. Activation de la double authentification : ajoutez la clé dans l'application du téléphone, puis saisissez le code affiché.
4. **Notez les 8 codes de secours** : ils ne s'affichent qu'une fois.
5. Vous arrivez sur `/proprietaire`. Aux connexions suivantes, le code du téléphone sera demandé.

**Gérant ou serveur** : mot de passe provisoire, puis nouveau mot de passe, puis `/compte`.

**Restaurant sur les vraies données** :
1. Sur `/compte`, le gérant ouvre l'établissement (`/e/restaurant-dev/restaurant`).
2. **Appairage** (une fois par appareil) : il nomme l'appareil (« Téléphone salle 1 ») et l'enregistre. L'appareil reçoit son code (D01, D02…) et charge les points de service, le menu, les tables, le personnel et les commandes du jour.
3. **« Qui travaille ? »** : chaque utilisateur s'ajoute une fois avec son identifiant et son mot de passe (réseau nécessaire), puis choisit un **code PIN à 4 chiffres** (ni chiffres répétés, ni suite).
4. Ensuite, on change d'utilisateur en deux gestes : bouton « Changer d'utilisateur », puis le PIN. Après 5 erreurs, le PIN est verrouillé et le mot de passe est redemandé.
5. Un gérant entré par PIN agit comme serveur. Pour le stock du matin, les menus ou les tables, il confirme son mot de passe (« Actions de gérant ») : ses droits valent 15 minutes (D-024).
6. Les opérations partent au serveur toutes les 30 secondes, 3 secondes après chaque saisie et au retour du réseau. Le bouton d'état ouvre le détail : opérations en attente, dernière synchronisation, refus avec leur motif.

**Aperçu Restaurant (local, données fictives)** : `http://localhost:3000/e/demo/restaurant`. Rien n'y est envoyé au serveur.

---

## 5. Vérifier le code ✅

| Commande | Quand |
|---|---|
| `pnpm typecheck` | À chaque modification |
| `pnpm lint` | À chaque modification |
| `pnpm test` | Logique métier, utilitaires, base locale, PIN (98 tests) |
| `pnpm test:integration` | Sécurité, authentification, droits, synchronisation, sur PostgreSQL 18 embarqué, sans serveur ni mot de passe (41 tests) |
| `pnpm build` | Quand les routes ou la configuration changent |
| `pnpm format` | Avant de committer |

Pour toute interface : contrôle visuel à **360, 768 et 1280 px**, en **clair et en sombre**.

---

## 6. Règles de travail ✅

- Tout le développement se fait sur **`develop`**. Jamais de commit direct sur `main`.
- Commits petits et vérifiés, en anglais, au format Conventional Commits (`feat:`, `fix:`, `docs:`…), **sans mention d'outil d'IA**.
- Push après chaque commit cohérent.
- Toute décision structurante va dans `docs/DECISIONS.md`. Toute exigence réalisée est notée dans `docs/SPECIFICATIONS.md`. `CLAUDE.md` et `guides/walkthrough.md` sont mis à jour dans le même commit que le changement.
- Les questions ouvertes ne se tranchent pas seules : le code isole l'hypothèse (`// HYPOTHÈSE D-Qxx`).

---

## 7. Tout ce qui reste à faire

### 7.1 Décisions à obtenir du porteur du projet 🔒

Par ordre d'urgence :

1. **D-Q03 / D-Q04** (encaissement).
2. **D-Q10** (clôtures).
3. **D-Q14** (magasin, réquisitions).
4. **D-Q06** (accompagnements).
5. **D-Q13** (matériel, à recenser au restaurant).
6. **D-Q20** (hébergement, domaine).
7. **D-Q07** (livraison).
8. **D-Q15** (arrondis, dollar).
9. **D-Q11 / D-Q26** (identité, landing page).
10. Valider les propositions **D-022**, **D-023** et **D-024**.
11. Faire signer le cahier des charges (D-013).

### 7.2 Relier le Restaurant au serveur (en grande partie fait)

- [ ] Écran « Appareils » (gérant) : liste, révocation, dernière synchronisation (EF-CPT-04, EF-PRO-04). Le service existe ; l'appairage se fait déjà depuis l'appareil.
- [x] Première connexion d'un appareil avec mot de passe (RG-OFF-02), stockage local du jeton d'appareil.
- [x] **Code PIN** à 4 chiffres par utilisateur et par appareil, vérificateur local, 5 essais (EF-AUT-01, EF-AUT-05, D-024).
- [x] Client de synchronisation :
  - envoi de la file toutes les 30 secondes et après chaque opération ;
  - affichage des refus (EF-OFF-01 à 04) ;
  - réception par curseur ;
  - application locale des changements.
- [x] Chargement initial des menus, tables et points de service depuis le serveur (`/api/sync/bootstrap`) ; numérotation avec le vrai code appareil.
- [ ] Contrôle serveur dans le layout `/e/[etablissement]/restaurant`. Aujourd'hui la page est une coquille statique sans donnée : tout passe par le jeton d'appareil, revérifié à chaque requête. Le contrôle restera nécessaire pour les écrans en ligne (rapports).
- [x] Effacement des données locales d'un appareil révoqué (ENF-09).
- [ ] Opérations d'un utilisateur suspendu : marquées pour revue au lieu d'être refusées (`CLAUDE.md` § 5.1).
- [ ] Confirmation du mot de passe d'un gérant hors connexion : impossible aujourd'hui (réseau nécessaire).
- [ ] Thème par utilisateur, rattaché au profil (D-Q31).

### 7.3 Espace propriétaire et administration ⬜

- [ ] Tableau de bord consolidé (EF-PRO-01 à 05) : chiffre d'affaires, marge, cash attendu et déclaré, manquants, stock, alertes, comparaison de périodes.
- [ ] Établissements : création avec aperçu de l'en-tête (EF-ETB-01, 02), suspension (03), suppression en deux temps (04, RG-ETB-02), exports (05).
- [ ] Modules par établissement, avec contrôle des dépendances (EF-MOD-01, 02, RG-MOD-01, 02).
- [ ] Comptes :
  - gérants (EF-CPT-01) et personnel (EF-CPT-02, 03, 05) ;
  - réinitialisation des mots de passe par le gérant ou le propriétaire (EF-AUT-04) ;
  - déconnexion forcée ;
  - le dernier propriétaire ne peut pas se retirer son rôle (RG-CPT-01).
- [ ] Journal d'audit consultable, filtrable et exportable (EF-AUD-02 à 04).
- [ ] Paramètres d'établissement validés par Zod (`establishment_settings`).

### 7.4 Module Restaurant ⬜

- [ ] Réquisitions (EF-REQ-01, 02, RG-REQ-01) 🔒 D-Q14 ; mettre à jour la proposition du stock du matin.
- [ ] Encaissement (EF-ENC-01 à 04, RG-ENC-01, 02) : espèces CDF et USD au taux figé (RG-PRX-02), Mobile Money, paiement partiel, crédit validé par le gérant 🔒 D-Q03, D-Q04, D-Q15.
- [ ] Libération automatique des tables au règlement (remplace l'hypothèse D-Q04).
- [ ] Annulations et remises avec validation du gérant (RG-CMD-02, RG-VTE-02, RG-ENC-01).
- [ ] Clôtures de service et de période (EF-CLO-01 à 05, RG-CLO-01 à 03) 🔒 D-Q10.
- [ ] Postes de préparation : écrans comptoir, cuisine et grillade, « prêt » et « épuisé » (EF-PRE-01 à 03).
- [ ] Fiches recettes (EF-RCT-01 à 04) 🔒 D-Q06.
- [ ] Livraison (EF-LIV-01 à 04) 🔒 D-Q07.
- [ ] Rapports et exports PDF, Excel, CSV (EF-RAP-01 à 04).
- [ ] Impression thermique ESC/POS, 58 et 80 mm (EF-DOC-02) 🔒 D-Q13.
- [ ] QR de vérification et page `/verification/[code]` (EF-DOC-03, 04).

### 7.5 Socle commerce (fonctions d'AkivioFlow) ⬜

- [ ] Catalogue : fiche article, catégories, marques, unités, code-barres, recherche sans accents (EF-CAT-01 à 05).
- [ ] Prix de revient pondéré, assistant de prix et règles de marge, historique, taux de change (EF-PRX-01 à 05).
- [ ] Achats : fournisseurs, bons de commande, réceptions, conversions casier → bouteilles, dettes fournisseurs (EF-ACH-01 à 04).
- [ ] Stock : emplacements, opérations numérotées, inventaires, lots et péremption (EF-STK-01 à 04, RG-STK-01 à 03).
- [ ] Caisse : panier, paiements multiples, devis et pro forma, crédit (EF-VTE-01 à 05).
- [ ] Trésorerie, dépenses avec justificatifs, dettes clients, solde prévisionnel (EF-TRE-01 à 04).
- [ ] Fichiers : contrôle par signature, réencodage par sharp, stockage hors du dossier public (`CLAUDE.md` § 3.11) 🔒 D-Q23.
- [ ] Tâches de fond pg-boss : exports, rapports, alertes.

### 7.6 Hors connexion et application installable ⬜

- [ ] Service worker (Serwist), manifeste, icônes, installation sur l'écran d'accueil (EF-OFF-05).
- [ ] Ouverture de l'application sans réseau, y compris après un rechargement.
- [ ] Tests de bout en bout hors connexion et sur deux appareils synchronisés.

### 7.7 Sécurité restante ⬜

- [ ] CSP stricte avec nonce, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (`CLAUDE.md` § 5.4).
- [ ] Contrôle de l'en-tête `Origin` sur les route handlers modifiants qui utiliseraient un cookie.
- [ ] Limitation de débit partagée si plusieurs instances (aujourd'hui en mémoire).
- [ ] `pnpm audit` en intégration continue.
- [ ] Purge régulière des sessions expirées et des anciennes tentatives de connexion.

### 7.8 Qualité ⬜

- [ ] Playwright :
  - parcours P1 à P6 ;
  - captures dans les quatre combinaisons (deux chartes, clair et sombre) ;
  - contrôle d'accessibilité axe.
- [ ] Stylelint : interdire les couleurs littérales hors des tokens.
- [ ] GitHub Actions sur `develop` et sur les pull requests vers `main` : typage, lint, tests, intégration, build, audit. Ajouter un passage des tests d'intégration contre un vrai PostgreSQL (D-021).

### 7.9 Landing page ⬜ 🔒 D-Q26

- [ ] Sections de `docs/LANDING_PAGE.md`, en charte générale, avec les deux thèmes.
- [ ] `noindex` tant que D-Q01 n'est pas tranchée.
- [ ] Aucun chiffre, client ni témoignage inventé (D-012).

### 7.10 Phase 2 : boutique de gold detectors ⬜ 🔒 D-Q27 à D-Q30

- [ ] Suivi par numéro de série.
- [ ] Expéditions vers d'autres villes (les emplacements peuvent représenter des villes).
- [ ] Ventes à crédit par tranches.
- [ ] Charte de module éventuelle.

---

## 8. Mise en production

> Rien de cette section n'est encore en place. Elle décrit la cible ; les fichiers à créer sont marqués ⬜.

### 8.1 Choix préalables 🔒 D-Q20

- **Hébergeur** : VPS Linux (Hetzner, Contabo ou équivalent). Recommandation : au moins 2 vCPU, 4 Go de RAM et 40 Go de disque, en Europe (D-Q25).
- **Nom de domaine**, par exemple `optima.exemple.cd`, plus un sous-domaine de préproduction.
- **Qui administre le serveur** (accès SSH, astreinte).
- **Préproduction séparée**, recommandée : branche `develop`, données fictives.

### 8.2 Préparer le serveur

1. Ubuntu Server 24.04 LTS, à jour.
2. Un utilisateur non-root, connexion SSH **par clé uniquement**, connexion root désactivée.
3. Pare-feu `ufw` : seuls les ports 22, 80 et 443 sont ouverts. Ajoutez `fail2ban` sur SSH et les mises à jour de sécurité automatiques.
4. Docker Engine et le plugin Compose.
5. Une entrée DNS de type A du domaine vers l'adresse IP du serveur.

### 8.3 Fichiers à ajouter au dépôt ⬜

| Fichier | Contenu attendu |
|---|---|
| `Dockerfile` | Construction en plusieurs étapes sur `node:24-bookworm-slim` : `pnpm install --frozen-lockfile`, `pnpm build` avec `output: "standalone"` dans `next.config.ts`, image finale sans outils de build, utilisateur non-root |
| `docker-compose.prod.yml` | Services `db` (postgres:18, volume persistant, aucun port exposé), `app` (image OPTIMA, variables d'environnement, dépend de `db`), `caddy` (ports 80 et 443, certificats automatiques) |
| `Caddyfile` | `optima.exemple.cd { reverse_proxy app:3000 }`, plus les en-têtes de sécurité si la CSP n'est pas posée par Next.js |
| `scripts/db/setup-production.sql` | Même rôle que `setup-local.sql`, sans saisie interactive (mots de passe passés par des secrets) |
| `scripts/create-owner.ts` | Création du **premier propriétaire en production** (le seed y est interdit), mot de passe provisoire affiché une fois |
| `scripts/backup.sh` | Sauvegarde chiffrée et copie externe (voir § 8.7) |

L'application doit rester **derrière Caddy** : elle se fie à l'en-tête `X-Forwarded-For` pour l'adresse IP (blocage des tentatives, audit).

### 8.4 Variables d'environnement de production

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Connexion du rôle `optima_app` (mot de passe propre à la production) |
| `MIGRATION_DATABASE_URL` | Connexion du rôle `optima_migrator`, utilisée seulement pendant le déploiement |
| `AUTH_ENCRYPTION_KEY` | **Nouvelle** clé de 32 octets en base64, jamais celle du développement. La perdre rend les doubles authentifications illisibles : conservez-la dans un coffre |
| `APP_ORIGIN` | `https://optima.exemple.cd` (obligatoire : l'application refuse de démarrer sans) |
| `NEXT_PUBLIC_SITE_INDEXABLE` | `false` tant que D-Q01 n'est pas tranchée |

Les secrets sont fournis par un fichier `.env` sur le serveur (droits `600`, hors du dépôt) ou par les secrets Docker. Ils ne sont jamais dans l'image ni dans Git.

### 8.5 Premier déploiement

1. **Fusion validée** de `develop` vers `main` par pull request, après la recette (cahier, chapitre 10), puis une étiquette de version (`v1.0.0`).
2. Sur le serveur, récupérez la version étiquetée et construisez l'image.
3. Démarrez la base, créez les rôles (`setup-production.sql`), puis appliquez les migrations :

```bash
docker compose -f docker-compose.prod.yml run --rm app pnpm db:migrate
```

4. Créez le premier propriétaire avec `scripts/create-owner.ts` ⬜.
5. Démarrez l'application et Caddy :

```bash
docker compose -f docker-compose.prod.yml up -d
```

6. **Contrôles après déploiement** :
   - HTTPS valide ;
   - `/connexion` s'affiche ;
   - connexion du propriétaire avec activation de la double authentification ;
   - `/proprietaire` protégé ;
   - `/api/sync/pull` sans jeton répond 401 ;
   - les journaux ne montrent aucune erreur de configuration.

### 8.6 Mises à jour et retour arrière

- Chaque mise en production part d'une étiquette sur `main`.
- Les migrations sont **appliquées avant** le démarrage de la nouvelle version. Elles sont écrites pour être compatibles avec la version précédente (ajout de colonnes, jamais de suppression dans la même livraison).
- Retour arrière : redémarrer l'image précédente. Une migration n'est jamais « annulée » à la main : on écrit une migration corrective.
- Maintenances annoncées et réalisées **hors des heures de service** du restaurant (ENF-11). Les appareils continuent hors connexion pendant ce temps (ENF-13).

### 8.7 Sauvegardes (ENF-12)

- [ ] Chaque nuit, `pg_dump -Fc` de la base `optima`.
- [ ] Chiffrement (par exemple `age` ou `gpg`), avec une clé gardée hors du serveur.
- [ ] Copie sur un **stockage externe** distinct du serveur (autre fournisseur, stockage objet compatible S3).
- [ ] Conservation de 30 jours, rotation automatique.
- [ ] **Restauration de test chaque mois** sur une machine séparée, consignée (date, durée, résultat).
- [ ] Sauvegarde aussi des fichiers téléversés (D-Q23) et de la clé `AUTH_ENCRYPTION_KEY`, séparément.

### 8.8 Supervision

- [ ] Surveillance de disponibilité externe sur `/connexion` (alerte par e-mail ou SMS au responsable).
- [ ] Journaux de l'application (pino, JSON) conservés et consultables. Ils masquent déjà mots de passe, jetons et cookies.
- [ ] Alertes sur l'espace disque, la mémoire, l'expiration du certificat et l'échec d'une sauvegarde.
- [ ] Dans l'espace propriétaire : appareils non synchronisés depuis plus de 24 heures (EF-PRO-05) ⬜.

### 8.9 Mise en service au restaurant

1. **Recenser le matériel** (D-Q13) : téléphones, version d'Android, imprimantes, Wi-Fi, coupures d'électricité.
2. Le propriétaire crée l'établissement, active les modules et crée le compte du gérant.
3. Le gérant :
   - crée le personnel ;
   - vérifie les points de service, les tables, le menu et **tous les prix** (un élément sans prix ne se vend pas) ;
   - saisit le premier stock du matin.
4. **Enregistrer chaque téléphone** comme appareil (code D01, D02…), installer l'application sur l'écran d'accueil, et faire une première connexion par mot de passe pour chaque serveur, puis choisir son PIN.
5. **Formation courte** par rôle : serveurs (commande, factures d'avance, tables), gérant (stock du matin, menus, validation), propriétaire (tableau de bord).
6. **Fonctionnement en parallèle** avec les souches papier pendant une à deux semaines, puis comparaison des clôtures.
7. **Recette** formelle selon le chapitre 10 du cahier, puis bascule définitive.

---

## 9. Exploitation courante

| Besoin | Qui | Où | État |
|---|---|---|---|
| Se connecter, changer de mot de passe | Tous | `/connexion` | ✅ |
| Double authentification, codes de secours | Propriétaire | `/connexion/activer-2fa` | ✅ |
| Appairer un appareil, ajouter un utilisateur, choisir son PIN | Gérant, puis chacun | Restaurant, au premier lancement | ✅ |
| Prendre une commande, imprimer les factures d'avance | Serveur | Restaurant, « Commander » | ✅ synchronisé |
| Stock du matin | Gérant | Restaurant, « Stock du matin » | ✅ synchronisé |
| Tables, addition | Serveur, gérant | Restaurant, « Tables » | ✅ synchronisé |
| Menus et prix | Gérant | Restaurant, « Menus » | ✅ ajout ; modification des prix ⬜ |
| Créer un compte, réinitialiser un mot de passe, suspendre | Gérant, propriétaire | Équipe | ⬜ |
| Révoquer un appareil, voir sa dernière synchronisation | Gérant | Appareils | ⬜ (service prêt, écran à faire) |
| Encaisser, clôturer | Serveur, gérant | Restaurant | ⬜ 🔒 |
| Suspendre, exporter un établissement, modules | Propriétaire | Espace propriétaire | ⬜ |
| Consulter le journal d'audit | Gérant, propriétaire | Audit | ⬜ (journal écrit, écran à faire) |

---

## 10. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Configuration invalide : DATABASE_URL… » | `.env.local` absent ou incomplet | Compléter `.env.local` (§ 2 et 3) |
| « Une erreur inattendue est survenue… code xxxxxxxx » à la connexion | Base non joignable ou non migrée | Chercher le code dans la console du serveur ; vérifier PostgreSQL, puis `pnpm db:status` |
| `password authentication failed for user "optima_app"` | Mot de passe différent entre `.env.local` et le rôle | Corriger `.env.local`, ou `ALTER ROLE optima_app PASSWORD '…'` en `postgres` |
| `permission denied for table …` | Migrations appliquées avec le mauvais rôle | Lancer `pnpm db:migrate` avec `MIGRATION_DATABASE_URL` défini |
| `Cannot find module '@/generated/prisma/client'` | Client Prisma non généré | `pnpm db:generate` |
| `ERR_PNPM_IGNORED_BUILDS` | Nouveau paquet avec un script d'installation | L'autoriser ou le refuser dans `pnpm-workspace.yaml` (`allowBuilds`) |
| « Another next dev server is already running » | Un serveur tourne déjà | Utiliser l'onglet existant (port 3000) ou l'arrêter |
| « Trop de tentatives » | 5 échecs en 15 minutes (RG-AUT-02) | Attendre 15 minutes |
| Téléphone de double authentification perdu | — | Utiliser un code de secours ; puis réactiver la double authentification (écran de réinitialisation ⬜) |
| L'aperçu Restaurant montre d'anciennes données | Base locale du navigateur | « Réinitialiser » dans le bandeau de démonstration |
| « Changez d'abord votre mot de passe provisoire… » en ajoutant un utilisateur | Compte jamais utilisé | Se connecter une fois sur `/connexion` pour choisir son mot de passe |
| « PIN verrouillé » | 5 erreurs de PIN | « Ajouter un utilisateur » avec le mot de passe : le PIN redevient utilisable |
| L'appareil revient à l'écran d'appairage avec un message de révocation | Appareil révoqué (ENF-09) | Ses données locales ont été effacées ; un gérant l'appaire de nouveau |
| Le bouton d'état affiche « N opérations refusées » | Le serveur a refusé une opération (droit, prix, établissement) | Ouvrir le détail : chaque refus a son motif ; le gérant le revoit |
