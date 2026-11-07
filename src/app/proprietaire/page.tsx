import {
  ArrowRight,
  Bell,
  Building2,
  CloudOff,
  Receipt,
  ShoppingBag,
  Smartphone,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { cn } from "@/shared/lib/cn";
import { formatRelativeInstant } from "@/shared/lib/dates";
import { addMoney, formatMoney, zero, type Money } from "@/shared/lib/money";
import { Badge } from "@/shared/ui/badge";
import { buttonClasses } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { EmptyState, Skeleton } from "@/shared/ui/empty-state";
import { Kpi } from "@/shared/ui/kpi";

import {
  OVERVIEW_PERIODS,
  PERIOD_LABELS,
  evolution,
  parsePeriod,
  type OverviewPeriod,
} from "@/modules/owner";
import { getOwnerOverview, type OwnerOverview } from "@/server/owner/overview";

import { OverviewChart } from "./_components/overview-chart";
import { OwnerFrame } from "./_components/owner-frame";
import { ownerPageContext } from "./_lib/owner";

export const metadata: Metadata = { title: "Espace propriétaire" };

/**
 * Vue d'ensemble du propriétaire (P6, EF-PRO-01 à 05) : ventes de tous les
 * établissements sur la période choisie, alertes, état des appareils.
 */
export default function OwnerPage({ searchParams }: PageProps<"/proprietaire">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db, actor } = await ownerPageContext();
  const params = await searchParams;
  const period = parsePeriod(typeof params.periode === "string" ? params.periode : null);
  const overview = await getOwnerOverview(db, actor, { period });
  const nowIso = new Date().toISOString();

  return (
    <OwnerFrame
      section="overview"
      title="Vue d'ensemble"
      description="Tous les établissements, au total et un par un."
      action={<PeriodSwitch period={period} />}
    >
      {overview.establishments.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Aucun établissement"
            description="Créez le premier établissement pour suivre son activité ici."
            action={
              <Link
                href="/proprietaire/etablissements/nouveau"
                className={buttonClasses("primary")}
              >
                Créer un établissement
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Totals overview={overview} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <SalesChart overview={overview} />
            <Alerts overview={overview} />
          </div>
          <Establishments overview={overview} nowIso={nowIso} />
          <Upcoming />
        </div>
      )}
    </OwnerFrame>
  );
}

/** Libellés courts du sélecteur : il tient sur un téléphone de 360 px. */
const SHORT_PERIOD_LABELS: Record<OverviewPeriod, string> = {
  jour: "Aujourd'hui",
  semaine: "7 jours",
  mois: "30 jours",
};

