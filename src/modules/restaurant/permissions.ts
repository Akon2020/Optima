/**
 * Permissions déclarées par le module Restaurant (CLAUDE.md § 5.3), conformes
 * à la matrice des droits (docs/SPECIFICATIONS.md § 3).
 *
 * Le contrôle fait ici sur l'appareil n'est qu'un confort d'interface : le
 * serveur revérifiera chaque opération synchronisée (`authorize`).
 */
export const RESTAURANT_PERMISSIONS = [
  "restaurant.order.create",
  "restaurant.order.prep-status",
  "restaurant.menu.read",
  "restaurant.menu.manage",
  "restaurant.morning-stock.read",
  "restaurant.morning-stock.enter",
  "restaurant.table.manage",
  "restaurant.table.release",
  /** Encaisser (EF-ENC-02). Un serveur n'encaisse que ses propres ventes (matrice des droits). */
  "restaurant.payment.collect",
  /** Saisir le taux du dollar (EF-PRX-05, D-042). */
  "restaurant.exchange-rate.manage",
  /** Consulter les clôtures (matrice : lecture pour le lecteur). */
  "restaurant.closing.read",
  /** Déclarer sa propre caisse (EF-CLO-02 : « la sienne »). */
  "restaurant.closing.declare",
  /** Compter le stock d'un point de service en fin de service (EF-CLO-03). */
  "restaurant.closing.count-stock",
  /** Valider la journée (EF-CLO-04 : le gérant). */
  "restaurant.closing.validate",
  /** Demander une annulation ou une remise sur ses commandes (matrice : « Demande »). */
  "restaurant.adjustment.request",
  /** Valider ou refuser ces demandes (matrice : gérant, « Validation »). */
  "restaurant.adjustment.approve",
] as const;

export type RestaurantPermission = (typeof RESTAURANT_PERMISSIONS)[number];

export type RestaurantRole = "owner" | "manager" | "waiter" | "prep" | "courier" | "reader";

const ROLE_PERMISSIONS: Record<RestaurantRole, readonly RestaurantPermission[]> = {
  owner: RESTAURANT_PERMISSIONS,
  manager: RESTAURANT_PERMISSIONS,
  waiter: [
    "restaurant.order.create",
    "restaurant.order.prep-status",
    "restaurant.menu.read",
    "restaurant.table.release",
    "restaurant.payment.collect",
    "restaurant.closing.read",
    "restaurant.closing.declare",
    "restaurant.adjustment.request",
  ],
  prep: ["restaurant.order.prep-status", "restaurant.menu.read", "restaurant.morning-stock.read"],
  courier: [],
  reader: ["restaurant.menu.read", "restaurant.morning-stock.read", "restaurant.closing.read"],
};

export function hasPermission(role: RestaurantRole, permission: RestaurantPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
