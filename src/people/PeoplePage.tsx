import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  createPerson,
  listPeople,
  postPersonMovement,
  type PersonMovement,
  type PersonPaymentMethod,
  type PersonSummary,
} from "../auth/api.js";
import { useAuth } from "../auth/AuthProvider.js";

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

const addMoney = (values: string[]): string => {
  const total = values.reduce((sum, value) => {
    const negative = value.startsWith("-");
    const [whole = "0", fraction = "00"] = (negative ? value.slice(1) : value).split(".");
    const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
    return sum + (negative ? -minor : minor);
  }, 0n);
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
};

export const formatInr = (amount: string): string => {
  const negative = amount.startsWith("-");
  const [whole = "0", fraction = "00"] = (negative ? amount.slice(1) : amount).split(".");
  const lastThree = whole.slice(-3);
  const leading = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}₹${leading ? `${leading},` : ""}${lastThree}.${fraction.padEnd(2, "0").slice(0, 2)}`;
};

const movementLabels: Record<PersonMovement, string> = {
  GIVE: "Give money",
  RECEIVE: "Receive money",
  BORROW: "Borrow",
  REPAY: "Repay",
};

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "The request could not be completed.";

export function PeoplePage() {
  const { session, setError } = useAuth();
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [name, setName] = useState("");
  const [personNotes, setPersonNotes] = useState("");
  const [movement, setMovement] = useState<PersonMovement>("GIVE");
  const [personId, setPersonId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(currentKolkataDate);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PersonPaymentMethod>("CASH");
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      const peopleResult = await listPeople();
      setPeople(peopleResult.people);
      setPersonId((current) => current || peopleResult.people[0]?.id || "");
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

  const totals = useMemo(
    () => ({
      receivable: addMoney(people.map((person) => person.receivableBalance)),
      payable: addMoney(people.map((person) => person.payableBalance)),
      net: addMoney(people.map((person) => person.netBalance)),
    }),
    [people],
  );

  const savePerson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      await createPerson(
        { name: name.trim(), notes: personNotes.trim() || null },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setName("");
      setPersonNotes("");
      setShowPersonForm(false);
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const saveMovement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      await postPersonMovement(
        {
          movement,
          personId,
          effectiveDate,
          amount,
          paymentMethod,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setAmount("");
      setNote("");
      setShowMovementForm(false);
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="people-page" aria-labelledby="people-title">
      <div className="people-toolbar">
        <div>
          <h2 id="people-title">People</h2>
          <p>Track who owes you and who you need to repay. This tracker is separate from Accounts and net worth.</p>
        </div>
        <div className="accounts-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowPersonForm((visible) => !visible)}
          >
            + Add person
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => setShowMovementForm((visible) => !visible)}
          >
            + Add transaction
          </button>
        </div>
      </div>

      <div className="people-summary" aria-label="People balances">
        <article>
          <span>Receivable</span>
          <strong className="positive-balance">{formatInr(totals.receivable)}</strong>
        </article>
        <article>
          <span>Payable</span>
          <strong className="negative-balance">{formatInr(totals.payable)}</strong>
        </article>
        <article>
          <span>Net</span>
          <strong
            className={
              totals.net.startsWith("-") ? "negative-balance" : "positive-balance"
            }
          >
            {formatInr(totals.net)}
          </strong>
        </article>
      </div>

      {showPersonForm && (
        <form className="people-form" onSubmit={(event) => void savePerson(event)}>
          <h3>Add person</h3>
          <div className="people-form-grid">
            <label>
              Name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Note <span className="field-optional">Optional</span>
              <input
                maxLength={500}
                value={personNotes}
                onChange={(event) => setPersonNotes(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowPersonForm(false)}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save person"}
            </button>
          </div>
        </form>
      )}

      {showMovementForm && (
        <form className="people-form" onSubmit={(event) => void saveMovement(event)}>
          <h3>Add transaction</h3>
          <div className="people-form-grid">
            <label>
              Type
              <select
                value={movement}
                onChange={(event) => setMovement(event.target.value as PersonMovement)}
              >
                {Object.entries(movementLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Person
              <select
                required
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
              >
                <option value="">Choose person</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
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
            <label>
              Method
              <select
                required
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PersonPaymentMethod)
                }
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
              </select>
            </label>
            <label>
              Note <span className="field-optional">Optional</span>
              <input
                maxLength={250}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowMovementForm(false)}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={saving || !people.length}
            >
              {saving ? "Saving…" : "Save transaction"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="people-empty" role="status">
          Loading people…
        </p>
      ) : people.length === 0 ? (
        <div className="people-empty">
          <h3>No people yet</h3>
          <p>Add someone you lend to or borrow from.</p>
        </div>
      ) : (
        <div className="people-table-wrap">
          <table className="people-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type (Given/Borrowed)</th>
                <th scope="col">Given or Borrowed</th>
                <th scope="col">Received or Repaid</th>
                <th scope="col">Balance</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <th scope="row">
                    <Link
                      className="person-link"
                      to={`/people/${encodeURIComponent(person.id)}`}
                    >
                      {person.name}
                    </Link>
                  </th>
                  <td>{person.type}</td>
                  <td>{formatInr(person.givenOrBorrowed)}</td>
                  <td>{formatInr(person.receivedOrRepaid)}</td>
                  <td
                    className={
                      person.netBalance.startsWith("-")
                        ? "negative-balance"
                        : "positive-balance"
                    }
                  >
                    {formatInr(person.netBalance)}
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
