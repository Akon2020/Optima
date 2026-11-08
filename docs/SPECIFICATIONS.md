# Spécifications fonctionnelles et non fonctionnelles d'OPTIMA

> **Statut de ce document : [SPÉCIFIÉ]**
> Ce contenu reprend mot pour mot les chapitres 2 à 5 du *Cahier des charges OPTIMA, version 1.0 du 6 novembre 2026*. Le fichier Word d'origine se trouve dans `docs/reference/OPTIMA_Cahier_des_charges_v1.0.docx`.
> Ce cahier a été **soumis pour validation et n'est pas encore signé**. Ses exigences sont la cible de développement, mais elles peuvent encore changer. Les points encore ouverts sont suivis dans `docs/DECISIONS.md`. Les hypothèses de la section 1.5 du cahier sont reprises en tête de ce fichier.
> Dans les passages repris, « ce document » et les numéros de chapitre (par exemple « chapitre 10 ») renvoient au cahier des charges.

## Comment utiliser ces exigences

- Chaque exigence a un identifiant stable : **EF** pour une exigence fonctionnelle, **RG** pour une règle de gestion, **ENF** pour une exigence non fonctionnelle.
- Un identifiant ne se renumérote jamais. Une exigence supprimée est barrée et suivie de la mention « abandonnée le JJ/MM/AAAA », avec la raison.
- Chaque fonctionnalité implémentée cite ses identifiants : dans la description de la pull request, et dans le nom des tests sous la forme `it("EF-CMD-02 : répartit la commande par point de service", ...)`.
- Une exigence modifiée par une décision ultérieure est annotée avec le numéro de la décision (`→ voir D-012`). La décision elle-même est consignée dans `docs/DECISIONS.md`.
- Les sections 4.1 à 4.14 forment le **socle commun**, inspiré du logiciel AkivioFlow. Les sections 4.15 à 4.23 forment le **module Restaurant**. La section 4.24 décrit le **journal d'audit**, transversal à tout le système.

## État d'implémentation (au 07/11/2026)

