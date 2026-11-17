import { CalendarCheck, CalendarRange, ClipboardPen, Eye } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { formatDate, formatTime } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { EmptyState, Skeleton } from "@/shared/ui/empty-state";
import { Field, Select } from "@/shared/ui/field";

import { formatQuantity } from "@/modules/restaurant/domain/menu";
import { formatDay } from "@/modules/restaurant/domain/period";
import { isModuleEnabled } from "@/server/authz/modules";
import { getClosingsView, type ClosingsView } from "@/server/restaurant/periods";

import { AccessDenied, ManagementFrame } from "../_components/management-frame";
import { guarded, managementContext } from "../_lib/management";
import { AdjustmentSheet, ValidatePeriodForm } from "./_components/closings-forms";
import { PeriodSummaryView } from "./_components/period-summary";

export const metadata: Metadata = { title: "Clôtures" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Clôtures en ligne (EF-CLO-05, RG-CLO-02, D-064) : périodes clôturées par le
 * gérant, corrections des journées validées. Gérant et propriétaire ; les
 * droits sont vérifiés côté serveur par `authorize`.
 */
export default function ClosingsPage({
  params,
  searchParams,
}: PageProps<"/e/[etablissement]/clotures">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <Closings params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Closings({
  params,
  searchParams,
}: {
  params: Promise<{ etablissement: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { etablissement: slug } = await params;
  const query = await searchParams;
  const from = typeof query.du === "string" && DAY.test(query.du) ? query.du : null;
  const to = typeof query.au === "string" && DAY.test(query.au) ? query.au : null;
  const { db, actor, establishment, backHref } = await managementContext(slug);
  const result = await guarded(() =>
    getClosingsView(db, actor, {
      establishmentId: establishment.id,
      preview: from && to ? { from, to } : null,
    }),
  );
  const hasRestaurant =
    result.data !== null && (await isModuleEnabled(db, establishment.id, "restaurant"));

  return (
    <ManagementFrame
      slug={slug}
      section="clotures"
      title="Clôtures"
      description="périodes et corrections des journées validées. Rien ne se modifie : on ajoute."
      establishmentName={establishment.name}
      backHref={backHref}
      hasRestaurant={hasRestaurant}
    >
      {result.data ? (
        <ClosingsContent
          slug={slug}
          view={result.data}
          closedFrom={typeof query.cloturee === "string" ? query.cloturee : null}
        />
      ) : (
        <AccessDenied message={result.denied} />
      )}
    </ManagementFrame>
  );
}

function ClosingsContent({
  slug,
  view,
  closedFrom,
}: {
  slug: string;
  view: ClosingsView;
  closedFrom: string | null;
}) {
  const inPeriod = (day: string) =>
    view.periods.some((period) => period.from <= day && day <= period.to);
  const openDays = view.validatedDays.filter((day) => !inPeriod(day.day)).map((day) => day.day);
  const ascending = [...openDays].sort();
  const preview = view.preview;

  return (
    <div className="flex flex-col gap-6">
      {closedFrom ? (
        <p role="status" className="rounded-md bg-success-subtle px-4 py-3 text-sm">
          Période clôturée : son résumé est figé et remonte au propriétaire.
        </p>
      ) : null}

      {view.canManage ? (
        <Card aria-labelledby="new-period-title">
          <CardHeader
            titleId="new-period-title"
            title="Clôturer une période"
            description="Choisissez la première et la dernière journée : toutes doivent être validées (les journées sans activité sont ignorées)."
          />
          {openDays.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Aucune journée à clôturer"
              description="Les journées validées apparaissent ici tant qu'elles n'appartiennent à aucune période."
              className="py-6"
            />
          ) : (
            <form
              method="get"
              action={`/e/${slug}/clotures`}
              className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Field label="Première journée">
                {({ id }) => (
                  <Select id={id} name="du" defaultValue={preview?.from ?? ascending[0]}>
                    {ascending.map((day) => (
                      <option key={day} value={day}>
                        {formatDay(day)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Dernière journée">
                {({ id }) => (
                  <Select id={id} name="au" defaultValue={preview?.to ?? ascending.at(-1)}>
                    {ascending.map((day) => (
                      <option key={day} value={day}>
                        {formatDay(day)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button type="submit" variant="outline">
                <Eye aria-hidden />
                Voir le résumé
              </Button>
            </form>
          )}
          {preview ? (
            <div className="mt-6 border-t border-border pt-6">
              {preview.summary ? <PeriodSummaryView summary={preview.summary} /> : null}
              <div className="mt-5">
                {preview.issue ? (
                  <p role="alert" className="rounded-md bg-warning-subtle px-3 py-2 text-sm">
                    {preview.issue}
                  </p>
                ) : (
                  <ValidatePeriodForm slug={slug} from={preview.from} to={preview.to} />
                )}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card aria-labelledby="periods-title">
        <CardHeader
          titleId="periods-title"
          title="Périodes clôturées"
          description="Résumé figé à la validation (EF-CLO-05)."
        />
        {view.periods.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="Aucune période clôturée"
            description="Une période regroupe plusieurs journées validées, comme la fiche d'inventaire."
            className="py-6"
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {view.periods.map((period) => (
              <li key={period.id} className="py-3">
                <details>
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="font-medium">
                      Du {formatDay(period.from)} au {formatDay(period.to)}
                    </span>
                    <span className="text-sm text-text-muted">
                      {formatMoney(period.summary.revenue)} de ventes · clôturée par{" "}
                      {period.validatedByName} le {formatDate(period.validatedAt, view.timeZone)}
                    </span>
                  </summary>
                  <div className="mt-4">
                    {period.comment ? <p className="mb-4 text-sm">« {period.comment} »</p> : null}
                    <PeriodSummaryView summary={period.summary} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card aria-labelledby="adjustments-title">
        <CardHeader
          titleId="adjustments-title"
          title="Corrections"
          description="Écritures datées et motivées sur les journées validées (RG-CLO-02)."
        />
        {view.canManage ? (
          <div className="mb-4">
            <AdjustmentSheet slug={slug} days={openDays} people={view.people} items={view.items} />
          </div>
        ) : null}
        {view.adjustments.length === 0 ? (
          <EmptyState
            icon={ClipboardPen}
            title="Aucune correction"
            description="Un billet retrouvé, un manquant constaté après coup ou un comptage erroné se corrigent ici."
            className="py-6"
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {view.adjustments.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5"
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    {entry.kind === "cash" ? "Caisse" : "Stock"} · {entry.target}
                  </span>{" "}
                  <span className="text-text-muted">· journée du {formatDay(entry.day)}</span>
                  <span className="block text-xs text-text-muted">
                    « {entry.reason} » · {entry.adjustedByName}, le{" "}
                    {formatDate(entry.adjustedAt, view.timeZone)} à{" "}
                    {formatTime(entry.adjustedAt, view.timeZone)}
                  </span>
                </span>
                <span className="font-semibold tabular">
                  {entry.amount
                    ? `${entry.amount.amountMinor > 0 ? "+" : ""}${formatMoney(entry.amount)}`
                    : entry.quantity !== null && entry.unit
                      ? `${entry.quantity > 0 ? "+" : "−"}${formatQuantity(Math.abs(entry.quantity), entry.unit)}`
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
