# Landing page d'OPTIMA

Spécification de la première interface publique. **Charte générale**, thèmes clair et sombre (voir `docs/DESIGN_SYSTEM.md`). Décisions associées : D-008, D-010, D-012. Questions ouvertes : D-Q01, D-Q11, D-Q26.

## 1. Objectif

En moins d'une minute, un visiteur doit comprendre :

- ce qu'est OPTIMA ;
- le problème qu'il résout ;
- à qui il s'adresse ;
- ses modules et leur état d'avancement ;
- comment il fonctionne au quotidien ;
- pourquoi on peut lui faire confiance ;
- comment y accéder.

## 2. Règles de contenu [CONFIRMÉ : D-012]

- **Aucune** statistique, aucun témoignage, client, logo de partenaire, certification ni tarif inventé.
- **Rien n'est présenté comme disponible** tant que ce n'est pas développé. Au 7 novembre 2026, rien ne l'est. Chaque module porte un badge d'état :
  - « En développement » pour l'espace propriétaire, le socle commerce et le module Restaurant ;
  - « Prévu » pour le module Boutique (phase 2).
- Les établissements réels (Best Food I, Gold Detector M Congo) **ne sont pas nommés** sans accord (D-Q26).
- Les visuels d'interface sont des **compositions abstraites** construites en HTML et CSS avec les tokens : barres, cartes, pastilles. Il n'y a ni chiffres ni noms de clients fictifs crédibles.
- Tous les textes sont centralisés dans un seul fichier de contenu (`src/app/(public)/_content/landing.ts`). Les éléments provisoires sont marqués `placeholder: true` et affichés en développement avec un repère visuel discret, retiré en production.

## 3. Structure de la page

| # | Section | Contenu | Source |
|---|---|---|---|
| 1 | **En-tête** (collant, réduit au défilement) | Logotype « OPTIMA » (provisoire, D-Q11). Ancres : Fonctionnalités, Modules, Fonctionnement, Sécurité. `ThemeSwitcher`. Bouton « Se connecter ». Sur mobile, menu en tiroir accessible (piège du focus, fermeture par Échap) | D-010 |
| 2 | **Hero** | Titre proposé : « Tous vos établissements, un seul outil de gestion. » Sous-titre : « Caisse, stock, commandes et clôtures, même sans connexion. Chaque établissement garde ses données, le propriétaire voit l'ensemble. » Bouton principal « Se connecter », bouton secondaire « Découvrir les modules ». Visuel : aperçu stylisé d'un tableau de bord (abstrait), qui suit le thème | Cahier § 1.1 et 1.2 |
| 3 | **Le constat** | Trois constats, sans chiffres : fiches Excel et souches papier dispersées, calculs refaits à la main, manquants de caisse difficiles à expliquer et absence de vue d'ensemble | Cahier § 1.1 |
| 4 | **Ce qu'OPTIMA apporte** | Quatre bénéfices : vue d'ensemble pour le propriétaire, caisse défendable, stock fiable, travail sans Internet | Cahier § 1.2 |
| 5 | **Modules** | Cartes avec badge d'état : Espace propriétaire, Socle commerce (catalogue, prix, stock, achats, caisse, documents), Restaurant (trois points de service, factures d'avance réparties, stock du matin, fiches recettes, livraison, clôtures), Boutique (phase 2). Mention : « Les modules s'activent établissement par établissement. » | `CLAUDE.md` § 1.6 |
| 6 | **Une journée avec OPTIMA** | Frise en quatre temps, illustrée sur l'exemple du restaurant : Matin (stock du matin), Service (commande puis factures d'avance par point de service), Fin de service (clôture et écarts), Propriétaire (suivi en temps réel) | Parcours P1 à P6 |
| 7 | **Même sans Internet** | Explication courte : enregistrement sur l'appareil, envoi automatique au retour du réseau, rien n'est compté deux fois. Petite animation des états « Hors ligne, 3 opérations en attente » puis « Synchronisé » | EF-OFF-01 à 04 |
| 8 | **Sécurité et traçabilité** | Données séparées par établissement, accès selon le rôle, journal d'audit inaltérable, sauvegardes quotidiennes chiffrées. Formulé comme des **principes de conception**, pas comme une certification | `CLAUDE.md` § 5 |
| 9 | **Appel final** | « Accéder à OPTIMA » et le contact `[À COMPLÉTER : D-Q26]` | D-Q26 |
| 10 | **Pied de page** | Logotype, ancres, mention « © 2026 OPTIMA », mentions légales `[À COMPLÉTER]`, rappel du sélecteur de thème | D-Q26 |

Le bouton « Se connecter » pointe vers `/connexion`. Tant que l'authentification n'existe pas, cette route affiche une page honnête, « Accès bientôt disponible », dans la même charte.

## 4. Direction visuelle [PROPOSÉ, dans le cadre de la charte générale]

- Rendu sobre et institutionnel : grands blancs, bleu nuit pour la structure et les actions, `--color-bg-subtle` pour alterner les sections.
- Le hero et l'appel final utilisent `--color-surface-inverse` (bleu nuit). En sombre, ces bandeaux restent distincts grâce à une surface plus claire et une bordure.
- Composition variée d'une section à l'autre, pour éviter la répétition de grilles identiques : hero asymétrique, constats en liste éditoriale, bénéfices en grille 2 × 2, modules en cartes, frise horizontale (verticale sur mobile), bloc hors connexion en deux colonnes.
- Pas d'éléments décoratifs gratuits : chaque visuel illustre un concept réel (consolidation, répartition des commandes, synchronisation).
- Micro-interactions :
  - élévation légère des cartes au survol ;
  - soulignement animé des liens ;
  - apparition au défilement (fondu et translation de 8px, une seule fois), désactivée si `prefers-reduced-motion`.

## 5. Exigences techniques

- **Rendu** : composants serveur, page entièrement statique. Composants client limités au `ThemeSwitcher`, au menu mobile et à l'observateur d'apparition.
- **Thèmes** : les quatre exigences du `CLAUDE.md` § 4.3 s'appliquent, sans mécanisme propre à la landing page. Il faut vérifier chaque section dans les deux thèmes, visuel du hero compris.
- **SEO** :
  - `metadata` Next.js (titre, description en français, Open Graph, image Open Graph générée par `next/og`) ;
  - `lang="fr"`, URL canonique ;
  - un seul `h1` et une hiérarchie de titres continue ;
  - balisage sémantique (`header`, `nav`, `main`, `section` avec `aria-labelledby`, `footer`) ;
  - indexation : `noindex` par défaut tant que D-Q01 n'est pas tranchée, réglable par une variable d'environnement (`NEXT_PUBLIC_SITE_INDEXABLE`).
- **Performance** : LCP inférieur à 2,5 s, CLS inférieur à 0,05, polices `next/font` en `display: swap`, aucune image lourde (le visuel du hero est en HTML et CSS), aucun script tiers.
- **Accessibilité** :
  - lien d'évitement « Aller au contenu » ;
  - focus visible ;
  - contrastes AA dans les deux thèmes ;
  - navigation complète au clavier ;
  - textes alternatifs ;
  - animations respectant `prefers-reduced-motion`.
- **Responsive** : contrôle à 360, 768, 1024 et 1280px.
- **Tests** :
  - Playwright : chargement, ancres, menu mobile, changement de thème persistant après rechargement ;
  - absence de flash au chargement en mode sombre ;
  - axe sans violation sérieuse ;
  - captures en clair et en sombre.
