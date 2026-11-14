# Registre des décisions et des questions ouvertes

Ce registre est la **source de vérité** pour ce qui a été décidé (D-xxx) et ce qui reste à décider (D-Qxx). Il prime sur les statuts [PROPOSÉ] des autres documents.

**Règles d'usage :**

- Une question tranchée devient une décision : la réponse est notée sous la question, un numéro D-xxx lui est attribué en section 1, et les documents concernés sont mis à jour (`CLAUDE.md`, `SPECIFICATIONS.md`, `DESIGN_SYSTEM.md`).
- On ne supprime jamais une décision. On la **remplace** par une nouvelle qui la cite (« remplace D-004 »).
- Le niveau d'une question indique si l'on peut avancer sans réponse :
  - **Indispensable** : bloque l'étape indiquée ;
  - **Recommandation suffisante** : la recommandation s'applique par défaut jusqu'à réponse contraire.

---

## 1. Décisions confirmées

| N° | Date | Décision | Source |
|---|---|---|---|
| D-001 | 29/10/2026 | OPTIMA est un logiciel commercial **multi-établissements**. Chaque établissement a son administrateur (gérant) et ses utilisateurs. Un **super-administrateur** (le propriétaire) suit et accède à tous les établissements. | Porteur du projet |
| D-002 | 29/10/2026 | Le propriétaire dispose d'un **tableau de bord** pour suivre les établissements (statistiques, rapports, évolutions, achats, ventes, stocks, utilisateurs). Il peut **suspendre, supprimer et exporter** un établissement, **suspendre un administrateur**, et **ajouter ou désactiver des fonctionnalités par établissement**. | Porteur du projet |
| D-003 | 29/10/2026 | Premier établissement prévu : vente de **gold detectors**. Deuxième : un **restaurant**. Toutes les fonctionnalités observées dans **AkivioFlow** sont à inclure. | Porteur du projet |
| D-004 | 29/10/2026 | OPTIMA fonctionne **hors connexion avec synchronisation**. | Porteur du projet |
| D-005 | 29/10/2026 | OPTIMA est utilisé **uniquement pour les établissements du propriétaire** : pas de vente à des tiers, pas d'abonnements. | Porteur du projet |
| D-006 | 06/11/2026 | Priorité au **module Restaurant**. La partie administration (espace propriétaire) est le **point commun** de tous les modules. La boutique de gold detectors passe en phase 2. | Porteur du projet |
| D-007 | 06/11/2026 | Restaurant : **trois services et trois caisses** (boissons/comptoir ; cuisine : porc, poisson salé, tilapia, zingaro, sambaza, frites, bisamunyu, birayi, foufou ; grillade/muchoma : chèvre). **Réquisition quotidienne.** **Stock du matin saisi par le gérant** (boissons en bouteilles, nourriture en plats, chèvre en morceaux). **Facture d'avance imprimée par le serveur** et déposée au point de service. Utilisateurs : les serveurs. **Inventaire de caisse par comptage des souches** en fin de service. Deux menus (boissons, nourriture). Gestion complète : caisse, commandes cuisine, recettes, livraison, inventaire. | Équipe du restaurant, transmis le 06/11/2026 |
| D-008 | 07/11/2026 | La **charte graphique générale** du cahier des charges reste la charte principale : landing page, pages publiques et institutionnelles, interfaces communes, autres modules. | Porteur du projet |
| D-009 | 07/11/2026 | Les maquettes « Yum Slice » constituent la **charte du module Restaurant**, appliquée **exclusivement** à ce module, sans effet sur les autres. Le système doit permettre d'ajouter d'autres identités de module. | Porteur du projet |
| D-010 | 07/11/2026 | Thèmes **clair et sombre obligatoires dans tout le système** : mécanisme centralisé, sélecteur dans l'interface, choix conservé entre les sessions, thème système par défaut, prise en charge par chaque charte. | Porteur du projet |
| D-011 | 07/11/2026 | Développement sur la branche **`develop`**. Commits petits et réguliers, push après chaque commit cohérent. Jamais de push sur `main` ou `master`, jamais de force sans autorisation. **Aucune mention de Claude ou d'Anthropic dans les commits.** | Porteur du projet |
| D-012 | 07/11/2026 | Première réalisation d'interface : la **landing page**, en charte générale, avec les deux thèmes, **sans statistiques, témoignages, clients, certifications ni tarifs inventés**. | Porteur du projet |
| D-013 | 07/11/2026 | Le cahier des charges v1.0 (6 novembre 2026) sert de base aux spécifications. Il est soumis pour validation et pas encore signé. | Porteur du projet |
| D-014 | 07/11/2026 | **Pile technique confirmée** (répond à D-Q18) : celle du `CLAUDE.md` § 3.1. Le projet est initialisé avec Next.js 16.4.5, React 19.3, TypeScript, Tailwind CSS v4 et pnpm 12 (Node.js 26 en local). | Porteur du projet |
| D-015 | 07/11/2026 | **Authentification maison** (répond à D-Q19) : Argon2id, sessions en base (table `sessions`), TOTP pour le propriétaire, code PIN par appareil, sans bibliothèque d'authentification tierce. Conséquences : tout le code d'authentification est écrit et testé dans `src/server/auth/` ; les exigences du `CLAUDE.md` § 5.1 et 5.2 s'appliquent sans changement. | Porteur du projet |
| D-016 | 07/11/2026 | **PostgreSQL installé nativement sous Windows** pour le développement local (Docker n'est pas disponible sur le poste). L'URL de connexion est fournie par `DATABASE_URL` dans `.env.local`. Docker Compose reste prévu pour la préproduction, la production et l'intégration continue. | Porteur du projet |
| D-017 | 07/11/2026 | **Charte Restaurant** (répond à D-Q12) : (a) elle s'applique à tout l'espace d'un établissement dont le module Restaurant est actif, l'espace propriétaire restant en charte générale ; (b) l'élément de navigation actif est la pastille encre ; (c) le texte du bouton doré est encre et non blanc ; (d) la police est Plus Jakarta Sans. | Porteur du projet |
| D-018 | 07/11/2026 | **Ordre de réalisation** : le module Restaurant (interface responsive, mobile d'abord) est réalisé avant la landing page complète et avant le socle serveur. Il fonctionne d'abord sur une base locale (IndexedDB) alimentée par des **données de démonstration** clairement signalées ; le socle serveur (base, authentification, synchronisation) se branche ensuite sur la même couche. Remplace l'ordre des étapes 4 à 6 du `CLAUDE.md` § 10. | Porteur du projet |
| D-019 | 07/11/2026 | **Prisma 7.10.1 épinglé**, avec l'adaptateur `@prisma/adapter-pg`. L'étiquette npm « latest » de Prisma pointe vers une version candidate (8.0.0-rc) : elle n'est pas utilisée. Le client est généré dans `src/generated/prisma` (non versionné, régénéré après chaque `pnpm install`). | Socle serveur |
| D-020 | 07/11/2026 | **Node.js 24 LTS en production.** Prisma 7 ne prend officiellement en charge que Node.js 20, 22 et 24 ; Node.js 26, installé sur le poste de développement, fonctionne avec un avertissement. | Socle serveur |
| D-021 | 07/11/2026 | **Tests d'intégration sur PostgreSQL 18 embarqué (PGlite)** : vraies migrations, rôle applicatif sans BYPASSRLS, aucun mot de passe nécessaire. Un passage contre un vrai serveur PostgreSQL reste à ajouter en intégration continue. | Socle serveur |
| D-022 | 07/11/2026 | **[PROPOSÉ, à valider]** Lectures consolidées du propriétaire : au lieu de fonctions SQL dédiées (`CLAUDE.md` § 3.8), la politique RLS laisse lire tous les établissements quand `app.is_owner = 'true'`. Ce drapeau n'est posé qu'après `authorize`, qui vérifie le rôle propriétaire et la double authentification. Les écritures restent limitées à l'établissement du contexte. | Socle serveur |
| D-023 | 07/11/2026 | **[PROPOSÉ, à valider]** Durées de session (RG-AUT-03) : propriétaire 30 minutes d'inactivité et 12 heures au plus ; personnel 12 heures d'inactivité et 7 jours au plus. Paramètres regroupés dans `src/server/auth/policy.ts`. | Socle serveur |
| D-024 | 07/11/2026 | **[PROPOSÉ, à valider]** Code PIN des appareils (EF-AUT-01, EF-AUT-05) : le PIN ne quitte jamais l'appareil. Son vérificateur est un PBKDF2-SHA256 (WebCrypto, 210 000 itérations, sel aléatoire) stocké dans IndexedDB, et non un Argon2id comme le prévoyait le `CLAUDE.md` § 5.1 : Argon2id n'existe pas dans le navigateur sans dépendance WebAssembly. Un utilisateur s'ajoute sur un appareil appairé par son mot de passe (vérifié par le serveur, réseau requis), puis choisit son PIN. PIN trivial refusé (chiffres répétés, suites). 5 erreurs : PIN verrouillé jusqu'à une nouvelle saisie du mot de passe. Un gérant entré par PIN agit comme serveur ; ses droits de gérant ne valent que 15 minutes après une saisie de son mot de passe. Le propriétaire ne travaille pas sur un appareil partagé. Paramètres dans `src/offline/pin.ts` et `src/modules/restaurant/offline/device.ts`. | Liaison interface et serveur |
| D-025 | 07/11/2026 | **[PROPOSÉ, à valider]** Espace propriétaire, première version : (a) **suspendre un établissement n'efface pas ses appareils** : la synchronisation répond 403 (et non 401 comme pour une révocation), l'appareil garde ses données et ses opérations en attente, qui partent à la réactivation (EF-ETB-03) ; (b) l'adresse et le téléphone de l'en-tête vont dans `establishment_settings` (JSON versionné, validé par Zod), sans migration ; le logo et la couleur attendent le stockage des fichiers (D-Q23) ; (c) un restaurant créé reçoit, sur option cochée par défaut, les trois points de service de Best Food I (comptoir, cuisine, grillade, D-007) ; (d) l'adresse OPTIMA d'un établissement (`/e/<slug>`) ne change plus après sa création, car les appareils la conservent ; (e) les périodes de la vue d'ensemble suivent la journée d'exploitation de chaque établissement (HYPOTHÈSE D-Q10). | Espace propriétaire |
| D-026 | 08/11/2026 | **[PROPOSÉ, à valider]** Modules désactivés et appareils (EF-MOD-02, RG-MOD-01) : les appareils reçoivent la liste des modules actifs (état initial et journal des changements) et masquent aussitôt les menus et les écrans des modules désactivés ; si le module Restaurant lui-même est désactivé, l'appareil affiche un écran d'explication et garde ses données. Une opération envoyée pour un module désactivé n'est **pas refusée** mais **mise en attente** (`retry`) : elle reste sur l'appareil et part à la réactivation, sans quoi elle serait perdue. Le serveur garde le dernier mot (`authorize`). | Menus selon les modules |
| D-027 | 13/11/2026 | **[PROPOSÉ, à valider]** Exports Excel et PDF : (a) **ExcelJS 4.4.0** pour Excel ; (b) pour le PDF, **`playwright-core` 1.65.0**, qui pilote un navigateur **déjà installé** au lieu d'en télécharger un : Chrome ou Edge en local (`PDF_BROWSER_CHANNEL`, « chrome » par défaut), Chromium installé dans l'image Docker en production (`PDF_BROWSER_PATH`). Cela reste la brique Playwright/Chromium de la pile (D-014), sans binaire de 150 Mo dans le dépôt ni dans `node_modules` ; (c) un seul navigateur par processus, fermé après deux minutes sans export, un contexte isolé par document, rendu sans JavaScript, hors ligne et toute requête bloquée ; deux PDF en même temps au plus ; (d) un PDF compte 2 000 entrées au plus, Excel et CSV 10 000 ; (e) les couleurs des documents imprimés sont dans `src/styles/tokens/print.ts`. Les exports restent synchrones (Server Action) : la file pg-boss viendra avec les exports plus lourds (EF-ETB-05). | Exports Excel et PDF |
| D-028 | 13/11/2026 | **[PROPOSÉ, à valider]** Application installable et hors connexion (EF-OFF-05) : (a) **Serwist** (pile D-014), mais construit par un script (`scripts/build-sw.mts` : esbuild, puis `@serwist/build` qui injecte la liste à précacher) au lieu de `@serwist/turbopack`, dont le binaire natif `@swc/core` est **bloqué par la politique de sécurité Windows** du poste de développement ; `pnpm build` produit `public/sw.js` (non versionné) ; (b) **seules les pages du module Restaurant** (dont les données sont dans IndexedDB, pas dans le HTML) et les fichiers statiques vont en cache ; l'API (dont `/api/sync`), l'espace propriétaire, les comptes, l'équipe, les appareils et le journal ne sont **jamais** mis en cache ; hors connexion, une page « Pas de connexion » les remplace ; (c) à l'ouverture du Restaurant, l'appareil fait préparer les pages de son menu (modules actifs) ; (d) l'application installée s'ouvre sur `/ouvrir`, qui reprend le dernier établissement de l'appareil ; (e) le service worker n'est enregistré qu'en production ; (f) icônes provisoires tant que le logo n'est pas choisi (D-Q11). | PWA hors connexion |
| D-029 | 14/11/2026 | **[PROPOSÉ, à valider]** Politique de contenu (CSP) avec nonce (`CLAUDE.md` § 5.4) : (a) un **nonce neuf à chaque page**, posé par le proxy Next.js (`src/proxy.ts`) avec la CSP ; Next.js l'ajoute à ses scripts, next-themes le reçoit du layout racine ; politique : `script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `connect-src 'self'` ; `'unsafe-eval'` et styles en ligne **en développement seulement** ; (b) **toutes les pages sont rendues à chaque requête** (`instant = false` et lecture des en-têtes dans le layout racine) : une page préconstruite ne peut pas porter de nonce ; on perd les coquilles statiques (`cacheComponents`), donc un peu de rapidité au premier affichage ; (c) `style-src-attr 'unsafe-inline'` : React, Radix et les graphiques posent des attributs `style` ; les balises `<style>` restent soumises au nonce ; (d) **Zod sans compilation à la volée** (`z.config({ jitless: true })`, `src/shared/lib/zod-config.ts`) : sinon Zod sonde `eval` et déclenche une violation ; (e) en-têtes fixes dans `next.config.ts` sur toutes les réponses : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (caméra, USB et Bluetooth pour la seule origine propre), `Cross-Origin-Opener-Policy`, et **HSTS seulement si `APP_ORIGIN` est en HTTPS** ; (f) l'API, les fichiers statiques et `/sw.js` n'ont pas de nonce (pas de HTML) ; les pages Restaurant gardées hors connexion conservent l'en-tête et le nonce de leur réponse. Vérification : `pnpm check:csp`. | CSP avec nonce |
| D-030 | 14/11/2026 | **Landing page** (répond à D-Q01) : vitrine sobre qui présente OPTIMA au personnel et aux partenaires, avec accès à la connexion ; **non indexée** (`noindex`) tant qu'une ouverture au public n'est pas décidée. Le balisage SEO est fait quand même. | Porteur du projet (réponses du 14/11/2026) |
| D-031 | 14/11/2026 | **Autres types d'établissements** (répond à D-Q02) : rien de spécifique n'est préparé au-delà de l'architecture modulaire. | Porteur du projet (réponses du 14/11/2026) |
| D-032 | 14/11/2026 | **Qui reçoit l'argent** (répond à D-Q03) : **le serveur, la plupart du temps**, qui reverse ensuite à la caisse de chaque point de service. Comme ce n'est pas systématique, chaque paiement enregistre **la personne qui a reçu l'argent** (par défaut le serveur de la commande ; un gérant peut encaisser à sa place). Le montant détenu (EF-ENC-04) et la clôture (EF-CLO-01) se calculent par personne qui a encaissé et par point de service. | Porteur du projet (réponses du 14/11/2026) |
| D-033 | 14/11/2026 | **Moment du paiement** (répond à D-Q04) : **les deux**, mais le plus souvent **à la fin du repas**. Une commande est préparée sans paiement ; l'encaissement est possible à tout moment, en une ou plusieurs fois (EF-ENC-02) ; une table se libère d'elle-même quand toutes ses commandes sont soldées, la libération manuelle restant possible ; une facture non soldée à la clôture passe en impayé au nom du serveur (RG-ENC-02). | Porteur du projet (réponses du 14/11/2026) |
| D-034 | 14/11/2026 | **Tables** (répond à D-Q05) : liste numérotée paramétrable, sans plan de salle en phase 1 (déjà en place). | Porteur du projet (réponses du 14/11/2026) |
| D-035 | 14/11/2026 | **Structure des menus** (répond à D-Q06) : le menu comptera des **éléments simples**, des **éléments avec options** (accompagnement au choix, par exemple) et des **formules** (plusieurs éléments vendus ensemble). Le modèle du menu doit accepter les trois ; les choix pour chaque plat seront donnés par le restaurant. | Porteur du projet (réponses du 14/11/2026) |
| D-036 | 14/11/2026 | **Livreurs** (répond en partie à D-Q07) : ce sont des **membres du personnel** (rôle Livreur, comptes OPTIMA). Les zones et les frais de livraison restent à décider (D-Q07). | Porteur du projet (réponses du 14/11/2026) |
| D-037 | 14/11/2026 | **Crédit au restaurant** (répond à D-Q08) : autorisé, sur accord du gérant, pour des clients enregistrés, avec un plafond paramétrable. | Porteur du projet (réponses du 14/11/2026) |
| D-038 | 14/11/2026 | **Emballages consignés** (répond à D-Q09) : pas suivis en phase 1. | Porteur du projet (réponses du 14/11/2026) |
| D-039 | 14/11/2026 | **Journée d'exploitation** (répond à D-Q10) : elle commence à la saisie du stock du matin et se termine à la clôture validée, quelle que soit l'heure. Tant que les clôtures n'existent pas, la limite de 6 h reste le repli (`settings.ts`). | Porteur du projet (réponses du 14/11/2026) |
| D-040 | 14/11/2026 | **Charte générale** (répond à D-Q11) : logotype textuel provisoire « OPTIMA », bleu nuit `#1F3864`, police Inter. | Porteur du projet (réponses du 14/11/2026) |
| D-041 | 14/11/2026 | **Réseau du restaurant** (répond en partie à D-Q13) : connexion **Wi-Fi par Starlink**. Les appareils, les imprimantes et les coupures d'électricité restent à recenser (D-Q13). | Porteur du projet (réponses du 14/11/2026) |
| D-042 | 14/11/2026 | **Prix et arrondis** (répond à D-Q15) : prix des menus en francs congolais, arrondis à **100 CDF** ; le dollar est accepté **au taux du jour saisi par le gérant**, figé sur chaque paiement (RG-PRX-02). | Porteur du projet (réponses du 14/11/2026) |
| D-043 | 14/11/2026 | **Fiches clients** (répond à D-Q16) : uniquement pour la livraison et le crédit ; les clients de salle restent anonymes. | Porteur du projet (réponses du 14/11/2026) |
| D-044 | 14/11/2026 | **Repas du personnel, offerts et pertes** (répond à D-Q17) : sorties déclarées à part, avec un motif (EF-CLO-03), sans passer par la caisse. | Porteur du projet (réponses du 14/11/2026) |
| D-045 | 14/11/2026 | **Hébergement** (répond en partie à D-Q20) : **Vercel** ou un **hébergement mutualisé chez ifastnet**, administré par le porteur du projet ; nom de domaine choisi plus tard ; **préproduction séparée**. Cela remplace « Docker sur VPS, Caddy » (`CLAUDE.md` § 3.1, cahier § 6.3) une fois l'offre choisie. Points à régler avant le choix : (a) **Vercel** : l'offre gratuite (Hobby) est réservée à un usage personnel non commercial, il faut l'offre Pro ; PostgreSQL externe, avec un rôle applicatif sans `BYPASSRLS` ; pas de processus permanent, donc pg-boss déclenché par des tâches planifiées ou remplacé ; pas de navigateur installé pour les PDF (D-027) ; pas de disque pour les fichiers (D-048 : stockage objet) ; région européenne ; (b) **ifastnet** : à vérifier auprès de l'hébergeur : Node.js 24, PostgreSQL 16 ou plus avec création de rôles et RLS, processus de fond, Chromium pour les PDF, HTTPS, accès SSH et sauvegardes. Rien n'est changé dans le code avant le choix. | Porteur du projet (réponses du 14/11/2026) |
| D-046 | 14/11/2026 | **Notifications externes** (répond à D-Q21) : aucune en phase 1 ; les mots de passe sont réinitialisés par le gérant. Si des e-mails deviennent nécessaires, ils passeront par **Nodemailer**. | Porteur du projet (réponses du 14/11/2026) |
| D-047 | 14/11/2026 | **Intégration continue** (répond à D-Q22) : GitHub Actions sur `develop` et sur les pull requests vers `main` : typage, lint, tests, build, `pnpm audit`. | Porteur du projet (réponses du 14/11/2026) |
| D-048 | 14/11/2026 | **Stockage des fichiers** (répond à D-Q23) : derrière une interface interne ; un volume dédié inclus dans les sauvegardes si l'hébergement en offre un, sinon un stockage objet compatible S3 (cas de Vercel, D-045). | Porteur du projet (réponses du 14/11/2026) |
| D-049 | 14/11/2026 | **Double authentification des gérants** (répond à D-Q24) : **proposée, jamais obligatoire**. Celle du propriétaire reste obligatoire (EF-AUT-03). | Porteur du projet (réponses du 14/11/2026) |
| D-050 | 14/11/2026 | **Localisation et conservation** (répond à D-Q25) : hébergement en Europe ; clients inactifs conservés 3 ans puis anonymisés ; journal d'audit et données comptables conservés sans limite. | Porteur du projet (réponses du 14/11/2026) |
| D-051 | 14/11/2026 | **Contenu de la landing page** (répond en partie à D-Q26) : « OPTIMA » **avec une signature** ; appels à l'action **« Se connecter » et un contact** ; pied de page avec **coordonnées et entité juridique** ; Best Food I et Gold Detector M Congo **ne sont pas nommés** sans accord écrit ; **français seulement**. Restent à fournir : le texte de la signature, le contact, les coordonnées, l'entité juridique et le domaine. | Porteur du projet (réponses du 14/11/2026) |
| D-052 | 14/11/2026 | **Crédit par tranches, phase 2** (répond en partie à D-Q29) : oui, les ventes à crédit se paient par tranches, selon des échéances à définir avant la phase 2. | Porteur du projet (réponses du 14/11/2026) |
| D-053 | 14/11/2026 | **Thème sur un appareil partagé** (répond à D-Q31) : par utilisateur ; il change avec la reprise de main par code PIN. | Porteur du projet (réponses du 14/11/2026) |
| D-054 | 14/11/2026 | **Documents imprimés et PDF** (répond à D-Q32) : toujours en clair. | Porteur du projet (réponses du 14/11/2026) |

---

## 2. Questions ouvertes

### A. Vision et usage

**D-Q01. À qui s'adresse la landing page ?** · *Tranchée le 14/11/2026 : D-030*
OPTIMA est réservé aux établissements du propriétaire (D-005). La landing page n'a donc pas de rôle commercial évident.
- Option 1 : **vitrine sobre** qui présente OPTIMA au personnel et aux partenaires, avec accès à la connexion.
- Option 2 : simple page de connexion avec une courte présentation.
- Option 3 : vitrine pensée pour une commercialisation future.

Recommandation : option 1, **non indexée** par les moteurs de recherche (`noindex`) tant qu'une ouverture au public n'est pas décidée. Le balisage SEO (titre, description, Open Graph, structure) est fait de toute façon.

**D-Q02. D'autres types d'établissements sont-ils prévus après la boutique ?** · *Tranchée le 14/11/2026 : D-031*
Cela influence le registre des modules. Recommandation : ne rien préparer de spécifique au-delà de l'architecture modulaire.

### B. Règles métier du restaurant

Les questions D-Q03 à D-Q10 correspondent aux hypothèses de la section 1.5 du cahier.

**D-Q03. Qui reçoit l'argent du client ?** · *Tranchée le 14/11/2026 : D-032*
- Option 1 : le serveur, qui reverse ensuite à la caisse de chaque point de service (hypothèse actuelle).
- Option 2 : chaque point de service encaisse directement.
- Option 3 : une caisse centrale unique.

Cela détermine qui est responsable d'un manquant et la structure des clôtures.

**D-Q04. La facture d'avance est-elle payée avant le service ou à la fin du repas ?** · *Tranchée le 14/11/2026 : D-033*
Cela décide si une commande peut être préparée sans paiement, et comment les impayés sont traités (RG-ENC-02).

**D-Q05. Les tables sont-elles numérotées ? Combien ? Faut-il un plan de salle ?** · *Tranchée le 14/11/2026 : D-034*
Recommandation : liste numérotée paramétrable, sans plan graphique en phase 1.

**D-Q06. Les accompagnements (frites, foufou, birayi...) sont-ils vendus seuls, inclus dans un plat, ou les deux ?** · *Tranchée le 14/11/2026 : D-035 (le détail de chaque plat reste à fournir)*
Cela change la structure du menu : élément simple, élément avec options, ou formule.

**D-Q07. Livraison : qui livre, dans quelles zones et à quels frais ?** · *En partie tranchée le 14/11/2026 (D-036) ; restent les zones et les frais, indispensables avant le module Livraison*
Les livreurs sont-ils du personnel interne ou des motos-taxis payés à la course ? Les frais sont-ils fixes par zone ou au cas par cas ?

**D-Q08. La vente à crédit est-elle autorisée au restaurant ? Pour quels clients et avec quel plafond ?** · *Tranchée le 14/11/2026 : D-037*
Recommandation : autorisée, sur accord du gérant, pour des clients enregistrés, avec un plafond paramétrable.

**D-Q09. Faut-il suivre les emballages consignés (casiers, bouteilles vides) ?** · *Tranchée le 14/11/2026 : D-038*
Recommandation : pas en phase 1.

**D-Q10. Rythme des clôtures.** · *Tranchée le 14/11/2026 : D-039*
Une clôture par jour ou par service (midi et soir) ? Le service peut-il se prolonger après minuit ? Recommandation : la « journée d'exploitation » commence à la saisie du stock du matin et se termine à la clôture validée, quelle que soit l'heure.

**D-Q13. Équipement du restaurant.** · *En partie tranchée le 14/11/2026 (D-041 : Wi-Fi Starlink) ; reste le matériel, indispensable avant l'impression*
Combien de téléphones ou tablettes, et de quel modèle et quelle version d'Android ? Quelles imprimantes (marque, 58 ou 80 mm, Bluetooth, USB ou réseau) ? Y a-t-il un Wi-Fi local ? Quelle est la fréquence des coupures d'électricité ?

**D-Q14. Le magasin (réserve).** · *Indispensable avant les réquisitions ; le porteur du projet y reviendra*
Existe-t-il un magasin distinct des trois points de service, et qui le gère ? Les boissons passent-elles aussi par une réquisition vers le comptoir, ou le comptoir reçoit-il directement les achats ?

**D-Q15. Prix et arrondis.** · *Tranchée le 14/11/2026 : D-042*
Les prix des menus sont-ils fixés en francs congolais uniquement ? À quel multiple arrondir (50 ou 100 CDF) ? Le dollar est-il accepté au taux du jour ? Recommandation : prix en CDF, arrondi à 100 CDF, dollar accepté au taux du jour saisi par le gérant.

**D-Q16. Faut-il des fiches clients ?** · *Tranchée le 14/11/2026 : D-043*
Recommandation : uniquement pour la livraison et le crédit. Les clients de salle restent anonymes.

**D-Q17. Repas du personnel, offerts ou pertes.** · *Tranchée le 14/11/2026 : D-044*
Recommandation : sorties déclarées à part, avec un motif (EF-CLO-03), sans passer par la caisse.

### C. Chartes graphiques

**D-Q11. Charte générale : éléments manquants.** · *Tranchée le 14/11/2026 : D-040*
Existe-t-il un **logo OPTIMA** ? Le bleu nuit `#1F3864` est-il confirmé, ou le propriétaire a-t-il sa propre identité (le cahier prévoit cette possibilité) ? Police web : Inter est recommandée (le cahier est en Calibri, qui n'est pas une police web libre). Recommandation : logotype textuel provisoire « OPTIMA », bleu nuit, Inter.

**D-Q12. Charte Restaurant : quatre points.** · *Tranchée le 07/11/2026 : D-017 (recommandations retenues)*
- (a) **Portée** : s'applique-t-elle aussi aux écrans du socle (catalogue, stock, caisse) quand on est dans l'établissement restaurant ? Recommandation : **oui**, à tout l'espace d'un établissement dont le module Restaurant est actif, pour éviter de changer de charte en passant de « Commandes » à « Stock ». L'espace propriétaire, lui, reste en charte générale.
- (b) **Élément de navigation actif** : les maquettes en montrent deux variantes. Recommandation : la pastille encre `#2F2F2F`.
- (c) **Texte sur le bouton doré** : blanc dans les maquettes (contraste 2,3:1, non conforme). Recommandation : texte encre (7,2:1).
- (d) **Police** : Plus Jakarta Sans (libre, recommandée) ou Satoshi (plus proche des maquettes, licence Fontshare).

### D. Thèmes

**D-Q31. Appareil partagé : thème par utilisateur ou par appareil ?** · *Tranchée le 14/11/2026 : D-053*
Recommandation : par utilisateur. Le thème change avec la reprise de main par code PIN.

**D-Q32. Les documents imprimés et les PDF restent-ils toujours en clair ?** · *Tranchée le 14/11/2026 : D-054*
Recommandation : oui (économie d'encre, lisibilité des tickets thermiques).

### E. Technique et exploitation

**D-Q18. Confirmation de la pile technique.** · *Tranchée le 07/11/2026 : D-014*
La pile proposée par le cahier est : Next.js, TypeScript, PostgreSQL, Prisma, Tailwind CSS v4, Radix UI, Serwist et Dexie pour le hors connexion, pg-boss, Playwright, Docker et Caddy (voir `CLAUDE.md` § 3.1). L'équipe a-t-elle une autre pile imposée ou préférée ? Une version de Node.js, un gestionnaire de paquets ?

**D-Q19. Bibliothèque d'authentification.** · *Tranchée le 07/11/2026 : D-015 (implémentation maison)*
- Option 1 : **Better Auth** (recommandé : sessions en base, 2FA TOTP, extensible au code PIN par plugin).
- Option 2 : Auth.js.
- Option 3 : implémentation maison avec Argon2id et des sessions en base.

Les exigences, elles, sont fixées au `CLAUDE.md` § 5.1.

**D-Q20. Hébergement, domaine et exploitation.** · *En partie tranchée le 14/11/2026 (D-045) ; restent le choix entre Vercel et ifastnet et le domaine, indispensables avant la préproduction*
Quel hébergeur, quel nom de domaine, qui administre le serveur ? Une préproduction séparée est-elle prévue (recommandé) ?

**D-Q21. Notifications externes (e-mail, SMS, WhatsApp).** · *Tranchée le 14/11/2026 : D-046*
Recommandation : aucune en phase 1. Les alertes sont affichées dans les tableaux de bord et les mots de passe sont réinitialisés par le gérant (EF-AUT-04).

**D-Q22. Dépôt et intégration continue.** · *Tranchée le 14/11/2026 : D-047*
Le dépôt est-il sur GitHub ? Recommandation : GitHub Actions sur `develop` et sur les pull requests vers `main` (typage, lint, tests, build, `pnpm audit`).

**D-Q23. Stockage des fichiers (photos, justificatifs).** · *Tranchée le 14/11/2026 : D-048*
Recommandation : un volume dédié sur le serveur, inclus dans les sauvegardes, derrière une interface interne permettant de passer plus tard à un stockage objet compatible S3.

### F. Sécurité

**D-Q24. Double authentification pour les gérants ?** · *Tranchée le 14/11/2026 : D-049*
Elle est obligatoire pour le propriétaire (EF-AUT-03). Recommandation pour les gérants : proposée, mais pas obligatoire.

**D-Q25. Localisation et durée de conservation des données.** · *Tranchée le 14/11/2026 : D-050*
Un serveur hors de la RDC (en Europe, par exemple) est-il acceptable ? Combien de temps conserver les données des clients de livraison ? Recommandation : hébergement européen, conservation de 3 ans pour les clients inactifs, puis anonymisation. Le journal d'audit et les données comptables sont conservés sans limite.

### G. Landing page

**D-Q26. Contenu de la landing page.** · *En partie tranchée le 14/11/2026 (D-051) ; restent la signature, le contact, les coordonnées, l'entité juridique et le domaine*
- Nom et slogan : « OPTIMA » seul, ou avec une signature ?
- Appel à l'action : seulement « Se connecter », ou aussi un contact (e-mail, WhatsApp) ?
- Coordonnées et entité juridique pour le pied de page et les mentions légales.
- Peut-on **nommer publiquement** Best Food I et Gold Detector M Congo ? Recommandation : non, sans accord écrit.
- Langue : français seulement ?
- Domaine.

### H. Phase 2 : boutique de gold detectors

**D-Q27.** Les destinations (Kisangani, Goma, Bikenge, Kalemie) sont-elles des **succursales** (avec du personnel utilisant OPTIMA) ou des **agents en dépôt-vente** qui reversent l'argent après la vente ? · *Indispensable avant la phase 2 ; le porteur du projet y reviendra*

**D-Q28.** Les frais d'expédition doivent-ils être ajoutés au **prix de revient** des articles ? · *Indispensable avant la phase 2 ; le porteur du projet y reviendra*

**D-Q29.** Les ventes à crédit se paient-elles **par tranches** avec des échéances fixées ? · *En partie tranchée le 14/11/2026 (D-052) ; restent les échéances, avant la phase 2*

**D-Q30.** Quelle **remise maximale** un vendeur peut-il accorder par rapport au tarif ? Que signifie la colonne « Quantité Gape » des fiches actuelles ? · *Indispensable avant la phase 2 ; le porteur du projet y reviendra*

---

## 3. Modèle pour une nouvelle décision

```markdown
| D-0xx | JJ/MM/AAAA | Décision en une ou deux phrases. Conséquences : ... Remplace : D-0yy (le cas échéant). | Qui a décidé |
```
