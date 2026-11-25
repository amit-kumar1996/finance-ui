import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider.js";
import {
  createLoan,
  listLoanAccounts,
  listLoans,
  postLoanPayment,
  postLoanPrepayment,
  type Loan,
  type LoanAccount,
} from "./api.js";

const todayKolkata = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const money = (amount: string): string => {
  const [whole = "0", fraction = "00"] = amount.split(".");
  const tail = whole.slice(-3);
  const head = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${head ? `${head},` : ""}${tail}.${fraction.padEnd(2, "0").slice(0, 2)}`;
};
const sumMoney = (amounts: string[]): string => {
  const cents = amounts.reduce((sum, amount) => {
    const [whole = "0", fraction = ""] = amount.split(".");
    return (
      sum +
      BigInt(whole || "0") * 100n +
      BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0")
    );
  }, 0n);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
};
const message = (error: unknown): string =>
  error instanceof Error ? error.message : "The request could not be completed.";

export function LoansPage() {
  const { session, setError } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [accounts, setAccounts] = useState<LoanAccount[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPrepaymentForm, setShowPrepaymentForm] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [principal, setPrincipal] = useState("");
  const [annualRate, setAnnualRate] = useState("");
  const [termMonths, setTermMonths] = useState("60");
  const [dueDay, setDueDay] = useState("5");
  const [startDate, setStartDate] = useState(todayKolkata);
  const [setupMode, setSetupMode] = useState<"DISBURSEMENT" | "EXISTING_BALANCE">(
    "DISBURSEMENT",
  );
  const [fundingAccountId, setFundingAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayKolkata);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentPrincipal, setPaymentPrincipal] = useState("");
  const [paymentInterest, setPaymentInterest] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [countsAsEmi, setCountsAsEmi] = useState(true);
  const [prepaymentAmount, setPrepaymentAmount] = useState("");
  const [prepaymentNote, setPrepaymentNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [loanRows, accountRows] = await Promise.all([
        listLoans(),
        listLoanAccounts(),
      ]);
      setLoans(loanRows);
      setAccounts(accountRows.filter((account) => account.accountType !== "CREDIT_CARD"));
      setSelectedId((current) =>
        loanRows.some((loan) => loan.id === current) ? current : (loanRows[0]?.id ?? ""),
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (accounts[0] && !paymentAccountId) setPaymentAccountId(accounts[0].id);
  }, [accounts, paymentAccountId]);

  const selected = loans.find((loan) => loan.id === selectedId) ?? loans[0] ?? null;
  const activeLoans = loans.filter((loan) => loan.status === "ACTIVE");
  const totalOutstanding = sumMoney(activeLoans.map((loan) => loan.outstanding));
  const monthlyEmi = sumMoney(activeLoans.map((loan) => loan.emiAmount));
  const nextDue = useMemo(
    () =>
      activeLoans
        .map((loan) => loan.nextDueDate)
        .filter((date): date is string => Boolean(date))
        .sort()[0] ?? null,
    [activeLoans],
  );
  const nextDueIsOverdue = Boolean(nextDue && nextDue < todayKolkata());

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createLoan(
        {
          name,
          provider,
          principal,
          annualRate,
          termMonths: Number(termMonths),
          dueDay: Number(dueDay),
          startDate,
          setupMode,
          fundingAccountId: setupMode === "DISBURSEMENT" ? fundingAccountId : null,
        },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setShowLoanForm(false);
      setName("");
      setProvider("");
      setPrincipal("");
      setAnnualRate("");
      await refresh();
      setSelectedId(result.loan.id);
    } catch (error) {
      setError(message(error));
    } finally {
      setSaving(false);
    }
  };

  const savePayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !selected) return;
    setSaving(true);
    setError(null);
    try {
      await postLoanPayment(
        selected.id,
        {
          effectiveDate: paymentDate,
          accountId: paymentAccountId,
          amount: paymentAmount,
          principalAmount: paymentPrincipal,
          interestAmount: paymentInterest,
          countsAsEmi,
          note: paymentNote,
        },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setShowPaymentForm(false);
      setPaymentAmount("");
      setPaymentPrincipal("");
      setPaymentInterest("");
      setPaymentNote("");
      await refresh();
    } catch (error) {
      setError(message(error));
    } finally {
      setSaving(false);
    }
  };

  const savePrepayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !selected) return;
    setSaving(true);
    setError(null);
    try {
      await postLoanPrepayment(
        selected.id,
        {
          effectiveDate: paymentDate,
          accountId: paymentAccountId,
          amount: prepaymentAmount,
          note: prepaymentNote,
        },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setShowPrepaymentForm(false);
      setPrepaymentAmount("");
      setPrepaymentNote("");
      await refresh();
    } catch (error) {
      setError(message(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="loans-page" aria-labelledby="loans-title">
      <div className="loans-toolbar">
        <div>
          <h2 id="loans-title">Loans &amp; EMI</h2>
          <p>Formal loans, payment schedules and outstanding balances</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => setShowLoanForm((value) => !value)}
        >
          + Add loan
        </button>
      </div>
      {showLoanForm && (
        <form className="loan-form panel" onSubmit={(event) => void submit(event)}>
          <h3>Set up a loan</h3>
          <div className="loan-form-grid">
            <label>
              Loan name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Provider
              <input
                required
                maxLength={120}
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </label>
            <label>
              Principal amount
              <input
                required
                inputMode="decimal"
                pattern="(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,2})?"
                value={principal}
                onChange={(event) => setPrincipal(event.target.value)}
              />
            </label>
            <label>
              Annual interest rate (%)
              <input
                required
                inputMode="decimal"
                maxLength={7}
                value={annualRate}
                onChange={(event) => setAnnualRate(event.target.value)}
              />
            </label>
            <label>
              Term (months)
              <input
                required
                min="1"
                max="600"
                type="number"
                value={termMonths}
                onChange={(event) => setTermMonths(event.target.value)}
              />
            </label>
            <label>
              EMI due day
              <input
                required
                min="1"
                max="31"
                type="number"
                value={dueDay}
                onChange={(event) => setDueDay(event.target.value)}
              />
            </label>
            <label>
              Loan start date
              <input
                required
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              How to record this loan
              <select
                value={setupMode}
                onChange={(event) => setSetupMode(event.target.value as typeof setupMode)}
              >
                <option value="DISBURSEMENT">New disbursement into an account</option>
                <option value="EXISTING_BALANCE">Existing loan opening balance</option>
              </select>
            </label>
            {setupMode === "DISBURSEMENT" && (
              <label>
                Receiving account
                <select
                  required
                  value={fundingAccountId}
                  onChange={(event) => setFundingAccountId(event.target.value)}
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
          </div>
          <p className="loan-form-note">
            EMI is calculated from principal, annual rate, and term. Interest is rounded
            to paise per schedule period.
          </p>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowLoanForm(false)}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={saving || (setupMode === "DISBURSEMENT" && accounts.length === 0)}
            >
              {saving ? "Saving…" : "Save loan"}
            </button>
          </div>
        </form>
      )}
      <div className="loan-summary" aria-label="Loan summary">
        <article>
          <span>Total outstanding</span>
          <strong className="negative-balance">{money(totalOutstanding)}</strong>
        </article>
        <article>
          <span>Monthly EMI</span>
          <strong>{money(monthlyEmi)}</strong>
        </article>
        <article>
          <span>Active loans</span>
          <strong>{activeLoans.length}</strong>
        </article>
        <article>
          <span>Next EMI</span>
          <strong>{nextDue ? `${nextDueIsOverdue ? "Overdue · " : ""}${nextDue}` : "—"}</strong>
        </article>
      </div>
      {loading ? (
        <p role="status">Loading loans…</p>
      ) : loans.length === 0 ? (
        <div className="loan-empty panel">
          <h3>No loans recorded</h3>
          <p>Add a loan to calculate its schedule and track payments.</p>
        </div>
      ) : (
        <>
          <section className="loan-list panel">
            <h3>Loans</h3>
            <div className="loan-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Loan</th>
                    <th>Provider</th>
                    <th>Principal</th>
                    <th>Outstanding</th>
                    <th>EMI</th>
                    <th>Next due</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr
                      key={loan.id}
                      className={loan.id === selected?.id ? "selected-loan" : ""}
                    >
                      <th scope="row">
                        <button
                          className="loan-select"
                          type="button"
                          onClick={() => setSelectedId(loan.id)}
                        >
                          {loan.name}
                        </button>
                      </th>
                      <td>{loan.provider}</td>
                      <td>{money(loan.principal)}</td>
                      <td>{money(loan.outstanding)}</td>
                      <td>{money(loan.emiAmount)}</td>
                      <td>{loan.nextDueDate ?? "Complete"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {selected && (
            <div className="loan-detail-grid">
              <section className="loan-schedule panel">
                <div className="loan-section-heading">
                  <h3>{selected.name} · EMI schedule</h3>
                  {selected.status === "ACTIVE" && (
                    <div className="accounts-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setShowPaymentForm((value) => !value);
                          setShowPrepaymentForm(false);
                        }}
                      >
                        Record payment
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setShowPrepaymentForm((value) => !value);
                          setShowPaymentForm(false);
                        }}
                      >
                        Prepay principal
                      </button>
                    </div>
                  )}
                </div>
                {showPaymentForm && (
                  <form
                    className="loan-action-form"
                    onSubmit={(event) => void savePayment(event)}
                  >
                    <h4>Record EMI payment</h4>
                    <p>
                      Enter the actual payment total and its principal and interest
                      portions.
                    </p>
                    <div className="loan-form-grid">
                      <label>
                        Date
                        <input
                          required
                          type="date"
                          value={paymentDate}
                          onChange={(event) => setPaymentDate(event.target.value)}
                        />
                      </label>
                      <label>
                        Paid from
                        <select
                          required
                          value={paymentAccountId}
                          onChange={(event) => setPaymentAccountId(event.target.value)}
                        >
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Principal
                        <input
                          required
                          inputMode="decimal"
                          value={paymentPrincipal}
                          onChange={(event) => setPaymentPrincipal(event.target.value)}
                        />
                      </label>
                      <label>
                        Interest
                        <input
                          required
                          inputMode="decimal"
                          value={paymentInterest}
                          onChange={(event) => setPaymentInterest(event.target.value)}
                        />
                      </label>
                      <label>
                        Total paid
                        <input
                          required
                          inputMode="decimal"
                          value={paymentAmount}
                          onChange={(event) => setPaymentAmount(event.target.value)}
                        />
                      </label>
                      <label>
                        Note (optional)
                        <input
                          maxLength={250}
                          value={paymentNote}
                          onChange={(event) => setPaymentNote(event.target.value)}
                        />
                      </label>
                    </div>
                    <label className="loan-checkbox">
                      <input
                        type="checkbox"
                        checked={countsAsEmi}
                        onChange={(event) => setCountsAsEmi(event.target.checked)}
                      />{" "}
                      This payment completes the scheduled EMI
                    </label>
                    <button
                      className="primary-button"
                      disabled={saving || accounts.length === 0}
                    >
                      Post payment
                    </button>
                  </form>
                )}
                {showPrepaymentForm && (
                  <form
                    className="loan-action-form"
                    onSubmit={(event) => void savePrepayment(event)}
                  >
                    <h4>Prepay principal</h4>
                    <div className="loan-form-grid">
                      <label>
                        Date
                        <input
                          required
                          type="date"
                          value={paymentDate}
                          onChange={(event) => setPaymentDate(event.target.value)}
                        />
                      </label>
                      <label>
                        Paid from
                        <select
                          required
                          value={paymentAccountId}
                          onChange={(event) => setPaymentAccountId(event.target.value)}
                        >
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Amount
                        <input
                          required
                          inputMode="decimal"
                          value={prepaymentAmount}
                          onChange={(event) => setPrepaymentAmount(event.target.value)}
                        />
                      </label>
                      <label>
                        Note (optional)
                        <input
                          maxLength={250}
                          value={prepaymentNote}
                          onChange={(event) => setPrepaymentNote(event.target.value)}
                        />
                      </label>
                    </div>
                    <button
                      className="primary-button"
                      disabled={saving || accounts.length === 0}
                    >
                      Post prepayment
                    </button>
                  </form>
                )}
                <div className="loan-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Due</th>
                        <th>EMI</th>
                        <th>Principal</th>
                        <th>Interest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.schedule.slice(0, 12).map((line) => (
                        <tr key={line.dueDate}>
                          <td>{line.dueDate}</td>
                          <td>{money(line.emiAmount)}</td>
                          <td>{money(line.principalAmount)}</td>
                          <td className="negative-balance">
                            {money(line.interestAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="loan-details panel">
                <h3>{selected.name} · details</h3>
                <dl>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>{money(selected.outstanding)}</dd>
                  </div>
                  <div>
                    <dt>Interest rate</dt>
                    <dd>{selected.annualRate}%</dd>
                  </div>
                  <div>
                    <dt>Remaining tenure estimate</dt>
                    <dd>{selected.schedule.length} months</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{selected.status === "ACTIVE" ? "Active" : "Closed"}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