Implémenté **en local uniquement** (base IndexedDB de l'appareil, données de démonstration, sans serveur ni authentification, D-018). Rien n'est encore en production.

| Exigences | État |
|---|---|
| EF-RES-01, EF-RES-02, EF-RES-03 | Trois points de service, menus boissons et nourriture, unité de vente par élément |
| RG-RES-01, RG-PRX-01, RG-REQ-03 | Élément épuisé ou sans prix non commandable ; commande possible sans stock du matin |
| EF-CMD-01 à EF-CMD-04 | Prise de commande (table ou à emporter), les plus vendus d'abord, répartition par point de service, factures d'avance numérotées et imprimables, facture complémentaire sur une table occupée |
| RG-CMD-01 | Le stock du jour diminue dès la validation (disponibilité recalculée à partir des souches) |
| EF-DOC-01, RG-DOC-01 | Numérotation `TYPE-ANNÉE-CODEAPPAREIL-SÉQUENCE`, compteurs locaux par appareil |
| EF-TDB-01 (partiel), EF-TDB-04 | Tableau de bord du jour : montant facturé, factures, panier moyen, commandes par statut, points de service, serveurs ; alerte stock du matin manquant |
| EF-OFF-01, EF-OFF-02, RG-OFF-01 | Bandeau d'état ; chaque écriture crée une opération UUIDv7 dans la file locale, envoyée au serveur toutes les 30 secondes, 3 secondes après chaque opération et au retour du réseau ; les changements des autres appareils sont reçus par curseur |
| EF-PRE-02 (partiel) | Suivi « en préparation / prête / servie » depuis le détail d'une commande |
| EF-REQ-03, EF-REQ-04 (partiel), RG-REQ-02 | Stock du matin par point de service : quantités pré-remplies avec la proposition, écarts affichés, motif obligatoire pour tout écart ou correction, corrections conservées dans un historique (saisies en ajout seul) |
| RG-REQ-03 (partiel), EF-TDB-04 | Statut « saisi / à saisir » par poste, alerte du tableau de bord. Le blocage de la clôture viendra avec l'écran Clôtures |
| EF-RES-04, EF-CMD-04, EF-CMD-05 | Écran Tables : occupation en direct, commande complémentaire depuis une table, addition récapitulative imprimable, libération manuelle ; le gérant ajoute, renomme, retire du service et rétablit les tables (jamais de suppression) |
| EF-AUT-01 (partiel), EF-AUT-02, EF-AUT-03, RG-AUT-01 à RG-AUT-03, ENF-07 | Socle serveur : connexion par e-mail ou téléphone, mot de passe provisoire à changer, Argon2id, double authentification TOTP du propriétaire avec codes de secours, blocage après 5 échecs, expiration des sessions |
| EF-AUT-01, EF-AUT-05 | Appareil partagé : chaque utilisateur s'y ajoute une fois avec son mot de passe, puis reprend la main par un code PIN à 4 chiffres (« Changer d'utilisateur », puis le PIN). PIN local, verrouillé après 5 erreurs ; droits de gérant réservés aux 15 minutes suivant une saisie du mot de passe (D-024) |
| ENF-08, RG-AUD-01, EF-AUD-01 (partiel) | RLS par établissement, contrôle `authorize` unique, journal d'audit en ajout seul (connexions, menu, stock du matin, tables, appareils) ; tests d'intégration dédiés |
| EF-OFF-04, RG-OFF-01, RG-OFF-02 (serveur), EF-CPT-04 (service) | `/api/sync/push` idempotent avec réponses acceptée, déjà reçue, refusée (motif) ; `/api/sync/pull` par curseur ; appareils enregistrés et révocables ; appairage d'un appareil par un gérant connecté ; état initial `/api/sync/bootstrap` ; refus listés dans le panneau de synchronisation |
| EF-CPT-04, ENF-09, EF-PRO-05 (partiel) | Écran « Appareils » (`/e/<slug>/appareils`, gérant et propriétaire) : appareils en service et révoqués, dernière synchronisation, opérations refusées, signalement après 24 heures sans nouvelles ; révocation avec motif obligatoire, auditée, qui rappelle que les saisies postérieures à la dernière synchronisation n'arriveront plus. Un appareil révoqué est refusé à la synchronisation suivante et toutes ses données locales sont effacées |
| EF-CPT-01 (partiel), EF-CPT-02, EF-CPT-03 (partiel), EF-CPT-05, EF-AUT-02, EF-AUT-04 | Écran « Équipe » (`/e/<slug>/equipe`) : personnel avec rôle, poste et dernière connexion ; création d'un compte avec mot de passe provisoire lisible montré une seule fois ; modification du nom, du rôle et du poste ; réinitialisation du mot de passe ; déconnexion forcée ; suspension avec motif obligatoire, effet immédiat (sessions fermées, appareils prévenus, PIN refusé), réactivation. Le gérant gère le personnel mais ni les gérants ni lui-même ; le propriétaire gère aussi les gérants. Restent : droits ajustables (remise maximale, accès aux rapports, EF-CPT-03), changement d'identifiant, RG-CPT-01 (avec la gestion des propriétaires) |
| EF-PRO-01 (partiel), EF-PRO-02 (partiel), EF-PRO-03 (partiel), EF-PRO-04, EF-PRO-05 (partiel), EF-PRO-06 (partiel), RG-PRO-01 | Vue d'ensemble `/proprietaire` : montant facturé, commandes et panier moyen par établissement et au total (par devise), sur aujourd'hui, 7 ou 30 jours, comparés à la période précédente ; graphique d'évolution ; alertes (appareil sans synchronisation depuis 24 h, opérations refusées, stock du matin non saisi, établissement suspendu) ; appareils et personnel par établissement. Les indicateurs qui attendent l'encaissement, les clôtures, le stock et les achats sont annoncés, pas inventés. Restent : période personnalisée, comparaison de deux établissements, détail cliquable de chaque chiffre |
| EF-ETB-01 (partiel), EF-ETB-02, EF-ETB-03, RG-ETB-01, EF-MOD-01, RG-MOD-01, RG-MOD-02 | `/proprietaire/etablissements` : création (nom, adresse OPTIMA, raison sociale, adresse, téléphone, type, devise figée, fuseau, points de service habituels) avec aperçu de l'en-tête imprimé et champs manquants ; identité modifiable, devise non ; modules activables avec dépendances dans les deux sens ; suspension avec motif et réactivation, sans effacer les appareils (D-025). Toutes les actions sont inscrites au journal de l'établissement. Restent : logo et couleur (D-Q23), suppression en deux temps et exports (EF-ETB-04, EF-ETB-05, RG-ETB-02) |
| EF-AUD-02, EF-AUD-03, EF-AUD-04 (partiel) | Journal consultable : `/e/<slug>/journal` (gérant, son établissement) et `/proprietaire/audit` (propriétaire, tous les établissements et les connexions). Fil chronologique filtrable par établissement, domaine, action, auteur, appareil et dates, détail des changements « avant → après », pagination. Export CSV lisible par Excel (séparateur « ; », formules neutralisées), lui-même inscrit au journal. Restent les exports Excel et PDF (ExcelJS, Playwright) |
| EF-MOD-02, RG-MOD-01 | Les appareils reçoivent les modules actifs (`/api/sync/bootstrap`, puis entité `establishment_modules` dans `/api/sync/pull`) : le menu, la barre inférieure et les écrans suivent sans rechargement ; écran d'explication si le module Restaurant est désactivé. Les opérations d'un module désactivé restent en attente sur l'appareil jusqu'à la réactivation (D-026). Restent : les droits ajustables par rôle (EF-CPT-03), et les écrans des modules à venir (préparation, fiches recettes), qui déclareront leur module de la même façon |
| Matrice des droits (stock du matin, menus, commandes) | Permissions déclarées dans `modules/restaurant/permissions.ts` et vérifiées sur l'appareil ; le serveur les revérifiera |

Hypothèses retenues dans le code : **D-Q10** (journée d'exploitation à partir de 6 h, paramétrable, `domain/business-day.ts`), **D-Q05** (liste de tables numérotées et renommables, sans plan de salle, 12 en démonstration), **D-Q04** (tant que l'encaissement n'est pas tranché, une table est libérée à la main par le serveur ou le gérant, `domain/tables.ts`), **D-Q14** (tant que clôtures et réquisitions n'existent pas, la proposition du stock du matin est le reste théorique de la veille, sans réquisition ; les apports du jour se justifient par le motif « Réquisition du jour », `domain/morning-stock.ts`).

## Hypothèses retenues (section 1.5 du cahier, à confirmer)

- L'argent est reçu par le serveur, puis reversé à la caisse du point de service concerné. La clôture se fait donc par serveur et par point de service.
- La clôture de caisse a lieu une fois par jour, à la fin du service.
- Les tables sont numérotées, et leur nombre est paramétrable.
- La vente à crédit est possible au restaurant, sur autorisation du gérant.
- Les emballages consignés (casiers et bouteilles vides) ne sont pas suivis dans cette version.

## 2. Glossaire

