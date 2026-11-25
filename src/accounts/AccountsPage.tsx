import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAccountTransfer,
  createFinancialAccount,
  getDefaultExpenseAccount,
  listFinancialAccounts,
  setDefaultExpenseAccount,
  type FinancialAccount,
  type FinancialAccountType,
} from "../auth/api.js";
import { useAuth } from "../auth/AuthProvider.js";

const accountTypeLabels: Record<FinancialAccountType, string> = {
  BANK: "Bank",
  CASH: "Cash",
  UPI: "UPI",
  CREDIT_CARD: "Credit card",
};

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
  const [rawWhole = "0", rawFraction = "00"] = (
    negative ? amount.slice(1) : amount
  ).split(".");
  const fraction = rawFraction.padEnd(2, "0").slice(0, 2);
  const lastThree = rawWhole.slice(-3);
  const leading = rawWhole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = leading ? `${leading},${lastThree}` : lastThree;
  return `${negative ? "−" : ""}₹${grouped}.${fraction}`;
};

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "The request could not be completed.";

export function AccountsPage() {
  const { session, setError } = useAuth();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<FinancialAccountType>("BANK");
  const [institutionName, setInstitutionName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0.00");
  const [effectiveDate, setEffectiveDate] = useState(currentKolkataDate);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  const [transferDate, setTransferDate] = useState(currentKolkataDate);
  const [defaultExpenseAccountId, setDefaultExpenseAccountId] = useState("");

  const transferableAccounts = useMemo(
    () => accounts.filter((account) => account.accountType !== "CREDIT_CARD"),
    [accounts],
  );

  const refresh = useCallback(async () => {
    try {
      const [result, defaultResult] = await Promise.all([
        listFinancialAccounts(),
        getDefaultExpenseAccount(),
      ]);
      setAccounts(result.accounts);
      setDefaultExpenseAccountId(defaultResult.account?.id ?? "");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void refresh();
    const onSyncComplete = () => void refresh();
    window.addEventListener("pfm-sync-complete", onSyncComplete);
    return () => window.removeEventListener("pfm-sync-complete", onSyncComplete);
  }, [refresh]);

  const saveAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      await createFinancialAccount(
        {
          name: accountName.trim(),
          accountType,
          institutionName: institutionName.trim() || null,
          openingBalance,
          effectiveDate,
        },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setAccountName("");
      setInstitutionName("");
      setOpeningBalance("0.00");
      setShowAccountForm(false);
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const saveTransfer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      await createAccountTransfer(
        {
          fromAccountId,
          toAccountId,
          effectiveDate: transferDate,
          amount: transferAmount,
          description: transferDescription.trim(),
        },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setTransferAmount("");
      setTransferDescription("");
      setShowTransferForm(false);
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const saveDefaultExpenseAccount = async (nextAccountId: string) => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const result = await setDefaultExpenseAccount(
        nextAccountId || null,
        session.csrfToken,
        crypto.randomUUID(),
      );
      setDefaultExpenseAccountId(result.account?.id ?? "");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="accounts-page" aria-labelledby="accounts-title">
      <div className="accounts-toolbar">
        <div>
          <h2 id="accounts-title">Your accounts</h2>
          <p>Balances come from posted ledger entries.</p>
        </div>
        <div className="accounts-actions">
          {transferableAccounts.length > 1 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowTransferForm((visible) => !visible)}
            >
              Transfer
            </button>
          )}
          <button
            className="primary-button"
            type="button"
            onClick={() => setShowAccountForm((visible) => !visible)}
          >
            + Add account
          </button>
        </div>
      </div>

      <div className="default-expense-preference">
        <label>
          Default expense account
          <select
            disabled={saving}
            value={defaultExpenseAccountId}
            onChange={(event) => void saveDefaultExpenseAccount(event.target.value)}
          >
            <option value="">Choose an account</option>
            {transferableAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <span>Expenses use this account without adding a field to the entry form.</span>
      </div>

      {showAccountForm && (
        <form className="account-form" onSubmit={(event) => void saveAccount(event)}>
          <h3>Add account</h3>
          <div className="account-form-grid">
            <label>
              Account name
              <input
                autoComplete="off"
                maxLength={100}
                required
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
              />
            </label>
            <label>
              Type
              <select
                value={accountType}
                onChange={(event) =>
                  setAccountType(event.target.value as FinancialAccountType)
                }
              >
                {Object.entries(accountTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bank or provider name <span className="field-optional">Optional</span>
              <input
                autoComplete="off"
                maxLength={100}
                value={institutionName}
                onChange={(event) => setInstitutionName(event.target.value)}
              />
            </label>
            <label>
              Opening balance
              <input
                inputMode="decimal"
                maxLength={22}
                pattern="(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,4})?"
                required
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
              />
              <span className="field-help">
                For a credit card, enter the amount currently owed.
              </span>
            </label>
            <label>
              Opening balance date
              <input
                required
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowAccountForm(false)}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save account"}
            </button>
          </div>
        </form>
      )}

      {showTransferForm && (
        <form className="account-form" onSubmit={(event) => void saveTransfer(event)}>
          <h3>Transfer between accounts</h3>
          <div className="account-form-grid">
            <label>
              From
              <select
                required
                value={fromAccountId}
                onChange={(event) => setFromAccountId(event.target.value)}
              >
                <option value="">Choose account</option>
                {transferableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <select
                required
                value={toAccountId}
                onChange={(event) => setToAccountId(event.target.value)}
              >
                <option value="">Choose account</option>
                {transferableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                required
                type="date"
                value={transferDate}
                onChange={(event) => setTransferDate(event.target.value)}
              />
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                maxLength={22}
                pattern="(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,4})?"
                required
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value)}
              />
            </label>
            <label className="account-form-wide">
              Summary
              <input
                maxLength={250}
                required
                value={transferDescription}
                onChange={(event) => setTransferDescription(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowTransferForm(false)}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Post transfer"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="accounts-empty" role="status">
          Loading accounts…
        </p>
      ) : accounts.length === 0 ? (
        <div className="accounts-empty">
          <h3>No accounts yet</h3>
          <p>Add a bank, cash, UPI, or credit-card account to get started.</p>
        </div>
      ) : (
        <div className="accounts-table-wrap">
          <table className="accounts-table">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Type</th>
                <th scope="col">Provider</th>
                <th
                  scope="col"
                  className="accounts-balance-heading"
                >{`Balance · INR`}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <th scope="row">
                    <span className="account-name">{account.name}</span>
                    <span className="account-balance-mobile">
                      {account.accountType === "CREDIT_CARD" ? "Owed " : ""}
                      {formatInr(account.balance)}
                    </span>
                  </th>
                  <td>
                    <span className="account-type-pill">
                      {accountTypeLabels[account.accountType]}
                    </span>
                  </td>
                  <td>{account.institutionName || "—"}</td>
                  <td
                    className={`account-balance${account.accountType === "CREDIT_CARD" ? " liability-balance" : ""}`}
                  >
                    {account.accountType === "CREDIT_CARD" && <span>Owed </span>}
                    {formatInr(account.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
