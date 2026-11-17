/**
 * Textes de la landing page (docs/LANDING_PAGE.md § 2) : tous ici, pour être
 * relus et remplacés en un seul endroit.
 *
 * Règles (D-012, D-051) : aucun chiffre, témoignage, client, logo, tarif ni
 * certification inventé ; les établissements réels ne sont pas nommés ; un
 * module n'est jamais présenté comme disponible avant de l'être. Un texte
 * encore provisoire porte `placeholder: true` et un repère discret en
 * développement.
 */

import { DEMO_ESTABLISHMENT_SLUG } from "@/modules/restaurant";

export type ContentText = { text: string; placeholder?: true };

export const BRAND = {
  name: "OPTIMA",
  /** Signature (D-Q26, tranchée le 16/11/2026 : D-068). */
  tagline: "Pilotez tous vos établissements",
} as const;

export const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#modules", label: "Modules" },
  { href: "#fonctionnement", label: "Fonctionnement" },
  { href: "#securite", label: "Sécurité" },
] as const;

export const LOGIN = { href: "/connexion", label: "Se connecter" } as const;

/** Aperçu du module Restaurant, sur données de démonstration locales (D-018). */
export const DEMO = {
  href: `/e/${DEMO_ESTABLISHMENT_SLUG}/restaurant`,
  label: "Voir la démo",
  note: "Aperçu du module Restaurant, sur des données de démonstration enregistrées seulement dans votre navigateur.",
} as const;

export const HERO = {
  eyebrow: "Gestion commerciale multi-établissements",
  /** Titre complet (image de partage) et ses trois morceaux (mise en page du hero). */
  title: "Tous vos établissements, un seul outil de gestion.",
  titleLead: "Tous vos",
  titleIconWord: "établissements,",
  titleAccent: "un seul outil de gestion.",
  subtitle:
    "Caisse, stock, commandes et clôtures, même sans connexion. Chaque établissement garde ses données, le propriétaire voit l'ensemble.",
  /** Rappel honnête de l'état du projet (D-012). */
  status:
    "OPTIMA est en cours de réalisation : chaque module indique son état, et rien n'est présenté comme disponible avant de l'être.",
} as const;

export const PROBLEMS = {
  eyebrow: "Le constat",
  title: "Des chiffres éparpillés, des écarts sans explication",
  intro: "Aujourd'hui, chaque activité se suit à part, sur papier ou sur tableur.",
  items: [
    {
      title: "Des fiches et des souches dispersées",
      text: "Fiches Excel, souches de factures papier, cahiers : l'information existe, mais elle n'est jamais au même endroit.",
    },
    {
      title: "Des calculs refaits à la main",
      text: "Totaux, stocks et bénéfices se recalculent chaque jour, avec les erreurs de dates et de formules que cela entraîne.",
    },
    {
      title: "Des manquants difficiles à expliquer",
      text: "Quand la caisse ne tombe pas juste, rien ne permet de savoir qui a encaissé quoi, ni à quel moment.",
    },
    {
      title: "Aucune vue d'ensemble",
      text: "Le propriétaire doit réunir lui-même les chiffres de chaque établissement pour savoir où il en est.",
    },
  ],
} as const;

export const BENEFITS = {
  eyebrow: "Ce qu'OPTIMA apporte",
  title: "Un seul outil, du comptoir au propriétaire",
  items: [
    {
      icon: "overview",
      title: "Une vue d'ensemble pour le propriétaire",
      text: "Ventes, caisse, dettes et alertes de tous les établissements, réunies sur un même tableau de bord.",
    },
    {
      icon: "cash",
      title: "Une caisse défendable",
      text: "Chaque facture est rattachée à un serveur et à un point de service ; chaque clôture est comparée au montant attendu.",
    },
    {
      icon: "stock",
      title: "Un stock fiable",
      text: "Stock du matin, ventes et écarts suivis article par article, avec un motif pour chaque correction.",
    },
    {
      icon: "offline",
      title: "Le travail continue sans Internet",
      text: "Les commandes s'enregistrent sur l'appareil et partent d'elles-mêmes au retour du réseau.",
    },
  ],
} as const;

export type ModuleStatus = "development" | "planned";

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  development: "En développement",
  planned: "Prévu",
};

export const MODULES = {
  eyebrow: "Modules",
  title: "Des modules activés établissement par établissement",
  intro: "Chaque établissement n'affiche que les modules dont il a besoin.",
  items: [
    {
      icon: "owner",
      title: "Espace propriétaire",
      status: "development",
      text: "Tableau de bord consolidé, établissements, modules activés, gérants et journal d'audit.",
      features: ["Indicateurs de tous les établissements", "Suspension et réactivation", "Alertes"],
    },
    {
      icon: "core",
      title: "Socle commerce",
      status: "development",
      text: "Les briques communes à toute activité commerciale.",
      features: ["Catalogue et prix", "Stock et achats", "Caisse et documents"],
    },
    {
      icon: "restaurant",
      title: "Restaurant",
      status: "development",
      text: "Pensé pour un restaurant à plusieurs points de service : comptoir, cuisine, grillade.",
      features: [
        "Factures d'avance réparties par point de service",
        "Stock du matin et clôtures",
        "Postes de préparation, fiches recettes, livraison",
      ],
      hasDemo: true,
    },
    {
      icon: "shop",
      title: "Boutique",
      status: "planned",
      text: "Pour la vente d'articles suivis un par un, avec expéditions vers d'autres villes.",
      features: ["Suivi par numéro de série", "Expéditions", "Ventes à crédit par tranches"],
    },
  ],
} as const satisfies {
  eyebrow: string;
  title: string;
  intro: string;
  items: readonly { status: ModuleStatus; [key: string]: unknown }[];
};

