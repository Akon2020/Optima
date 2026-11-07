# Design system d'OPTIMA

Ce document définit les identités visuelles d'OPTIMA, les design tokens, les thèmes clair et sombre et les composants. Il complète la section « Identité visuelle » du `CLAUDE.md`. En cas de contradiction, `docs/DECISIONS.md` fait foi pour ce qui a été décidé, puis ce document.

Légende des statuts : **[CONFIRMÉ]** décidé par le porteur du projet · **[DÉDUIT]** tiré des documents ou des images · **[PROPOSÉ]** recommandation technique modifiable · **[À DÉCIDER]** décision ouverte (voir `docs/DECISIONS.md`).

---

## 1. Deux identités visuelles, un seul système

| Identité | Périmètre | Source |
|---|---|---|
| **Charte générale** | Landing page, pages publiques et institutionnelles, connexion, espace propriétaire, interfaces communes, tout module sans charte propre | Cahier des charges, chapitre 7 **[CONFIRMÉ]** |
| **Charte Restaurant** | Uniquement les écrans du module Restaurant (`/e/[etablissement]/restaurant/...`) et les écrans du socle quand ils sont affichés à l'intérieur d'un établissement de type restaurant **[CONFIRMÉ, D-017]** | Maquettes « Yum Slice » transmises le 7 novembre 2026 **[CONFIRMÉ comme référence]** |

Règles absolues :

1. La charte Restaurant **ne doit jamais** modifier l'apparence de la landing page, de l'espace propriétaire ou d'un autre module.
2. Les deux chartes existent **chacune en clair et en sombre**. Il y a donc quatre combinaisons à maintenir et à tester.
3. Les composants partagés sont **identiques en structure** dans toutes les chartes. Seuls les tokens changent. On ne crée jamais un `RestaurantButton` qui duplique `Button` pour en changer les couleurs.
4. Les documents imprimés (tickets, factures, PDF) **ignorent le thème** : ils sont toujours rendus en clair, avec l'en-tête de l'établissement (voir § 9).

---

## 2. Architecture des tokens [PROPOSÉ]

### 2.1 Trois couches

```
Couche 1 : primitives     Palettes brutes nommées par teinte (--navy-700, --gold-500...).
                          Jamais utilisées directement dans un composant.
Couche 2 : sémantiques    Rôles (--color-surface, --color-text-muted, --color-action...).
                          Ce sont les SEULS tokens que les composants consomment.
                          Valeurs par défaut = charte générale, en clair et en sombre.
Couche 3 : module         Un fichier par identité de module, qui réassigne les tokens
                          sémantiques dans une portée [data-module="..."].
                          Ne crée pas de nouveaux noms de tokens, sauf rôles propres
                          au module (préfixés, ex. --color-kpi-*), documentés ici.
```

### 2.2 Portées CSS

- Le **thème** est porté par l'attribut `data-theme="light" | "dark"` sur `<html>`. Il est posé avant le premier rendu, par un script bloquant (voir § 3).
- L'**identité de module** est portée par l'attribut `data-module="restaurant"` sur l'élément racine du layout du module.
- Les propriétés personnalisées CSS s'héritent, donc tout ce qui est rendu sous `[data-module="restaurant"]` reçoit les tokens Restaurant.

```css
/* Ordre de priorité, du plus faible au plus fort */
:root                                         { /* charte générale, clair  */ }
:root[data-theme="dark"]                      { /* charte générale, sombre */ }
[data-module="restaurant"]                    { /* Restaurant, clair       */ }
:root[data-theme="dark"] [data-module="restaurant"] { /* Restaurant, sombre */ }
```

Les fichiers de tokens sont déclarés dans `@layer tokens`, placée avant `base`, `components` et `utilities`. Ainsi, aucune règle de composant ne peut écraser un token par accident.

### 2.3 Piège des portails (dialogues, menus, toasts)

Les composants rendus dans un portail (modale, popover, menu déroulant, toast) sont attachés à `<body>`, donc **hors** de `[data-module]`. Sans précaution, ils perdraient la charte du module.

Règle **[PROPOSÉ, obligatoire si portails]** : le composant `ModuleScope` rend la racine `[data-module]` et y place un conteneur de portail (`<div data-portal-root />`). Il expose ce conteneur par un contexte React. Tous les composants partagés à portail (`Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip`, `Toast`) lisent ce contexte et passent le conteneur à la prop `container` du portail Radix. Il ne faut jamais appeler directement un portail sans passer par ces composants.

### 2.4 Arborescence des fichiers

