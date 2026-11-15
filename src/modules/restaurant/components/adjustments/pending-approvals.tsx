"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";

import { formatTime } from "@/shared/lib/dates";
import { errorMessage } from "@/shared/lib/errors";
import { formatMoney } from "@/shared/lib/money";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/field";

import { ADJUSTMENT_LABELS, pendingRequests } from "../../domain/adjustment";
import type { AdjustmentRequest } from "../../domain/types";
import type { DayData } from "../../offline/hooks";
import { decideAdjustment } from "../../offline/repository";
import { hasPermission } from "../../permissions";
import { orderPlaceLabel } from "../labels";
import { useRestaurant } from "../restaurant-provider";

/**
 * Demandes d'annulation et de remise en attente du gérant (matrice des
 * droits : « Validation »). Un refus s'explique au serveur.
 */
export function PendingApprovals({ data }: { data: DayData }) {
  const { ctx } = useRestaurant();
  if (!hasPermission(ctx.role, "restaurant.adjustment.approve")) return null;
  const pending = pendingRequests(data.adjustmentRequests, data.adjustmentDecisions);
  if (pending.length === 0) return null;
  return (
    <Card aria-labelledby="approvals-title">
      <CardHeader
        titleId="approvals-title"
        title="Demandes à valider"
        description="Annulations et remises demandées par le personnel."
        action={<Badge tone="warning">{pending.length}</Badge>}
      />
      <ul className="flex flex-col divide-y divide-border">
        {pending.map((request) => (
          <PendingRow key={request.id} request={request} data={data} />
        ))}
      </ul>
    </Card>
  );
}

function PendingRow({ request, data }: { request: AdjustmentRequest; data: DayData }) {
  const { db, ctx } = useRestaurant();
  const [isRefusing, setIsRefusing] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const order = data.orders.find((entry) => entry.id === request.orderId);

  async function decide(approved: boolean) {
    setError(null);
    try {
      await decideAdjustment(db, ctx, { requestId: request.id, approved, comment });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="font-medium">
            {ADJUSTMENT_LABELS[request.kind]}
            {request.discount ? ` de ${formatMoney(request.discount)}` : ""} ·{" "}
            {order ? orderPlaceLabel(order.mode, order.tableLabel) : "Commande"}{" "}
            {order ? (
              <span className="text-xs font-normal text-text-muted tabular">
                {order.number} · {formatMoney(order.total)}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-text-muted">
            Demandée par {request.requestedByName} à {formatTime(request.requestedAt)}
          </p>
          <p className="mt-1">« {request.reason} »</p>
        </div>
        {!isRefusing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="action" onClick={() => void decide(true)}>
              <Check aria-hidden />
              Valider
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsRefusing(true)}>
              <X aria-hidden />
              Refuser
            </Button>
          </div>
        ) : null}
      </div>
      {isRefusing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Motif du refus"
            placeholder="Motif du refus, expliqué au serveur"
            value={comment}
            maxLength={300}
            onChange={(event) => setComment(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            size="sm"
            variant="danger"
            disabled={comment.trim().length < 3}
            onClick={() => void decide(false)}
          >
            Refuser
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsRefusing(false)}>
            Annuler
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
    </li>
  );
}