- **Établissement** : Activité commerciale gérée dans OPTIMA, comme le restaurant ou la boutique de gold detectors. Chacun a ses propres données, son gérant et ses utilisateurs.
- **Propriétaire** : Super-administrateur du logiciel. Il voit et contrôle tous les établissements.
- **Module** : Ensemble de fonctionnalités que le propriétaire active ou désactive pour un établissement.
- **Point de service** : Lieu du restaurant qui prépare une partie de la commande : le comptoir (boissons), la cuisine (plats) ou la grillade (viande de chèvre). Chacun a sa caisse, son menu et son stock.
- **Réquisition** : Sortie de marchandise du magasin vers un point de service, établie chaque jour par le gérant.
- **Stock du matin** : Quantités disponibles dans chaque point de service à l'ouverture, en bouteilles, en plats ou en morceaux.
- **Facture d'avance** : Facture imprimée par le serveur au moment de la commande et déposée au point de service, qui prépare sur cette base.
- **Souche** : Copie d'une facture conservée dans le logiciel. L'ensemble des souches sert à calculer le montant attendu à la clôture.
- **Clôture de service** : Comparaison, en fin de service, entre le montant attendu et le montant compté, puis entre le stock attendu et le stock compté.
- **Écart** : Différence constatée à la clôture. Un écart de caisse négatif est un manquant, un écart positif un excédent.
- **Prix de revient (PR)** : Coût d'achat moyen d'un article, pondéré par les quantités reçues.
- **Fiche recette** : Liste des ingrédients et des quantités qui composent un plat. Elle sert à calculer son coût et à contrôler les consommations.
- **Recette (phase de tests)** : Période pendant laquelle le client vérifie que le logiciel fait ce que décrit ce document (chapitre 10). À ne pas confondre avec la fiche recette.
- **Synchronisation** : Envoi au serveur central des opérations enregistrées sur un appareil, et réception des opérations faites sur les autres appareils.

## 3. Utilisateurs et droits d'accès

Le logiciel distingue six profils. Chaque personne ne voit que ce que son rôle autorise, et ce filtrage se fait sur le serveur : une donnée qu'un utilisateur n'a pas le droit de voir ne lui est jamais envoyée. À l'exception du propriétaire, chaque profil est rattaché à un seul établissement : un serveur de Best Food I n'a aucun accès à la boutique de gold detectors.

- **Propriétaire :** accès complet à tous les établissements : tableau de bord consolidé, création, suspension et suppression d'établissements, activation des modules, gestion des gérants et journal d'audit.
- **Gérant :** accès complet à son établissement : menus et prix, achats, réquisitions, stock du matin, comptes du personnel, validation des annulations et des clôtures, rapports.
- **Serveur :** prise de commande, impression des factures, encaissement, consultation de ses propres ventes et de sa clôture.
- **Poste de préparation :** réception des commandes de son point de service, signalement des plats prêts et des articles épuisés. Aucun montant n'y est affiché.
- **Livreur :** ses livraisons du jour, confirmation de la remise et de l'encaissement.
- **Lecteur :** consultation des tableaux de bord et des rapports, sans aucune modification.

### Matrice des droits

| Domaine | Propriétaire | Gérant | Serveur | Préparation | Livreur | Lecteur |
|---|---|---|---|---|---|---|
| Établissements et modules | Complet | Non | Non | Non | Non | Non |
| Comptes des gérants | Complet | Non | Non | Non | Non | Non |
| Comptes du personnel | Complet | Complet | Non | Non | Non | Non |
| Menus, articles et prix | Complet | Complet | Lecture | Lecture | Non | Lecture |
| Achats et fournisseurs | Complet | Complet | Non | Non | Non | Lecture |
| Réquisitions et stock du matin | Complet | Complet | Non | Lecture | Non | Lecture |
| Inventaires | Complet | Complet | Non | Non | Non | Lecture |
| Prise de commande | Complet | Complet | Complet | Non | Non | Non |
| Postes de préparation | Lecture | Complet | Ses commandes | Son poste | Non | Non |
| Encaissement | Complet | Complet | Ses ventes | Non | Ses livraisons | Non |
| Annulations et remises | Complet | Validation | Demande | Non | Non | Non |
| Livraisons | Complet | Complet | Création | Non | Les siennes | Lecture |
| Clôtures de service | Complet | Validation | La sienne | Non | La sienne | Lecture |
| Dépenses et dettes | Complet | Complet | Non | Non | Non | Lecture |
| Rapports et tableaux de bord | Tous | Son établissement | Ses ventes | Non | Non | Lecture |
| Journal d'audit | Lecture | Son établissement | Non | Non | Non | Non |

## 4. Spécifications fonctionnelles

Ce chapitre décrit ce que le logiciel doit faire, module par module. Les sections 4.1 à 4.14 forment le socle commun à tous les établissements, en grande partie inspiré du logiciel AkivioFlow. Les sections 4.15 à 4.24 décrivent le module Restaurant et le journal d'audit. Les règles de gestion (RG) précisent les comportements qui protègent l'exactitude des données et qu'un utilisateur ne devine pas forcément.

### 4.1 Connexion et sécurité des comptes

OPTIMA dispose de sa propre adresse web. Chaque utilisateur s'y connecte avec les identifiants remis par le propriétaire ou par son gérant.

