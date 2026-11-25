import { useCallback, useEffect, useState } from "react";
import {
  discardConflict,
  listPendingMutations,
  type PendingMutation,
} from "./database.js";

export function SyncQueuePanel() {
  const [items, setItems] = useState<PendingMutation[]>([]);
  const reload = useCallback(() => {
    void listPendingMutations().then(setItems);
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener("pfm-sync-state", reload);
    return () => window.removeEventListener("pfm-sync-state", reload);
  }, [reload]);

  return (
    <section className="sync-queue-panel" aria-labelledby="sync-queue-title">
      <div>
        <h2 id="sync-queue-title">Offline changes</h2>
        <p>
          Queued entries are sent when this device reconnects. Conflicts need your review.
        </p>
      </div>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.clientId}>
              <div>
                <strong>
                  {item.method} {item.path}
                </strong>
                <span>
                  {String(
                    item.payload.description ??
                      item.payload.note ??
                      "Financial transaction",
                  )}
                </span>
                <small>
                  {item.createdAt} ·{" "}
                  {item.state === "conflict" ? item.message : "Waiting to sync"}
                </small>
              </div>
              {item.state === "conflict" && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Discard this local copy? No server ledger entry was replaced.",
                      )
                    )
                      void discardConflict(item.clientId);
                  }}
                >
                  Discard local copy
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="report-empty">No queued changes.</p>
      )}
    </section>
  );
}
