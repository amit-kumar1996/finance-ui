import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  archivePerson,
  getPersonStatement,
  updatePerson,
  type PersonStatement,
} from "../auth/api.js";
import { useAuth } from "../auth/AuthProvider.js";
import { formatInr } from "./PeoplePage.js";

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "The request could not be completed.";

const movementLabel = (movement: string): string =>
  ({
    GIVE: "Given",
    RECEIVE: "Received",
    BORROW: "Borrowed",
    REPAY: "Repaid",
    REVERSAL: "Reversal",
  })[movement] ?? movement;

export function PersonDetailPage() {
  const { personId = "" } = useParams();
  const navigate = useNavigate();
  const { session, setError } = useAuth();
  const [statement, setStatement] = useState<PersonStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = useCallback(async () => {
    try {
      const result = await getPersonStatement(personId);
      setStatement(result);
      setName(result.person.name);
      setNotes(result.person.notes ?? "");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [personId, setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveChanges = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !statement) return;
    setSaving(true);
    setError(null);
    try {
      await updatePerson(
        personId,
        { name: name.trim(), notes: notes.trim() || null },
        session.csrfToken,
        crypto.randomUUID(),
      );
      setEditing(false);
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      await archivePerson(personId, session.csrfToken, crypto.randomUUID());
      navigate("/people");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <p className="people-empty" role="status">
        Loading statement…
      </p>
    );
  if (!statement)
    return (
      <section className="people-empty">
        <h2>Person not found</h2>
        <Link to="/people">Back to People</Link>
      </section>
    );

  const { person, transactions } = statement;
  return (
    <section className="people-page" aria-labelledby="person-detail-title">
      <div className="people-toolbar">
        <div>
          <Link className="back-link" to="/people">
            ← People
          </Link>
          <h2 id="person-detail-title">{person.name}</h2>
          {person.notes && <p>{person.notes}</p>}
        </div>
        <div className="accounts-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setEditing((value) => !value)}
          >
            Edit person
          </button>
          <button
            className="secondary-button archive-button"
            type="button"
            onClick={() => void archive()}
            disabled={saving}
          >
            Archive
          </button>
        </div>
      </div>

      {editing && (
        <form className="people-form" onSubmit={(event) => void saveChanges(event)}>
          <h3>Edit person</h3>
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
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}

      <div className="people-summary" aria-label={`${person.name} balances`}>
        <article>
          <span>Receivable</span>
          <strong className="positive-balance">
            {formatInr(person.receivableBalance)}
          </strong>
        </article>
        <article>
          <span>Payable</span>
          <strong className="negative-balance">{formatInr(person.payableBalance)}</strong>
        </article>
        <article>
          <span>Net</span>
          <strong
            className={
              person.netBalance.startsWith("-") ? "negative-balance" : "positive-balance"
            }
          >
            {formatInr(person.netBalance)}
          </strong>
        </article>
      </div>

      <div className="statement-heading">
        <h3>Statement</h3>
        <span>{transactions.length} transactions</span>
      </div>
      {transactions.length === 0 ? (
        <div className="people-empty">
          <p>No transactions recorded for this person.</p>
        </div>
      ) : (
        <div className="people-table-wrap">
          <table className="people-table statement-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Summary</th>
                <th scope="col">Type</th>
                <th scope="col">Amount</th>
                <th scope="col">Running balance</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.effectiveDate}</td>
                  <td>{transaction.description}</td>
                  <td>{movementLabel(transaction.movement)}</td>
                  <td>{formatInr(transaction.amount)}</td>
                  <td
                    className={
                      transaction.runningNetBalance.startsWith("-")
                        ? "negative-balance"
                        : "positive-balance"
                    }
                  >
                    {formatInr(transaction.runningNetBalance)}
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