- **EF-AUT-01** : L'identifiant est une adresse e-mail ou un numéro de téléphone. Sur un appareil partagé du restaurant, le serveur reprend ensuite la main avec un code personnel à quatre chiffres, sans retaper son mot de passe.
- **EF-AUT-02** : À la création d'un compte, le logiciel génère un mot de passe provisoire lisible, sans caractères ambigus. À la première connexion, l'utilisateur doit choisir son propre mot de passe.
- **EF-AUT-03** : Le compte du propriétaire est protégé par une double authentification (code à usage unique).
- **EF-AUT-04** : Un mot de passe oublié est réinitialisé par le gérant pour son personnel, et par le propriétaire pour les gérants.
- **EF-AUT-05** : Le changement d'utilisateur sur un appareil partagé se fait en deux gestes, pour que chaque serveur travaille toujours sous son propre nom.
- **RG-AUT-01** : Les mots de passe ne sont jamais stockés en clair ni envoyés par e-mail. Personne, ni le propriétaire ni le prestataire, ne peut relire un mot de passe existant.
- **RG-AUT-02** : Après plusieurs tentatives échouées, la connexion est temporairement bloquée pour ce compte.
- **RG-AUT-03** : Une session inactive se ferme d'elle-même. Ce délai est plus court pour le propriétaire.

### 4.2 Fonctionnement hors connexion

Le réseau n'est pas toujours fiable. La prise de commande, l'impression des factures et l'encaissement, gestes quotidiens du restaurant, doivent donc continuer à fonctionner quand la connexion tombe.

- **EF-OFF-01** : Sans réseau, les commandes, encaissements, mouvements de stock et clôtures sont enregistrés sur l'appareil, puis envoyés automatiquement au retour de la connexion : toutes les 30 secondes, et quelques secondes après chaque opération.
- **EF-OFF-02** : Un bandeau affiche en permanence l'état : « En ligne, tout est synchronisé » ou « Hors ligne, N opérations en attente ».
- **EF-OFF-03** : Plusieurs appareils travaillent en même temps sur le même établissement. Chacun reçoit les opérations des autres dès qu'il est connecté.
- **EF-OFF-04** : Chaque opération envoyée reçoit une réponse visible : acceptée, déjà reçue (sans double comptage) ou refusée avec son motif. Un refus n'est jamais silencieux.
- **EF-OFF-05** : Le logiciel s'installe sur l'écran d'accueil du téléphone ou sur le bureau de l'ordinateur comme une application, sans passer par un magasin d'applications.
- **RG-OFF-01** : Chaque opération porte un identifiant unique créé sur l'appareil. Une opération envoyée deux fois n'est comptée qu'une fois.
- **RG-OFF-02** : La création d'un établissement, la création d'un compte et la première connexion sur un nouvel appareil exigent une connexion.
- **RG-OFF-03** : Si deux appareils modifient la même fiche, la dernière modification validée l'emporte et l'autre reste visible dans l'historique. Les ventes et les mouvements de stock s'additionnent et n'entrent jamais en conflit.

### 4.3 Espace propriétaire et tableau de bord consolidé

L'espace propriétaire est le point commun de tous les établissements. Son tableau de bord répond à une seule question : comment se portent mes établissements aujourd'hui, et lequel demande mon attention ?

- **EF-PRO-01** : La vue d'ensemble affiche, pour chaque établissement et au total : chiffre d'affaires, marge réalisée, dépenses, bénéfice estimé, cash attendu et cash déclaré, manquants, valeur du stock, ruptures, dettes clients et fournisseurs.
- **EF-PRO-02** : La période se choisit librement : jour, semaine, mois ou période personnalisée. Des graphiques montrent l'évolution et permettent de comparer deux périodes ou deux établissements.
- **EF-PRO-03** : Chaque chiffre est cliquable et mène au détail : ventes, achats, stocks, clôtures, dépenses ou utilisateurs de l'établissement concerné.
- **EF-PRO-04** : L'état de chaque appareil est visible : date de la dernière synchronisation et nombre d'opérations en attente.
- **EF-PRO-05** : Des alertes signalent un manquant au-delà d'un seuil, un stock sous son minimum, un nombre inhabituel d'annulations ou un appareil qui ne s'est pas synchronisé depuis plus de 24 heures.
- **EF-PRO-06** : Le propriétaire peut ouvrir n'importe quel établissement et y agir comme un gérant.
- **RG-PRO-01** : Toute action du propriétaire dans un établissement est inscrite au journal d'audit de cet établissement, visible par le gérant.

### 4.4 Gestion des établissements

Tout ce qui est saisi ici s'imprime en tête des tickets, factures et rapports. Ce n'est donc pas un simple écran de préférences.

- **EF-ETB-01** : Création d'un établissement : nom, raison sociale, logo, couleur, adresse, téléphone, type d'activité et devise de base.
- **EF-ETB-02** : Un aperçu reconstitue l'en-tête tel qu'il sera imprimé et signale les champs manquants.
- **EF-ETB-03** : Suspension : plus personne ne peut se connecter à l'établissement, mais ses données sont conservées. La réactivation rend l'accès à l'identique.
- **EF-ETB-04** : Suppression en deux temps : l'établissement est d'abord suspendu, puis supprimé définitivement après 30 jours. Pendant ce délai, la suppression peut être annulée.
- **EF-ETB-05** : Export des données d'un établissement : Excel et CSV par domaine (articles, ventes, stock, clôtures), PDF pour les rapports, et sauvegarde complète.
- **RG-ETB-01** : La devise de base ne peut plus être modifiée une fois l'établissement créé, pour que tous les montants passés restent comparables.
- **RG-ETB-02** : La suppression définitive exige un export complet préalable et la saisie du nom de l'établissement en confirmation.

### 4.5 Gestion des modules

Les fonctionnalités sont regroupées en modules : Catalogue et prix, Stock, Achats et fournisseurs, Caisse et ventes, Trésorerie et dépenses, Clients et dettes, Lots et péremption, Code-barres et étiquettes, Restaurant, Postes de préparation, Fiches recettes, Livraison et Rapports.

