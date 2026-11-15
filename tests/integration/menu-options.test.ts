import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withContext } from "@/server/db/context";
import { buildBootstrap } from "@/server/sync/bootstrap";
import {
  authenticateDevice,
  registerDevice,
  type AuthenticatedDevice,
} from "@/server/sync/devices";
import { pushOperations } from "@/server/sync/push";

import { createFixtures, createTestDb, type Fixtures, type TestDb } from "./helpers/test-db";

let db: TestDb;
let fx: Fixtures;
let device: AuthenticatedDevice;
let sequence = 0;
const formulaId = crypto.randomUUID();

const cdf = (major: number) => ({ amountMinor: major * 100, currency: "CDF" as const });

const crispyId = crypto.randomUUID();
const cooking = {
  id: crypto.randomUUID(),
  name: "Cuisson",
  isRequired: true,
  isMultiple: false,
  options: [
    { id: crypto.randomUUID(), name: "Normales", priceDelta: cdf(0) },
    { id: crispyId, name: "Bien croustillantes", priceDelta: cdf(500) },
  ],
};

beforeAll(async () => {
  db = await createTestDb();
  fx = await createFixtures(db.prisma);
  await db.asApp();
  const { token } = await registerDevice(
    db.prisma,
    { userId: fx.managerA.id, isOwner: false, isElevated: true },
    { establishmentId: fx.a.id, name: "Téléphone salle" },
  );
  const authenticated = await authenticateDevice(db.prisma, `Device ${token}`);
  if (!authenticated) throw new Error("appareil attendu");
  device = authenticated;
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.pg.close();
});

function envelope(type: string, userId: string, payload: unknown) {
  return {
    id: crypto.randomUUID(),
    type,
    establishmentId: fx.a.id,
    userId,
    deviceId: device.id,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    payload,
  };
}

async function push(operation: ReturnType<typeof envelope>) {
  const [result] = await pushOperations(db.prisma, device, [operation]);
  return result && "code" in result ? result.code : result?.status;
}

function inA<T>(run: Parameters<typeof withContext<T>>[2]) {
  return withContext(db.prisma, { establishmentId: fx.a.id, isOwner: false }, run);
}

function formula(components: string[], id = formulaId) {
  return envelope("restaurant.menu-item.created", fx.managerA.id, {
    item: {
      id,
      servicePointId: fx.a.kitchen.id,
      name: "Formule frites et bière",
      description: "",
      category: "Formules",
      unit: "dish",
      price: cdf(6_000),
      kind: "formula",
      components,
    },
  });
}

function order(
  lines: { menuItemId: string; quantity: number; optionIds?: string[] }[],
  points: string[],
) {
  sequence += 1;
  const orderId = crypto.randomUUID();
  return {
    orderId,
    operation: envelope("restaurant.order.created", fx.waiterA.id, {
      orderId,
      number: `CMD-2026-${device.code}-${String(sequence).padStart(6, "0")}`,
      createdAt: new Date().toISOString(),
      mode: "takeaway",
      tableId: null,
      lines,
      invoices: points.map((servicePointId, index) => ({
        id: crypto.randomUUID(),
        number: `FAC-2026-${device.code}-${String(sequence * 10 + index).padStart(6, "0")}`,
        servicePointId,
      })),
    }),
  };
}