```
src/styles/
├── globals.css               # imports, @layer, @theme inline (mapping Tailwind), base
├── tokens/
│   ├── primitives.css        # couche 1 : toutes les palettes brutes
│   ├── semantic.light.css    # couche 2 : charte générale, clair (:root)
│   └── semantic.dark.css     # couche 2 : charte générale, sombre
└── modules/
    └── restaurant.css        # couche 3 : Restaurant clair + sombre
```

Ajouter une identité de module, par exemple pour la boutique de la phase 2 :

1. Créer `src/styles/modules/<module>.css` avec les deux blocs (clair, sombre), en ne réassignant **que** des tokens sémantiques existants.
2. L'importer dans `globals.css`, dans `@layer tokens`.
3. Envelopper le layout du module dans `<ModuleScope module="<module>">`.
4. Documenter la charte ici, dans une nouvelle section.
5. Ajouter les combinaisons aux tests visuels (§ 10).

### 2.5 Intégration avec Tailwind CSS v4 [APPLIQUÉ le 07/11/2026]

Tailwind lit les tokens sémantiques et ne contient aucune couleur en dur. **Écart par rapport à la première version de ce document** : le mapping `@theme inline { --color-bg: var(--color-bg); }` produit une variable **cyclique** (Tailwind émet `--color-bg: var(--color-bg)` dans `:root`, ce qui invalide le token ; vérifié avec Tailwind 4). Mise en œuvre retenue :

```css
/* src/styles/globals.css (extrait) */
@layer theme, tokens, base, components, utilities;
@import "tailwindcss";
@import "./tokens/primitives.css" layer(tokens);
@import "./tokens/semantic.light.css";            /* @theme { --color-*: initial; --color-bg: ...; } */
@import "./tokens/semantic.dark.css" layer(tokens);
@import "./modules/restaurant.css" layer(tokens);

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

- Les tokens sémantiques de la **charte générale claire** sont déclarés directement dans `@theme` : Tailwind génère les utilitaires (`bg-surface`, `text-text-muted`, `rounded-card`, `shadow-card`...).
- `--color-*: initial` retire toutes les couleurs par défaut de Tailwind : aucune palette brute (`bg-red-500`) n'est utilisable.
- Le thème sombre et les chartes de module redéfinissent les mêmes variables dans la couche `tokens`, **placée après** la couche `theme` de Tailwind : elles l'emportent sans conflit de spécificité.
- Les documents imprimés utilisent des tokens dédiés (`--color-ticket-*`) que les thèmes ne redéfinissent jamais (§ 9).

Garde-fous **[PROPOSÉ]** :

- Stylelint interdit les couleurs littérales (`#...`, `rgb(...)`) hors de `src/styles/tokens/` et `src/styles/modules/`.
- Une règle ESLint (ou un test) interdit les classes arbitraires de couleur (`bg-[#...]`, `text-[#...]`).
- La variante `dark:` de Tailwind ne doit servir qu'en dernier recours. Si un composant a besoin de `dark:`, c'est généralement qu'il manque un token sémantique.

---

## 3. Thèmes clair et sombre [CONFIRMÉ : obligatoire partout]

### 3.1 Comportement attendu

- Trois préférences possibles : **Clair**, **Sombre**, **Système**. La valeur par défaut est **Système** : on suit `prefers-color-scheme`. **[CONFIRMÉ]**
- Le changement de thème est **immédiat**, sans rechargement, et s'applique à toutes les pages, à tous les modules et à tous les composants, y compris les portails, les graphiques, les toasts et les états vides. **[CONFIRMÉ]**
- Le choix est conservé d'une session à l'autre. **[CONFIRMÉ]**
- Aucun flash du mauvais thème au chargement : un script inline, placé dans `<head>` avant le CSS, lit la préférence et pose `data-theme`. **[PROPOSÉ]**
- La propriété CSS `color-scheme: light | dark` est posée avec le thème, pour que les contrôles natifs, les barres de défilement et l'autofill s'adaptent.

### 3.2 Persistance [PROPOSÉ]