- **EF-MOD-01** : Pour chaque établissement, le propriétaire voit la liste des modules et active ou désactive chacun d'un geste.
- **EF-MOD-02** : Les menus et les droits des utilisateurs s'adaptent immédiatement aux modules actifs.
- **RG-MOD-01** : Désactiver un module masque ses écrans sans effacer ses données. Elles réapparaissent si le module est réactivé.
- **RG-MOD-02** : Un module qui dépend d'un autre ne peut pas être activé seul : les Postes de préparation exigent le module Restaurant, les Fiches recettes exigent le Stock.

### 4.6 Comptes des gérants et du personnel

- **EF-CPT-01** : Le propriétaire crée les gérants, les suspend, réinitialise leurs mots de passe et peut forcer leur déconnexion.
- **EF-CPT-02** : L'écran « Comptes et rôles » de chaque établissement liste le personnel avec son rôle, son point de service et sa date de dernière connexion.
- **EF-CPT-03** : Le gérant peut ajuster certains droits de son personnel, comme la remise maximale ou l'accès aux rapports, sans dépasser ses propres droits.
- **EF-CPT-04** : Un appareil perdu ou volé peut être désactivé à distance. Ses opérations non synchronisées sont signalées.
- **EF-CPT-05** : Un membre du personnel qui part est suspendu avec un motif obligatoire. Son accès est fermé immédiatement, mais son nom reste sur les factures et les clôtures qu'il a produites.
- **RG-CPT-01** : Le dernier propriétaire actif ne peut pas se retirer à lui-même ce rôle : plus personne ne pourrait le lui rendre.

### 4.7 Catalogue des articles

- **EF-CAT-01** : Chaque article a une fiche : code attribué automatiquement, code-barres, photo, désignation, catégorie, marque, modèle ou référence, unité de mesure, niveau de demande (rare, normal, populaire), stock minimum, stock maximum et description.
- **EF-CAT-02** : Les catégories, marques et unités se créent depuis la fiche article, sans quitter l'écran. Une unité se compte en entier (pièce, bouteille) ou en décimal (kilogramme, litre).
- **EF-CAT-03** : La caméra du téléphone scanne les codes-barres. Un code inconnu propose de créer l'article avec ce code.
- **EF-CAT-04** : Une case distingue un article stocké d'un service, comme la livraison. Une option active le suivi par lots et dates de péremption.
- **EF-CAT-05** : Le catalogue offre une recherche insensible aux accents, des filtres par catégorie, par niveau de demande et par état, et l'impression d'étiquettes code-barres.
- **RG-CAT-01** : Un article ne se supprime pas : il s'archive, car les ventes passées y font référence.

### 4.8 Prix et taux de change

- **EF-PRX-01** : Le prix de revient est le coût moyen pondéré des réceptions. Il se met à jour à chaque réception.
- **EF-PRX-02** : Un assistant propose le prix de vente selon des règles de marge paramétrables : par défaut 30 % pour la demande normale, 20 % pour les articles populaires et 50 % pour les articles rares, avec un arrondi et une priorité.
- **EF-PRX-03** : Le gérant peut saisir le prix observé chez les concurrents, simuler un nouveau prix d'achat, puis valider ou ajuster le prix proposé. La marge et le taux de marge s'affichent avant validation.
- **EF-PRX-04** : Chaque prix validé entre dans l'historique de l'article, avec sa date, son prix de revient, sa règle et son auteur.
- **EF-PRX-05** : Les taux de change entre le franc congolais et le dollar sont saisis avec leur date d'effet et leur source, et s'affichent en permanence à la caisse.
- **RG-PRX-01** : Un article sans prix de vente ne peut pas être vendu. Il apparaît « À fixer » dans le catalogue.
- **RG-PRX-02** : Un taux n'est jamais modifié : on en ajoute un nouveau. Le taux appliqué est figé sur chaque paiement, ce qui rend un ticket réimprimable à l'identique.

### 4.9 Achats et fournisseurs

- **EF-ACH-01** : Chaque fournisseur a sa fiche : nom, téléphone, articles fournis et solde dû.
- **EF-ACH-02** : Un bon de commande peut être établi, puis reçu en tout ou en partie. La réception met à jour le stock du magasin et le prix de revient.
- **EF-ACH-03** : Chaque article peut avoir une unité d'achat différente de son unité de vente : un casier reçu devient 12, 20 ou 24 bouteilles selon l'article.
- **EF-ACH-04** : Un achat payé en partie crée une dette fournisseur, suivie jusqu'à son règlement.
- **RG-ACH-01** : Une réception validée ne se modifie pas. Une erreur se corrige par un retour fournisseur ou un ajustement motivé.

### 4.10 Stock et inventaires

- **EF-STK-01** : L'état du stock affiche, par emplacement, la quantité, la valeur au prix de revient et l'état de chaque article : disponible, stock faible ou rupture.
- **EF-STK-02** : Les opérations de stock sont numérotées automatiquement : stock initial, transfert entre emplacements, perte ou vol, casse et ajustement.
- **EF-STK-03** : L'inventaire physique se fait en deux temps : on compte, puis le logiciel calcule les écarts et les enregistre après validation du gérant.
- **EF-STK-04** : Pour les articles suivis par lots, les sorties respectent l'ordre des péremptions.
- **RG-STK-01** : Le journal des mouvements est inaltérable. Une erreur se corrige par un ajustement, jamais par une modification.
- **RG-STK-02** : Un lot périmé est bloqué à la vente.
- **RG-STK-03** : Hors connexion, deux appareils peuvent vendre le même dernier article. Le stock peut alors devenir négatif : l'anomalie est signalée au gérant et apparaît à la clôture.

