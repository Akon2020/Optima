"use client";

import { Bluetooth, CircleCheck, Printer, Unplug, Usb } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";

import { CHARS_PER_LINE, layoutReceipt, testReceipt, type PaperWidth } from "../../domain/receipt";
import { useNow } from "../../offline/hooks";
import { usePrinter } from "../printing/use-printer";
import { useRestaurant } from "../restaurant-provider";

const PAPERS: { value: PaperWidth; label: string; hint: string }[] = [
  { value: 58, label: "58 mm", hint: "Imprimante portable des serveurs" },
  { value: 80, label: "80 mm", hint: "Imprimante de comptoir ou de poste" },
];

/**
 * Imprimante de cet appareil (EF-DOC-02, D-074) : connexion en Bluetooth
 * (profil série) ou en USB par Chrome, largeur du papier, ticket d'essai.
 * Sert à valider l'imprimante d'essai avant d'acheter les autres.
 */
export function PrinterScreen() {
  const { establishmentName } = useRestaurant();
  const printer = usePrinter();
  const [printedAt, setPrintedAt] = useState<string | null>(null);
  // Heure de l'aperçu lue dans le navigateur : `null` au rendu serveur.
  const now = useNow();
  const width = CHARS_PER_LINE[printer.paper];
  const preview = now
    ? layoutReceipt(
        testReceipt({ establishmentName, at: now, paper: printer.paper }),
        printer.paper,
      )
    : [];

  async function printTest() {
    setPrintedAt(null);
    const at = new Date().toISOString();
    const ok = await printer.print([testReceipt({ establishmentName, at, paper: printer.paper })]);
    if (ok) setPrintedAt(at);
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Imprimante</h1>
        <p className="mt-1 text-sm text-text-muted">
          L&apos;imprimante thermique de cet appareil, pour les factures d&apos;avance.
        </p>
      </div>

      {printer.isSupported === false ? (
        <Card role="status" className="flex flex-col gap-2">
          <p className="font-medium">Ce navigateur ne sait pas piloter une imprimante.</p>
          <p className="text-sm text-text-muted">
            Utilisez Google Chrome à jour sur Android (ou sur ordinateur). En attendant, les
            factures s&apos;impriment par la fonction d&apos;impression du navigateur.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-6">
        <Card className="flex flex-col gap-5">
          <section aria-labelledby="printer-connection" className="flex flex-col gap-3">
            <h2 id="printer-connection" className="text-lg font-medium">
              Connexion
            </h2>
            {printer.port ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-bg-subtle px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  {printer.kind === "bluetooth" ? (
                    <Bluetooth aria-hidden className="size-4" />
                  ) : (
                    <Usb aria-hidden className="size-4" />
                  )}
                  Imprimante {printer.kind === "bluetooth" ? "Bluetooth" : "USB"} autorisée
                </span>
                <Button variant="ghost" size="sm" onClick={() => void printer.forget()}>
                  <Unplug aria-hidden />
                  Changer d&apos;imprimante
                </Button>
              </div>
            ) : (
              <>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted">
                  <li>Allumez l&apos;imprimante et chargez le papier.</li>
                  <li>
                    Bluetooth : appairez-la d&apos;abord dans les réglages Bluetooth du téléphone
                    (code souvent 0000 ou 1234). USB : branchez-la avec un câble OTG.
                  </li>
                  <li>
                    Touchez « Connecter l&apos;imprimante », puis choisissez-la dans la liste.
                  </li>
                </ol>
                <Button
                  className="self-start"
                  disabled={printer.isSupported !== true}
                  onClick={() => void printer.connect()}
                >
                  <Printer aria-hidden />
                  Connecter l&apos;imprimante
                </Button>
              </>
            )}
          </section>

          <section aria-labelledby="printer-paper" className="flex flex-col gap-3">
            <h2 id="printer-paper" className="text-lg font-medium">
              Largeur du papier
            </h2>
            <div
              role="radiogroup"
              aria-labelledby="printer-paper"
              className="grid grid-cols-2 gap-2"
            >
              {PAPERS.map((option) => {
                const isChecked = printer.paper === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isChecked}
                    onClick={() => printer.setPaper(option.value)}
                    className={cn(
                      "flex min-h-11 flex-col items-start rounded-md border px-3 py-2 text-left transition-colors duration-150",
                      isChecked
                        ? "border-action bg-action text-on-action"
                        : "border-border-strong bg-surface hover:bg-bg-subtle",
                    )}
                  >
                    <span className="text-sm font-semibold">{option.label}</span>
                    <span className={cn("text-xs", isChecked ? "opacity-90" : "text-text-muted")}>
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="printer-test" className="flex flex-col gap-3">
            <h2 id="printer-test" className="text-lg font-medium">
              Essai
            </h2>
            <p className="text-sm text-text-muted">
              Vérifiez sur le ticket : les accents, le gras, le grand « OPTIMA », et que la ligne de
              chiffres tient sur une seule ligne.
            </p>
            <Button
              variant="outline"
              className="self-start"
              disabled={!printer.port || printer.isBusy}
              onClick={() => void printTest()}
            >
              <Printer aria-hidden />
              {printer.isBusy ? "Impression…" : "Imprimer un ticket d'essai"}
            </Button>
            {printedAt ? (
              <p role="status" className="flex items-center gap-2 text-sm">
                <CircleCheck aria-hidden className="size-4 text-success" />
                Ticket envoyé à l&apos;imprimante.
              </p>
            ) : null}
            {printer.error ? (
              <p role="alert" className="text-sm text-danger">
                {printer.error}
              </p>
            ) : null}
          </section>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Aperçu du ticket</h2>
            <Badge tone="neutral">{printer.paper} mm</Badge>
          </div>
          <pre
            aria-label="Aperçu du ticket d'essai"
            className="overflow-x-auto rounded-sm border border-dashed border-ticket-border bg-ticket-bg p-3 font-mono text-[11px] leading-snug text-ticket-ink"
          >
            {preview
              .map((line) =>
                line.align === "center"
                  ? line.text.padStart(Math.floor((width + line.text.length) / 2)).padEnd(width)
                  : line.text,
              )
              .join("\n")}
          </pre>
        </Card>
      </div>
    </div>
  );
}