export const DAY = {
  eyebrow: "Fonctionnement",
  title: "Une journée avec OPTIMA",
  intro: "L'exemple du restaurant, du matin à la clôture.",
  steps: [
    {
      moment: "Matin",
      title: "Le stock du matin",
      text: "Le gérant confirme le stock de chaque point de service : bouteilles, plats, morceaux. Le logiciel propose, le gérant corrige avec un motif.",
    },
    {
      moment: "Service",
      title: "La commande",
      text: "Le serveur prend la commande sur son téléphone. Une facture d'avance part vers chaque point de service concerné.",
    },
    {
      moment: "Fin de service",
      title: "La clôture",
      text: "Chacun déclare sa caisse, le stock est compté, les écarts sont figés et expliqués, puis le gérant valide la journée.",
    },
    {
      moment: "Propriétaire",
      title: "Le suivi",
      text: "Le propriétaire retrouve les ventes, la caisse et les écarts de chaque établissement, sans attendre un rapport papier.",
    },
  ],
} as const;

export const OFFLINE = {
  eyebrow: "Hors connexion",
  title: "Même sans Internet",
  text: "Une coupure de réseau n'arrête pas le service.",
  points: [
    "Chaque opération est enregistrée d'abord sur l'appareil.",
    "Elle part toute seule dès que le réseau revient.",
    "Envoyée deux fois, elle n'est comptée qu'une fois.",
    "Un refus du serveur est affiché, jamais perdu en silence.",
  ],
  demo: {
    offline: "Hors ligne",
    pending: "3 opérations en attente",
    sending: "Envoi en cours",
    synced: "Synchronisé",
    syncedDetail: "Toutes les opérations sont reçues",
  },
} as const;

export const SECURITY = {
  eyebrow: "Sécurité",
  title: "Sécurité et traçabilité",
  intro: "Des principes de conception, appliqués dès la première ligne de code.",
  items: [
    {
      icon: "isolation",
      title: "Données séparées",
      text: "Les données d'un établissement ne sont jamais accessibles depuis un autre, contrôle vérifié jusque dans la base de données.",
    },
    {
      icon: "roles",
      title: "Accès selon le rôle",
      text: "Propriétaire, gérant, serveur, poste de préparation : chacun ne voit et ne fait que ce que son rôle permet.",
    },
    {
      icon: "audit",
      title: "Journal d'audit inaltérable",
      text: "Prix, annulations, remises, clôtures et changements de droits : chaque action sensible est tracée, sans pouvoir être effacée.",
    },
    {
      icon: "backup",
      title: "Sauvegardes chiffrées",
      // ENF-12 : exigence de la mise en ligne, pas encore en service (D-Q20).
      text: "Prévues pour la mise en ligne : une sauvegarde chiffrée chaque nuit, conservée hors du serveur, et une restauration de test chaque mois.",
    },
  ],
} as const;

export const FINAL_CTA = {
  title: "Prêt à reprendre la main ?",
  text: "Les accès sont créés par le propriétaire ou le gérant de votre établissement. En attendant, la démo du module Restaurant est ouverte à tous.",
} as const;

export const FOOTER = {
  /** Coordonnées (D-Q26, tranchée le 16/11/2026 : D-068). */
  location: "Bukavu, République démocratique du Congo",
  locationShort: "Bukavu, RDC",
  copyright: "© 2026 OPTIMA",
  legal: { href: "/mentions-legales", label: "Mentions légales" },
} as const;

export const LEGAL = {
  title: "Mentions légales",
  sections: [
    {
      title: "Éditeur",
      paragraphs: [
        { text: "OPTIMA, Bukavu, République démocratique du Congo." },
        {
          text: "OPTIMA est un outil de gestion interne, réservé aux établissements de son propriétaire. Il n'est ni vendu ni ouvert à l'inscription.",
        },
      ],
    },
    {
      title: "Hébergement",
      paragraphs: [
        // HYPOTHÈSE D-Q20 : l'hébergeur sera nommé une fois l'offre choisie.
        { text: "L'hébergeur sera précisé lors de la mise en ligne.", placeholder: true },
      ],
    },
    {
      title: "Accès",
      paragraphs: [
        {
          text: "Les comptes sont créés par le propriétaire ou le gérant de chaque établissement. Pour toute question sur un accès, adressez-vous à eux.",
        },
      ],
    },
    {
      title: "Cookies et stockage",
      paragraphs: [
        {
          text: "Un seul cookie est utilisé : celui de la session, indispensable à la connexion. Le thème choisi (clair, sombre ou système) est retenu dans votre navigateur.",
        },
        {
          text: "Pour travailler sans Internet, les appareils du restaurant conservent les données de travail du jour. Ce site n'utilise ni mesure d'audience, ni publicité, ni script tiers.",
        },
      ],
    },
  ],
} as const satisfies {
  title: string;
  sections: readonly { title: string; paragraphs: readonly ContentText[] }[];
};
