import { useEffect, useState } from "react";
import { loadDashboard, type DashboardData } from "./api.js";
import { amountInPaise, formatMoney, monthLabel } from "./format.js";
import { MarketFreshness } from "./MarketFreshness.js";

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Could not load the dashboard.";

function HistoryBars({ points }: { points: DashboardData["history"] }) {
  if (!points.length)
    return (
      <p className="report-empty">
        Net worth history will appear after the daily snapshot runs.
      </p>
    );
  const values = points.map((point) => amountInPaise(point.netWorth));
  const maximum = values.reduce((max, value) => (value > max ? value : max), 0n) || 1n;
  return (
    <div className="history-bars" aria-label="Net worth over time">
      {points.map((point, index) => {
        const height = Number((values[index]! * 1000n) / maximum) / 10;
        return (
          <div className="history-bar-item" key={point.date}>
            <span>{formatMoney(point.netWorth)}</span>
            <i style={{ height: `${Math.max(2, height)}%` }} />
            <small>{monthLabel(point.date.slice(0, 7))}</small>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void loadDashboard()
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
        <p role="status">Loading dashboard…</p>
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
  const {
    position,
    whereMoneyStands: stands,
    peopleTracker,
    month,
    history,
    upcoming,
    priceFreshness,
  } = data;
  const standRows: Array<[string, string, string]> = [
    ["Bank, cash and UPI", stands.cash, ""],
    ["Investments (incl. FD, PPF, EPF)", stands.investments, ""],
    ["Loans outstanding", stands.loans, "negative-balance"],
    ["Credit card due", stands.creditCards, "negative-balance"],
  ];
  const monthLabelText = new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
  }).format(new Date(`${month.month}-01T00:00:00.000Z`));
  const stalePrices = priceFreshness.filter((item) => item.stale);
  return (
    <section className="data-page dashboard-page" aria-labelledby="page-heading-title">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="dashboard-hero panel">
        <span>Net worth · {data.asOfDate}</span>
        <strong>{formatMoney(position.netWorth)}</strong>
        <div className="dashboard-hero-details">
          <div>
            <span>Assets</span>
            <b>{formatMoney(position.totalAssets)}</b>
          </div>
          <div>
            <span>Liabilities</span>
            <b className="negative-balance">{formatMoney(position.totalLiabilities)}</b>
          </div>
          <div>
            <span>Debt-to-asset</span>
            <b>
              {position.debtToAssetRatio === null ? "—" : `${position.debtToAssetRatio}%`}
            </b>
          </div>
        </div>
      </div>
      <MarketFreshness items={priceFreshness} />
      {stalePrices.length > 0 && (
        <aside className="stale-warning" role="status">
          {stalePrices.length} market price{stalePrices.length === 1 ? " is" : "s are"}{" "}
          stale. The last saved prices are still included.
        </aside>
      )}
      <div className="dashboard-content-grid">
        <section className="dashboard-panel panel">
          <h2>Where your money stands</h2>
          <div className="dashboard-list">
            {standRows.map(([label, value, color]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className={color}>{formatMoney(value)}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="dashboard-panel panel" aria-label="People tracker summary">
          <h2>People tracker</h2>
          <div className="dashboard-list">
            <div>
              <span>To receive</span>
              <strong className="positive-balance">
                {formatMoney(peopleTracker.receivable)}
              </strong>
            </div>
            <div>
              <span>To repay</span>
              <strong className="negative-balance">
                {formatMoney(peopleTracker.payable)}
              </strong>
            </div>
            <div>
              <span>People</span>
              <strong>{peopleTracker.peopleCount}</strong>
            </div>
          </div>
        </section>
        <section className="dashboard-panel panel">
          <h2>This month · {monthLabelText}</h2>
          <div className="dashboard-list">
            <div>
              <span>Income</span>
              <strong className="positive-balance">{formatMoney(month.income)}</strong>
            </div>
            <div>
              <span>Expenses</span>
              <strong className="negative-balance">{formatMoney(month.expenses)}</strong>
            </div>
            <div>
              <span>Invested</span>
              <strong>{formatMoney(month.invested)}</strong>
            </div>
            <div>
              <span>Cash flow</span>
              <strong
                className={
                  month.cashFlow.startsWith("-") ? "negative-balance" : "positive-balance"
                }
              >
                {month.cashFlow.startsWith("-") ? "" : "+"}
                {formatMoney(month.cashFlow)}
              </strong>
            </div>
          </div>
        </section>
        <section className="dashboard-panel panel">
          <h2>Net worth, last 6 months (₹)</h2>
          <HistoryBars points={history} />
        </section>
        <section className="dashboard-panel panel">
          <h2>Coming up</h2>
          {upcoming.length ? (
            <div className="dashboard-list">
              {upcoming.map((item) => (
                <div key={`${item.name}-${item.dueDate}`}>
                  <span>
                    {item.name} · {formatMoney(item.amount)}
                  </span>
                  <time>{item.dueDate}</time>
                </div>
              ))}
            </div>
          ) : (
            <p className="report-empty">No upcoming loan payments.</p>
          )}
        </section>
      </div>
    </section>
  );
}
