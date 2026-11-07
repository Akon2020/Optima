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

---

## 2. Questions ouvertes

### A. Vision et usage

**D-Q01. À qui s'adresse la landing page ?** · *Indispensable pour la landing page (contenu et indexation)*
OPTIMA est réservé aux établissements du propriétaire (D-005). La landing page n'a donc pas de rôle commercial évident.
- Option 1 : **vitrine sobre** qui présente OPTIMA au personnel et aux partenaires, avec accès à la connexion.
- Option 2 : simple page de connexion avec une courte présentation.
- Option 3 : vitrine pensée pour une commercialisation future.

Recommandation : option 1, **non indexée** par les moteurs de recherche (`noindex`) tant qu'une ouverture au public n'est pas décidée. Le balisage SEO (titre, description, Open Graph, structure) est fait de toute façon.

**D-Q02. D'autres types d'établissements sont-ils prévus après la boutique ?** · *Recommandation suffisante*
Cela influence le registre des modules. Recommandation : ne rien préparer de spécifique au-delà de l'architecture modulaire.

### B. Règles métier du restaurant

Les questions D-Q03 à D-Q10 correspondent aux hypothèses de la section 1.5 du cahier.

**D-Q03. Qui reçoit l'argent du client ?** · *Indispensable avant l'encaissement et la clôture (phase 4 du planning)*
- Option 1 : le serveur, qui reverse ensuite à la caisse de chaque point de service (hypothèse actuelle).
- Option 2 : chaque point de service encaisse directement.
- Option 3 : une caisse centrale unique.

Cela détermine qui est responsable d'un manquant et la structure des clôtures.

**D-Q04. La facture d'avance est-elle payée avant le service ou à la fin du repas ?** · *Indispensable avant l'encaissement*
Cela décide si une commande peut être préparée sans paiement, et comment les impayés sont traités (RG-ENC-02).

**D-Q05. Les tables sont-elles numérotées ? Combien ? Faut-il un plan de salle ?** · *Recommandation suffisante*
Recommandation : liste numérotée paramétrable, sans plan graphique en phase 1.

**D-Q06. Les accompagnements (frites, foufou, birayi...) sont-ils vendus seuls, inclus dans un plat, ou les deux ?** · *Indispensable avant les menus et les fiches recettes*
Cela change la structure du menu : élément simple, élément avec options, ou formule.

**D-Q07. Livraison : qui livre, dans quelles zones et à quels frais ?** · *Indispensable avant le module Livraison (phase 5)*
Les livreurs sont-ils du personnel interne ou des motos-taxis payés à la course ? Les frais sont-ils fixes par zone ou au cas par cas ?

**D-Q08. La vente à crédit est-elle autorisée au restaurant ? Pour quels clients et avec quel plafond ?** · *Recommandation suffisante*
Recommandation : autorisée, sur accord du gérant, pour des clients enregistrés, avec un plafond paramétrable.

**D-Q09. Faut-il suivre les emballages consignés (casiers, bouteilles vides) ?** · *Recommandation suffisante*
Recommandation : pas en phase 1.

**D-Q10. Rythme des clôtures.** · *Indispensable avant les clôtures*
Une clôture par jour ou par service (midi et soir) ? Le service peut-il se prolonger après minuit ? Recommandation : la « journée d'exploitation » commence à la saisie du stock du matin et se termine à la clôture validée, quelle que soit l'heure.

**D-Q13. Équipement du restaurant.** · *Indispensable avant l'impression (phase 4)*
Combien de téléphones ou tablettes, et de quel modèle et quelle version d'Android ? Quelles imprimantes (marque, 58 ou 80 mm, Bluetooth, USB ou réseau) ? Y a-t-il un Wi-Fi local ? Quelle est la fréquence des coupures d'électricité ?

**D-Q14. Le magasin (réserve).** · *Indispensable avant les réquisitions*
Existe-t-il un magasin distinct des trois points de service, et qui le gère ? Les boissons passent-elles aussi par une réquisition vers le comptoir, ou le comptoir reçoit-il directement les achats ?

**D-Q15. Prix et arrondis.** · *Recommandation suffisante*
Les prix des menus sont-ils fixés en francs congolais uniquement ? À quel multiple arrondir (50 ou 100 CDF) ? Le dollar est-il accepté au taux du jour ? Recommandation : prix en CDF, arrondi à 100 CDF, dollar accepté au taux du jour saisi par le gérant.

**D-Q16. Faut-il des fiches clients ?** · *Recommandation suffisante*
Recommandation : uniquement pour la livraison et le crédit. Les clients de salle restent anonymes.

**D-Q17. Repas du personnel, offerts ou pertes.** · *Recommandation suffisante*
Recommandation : sorties déclarées à part, avec un motif (EF-CLO-03), sans passer par la caisse.

### C. Chartes graphiques

