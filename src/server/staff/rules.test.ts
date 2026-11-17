import { describe, expect, it } from "vitest";

import { assignableRoles, canManageMember, requiresServicePoint } from "./rules";

describe("gestion du personnel (EF-CPT-01, EF-CPT-03)", () => {
  it("le propriétaire attribue tous les rôles, le gérant tous sauf gérant", () => {
    expect(assignableRoles("owner")).toContain("manager");
    expect(assignableRoles("manager")).toEqual(["waiter", "prep", "courier", "reader"]);
    expect(assignableRoles("waiter")).toEqual([]);
  });

  it("le gérant ne gère ni un autre gérant ni lui-même", () => {
    const manager = { role: "manager" as const, userId: "m1" };
    expect(canManageMember(manager, { role: "waiter", userId: "w1" })).toBe(true);
    expect(canManageMember(manager, { role: "manager", userId: "m2" })).toBe(false);
    expect(canManageMember(manager, { role: "manager", userId: "m1" })).toBe(false);
    expect(
      canManageMember({ role: "owner", userId: "o1" }, { role: "manager", userId: "m1" }),
    ).toBe(true);
  });

  it("seul le poste de préparation est rattaché à un point de service", () => {
    expect(requiresServicePoint("prep")).toBe(true);
    expect(requiresServicePoint("waiter")).toBe(false);
  });
});
