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
] as const;

export type RestaurantPermission = (typeof RESTAURANT_PERMISSIONS)[number];

export type RestaurantRole = "owner" | "manager" | "waiter" | "prep" | "courier" | "reader";

const ROLE_PERMISSIONS: Record<RestaurantRole, readonly RestaurantPermission[]> = {
  owner: RESTAURANT_PERMISSIONS,
  manager: RESTAURANT_PERMISSIONS,
  waiter: ["restaurant.order.create", "restaurant.order.prep-status", "restaurant.menu.read"],
  prep: ["restaurant.order.prep-status", "restaurant.menu.read", "restaurant.morning-stock.read"],
  courier: [],
  reader: ["restaurant.menu.read", "restaurant.morning-stock.read"],
};

export function hasPermission(role: RestaurantRole, permission: RestaurantPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
