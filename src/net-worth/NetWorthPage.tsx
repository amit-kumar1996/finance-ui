import { useEffect, useState } from "react";
import { loadNetWorth, type NetWorthData, type PositionItem } from "./api.js";
import { amountInPaise, formatMoney, monthLabel } from "./format.js";
import { MarketFreshness } from "./MarketFreshness.js";

const colors = [
  "#167b70",
  "#3478b8",
  "#b7791f",
  "#805ad5",
  "#64748b",
  "#c2410c",
  "#0e7490",
  "#be5f67",
];
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Could not load net worth.";

function Trend({ points }: { points: NetWorthData["history"] }) {
  if (points.length === 0)
    return (
      <p className="report-empty">Daily snapshots will build this trend over time.</p>
    );
  const values = points.map((point) => amountInPaise(point.netWorth));
  const max =
    values.reduce((highest, value) => (value > highest ? value : highest), 0n) || 1n;
  return (
    <div className="history-bars" aria-label="Net worth history">
      {points.map((point, index) => {
        const height = Number((values[index]! * 1000n) / max) / 10;
        return (
          <div className="history-bar-item" key={point.date}>
            <span>{formatMoney(point.netWorth)}</span>
            <i style={{ height: `${Math.max(2, height)}%` }} />
            <small>
              {monthLabel(point.date.slice(0, 7))} {point.date.slice(0, 4)}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownTable({
  title,
  items,
  total,
}: {
  title: string;
  items: PositionItem[];
  total: string;
}) {
  return (
    <section className="dashboard-panel panel">
      <h2>{title}</h2>
      <div className="report-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.label}</th>
                <td>{formatMoney(item.value)}</td>
              </tr>
            ))}
            <tr className="table-total">
              <th>Total</th>
              <td>{formatMoney(total)}</td>
            </tr>
          </tbody>
        </table>
        {items.length === 0 && <p className="report-empty">No balances recorded.</p>}
      </div>
    </section>
  );
}

export function NetWorthPage() {
  const [data, setData] = useState<NetWorthData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void loadNetWorth()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (loading)
    return (
      <section className="data-page">
        <p role="status">Loading net worth…</p>
      </section>
    );
  if (!data)
    return (
      <section className="data-page">
        <p className="auth-error" role="alert">
          {error}
        </p>
      </section>
    );
  const { position } = data;
  const positiveAssets = position.assetBreakdown.filter(
    (item) => amountInPaise(item.value) > 0n,
  );
  const totalPositiveAssets = positiveAssets.reduce(
    (sum, item) => sum + amountInPaise(item.value),
    0n,
  );
  let sweep = 0;
  const segments = positiveAssets.map((item, index) => {
    const basisPoints =
      totalPositiveAssets > 0n
        ? Number((amountInPaise(item.value) * 10_000n) / totalPositiveAssets)
        : 0;
    const start = sweep / 100;
    sweep += basisPoints;
    const end = sweep / 100;
    return {
      ...item,
      percent: basisPoints / 100,
      color: colors[index % colors.length],
      start,
      end,
    };
  });
  const conic = segments
    .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
    .join(", ");
  const stale = data.priceFreshness.filter((item) => item.stale);
  return (
    <section className="data-page net-worth-page" aria-labelledby="page-heading-title">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <MarketFreshness items={data.priceFreshness} />
      {stale.length > 0 && (
        <aside className="stale-warning" role="status">
          {stale.length} market price{stale.length === 1 ? " is" : "s are"} stale; last
          saved prices remain in the totals.
        </aside>
      )}
      <div className="net-worth-summary">
        <article className="net-worth-highlight">
          <span>Net worth · {position.asOfDate}</span>
          <strong>{formatMoney(position.netWorth)}</strong>
        </article>
        <article>
          <span>Total assets</span>
          <strong>{formatMoney(position.totalAssets)}</strong>
        </article>
        <article>
          <span>Total liabilities</span>
          <strong className="negative-balance">
            {formatMoney(position.totalLiabilities)}
          </strong>
        </article>
        <article>
          <span>Change this month</span>
          <strong
            className={
              data.changeThisMonth?.startsWith("-")
                ? "negative-balance"
                : "positive-balance"
            }
          >
            {data.changeThisMonth === null
              ? "—"
              : `${data.changeThisMonth.startsWith("-") ? "" : "+"}${formatMoney(data.changeThisMonth)}`}
          </strong>
        </article>
      </div>
      <div className="net-worth-content-grid">
        <section className="dashboard-panel panel">
          <h2>Net worth trend</h2>
          <Trend points={data.history} />
        </section>
        <section className="dashboard-panel panel">
          <h2>Asset allocation</h2>
          {segments.length ? (
            <div className="allocation-layout">
              <div
                className="allocation-donut"
                style={{ background: `conic-gradient(${conic})` }}
                role="img"
                aria-label="Asset allocation by category"
              >
                <span />
              </div>
              <div className="allocation-legend">
                {segments.map((item) => (
                  <div key={item.id}>
                    <span>
                      <i style={{ backgroundColor: item.color }} />
                      {item.label}
                    </span>
                    <strong>{item.percent.toFixed(1)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="report-empty">No asset balances to allocate.</p>
          )}
        </section>
        <BreakdownTable
          title="Assets"
          items={position.assetBreakdown}
          total={position.totalAssets}
        />
        <BreakdownTable
          title="Liabilities"
          items={position.liabilityBreakdown}
          total={position.totalLiabilities}
        />
      </div>
    </section>
  );
}
