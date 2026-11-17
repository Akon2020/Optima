import { describe, expect, it } from "vitest";

import { actionLabel, describeChanges, domainOf, domainPrefixes } from "./catalog";

describe("catalogue du journal (EF-AUD-02)", () => {
  it("range chaque action dans son domaine", () => {
    expect(domainOf("auth.login.failed")).toBe("auth");
    expect(domainOf("core.staff.suspended")).toBe("core.staff");
    expect(domainOf("core.device.revoked")).toBe("core.device");
    expect(domainOf("owner.module.enabled")).toBe("owner");
    expect(domainOf("restaurant.table.renamed")).toBe("restaurant");
    expect(domainOf("core.audit.exported")).toBe("audit");
    expect(domainOf("owner.audit.exported")).toBe("audit");
    expect(domainPrefixes("owner")).not.toContain("owner.audit.");
  });

  it("donne un libellé français, ou le code d'une action inconnue", () => {
    expect(actionLabel("core.staff.suspended")).toBe("Accès suspendu");
    expect(actionLabel("restaurant.inconnue")).toBe("restaurant.inconnue");
  });

  it("ne garde que les champs modifiés, rôles traduits", () => {
    expect(
      describeChanges(
        { name: "Amani", role: "waiter", servicePointId: null },
        { name: "Amani K.", role: "prep", servicePointId: null },
      ),
    ).toEqual([
      { field: "Nom", before: "Amani", after: "Amani K." },
      { field: "Rôle", before: "Serveur", after: "Poste de préparation" },
    ]);
    expect(describeChanges(undefined, { modules: ["catalog", "stock"] })).toEqual([
      { field: "Modules", before: null, after: "catalog, stock" },
    ]);
  });
});
