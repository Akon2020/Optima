"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { encodeEscPos, type PaperWidth, type Receipt } from "../../domain/receipt";
import {
  choosePrinter,
  closePrinter,
  isPrinterSupported,
  knownPrinter,
  printerKind,
  savePaperWidth,
  savedPaperWidth,
  sendToPrinter,
  subscribePaperWidth,
  type PrinterPort,
} from "../../offline/printer";

export type PrinterState = {
  /** `null` tant que l'appareil n'a pas été interrogé (rendu serveur). */
  isSupported: boolean | null;
  port: PrinterPort | null;
  kind: "bluetooth" | "usb" | null;
  paper: PaperWidth;
  isBusy: boolean;
  error: string | null;
  connect: () => Promise<void>;
  forget: () => Promise<void>;
  setPaper: (paper: PaperWidth) => void;
  /** Imprime les tickets à la suite ; renvoie `false` sans imprimante connectée. */
  print: (receipts: readonly Receipt[]) => Promise<boolean>;
};

/**
 * Imprimante thermique de cet appareil (D-074). L'autorisation donnée une
 * fois au navigateur est retrouvée aux visites suivantes : il suffit de
 * rallumer l'imprimante.
 */
const noSubscription = () => () => {};

export function usePrinter(): PrinterState {
  // Lus dans le navigateur seulement : `null` et 58 mm au rendu serveur.
  const isSupported = useSyncExternalStore(noSubscription, isPrinterSupported, () => null);
  const paper = useSyncExternalStore(subscribePaperWidth, savedPaperWidth, (): PaperWidth => 58);
  const [port, setPort] = useState<PrinterPort | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPrinterSupported()) return;
    void knownPrinter()
      .then(setPort)
      .catch(() => setPort(null));
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    try {
      setPort(await choosePrinter());
    } catch (caught) {
      // Fenêtre de choix fermée sans sélection : pas une erreur.
      if (caught instanceof DOMException && caught.name === "NotFoundError") return;
      setError(
        "Connexion impossible. Appairez d'abord l'imprimante dans les réglages Bluetooth du téléphone (ou branchez-la en USB), puis réessayez.",
      );
    }
  }, []);

  const forget = useCallback(async () => {
    if (port) await closePrinter(port);
    setPort(null);
  }, [port]);

  const setPaper = useCallback((next: PaperWidth) => savePaperWidth(next), []);

  const print = useCallback(
    async (receipts: readonly Receipt[]) => {
      if (!port) return false;
      setIsBusy(true);
      setError(null);
      try {
        for (const receipt of receipts) await sendToPrinter(port, encodeEscPos(receipt, paper));
        return true;
      } catch (caught) {
        await closePrinter(port);
        setError(
          caught instanceof Error && caught.message.startsWith("L'imprimante")
            ? caught.message
            : "Impression impossible. Vérifiez que l'imprimante est allumée, chargée et proche, puis réessayez.",
        );
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [port, paper],
  );

  return {
    isSupported,
    port,
    kind: port ? printerKind(port) : null,
    paper,
    isBusy,
    error,
    connect,
    forget,
    setPaper,
    print,
  };
}
