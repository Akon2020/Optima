"use client";

import { FileSpreadsheet, FileText, FileType } from "lucide-react";
import { useState } from "react";

import { downloadBase64 } from "@/shared/lib/download";
import { Button } from "@/shared/ui/button";

import { exportReportAction, type ReportExportInput } from "../actions";

type Format = ReportExportInput["format"];

const FORMATS: { value: Format; label: string; title: string; icon: typeof FileText }[] = [
  { value: "xlsx", label: "Excel", title: "Exporter le rapport en Excel", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", title: "Exporter le rapport en PDF", icon: FileType },
  { value: "csv", label: "CSV", title: "Exporter les ventes détaillées en CSV", icon: FileText },
];

/** Exports du rapport (EF-RAP-04) : Excel et PDF complets, CSV des ventes ligne par ligne. */
export function ReportExportButtons({
  slug,
  from,
  to,
}: {
  slug: string;
  from: string;
  to: string;
}) {
  const [pending, setPending] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onExport(format: Format) {
    setPending(format);
    setError(null);
    try {
      const result = await exportReportAction({ slug, from, to, format });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      downloadBase64(result.data.base64, result.data.mimeType, result.data.filename);
    } catch {
      setError("Serveur injoignable. L'export exige une connexion.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div role="group" aria-label="Exporter le rapport" className="flex flex-wrap gap-2">
        {FORMATS.map((format) => {
          const Icon = format.icon;
          return (
            <Button
              key={format.value}
              variant="outline"
              size="sm"
              onClick={() => void onExport(format.value)}
              disabled={pending !== null}
              aria-label={format.title}
              title={format.title}
              className="max-sm:h-11"
            >
              <Icon aria-hidden />
              {pending === format.value ? "Export…" : format.label}
            </Button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
