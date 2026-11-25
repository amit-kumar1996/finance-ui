const DATABASE = "pfm-offline";
const CACHE = "pfm-shell-v1";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readStore(database, name, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(name, mode);
    const result = action(transaction.objectStore(name));
    transaction.oncomplete = () => resolve(result?.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch("/");
      await cache.put("/", response.clone());
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
        (match) => match[1],
      );
      await Promise.all(
        assets.map(async (asset) => {
          const assetResponse = await fetch(asset);
          if (assetResponse.ok) await cache.put(asset, assetResponse);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("pfm-shell-") && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = event.request.mode === "navigate" ? "/" : event.request;
      const cached = await cache.match(key);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok && new URL(event.request.url).pathname.startsWith("/assets/"))
          await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        if (event.request.mode === "navigate" && cached) return cached;
        throw error;
      }
    })(),
  );
});
self.addEventListener("sync", (event) => {
  if (event.tag !== "pfm-offline-sync") return;
  event.waitUntil(
    (async () => {
      const database = await openDatabase();
      try {
        const [mutations, config] = await Promise.all([
          readStore(database, "pendingMutations", "readonly", (store) => store.getAll()),
          readStore(database, "syncMetadata", "readonly", (store) =>
            store.get("apiBase"),
          ),
        ]);
        const pending = mutations.filter((item) => item.state === "pending");
        if (!config?.value || !pending.length) return;
        for (const mutation of pending) {
          const batch = [mutation];
          const response = await fetch(`${config.value}/sync/push`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": mutation.csrfToken,
            },
            body: JSON.stringify({
              mutations: batch.map(({ clientId, method, path, payload }) => ({
                clientId,
                method,
                path,
                payload,
              })),
            }),
          });
          if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
          const { data } = await response.json();
          await new Promise((resolve, reject) => {
            const transaction = database.transaction("pendingMutations", "readwrite");
            const store = transaction.objectStore("pendingMutations");
            for (const result of data.results) {
              if (result.status === "accepted") store.delete(result.clientId);
              else if (result.status === "conflict") {
                const get = store.get(result.clientId);
                get.onsuccess = () =>
                  store.put({
                    ...get.result,
                    state: "conflict",
                    message: result.message,
                  });
              }
            }
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
          });
        }
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of clients) client.postMessage({ type: "pfm-sync-complete" });
      } finally {
        database.close();
      }
    })(),
  );
});
