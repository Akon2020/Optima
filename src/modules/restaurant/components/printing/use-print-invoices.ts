"use client";

import { useCallback } from "react";

import { advanceInvoiceReceipt } from "../../domain/receipt";
import type { AdvanceInvoice, ServicePoint } from "../../domain/types";
import { useRestaurant } from "../restaurant-provider";
import { usePrinter } from "./use-printer";

/**
 * Impression des factures d'avance (EF-CMD-03, D-074) : sur l'imprimante
 * thermique de l'appareil si elle est connectée, sinon par la fonction
 * d'impression du navigateur (`fallback`). Les frais de livraison, sans
 * point de service, ne s'impriment pas : ils n'ont rien à préparer.
 */
export function usePrintInvoices() {
  const { establishmentName, ctx } = useRestaurant();
  const printer = usePrinter();

  const printInvoices = useCallback(
    async (
      invoices: readonly AdvanceInvoice[],
      servicePoints: readonly Pick<ServicePoint, "id" | "name">[],
      fallback: () => void,
    ) => {
      const toPrint = invoices.filter((invoice) => invoice.servicePointId !== null);
      if (!printer.port) {
        fallback();
        return;
      }
      await printer.print(
        toPrint.map((invoice) =>
          advanceInvoiceReceipt({
            invoice,
            establishmentName,
            servicePointName:
              servicePoints.find((point) => point.id === invoice.servicePointId)?.name ?? "",
            timeZone: ctx.settings.timeZone,
          }),
        ),
      );
    },
    [printer, establishmentName, ctx.settings.timeZone],
  );

  return {
    printInvoices,
    hasPrinter: printer.port !== null,
    isBusy: printer.isBusy,
    error: printer.error,
  };
}
