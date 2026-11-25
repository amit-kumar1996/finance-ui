import Dexie, { type Table } from "dexie";

export interface PendingMutation {
  clientId: string;
  method: "POST" | "PUT";
  path: string;
  payload: Record<string, unknown>;
  csrfToken: string;
  state: "pending" | "conflict";
  createdAt: string;
  message?: string;
}

export interface LedgerChange {
  id: string;
  effectiveDate: string;
  description: string;
  source: string;
  reversalOfId: string | null;
  createdAt: string;
  entries: Array<{
    accountId: string;
    accountName: string;
    category: string;
    debit: string;
    credit: string;
  }>;
}

interface SyncMetadata {
  key: string;
  value: string;
}

class FinanceOfflineDatabase extends Dexie {
  pendingMutations!: Table<PendingMutation, string>;
  ledgerChanges!: Table<LedgerChange, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super("pfm-offline");
    this.version(1).stores({
      pendingMutations: "clientId,state,createdAt",
      ledgerChanges: "id,createdAt,effectiveDate",
      syncMetadata: "key",
    });
  }
}

export const offlineDb = new FinanceOfflineDatabase();
const listeners = new Set<() => void>();
let snapshot = { pending: 0, conflicts: 0, syncing: false };

const notify = () => {
  for (const listener of listeners) listener();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("pfm-sync-state"));
};

offlineDb.pendingMutations.hook("creating", () => {
  void refreshPendingCount();
});
offlineDb.pendingMutations.hook("updating", () => {
  void refreshPendingCount();
});
offlineDb.pendingMutations.hook("deleting", () => {
  void refreshPendingCount();
});

export const refreshPendingCount = async () => {
  try {
    const [pending, conflicts] = await Promise.all([
      offlineDb.pendingMutations.count(),
      offlineDb.pendingMutations.where("state").equals("conflict").count(),
    ]);
    snapshot = { ...snapshot, pending, conflicts };
  } catch {
    snapshot = { ...snapshot, pending: 0, conflicts: 0 };
  }
  notify();
  return snapshot.pending;
};

export const subscribeSyncState = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getSyncSnapshot = () => snapshot;
export const setSyncing = (value: boolean) => {
  snapshot = { ...snapshot, syncing: value };
  notify();
};

export const queueMutation = async (
  clientId: string,
  method: PendingMutation["method"],
  path: string,
  payload: Record<string, unknown>,
  csrfToken: string,
) => {
  if (typeof indexedDB === "undefined")
    throw new Error("Offline storage is unavailable in this browser.");
  const existing = await offlineDb.pendingMutations.get(clientId);
  if (existing) {
    if (
      existing.method !== method ||
      existing.path !== path ||
      JSON.stringify(existing.payload) !== JSON.stringify(payload)
    ) {
      await offlineDb.pendingMutations.update(clientId, {
        state: "conflict",
        message: "This client request ID is already queued with different data.",
      });
      throw new Error("This offline entry conflicts with a previously queued request.");
    }
    return;
  }
  await offlineDb.pendingMutations.add({
    clientId,
    method,
    path,
    payload,
    csrfToken,
    state: "pending",
    createdAt: new Date().toISOString(),
  });
  await refreshPendingCount();
  void requestBackgroundSync();
};

export const listPendingMutations = async () => {
  if (typeof indexedDB === "undefined") return [];
  try {
    return await offlineDb.pendingMutations.orderBy("createdAt").toArray();
  } catch {
    return [];
  }
};

export const discardConflict = async (clientId: string) => {
  const item = await offlineDb.pendingMutations.get(clientId);
  if (item?.state !== "conflict") return false;
  await offlineDb.pendingMutations.delete(clientId);
  await refreshPendingCount();
  return true;
};

export const setApiBaseForWorker = async (apiBase: string) => {
  await offlineDb.syncMetadata.put({ key: "apiBase", value: apiBase });
};

export async function requestBackgroundSync() {
  if (
    typeof navigator === "undefined" ||
    typeof indexedDB === "undefined" ||
    !("serviceWorker" in navigator)
  )
    return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await syncRegistration.sync?.register("pfm-offline-sync");
  } catch {
    // The online event remains the fallback on browsers without Background Sync.
  }
}
