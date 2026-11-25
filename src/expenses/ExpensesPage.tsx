import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  createExpense,
  deleteExpense,
  editExpense,
  getDefaultExpenseAccount,
  getExpenseSummary,
  listFinancialAccounts,
  listExpenses,
  type Expense,
  type ExpenseSummary,
  type FinancialAccount,
} from "../auth/api.js";
import { useAuth } from "../auth/AuthProvider.js";
import { listPendingMutations } from "../offline/database.js";

const currentKolkataDate = (): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const formatInr = (amount: string): string => {
  const negative = amount.startsWith("-");
  const [whole = "0", fraction = "00"] = (negative ? amount.slice(1) : amount).split(".");
  const lastThree = whole.slice(-3);
  const leading = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}₹${leading ? `${leading},` : ""}${lastThree}.${fraction.padEnd(2, "0").slice(0, 2)}`;
};

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "The request could not be completed.";

const csvCell = (value: string): string => {
  const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

const saveCsv = (expenses: Expense[]) => {
  const rows = [
    ["Date", "Summary", "Amount (INR)"],
    ...expenses.map((expense) => [
      expense.effectiveDate,
      expense.description,
      expense.amount,
    ]),
  ];
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "expenses.csv";
  link.click();
  URL.revokeObjectURL(url);
};

function ComparisonCard({
  label,
  total,
  previousPeriod,
  previousTotal,
  difference,
}: {
  label: string;
  total: string;
  previousPeriod: string;
  previousTotal: string;
  difference: string;
}) {
  return (
    <article className="expense-total-card">
      <span>{label}</span>
      <strong>{formatInr(total)}</strong>
      <small>
        vs {previousPeriod}: {formatInr(previousTotal)}
      </small>
      <small
        className={difference.startsWith("-") ? "positive-balance" : "negative-balance"}
      >
        {difference.startsWith("-") ? "Down " : "Up "}
        {formatInr(difference.startsWith("-") ? difference.slice(1) : difference)}
      </small>
    </article>
  );
}

export function ExpensesPage() {
  const { session, setError } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [defaultAccountId, setDefaultAccountId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(currentKolkataDate);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState("");
  const [summaryDate, setSummaryDate] = useState(currentKolkataDate);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);

  const refresh = useCallback(async () => {
    try {
      const result = await listExpenses({
        ...(search ? { search } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(month ? { month } : {}),
      });
      setExpenses(result.expenses);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [from, month, search, setError, to]);

  const refreshSummary = useCallback(async () => {
    try {
      setSummary(await getExpenseSummary(summaryDate));
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [setError, summaryDate]);

  const refreshAccounts = useCallback(async () => {
    try {
      const accountResult = await listFinancialAccounts();
      setAccounts(accountResult.accounts);
      let nextDefaultId =
        accountResult.accounts.find((account) => account.accountType !== "CREDIT_CARD")
          ?.id ?? "";
      try {
        const defaultResult = await getDefaultExpenseAccount();
        nextDefaultId = defaultResult.account?.id ?? nextDefaultId;
      } catch (cause) {
        setError(errorText(cause));
      }
      setDefaultAccountId(nextDefaultId);
      setSelectedAccountId((current) => current || nextDefaultId);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    const reloadPending = () => {
      void listPendingMutations().then((mutations) => {
        setPendingExpenses(
          mutations
            .filter((item) => item.method === "POST" && item.path === "/expenses")
            .map((item) => {
              const payload = item.payload as {
                effectiveDate: string;
                description: string;
                amount: string;
              };
              return {
                id: `offline-${item.clientId}`,
                effectiveDate: payload.effectiveDate,
                description: payload.description,
                amount: payload.amount,
                accountId: "offline",
                accountName: item.state === "conflict" ? "Sync conflict" : "Pending sync",
              };
            }),
        );
      });
    };
    const onSyncState = () => {
      reloadPending();
      if (navigator.onLine) void refresh();
    };
    reloadPending();
    window.addEventListener("pfm-sync-state", onSyncState);
    return () => window.removeEventListener("pfm-sync-state", onSyncState);
  }, [refresh]);

  const resetForm = () => {
    setEditingExpenseId(null);
    setEffectiveDate(currentKolkataDate());
    setDescription("");
    setAmount("");
    setSelectedAccountId(defaultAccountId);
    setShowForm(false);
  };

  const beginEdit = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setSelectedAccountId(expense.accountId);
    setEffectiveDate(expense.effectiveDate);
    setDescription(expense.description);
    setAmount(expense.amount);
    setShowForm(true);
    setError(null);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    const input = { effectiveDate, description: description.trim(), amount };
    try {
      if (editingExpenseId) {
        await editExpense(
          editingExpenseId,
          input,
          session.csrfToken,
          crypto.randomUUID(),
        );
      } else {
        const result = await createExpense(
          { ...input, accountId: selectedAccountId },
          session.csrfToken,
          crypto.randomUUID(),
        );
        if (result.queued && result.clientId) {
          setPendingExpenses((current) => {
            const id = `offline-${result.clientId}`;
            return current.some((item) => item.id === id)
              ? current
              : [
                  ...current,
                  {
                    id,
                    ...input,
                    accountId: selectedAccountId,
                    accountName: selectedAccount?.name ?? "Pending sync",
                  },
                ];
          });
          resetForm();
          return;
        }
      }
      resetForm();
      await Promise.all([refresh(), refreshSummary()]);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const visibleExpenses = [
    ...expenses,
    ...pendingExpenses.filter(
      (expense) =>
        (!search || expense.description.toLowerCase().includes(search.toLowerCase())) &&
        (!from || expense.effectiveDate >= from) &&
        (!to || expense.effectiveDate <= to) &&
        (!month || expense.effectiveDate.startsWith(month)),
    ),
  ];

  const remove = async (expense: Expense) => {
    if (!session) return;
    const confirmed = window.confirm(
      `Delete “${expense.description}”? The entry will be reversed and retained in the ledger.`,
    );
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await deleteExpense(expense.id, session.csrfToken, crypto.randomUUID());
      await Promise.all([refresh(), refreshSummary()]);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="expenses-page" aria-labelledby="expenses-title">
      <div className="expenses-toolbar">
        <div>
          <h2 id="expenses-title">Expenses</h2>
          <p>Every expense is posted to the ledger and can be reversed.</p>
        </div>
        <div className="accounts-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => saveCsv(visibleExpenses)}
            disabled={!visibleExpenses.length}
          >
            Export CSV
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            + Add expense
          </button>
        </div>
      </div>

      {!accounts.length && (
        <p className="expense-default-notice" role="status">
          Add an account on the <Link to="/accounts">Accounts page</Link> before adding
          expenses.
        </p>
      )}
      {selectedAccount && (
        <p className="expense-default-note">Selected account: {selectedAccount.name}.</p>
      )}

      {showForm && (
        <form className="expense-form" onSubmit={(event) => void save(event)}>
          <h3>{editingExpenseId ? "Edit expense" : "Add expense"}</h3>
          <div className="expense-form-fields">
            <label>
              Date
              <input
                required
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>
            <label>
              Summary
              <input
                required
                maxLength={250}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label>
              Amount
              <input
                required
                inputMode="decimal"
                maxLength={22}
                pattern="(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,4})?"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            {!editingExpenseId && (
              <label>
                Account
                <select
                  required
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                >
                  <option value="" disabled>
                    Choose an account
                  </option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.accountType.replaceAll("_", " ")})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={resetForm}>
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={saving || (!editingExpenseId && !selectedAccountId)}
            >
              {saving ? "Saving…" : editingExpenseId ? "Save changes" : "Save expense"}
            </button>
          </div>
        </form>
      )}

      <section className="expense-totals" aria-label="Expense totals and comparisons">
        <div className="expense-totals-heading">
          <h3>Totals and comparison</h3>
          <label>
            Totals for
            <input
              type="date"
              value={summaryDate}
              onChange={(event) => setSummaryDate(event.target.value)}
            />
          </label>
        </div>
        {summary ? (
          <div className="expense-total-grid">
            <ComparisonCard
              label={`Day · ${summary.daily.period}`}
              total={summary.daily.total}
              previousPeriod="previous day"
              previousTotal={summary.daily.previousTotal}
              difference={summary.daily.difference}
            />
            <ComparisonCard
              label="Month"
              total={summary.monthly.total}
              previousPeriod={summary.monthly.previousPeriod}
              previousTotal={summary.monthly.previousTotal}
              difference={summary.monthly.difference}
            />
            <ComparisonCard
              label="Year"
              total={summary.yearly.total}
              previousPeriod={summary.yearly.previousPeriod}
              previousTotal={summary.yearly.previousTotal}
              difference={summary.yearly.difference}
            />
          </div>
        ) : (
          <p className="expense-loading" role="status">
            Loading totals…
          </p>
        )}
      </section>

      <section className="expense-list-section" aria-label="Expense list">
        <div className="expense-filters">
          <label>
            Search
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search summaries"
            />
          </label>
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label>
            Month
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        </div>
        {loading ? (
          <p className="expense-loading" role="status">
            Loading expenses…
          </p>
        ) : visibleExpenses.length === 0 ? (
          <div className="expense-empty">
            <h3>No expenses found</h3>
            <p>Change your filters or add an expense.</p>
          </div>
        ) : (
          <div className="expense-table-wrap">
            <table className="expense-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.effectiveDate}</td>
                    <th scope="row">
                      {expense.description}
                      {expense.id.startsWith("offline-") && (
                        <small className="expense-pending-label">
                          {" "}
                          · {expense.accountName}
                        </small>
                      )}
                    </th>
                    <td>{formatInr(expense.amount)}</td>
                    <td className="expense-row-actions">
                      {expense.id.startsWith("offline-") ? (
                        <span className="expense-pending-label">Queued</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => beginEdit(expense)}
                            disabled={saving}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-button expense-delete-button"
                            onClick={() => void remove(expense)}
                            disabled={saving}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
