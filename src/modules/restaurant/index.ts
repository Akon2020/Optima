/**
 * API publique du module Restaurant (CLAUDE.md § 3.2 : les autres modules et
 * `app/` n'importent que ce fichier ou les composants de route du module).
 */
export const RESTAURANT_MODULE = {
  id: "restaurant",
  name: "Restaurant",
  dependsOn: ["catalog", "stock", "sales", "documents"],
  identity: "restaurant",
} as const;

export { DEMO_ESTABLISHMENT_SLUG } from "./offline/demo-data";
