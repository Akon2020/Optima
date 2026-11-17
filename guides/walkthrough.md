# Walkthrough OPTIMA : ce qui est fait, ce qui bloque

> État au **7 novembre 2026**, branche `develop`.
> Ce fichier raconte le projet étape par étape : pour chacune, ce qui a été réalisé, comment c'est vérifié, et **ce qui bloque encore**. Il est mis à jour à la fin de chaque étape.
> Pour la suite du travail (de l'installation à la mise en production), voir [`guide.md`](./guide.md).

---

## Vue d'ensemble

| # | Étape | État | Commits |
|---|---|---|---|
| 1 | Analyse, spécifications et décisions | Fait | `1703006`, `5b2c30e` |
| 2 | Initialisation de l'outillage | Fait (Playwright le 15/11/2026, Stylelint le 16/11/2026) | `2ca6d7e` |
| 3 | Design system et thèmes | Fait | `b809a7e` |
| 4 | Module Restaurant, interface locale | Fait sur données de démonstration | `9c44090`, `9df9a5b`, `0b38c1b`, `6a41638` |
| 5 | Stock du matin | Fait, proposition simplifiée (D-Q14) | `e15882e`, `4c18be0` |
| 6 | Tables | Fait, libération manuelle (D-Q04) | `9e00932`, `48b4cb2` |
| 7 | Socle serveur | Fait | `91ca948`, `5614168`, `a9b4345`, `fb56335` |
| 8 | Relier l'interface au serveur | Fait : appairage, PIN, synchronisation, écran « Appareils ». Reste la PWA | `305ef80`, `74c5bfd`, `ceebded`, `711e749`, `e8850c1`, `2bef4be` |
| 9 | Gestion du personnel | Fait : écran « Équipe ». Restent les droits ajustables (EF-CPT-03) | `e9e9ef6`, `5cbe87b`, `4ff970d`, `5aaaa1d` |
| 10 | Espace propriétaire | Fait : vue d'ensemble, établissements, modules, suspension. Restent exports et suppression | `5f058f1`, `728d315`, `b26d45e` |
| 11 | Journal d'audit consultable | Fait : filtres, détail, export CSV. Restent Excel et PDF | `a35eb0f`, `be1919b`, `2ae73cb` |
| 12 | Menus selon les modules | Fait : menus et écrans des appareils suivent les modules actifs | `6a4acfe`, `9140150`, `a8985b6` |
| 13 | Exports Excel et PDF | Fait pour le journal ; briques prêtes pour les rapports | `4268b50`, `506b552`, `60736b6`, `7409ba5` |
| 14 | PWA hors connexion | Fait : installable, pages du Restaurant sans réseau | voir `git log` |

**En une phrase :** un appareil du restaurant s'appaire au serveur, chaque serveur y reprend la main par son code PIN, et les commandes, le stock du matin et les tables se synchronisent avec PostgreSQL. L'aperçu `/e/demo/restaurant` reste local.

**Vérifications au dernier commit :**
- `pnpm typecheck`, `pnpm lint` et `pnpm build` passent ;
- `pnpm test` : 136 tests unitaires passent ;
- `pnpm test:integration` : 77 tests d'intégration passent, sur PostgreSQL 18 embarqué ;
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
- ~~**Stylelint**~~ : fait à l'étape 29 (D-067).
- ~~**Playwright**~~ et ~~**intégration continue**~~ : faits le 15/11/2026 (D-061).

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
- **Hors connexion réel** : fait à l'étape 14 (PWA).
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
- ~~**En-têtes de sécurité et CSP avec nonce** pas encore posés~~ : faits à l'étape 15.
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

## Étape 13 : exports Excel et PDF

**Fait**
- **Trois formats** pour le journal d'audit (EF-AUD-04), sur les deux écrans : boutons « Excel », « PDF » et « CSV », qui exportent les entrées filtrées.
- **Excel** (ExcelJS 4.4.0) : titre, périmètre et filtres en tête, ligne d'en-tête figée aux couleurs de la charte, filtres automatiques, colonnes dimensionnées, mise en page A4 paysage. Les valeurs sont écrites comme du texte : une cellule « =… » ne devient jamais une formule.
- **PDF** (`playwright-core` 1.65.0) : A4 paysage, en-tête OPTIMA, lignes alternées, pied de page numéroté « Page 1 / 3 », toujours en clair. Rendu par un navigateur installé (Chrome en local, Chromium dans l'image Docker en production), sans téléchargement de navigateur.
- **Sécurité du rendu PDF** : contenu entièrement échappé, page sans JavaScript, hors ligne, toute requête bloquée ; deux rendus simultanés au plus ; 2 000 entrées au plus par PDF (10 000 pour Excel et CSV).
- **Performance** : un seul navigateur par processus, réutilisé et fermé après deux minutes d'inactivité (sous Windows, fermer Chrome prend plus de dix secondes : le faire à chaque export était inacceptable).
- **Briques réutilisables** (`src/server/exports/`) : document tabulaire imprimable, classeur, rendu PDF. Les rapports les utiliseront.
- Chaque export est inscrit au journal **avec son format**.
- **Tests** : document imprimable et échappement (unitaires) ; CSV, Excel relu par ExcelJS (titre, en-tête figé, aucune formule), PDF réel, format inconnu, export global (intégration). Le test PDF est sauté automatiquement sur une machine sans Chrome.
- **Test fragile corrigé** : le test de verrouillage du PIN (sept vérifications PBKDF2 à 210 000 itérations, lentes par conception) pouvait dépasser 5 secondes quand toute la suite tourne en parallèle ; il dispose maintenant de 15 secondes.
- **Vérifié dans le navigateur** : export Excel (8 Ko) et PDF (65 Ko, 7 s la première fois, lancement du navigateur compris) depuis le journal de l'établissement ; aperçu du PDF contrôlé ; boutons de 44 px sur téléphone ; 360 px et bureau, clair et sombre.

**Bloque encore**
- **Export complet d'un établissement** (EF-ETB-05) et **suppression** (EF-ETB-04) : demandent la file de tâches pg-boss.
- **Rapports** (EF-RAP) : à construire avec l'encaissement et les clôtures ; ils réutiliseront ces exports.
- **Production** : installer Chromium et une police (DejaVu) dans l'image Docker, et poser `PDF_BROWSER_PATH` (voir `guide.md`, § 8.3 et 8.4).
- **À valider par vous** : D-027.

---

## Étape 14 : PWA hors connexion

**Fait**
- **Application installable** (EF-OFF-05) : manifeste (`/manifest.webmanifest`), icônes provisoires (un « O » blanc sur le bleu nuit, en attendant le logo D-Q11), ouverture sur `/ouvrir`, qui reprend le dernier établissement ouvert sur l'appareil.
- **Service worker Serwist** (D-028) :
  - fichiers statiques précachés au déploiement (54 fichiers, 1,7 Mo, téléchargés une fois en arrière-plan) ;
  - pages du Restaurant : réseau d'abord, copie locale sans réseau ; à chaque ouverture du Restaurant, l'appareil fait préparer les pages de son menu (modules actifs) ;
  - **jamais en cache** : l'API (dont la synchronisation), l'espace propriétaire, la connexion, le compte, l'équipe, les appareils, le journal ; hors connexion, ils sont remplacés par la page « Pas de connexion » ;
  - message de préparation contrôlé : seules des adresses relatives de pages Restaurant sont acceptées.
- **Construction** : `pnpm build` lance `next build`, puis `scripts/build-sw.mts` (esbuild et `@serwist/build`) qui écrit `public/sw.js`. `@serwist/turbopack` n'a pas pu être utilisé : son binaire natif `@swc/core` est bloqué par la politique de sécurité Windows du poste (je n'ai pas touché à cette politique).
- **Vérifié sur un serveur de production avec Chrome** (`pnpm check:offline`) : service worker actif, 9 pages du menu préparées ; réseau coupé : rechargement du tableau de bord, page Tables jamais ouverte, prise de commande avec son menu, `/proprietaire` remplacé par « Pas de connexion » ; `/ouvrir` hors ligne rouvre le restaurant ; aucune réponse d'API ni page d'administration dans les caches.
- **Tests** : règles de cache (unitaires) ; page « Pas de connexion » contrôlée à 360 et 1280 px, en clair et en sombre.

**Bloque encore**
- **Logo définitif** (D-Q11) pour les icônes.
- **Tests Playwright de bout en bout** (`@playwright/test`, hors connexion et deux appareils) : `pnpm check:offline` en tient lieu pour l'instant.
- ~~**CSP avec nonce**~~ : faite à l'étape 15, le service worker fonctionne avec.
- **Production** : HTTPS obligatoire pour le service worker (Caddy) ; `public/sw.js` doit être produit par `pnpm build` avant la copie dans l'image Docker.
- **À valider par vous** : D-028.

---

## Étape 15 : CSP avec nonce et en-têtes de sécurité

**Fait**
- **Politique de contenu (CSP) avec nonce** (`CLAUDE.md` § 5.4, D-029) : le proxy Next.js (`src/proxy.ts`) tire un nonce neuf de 128 bits à chaque page et pose la politique. Next.js ajoute le nonce à tous ses scripts ; le script anti-flash du thème le reçoit du layout racine.
  - aucun script en ligne ni `eval` en production, rien chargé d'une autre origine, cadres et objets interdits, formulaires et requêtes vers l'application seulement ;
  - en développement seulement : `eval` et styles en ligne, nécessaires aux outils de React.
- **En-têtes fixes** sur toutes les réponses (`next.config.ts`) : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (caméra, USB et Bluetooth pour la seule origine de l'application), `Cross-Origin-Opener-Policy` ; **HSTS seulement en HTTPS** (`APP_ORIGIN`).
- **Rendu à chaque requête** : une page préconstruite ne peut pas porter le nonce de la requête. Le layout racine lit les en-têtes et désactive la validation des coquilles statiques (`instant = false`).
- **Zod sans `eval`** : Zod 4 sondait `Function("")` au premier schéma, ce qui violait la CSP sur les pages Restaurant. `src/shared/lib/zod-config.ts` le désactive ; chaque fichier de schémas l'importe en premier.
- **Vérifié sur un serveur de production avec Chrome** (`pnpm check:csp`) : 7 pages (accueil, connexion, « Pas de connexion », tableau de bord, prise de commande et tables du Restaurant, `/proprietaire` redirigé), **aucune violation**, chaque script du HTML (20 à 30 par page) porte le nonce, le JavaScript s'exécute. Le nonce change à chaque requête. `pnpm check:offline` passe toujours avec la CSP.
- **Tests** : 5 tests unitaires de la politique et des en-têtes (141 tests unitaires et 77 d'intégration au total, tous passés).

**Bloque encore**
- **Rapidité du premier affichage** : sans coquilles statiques, chaque page est calculée par le serveur. À mesurer en 3G (ENF-02) quand l'hébergement sera choisi (D-Q20).
- **À valider par vous** : D-029.

---

## Étape 16 : réponses aux questions ouvertes (14/11/2026)

Le porteur du projet a répondu aux questions D-Q01 à D-Q32. Les réponses sont consignées comme décisions **D-030 à D-054** dans `docs/DECISIONS.md` ; `CLAUDE.md`, les spécifications, la landing page et `guide.md` ont été mis à jour. L'essentiel :

- **Encaissement débloqué** : le serveur reçoit l'argent la plupart du temps (D-032), le client paie le plus souvent à la fin du repas (D-033), prix arrondis à 100 CDF et dollar au taux du jour (D-042), crédit sur accord du gérant (D-037).
- **Clôtures débloquées** : la journée d'exploitation va du stock du matin à la clôture validée (D-039).
- **Menus** : éléments simples, avec options et formules (D-035).
- **Hébergement** : Vercel ou ifastnet, au choix du porteur du projet (D-045). Les deux s'écartent de la cible Docker sur VPS : PostgreSQL, tâches de fond, PDF et fichiers sont à vérifier avant le choix.
- **Double authentification** : jamais obligatoire pour les gérants (D-049), toujours pour le propriétaire (EF-AUT-03).

---

## Étape 17 : encaissement (15/11/2026)

**Fait**
- **Encaisser une commande ou l'addition d'une table** (EF-ENC-02, D-055) : bouton « Encaisser » dans le détail d'une commande, dans l'addition d'une table et sur le nouvel écran **Caisse**.
  - espèces en francs ou en dollars, Mobile Money (M-Pesa, Orange Money, Airtel Money) avec une référence facultative ;
  - montant proposé (le reste à payer, ou son équivalent en dollars), contre-valeur et **monnaie à rendre** en francs affichées avant de valider ;
  - paiement partiel possible : le reste à payer se met à jour ;
  - le paiement qui solde l'addition d'une table propose de la libérer (D-033) ; un client qui a payé d'avance peut rester.
- **Taux du dollar** (EF-PRX-05, D-042) : le gérant saisit « 1 $ = X FC » sur l'écran Caisse ; le taux n'est jamais modifié, un nouveau s'ajoute ; un taux d'un jour précédent déclenche un avertissement.
- **Écran Caisse** (`/restaurant/caisse`, aussi dans la barre inférieure du téléphone) : encaissé du jour, reste à encaisser, commandes à encaisser, **argent en main** par mode de paiement (EF-ENC-04 ; monnaie rendue déduite), paiements du jour. Un serveur ne voit que ses ventes et son argent ; le gérant voit toute l'équipe.
- **Serveur** : tables `payments`, `payment_allocations` et `exchange_rates` (migration `20261114000001_payments`), isolées par établissement (RLS) et en ajout seul. Le serveur relit le taux, recalcule la contre-valeur, vérifie la monnaie et les affectations, refuse l'encaissement d'une vente d'un autre serveur, et inscrit au journal un trop-perçu (même facture encaissée deux fois hors connexion).
- **Correction** : un changement de personnel reçu par un appareil (renommage, suspension) faisait échouer la synchronisation, faute d'avoir ouvert la transaction sur les bonnes tables. Un test reproduit le cas.
- **Démonstration** : taux du jour et paiements des commandes anciennes.
- **Vérifié** : dans Chrome, écran Caisse à 360, 768 et 1280 px, en clair et en sombre, sans débordement ; encaissement de 50 $ sur 53 000 FC (89 500 FC à rendre) ; addition d'une table avec son bouton « Encaisser ».
- **Tests** : 164 tests unitaires (règles de paiement, conversions, dépôt local, réception des changements) et 85 tests d'intégration (dont 8 sur l'encaissement : taux, droits, conversion, concordance, trop-perçu, ajout seul, isolation).

**Bloque encore**
- **Crédit** (EF-ENC-03, D-037) : demande les fiches clients (D-043).
- **Remises** (RG-ENC-01) et **annulation d'un paiement** : avec la validation du gérant.
- **Impayés à la clôture** (RG-ENC-02) : avec les clôtures (D-039), prochaine étape.
- **À valider par vous** : D-055 (notamment : monnaie rendue au centime près, pas de carte au restaurant).

---

## Étape 18 : clôtures de service (15/11/2026)

**Fait** (D-056)
- **Écran Clôtures** (`/restaurant/clotures`, aussi le bouton « Clôturer mon service ») en trois onglets :
  - **Ma caisse** : l'attendu par mode de paiement (espèces en francs, en dollars, Mobile Money), le compté, l'écart affiché en direct puis figé, un commentaire exigé s'il n'est pas nul ; la part de chaque point de service à reverser ; les factures encore impayées à son nom (RG-ENC-02) ;
  - **Stock** (gérant) : pour chaque point de service, stock du matin, vendu, attendu, sorties déclarées avec un motif (casse, perte, repas du personnel, offert), compté, écart ; un recomptage remplace le précédent tant que la journée est ouverte ;
  - **Journée** : ce qui manque encore, nommé (stock du matin, comptages, caisses non déclarées, opérations à envoyer), les caisses déclarées, la validation par le gérant, les journées validées et leur **rapport** imprimable ou en PDF.
- **Serveur** : migration `20261115000001_closings` (tables `cash_closings`, `cash_closing_payments`, `stock_counts`, `day_closings`, en ajout seul et isolées par établissement). Le serveur recalcule l'attendu, la part des points de service, les impayés, le stock du matin et les ventes ; un paiement n'entre que dans une clôture ; une journée validée ne reçoit plus rien.
- **RG-CLO-03** : chaque appareil signale à chaque réception le nombre d'opérations qu'il n'a pas encore envoyées ; la validation est refusée tant qu'un appareil en signale.
- **Journée suivante** : ce qui suit une validation appartient au lendemain (D-039) ; le stock compté devient la proposition du stock du matin du lendemain (EF-REQ-04).
- **Démonstration** : la veille est clôturée de bout en bout (une caisse avec un manquant expliqué, une casse déclarée), avec son rapport.
- **Vérifié** dans Chrome : comptage enregistré, rapport de la veille, validation refusée avec son motif ; 360, 768 et 1280 px, clair et sombre, sans débordement ni erreur.
- **Tests** : 184 tests unitaires et 92 tests d'intégration (dont 7 sur les clôtures : comptage réservé au gérant, attendu recalculé, commentaire exigé, paiement déjà clôturé, appareil en attente, journée figée, isolation).

**Bloque encore**
- **Espace propriétaire** : les clôtures n'y remontent pas encore (cash attendu, déclaré, manquants : EF-CLO-04, EF-PRO-01).
- **Clôture de période** (EF-CLO-05) et **écritures d'ajustement** (RG-CLO-02).
- **Réquisitions** (D-Q14) : le stock attendu les compte pour zéro.
- **Base locale** : appliquer la migration (`pnpm db:migrate`).
- **À valider par vous** : D-056.

---

## Étape 19 : clôtures dans l'espace propriétaire (15/11/2026)

**Fait** (D-057)
- **Vue d'ensemble** (`/proprietaire`) : nouvelle carte « Caisse » avec, par devise et pour la période choisie, le cash attendu, le cash déclaré et les manquants ; la liste des **manquants nommés** (personne, établissement, journée, commentaire) ; sur chaque établissement, le cash déclaré face à l'attendu et la dernière journée validée.
- **Alertes** : journée passée avec des ventes et non validée (sur 7 jours, même en vue « Aujourd'hui ») ; manquant de caisse.
- **Tests** : règles de calcul (unitaires) ; vue d'ensemble avec une clôture réelle : attendu, déclaré, manquant nommé, alerte levée après validation (intégration). 189 tests unitaires et 93 tests d'intégration au total.
- **Vérifié** dans Chrome, connecté comme propriétaire (double authentification) : 360, 768 et 1280 px, clair et sombre, sans débordement ni erreur. La base locale n'ayant pas encore de clôture, seuls les états vides y sont visibles ; les montants sont couverts par le test d'intégration.

**Bloque encore**
- **Clôture de période** (EF-CLO-05) et **écritures d'ajustement** (RG-CLO-02).
- **À valider par vous** : D-057.

---

## Étape 20 : annulations et remises (15/11/2026)

**Fait** (D-058)
- **Demande** depuis le détail d'une commande : « Demander l'annulation » ou « Demander une remise » (montant en francs, au plus le reste à payer), avec un motif obligatoire. Un serveur ne demande que sur ses commandes ; une seule demande en attente par commande.
- **Validation** : carte « Demandes à valider » en tête de l'écran Commandes, sur tout appareil du gérant ; « Valider » ou « Refuser » (refus expliqué au serveur). Le gérant qui agit lui-même valide dans le même geste.
- **Effets** : une annulation garde les numéros de facture, marque « annulée » et rétablit le stock du jour ; une remise est répartie entre les factures et réduit le reste à payer (l'addition l'affiche). Une facture encaissée ne s'annule pas ; une journée validée ne se modifie plus.
- **Serveur** : migration `20261115000002_adjustments` (colonne de remise sur les factures, tables `adjustment_requests` et `adjustment_decisions` en ajout seul, RLS). Le serveur refait les contrôles et trace demandes, validations et refus au journal d'audit. Le statut de paiement tient compte de la remise.
- **Démonstration** : une demande d'annulation d'un serveur attend le gérant.
- **Vérifié** dans Chrome : demande validée depuis la carte (commande « Annulée »), remise de 1 000 FC sur 4 500 FC (« Encaisser 3 500 FC »), 360 et 1280 px, clair et sombre, sans débordement ni erreur.
- **Tests** : 200 tests unitaires et 99 tests d'intégration (dont 6 sur les annulations et remises : demande en double, droits du serveur, facture encaissée, refus sans motif, répartition de la remise, ajout seul et isolation).
- **Correction** d'un test fragile (ordre des factures créées dans la même milliseconde).

**Bloque encore**
- **Plafond de remise par rôle** (RG-VTE-01) : avec le réglage des droits du personnel (EF-CPT-03).
- **Remboursement** d'une facture encaissée, **transfert** d'une commande entre serveurs (RG-CMD-03).
- **Base locale** : appliquer la migration (`pnpm db:migrate`).
- **À valider par vous** : D-058.

---

## Étape 21 : vente à crédit et dettes clients (15/11/2026)

**Fait** (D-059)
- **Vente à crédit** depuis le détail d'une commande : « Demander un crédit » (serveur) ou « Vendre à crédit » (gérant). On choisit le client (recherche par nom ou téléphone) ou on crée sa fiche (nom et téléphone exigés, EF-ENC-03), avec un motif. La demande suit le circuit des annulations et remises : le gérant la valide.
- **Effet** : le reste à payer devient la dette du client ; les factures s'affichent « À crédit » et ne sont plus des impayés du serveur à la clôture (RG-ENC-02).
- **Plafond** facultatif par client, fixé par le gérant (D-037) : un crédit qui le dépasserait est refusé.
- **Écran Clients** (`/restaurant/clients`) : encours total, clients débiteurs, dettes avec date, ancienneté (EF-TRE-03), montant mis à crédit et reste ; « Encaisser » ouvre l'encaissement habituel (partiel possible, espèces, dollars, Mobile Money).
- **Serveur** : migration `20261115000003_credit` (table `customers` avec RLS, colonnes de crédit sur les factures, client sur les demandes). Contrôles refaits (client, plafond, commande déjà à crédit), audit des fiches, des plafonds et des crédits accordés. L'état initial des appareils porte les clients et les dettes ouvertes, même anciennes.
- **Démonstration** : Maman Rose doit la dernière commande de la veille ; Papa Jean n'a pas de dette.
- **Vérifié** dans Chrome : remboursement de 5 000 FC (14 500 → 9 500 FC), crédit d'une nouvelle commande pour Papa Jean (« À crédit », 4 500 FC dus « aujourd'hui »), 360 et 768 px, clair et sombre, sans débordement ni erreur.
- **Tests** : 208 tests unitaires et 103 tests d'intégration (dont 4 sur le crédit : fiches, plafond, conversion, remboursement, état initial, isolation).

**Bloque encore**
- **Dettes dans l'espace propriétaire** (EF-PRO-01) et **échéancier** (D-052, phase 2).
- **Base locale** : appliquer les migrations `20261115000002_adjustments` et `20261115000003_credit` (`pnpm db:migrate`).
- **À valider par vous** : D-059.

---

## Étape 22 : menus avec options et formules (15/11/2026)

**Fait** (D-060)
- **Options** : le gérant ajoute à un élément des groupes d'options (« Préparation : grillé ou frit », « Suppléments »), obligatoires ou non, à choix unique ou multiple, avec un supplément facultatif (écran Menus, détail de l'élément, « Gérer les options »).
- **Prise de commande** : un appui sur un élément à options ouvre le choix des options ; le bouton affiche le prix, supplément compris. Le même plat avec des options différentes fait deux lignes du panier.
- **Formules** : « Ajouter un élément », type « Formule » : nom, éléments (2 à 8), prix. Commandée, la formule part en une ligne par élément, à son poste, avec sa part du prix (au prorata, par centaines de francs) ; elle est limitée par son élément le plus rare.
- **Factures d'avance** : les options et le nom de la formule sont imprimés sous chaque ligne ; l'addition regroupe les éléments d'une formule sur une ligne.
- **Serveur** : migration `20261115000004_menu_options` (colonnes `kind`, `components`, `option_groups` des éléments ; options et formule des lignes de facture). Prix, suppléments et parts recalculés ; une vente hors connexion n'est pas refusée si les options ont changé entre-temps ; changements d'options audités.
- **Démonstration** : tilapia grillé ou frit, avec suppléments ; « Formule porc » (porc, foufou, Primus) à 16 000 FC. Données fictives.
- **Vérifié** dans le navigateur intégré : supplément de 500 FC ajouté à « Frit » ; commande tilapia frit + bananes plantains (17 500 FC) et formule porc (parts 11 000 + 1 800 + 3 200 FC) ; création d'une formule ; 375, 768 et 1280 px, clair et sombre, sans débordement.
- **Tests** : 219 tests unitaires et 109 tests d'intégration (dont 6 sur les options et formules : droits, devise, suppléments, vente hors connexion, isolation des composants, répartition, état initial).

**Bloque encore**
- **D-Q33** : une option consomme-t-elle du stock ? Aujourd'hui, non (hypothèse).
- **Vrai menu** : liste des plats à options et des formules à fournir par le restaurant (D-035).
- **Base locale** : appliquer les migrations `20261115000002_adjustments`, `20261115000003_credit` et `20261115000004_menu_options` (`pnpm db:migrate`).
- **À valider par vous** : D-060.

---

## Étape 23 : tests de bout en bout et intégration continue (15/11/2026)

**Fait** (D-061)
- **Playwright** (`pnpm test:e2e`, `tests/e2e/`), sur le build de production et le Chrome installé : 21 tests.
  - Parcours P2 à 360 px : commande à table avec options et formule, deux factures d'avance dont les totaux font celui de la commande ; commande à emporter encaissée en espèces.
  - Hors connexion : rechargement sans réseau, page Tables, commande enregistrée en moins de 2 secondes (ENF-01), page « Pas de connexion » pour l'espace propriétaire, aucune réponse d'API en cache.
  - Sécurité : CSP avec nonce neuf à chaque requête, chaque script porte le nonce, aucune violation, en-têtes ; espaces connectés renvoyés vers la connexion.
  - Thèmes : choix appliqué sur `<html>`, retenu d'une page à l'autre.
  - Accessibilité : contrôle axe (WCAG 2.2 AA) de l'accueil, de la connexion et de trois écrans du Restaurant, en clair et en sombre, capture jointe au rapport.
- **Corrections de contraste** trouvées par axe : texte secondaire du Restaurant, rouge d'état, logotype en sombre (`--color-brand-text`).
- **Intégration continue** (`.github/workflows/ci.yml`) : typage, lint, format, tests unitaires et d'intégration, build, bout en bout, audit.
- **Audit** : zod 4.6.5 (faille élevée), embarqué par Serwist, remplacé par 4.6.7.
- **Remarque** : l'antivirus du poste (inspection du trafic) injecte son propre script dans les pages HTTP. Le test CSP lit donc le HTML hors du navigateur ; ce script n'existe pas en production (HTTPS) ni dans la CI.

**Bloque encore**
- **Parcours avec la base** (connexion, appairage, P1, P5 avec validation, P6, deux appareils synchronisés) : il faut une base de test préparée, avec un PostgreSQL de service dans la CI.
- **Première exécution sur GitHub** : à vérifier dans l'onglet « Actions » après ce push.
- **À valider par vous** : D-061.

---

## Étape 24 : parcours de bout en bout avec le serveur (15/11/2026)

**Fait** (D-062)
- **Base dédiée `optima_e2e`** (`scripts/db/setup-e2e.sql`, créée une fois) : à chaque `pnpm test:e2e`, elle est migrée, vidée, puis remplie d'un établissement « Restaurant E2E » et de trois comptes de test (propriétaire avec TOTP, gérante, serveur) aux mots de passe générés, gardés dans `.e2e/accounts.json` (non versionné). Le serveur des tests est toujours lancé par Playwright, branché sur cette base : jamais sur `optima`.
- **Quatre parcours** (`tests/e2e/server.spec.ts`) :
  - mot de passe faux refusé, bon mot de passe accepté ;
  - deux appareils : la gérante appaire un téléphone, le serveur s'y connecte par mot de passe puis choisit son PIN et prend une commande ; une tablette appairée reçoit la commande, la gérante l'encaisse ; après synchronisation, le téléphone la voit « Payée » ;
  - le propriétaire entre avec son code TOTP et voit l'établissement et la vente de 7 000 FC ;
  - la gérante voit les deux appareils appairés.
- **CI** : PostgreSQL 18 jetable, rôles et base créés par les mêmes scripts, mots de passe générés et masqués dans les journaux.
- **Accessibilité** : au format téléphone, le bouton de synchronisation ne s'annonçait que « 0 » ; il dit maintenant l'état (« En ligne, tout est synchronisé »).
- **Tests** : 25 tests de bout en bout, stables sur trois lancements ; 219 unitaires, 109 d'intégration.

**Ajouté ensuite (même jour)**
- **Une journée complète** sur les deux appareils : stock du matin saisi par la gérante (P1) et reçu par le téléphone (« 24 en stock »), commande et encaissement, puis déclaration de caisse, comptage du stock des deux postes sans écart et **validation de la journée** (P5).
- **Erreur corrigée** : à chaque connexion, le serveur journalisait « Route "/compte" : Next.js encountered the unstable value `new Date()` while prerendering ». `getCurrentSession` appelle désormais `await connection()` avant de lire l'heure, comme les autres espaces.
- **Contrôle ajouté** : un lancement de `pnpm test:e2e` échoue si le serveur journalise une erreur de rendu de Next.js (vérifié : il échoue avec l'ancien build, passe avec la correction).
- **Tests** : 28 tests de bout en bout (7 avec le serveur), stables sur deux lancements en mode CI.

**Bloque encore**
- **À valider par vous** : D-062.

---

## Étape 25 : dettes clients dans l'espace propriétaire (15/11/2026)

**Fait** (D-063)
- **Carte « Dettes clients »** de la vue d'ensemble : encours par devise, nombre de clients débiteurs, et les cinq plus gros débiteurs (nom, établissement, ancienneté, reste). C'est l'état à cet instant, quelle que soit la période.
- **Fiche de chaque établissement** : encours et nombre de débiteurs, sous la caisse.
- **Même calcul que l'appareil** : crédit validé par le gérant, reste = factures − remise − remboursements ; lecture consolidée sous le drapeau du propriétaire.
- **Correction trouvée par le test de bout en bout** : une commande prise **après** la validation de la journée ne pouvait plus être annulée, remisée ni vendue à crédit (« journée validée »). Elle appartient à la journée suivante (D-039) : elle n'est désormais figée que si elle précède la validation, sur l'appareil comme sur le serveur.
- **Tests** : 3 tests unitaires des dettes, 1 test de la journée validée, 1 test d'intégration (encours de 4 000 FC après un remboursement partiel, débitrice nommée) ; parcours de bout en bout : vente à crédit à une nouvelle cliente après la clôture, visible du propriétaire.
- **Vérifié** : vue d'ensemble à 360, 768 et 1280 px, clair et sombre, sans débordement.

**Reste à savoir**
- **Comptage du stock après une validation anticipée** : si le gérant valide la journée avant la fin de ses 24 heures, les ventes faites entre la validation et le début de la journée suivante (6 h) ne figurent dans le comptage d'aucune journée (la caisse, elle, les compte bien). À traiter avec les réquisitions (D-Q14).
- **À valider par vous** : D-063 ; et à décider : un délai de paiement des dettes (et donc une alerte de retard) ?

---

## Étape 26 : clôture de période et écritures d'ajustement (15/11/2026)

**Fait** (D-064, choix confirmés par vous : dates libres, validation par le gérant, corrections de caisse et de stock, bénéfice et dépenses « en attente »)
- **Écran « Clôtures » en ligne** (`/e/<slug>/clotures`), pour le gérant et le propriétaire : lien depuis l'écran Clôtures de l'appareil (« Périodes et corrections ») et depuis la fiche de l'établissement dans l'espace propriétaire.
- **Clôturer une période** : choisir la première et la dernière journée, voir le résumé, puis clôturer. Toutes les journées actives doivent être validées ; pas de chevauchement. Le résumé est **figé** : ventes, cash attendu et déclaré, écart **par personne** (manquants nommés), corrections, écarts de stock, sorties déclarées, remises, annulations, dettes clients ; bénéfice et dépenses annoncés « en attente ».
- **Corriger une journée validée** : caisse (argent retrouvé ou manquant constaté, attribué à une personne) ou stock (élément en plus ou en moins), avec un motif. La clôture d'origine reste telle quelle ; la correction s'ajoute et figure au journal d'audit. Une période clôturée ne se corrige plus.
- **Serveur** : migration `20261115000005_period_closings` (tables `period_closings` et `closing_adjustments`, RLS, ajout seul, contraintes de forme). Tout est recalculé et vérifié par le serveur ; les cibles sont relues dans l'établissement.
- **Tests** : 5 tests unitaires (rattachement d'une vente à sa journée, règles de période et de correction, résumé), 3 tests d'intégration (droits, IDOR, période figée, chevauchement, ajout seul, isolation), parcours de bout en bout (correction de +500 FC puis clôture de la période).
- **Vérifié** : 360, 768 et 1280 px, clair et sombre, sans débordement ; l'écart reste visible sur téléphone.

**Bloque encore**
- **Base locale** : appliquer les migrations `20261115000002` à `20261115000005` (`pnpm db:migrate`).
- **À valider par vous** : la mise en œuvre de D-064 (notamment : une période clôturée est définitive).

---

## Étape 27 : rapports et exports (15/11/2026)

**Fait** (D-065)
- **Écran « Rapports »** en ligne (`/e/<slug>/rapports`) pour le gérant, le lecteur et le propriétaire ; dates libres, 7 dernières journées par défaut.
- **Ventes** : synthèse (ventes nettes, commandes, panier moyen, annulations), par point de service, par mode de paiement, 10 articles les plus et les moins vendus (y compris ceux qui ne se sont pas vendus), par serveur, par heure.
- **Écarts** de caisse par personne et de stock sur les journées validées, corrections comprises, et historique des clôtures.
- **Exports** audités : PDF avec l'en-tête de l'établissement, Excel (une feuille par tableau, montants additionnables), CSV des ventes ligne par ligne.
- **Marge et bénéfice** annoncés « en attente » des prix de revient (EF-RAP-02).
- **Droits** : nouvelle permission `reports.read` (gérant, lecteur) ; le serveur garde « ses ventes » sur son appareil.
- **Au passage** : sur téléphone, les onglets de gestion (cinq désormais) défilent sans élargir la page.
- **Tests** : 4 tests unitaires du rapport, 1 du document PDF en sections, 2 tests d'intégration (droits, module actif, chiffres, exports Excel et CSV audités), parcours de bout en bout (consultation, export Excel et PDF).
- **Vérifié** : 360, 768 et 1280 px, clair et sombre, sans débordement ; mise en page du PDF contrôlée.

**Bloque encore**
- **Marge** : prix de revient (achats, D-Q14).
- **À valider par vous** : D-065 (notamment : le serveur ne voit pas le rapport de l'établissement).

---

## Étape 28 : postes de préparation (16/11/2026)

**Fait** (D-066)
- **Écran du poste** (`/restaurant/preparation/cuisine`, `comptoir` ou `grillade`) : commandes à préparer, la plus ancienne d'abord, avec le temps écoulé, la table, le serveur, les éléments, options et formule, **sans aucun montant** ; bouton « Prête » ; liste « Prêtes, à servir » avec retour en préparation.
- **Le serveur est averti** : bandeau « N commandes prêtes à servir » sur son appareil, et une courte vibration à chaque nouvelle commande prête.
- **Épuisé** : le poste déclare un élément épuisé pour la journée ; il disparaît aussitôt de la prise de commande et revient le lendemain, ou par « Remettre en vente ».
- **Son poste seulement** : un préparateur ne voit et ne traite que son poste (celui fixé sur l'écran Équipe) ; le gérant tous ; le serveur le revérifie.
- **Réseau** : l'écran du poste se synchronise toutes les 5 s ; sans connexion, un bandeau rappelle que les factures imprimées font foi.
- **Serveur** : migration `20261116000001_sold_out` (colonne `sold_out_day`), opération `restaurant.menu-item.sold-out-set` auditée, contrôle du poste sur « prête » et « épuisé ».
- **Tests** : 5 unitaires, 2 sur l'appareil, 2 d'intégration (poste, épuisé, droits, audit, état initial), parcours de bout en bout (le poste marque prête, le téléphone du serveur affiche le bandeau, l'eau épuisée disparaît de la prise de commande puis revient), contrôle axe de l'écran en clair et en sombre.
- **Au passage** : les parcours avec le serveur attendent 30 s par vérification (au lieu de 15), pour rester fiables quand la machine est chargée.

**À faire de votre côté**
- **Activer le module « Postes de préparation »** pour le restaurant (espace propriétaire, fiche de l'établissement) et fixer le poste de chaque préparateur (écran Équipe).
- **Base locale** : appliquer les migrations `20261115000002` à `20261116000001` (`pnpm db:migrate`).
- **À valider par vous** : D-066.

---

## Étape 29 : Stylelint et couleurs littérales (16/11/2026)

**Fait** (D-067)
- **Stylelint 17.9.1** (`stylelint.config.mjs`) : dans les fichiers CSS, une couleur écrite en dur (`#1F3864`, `white`, `rgb(...)`) est refusée, sauf dans les tokens (`src/styles/tokens/`) et les chartes de module (`src/styles/modules/`).
- **Même règle pour le code** (ESLint) : une classe comme `bg-[#1F3864]` ou un style en ligne `color: "#fff"` est refusé dans les fichiers TypeScript.
- **`pnpm lint`** lance ESLint puis Stylelint (`pnpm lint:css` pour Stylelint seul) ; l'intégration continue le contrôle donc déjà.
- **Au passage** : les couleurs de l'impression passent par des tokens (`--print-paper`, `--print-ink`...) ; l'ancien `src/app/globals.css`, inutilisé, est supprimé.
- **Vérifié** : typage, lint, format, 240 tests unitaires, build de production (les tokens d'impression sont bien dans la feuille de style produite).

**À valider par vous** : D-067.

---

## Étape 30 : landing page (17/11/2026)

**Fait** (D-068, D-Q26 tranchée)
- **Vos réponses appliquées** : signature « Pilotez tous vos établissements », aucun contact publié, « Bukavu, RDC » en pied de page.
- **Bouton « Voir la démo »** dans l'en-tête, le hero, l'onglet Restaurant et l'appel final : il ouvre l'aperçu du Restaurant sur données de démonstration.
- **Mise en page** inspirée de vos maquettes, en bleu nuit : barre flottante en pilule, hero à bandes translucides avec un tableau de bord abstrait incliné, sections en panneaux arrondis, modules en onglets, sécurité en accordéon.
- **Animations sobres** : entrée du hero, courbe qui se trace, barres qui se remplissent, cartes qui flottent lentement, sections qui apparaissent au défilement. Rien ne défile tout seul ; tout s'arrête si le téléphone demande moins d'animations.
- **Pas repris des maquettes** : les pourcentages, témoignages et tarifs (aucun chiffre ni client inventé, D-012).
- **Mentions légales** (`/mentions-legales`) et **image de partage** générée.
- **Vérifié** : typage, lint, build ; 8 parcours de bout en bout de la landing page (titres, ancres, onglets, accordéon, menu mobile sans débordement à 360 px, thème retenu sans flash, mentions légales, image de partage) ; contrôle axe en clair et en sombre de l'accueil et des mentions légales ; captures à 360, 768 et 1280 px dans les deux thèmes.

**À valider par vous** : D-068 (mise en page et animations).

---

## Étape 31 : réquisitions (17/11/2026)

**Fait** (D-069, D-Q14 tranchée)
- **Vos réponses appliquées** : le magasin est tenu par le gérant ; les boissons passent aussi par une réquisition ; les quantités sont en bouteilles, plats et morceaux ; une réquisition le matin, plus des compléments.
- **Écran « Réquisitions »** (`/restaurant/requisitions`) : par point de service, « Nouvelle réquisition » et « Retour au magasin », liste du jour et totaux (matin, compléments, retours).
- **Réquisition du matin** (faite avant le stock du matin du poste) : elle entre dans la proposition du stock du matin. Le motif « Réquisition du jour » n'est plus nécessaire.
- **Complément** (fait après) : il s'ajoute au stock de la journée, l'élément redevient vendable, et au stock attendu de la clôture.
- **Retour au magasin** : motif obligatoire ; c'est aussi la façon de corriger une erreur, puisqu'une réquisition ne se modifie plus.
- **Serveur** : migration `20261117000001_requisitions` (table en ajout seul), numéro `REQ-…`, genre recalculé, audit, diffusion aux appareils ; le comptage de fin de service relit compléments et retours.
- **Démonstration** : la démo fait maintenant une réquisition du matin pour le comptoir et la cuisine, et un complément de Primus l'après-midi.
- **Tests** : 6 unitaires, 4 sur l'appareil, 4 d'intégration (droits, genre recalculé, retour, audit, ajout seul, comptage, isolation) ; parcours de bout en bout P1 (réquisition puis stock du matin pré-rempli) ; contrôle axe de l'écran en clair et en sombre.

**Pas encore fait** : le solde du magasin et la réception des achats en casiers (module Achats) ; l'impression d'un bon de réquisition (D-Q13).

**À faire de votre côté**
- **Base locale** : appliquer les migrations `20261115000002` à `20261117000001` (`pnpm db:migrate`).
- **À valider par vous** : D-069 (mise en œuvre).

---

## Décisions ouvertes et ce qu'elles bloquent

| Question | Bloque | Où en est-on |
|---|---|---|
| D-Q20 : Vercel ou ifastnet, domaine | Préproduction, production ; PDF et tâches de fond en production | Points à vérifier dans D-045 |
| D-Q13 : appareils et imprimantes | Impression thermique, tests sur le matériel réel | Wi-Fi Starlink confirmé (D-041), matériel à recenser |
| D-035 : plats avec options, formules | Saisie réelle des menus, fiches recettes | Modèle fait (D-060) ; liste à fournir par le restaurant |
| D-Q33 : une option consomme-t-elle du stock ? | Stock exact des accompagnements | Hypothèse : non |
| D-Q07 : zones et frais de livraison | Module Livraison | Livreurs du personnel (D-036), frais à décider |
| D-Q27, D-Q28, D-Q30, échéances de D-Q29 | Phase 2 (boutique de gold detectors) | À traiter avant la phase 2 |
| D-022 à D-029 et D-055 à D-069 (proposées) | Rien, mais à valider | Voir `docs/DECISIONS.md` |

---

## Points d'attention techniques

- **Node.js 26** sur le poste : Prisma l'accepte avec un avertissement. Utilisez **Node.js 24 LTS** en production (D-020).
- **Prisma 7.10.1 est épinglé**, car l'étiquette « latest » pointe vers une version candidate (D-019). Le client est généré dans `src/generated/prisma` (non versionné) après chaque `pnpm install`.
- En développement, Next.js affiche des avertissements « instant navigation » sur les routes du Restaurant. Ils ne concernent que le mode développement ; le build passe.
- Le volet « Browser » de l'application de bureau, quand il est masqué, ne déclenche pas le rendu des pages. Ce n'est pas un défaut de l'application.

---

## Prochaines étapes recommandées

1. **Fiches recettes** et module **Achats** (solde du magasin, casiers convertis en bouteilles).
2. **D-Q20** (choix de l'offre), puis préproduction.
3. **Vrai menu** du restaurant (D-035) et réponse à D-Q33.
4. **Mentions légales** : nommer l'hébergeur une fois D-Q20 tranchée.