### 4.11 Caisse et ventes

La caisse sert les établissements qui vendent au comptoir. Au restaurant, elle est complétée par la prise de commande décrite en 4.18.

- **EF-VTE-01** : Les articles s'ajoutent au panier par scan ou par recherche. Le panier affiche la quantité, le prix, la remise et le total.
- **EF-VTE-02** : Le client est le client comptoir par défaut, ou un client enregistré, créé à la volée si besoin.
- **EF-VTE-03** : Un même ticket peut être réglé avec plusieurs moyens : espèces en francs congolais ou en dollars, Mobile Money (M-Pesa, Orange Money, Airtel Money) ou carte.
- **EF-VTE-04** : Les devis et factures pro forma se créent depuis le panier et se transforment en vente sans ressaisie.
- **EF-VTE-05** : Une vente à crédit exige le nom et le téléphone du client et crée une dette suivie jusqu'à son règlement.
- **RG-VTE-01** : La remise accordée ne peut pas dépasser le plafond fixé pour le rôle de l'utilisateur.
- **RG-VTE-02** : Une vente n'est jamais supprimée : elle est annulée avec un motif et la validation du gérant. Le stock est rétabli et la facture reste consultable avec la mention « annulée ».

### 4.12 Documents imprimés

- **EF-DOC-01** : Ventes, factures et opérations sont numérotées automatiquement par établissement, par année et par appareil, pour rester uniques même hors connexion (par exemple FAC-2026-D01-000052).
- **EF-DOC-02** : Formats disponibles : ticket thermique de 58 ou 80 mm, facture A4, bon de livraison, et enregistrement en PDF de tout document.
- **EF-DOC-03** : Chaque document porte l'en-tête de l'établissement, le numéro, la date et l'heure, le nom du serveur ou du vendeur, le détail, le total, le mode de paiement et un QR code de vérification.
- **EF-DOC-04** : Une page de vérification, ouverte par le QR code, répond « authentique » ou « inconnu » et affiche l'établissement, le numéro, la date et le montant.
- **RG-DOC-01** : Un numéro attribué n'est jamais réutilisé. Une facture annulée garde son numéro.

### 4.13 Trésorerie, dépenses et dettes

- **EF-TRE-01** : Chaque caisse de l'établissement affiche son solde en temps réel, par mode de paiement.
- **EF-TRE-02** : Les dépenses quotidiennes s'enregistrent avec leur catégorie, leur montant, leur bénéficiaire et, si possible, une photo du justificatif.
- **EF-TRE-03** : Les dettes clients s'affichent avec leur ancienneté. Un remboursement partiel ou total s'enregistre en caisse et réduit la dette.
- **EF-TRE-04** : Un solde prévisionnel à 30 jours tient compte des dettes à recevoir et à payer.

### 4.14 Tableau de bord d'établissement

Le tableau de bord du gérant répond à une seule question : qu'est-ce qui demande mon attention aujourd'hui ? Son contenu dépend du rôle.

- **EF-TDB-01** : Le gérant voit la trésorerie disponible, les ventes du jour, le chiffre d'affaires et la marge du mois, les dettes clients, la valeur du stock, les ruptures, les commandes en cours et les opérations à synchroniser.
- **EF-TDB-02** : Le serveur voit ses commandes ouvertes, ses ventes du jour et l'état de sa clôture.
- **EF-TDB-03** : Chaque chiffre est cliquable et mène à l'écran où l'on agit dessus.
- **EF-TDB-04** : Une alerte signale un point de service dont le stock du matin n'a pas encore été saisi.

### 4.15 Organisation et menus du restaurant

Le restaurant Best Food I compte trois points de service : le comptoir pour les boissons, la cuisine (viande de porc, poisson salé, tilapia, zingaro, sambaza, frites, bisamunyu, birayi, foufou) et la grillade ou muchoma pour la viande de chèvre. Chacun fait aujourd'hui sa propre caisse.

- **EF-RES-01** : Chaque point de service a sa caisse, son menu et son stock. Les serveurs sont communs aux trois.
- **EF-RES-02** : Deux menus sont proposés aux serveurs : le menu des boissons, et le menu de la nourriture, qui regroupe la cuisine et la grillade.
- **EF-RES-03** : Chaque élément du menu indique son nom, son prix, son point de service et son unité de vente : la bouteille pour les boissons, le plat pour la cuisine, le morceau pour la viande de chèvre.
- **EF-RES-04** : Les tables sont créées et numérotées par le gérant. Une commande peut aussi être à emporter ou en livraison.
- **RG-RES-01** : Un élément dont le stock du jour atteint zéro s'affiche « épuisé » et ne peut plus être commandé.
- **RG-RES-02** : Seul le gérant modifie les prix du menu. Le changement s'applique aux commandes suivantes, jamais à celles déjà facturées.

### 4.16 Réquisition et stock du matin

- **EF-REQ-01** : Les boissons, vivres et viandes achetés entrent dans le magasin du restaurant (voir 4.9). Les boissons achetées en casiers sont converties en bouteilles à la réception.
- **EF-REQ-02** : Chaque jour, le gérant établit une réquisition par point de service : les boissons vers le comptoir, la nourriture vers la cuisine, la viande de chèvre vers la grillade.
- **EF-REQ-03** : Chaque matin, le gérant saisit le stock disponible de chaque point de service : les boissons en bouteilles, la nourriture en plats, la viande de chèvre en morceaux.
- **EF-REQ-04** : Le logiciel propose comme base le stock de clôture de la veille augmenté de la réquisition du jour. Le gérant confirme ou corrige.
- **RG-REQ-01** : Une réquisition validée fait sortir les quantités du magasin et les fait entrer au point de service. Elle ne se modifie plus.
- **RG-REQ-02** : Toute différence entre le stock proposé et le stock saisi est enregistrée comme un écart, avec un motif obligatoire.
- **RG-REQ-03** : Les commandes restent possibles si le stock du matin n'est pas saisi, mais la clôture du point de service ne peut pas être validée tant qu'il manque.

