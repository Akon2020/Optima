"use client";

import { formatTime } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";
import { StatusLabel, type StatusTone } from "@/shared/ui/badge";

import {
  ADJUSTMENT_LABELS,
  adjustmentStatus,
  type AdjustmentStatus,
} from "../../domain/adjustment";
import type { AdjustmentDecision, AdjustmentRequest } from "../../domain/types";

const STATUS: Record<AdjustmentStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "En attente du gérant", tone: "warning" },
  approved: { label: "Validée", tone: "success" },
  rejected: { label: "Refusée", tone: "danger" },
};

/** Historique des demandes d'une commande et de leurs décisions (D-058). */
export function OrderAdjustments({
  orderId,
  requests,
  decisions,
}: {
  orderId: string;
  requests: readonly AdjustmentRequest[];
  decisions: readonly AdjustmentDecision[];
}) {
  const own = requests.filter((request) => request.orderId === orderId);
  if (own.length === 0) return null;
  return (
    <section aria-label="Annulations et remises" className="rounded-lg border border-border p-4">
      <h3 className="mb-2 text-sm font-semibold">Annulations et remises</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {own.map((request) => {
          const status = STATUS[adjustmentStatus(request, decisions)];
          const decision = decisions.find((entry) => entry.requestId === request.id);
          return (
            <li key={request.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {ADJUSTMENT_LABELS[request.kind]}
                  {request.discount ? ` de ${formatMoney(request.discount)}` : ""}
                </span>
                <StatusLabel tone={status.tone} className="text-xs">
                  {status.label}
                </StatusLabel>
              </div>
              <p className="text-xs text-text-muted">
                {request.requestedByName} à {formatTime(request.requestedAt)} : « {request.reason} »
              </p>
              {decision ? (
                <p className="text-xs text-text-muted">
                  {decision.approved ? "Validée" : "Refusée"} par {decision.decidedByName} à{" "}
                  {formatTime(decision.decidedAt)}
                  {decision.comment ? ` : « ${decision.comment} »` : ""}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
