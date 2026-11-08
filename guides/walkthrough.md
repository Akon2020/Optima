# Walkthrough OPTIMA : ce qui est fait, ce qui bloque

> État au **7 novembre 2026**, branche `develop`.
> Ce fichier raconte le projet étape par étape : pour chacune, ce qui a été réalisé, comment c'est vérifié, et **ce qui bloque encore**. Il est mis à jour à la fin de chaque étape.
> Pour la suite du travail (de l'installation à la mise en production), voir [`guide.md`](./guide.md).

---

## Vue d'ensemble

| # | Étape | État | Commits |
|---|---|---|---|
| 1 | Analyse, spécifications et décisions | Fait | `1703006`, `5b2c30e` |
| 2 | Initialisation de l'outillage | Fait (Stylelint et Playwright restent à ajouter) | `2ca6d7e` |
| 3 | Design system et thèmes | Fait | `b809a7e` |
| 4 | Module Restaurant, interface locale | Fait sur données de démonstration | `9c44090`, `9df9a5b`, `0b38c1b`, `6a41638` |
| 5 | Stock du matin | Fait, proposition simplifiée (D-Q14) | `e15882e`, `4c18be0` |
| 6 | Tables | Fait, libération manuelle (D-Q04) | `9e00932`, `48b4cb2` |
| 7 | Socle serveur | Fait | `91ca948`, `5614168`, `a9b4345`, `fb56335` |
| 8 | Relier l'interface au serveur | Fait : appairage, PIN, synchronisation, écran « Appareils ». Reste la PWA | `305ef80`, `74c5bfd`, `ceebded`, `711e749`, `e8850c1`, `2bef4be` |
| 9 | Gestion du personnel | Fait : écran « Équipe ». Restent les droits ajustables (EF-CPT-03) | `e9e9ef6`, `5cbe87b`, `4ff970d`, `5aaaa1d` |
| 10 | Espace propriétaire | Fait : vue d'ensemble, établissements, modules, suspension. Restent exports et suppression | `5f058f1`, `728d315`, `b26d45e` |
| 11 | Journal d'audit consultable | Fait : filtres, détail, export CSV. Restent Excel et PDF | `a35eb0f`, `be1919b`, `2ae73cb` |
| 12 | Menus selon les modules | Fait : menus et écrans des appareils suivent les modules actifs | voir `git log` |

**En une phrase :** un appareil du restaurant s'appaire au serveur, chaque serveur y reprend la main par son code PIN, et les commandes, le stock du matin et les tables se synchronisent avec PostgreSQL. L'aperçu `/e/demo/restaurant` reste local.

**Vérifications au dernier commit :**
- `pnpm typecheck`, `pnpm lint` et `pnpm build` passent ;
- `pnpm test` : 128 tests unitaires passent ;
- `pnpm test:integration` : 74 tests d'intégration passent, sur PostgreSQL 18 embarqué ;
- parcours vérifié dans le navigateur contre la base locale (étape 8).

---

## Étape 1 : analyse, spécifications et décisions

**Fait**
- `CLAUDE.md` et le dossier `docs/` : vision, architecture, sécurité, conventions, 161 exigences numérotées, matrice des droits, deux chartes graphiques.
- Décisions prises avec le porteur du projet :
  - D-014 : pile technique confirmée ;
  - D-015 : authentification maison ;
  - D-016 : PostgreSQL natif sous Windows pour le développement ;
  - D-017 : charte Restaurant (texte encre sur le doré, Plus Jakarta Sans, pastille encre) ;
  - D-018 : le Restaurant passe avant la landing page et le socle serveur.

**Bloque encore**
- Le cahier des charges v1.0 n'est **pas signé** (D-013) : les exigences peuvent encore bouger.
- Les questions ouvertes sont listées plus bas ; plusieurs bloquent des écrans du Restaurant.

---

## Étape 2 : initialisation

**Fait**
- Next.js 16.4, React 19.3, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Tailwind CSS v4, pnpm 12.
- ESLint, Prettier, Vitest, dossier `src/`.
- Utilitaires partagés :
  - `money.ts` : entiers en unité minimale, formatage `fr-CD` ;
  - `dates.ts` : fuseau Africa/Lubumbashi ;
  - `ids.ts` : UUIDv7 ;
  - `errors.ts` : erreurs métier typées.

**Bloque encore**
- **Stylelint** (interdiction des couleurs littérales hors des tokens) n'est pas installé.
- **Playwright** (tests de bout en bout, captures, accessibilité axe) n'est pas installé.
- Pas d'**intégration continue** (GitHub Actions), recommandée par D-Q22.

---

## Étape 3 : design system et thèmes

**Fait**
- Trois couches de tokens (`src/styles/`), deux chartes (générale et Restaurant), chacune en clair et en sombre.
- `ThemeProvider` (next-themes, clé `optima:theme`, mode système par défaut, sans flash au chargement), `ThemeSwitcher`, `ModuleScope` (la charte suit aussi les panneaux et les dialogues).
- Composants partagés : `Button`, `IconButton`, `Card`, `Badge`, `Kpi`, `Sheet`, `Tabs`, `Field`, `EmptyState`, `Avatar`, `AreaChart` (avec infobulle au clavier et tableau des données).
- **Écart documenté** : le mapping Tailwind proposé au départ créait des variables cycliques. Il est remplacé ; voir `docs/DESIGN_SYSTEM.md` § 2.5.

**Bloque encore**
- **D-Q11** : logo OPTIMA et confirmation du bleu nuit. Un logotype textuel provisoire est utilisé.
- Les contrastes du thème sombre sont **[PROPOSÉ]** et n'ont pas été mesurés automatiquement, faute de Playwright et d'axe.

---

## Étape 4 : module Restaurant, interface locale

**Fait**
- **Coquille responsive** :
  - barre latérale à partir de 1024 px ;
  - menu en tiroir et barre d'onglets en bas sur téléphone ;
  - état de synchronisation ;
  - bandeau « Données de démonstration » avec bouton de réinitialisation.
- **Tableau de bord** : ventes par heure, montant facturé, panier moyen, commandes par statut, points de service, serveurs, alerte « stock du matin ».
- **Commandes** : tableau sur ordinateur, cartes sur téléphone, filtres, recherche, détail avec suivi « en préparation / prête / servie » et réimpression.
- **Prise de commande** :
  - table ou vente à emporter ;
  - menus Boissons et Nourriture, les plus vendus d'abord ;
  - panier réparti par point de service ;
  - **une facture d'avance numérotée par poste** (`FAC-2026-D01-000013`), imprimable et toujours en clair.
- **Menus** : cartes, disponibilité du jour, « prix à fixer », ajout d'un élément en panneau latéral.
- Logique métier pure et testée (`src/modules/restaurant/domain/`) : répartition, disponibilité, numérotation, journée d'exploitation, écarts de clôture.
- Base locale **IndexedDB** (Dexie) avec file d'opérations (outbox) : chaque écriture crée une opération UUIDv7.
- Vérifié à 360, 768 et 1280 px, en clair et en sombre.

**Bloque encore**
- **Données fictives** : prix, prénoms et boissons. Seuls les plats viennent de l'équipe (D-007).
- **Encaissement** impossible : **D-Q03** (qui reçoit l'argent) et **D-Q04** (paiement avant ou après le repas).
- **Livraison** désactivée : **D-Q07**.
- **Accompagnements** (frites, foufou…) vendus seuls pour l'instant : **D-Q06**.
- **Impression** : le navigateur seulement. Le matériel n'est pas connu (**D-Q13**), donc pas d'ESC/POS.
- **Hors connexion réel** : sans service worker (Serwist), un rechargement complet sans réseau échoue. Les données, elles, restent dans l'appareil.
- **Annulation et remise** (RG-CMD-02, RG-ENC-01) non faites.

---

## Étape 5 : stock du matin

**Fait**
- Écran par point de service. Les quantités sont pré-remplies avec la proposition du logiciel ; l'écart est affiché ligne par ligne.
- **Motif obligatoire** pour tout écart ou toute correction (RG-REQ-02), avec des motifs proposés en un geste.
- Saisies **en ajout seul** : une correction remplace la précédente sans l'effacer, et l'historique est visible.
- Le stock saisi limite ensuite les commandes (élément « épuisé »), et l'alerte du tableau de bord s'éteint.
- Seul le gérant ou le propriétaire peut saisir (permissions du module).

**Bloque encore**
- **D-Q14** (magasin et réquisitions). La formule prévue est « clôture de la veille + réquisition ». Faute de clôtures et de réquisitions, le logiciel propose le **reste théorique de la veille** (stock du matin moins ventes). Les apports du jour se justifient par le motif « Réquisition du jour ». Ce choix est isolé dans `domain/morning-stock.ts`.
- **D-Q10** (rythme des clôtures). La journée d'exploitation commence à 6 h par hypothèse (`domain/business-day.ts`).
- Le blocage de la clôture sans stock du matin (RG-REQ-03) attend l'écran Clôtures.

---

## Étape 6 : tables

**Fait**
- Grille des tables : libres ou occupées, total en cours, temps écoulé, serveurs, état de préparation.
- Touchez une table libre : la commande s'ouvre avec la table déjà choisie. Une table occupée reçoit des **commandes complémentaires** (EF-CMD-04).
- **Addition récapitulative** imprimable (EF-CMD-05).
- **Gestion des tables** par le gérant : ajouter, renommer, retirer du service, remettre en service. Rien n'est supprimé.

**Bloque encore**
- **D-Q04** : la table est **libérée à la main** tant que l'encaissement n'existe pas. Quand D-Q03/D-Q04 seront tranchées, elle se libérera au règlement de toutes ses factures.
- **D-Q05** : liste numérotée, sans plan de salle. À confirmer.

---

## Étape 7 : socle serveur

**Fait**
- **Base de données** (`prisma/`) :
  - schéma du noyau (établissements, modules, comptes, appartenances, sessions, appareils), de la synchronisation, de l'audit et du Restaurant ;
  - montants en BIGINT, identifiants UUIDv7 ;
  - migration de sécurité : **RLS** sur toutes les tables métier, **triggers d'ajout seul** (audit, synchronisation, stock du matin, libérations de table, lignes de facture), droits minimaux pour le rôle `optima_app` (aucune suppression de données métier).
- **Authentification maison** (D-015, `src/server/auth/`) :
  - Argon2id ;
  - sessions côté serveur (cookie `__Host-`, empreinte SHA-256 en base, rotation à l'élévation, expiration après inactivité) ;
  - blocage après 5 échecs en 15 minutes ;
  - mot de passe provisoire à changer à la première connexion ;
  - **double authentification TOTP du propriétaire**, avec secret chiffré (AES-256-GCM) et 8 codes de secours à usage unique.
- **Autorisation** : une seule fonction `authorize`, avec les six contrôles dans l'ordre du `CLAUDE.md` § 5.3. Registre des modules avec dépendances (RG-MOD-02).
- **Journal d'audit** en ajout seul, secrets masqués.
- **Synchronisation** :
  - appareils enregistrés (code D01…, secret montré une fois, révocables) ;
  - `POST /api/sync/push` : idempotent, droits revérifiés à l'envoi, **prix recalculés par le serveur**, répartition revérifiée, réponses `accepted`, `duplicate`, `rejected` ou `retry` ;
  - `GET /api/sync/pull` par curseur ;
  - limitation à 120 requêtes par minute et par appareil.
- **Écrans** :
  - connexion, nouveau mot de passe, activation et vérification de la double authentification ;
  - `/proprietaire` : liste des établissements, protégée ;
  - `/compte` : accueil du personnel.
- **Tests** : 36 tests d'intégration sur PostgreSQL 18 embarqué (RLS, IDOR, ajout seul, connexion, blocage, sessions, 2FA, matrice des droits, idempotence et refus de synchronisation).

**Bloque encore**
- La base locale et l'interface sont désormais reliées : voir l'étape 8.
- Les données de démonstration locales utilisent des identifiants non UUID (`item-primus`…) : elles **ne seront jamais synchronisées**, c'est voulu.
- **Espace propriétaire** réduit à une liste : tableau de bord consolidé, gestion des établissements, des modules et des gérants à faire.
- **En-têtes de sécurité et CSP avec nonce** pas encore posés (`CLAUDE.md` § 5.4).
- Limitation de débit **en mémoire** : à revoir si plusieurs instances tournent un jour.
- **À valider par vous** :
  - D-022 : lecture consolidée du propriétaire par drapeau RLS ;
  - D-023 : durées de session.
- **D-Q20** (hébergeur, domaine, administration du serveur) bloque la préproduction et la production.

---

## Étape 8 : relier l'interface au serveur

**Fait**
- **Base locale créée** sur le PostgreSQL du poste : base `optima`, rôles `optima_migrator` et `optima_app` (mots de passe aléatoires dans `.env.local`), migrations appliquées, seed exécuté. Les mots de passe provisoires des comptes de développement sont dans `.env.accounts.local` (non versionné). `scripts/db/setup-local.sql` accepte maintenant les mots de passe en variables (`-v`), pour une installation sans questions.
- **Appairage d'un appareil** : un gérant connecté ouvre `/e/<slug>/restaurant`, nomme l'appareil et l'enregistre. L'appareil reçoit son code (D01…) et son jeton, gardés dans sa base locale.
- **État initial** `GET /api/sync/bootstrap` : établissement, points de service, menu, tables, personnel actif, commandes, factures, stock du matin et libérations de table depuis la veille, curseur de départ. Uniquement l'établissement de l'appareil.
- **Utilisateurs de l'appareil** (EF-AUT-01, EF-AUT-05, RG-OFF-02) :
  - « Qui travaille ? » : chacun s'ajoute une fois avec son mot de passe, vérifié par le serveur (blocage après 5 échecs, audit, propriétaire refusé, mot de passe provisoire refusé) ;
  - puis il choisit un code PIN à 4 chiffres (PIN trivial refusé) ;
  - « Changer d'utilisateur » puis le PIN : deux gestes ;
  - 5 erreurs de PIN : verrouillage jusqu'au mot de passe ;
  - un gérant entré par PIN agit comme serveur ; ses droits de gérant valent 15 minutes après une saisie du mot de passe (« Actions de gérant »).
- **Client de synchronisation** (EF-OFF-01, 02, 04) :
  - envoi de la file par lots de 200 : immédiatement, toutes les 30 secondes, 3 secondes après chaque opération et au retour du réseau ;
  - réception des changements par curseur, appliqués dans la base locale ;
  - le serveur diffuse maintenant des enregistrements complets (commande avec ses lignes, ses prix recalculés, le nom du serveur et le code appareil) ;
  - bouton d'état : en attente, dernière synchronisation, « Synchroniser maintenant », liste des refus avec leur motif.
- **Appareil révoqué** (ENF-09) : refus à la synchronisation suivante, effacement de toutes les données locales, retour à l'écran d'appairage avec un message.
- **Vérification de bout en bout** dans le navigateur, contre la base locale :
  - connexion du gérant, changement du mot de passe provisoire, appairage (D01), choix du PIN ;
  - commande table 3 : `CMD-2026-D01-000001`, deux factures d'avance `FAC-2026-D01-000001` et `000002`, opération **acceptée** et visible dans PostgreSQL ;
  - indicateur « En ligne, tout est synchronisé » ;
  - ajout du serveur sur l'appareil avec son mot de passe provisoire : refusé avec le message demandant de le changer d'abord.
- **Tests** : PIN et utilisateurs de l'appareil, effacement, application des changements (unitaires) ; état initial, connexion d'un membre sur l'appareil, commande complète dans le pull (intégration).
- **Écran « Appareils »** (`/e/<slug>/appareils`, EF-CPT-04) :
  - réservé au gérant de l'établissement et au propriétaire après double authentification, contrôlé par `authorize` côté serveur ; lien depuis `/compte` (gérants) et `/proprietaire` ;
  - appareils en service et révoqués, dernière synchronisation (envoi **ou** réception), opérations refusées, signalement « Sans nouvelles » après 24 heures ;
  - révocation dans un panneau latéral : motifs proposés, motif obligatoire, rappel que les saisies postérieures à la dernière synchronisation n'arriveront plus, audit avec l'adresse IP ;
  - charte Restaurant quand le module est actif (D-017), vérifié à 360, 768 et 1280 px, en clair et en sombre.
- **Session web fermée après l'appairage** : sans cela, un serveur utilisant l'appareil partagé aurait pu ouvrir les écrans de gestion avec la session du gérant.
- **Vérifié dans le navigateur** : révocation de D01 (« Appareil perdu »), effacement de l'appareil et message de révocation, nouvel appairage en D02, puis redirection vers `/connexion` (session fermée).

**Bloque encore**
- **Hors connexion** :
  - l'ajout d'un utilisateur et la confirmation du mot de passe d'un gérant exigent le réseau ;
  - sans PWA (Serwist), un rechargement complet de la page sans réseau échoue ; les données restent dans l'appareil.
- **Jeton d'appareil dans IndexedDB** : la CSP stricte avec nonce (`CLAUDE.md` § 5.4) devient d'autant plus importante.
- **Layout du module** : coquille statique sans donnée ; tout passe par le jeton d'appareil, revérifié à chaque requête. Un contrôle serveur sera ajouté pour les écrans en ligne (rapports).
- **Utilisateur suspendu** entre deux synchronisations : ses opérations sont refusées, avec motif ; le marquage « pour revue » prévu par le `CLAUDE.md` § 5.1 reste à faire.
- **À valider par vous** : D-024 (PIN local en PBKDF2-SHA256 au lieu d'Argon2id, droits de gérant limités à 15 minutes après le mot de passe).

---

## Étape 9 : gestion du personnel

**Fait**
- **Écran « Équipe »** (`/e/<slug>/equipe`, EF-CPT-02), relié à « Appareils » par des onglets ; liens depuis `/compte` (gérants) et `/proprietaire` :
  - personnel en activité et suspendu : nom, identifiant, rôle et poste, dernière connexion, état (actif, mot de passe provisoire, suspendu) ;
  - tableau à partir de 1024 px, cartes en dessous ; vérifié à 360, 768 et 1280 px, en clair et en sombre, sous la charte Restaurant.
- **Création d'un compte** (EF-AUT-02) : nom affiché, e-mail ou téléphone, rôle, poste obligatoire pour un poste de préparation. Mot de passe provisoire lisible, montré une seule fois avec un bouton « Copier », changement obligatoire à la première connexion.
- **Gérer un membre** :
  - nom, rôle et poste ; un changement de rôle ferme ses sessions ;
  - réinitialisation du mot de passe en deux gestes (EF-AUT-04) ;
  - déconnexion forcée (EF-CPT-01) ;
  - suspension avec motif obligatoire et motifs proposés, puis réactivation (EF-CPT-05).
- **Qui gère qui** (`src/server/staff/rules.ts`, EF-CPT-03) : le gérant gère le personnel de son établissement, ni les gérants ni lui-même ; le propriétaire gère aussi les gérants.
- **Effet sur les appareils** : chaque création, modification, suspension et réactivation est diffusée (`staff_member`). Un membre suspendu disparaît des appareils, même s'il était l'utilisateur actif, et ne peut plus reprendre la main par son PIN. Un changement de rôle s'applique aussitôt à ses droits sur l'appareil. Un appareil éteint pendant la suspension fait le ménage à son prochain démarrage.
- **Une transaction par action** : compte, appartenance, diffusion et audit ensemble (CLAUDE.md § 3.7). Audit `core.staff.created`, `updated`, `password-reset`, `signed-out`, `suspended` (avec motif), `reactivated`, avec l'adresse IP.
- **Factorisation** : cadre commun des écrans de gestion (`_components/management-frame.tsx`), contrôle de session (`_lib/management.ts`) et contexte des Server Actions (`_lib/actions.ts`), partagés avec « Appareils ».
- **Tests** : règles (unitaires), application des changements de personnel sur l'appareil (unitaires), 9 tests d'intégration (droits, IDOR, identifiant déjà pris, poste d'un autre établissement, connexion avec le mot de passe provisoire, sessions fermées, diffusion, audit).
- **Vérifié dans le navigateur** : création d'un poste de préparation « Cuisine Test » (refus sans poste, puis mot de passe affiché), suspension (« Départ ») puis réactivation ; audit et diffusion contrôlés dans PostgreSQL.

**Bloque encore**
- **Droits ajustables** (remise maximale, accès aux rapports, EF-CPT-03) : à faire avec l'encaissement et les rapports.
- **Changement d'identifiant** (e-mail ou téléphone) d'un membre : non prévu dans cet écran.
- **Gestion des propriétaires** et RG-CPT-01 (le dernier propriétaire ne peut pas se retirer son rôle) : avec l'espace propriétaire.
- Les identifiants de développement sont rassemblés dans `ACCES.local.md`, à la racine, **non versionné**.

---

## Étape 10 : espace propriétaire

**Fait**
- **Vue d'ensemble** (`/proprietaire`, EF-PRO-01, 02, 04, 05) :
  - période au choix : aujourd'hui, 7 jours ou 30 jours, en journées d'exploitation (6 h à 6 h, HYPOTHÈSE D-Q10) ;
  - montant facturé au total (par devise, jamais de francs et de dollars additionnés) et par établissement, évolution par rapport à la période précédente, commandes, panier moyen ;
  - graphique d'évolution (par heure pour la journée, par jour sinon) ;
  - alertes : appareil sans synchronisation depuis 24 heures, opérations refusées dans la semaine, stock du matin non saisi, établissement suspendu ; chacune mène à l'écran où agir ;
  - personnel et appareils par établissement, dernière synchronisation ;
  - les indicateurs qui attendent d'autres écrans (marge, cash, manquants, stock, dépenses) sont **annoncés avec ce qu'ils attendent**, jamais remplacés par des zéros.
- **Établissements** (`/proprietaire/etablissements`) :
  - création (EF-ETB-01) : nom, adresse OPTIMA proposée à partir du nom, raison sociale, adresse, téléphone, type (Restaurant), devise de base figée (RG-ETB-01), fuseau ; points de service habituels en option ; modules par défaut du type ;
  - aperçu de l'en-tête imprimé, toujours en clair, avec les champs manquants (EF-ETB-02) ;
  - fiche : identité modifiable, modules activables d'un geste avec les dépendances dans les deux sens (RG-MOD-02), suspension avec motif et réactivation (EF-ETB-03) ; liens vers « Équipe » et « Appareils ».
- **Suspension sans perte** (D-025) : la synchronisation d'un établissement suspendu répond 403, pas 401. L'appareil garde ses données et ses opérations, qui partent à la réactivation ; seule une révocation efface un appareil. Les trois routes de synchronisation partagent ce contrôle (`src/server/sync/device-request.ts`).
- **Traçabilité** (RG-PRO-01) : chaque action du propriétaire est inscrite au journal de l'établissement concerné, rôle « owner ».
- **Code** : logique pure dans `src/modules/owner/` (périodes, synthèse des ventes, adresse, en-tête, schémas Zod) ; services dans `src/server/owner/` ; `requireOwner` pour les actions hors établissement ; dépendances et types d'établissement dans `src/modules/registry.ts`.
- **Tests** : 11 tests unitaires (périodes, synthèse, devises, adresse, en-tête, dépendances), 8 tests d'intégration (accès, création, adresse prise ou réservée, identité et journal, modules dans les deux sens, suspension et 403, vue d'ensemble).
- **Vérifié dans le navigateur** : première connexion du propriétaire (mot de passe, double authentification), vue d'ensemble avec la vraie commande du jour (9 500 FC) et l'alerte « stock du matin », création de « Restaurant Test Goma » avec aperçu de l'en-tête, activation de « Postes de préparation » (Restaurant alors verrouillé), suspension (« Travaux ») et réactivation ; journal contrôlé dans PostgreSQL ; 360, 768 et 1280 px, clair et sombre.

**Bloque encore**
- **Exports et suppression définitive** (EF-ETB-04, EF-ETB-05, RG-ETB-02) : attendent les tâches de fond (pg-boss).
- **Logo et couleur** de l'en-tête : attendent le stockage des fichiers (**D-Q23**).
- **Indicateurs financiers** (marge, cash, manquants, stock) : attendent l'encaissement et les clôtures (**D-Q03**, **D-Q04**, **D-Q10**) et le stock (**D-Q14**).
- **Journal d'audit consultable** (EF-AUD-02 à 04) : il est écrit partout, l'écran reste à faire.
- **À valider par vous** : D-025.

---

## Étape 11 : journal d'audit consultable

**Fait**
- **Deux écrans** :
  - `/e/<slug>/journal` : le gérant (permission `core.audit.read`) et le propriétaire, pour un établissement ; onglet « Journal » à côté d'« Équipe » et d'« Appareils » ;
  - `/proprietaire/audit` : tous les établissements, plus les événements hors établissement (connexions, mot de passe, double authentification).
- **Fil chronologique** (EF-AUD-02) : libellé français de l'action, domaine, auteur et rôle, appareil, établissement, motif ; « Détails » montre les changements « avant → après », l'adresse IP et la référence. Échecs et refus sont signalés par une étiquette.
- **Filtres** en formulaire GET (ils marchent sans JavaScript et se partagent par lien) : établissement, domaine, action, auteur, appareil, du… au… (dates locales de l'établissement). Les valeurs invalides sont ignorées, jamais transmises à la base.
- **Pagination** par curseur (identifiants UUIDv7, donc chronologiques), 50 entrées par page.
- **Export CSV** (EF-AUD-04, en partie) : lisible par Excel en français (« ; », BOM, CRLF), 10 000 entrées au plus. Une cellule qui commence par `=`, `+`, `-` ou `@` est neutralisée (injection de formules). L'export passe par une Server Action (aucune écriture par GET) et s'inscrit lui-même au journal : dans l'établissement concerné, ou au journal global pour un export de tous les établissements.
- **Défaut corrigé, révélé par le journal** : une connexion sur un appareil avec le bon mot de passe mais refusée (propriétaire, mot de passe provisoire, compte suspendu, autre établissement) était inscrite comme une **connexion réussie**. Elle l'est désormais comme « Connexion refusée sur un appareil », avec son motif et le rôle de la personne. Les entrées anciennes restent telles quelles : le journal ne se modifie pas (RG-AUD-01).
- **Utilitaires** : `zonedDayStart` (date locale vers UTC) et `toCsv` dans `src/shared/lib/`, avec leurs tests.
- **Tests** : catalogue et utilitaires (unitaires), 7 tests d'intégration (accès du gérant, du serveur et du propriétaire, journal global, filtres, valeurs invalides, pages sans doublon, export et neutralisation des formules, export audité) et 1 test qui reproduit le défaut de connexion.
- **Vérifié dans le navigateur** : journal du propriétaire filtré sur « Équipe », détails, export (3 entrées), journal de l'établissement sous la charte Restaurant ; 360 et 1280 px, clair et sombre.

**Bloque encore**
- **Exports Excel et PDF** : ExcelJS et Playwright (prévus par la pile, D-014) ne sont pas encore installés.
- Les **connexions web** du personnel sont au journal global (elles ne sont rattachées à aucun établissement) : le gérant ne les voit pas, le propriétaire si.
- Les actions de la caisse et des clôtures apparaîtront avec ces écrans.

---

## Étape 12 : menus selon les modules actifs

**Fait**
- **Les appareils connaissent les modules actifs** (EF-MOD-02) : la liste arrive avec l'état initial (`/api/sync/bootstrap`), puis chaque activation ou désactivation par le propriétaire est diffusée (entité `establishment_modules` du journal des changements).
- **Navigation** : chaque élément du menu déclare son module (`nav-items.ts`, « Livraisons » → module Livraison, le reste → Restaurant). Le menu latéral, le tiroir et la barre inférieure n'affichent que les modules actifs, sans rechargement.
- **Écrans** : une adresse d'un module désactivé affiche « Le module … est désactivé » avec un retour au tableau de bord. Si le module Restaurant lui-même est désactivé, l'appareil n'affiche plus que cet écran (sans menu) et garde toutes ses données.
- **Aucune perte** (RG-MOD-01, D-026) : une opération envoyée pour un module désactivé n'est plus refusée pour de bon ; le serveur répond « à réessayer », elle reste sur l'appareil et part à la réactivation.
- Tant qu'un appareil ne connaît pas la liste (première ouverture hors ligne), rien n'est masqué ; le serveur revérifie de toute façon chaque opération.
- **Tests** : navigation selon les modules (unitaires), mémorisation des modules sur l'appareil (unitaire), état initial, diffusion et opération mise en attente puis acceptée à la réactivation (intégration).
- **Vérifié dans le navigateur**, appareil D03 et espace propriétaire côte à côte : « Livraisons » absent puis présent dès l'activation du module, écran « Restaurant désactivé » (sans menu ni barre inférieure), puis retour à la normale à la réactivation ; état initial rétabli (Restaurant actif, Livraison inactif) ; 360 px, clair et sombre.

**Bloque encore**
- **Droits ajustables** par le gérant (remise maximale, accès aux rapports, EF-CPT-03).
- Les écrans des modules à venir (préparation, fiches recettes) déclareront leur module de la même façon en arrivant.
- **À valider par vous** : D-026.

---

## Décisions ouvertes et ce qu'elles bloquent

| Question | Bloque | Recommandation actuelle |
|---|---|---|
| D-Q03 : qui reçoit l'argent ? | Encaissement, clôtures, libération automatique des tables | Le serveur, qui reverse à la caisse du point de service |
| D-Q04 : paiement avant ou après le repas ? | Encaissement, impayés (RG-ENC-02) | À décider |
| D-Q06 : accompagnements seuls, inclus ou les deux ? | Structure des menus, fiches recettes | À décider |
| D-Q07 : livreurs, zones, frais | Module Livraison | À décider |
| D-Q10 : rythme des clôtures | Clôtures, journée d'exploitation (6 h en attendant) | Journée = du stock du matin à la clôture validée |
| D-Q13 : téléphones, imprimantes, Wi-Fi, électricité | Impression thermique, tests sur le matériel réel | À recenser sur place |
| D-Q14 : magasin et réquisitions | Réquisitions, formule exacte du stock du matin | À décider |
| D-Q11 : logo, couleur, police de la charte générale | Identité définitive | Logotype textuel, bleu nuit, Inter |
| D-Q15 : arrondi des prix en CDF, taux du dollar | Encaissement multidevise | Arrondi à 100 CDF, dollar au taux du jour |
| D-Q20 : hébergement, domaine, administrateur | Préproduction et production | VPS européen, préproduction séparée |
| D-Q26 : contenu de la landing page | Landing page complète | Vitrine sobre, non indexée |
| D-Q01, D-Q08, D-Q09, D-Q16, D-Q17, D-Q21 à D-Q25, D-Q31, D-Q32 | Points secondaires | Recommandations du registre appliquées par défaut |
| D-Q27 à D-Q30 | Phase 2 (boutique de gold detectors) | À traiter avant la phase 2 |
| D-022 à D-026 (proposées) | Rien, mais à valider | Voir `docs/DECISIONS.md` |

---

## Points d'attention techniques

- **Node.js 26** sur le poste : Prisma l'accepte avec un avertissement. Utilisez **Node.js 24 LTS** en production (D-020).
- **Prisma 7.10.1 est épinglé**, car l'étiquette « latest » pointe vers une version candidate (D-019). Le client est généré dans `src/generated/prisma` (non versionné) après chaque `pnpm install`.
- En développement, Next.js affiche des avertissements « instant navigation » sur les routes du Restaurant. Ils ne concernent que le mode développement ; le build passe.
- Le volet « Browser » de l'application de bureau, quand il est masqué, ne déclenche pas le rendu des pages. Ce n'est pas un défaut de l'application.

---

## Prochaines étapes recommandées

1. **Exports Excel et PDF** du journal et des rapports (ExcelJS, Playwright).
2. **Trancher D-Q03, D-Q04 et D-Q10**, puis encaissement et clôtures (le cœur de la « caisse défendable »).
3. **D-Q14**, puis réquisitions. **D-Q06**, puis fiches recettes.
4. **PWA hors connexion** (Serwist), CSP avec nonce, puis tests Playwright hors connexion et sur deux appareils.
5. **D-Q20**, puis préproduction.
