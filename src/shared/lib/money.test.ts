import { describe, expect, it } from "vitest";

import {
  addMoney,
  formatMoney,
  moneyFromMajor,
  moneyFromMinor,
  multiplyMoney,
  sumMoney,
  MoneyError,
} from "./money";

describe("money", () => {
  it("crée un montant entier en unité minimale à partir d'une saisie", () => {
    expect(moneyFromMajor(2500, "CDF")).toEqual({ amountMinor: 250_000, currency: "CDF" });
    expect(moneyFromMajor(1.1, "USD")).toEqual({ amountMinor: 110, currency: "USD" });
  });

  it("refuse un montant non entier en unité minimale", () => {
    expect(() => moneyFromMinor(10.5, "CDF")).toThrow(MoneyError);
  });

  it("refuse d'additionner deux devises différentes", () => {
    expect(() => addMoney(moneyFromMajor(1, "CDF"), moneyFromMajor(1, "USD"))).toThrow(
      /Devises différentes/,
    );
  });

  it("multiplie par une quantité entière uniquement", () => {
    expect(multiplyMoney(moneyFromMajor(3000, "CDF"), 3).amountMinor).toBe(900_000);
    expect(() => multiplyMoney(moneyFromMajor(3000, "CDF"), 1.5)).toThrow(MoneyError);
  });

  it("additionne une liste", () => {
    const total = sumMoney([moneyFromMajor(1000, "CDF"), moneyFromMajor(2500, "CDF")], "CDF");
    expect(total.amountMinor).toBe(350_000);
  });

  it("ENF-15 : formate en français avec séparateur de milliers, sans décimales inutiles", () => {
    const text = formatMoney(moneyFromMajor(15000, "CDF"));
    expect(text).toMatch(/^15 000/);
    expect(text).not.toMatch(/,00/);
    expect(formatMoney(moneyFromMajor(12.5, "USD"))).toMatch(/12,50/);
  });
});