**D-Q11. Charte générale : éléments manquants.** · *Recommandation suffisante pour démarrer la landing page*
Existe-t-il un **logo OPTIMA** ? Le bleu nuit `#1F3864` est-il confirmé, ou le propriétaire a-t-il sa propre identité (le cahier prévoit cette possibilité) ? Police web : Inter est recommandée (le cahier est en Calibri, qui n'est pas une police web libre). Recommandation : logotype textuel provisoire « OPTIMA », bleu nuit, Inter.

**D-Q12. Charte Restaurant : quatre points.** · *Recommandation suffisante*
- (a) **Portée** : s'applique-t-elle aussi aux écrans du socle (catalogue, stock, caisse) quand on est dans l'établissement restaurant ? Recommandation : **oui**, à tout l'espace d'un établissement dont le module Restaurant est actif, pour éviter de changer de charte en passant de « Commandes » à « Stock ». L'espace propriétaire, lui, reste en charte générale.
- (b) **Élément de navigation actif** : les maquettes en montrent deux variantes. Recommandation : la pastille encre `#2F2F2F`.
- (c) **Texte sur le bouton doré** : blanc dans les maquettes (contraste 2,3:1, non conforme). Recommandation : texte encre (7,2:1).
- (d) **Police** : Plus Jakarta Sans (libre, recommandée) ou Satoshi (plus proche des maquettes, licence Fontshare).

### D. Thèmes

**D-Q31. Appareil partagé : thème par utilisateur ou par appareil ?** · *Recommandation suffisante*
Recommandation : par utilisateur. Le thème change avec la reprise de main par code PIN.

**D-Q32. Les documents imprimés et les PDF restent-ils toujours en clair ?** · *Recommandation suffisante*
Recommandation : oui (économie d'encre, lisibilité des tickets thermiques).

### E. Technique et exploitation

**D-Q18. Confirmation de la pile technique.** · *Indispensable avant l'initialisation du projet*
La pile proposée par le cahier est : Next.js, TypeScript, PostgreSQL, Prisma, Tailwind CSS v4, Radix UI, Serwist et Dexie pour le hors connexion, pg-boss, Playwright, Docker et Caddy (voir `CLAUDE.md` § 3.1). L'équipe a-t-elle une autre pile imposée ou préférée ? Une version de Node.js, un gestionnaire de paquets ?

**D-Q19. Bibliothèque d'authentification.** · *Indispensable avant le socle serveur*
- Option 1 : **Better Auth** (recommandé : sessions en base, 2FA TOTP, extensible au code PIN par plugin).
- Option 2 : Auth.js.
- Option 3 : implémentation maison avec Argon2id et des sessions en base.

Les exigences, elles, sont fixées au `CLAUDE.md` § 5.1.

**D-Q20. Hébergement, domaine et exploitation.** · *Indispensable avant la préproduction*
Quel hébergeur, quel nom de domaine, qui administre le serveur ? Une préproduction séparée est-elle prévue (recommandé) ?

**D-Q21. Notifications externes (e-mail, SMS, WhatsApp).** · *Recommandation suffisante*
Recommandation : aucune en phase 1. Les alertes sont affichées dans les tableaux de bord et les mots de passe sont réinitialisés par le gérant (EF-AUT-04).

**D-Q22. Dépôt et intégration continue.** · *Recommandation suffisante*
Le dépôt est-il sur GitHub ? Recommandation : GitHub Actions sur `develop` et sur les pull requests vers `main` (typage, lint, tests, build, `pnpm audit`).

**D-Q23. Stockage des fichiers (photos, justificatifs).** · *Recommandation suffisante*
Recommandation : un volume dédié sur le serveur, inclus dans les sauvegardes, derrière une interface interne permettant de passer plus tard à un stockage objet compatible S3.

### F. Sécurité

**D-Q24. Double authentification pour les gérants ?** · *Recommandation suffisante*
Elle est obligatoire pour le propriétaire (EF-AUT-03). Recommandation pour les gérants : proposée, mais pas obligatoire.

**D-Q25. Localisation et durée de conservation des données.** · *Recommandation suffisante*
Un serveur hors de la RDC (en Europe, par exemple) est-il acceptable ? Combien de temps conserver les données des clients de livraison ? Recommandation : hébergement européen, conservation de 3 ans pour les clients inactifs, puis anonymisation. Le journal d'audit et les données comptables sont conservés sans limite.

### G. Landing page

**D-Q26. Contenu de la landing page.** · *Indispensable pour finaliser le contenu (des contenus provisoires marqués permettent de commencer)*
- Nom et slogan : « OPTIMA » seul, ou avec une signature ?
- Appel à l'action : seulement « Se connecter », ou aussi un contact (e-mail, WhatsApp) ?
- Coordonnées et entité juridique pour le pied de page et les mentions légales.
- Peut-on **nommer publiquement** Best Food I et Gold Detector M Congo ? Recommandation : non, sans accord écrit.
- Langue : français seulement ?
- Domaine.

### H. Phase 2 : boutique de gold detectors

**D-Q27.** Les destinations (Kisangani, Goma, Bikenge, Kalemie) sont-elles des **succursales** (avec du personnel utilisant OPTIMA) ou des **agents en dépôt-vente** qui reversent l'argent après la vente ? · *Indispensable avant la phase 2*

**D-Q28.** Les frais d'expédition doivent-ils être ajoutés au **prix de revient** des articles ? · *Indispensable avant la phase 2*

**D-Q29.** Les ventes à crédit se paient-elles **par tranches** avec des échéances fixées ? · *Indispensable avant la phase 2*

**D-Q30.** Quelle **remise maximale** un vendeur peut-il accorder par rapport au tarif ? Que signifie la colonne « Quantité Gape » des fiches actuelles ? · *Indispensable avant la phase 2*

---

## 3. Modèle pour une nouvelle décision

```markdown
| D-0xx | JJ/MM/AAAA | Décision en une ou deux phrases. Conséquences : ... Remplace : D-0yy (le cas échéant). | Qui a décidé |
```
