import {
  RESTAURANT_PERMISSIONS,
  hasPermission as restaurantHasPermission,
  type RestaurantPermission,
} from "./restaurant/permissions";

/**
 * Registre des modules (CLAUDE.md § 2.5, § 2.6, EF-MOD-01, RG-MOD-02).
 * Ajouter un type d'établissement = déclarer un module ici, sans toucher au socle.
 */
export const MODULES = [
  { id: "core", name: "Noyau", dependsOn: [], isCore: true },
  { id: "owner", name: "Espace propriétaire", dependsOn: [], isCore: true },
  { id: "catalog", name: "Catalogue et prix", dependsOn: [], isCore: false },
  { id: "stock", name: "Stock", dependsOn: ["catalog"], isCore: false },
  { id: "purchases", name: "Achats et fournisseurs", dependsOn: ["stock"], isCore: false },
  { id: "sales", name: "Caisse et ventes", dependsOn: ["catalog"], isCore: false },
  { id: "documents", name: "Documents", dependsOn: ["sales"], isCore: false },
  { id: "treasury", name: "Trésorerie et dépenses", dependsOn: ["sales"], isCore: false },
  { id: "customers", name: "Clients et dettes", dependsOn: ["sales"], isCore: false },
  { id: "lots", name: "Lots et péremption", dependsOn: ["stock"], isCore: false },
  { id: "barcodes", name: "Code-barres et étiquettes", dependsOn: ["catalog"], isCore: false },
  {
    id: "restaurant",
    name: "Restaurant",
    dependsOn: ["catalog", "stock", "sales", "documents"],
    isCore: false,
  },
  { id: "preparation", name: "Postes de préparation", dependsOn: ["restaurant"], isCore: false },
  { id: "recipes", name: "Fiches recettes", dependsOn: ["restaurant", "stock"], isCore: false },
  { id: "delivery", name: "Livraison", dependsOn: ["restaurant"], isCore: false },
  { id: "reports", name: "Rapports", dependsOn: [], isCore: false },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];

/** Permissions du noyau, communes à tous les établissements. */
export const CORE_PERMISSIONS = [
  "core.staff.manage",
  "core.device.register",
  "core.device.revoke",
  "core.audit.read",
  "core.settings.manage",
] as const;

export type CorePermission = (typeof CORE_PERMISSIONS)[number];
export type Permission = CorePermission | RestaurantPermission;
export type MemberRole = "manager" | "waiter" | "prep" | "courier" | "reader";

const CORE_ROLE_PERMISSIONS: Record<MemberRole, readonly CorePermission[]> = {
  manager: CORE_PERMISSIONS,
  waiter: [],
  prep: [],
  courier: [],
  reader: [],
};

export function isPermission(value: string): value is Permission {
  return (
    (CORE_PERMISSIONS as readonly string[]).includes(value) ||
    (RESTAURANT_PERMISSIONS as readonly string[]).includes(value)
  );
}

/** Module auquel appartient une permission (préfixe avant le premier point). */
export function permissionModule(permission: Permission): ModuleId {
  return permission.split(".")[0] as ModuleId;
}

/** Matrice des droits (docs/SPECIFICATIONS.md § 3). Le propriétaire a tous les droits. */
export function roleHasPermission(role: MemberRole | "owner", permission: Permission): boolean {
  if (role === "owner") return true;
  if (permission.startsWith("core.")) {
    return CORE_ROLE_PERMISSIONS[role].includes(permission as CorePermission);
  }
  return restaurantHasPermission(role, permission as RestaurantPermission);
}

/** RG-MOD-02 : modules manquants pour activer un module. */
export function missingDependencies(module: ModuleId, enabled: ReadonlySet<string>): ModuleId[] {
  const definition = MODULES.find((entry) => entry.id === module);
  return (definition?.dependsOn ?? []).filter((dependency) => !enabled.has(dependency));
}
