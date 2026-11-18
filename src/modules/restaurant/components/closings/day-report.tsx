"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { formatDate, formatLongDate, formatTime } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";

import { latestStockCounts, stockLineVariance, totalsByCurrency } from "../../domain/closing";
import { holdingLabel, invoicePointName } from "../labels";
import { useRestaurant } from "../restaurant-provider";
import { cashVarianceLabel, stockVarianceLabel } from "./closing-labels";

/**
 * Rapport de clôture d'une journée (EF-CLO-04) : caisses déclarées et leurs
 * écarts (RG-CLO-01 : chaque manquant est nommé), totaux par devise, part de
 * chaque point de service, écarts de stock, factures impayées (RG-ENC-02).
 * Toujours rendu en clair à l'impression (§ 4.3).
 */
export function DayReport({ day }: { day: string }) {
  const { db, ctx, establishmentName } = useRestaurant();
  const base = ctx.settings.currency;
  const report = useLiveQuery(async () => {
    const [closing, cashClosings, counts, points] = await Promise.all([
      db.dayClosings.where("day").equals(day).first(),
      db.cashClosings.where("day").equals(day).sortBy("declaredAt"),
      db.stockCounts.where("day").equals(day).toArray(),
      db.servicePoints.orderBy("sortOrder").toArray(),
    ]);
    const unpaid = await db.invoices.bulkGet([
      ...new Set(cashClosings.flatMap((entry) => entry.unpaidInvoiceIds)),
    ]);
    return { closing, cashClosings, counts: latestStockCounts(counts, day), points, unpaid };
  }, [db, day]);

  if (!report) return null;
  const pointName = (id: string | null) => invoicePointName(report.points, id);
  const allLines = report.cashClosings.flatMap((entry) => entry.lines);
  const byPoint = new Map<string | null, number>();
  for (const entry of report.cashClosings) {
    for (const part of entry.byServicePoint) {
      byPoint.set(
        part.servicePointId,
        (byPoint.get(part.servicePointId) ?? 0) + part.amount.amountMinor,
      );
    }
  }

  return (
    <article
      aria-label={`Rapport de clôture du ${day}`}
      className="ticket mx-auto w-full max-w-[720px] rounded-sm border border-ticket-border bg-ticket-bg p-5 text-[13px] leading-relaxed text-ticket-ink"
    >
      <header className="mb-3 border-b border-ticket-border pb-3">
        <p className="text-[15px] font-bold uppercase">{establishmentName}</p>
        <p className="font-semibold first-letter:uppercase">
          Clôture de la journée du {formatLongDate(`${day}T12:00:00.000Z`)}
        </p>
        {report.closing ? (
          <p>
            Validée par {report.closing.validatedByName || "le gérant"} le{" "}
            {formatDate(report.closing.validatedAt)} à {formatTime(report.closing.validatedAt)}
          </p>
        ) : (
          <p>Journée non validée.</p>
        )}
        {report.closing?.comment ? <p>Commentaire : {report.closing.comment}</p> : null}
      </header>

      <section className="mb-3">
        <h3 className="mb-1 font-bold">Caisses</h3>
        {report.cashClosings.length === 0 ? (
          <p>Aucune caisse déclarée.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-ticket-border text-left">
                <th className="py-1 font-semibold">Personne</th>
                <th className="py-1 font-semibold">Mode</th>
                <th className="py-1 text-right font-semibold">Attendu</th>
                <th className="py-1 text-right font-semibold">Compté</th>
                <th className="py-1 text-right font-semibold">Écart</th>
              </tr>
            </thead>
            <tbody>
              {report.cashClosings.flatMap((entry) =>
                entry.lines.map((line) => (
                  <tr key={`${entry.id}-${line.key}`} className="border-b border-ticket-border/50">
                    <td className="py-1">{entry.userName}</td>
                    <td className="py-1">
                      {holdingLabel(line.method, line.provider, line.expected.currency, base)}
                    </td>
                    <td className="py-1 text-right tabular">{formatMoney(line.expected)}</td>
                    <td className="py-1 text-right tabular">{formatMoney(line.counted)}</td>
                    <td className="py-1 text-right tabular">
                      {cashVarianceLabel(line.expected, line.counted).label}
                    </td>
                  </tr>
                )),
              )}
              {totalsByCurrency(allLines).map((total) => (
                <tr key={total.currency} className="font-bold">
                  <td className="py-1" colSpan={2}>
                    Total {total.currency === "USD" ? "dollars" : "francs"}
                  </td>
                  <td className="py-1 text-right tabular">{formatMoney(total.expected)}</td>
                  <td className="py-1 text-right tabular">{formatMoney(total.counted)}</td>
                  <td className="py-1 text-right tabular">
                    {cashVarianceLabel(total.expected, total.counted).label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {report.cashClosings
          .filter((entry) => entry.comment)
          .map((entry) => (
            <p key={entry.id}>
              {entry.userName} : {entry.comment}
            </p>
          ))}
      </section>

      {byPoint.size > 0 ? (
        <section className="mb-3">
          <h3 className="mb-1 font-bold">Encaissé par point de service</h3>
          <ul>
            {[...byPoint.entries()].map(([pointId, amountMinor]) => (
              <li key={pointId ?? "delivery-fees"} className="flex justify-between gap-3">
                <span>{pointName(pointId)}</span>
                <span className="tabular">{formatMoney({ amountMinor, currency: base })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-3">
        <h3 className="mb-1 font-bold">Stock</h3>
        {report.points
          .filter((point) => report.counts.has(point.id))
          .map((point) => {
            const count = report.counts.get(point.id);
            const anomalies = (count?.lines ?? []).filter(
              (line) => (stockLineVariance(line) ?? 0) !== 0 || line.declaredOut > 0,
            );
            return (
              <div key={point.id} className="mb-1.5">
                <p className="font-semibold">
                  {point.name} · compté par {count?.countedByName || "le gérant"}
                </p>
                {anomalies.length === 0 ? (
                  <p>Aucun écart.</p>
                ) : (
                  <ul>
                    {anomalies.map((line) => (
                      <li key={line.menuItemId} className="flex justify-between gap-3">
                        <span>
                          {line.name}
                          {line.declaredOut > 0
                            ? ` (sorties : ${line.declaredOut}, ${line.outReason ?? ""})`
                            : ""}
                        </span>
                        <span>{stockVarianceLabel(stockLineVariance(line)).label}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {count?.comment ? <p>Commentaire : {count.comment}</p> : null}
              </div>
            );
          })}
      </section>

      <section>
        <h3 className="mb-1 font-bold">Factures impayées (RG-ENC-02)</h3>
        {report.unpaid.filter((invoice) => invoice !== undefined).length === 0 ? (
          <p>Aucune.</p>
        ) : (
          <ul>
            {report.unpaid
              .filter((invoice) => invoice !== undefined)
              .map((invoice) => (
                <li key={invoice.id} className="flex justify-between gap-3">
                  <span>
                    {invoice.number} · {invoice.waiterName}
                  </span>
                  <span className="tabular">{formatMoney(invoice.total)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </article>
  );
}
