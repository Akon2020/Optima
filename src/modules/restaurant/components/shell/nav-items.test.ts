import { describe, expect, it } from "vitest";

import { NAV_ITEMS, enabledNavItems, navItemForPath, navItemModule } from "./nav-items";

describe("menus selon les modules actifs (EF-MOD-02)", () => {
  const segments = (enabled: string[]) =>
    enabledNavItems(NAV_ITEMS, (module) => enabled.includes(module)).map((item) => item.segment);

  it("masque les livraisons sans le module Livraison", () => {
    expect(segments(["restaurant"])).not.toContain("livraisons");
    expect(segments(["restaurant", "delivery"])).toContain("livraisons");
  });

  it("n'affiche plus rien du Restaurant quand le module est désactivé", () => {
    expect(segments(["delivery"])).toEqual(["livraisons"]);
    expect(segments([])).toEqual([]);
  });

  it("retrouve l'élément de la page courante, sous-pages comprises", () => {
    expect(navItemForPath("/e/resto/restaurant", "resto")?.segment).toBe("");
    expect(navItemForPath("/e/resto/restaurant/commandes/nouvelle", "resto")?.segment).toBe(
      "commandes/nouvelle",
    );
    expect(navItemForPath("/e/resto/restaurant/livraisons", "resto")).toMatchObject({
      module: "delivery",
    });
    expect(navItemModule(NAV_ITEMS[0]!)).toBe("restaurant");
    expect(navItemForPath("/e/autre/restaurant", "resto")).toBeNull();
  });
});