### 4.17 Fiches recettes

La fiche recette relie ce qui sort du magasin à ce qui est vendu. Le stock du restaurant reste tenu en plats et en morceaux, comme le souhaite l'équipe. Les fiches recettes servent au calcul et au contrôle.

- **EF-RCT-01** : Chaque plat peut avoir une fiche recette : ingrédients, quantités et nombre de portions obtenues. Par exemple, un kilo de viande de chèvre donne un nombre défini de morceaux.
- **EF-RCT-02** : Le coût de revient du plat est calculé à partir de sa fiche recette et du prix de revient de chaque ingrédient. La marge de chaque plat s'en déduit.
- **EF-RCT-03** : À partir de la réquisition du jour, le logiciel estime le nombre de plats ou de morceaux attendus, et le compare au stock du matin saisi par le gérant.
- **EF-RCT-04** : En fin de période, un rapport compare la consommation prévue par les fiches recettes et la consommation réelle, ingrédient par ingrédient.
- **RG-RCT-01** : Modifier une fiche recette ne change pas le coût des plats déjà vendus. La nouvelle fiche s'applique à partir de sa date.

### 4.18 Prise de commande

Le serveur prend la commande à table et imprime la facture d'avance, qu'il dépose au comptoir, à la cuisine ou à la grillade, comme aujourd'hui. Le logiciel y ajoute la répartition automatique et la trace.

- **EF-CMD-01** : Le serveur choisit la table, la vente à emporter ou la livraison, puis ajoute les éléments des deux menus. Les éléments les plus vendus apparaissent en premier.
- **EF-CMD-02** : À la validation, le logiciel répartit la commande par point de service et imprime une facture d'avance pour chacun : boissons pour le comptoir, plats pour la cuisine, chèvre pour la grillade.
- **EF-CMD-03** : Chaque facture porte un numéro, la table, le nom du serveur, l'heure, le détail et le montant. Sa souche reste dans le logiciel.
- **EF-CMD-04** : Une nouvelle commande pour une table déjà servie crée une facture complémentaire rattachée à la même table.
- **EF-CMD-05** : Une addition récapitulative regroupe toutes les factures d'une table pour le client.
- **EF-CMD-06** : En option, chaque point de service dispose de sa propre imprimante ou d'un écran qui reçoit la commande directement. Le serveur n'a alors plus à se déplacer.
- **RG-CMD-01** : Le stock du point de service diminue dès la validation de la commande.
- **RG-CMD-02** : Après impression, une facture ne peut être modifiée ou annulée qu'avec la validation du gérant et un motif. La facture annulée garde son numéro, porte la mention « annulée », et le stock est rétabli.
- **RG-CMD-03** : Une commande appartient au serveur qui l'a créée. Un autre serveur ne peut ni la modifier ni l'encaisser sans transfert validé par le gérant.

### 4.19 Postes de préparation

- **EF-PRE-01** : Si un écran est installé au comptoir, en cuisine ou à la grillade, il affiche les commandes de ce point de service dans l'ordre d'arrivée, avec le temps écoulé.
- **EF-PRE-02** : Le préparateur marque une commande comme prête, et le serveur en est averti sur son appareil.
- **EF-PRE-03** : Le préparateur peut déclarer un élément épuisé, qui disparaît aussitôt des menus.
- **RG-PRE-01** : L'écran de préparation n'affiche aucun montant.
- **RG-PRE-02** : L'écran de préparation a besoin du réseau pour recevoir les commandes. Sans connexion, la facture d'avance imprimée reste le moyen de transmission.

### 4.20 Encaissement au restaurant

- **EF-ENC-01** : Chaque facture est rattachée à la caisse de son point de service et au serveur qui l'a émise.
- **EF-ENC-02** : Le paiement s'enregistre avec son mode : espèces en francs congolais, dollars au taux du jour ou Mobile Money. Un paiement partiel est possible.
- **EF-ENC-03** : Une vente à crédit exige le nom et le téléphone du client, ainsi que l'accord du gérant.
- **EF-ENC-04** : Le serveur voit à tout moment le montant qu'il détient, par mode de paiement.
- **RG-ENC-01** : Une remise sur une facture du restaurant exige l'accord du gérant.
- **RG-ENC-02** : Une facture non payée au moment de la clôture apparaît en impayé au nom du serveur, jusqu'à son règlement ou sa conversion en dette client validée par le gérant.

### 4.21 Livraison

- **EF-LIV-01** : Une commande en livraison comporte le nom du client, son téléphone, son adresse ou son quartier, l'heure souhaitée et les frais de livraison, définis par zone.
- **EF-LIV-02** : Le gérant attribue la commande à un livreur, qui la voit sur son téléphone.
- **EF-LIV-03** : La commande passe par les statuts en préparation, en route, livrée ou échouée. Chaque changement est horodaté.
- **EF-LIV-04** : Le livreur confirme la remise et l'encaissement. Il remet l'argent à son retour, ce qui est rapproché à la clôture.
- **RG-LIV-01** : Une livraison échouée ne rétablit le stock que si le gérant déclare les plats rapportés réutilisables. Sinon, ils sont enregistrés en perte.

