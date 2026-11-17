import { ClipboardList, Hourglass, Receipt, ShoppingBag, Wallet, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { formatMoney, type Money } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { EmptyState, Skeleton } from "@/shared/ui/empty-state";
import { Field, Input } from "@/shared/ui/field";
import { Kpi } from "@/shared/ui/kpi";

import { businessDayKey } from "@/modules/restaurant/domain/business-day";
import { formatQuantity } from "@/modules/restaurant/domain/menu";
import { formatDay } from "@/modules/restaurant/domain/period";
import { defaultReportRange, type SalesReport } from "@/modules/restaurant/domain/report";
import { isModuleEnabled } from "@/server/authz/modules";
import { getRestaurantReport, type ReportView } from "@/server/reports/restaurant-report";

import { AccessDenied, ManagementFrame } from "../_components/management-frame";
import { guarded, managementContext } from "../_lib/management";
import { PeriodSummaryView } from "../clotures/_components/period-summary";
import { ReportExportButtons } from "./_components/report-export-buttons";

export const metadata: Metadata = { title: "Rapports" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rapports du restaurant (EF-RAP-01, EF-RAP-03, EF-RAP-04, D-065) : ventes de
 * la période par point de service, serveur, article et heure, écarts des
 * journées validées, exports. Gérant, lecteur et propriétaire ; les droits
 * sont vérifiés côté serveur (`reports.read`).
 */
export default function ReportsPage({
  params,
  searchParams,
}: PageProps<"/e/[etablissement]/rapports">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <Reports params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({
  params,
  searchParams,
}: {
  params: Promise<{ etablissement: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { etablissement: slug } = await params;
  const query = await searchParams;
  const { db, actor, establishment, backHref } = await managementContext(slug);
  const settings = await db.establishment.findUnique({
    where: { id: establishment.id },
    select: { timeZone: true },
  });
  const today = businessDayKey(new Date().toISOString(), undefined, settings?.timeZone);
  const fallback = defaultReportRange(today);
  const from = typeof query.du === "string" && DAY.test(query.du) ? query.du : fallback.from;
  const to = typeof query.au === "string" && DAY.test(query.au) ? query.au : fallback.to;
  const result = await guarded(() =>
    getRestaurantReport(db, actor, { establishmentId: establishment.id, from, to }),
  );
  const hasRestaurant =
    result.data !== null && (await isModuleEnabled(db, establishment.id, "restaurant"));

  return (
    <ManagementFrame
      slug={slug}
      section="rapports"
      title="Rapports"
      description="ventes, écarts et clôtures d'une période, à consulter ou à exporter."
      establishmentName={establishment.name}
      backHref={backHref}
      hasRestaurant={hasRestaurant}
      action={result.data ? <ReportExportButtons slug={slug} from={from} to={to} /> : undefined}
    >
      {result.data ? (
        <ReportContent slug={slug} from={from} to={to} view={result.data} />
      ) : (
        <AccessDenied message={result.denied} />
      )}
    </ManagementFrame>
  );
}

function ReportContent({
  slug,
  from,
  to,
  view,
}: {
  slug: string;
  from: string;
  to: string;
  view: ReportView;
}) {
  const { sales } = view;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form
          method="get"
          action={`/e/${slug}/rapports`}
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <Field label="Première journée">
            {({ id }) => <Input id={id} name="du" type="date" defaultValue={from} required />}
          </Field>
          <Field label="Dernière journée">
            {({ id }) => <Input id={id} name="au" type="date" defaultValue={to} required />}
          </Field>
          <Button type="submit" variant="outline">
            Afficher
          </Button>
        </form>
        <p className="mt-3 text-xs text-text-muted">
          Une vente compte pour sa journée d&apos;exploitation : après la validation de la journée,
          elle passe à la suivante (D-039). Les factures annulées sont comptées à part.
        </p>
      </Card>

      <section
        aria-label="Synthèse"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Kpi
          icon={Receipt}
          tone="green"
          value={formatMoney(sales.revenue)}
          label="Ventes, remises déduites"
        />
        <Kpi
          icon={ShoppingBag}
          tone="grey"
          value={String(sales.orders)}
          label={`Commande${sales.orders > 1 ? "s" : ""}`}
        />
        <Kpi
          icon={Wallet}
          tone="yellow"
          value={formatMoney(sales.averageOrder)}
          label="Panier moyen"
        />
        <Kpi
          icon={XCircle}
          tone={sales.cancelled.count > 0 ? "rose" : "grey"}
          value={formatMoney(sales.cancelled.amount)}
          label={`Annulé (${sales.cancelled.count} facture${sales.cancelled.count > 1 ? "s" : ""})`}
        />
      </section>

      {sales.invoices === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Aucune vente sur cette période"
            description="Choisissez d'autres dates, ou vérifiez que les appareils ont été synchronisés."
          />
        </Card>
      ) : (
        <SalesSections sales={sales} />
      )}

      <Card aria-labelledby="margin-title">
        <CardHeader titleId="margin-title" title="Marge et bénéfice" />
        <p className="flex items-start gap-2 text-sm text-text-muted">
          <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
          En attente des prix de revient (catalogue et achats) : la marge se calculera sur les
          ventes réellement réalisées, le stock restant au prix de revient (EF-RAP-02, RG-RAP-01).
        </p>
      </Card>

      <Card aria-labelledby="closings-title">
        <CardHeader
          titleId="closings-title"
          title="Écarts de caisse et de stock"
          description="Journées validées de la période, corrections comprises (EF-RAP-03)."
        />
        {view.days.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Aucune journée validée sur cette période"
            description="Les écarts apparaissent ici une fois les journées validées par le gérant."
            className="py-6"
          />
        ) : (
          <div className="flex flex-col gap-5">
            <PeriodSummaryView summary={view.closings} />
            <div>
              <h3 className="mb-2 text-sm font-medium">Historique des clôtures</h3>
              <ul className="flex flex-col divide-y divide-border text-sm">
                {view.days.map((day) => (
                  <li key={day.day} className="flex flex-wrap justify-between gap-x-3 py-2">
                    <span>Journée du {formatDay(day.day)}</span>
                    <span className="text-text-muted">validée par {day.validatedByName}</span>
                  </li>
                ))}
              </ul>
              {view.periods.length > 0 ? (
                <p className="mt-3 text-sm">
                  Période{view.periods.length > 1 ? "s" : ""} clôturée
                  {view.periods.length > 1 ? "s" : ""} :{" "}
                  {view.periods
                    .map((period) => `du ${formatDay(period.from)} au ${formatDay(period.to)}`)
                    .join(", ")}{" "}
                  ·{" "}
                  <Link
                    href={`/e/${slug}/clotures`}
                    className="font-medium text-link underline-offset-2 hover:underline"
                  >
                    voir les clôtures
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Barre proportionnelle ; la valeur est toujours écrite à côté (jamais la seule couleur). */
function Bar({ fraction }: { fraction: number }) {
  return (
    <span aria-hidden className="block h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
      <span
        className="block h-full rounded-full bg-action"
        style={{ width: `${Math.max(2, Math.round(fraction * 100))}%` }}
      />
    </span>
  );
}

function share(value: Money, max: number): number {
  return max > 0 ? value.amountMinor / max : 0;
}

function SalesSections({ sales }: { sales: SalesReport }) {
  const maxHour = Math.max(...sales.byHour.map((entry) => entry.revenue.amountMinor), 0);
  const maxWaiter = Math.max(...sales.byWaiter.map((entry) => entry.revenue.amountMinor), 0);
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card aria-labelledby="points-title">
          <CardHeader titleId="points-title" title="Par point de service" />
          <ul className="flex flex-col gap-3 text-sm">
            {sales.byPoint.map((point) => (
              <li key={point.id} className="flex flex-col gap-1">
                <span className="flex justify-between gap-3">
                  <span className="font-medium">{point.name}</span>
                  <span className="tabular">
                    {formatMoney(point.revenue)}{" "}
                    <span className="text-text-muted">· {Math.round(point.share * 100)} %</span>
                  </span>
                </span>
                <Bar fraction={point.share} />
              </li>
            ))}
          </ul>
        </Card>
        <Card aria-labelledby="methods-title">
          <CardHeader
            titleId="methods-title"
            title="Par mode de paiement"
            description="Encaissé, monnaie rendue déduite."
          />
          {sales.byMethod.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun encaissement sur la période.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {sales.byMethod.map((entry) => (
                <li key={entry.label} className="flex justify-between gap-3 py-2">
                  <span>{entry.label}</span>
                  <span className="font-semibold tabular">{formatMoney(entry.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ItemsCard id="top" title="Les plus vendus" items={sales.topItems} />
        <ItemsCard id="bottom" title="Les moins vendus" items={sales.bottomItems} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card aria-labelledby="waiters-title">
          <CardHeader titleId="waiters-title" title="Par serveur" />
          <ul className="flex flex-col gap-3 text-sm">
            {sales.byWaiter.map((waiter) => (
              <li key={waiter.id} className="flex flex-col gap-1">
                <span className="flex justify-between gap-3">
                  <span className="font-medium">{waiter.name}</span>
                  <span className="tabular">
                    {formatMoney(waiter.revenue)}{" "}
                    <span className="text-text-muted">
                      · {waiter.orders} commande{waiter.orders > 1 ? "s" : ""}
                    </span>
                  </span>
                </span>
                <Bar fraction={share(waiter.revenue, maxWaiter)} />
              </li>
            ))}
          </ul>
        </Card>
        <Card aria-labelledby="hours-title">
          <CardHeader
            titleId="hours-title"
            title="Par heure"
            description="Heure de la facture, à l'heure locale."
          />
          <ul className="flex flex-col gap-2 text-sm">
            {sales.byHour.map((entry) => (
              <li
                key={entry.hour}
                className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3"
              >
                <span className="tabular text-text-muted">
                  {String(entry.hour).padStart(2, "0")} h
                </span>
                <Bar fraction={share(entry.revenue, maxHour)} />
                <span className="tabular">{formatMoney(entry.revenue)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function ItemsCard({
  id,
  title,
  items,
}: {
  id: string;
  title: string;
  items: SalesReport["byItem"];
}) {
  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader titleId={`${id}-title`} title={title} />
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun article.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="font-medium">{item.name}</span>{" "}
                <span className="text-text-muted">· {item.pointName}</span>
              </span>
              <span className="shrink-0 text-right tabular">
                {formatQuantity(item.quantity, item.unit)}
                {item.quantity > 0 ? (
                  <span className="block text-xs text-text-muted">{formatMoney(item.revenue)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