function PeriodSwitch({ period }: { period: OverviewPeriod }) {
  return (
    <nav aria-label="Période" className="w-full sm:w-auto">
      <ul className="grid grid-cols-3 rounded-md border border-border bg-surface p-1">
        {OVERVIEW_PERIODS.map((value) => (
          <li key={value}>
            <Link
              href={value === "jour" ? "/proprietaire" : `/proprietaire?periode=${value}`}
              aria-current={value === period ? "page" : undefined}
              aria-label={PERIOD_LABELS[value]}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-sm px-3 text-sm font-medium whitespace-nowrap",
                value === period
                  ? "bg-primary text-on-primary"
                  : "text-text-muted hover:bg-bg-subtle hover:text-text",
              )}
            >
              {SHORT_PERIOD_LABELS[value]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Evolution({ current, previous }: { current: Money; previous: Money }) {
  const value = evolution(current, previous);
  if (value === null) {
    return <span className="opacity-80">Pas de comparaison possible</span>;
  }
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return (
    <span>
      <span className="font-medium tabular">
        {sign}
        {Math.abs(value)} %
      </span>{" "}
      <span className="opacity-80">par rapport à la période précédente</span>
    </span>
  );
}

function Totals({ overview }: { overview: OwnerOverview }) {
  const activeCount = overview.establishments.filter((entry) => entry.status === "active").length;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {overview.totals.map((total) => (
        <Card key={total.currency} tone="showcase" className="sm:col-span-2 lg:col-span-2">
          <p className="text-sm opacity-80">
            Montant facturé · {PERIOD_LABELS[overview.period].toLowerCase()} · {total.currency}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular sm:text-4xl">
            {formatMoney(total.revenue)}
          </p>
          <p className="mt-2 text-sm">
            <Evolution current={total.revenue} previous={total.previousRevenue} />
          </p>
        </Card>
      ))}
      <Card className="flex flex-col justify-center gap-4 sm:col-span-2 lg:col-span-1">
        <Kpi
          icon={ShoppingBag}
          tone="green"
          value={overview.totals.reduce((sum, total) => sum + total.orders, 0)}
          label="Commandes"
        />
        <Kpi
          icon={Building2}
          tone="grey"
          value={`${activeCount} / ${overview.establishments.length}`}
          label="Établissements en activité"
        />
      </Card>
    </div>
  );
}

function SalesChart({ overview }: { overview: OwnerOverview }) {
  const main = overview.totals[0];
  if (!main) return null;
  const sameCurrency = overview.establishments.filter((entry) => entry.currency === main.currency);
  const first = sameCurrency[0];
  const points = (first?.sales.series ?? []).map((point, index) => ({
    label: point.label,
    value: sameCurrency.reduce(
      (sum, entry) => addMoney(sum, entry.sales.series[index]?.value ?? zero(main.currency)),
      zero(main.currency),
    ),
  }));
  return (
    <Card>
      <CardHeader
        title="Évolution des ventes"
        description={`${PERIOD_LABELS[overview.period]}, en ${main.currency}, tous établissements confondus.`}
      />
      <OverviewChart
        points={points}
        title={`Montant facturé, ${PERIOD_LABELS[overview.period].toLowerCase()}`}
        categoryHeader={overview.period === "jour" ? "Heure" : "Jour"}
      />
    </Card>
  );
}

function Alerts({ overview }: { overview: OwnerOverview }) {
  return (
    <Card aria-labelledby="alerts-title">
      <CardHeader
        title="Alertes"
        titleId="alerts-title"
        description={
          overview.alerts.length === 0
            ? undefined
            : `${overview.alerts.length} point${overview.alerts.length > 1 ? "s" : ""} à vérifier.`
        }
      />
      {overview.alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Rien à signaler"
          description="Appareils synchronisés, aucune opération refusée, stocks du matin saisis."
          className="py-6 sm:py-8"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {overview.alerts.map((alert) => (
            <li key={`${alert.establishmentId}-${alert.kind}`}>
              <Link
                href={alert.href}
                className="flex gap-3 rounded-md bg-warning-subtle px-3 py-2.5 text-sm hover:brightness-95"
              >
                {alert.kind === "device-stale" ? (
                  <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="font-medium">{alert.establishmentName}</span>
                  <span className="block">{alert.message}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Establishments({ overview, nowIso }: { overview: OwnerOverview; nowIso: string }) {
  return (
    <section aria-labelledby="establishments-title">
      <h2 id="establishments-title" className="mb-3 text-lg font-medium">
        Par établissement
      </h2>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {overview.establishments.map((entry) => (
          <li key={entry.id}>
            <Card as="article" className="flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 font-medium">{entry.name}</h3>
                <Badge tone={entry.status === "active" ? "success" : "warning"}>
                  {entry.status === "active" ? "Actif" : "Suspendu"}
                </Badge>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular">{formatMoney(entry.sales.revenue)}</p>
                <p className="mt-1 text-xs text-text-muted">
                  <Evolution current={entry.sales.revenue} previous={entry.sales.previousRevenue} />
                </p>
              </div>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <ShoppingBag aria-hidden className="size-4 shrink-0 text-text-muted" />
                  <dt className="sr-only">Commandes</dt>
                  <dd>
                    <span className="tabular">{entry.sales.orders}</span> commande
                    {entry.sales.orders > 1 ? "s" : ""}
                  </dd>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <Receipt aria-hidden className="size-4 shrink-0 text-text-muted" />
                  <dt className="sr-only">Panier moyen</dt>
                  <dd className="min-w-0">
                    {formatMoney(entry.sales.averageOrder)}{" "}
                    <span className="text-text-muted">en moyenne</span>
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <Users aria-hidden className="size-4 shrink-0 text-text-muted" />
                  <dt className="sr-only">Personnel</dt>
                  <dd>
                    <span className="tabular">{entry.staff}</span> membre
                    {entry.staff > 1 ? "s" : ""}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone aria-hidden className="size-4 shrink-0 text-text-muted" />
                  <dt className="sr-only">Appareils</dt>
                  <dd>
                    <span className="tabular">{entry.devices.active}</span> appareil
                    {entry.devices.active > 1 ? "s" : ""}
                    {entry.devices.stale > 0 ? (
                      <span className="text-text-muted">
                        , {entry.devices.stale} sans nouvelles
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-text-muted">
                Dernière synchronisation :{" "}
                {entry.devices.lastSyncAt
                  ? formatRelativeInstant(entry.devices.lastSyncAt, nowIso, entry.timeZone)
                  : "aucune"}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link
                  href={`/proprietaire/etablissements/${entry.id}`}
                  className={buttonClasses("outline", "sm")}
                >
                  Gérer
                  <ArrowRight aria-hidden />
                </Link>
                <Link href={`/e/${entry.slug}/equipe`} className={buttonClasses("ghost", "sm")}>
                  Équipe
                </Link>
                <Link href={`/e/${entry.slug}/appareils`} className={buttonClasses("ghost", "sm")}>
                  Appareils
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** EF-PRO-01 : indicateurs qui attendent des écrans pas encore construits (rien d'inventé). */
function Upcoming() {
  const items = [
    { label: "Marge réalisée et bénéfice estimé", needs: "prix de revient (catalogue et achats)" },
    {
      label: "Cash attendu, cash déclaré et manquants",
      needs: "encaissement et clôtures (D-Q03, D-Q04, D-Q10)",
    },
    { label: "Dépenses et dettes", needs: "trésorerie et fiches clients" },
    { label: "Valeur du stock et ruptures", needs: "stock et achats (D-Q14)" },
  ];
  return (
    <Card aria-labelledby="upcoming-title">
      <CardHeader
        title="Indicateurs à venir"
        titleId="upcoming-title"
        description="Ils apparaîtront ici dès que les écrans qui les produisent existeront."
      />
      <ul className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label} className="rounded-md bg-bg-subtle px-3 py-2.5">
            <p className="font-medium">{item.label}</p>
            <p className="text-text-muted">Attend : {item.needs}.</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
