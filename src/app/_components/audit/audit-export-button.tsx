"use client";

import { FileSpreadsheet, FileText, FileType } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { exportAuditAction, type AuditExportInput } from "./audit-actions";

type Format = AuditExportInput["format"];

const FORMATS: { value: Format; label: string; icon: typeof FileText }[] = [
  { value: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", icon: FileType },
  { value: "csv", label: "CSV", icon: FileText },
];

function download(base64: string, mimeType: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Téléchargement du journal filtré en Excel, PDF ou CSV (EF-AUD-04). */
export function AuditExportButton({ input }: { input: Omit<AuditExportInput, "format"> }) {
  const [pending, setPending] = useState<Format | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function onExport(format: Format) {
    setPending(format);
    setMessage(null);
    try {
      const result = await exportAuditAction({ ...input, format });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      download(result.data.base64, result.data.mimeType, result.data.filename);
      const count = result.data.count;
      setMessage({
        tone: "ok",
        text: `${count} entrée${count > 1 ? "s" : ""} exportée${count > 1 ? "s" : ""}.`,
      });
    } catch {
      setMessage({ tone: "error", text: "Serveur injoignable. L'export exige une connexion." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div role="group" aria-label="Exporter le journal filtré" className="flex flex-wrap gap-2">
        {FORMATS.map((format) => {
          const Icon = format.icon;
          return (
            <Button
              key={format.value}
              variant="outline"
              size="sm"
              onClick={() => void onExport(format.value)}
              disabled={pending !== null}
              aria-label={`Exporter en ${format.label}`}
              className="max-sm:h-11"
            >
              <Icon aria-hidden />
              {pending === format.value ? "Export…" : format.label}
            </Button>
          );
        })}
      </div>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-xs text-danger" : "text-xs text-text-muted"}
        >
          {message.text}
        </p>
      ) : (
        <p className="text-xs text-text-muted">Exporte les entrées filtrées.</p>
      )}
    </div>
  );
}
