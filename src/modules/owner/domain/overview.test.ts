import { describe, expect, it } from "vitest";

import {
  evolution,
  parsePeriod,
  periodRange,
  summarizeEstablishment,
  totalsByCurrency,
} from "./overview";

const TZ = "Africa/Lubumbashi"; // UTC+2
// 7 novembre 2026, 15 h à Bukavu : la journée d'exploitation a commencé à 6 h (4 h UTC).
const NOW = "2026-11-07T13:00:00.000Z";
const resto = { id: "e1", timeZone: TZ, currency: "CDF" as const };

const sale = (createdAt: string, totalMinor: number, establishmentId = "e1") => ({
  establishmentId,
  createdAt,
  totalMinor,
  currency: "CDF" as const,
});

describe("périodes (EF-PRO-02, HYPOTHÈSE D-Q10)", () => {
  it("la journée va de 6 h à 6 h, la semaine compte 7 journées", () => {
    expect(periodRange("jour", NOW, TZ)).toEqual({
      start: "2026-11-07T04:00:00.000Z",
      end: "2026-11-08T04:00:00.000Z",
      previousStart: "2026-11-06T04:00:00.000Z",
    });
    expect(periodRange("semaine", NOW, TZ).start).toBe("2026-11-01T04:00:00.000Z");
    expect(periodRange("semaine", NOW, TZ).previousStart).toBe("2026-10-25T04:00:00.000Z");
  });

  it("une période inconnue revient à la journée", () => {
    expect(parsePeriod("mois")).toBe("mois");
    expect(parsePeriod("annee")).toBe("jour");
    expect(parsePeriod(undefined)).toBe("jour");
  });
});

describe("ventes d'un établissement (EF-PRO-01)", () => {
  it("additionne la période, la compare à la précédente, ignore les autres établissements", () => {
    const summary = summarizeEstablishment({
      establishment: resto,
      period: "jour",
      nowIso: NOW,
      sales: [
        sale("2026-11-07T05:30:00.000Z", 700_000),
        sale("2026-11-07T12:10:00.000Z", 300_000),
        // Hier soir après minuit : encore la journée d'hier (avant 6 h).
        sale("2026-11-07T01:00:00.000Z", 500_000),
        sale("2026-11-07T06:00:00.000Z", 999_000, "e2"),
      ],
      orders: [
        { establishmentId: "e1", createdAt: "2026-11-07T05:30:00.000Z" },
        { establishmentId: "e1", createdAt: "2026-11-07T12:10:00.000Z" },
      ],
    });
    expect(summary.revenue.amountMinor).toBe(1_000_000);
    expect(summary.previousRevenue.amountMinor).toBe(500_000);
    expect(summary.invoices).toBe(2);
    expect(summary.orders).toBe(2);
    expect(summary.averageOrder.amountMinor).toBe(500_000);
    expect(summary.series).toHaveLength(24);
    expect(summary.series[0]).toMatchObject({ label: "06:00" });
    expect(summary.series[1]?.value.amountMinor).toBe(700_000);
  });

  it("une semaine se découpe en 7 journées datées", () => {
    const summary = summarizeEstablishment({
      establishment: resto,
      period: "semaine",
      nowIso: NOW,
      sales: [sale("2026-11-03T10:00:00.000Z", 200_000)],
      orders: [],
    });
    expect(summary.series.map((point) => point.label)).toEqual([
      "01/11",
      "02/11",
      "03/11",
      "04/11",
      "05/11",
      "06/11",
      "07/11",
    ]);
    expect(summary.series[2]?.value.amountMinor).toBe(200_000);
    expect(summary.averageOrder.amountMinor).toBe(0);
  });
});

describe("totaux et évolution", () => {
  it("ne mélange jamais deux devises", () => {
    const base = {
      previousRevenue: { amountMinor: 0, currency: "CDF" as const },
      invoices: 0,
      averageOrder: { amountMinor: 0, currency: "CDF" as const },
      series: [],
    };
    const totals = totalsByCurrency([
      { ...base, establishmentId: "a", revenue: { amountMinor: 100, currency: "CDF" }, orders: 1 },
      { ...base, establishmentId: "b", revenue: { amountMinor: 200, currency: "CDF" }, orders: 2 },
      {
        ...base,
        establishmentId: "c",
        revenue: { amountMinor: 5_000, currency: "USD" },
        previousRevenue: { amountMinor: 0, currency: "USD" },
        orders: 1,
      },
    ]);
    expect(totals).toEqual([
      expect.objectContaining({
        currency: "CDF",
        orders: 3,
        revenue: { amountMinor: 300, currency: "CDF" },
      }),
      expect.objectContaining({ currency: "USD", orders: 1 }),
    ]);
  });

  it("calcule l'évolution, sans base de comparaison si la période précédente est vide", () => {
    expect(
      evolution({ amountMinor: 150, currency: "CDF" }, { amountMinor: 100, currency: "CDF" }),
    ).toBe(50);
    expect(
      evolution({ amountMinor: 150, currency: "CDF" }, { amountMinor: 0, currency: "CDF" }),
    ).toBe(null);
  });
});