| Situation | Mécanisme |
|---|---|
| Visiteur non connecté (landing) | `localStorage`, clé `optima:theme`, valeurs `light`, `dark`, `system` |
| Utilisateur connecté | Même clé locale, **et** champ `users.theme_preference` en base, synchronisé à chaque changement (fonctionne hors connexion via la file de synchronisation) |
| Connexion sur un nouvel appareil | La valeur du profil serveur est appliquée et recopiée en local |
| Appareil partagé du restaurant (changement d'utilisateur par code PIN) | Le thème de l'utilisateur actif est appliqué à chaque changement d'utilisateur |

Implémentation recommandée : la bibliothèque `next-themes` (`attribute="data-theme"`, `defaultTheme="system"`, `enableSystem`, `storageKey="optima:theme"`, `disableTransitionOnChange`). Elle couvre le script anti-flash, le mode système et la synchronisation entre onglets. Si cette dépendance est refusée, il faut réimplémenter ces trois points à l'identique dans `src/shared/theme/`.

### 3.3 Sélecteur de thème

- Un unique composant partagé, `ThemeSwitcher`, en contrôle segmenté à trois options (icônes soleil, lune, écran, avec libellés accessibles).
- Il est présent dans l'en-tête de la landing page, dans la barre supérieure de l'espace propriétaire et des établissements, et dans le menu utilisateur.
- Il est utilisable au clavier et annonce son état (`role="radiogroup"`, `aria-checked`).

### 3.4 Ce qui doit suivre le thème

Les éléments suivants suivent le thème sans exception : textes, icônes (via `currentColor`), bordures, surfaces, ombres (plus discrètes en sombre, compensées par des bordures), états de survol, de focus, d'activité et de désactivation, graphiques (couleurs lues dans les tokens, jamais codées en dur), skeletons, illustrations (variantes clair et sombre, ou SVG en `currentColor`), logos (variante claire du logo OPTIMA sur fond sombre), images de plats (sans fond blanc incrusté, ou posées sur une surface dédiée).

---

## 4. Charte générale

**Source : cahier des charges, chapitre 7.** Bleu nuit et blanc, rendu sobre et lisible, états jamais portés par la seule couleur, chiffres à chasse fixe, mode clair par défaut et mode sombre au choix. Le cahier précise que cette charte sera « confirmée ou remplacée par celle du propriétaire lors du cadrage » **[À DÉCIDER, voir D-Q11]**.

Valeurs confirmées par le cahier : `#1F3864` (bleu nuit principal), `#EEF2F8` (nuance très claire des encadrés), `#D0D5DD` (filets), `#1A1A1A` (texte), `#6B6B6B` (texte secondaire). Le reste des palettes ci-dessous est **[PROPOSÉ]** et construit autour de ces valeurs.

### 4.1 Primitives

```css
/* src/styles/tokens/primitives.css (charte générale) */
:root {
  --navy-50:  #EEF2F8;  /* [CONFIRMÉ] encadrés */
  --navy-100: #DCE3F0;
  --navy-200: #B9C7E1;
  --navy-300: #8AA4D0;
  --navy-400: #5E80BC;
  --navy-500: #3E62A3;
  --navy-600: #2C4D88;
  --navy-700: #1F3864;  /* [CONFIRMÉ] couleur principale */
  --navy-800: #172A4B;
  --navy-900: #101D34;
  --navy-950: #0A1324;

  --slate-0:   #FFFFFF;
  --slate-50:  #F7F8FA;
  --slate-100: #EEF0F3;
  --slate-200: #D0D5DD;  /* [CONFIRMÉ] filets */
  --slate-300: #B4BBC6;
  --slate-400: #8C95A3;
  --slate-500: #6B6B6B;  /* [CONFIRMÉ] texte secondaire */
  --slate-600: #4B5563;
  --slate-700: #344054;
  --slate-800: #1D2939;
  --slate-900: #1A1A1A;  /* [CONFIRMÉ] texte */
  --slate-950: #0B1220;

  --green-600: #1E8E5A;  --green-100: #DDF3E8;
  --red-600:   #C8322B;  --red-100:   #FBE1DF;
  --amber-600: #B45309;  --amber-100: #FEF0D9;
}
```

### 4.2 Tokens sémantiques

| Token | Clair | Sombre | Usage |
|---|---|---|---|
| `--color-bg` | `--slate-0` | `#0B1220` | Fond de page |
| `--color-bg-subtle` | `--slate-50` | `#0F172A` | Bandes de section, fonds secondaires |
| `--color-surface` | `--slate-0` | `#111B2E` | Cartes, panneaux |
| `--color-surface-raised` | `--slate-0` | `#16233B` | Modales, menus (avec ombre) |
| `--color-surface-inverse` | `--navy-700` | `#1A2B4C` | Bandeaux forts (hero, CTA) |
| `--color-border` | `--slate-200` | `#24324D` | Bordures, filets |
| `--color-border-strong` | `--slate-300` | `#33456A` | Champs de formulaire |
| `--color-text` | `--slate-900` | `#E6EBF3` | Texte principal |
| `--color-text-muted` | `--slate-500` | `#A3AEC2` | Texte secondaire |
| `--color-text-subtle` | `--slate-400` | `#7C889E` | Indications, placeholders |
| `--color-text-inverse` | `--slate-0` | `#FFFFFF` | Texte sur surface inverse |
| `--color-primary` | `--navy-700` | `#4C6FB0` | Bouton principal, éléments de marque |
| `--color-primary-hover` | `--navy-800` | `#5E80BC` | Survol du bouton principal |
| `--color-on-primary` | `#FFFFFF` | `#FFFFFF` | Texte sur `--color-primary` |
| `--color-primary-subtle` | `--navy-50` | `rgba(94,128,188,.16)` | Encadrés, sélection |
| `--color-link` | `--navy-600` | `#9DB4DE` | Liens, texte d'action |
| `--color-action` | `--navy-700` | `#4C6FB0` | Action forte (alias de primary dans la charte générale) |
| `--color-action-hover` | `--navy-800` | `#5E80BC` | |
| `--color-on-action` | `#FFFFFF` | `#FFFFFF` | |
| `--color-accent` | `--navy-500` | `#8AA4D0` | Accent secondaire (indicateurs, graphiques) |
| `--color-focus-ring` | `--navy-500` | `#8AA4D0` | Anneau de focus |
| `--color-success` / `-subtle` | `--green-600` / `--green-100` | `#4CC38A` / `rgba(76,195,138,.16)` | État juste, synchronisé |
| `--color-warning` / `-subtle` | `--amber-600` / `--amber-100` | `#F2A93B` / `rgba(242,169,59,.16)` | Alertes |
| `--color-danger` / `-subtle` | `--red-600` / `--red-100` | `#F07167` / `rgba(240,113,103,.16)` | Manquant, rupture, erreur |
| `--color-chart-1..5` | navy-700, navy-400, slate-400, green-600, amber-600 | navy-300, navy-400, slate-400, `#4CC38A`, `#F2A93B` | Séries de graphiques |

Les valeurs sombres sont **[PROPOSÉ]**. Leurs contrastes doivent être vérifiés (§ 8) avant validation.

### 4.3 Typographie, formes, ombres [PROPOSÉ]

- Police : **Inter** (licence OFL), chargée par `next/font` (auto-hébergée, sans requête vers Google à l'exécution), avec `font-variant-numeric: tabular-nums` pour les montants et les numéros. Le cahier, rédigé en Calibri, ne fixe pas de police web **[À DÉCIDER, voir D-Q11]**.
- Échelle (px) : 12, 14, 16, 18, 20, 24, 30, 36, 48, et 60 pour le titre hero desktop uniquement.
- Graisses : 400 texte, 500 libellés et navigation, 600 titres de carte, 700 titres de section.
- Rayons : `--radius-sm` 4px (badges, cases), `--radius-md` 8px (boutons, champs), `--radius-lg` 12px (cartes), `--radius-xl` 20px (grandes sections de la landing).
- Ombres : sobres. `--shadow-sm: 0 1px 2px rgba(16,24,40,.06)`, `--shadow-md: 0 4px 12px rgba(16,24,40,.08)`, `--shadow-lg: 0 12px 32px rgba(16,24,40,.12)`. En sombre, les ombres sont plus faibles et l'élévation est portée par la teinte de surface et une bordure `--color-border`.

---

## 5. Charte Restaurant

**Source : quatre maquettes « Yum Slice » (tableau de bord, ajout de livreur et de produit, catalogue de produits, liste des commandes).** Les valeurs ci-dessous ont été **mesurées sur les images** **[DÉDUIT]**. Elles sont arrondies et doivent être ajustées à l'œil si le rendu diffère.

### 5.1 Logique de conception observée

- **Fond gris très clair, cartes blanches flottantes.** Le fond de l'application est un gris neutre (`#F1F1F1`). Les cartes sont blanches, avec de grands rayons et des ombres larges et très diffuses. La hiérarchie vient de l'espace et de l'élévation, pas des bordures.
- **Deux accents chauds, une encre presque noire.** Le **doré moutarde** (`#D9A22A`) sert aux actions mises en avant (« Send daily report », « Manage offers »). L'**orange** (`#E2691C`) sert aux indicateurs : début du dégradé des courbes, compteur de commandes, ligne sélectionnée. L'**encre** (`#2F2F2F`) porte les actions fortes et neutres : élément de navigation actif, bouton de validation des formulaires.
- **Cartes « vitrines » sombres.** Les blocs mis en avant (offre du moment, carte) sont des surfaces gris anthracite (`#3A3A3A` à `#474747`) avec texte blanc et bouton doré. Elles cassent le rythme des cartes blanches.
- **Tuiles d'indicateurs pastel.** Chaque KPI a une petite tuile carrée colorée (vert anis, rose saumon, jaune pâle, pêche, gris) contenant une icône. La couleur signale la tendance (vert : hausse, rose : baisse).
- **Tableaux sans grille.** Il n'y a pas de bordures verticales, les en-têtes sont gris clair en petite taille et les lignes sont aérées. La ligne sélectionnée « sort » du tableau : surface blanche, ombre, première colonne en orange. Les statuts sont affichés par une pastille et un libellé.
- **Formulaires en panneau latéral.** L'ajout se fait dans un panneau qui glisse depuis la droite. Les libellés sont petits au-dessus des champs, les champs fins à bordure grise, les étiquettes (chips) supprimables par ×. Le bouton d'import est gris et la validation, pleine largeur, est collée en bas.
- **Typographie géométrique**, sans empattement et aux formes rondes. Les chiffres clés sont grands et en graisse normale, pas en gras.

### 5.2 Primitives

```css
/* src/styles/tokens/primitives.css (palettes Restaurant) */
:root {
  --ink-950: #161616;
  --ink-900: #1F1F1F;   /* texte principal mesuré */
  --ink-800: #2F2F2F;   /* navigation active, bouton plein mesuré */
  --ink-700: #3A3A3A;   /* carte vitrine sombre mesurée (#343434 à #474747) */
  --ink-600: #474747;
  --ink-400: #6E6E6E;   /* texte secondaire : assombri par rapport aux maquettes (contraste, § 8) */
  --ink-300: #B5B5B5;
  --ink-200: #D9D9D9;   /* bouton gris, chips mesurés */
  --ink-150: #E3E3E3;
  --ink-100: #F1F1F1;   /* fond de l'application mesuré */
  --ink-0:   #FFFFFF;

  --gold-600: #B9861A;
  --gold-500: #D9A22A;  /* doré moutarde mesuré (#D8A02A à #DAA22C) */
  --gold-400: #E5B54A;
  --gold-100: #F8F1C8;  /* tuile jaune mesurée */

  --orange-600: #B24A16; /* liens orange : 5,4:1 sur blanc */
  --orange-500: #E2691C; /* courbe et indicateur mesurés (#DF671C, #EB6837) */
  --orange-400: #EDA84B; /* pastille compteur mesurée */
  --orange-100: #FCE9D6; /* remplissage de courbe, fond actif mesuré */

  --kpi-green-bg:  #ECF4C6;  --kpi-green-fg:  #6B8E23;
  --kpi-rose-bg:   #F0CDC2;  --kpi-rose-fg:   #C2452D;
  --kpi-yellow-bg: #F8F1C8;  --kpi-yellow-fg: #A4801A;
  --kpi-peach-bg:  #FAE2DD;  --kpi-peach-fg:  #C2604A;
  --kpi-grey-bg:   #ECEDE8;  --kpi-grey-fg:   #4A4A4A;

  --status-green:  #3DB46D;  /* livré, servi, payé */
  --status-yellow: #E3B530;  /* en cours, en route */
  --status-amber:  #E8902E;  /* en attente */
  --status-grey:   #A3A3A3;  /* inactif, en pause */
  --status-red:    #D64532;  /* annulé, échec */
}
```

### 5.3 Réassignation des tokens sémantiques

```css
/* src/styles/modules/restaurant.css */
[data-module="restaurant"] {
  --color-bg:              var(--ink-100);
  --color-bg-subtle:       #EAEAEA;
  --color-surface:         var(--ink-0);
  --color-surface-raised:  var(--ink-0);
  --color-surface-inverse: var(--ink-700);
  --color-border:          #ECECEC;
  --color-border-strong:   var(--ink-200);
  --color-text:            var(--ink-900);
  --color-text-muted:      var(--ink-400);
  --color-text-subtle:     var(--ink-300);
  --color-text-inverse:    #FFFFFF;

  --color-action:          var(--ink-800);   /* action forte neutre */
  --color-action-hover:    var(--ink-950);
  --color-on-action:       #FFFFFF;

  --color-primary:         var(--gold-500);  /* action mise en avant */
  --color-primary-hover:   var(--gold-600);
  --color-on-primary:      var(--ink-900);   /* voir § 8 : pas de blanc sur doré */
  --color-primary-subtle:  var(--gold-100);

  --color-accent:          var(--orange-500);
  --color-accent-subtle:   var(--orange-100);
  --color-link:            var(--orange-600);
  --color-focus-ring:      var(--gold-500);

  --color-success: var(--status-green);  --color-success-subtle: #E3F5EA;
  --color-warning: var(--status-amber);  --color-warning-subtle: #FDEFD9;
  --color-danger:  var(--status-red);    --color-danger-subtle:  #FBE3DF;

  --color-chart-1: var(--orange-500);
  --color-chart-2: var(--gold-500);
  --color-chart-fill: var(--orange-100);

  --color-nav-active-bg:   var(--ink-800);
  --color-nav-active-text: #FFFFFF;
  --color-badge-bg:        var(--orange-400);
  --color-badge-text:      var(--ink-900);

  --radius-sm: 4px;  --radius-md: 8px;  --radius-lg: 12px;  --radius-card: 16px;
  --shadow-card:     0 8px 24px rgba(0,0,0,.06);
  --shadow-raised:   0 10px 28px rgba(0,0,0,.10);
  --font-sans: var(--font-restaurant);
}

:root[data-theme="dark"] [data-module="restaurant"] {
  --color-bg:              #121212;
  --color-bg-subtle:       #171717;
  --color-surface:         #1C1C1C;
  --color-surface-raised:  #242424;
  --color-surface-inverse: #2A2A2A;   /* vitrines : distinguées par une bordure dorée fine */
  --color-border:          #2A2A2A;
  --color-border-strong:   #3A3A3A;
  --color-text:            #F2F2F2;
  --color-text-muted:      #A6A6A6;
  --color-text-subtle:     #737373;

  --color-action:          #F2F2F2;   /* l'encre s'inverse : bouton clair, texte sombre */
  --color-action-hover:    #FFFFFF;
  --color-on-action:       #121212;

  --color-primary:         #E2AE3D;
  --color-primary-hover:   #ECBE58;
  --color-on-primary:      #161616;
  --color-primary-subtle:  rgba(226,174,61,.16);

  --color-accent:          #EF7F37;
  --color-accent-subtle:   rgba(239,127,55,.16);
  --color-link:            #F09A5C;
  --color-focus-ring:      #E2AE3D;

  --color-success-subtle: rgba(61,180,109,.18);
  --color-warning-subtle: rgba(232,144,46,.18);
  --color-danger-subtle:  rgba(214,69,50,.20);

  --color-chart-1: #EF7F37;  --color-chart-2: #E2AE3D;  --color-chart-fill: rgba(239,127,55,.18);
  --color-nav-active-bg: #F2F2F2;  --color-nav-active-text: #121212;

  --shadow-card:   0 0 0 1px var(--color-border);
  --shadow-raised: 0 12px 32px rgba(0,0,0,.45), 0 0 0 1px var(--color-border);
}
```

Tuiles KPI en sombre **[PROPOSÉ]** : fond = couleur `-fg` à 16 % d'opacité, icône = couleur `-fg` éclaircie de 20 %. Elles sont exposées par les tokens de module `--color-kpi-{green|rose|yellow|peach|grey}-{bg|fg}`, définis dans les deux blocs.

### 5.4 Typographie Restaurant

- Police **[CONFIRMÉ, D-017]** : **Plus Jakarta Sans** (licence OFL, via `next/font`, variable `--font-restaurant`). C'est l'équivalent libre le plus proche de la géométrique des maquettes. Alternative : Satoshi (licence Fontshare gratuite, à auto-héberger).
- Hiérarchie mesurée sur les maquettes :

| Rôle | Taille | Graisse | Couleur |
|---|---|---|---|
| Titre d'écran / de carte (« Sales », « Orders ») | 20px | 500 | `--color-text` |
| Chiffre clé KPI | 22 à 24px | 400 | `--color-text` |
| Libellé de KPI, méta | 12px | 400 | `--color-text-muted` |
| Navigation latérale | 14px | 500 | `--color-text` (actif : `--color-nav-active-text`) |
| En-tête de tableau | 12px | 400 | `--color-text-subtle` |
| Cellule de tableau | 13px | 400 | `--color-text` |
| Nom de plat (carte) | 15px | 600 | `--color-text` |
| Prix | 16px | 600 | `--color-text` |
| Libellé de champ | 12px | 500 | `--color-text` |

### 5.5 Composants Restaurant

Tous ces composants sont des **compositions de composants partagés** (`src/shared/ui`). Ils sont stylés uniquement par les tokens ci-dessus.

- **Barre latérale.** Fond `--color-surface`, logo en haut, éléments icône et libellé de 40px de haut avec un rayon de 8px. L'élément actif est une pastille pleine `--color-nav-active-bg`. Le compteur est une pastille arrondie `--color-badge-bg`. En bas se trouvent un encart d'action (dans les maquettes, « Done for the day? » et un bouton doré) puis le bloc utilisateur (avatar rond, nom, menu).
  - **[CONFIRMÉ, D-017]** : l'élément actif est la pastille encre. La variante « dégradé pêche et filet orange » de la maquette « Products » n'est pas retenue.
  - **[PROPOSÉ]** : l'encart du bas devient « Fin du service ? » avec le bouton « Clôturer mon service » (EF-CLO-01), ce qui donne une fonction réelle à ce motif des maquettes.
- **Barre supérieure.** Champ de recherche souligné (sans cadre) avec une loupe. À droite : statistiques du jour, bouton contour « Exporter », état de synchronisation (EF-OFF-02) et sélecteur de thème.
- **Carte.** Fond `--color-surface`, rayon `--radius-card` (16px), ombre `--shadow-card`, marge intérieure de 24px (16px sur mobile). Titre à gauche, action secondaire à droite (bouton contour « Voir tout › » ou sélecteur de période).
- **Carte vitrine.** Surface `--color-surface-inverse`, texte `--color-text-inverse`, bouton `primary`. À réserver à **une** mise en avant par écran.
- **KPI.** Tuile de 32px, rayon 6px, fond `--color-kpi-*-bg`, icône `--color-kpi-*-fg`. Le chiffre est placé à côté, avec le libellé dessous.
- **Graphique d'aire.** Courbe lissée en dégradé `--color-chart-1` vers `--color-chart-2`, remplissage dégradé `--color-chart-fill` vers transparent, grille horizontale discrète, axes en 11px `--color-text-subtle`.
- **Tableau.**
  - En-tête et lignes sans grille, lignes de 48px.
  - Au survol ou à la sélection, la ligne s'élève : fond `--color-surface-raised`, ombre `--shadow-raised`, première colonne en `--color-accent`.
  - Le statut est une pastille de 8px suivie d'un libellé, jamais la couleur seule.
  - Les actions sont des boutons-icônes.
  - En dessous de 768px, chaque ligne devient une carte.
- **Carte de plat (menu).**
  - Image centrée en haut, avec un indicateur optionnel en coin (par exemple « épuisé », RG-RES-01).
  - Nom, puis unité ou portion et description en 12px `--color-text-muted` sur deux lignes au maximum.
  - Prix en bas à gauche, boutons-icônes à droite (contour, 32px, rayon 6px).
  - Une carte « + Ajouter » de même taille termine la grille.
- **Onglets.** Icône et libellé. L'onglet actif est en `--color-text` avec un soulignement de 2px `--color-action`, les inactifs en `--color-text-muted`.
- **Panneau de formulaire (Sheet).**
  - Il s'ouvre depuis la droite, sur 420 à 480px en desktop et en plein écran sur mobile.
  - Titre et bouton × en haut.
  - Libellés de 12px au-dessus de champs de 40px (bordure 1px `--color-border-strong`, rayon 4px, focus `--color-focus-ring`).
  - Chips supprimables, bouton d'import gris (`--color-bg-subtle`), case à cocher carrée.
  - Bouton de validation pleine largeur `action`, collé en bas.
- **Liste de personnes** (livreurs, serveurs). Avatar rond de 36px avec une pastille de présence, nom en 14px/500 et sous-titre en 12px muted (« 2 livraisons en cours »).
- **Boutons.** Trois variantes, sur une hauteur de 40px (36px en compact) et un rayon `--radius-md` :
  - `action` : plein encre ;
  - `primary` : plein doré, texte encre ;
  - `outline` : contour `--color-border-strong`, texte muted.

### 5.6 Correspondance maquettes et écrans OPTIMA [PROPOSÉ]

Les maquettes montrent une application de livraison de pizzas, en anglais et en roupies. Seuls leur **style** et leurs **motifs** sont repris. Le contenu suit les spécifications d'OPTIMA, en français, en francs congolais et en dollars.

| Maquette | Écran OPTIMA | Exigences |
|---|---|---|
| Dashboard | Tableau de bord du restaurant | EF-TDB-01 à 04 |
| Orders list | Commandes du jour (par table, serveur, point de service) | EF-CMD-01 à 06 |
| Products | Menus (boissons, nourriture) par onglets | EF-RES-02, EF-RES-03 |
| Add new product | Panneau « Nouvel élément de menu » | EF-CAT-01, EF-RES-03 |
| Drivers / Add new driver | Livreurs et ajout d'un livreur | EF-LIV-02, EF-CPT-02 |
| Carte « Expand map » | Non retenue tant que la géolocalisation des livraisons n'est pas spécifiée | Hors périmètre |
| Carte « Recent offer » | Motif de carte vitrine, contenu à définir (ex. stock du matin non saisi) | Motif seulement |

Les maquettes affichent des « Restaurants » (plusieurs adresses). Dans OPTIMA, l'établissement est unique et ses subdivisions sont les **points de service** (comptoir, cuisine, grillade). On ne crée pas de notion de « restaurants multiples » dans le module.

---

## 6. Mise en page et responsive [PROPOSÉ]

- Points de rupture (Tailwind par défaut) : `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536.
- **Approche mobile d'abord** pour tout le module Restaurant : les serveurs travaillent sur des téléphones Android d'entrée de gamme (ENF-05, ENF-06, largeur minimale 360px).
- Navigation Restaurant :
  - à partir de `lg`, barre latérale fixe de 240px ;
  - en dessous, barre latérale en tiroir, plus une **barre d'onglets inférieure** pour le serveur (Tables, Nouvelle commande, Mes commandes, Clôture) **[PROPOSÉ]**.
- Grille de menu : 4 colonnes à partir de `xl`, 3 en `lg`, 2 en dessous. Toujours 2 colonnes sur mobile, pour la rapidité de prise de commande.
- Zones tactiles d'au moins **44 × 44px** sur tous les écrans du serveur.
- Espacements sur une base de 4px (4, 8, 12, 16, 24, 32, 48, 64). Marge intérieure de carte de 24px en desktop et 16px sur mobile, écart entre cartes de 24px en desktop et 16px sur mobile.

## 7. Mouvement [PROPOSÉ]

- Durées : 120ms (survol, pression), 200ms (ouverture de menus, onglets), 300ms (panneaux latéraux, modales). Courbe `cubic-bezier(.2,.8,.2,1)`.
- Animations utiles uniquement : apparition des panneaux, mise en évidence d'une commande prête (EF-PRE-02), confirmation d'enregistrement.
- `prefers-reduced-motion: reduce` désactive les translations et ne garde que les fondus courts.
- Aucune transition de couleur globale au changement de thème (`disableTransitionOnChange`), pour éviter un clignotement de toute l'interface.

## 8. Accessibilité (applicable aux quatre combinaisons)

- Contraste **WCAG 2.2 AA** au minimum : 4,5:1 pour le texte normal, 3:1 pour le texte de 18px ou plus et pour les composants d'interface (bordures de champs, focus, icônes porteuses de sens).
- **Écart volontaire par rapport aux maquettes [CONFIRMÉ, D-017]** : les maquettes mettent du **texte blanc sur le doré** `#D9A22A`, soit un contraste de 2,3:1, insuffisant. OPTIMA met du **texte encre** `#1F1F1F` sur le doré (7,2:1). Si le porteur du projet tient au blanc, le fond de ce bouton doit être assombri au moins jusqu'à `#9A6B0F` (4,7:1).
- Le texte gris très clair des maquettes (libellés `#BDBDBD` à `#D2D2D2` sur blanc) est également insuffisant. Le texte secondaire utilise donc `--color-text-muted` = `#6E6E6E` (5,1:1 sur blanc, 4,5:1 sur le fond `#F1F1F1`), plus foncé que les maquettes. `--color-text-subtle` (`#B5B5B5` en clair, `#737373` en sombre) est réservé aux placeholders et aux éléments non essentiels, jamais à une information nécessaire.
- Focus visible sur tout élément interactif : anneau de 2px `--color-focus-ring` avec un décalage de 2px, jamais supprimé.
- Un statut n'est jamais porté par la seule couleur : toujours un libellé ou une icône (exigence du cahier, chapitre 7).
- Les boutons-icônes ont un `aria-label` en français. Les icônes décoratives ont `aria-hidden`.
- La page est en `lang="fr"`. Les montants sont lus correctement (`Intl.NumberFormat("fr-CD")`).

## 9. Documents imprimés

Les tickets thermiques (58 et 80 mm), les factures A4, les bons de livraison et les PDF (EF-DOC-01 à 04) sont **toujours en clair**, en noir sur blanc pour les tickets. Ils utilisent l'en-tête et la couleur de l'établissement (EF-ETB-01, EF-ETB-02), jamais les tokens de thème. Une feuille `@media print` remet les tokens à leurs valeurs claires.

## 10. Vérification visuelle

Chaque écran livré est vérifié dans les **quatre combinaisons** applicables (charte × thème), à 360px, 768px et 1280px de large. **[PROPOSÉ]** : des tests de captures Playwright (`toHaveScreenshot`) couvrent la landing page (2 thèmes) et chaque écran clé du Restaurant (2 thèmes). Le contraste est contrôlé automatiquement par `@axe-core/playwright`.
