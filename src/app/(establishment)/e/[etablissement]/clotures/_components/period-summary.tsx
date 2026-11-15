import { Banknote, CreditCard, HandCoins, Hourglass, Receipt, TriangleAlert } from "lucide-react";

import { formatMoney, type Money } from "@/shared/lib/money";
import { Kpi } from "@/shared/ui/kpi";

import { formatQuantity } from "@/modules/restaurant/domain/menu";
import { formatDay, type PeriodSummary } from "@/modules/restaurant/domain/period";

/** « −1 500 FC » pour un manque, « +500 FC » pour un excédent, « 0 FC » sinon. */
function signed(value: Money): string {
  if (value.amountMinor > 0) return `+${formatMoney(value)}`;
  return formatMoney(value);
}

/**
 * Résumé d'une période (EF-CLO-05, D-064), comme la fiche d'inventaire du
 * restaurant : ventes, caisse et manquants nommés, écarts de stock, dettes ;
 * bénéfice et dépenses annoncés sans rien inventer.
 */
export function PeriodSummaryView({ summary }: { summary: PeriodSummary }) {
  const shortage = summary.cash.some((entry) => entry.variance.amountMinor < 0);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-muted">
        Du {formatDay(summary.from)} au {formatDay(summary.to)} · {summary.validatedDays.length}{" "}
        journée{summary.validatedDays.length > 1 ? "s" : ""} validée
        {summary.validatedDays.length > 1 ? "s" : ""}
        {summary.adjustmentCount > 0
          ? ` · ${summary.adjustmentCount} correction${summary.adjustmentCount > 1 ? "s" : ""}`
          : ""}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Receipt} tone="green" value={formatMoney(summary.revenue)} label="Ventes" />
        {summary.cash.map((entry) => (
          <Kpi
            key={`declared-${entry.currency}`}
            icon={Banknote}
            tone="grey"
            value={formatMoney(entry.counted)}
            label={`Cash déclaré sur ${formatMoney(entry.expected)}`}
          />
        ))}
        {summary.cash.map((entry) => (
          <Kpi
            key={`variance-${entry.currency}`}
            icon={TriangleAlert}
            tone={entry.variance.amountMinor < 0 ? "rose" : "grey"}
            value={signed(entry.variance)}
            label={
              entry.adjusted.amountMinor !== 0 ? "Écart, corrections comprises" : "Écart de caisse"
            }
          />
        ))}
        <Kpi
          icon={CreditCard}
          tone="peach"
          value={formatMoney(summary.debtsOutstanding)}
          label="Dettes clients à la clôture"
        />
      </div>

      <section aria-labelledby={`people-${summary.from}`}>
        <h3 id={`people-${summary.from}`} className="mb-2 text-sm font-medium">
          Caisse par personne {shortage ? "· manquants nommés (RG-CLO-01)" : ""}
        </h3>
        {summary.people.length === 0 ? (
          <p className="text-sm text-text-muted">Aucune caisse déclarée sur la période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Personne</th>
                  {/* L'écart d'abord : sur téléphone, il reste visible sans défiler. */}
                  <th className="py-2 pr-3 text-right font-medium">Écart</th>
                  <th className="py-2 pr-3 text-right font-medium">Attendu</th>
                  <th className="py-2 pr-3 text-right font-medium">Compté</th>
                  <th className="py-2 text-right font-medium">Corrections</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.people.map((person) => (
                  <tr key={`${person.userId}-${person.currency}`}>
                    <td className="py-2 pr-3 font-medium">{person.userName || "Sans nom"}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular">
                      {signed(person.variance)}
                      {person.variance.amountMinor < 0 ? (
                        <span className="block text-xs font-normal text-text-muted">manquant</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular">{formatMoney(person.expected)}</td>
                    <td className="py-2 pr-3 text-right tabular">{formatMoney(person.counted)}</td>
                    <td className="py-2 text-right tabular">
                      {person.adjusted.amountMinor === 0 ? "—" : signed(person.adjusted)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby={`stock-${summary.from}`}>
        <h3 id={`stock-${summary.from}`} className="mb-2 text-sm font-medium">
          Stock : écarts et sorties déclarées
        </h3>
        {summary.stock.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun écart de stock sur la période.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {summary.stock.map((line) => (
              <li
                key={`${line.servicePointName}-${line.name}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2"
              >
                <span className="min-w-0">
                  <span className="font-medium">{line.name}</span>{" "}
                  <span className="text-text-muted">
                    · {line.servicePointName} · {formatQuantity(line.sold, line.unit)} vendus
                    {line.declaredOut > 0
                      ? `, ${formatQuantity(line.declaredOut, line.unit)} sortis (pertes, casse, repas)`
                      : ""}
                  </span>
                </span>
                <span className="font-semibold tabular">
                  {line.variance === 0
                    ? "Sans écart"
                    : `${line.variance > 0 ? "+" : "−"}${formatQuantity(Math.abs(line.variance), line.unit)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <p className="rounded-md bg-bg-subtle px-3 py-2.5">
          <HandCoins aria-hidden className="mr-1.5 inline size-4 text-text-muted" />
          Remises accordées : <span className="tabular">{formatMoney(summary.discounts)}</span>
        </p>
        <p className="rounded-md bg-bg-subtle px-3 py-2.5">
          Annulations : <span className="tabular">{summary.cancelled.count}</span> facture
          {summary.cancelled.count > 1 ? "s" : ""} (
          <span className="tabular">{formatMoney(summary.cancelled.amount)}</span>)
        </p>
        {summary.pending.map((entry) => (
          <p key={entry.label} className="rounded-md bg-bg-subtle px-3 py-2.5 text-text-muted">
            <Hourglass aria-hidden className="mr-1.5 inline size-4" />
            {entry.label} : attend {entry.needs}.
          </p>
        ))}
      </div>
    </div>
  );
}
