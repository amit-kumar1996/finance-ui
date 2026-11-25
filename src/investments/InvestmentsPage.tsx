import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider.js";
import {
  createInvestment,
  listInvestmentAccounts,
  listInvestments,
  postInvestmentActivity,
  syncAmfiNav,
  updateInvestmentPrice,
  updateInvestmentValuation,
  type Investment,
  type InvestmentAccount,
  type InvestmentType,
} from "./api.js";

const types: Array<{ key: "ALL" | InvestmentType; label: string }> = [
  { key: "ALL", label: "Overview" },
  { key: "NPS", label: "NPS" },
  { key: "MUTUAL_FUND", label: "Mutual funds" },
  { key: "STOCK", label: "Stocks" },
  { key: "FD", label: "FD" },
  { key: "PPF", label: "PPF" },
  { key: "EPF", label: "EPF" },
];
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const money = (value: string) => {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = "00"] = (negative ? value.slice(1) : value).split(".");
  const tail = whole.slice(-3);
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}₹${head ? `${head},` : ""}${tail}.${fraction.padEnd(2, "0").slice(0, 2)}`;
};
const sumMoney = (values: string[]) => {
  const cents = values.reduce((sum, value) => {
    const [whole = "0", fraction = ""] = value.split(".");
    const sign = whole.startsWith("-") ? -1n : 1n;
    return (
      sum +
      sign *
        (BigInt(whole.replace("-", "") || "0") * 100n +
          BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0"))
    );
  }, 0n);
  const sign = cents < 0 ? "-" : "";
  const absolute = cents < 0 ? -cents : cents;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
};
const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request could not be completed.";
const labels: Record<InvestmentType, string> = {
  NPS: "NPS",
  MUTUAL_FUND: "Mutual fund",
  STOCK: "Stock",
  FD: "FD",
  PPF: "PPF",
  EPF: "EPF",
};

export function InvestmentsPage() {
  const { session, setError } = useAuth();
  const [rows, setRows] = useState<Investment[]>([]);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [tab, setTab] = useState<(typeof types)[number]["key"]>("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<InvestmentType>("MUTUAL_FUND");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [symbol, setSymbol] = useState("");
  const [annualRate, setAnnualRate] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [active, setActive] = useState<Investment | null>(null);
  const [action, setAction] = useState<
    "BUY" | "SELL" | "CONTRIBUTION" | "WITHDRAWAL" | "PRICE" | "VALUATION"
  >("BUY");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [units, setUnits] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [currentValue, setCurrentValue] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [investments, accountResult] = await Promise.all([
        listInvestments(),
        listInvestmentAccounts(),
      ]);
      setRows(investments);
      setAccounts(
        accountResult.filter((account) => account.accountType !== "CREDIT_CARD"),
      );
      setActive((previous) => investments.find((row) => row.id === previous?.id) ?? null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [setError]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (accounts[0] && !accountId) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const visible = useMemo(
    () => (tab === "ALL" ? rows : rows.filter((row) => row.investmentType === tab)),
    [rows, tab],
  );
  const market = rows.filter((row) =>
    ["NPS", "MUTUAL_FUND", "STOCK"].includes(row.investmentType),
  );
  const fixed = rows.filter((row) => ["FD", "PPF", "EPF"].includes(row.investmentType));
  const totalValue = sumMoney(rows.map((row) => row.currentValue));
  const totalInvested = sumMoney(rows.map((row) => row.invested));
  const profit = sumMoney([totalValue, `-${totalInvested}`]);
  const mutualXirr =
    rows.find((row) => row.investmentType === "MUTUAL_FUND" && row.xirr)?.xirr ?? null;
  const totalCents = rows.reduce((sum, row) => {
    const [whole = "0", fraction = ""] = row.currentValue.split(".");
    return (
      sum +
      BigInt(whole || "0") * 100n +
      BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0")
    );
  }, 0n);
  const allocation = types
    .slice(1)
    .map((item, index) => {
      const value = sumMoney(
        rows
          .filter((row) => row.investmentType === item.key)
          .map((row) => row.currentValue),
      );
      const [whole = "0", fraction = ""] = value.split(".");
      const cents =
        BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0");
      const percent = totalCents > 0n ? Number((cents * 10_000n) / totalCents) / 100 : 0;
      return {
        type: item.key,
        label: item.label,
        value,
        percent,
        color: ["#247b64", "#3c79b8", "#a16a2f", "#8a68b1", "#318991", "#be5f67"][index],
      };
    })
    .filter((item) => item.value !== "0.00");

  const submitCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      await createInvestment(
        {
          investmentType: createType,
          name,
          provider,
          symbol,
          ...(annualRate ? { annualRate } : {}),
          maturityDate: maturityDate || null,
        },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setShowCreate(false);
      setName("");
      setProvider("");
      setSymbol("");
      setAnnualRate("");
      setMaturityDate("");
      await refresh();
      setActive(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const submitActivity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !active) return;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const key = crypto.randomUUID();
      if (action === "PRICE")
        await updateInvestmentPrice(
          active.id,
          { effectiveDate: date, unitPrice },
          session.csrfToken,
          key,
        );
      else if (action === "VALUATION")
        await updateInvestmentValuation(
          active.id,
          { effectiveDate: date, currentValue },
          session.csrfToken,
          key,
        );
      else {
        const endpoint =
          action === "BUY"
            ? "buys"
            : action === "SELL"
              ? "sells"
              : action === "CONTRIBUTION"
                ? "contributions"
                : "withdrawals";
        const body = ["BUY", "SELL"].includes(action)
          ? { effectiveDate: date, accountId, units, unitPrice, note: "" }
          : { effectiveDate: date, accountId, amount, note: "" };
        await postInvestmentActivity(active.id, endpoint, body, session.csrfToken, key);
      }
      setActive(null);
      setAmount("");
      setUnits("");
      setUnitPrice("");
      setCurrentValue("");
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const doAmfiSync = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const result = await syncAmfiNav(session.csrfToken);
      setNotice(
        `AMFI refreshed ${result.updated} fund${result.updated === 1 ? "" : "s"}; ${result.missing.length} scheme code${result.missing.length === 1 ? " was" : "s were"} not found.`,
      );
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const table = (items: Investment[], marketTable: boolean) => (
    <div className="investment-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Investment</th>
            <th>{marketTable ? "Units / Price" : "Rate / Maturity"}</th>
            <th>Invested</th>
            <th>Current value</th>
            <th>Gain / loss</th>
            <th>Price data</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <strong>{row.name}</strong>
                <small>
                  {labels[row.investmentType]}
                  {row.provider ? ` · ${row.provider}` : ""}
                </small>
              </th>
              <td>
                {marketTable ? (
                  <>
                    {row.units} units
                    {row.price ? <small>₹{row.price} per unit</small> : null}
                  </>
                ) : (
                  <>
                    {row.annualRate ? `${row.annualRate}%` : "—"}
                    <small>
                      {row.maturityDate
                        ? `Matures ${row.maturityDate}`
                        : "No maturity date"}
                    </small>
                  </>
                )}
              </td>
              <td>{money(row.invested)}</td>
              <td>{money(row.currentValue)}</td>
              <td
                className={
                  row.unrealizedPl.startsWith("-")
                    ? "negative-balance"
                    : "positive-balance"
                }
              >
                {money(row.unrealizedPl)}
              </td>
              <td>
                {row.priceSource ? (
                  <>
                    {row.priceSource === "AMFI"
                      ? "AMFI NAV"
                      : row.priceSource === "PROVIDER"
                        ? "Provider"
                        : "Manual"}
                    <small>
                      {row.priceDate ?? "Date unavailable"}
                      {row.stale ? " · Stale" : ""}
                    </small>
                  </>
                ) : (
                  "Not valued"
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setActive(row);
                    setAction(marketTable ? "BUY" : "CONTRIBUTION");
                    setCurrentValue(row.currentValue);
                  }}
                >
                  Record
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <p className="investment-empty">No investments in this section yet.</p>
      )}
    </div>
  );

  return (
    <section className="investments-page" aria-labelledby="investments-title">
      <div className="investments-toolbar">
        <div>
          <h2 id="investments-title">Investments</h2>
          <p>Holdings, contributions, valuations and market data freshness</p>
        </div>
        <div className="accounts-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={saving || !rows.some((row) => row.investmentType === "MUTUAL_FUND")}
            onClick={() => void doAmfiSync()}
          >
            Refresh AMFI NAV
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => setShowCreate((open) => !open)}
          >
            + Add investment
          </button>
        </div>
      </div>
      {notice && (
        <p className="investment-notice" role="status">
          {notice}
        </p>
      )}
      {showCreate && (
        <form
          className="investment-form panel"
          onSubmit={(event) => void submitCreate(event)}
        >
          <h3>Add investment</h3>
          <div className="investment-form-grid">
            <label>
              Type
              <select
                value={createType}
                onChange={(event) => setCreateType(event.target.value as InvestmentType)}
              >
                {types.slice(1).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                required
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Provider
              <input
                maxLength={120}
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </label>
            {["MUTUAL_FUND", "STOCK"].includes(createType) && (
              <label>
                {createType === "MUTUAL_FUND" ? "AMFI scheme code" : "Market symbol"}
                <input
                  required
                  maxLength={32}
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                />
              </label>
            )}
            {["FD", "PPF", "EPF"].includes(createType) && (
              <>
                <label>
                  Annual rate (%)
                  <input
                    inputMode="decimal"
                    value={annualRate}
                    onChange={(event) => setAnnualRate(event.target.value)}
                  />
                </label>
                <label>
                  Maturity date
                  <input
                    type="date"
                    value={maturityDate}
                    onChange={(event) => setMaturityDate(event.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "Saving…" : "Save investment"}
            </button>
          </div>
        </form>
      )}
      <nav className="investment-tabs" aria-label="Investment types">
        {types.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? "active" : ""}
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="investment-summary">
        <article>
          <span>Current value</span>
          <strong>{money(totalValue)}</strong>
        </article>
        <article>
          <span>Invested</span>
          <strong>{money(totalInvested)}</strong>
        </article>
        <article>
          <span>Profit / loss</span>
          <strong
            className={profit.startsWith("-") ? "negative-balance" : "positive-balance"}
          >
            {money(profit)}
          </strong>
        </article>
        <article>
          <span>Mutual fund XIRR</span>
          <strong>{mutualXirr ? `${mutualXirr}%` : "—"}</strong>
        </article>
      </div>
      {loading ? (
        <p role="status">Loading investments…</p>
      ) : (
        <>
          {tab === "ALL" ? (
            <>
              <section className="investment-panel panel">
                <h3>Market investments</h3>
                {table(market, true)}
              </section>
              <section className="investment-panel panel">
                <h3>FD, PPF and EPF</h3>
                {table(fixed, false)}
              </section>
              <section className="investment-panel panel">
                <h3>Allocation by type</h3>
                {allocation.length > 0 ? (
                  <div className="investment-allocation">
                    <div
                      className="investment-allocation-bar"
                      aria-label="Investment allocation"
                    >
                      {allocation.map((item) => (
                        <span
                          key={item.type}
                          style={{
                            width: `${item.percent}%`,
                            backgroundColor: item.color,
                          }}
                          title={`${item.label}: ${item.percent}%`}
                        />
                      ))}
                    </div>
                    <div className="investment-allocation-legend">
                      {allocation.map((item) => (
                        <div key={item.type}>
                          <span>
                            <i style={{ backgroundColor: item.color }} />
                            {item.label}
                          </span>
                          <strong>
                            {money(item.value)} · {item.percent}%
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p>No holdings to allocate yet.</p>
                )}
              </section>
              <section className="investment-panel panel">
                <h3>Price freshness</h3>
                <div className="investment-freshness">
                  {market.length ? (
                    market.map((row) => (
                      <div key={row.id}>
                        <span>{row.name}</span>
                        <strong>
                          {row.priceSource
                            ? `${row.priceSource === "AMFI" ? "AMFI closing NAV" : "Manual"} · ${row.priceDate ?? "no date"}${row.stale ? " · stale" : ""}`
                            : "No price recorded"}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <p>
                      No market holdings yet. Prices are never invented; record a manual
                      price or refresh AMFI for mutual funds.
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <section className="investment-panel panel">
              <h3>{types.find((item) => item.key === tab)?.label}</h3>
              {table(visible, ["NPS", "MUTUAL_FUND", "STOCK"].includes(tab))}
            </section>
          )}
        </>
      )}
      {active && (
        <form
          className="investment-action panel"
          onSubmit={(event) => void submitActivity(event)}
        >
          <div className="investment-panel-heading">
            <div>
              <h3>Record activity · {active.name}</h3>
              <p>Posted changes update the ledger atomically.</p>
            </div>
            <button className="text-button" type="button" onClick={() => setActive(null)}>
              Close
            </button>
          </div>
          <div className="investment-form-grid">
            <label>
              Activity
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as typeof action)}
              >
                {(["NPS", "MUTUAL_FUND", "STOCK"].includes(active.investmentType)
                  ? ["BUY", "SELL", "PRICE"]
                  : ["CONTRIBUTION", "WITHDRAWAL", "VALUATION"]
                ).map((value) => (
                  <option key={value} value={value}>
                    {value === "PRICE"
                      ? "Manual unit price"
                      : value[0] + value.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            {["BUY", "SELL", "CONTRIBUTION", "WITHDRAWAL"].includes(action) && (
              <label>
                Account
                <select
                  required
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  <option value="">Choose account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["BUY", "SELL"].includes(action) && (
              <>
                <label>
                  Units
                  <input
                    required
                    inputMode="decimal"
                    value={units}
                    onChange={(event) => setUnits(event.target.value)}
                  />
                </label>
                <label>
                  Unit price (₹)
                  <input
                    required
                    inputMode="decimal"
                    value={unitPrice}
                    onChange={(event) => setUnitPrice(event.target.value)}
                  />
                </label>
              </>
            )}
            {["CONTRIBUTION", "WITHDRAWAL"].includes(action) && (
              <label>
                Amount (₹)
                <input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
            )}
            {action === "PRICE" && (
              <label>
                Unit price (₹)
                <input
                  required
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(event.target.value)}
                />
              </label>
            )}
            {action === "VALUATION" && (
              <label>
                Current value (₹)
                <input
                  required
                  inputMode="decimal"
                  value={currentValue}
                  onChange={(event) => setCurrentValue(event.target.value)}
                />
              </label>
            )}
          </div>
          <div className="form-actions">
            <button
              className="primary-button"
              disabled={
                saving ||
                (accounts.length === 0 &&
                  ["BUY", "SELL", "CONTRIBUTION", "WITHDRAWAL"].includes(action))
              }
            >
              {saving ? "Posting…" : "Save activity"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
