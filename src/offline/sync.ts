import {
  offlineDb,
  refreshPendingCount,
  setApiBaseForWorker,
  setSyncing,
  type LedgerChange,
  type PendingMutation,
} from "./database.js";

const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
let activeSync: Promise<void> | null = null;

interface SyncResponse<T> {
  data: T;
}

const readJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw new Error(`Sync request failed (${response.status}).`);
  return (await response.json()) as T;
};

async function pushPending(csrfToken: string) {
  const pending = await offlineDb.pendingMutations
    .where("state")
    .equals("pending")
    .sortBy("createdAt");
  for (let start = 0; start < pending.length; start += 50) {
    const batch = pending.slice(start, start + 50);
    const response = await fetch(`${apiBase}/sync/push`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({
        mutations: batch.map(({ clientId, method, path, payload }) => ({
          clientId,
          method,
          path,
          payload,
        })),
      }),
    });
    const payload = await readJson<
      SyncResponse<{
        results: Array<{
          clientId: string;
          status: "accepted" | "conflict" | "retry";
          message?: string;
        }>;
      }>
    >(response);
    await offlineDb.transaction("rw", offlineDb.pendingMutations, async () => {
      for (const result of payload.data.results) {
        if (result.status === "accepted")
          await offlineDb.pendingMutations.delete(result.clientId);
        else if (result.status === "conflict")
          await offlineDb.pendingMutations.update(result.clientId, {
            state: "conflict",
            message: result.message ?? "The server found a conflict. Review this entry.",
          });
      }
    });
  }
}

async function pullChanges() {
  let cursor = (await offlineDb.syncMetadata.get("pullCursor"))?.value;
  let hasMore = true;
  while (hasMore) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await fetch(`${apiBase}/sync/pull${query}`, {
      credentials: "include",
    });
    const payload = await readJson<
      SyncResponse<{
        changes: LedgerChange[];
        cursor: string | null;
        hasMore: boolean;
      }>
    >(response);
    await offlineDb.transaction(
      "rw",
      offlineDb.ledgerChanges,
      offlineDb.syncMetadata,
      async () => {
        await offlineDb.ledgerChanges.bulkPut(payload.data.changes);
        if (payload.data.cursor)
          await offlineDb.syncMetadata.put({
            key: "pullCursor",
            value: payload.data.cursor,
          });
      },
    );
    cursor = payload.data.cursor ?? undefined;
    hasMore = payload.data.hasMore;
  }
}

export const syncNow = (csrfToken: string) => {
  if (activeSync) return activeSync;
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve();
  activeSync = (async () => {
    setSyncing(true);
    try {
      await pushPending(csrfToken);
      await pullChanges();
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("pfm-sync-complete"));
    } finally {
      await refreshPendingCount();
      setSyncing(false);
      activeSync = null;
    }
  })();
  return activeSync;
};

export const pendingForDisplay = async (): Promise<PendingMutation[]> =>
  offlineDb.pendingMutations.orderBy("createdAt").toArray();

export const registerOfflineWorker = async () => {
  if (typeof indexedDB === "undefined") return;
  await setApiBaseForWorker(apiBase);
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/service-worker.js");
  } catch {
    // Offline queuing works without a service worker; only background wake-up is lost.
  }
};
