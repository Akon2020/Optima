import { describe, expect, it } from "vitest";

import {
  isNeverCached,
  isRestaurantPage,
  isStaticAsset,
  restaurantPagesToWarm,
  sanitizeWarmUrls,
} from "./cache-rules";

describe("règles de cache hors connexion (EF-OFF-05)", () => {
  it("garde les pages du Restaurant, pas les écrans en ligne", () => {
    expect(isRestaurantPage("/e/restaurant-dev/restaurant")).toBe(true);
    expect(isRestaurantPage("/e/restaurant-dev/restaurant/commandes/nouvelle")).toBe(true);
    expect(isRestaurantPage("/e/demo/restaurant/tables")).toBe(true);
    expect(isRestaurantPage("/e/restaurant-dev/equipe")).toBe(false);
    expect(isRestaurantPage("/proprietaire")).toBe(false);
    expect(isRestaurantPage("/e/Resto Majuscule/restaurant")).toBe(false);
  });

  it("ne met jamais en cache l'API, les comptes ni l'administration", () => {
    for (const path of [
      "/api/sync/pull",
      "/api/sync/bootstrap",
      "/proprietaire/audit",
      "/connexion",
      "/compte",
      "/e/restaurant-dev/appareils",
      "/e/restaurant-dev/journal",
      "/e/restaurant-dev/equipe",
      "/sw.js",
    ]) {
      expect(isNeverCached(path), path).toBe(true);
    }
    expect(isNeverCached("/e/restaurant-dev/restaurant")).toBe(false);
  });

  it("reconnaît les fichiers statiques", () => {
    expect(isStaticAsset("/_next/static/chunks/app.js")).toBe(true);
    expect(isStaticAsset("/icons/icon-192.png")).toBe(true);
    expect(isStaticAsset("/manifest.webmanifest")).toBe(true);
    expect(isStaticAsset("/e/restaurant-dev/restaurant")).toBe(false);
  });

  it("prépare les pages du menu, sans doublon ni adresse étrangère", () => {
    expect(restaurantPagesToWarm("resto", ["", "commandes", "commandes", "menus"])).toEqual([
      "/e/resto/restaurant",
      "/e/resto/restaurant/commandes",
      "/e/resto/restaurant/menus",
    ]);
    expect(restaurantPagesToWarm("../api", ["sync"])).toEqual([]);
  });

  it("le service worker n'accepte que des pages Restaurant relatives", () => {
    expect(
      sanitizeWarmUrls([
        "/e/resto/restaurant",
        "https://pirate.test/e/resto/restaurant",
        "//pirate.test/e/resto/restaurant",
        "/api/sync/pull",
        42,
      ]),
    ).toEqual(["/e/resto/restaurant"]);
    expect(sanitizeWarmUrls("pas un tableau")).toEqual([]);
    expect(sanitizeWarmUrls(Array.from({ length: 50 }, () => "/e/resto/restaurant"))).toHaveLength(
      30,
    );
  });
});