### 4.22 Clôture de service et inventaire de caisse

Aujourd'hui, la caisse est contrôlée en comptant les souches de factures en fin de service. Le logiciel fait ce calcul à la place de l'équipe et en conserve le résultat.

- **EF-CLO-01** : À la fin du service, le logiciel calcule pour chaque serveur et chaque point de service le montant attendu à partir des souches, ventilé par mode de paiement.
- **EF-CLO-02** : La personne déclare le montant compté. L'écart est calculé et figé. S'il n'est pas nul, un commentaire est exigé.
- **EF-CLO-03** : Le stock attendu de chaque point de service (stock du matin, plus réquisitions, moins ventes) est comparé au stock compté, article par article. Les pertes, la casse et la consommation du personnel se déclarent à part.
- **EF-CLO-04** : Le gérant valide la clôture. Le rapport s'imprime ou s'enregistre en PDF et remonte au tableau de bord du propriétaire.
- **EF-CLO-05** : Une clôture de période regroupe plusieurs jours : bénéfice, dépenses, dettes, cash et manquants, comme la fiche d'inventaire actuelle du restaurant.
- **RG-CLO-01** : Un manquant est toujours attribué à une personne nommée : le serveur, le livreur ou le responsable du point de service.
- **RG-CLO-02** : Une clôture validée ne se modifie plus. Une erreur se corrige par une écriture d'ajustement datée et motivée.
- **RG-CLO-03** : Une clôture ne peut pas être validée tant que des opérations de ses appareils restent en attente de synchronisation.

### 4.23 Rapports du restaurant

- **EF-RAP-01** : Ventes par point de service, par serveur, par article et par heure, avec les articles les plus et les moins vendus.
- **EF-RAP-02** : Marge réalisée par article et par point de service, dépenses et bénéfice de la période.
- **EF-RAP-03** : Écarts de caisse et de stock par personne et par période, et historique des clôtures.
- **EF-RAP-04** : Exports en PDF avec l'en-tête de l'établissement, en Excel (montants additionnables) et en CSV.
- **RG-RAP-01** : La marge est calculée sur les ventes réellement réalisées, et le stock restant est valorisé à son prix de revient. La fiche actuelle, qui valorise les achats au prix de vente, surestime le bénéfice dès qu'une partie du stock n'est pas encore vendue.

### 4.24 Journal d'audit

- **EF-AUD-01** : Toute action sensible laisse une trace : connexions, prix, annulations, remises, réquisitions, ajustements de stock, clôtures, droits et paramètres. Le détail « avant / après » s'ouvre à la demande.
- **EF-AUD-02** : Le journal est un fil chronologique filtrable par domaine, action, auteur et appareil.
- **EF-AUD-03** : Le propriétaire consulte le journal de tous les établissements, le gérant celui de son établissement.
- **EF-AUD-04** : Le journal s'exporte en PDF, Excel et CSV.
- **RG-AUD-01** : Le journal est en lecture seule, sans exception : il ne se modifie pas et ne se purge pas.

## 5. Exigences non fonctionnelles

### 5.1 Performance et conditions réseau

- **ENF-01** : Une commande est enregistrée en moins de 2 secondes, même hors connexion, et imprimée en moins de 5 secondes.
- **ENF-02** : Les écrans courants s'affichent en moins de 3 secondes sur une connexion 3G ordinaire.
- **ENF-03** : La synchronisation d'une journée complète d'un appareil prend moins d'une minute au retour de la connexion.
- **ENF-04** : Le logiciel supporte au moins 30 appareils connectés simultanément, tous établissements confondus, sans dégradation sensible.

### 5.2 Compatibilité

- **ENF-05** : Fonctionnement sur les versions récentes de Chrome, Edge et Firefox, sur ordinateur, tablette et smartphone Android (version 8 et suivantes).
- **ENF-06** : Interface utilisable dès 360 pixels de largeur d'écran. Impression sur imprimantes thermiques de 58 et 80 mm (USB, Bluetooth ou réseau) et au format A4.

### 5.3 Sécurité et confidentialité

- **ENF-07** : Toutes les communications sont chiffrées (HTTPS). Les mots de passe sont hachés avec un algorithme reconnu (Argon2id).
- **ENF-08** : Le contrôle des droits est effectué côté serveur pour chaque requête, jamais seulement à l'affichage. Aucune requête ne donne accès aux données d'un autre établissement.
- **ENF-09** : Les données locales d'un appareil désactivé à distance sont effacées à sa prochaine connexion.
- **ENF-10** : Les données des établissements ne sont accessibles au prestataire qu'à des fins de maintenance, et ne sont ni vendues ni partagées avec des tiers.

### 5.4 Disponibilité et sauvegardes

- **ENF-11** : Disponibilité mensuelle visée de 99 %, hors maintenances planifiées annoncées à l'avance et réalisées en dehors des heures de service du restaurant.
- **ENF-12** : Sauvegarde automatique chiffrée de la base chaque nuit, copiée sur un stockage externe distinct du serveur, conservée 30 jours. Une restauration de test est réalisée chaque mois.
- **ENF-13** : Une panne du serveur central n'interrompt pas le travail dans les établissements, qui continuent hors connexion.

### 5.5 Traçabilité, langue et formats

- **ENF-14** : Toute écriture sensible est tracée (voir 4.24). Aucune suppression physique de données métier.
- **ENF-15** : Interface entièrement en français. Dates au format jj/mm/aaaa, montants avec séparateur de milliers, en francs congolais et en dollars.