describe("options des éléments (D-035, D-060)", () => {
  it("seul le gérant les fixe, dans la devise de l'établissement ; audit et diffusion", async () => {
    const set = (userId: string, groups: unknown[]) =>
      envelope("restaurant.menu-item.options-set", userId, {
        itemId: fx.a.fries.id,
        optionGroups: groups,
      });
    expect(await push(set(fx.waiterA.id, [cooking]))).toBe("FORBIDDEN");
    expect(
      await push(
        set(fx.managerA.id, [
          {
            ...cooking,
            options: [{ ...cooking.options[0], priceDelta: { amountMinor: 0, currency: "USD" } }],
          },
        ]),
      ),
    ).toBe("CURRENCY_MISMATCH");
    expect(await push(set(fx.managerA.id, [cooking]))).toBe("accepted");

    const { item, audit, change } = await inA(async (tx) => ({
      item: await tx.menuItem.findUniqueOrThrow({ where: { id: fx.a.fries.id } }),
      audit: await tx.auditLog.findFirst({
        where: { action: "restaurant.menu-item.options-set", entityId: fx.a.fries.id },
      }),
      change: await tx.changeLog.findFirst({
        where: { entity: "menu_item", entityId: fx.a.fries.id },
        orderBy: { seq: "desc" },
      }),
    }));
    expect(item.optionGroups).toHaveLength(1);
    expect(audit).not.toBeNull();
    expect(change?.data).toMatchObject({ optionGroups: [{ name: "Cuisson" }] });
  });

  it("le serveur recalcule le supplément et fige les options sur la ligne", async () => {
    const { orderId, operation } = order(
      [{ menuItemId: fx.a.fries.id, quantity: 2, optionIds: [crispyId] }],
      [fx.a.kitchen.id],
    );
    expect(await push(operation)).toBe("accepted");
    const line = await inA(async (tx) => {
      const invoice = await tx.advanceInvoice.findFirstOrThrow({ where: { orderId } });
      return tx.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    });
    expect(line.unitPriceMinor).toBe(450_000n);
    expect(line.lineTotalMinor).toBe(900_000n);
    expect(line.options).toMatchObject([{ groupName: "Cuisson", name: "Bien croustillantes" }]);
  });

  it("une vente hors connexion n'est pas refusée si les options ont changé entre-temps", async () => {
    const { operation } = order(
      [{ menuItemId: fx.a.fries.id, quantity: 1, optionIds: [crypto.randomUUID()] }],
      [fx.a.kitchen.id],
    );
    expect(await push(operation)).toBe("accepted");
  });
});

describe("formules (D-035, D-060)", () => {
  it("se composent d'éléments de l'établissement seulement", async () => {
    expect(await push(formula([fx.a.fries.id, fx.b.beer.id], crypto.randomUUID()))).toBe(
      "COMPONENT_NOT_FOUND",
    );
    expect(await push(formula([fx.a.fries.id], crypto.randomUUID()))).toBe("FORMULA_SIZE");
    expect(await push(formula([fx.a.fries.id, fx.a.beer.id]))).toBe("accepted");
  });

  it("se répartissent entre les points de service, au prix de la formule", async () => {
    const { orderId, operation } = order(
      [{ menuItemId: formulaId, quantity: 2 }],
      [fx.a.counter.id, fx.a.kitchen.id],
    );
    expect(await push(operation)).toBe("accepted");
    const { saved, lines } = await inA(async (tx) => ({
      saved: await tx.order.findUniqueOrThrow({ where: { id: orderId } }),
      lines: await tx.invoiceLine.findMany({
        where: {
          invoiceId: {
            in: (await tx.advanceInvoice.findMany({ where: { orderId } })).map((row) => row.id),
          },
        },
      }),
    }));
    // 6 000 FC réparti sur frites (4 000) et bière (3 500) : 3 200 et 2 800.
    expect(saved.totalMinor).toBe(1_200_000n);
    expect(lines.map((line) => line.unitPriceMinor).sort()).toEqual([280_000n, 320_000n]);
    expect(lines.every((line) => line.formulaItemId === formulaId)).toBe(true);
  });

  it("l'état initial des appareils porte la formule et les options", async () => {
    const bootstrap = await buildBootstrap(db.prisma, device);
    const items = new Map(bootstrap.menuItems.map((item) => [item.id, item]));
    expect(items.get(formulaId)).toMatchObject({
      kind: "formula",
      components: [fx.a.fries.id, fx.a.beer.id],
    });
    expect(items.get(fx.a.fries.id)?.optionGroups).toHaveLength(1);
    const formulaLines = bootstrap.invoices
      .flatMap((invoice) => invoice.lines)
      .filter((line) => line.formula);
    expect(formulaLines[0]?.formula).toMatchObject({ name: "Formule frites et bière" });
  });
});
