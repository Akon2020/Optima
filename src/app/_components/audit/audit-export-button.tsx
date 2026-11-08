"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { exportAuditAction, type AuditExportInput } from "./audit-actions";

/** Téléchargement du journal filtré au format CSV (EF-AUD-04). */
export function AuditExportButton({ input }: { input: AuditExportInput }) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function onExport() {
    setIsPending(true);
    setMessage(null);
    try {
      const result = await exportAuditAction(input);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      const url = URL.createObjectURL(
        new Blob([result.data.csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename;
      link.click();
      URL.revokeObjectURL(url);
      setMessage({
        tone: "ok",
        text: `${result.data.count} entrée${result.data.count > 1 ? "s" : ""} exportée${result.data.count > 1 ? "s" : ""}.`,
      });
    } catch {
      setMessage({ tone: "error", text: "Serveur injoignable. L'export exige une connexion." });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="outline" onClick={() => void onExport()} disabled={isPending}>
        <Download aria-hidden />
        {isPending ? "Export…" : "Exporter (CSV)"}
      </Button>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-xs text-danger" : "text-xs text-text-muted"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
