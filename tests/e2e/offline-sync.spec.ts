import { expect, test } from "@playwright/test";

test("queues an expense offline and posts it once after reconnecting", async ({
  page,
  context,
}) => {
  const queuedWrites: Array<{ clientId: string; payload: { description: string } }> = [];
  let savedExpense: Record<string, string> | null = null;
  let offline = false;
  await page.route("http://localhost:3000/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/expenses") && request.method() === "POST" && offline) {
      await route.abort("internetdisconnected");
    } else if (url.pathname.endsWith("/auth/session")) {
      await route.fulfill({
        json: {
          data: {
            userId: "playwright-user",
            csrfToken: "csrf-playwright",
            expiresAt: "2027-01-01T00:00:00.000Z",
            recoveryOnly: false,
          },
        },
      });
    } else if (url.pathname.endsWith("/preferences/default-expense-account")) {
      await route.fulfill({
        json: { data: { account: { id: "bank-1", name: "Main bank" } } },
      });
    } else if (url.pathname.endsWith("/expenses/summary")) {
      const zero = {
        period: "2026-11",
        total: "0.00",
        previousPeriod: "2026-10",
        previousTotal: "0.00",
        difference: "0.00",
      };
      await route.fulfill({
        json: {
          data: {
            summary: {
              date: "2026-11-25",
              daily: {
                period: "2026-11-25",
                total: "0.00",
                previousTotal: "0.00",
                difference: "0.00",
              },
              monthly: zero,
              yearly: zero,
            },
          },
        },
      });
    } else if (url.pathname.endsWith("/sync/push")) {
      const body = request.postDataJSON() as {
        mutations: Array<{
          clientId: string;
          method: string;
          path: string;
          payload: { effectiveDate: string; description: string; amount: string };
        }>;
      };
      for (const mutation of body.mutations) {
        queuedWrites.push({ clientId: mutation.clientId, payload: mutation.payload });
        savedExpense = {
          id: "server-expense-1",
          effectiveDate: mutation.payload.effectiveDate,
          description: mutation.payload.description,
          amount: mutation.payload.amount,
          accountId: "bank-1",
          accountName: "Main bank",
        };
      }
      await route.fulfill({
        json: {
          data: {
            results: body.mutations.map((item) => ({
              clientId: item.clientId,
              status: "accepted",
              transactionId: "server-expense-1",
            })),
          },
        },
      });
    } else if (url.pathname.endsWith("/sync/pull")) {
      await route.fulfill({
        json: { data: { changes: [], cursor: null, hasMore: false } },
      });
    } else if (url.pathname.endsWith("/expenses")) {
      await route.fulfill({
        json: { data: { expenses: savedExpense ? [savedExpense] : [] } },
      });
    } else if (url.pathname.endsWith("/dashboard")) {
      await route.fulfill({
        json: {
          data: {
            asOfDate: "2026-11-25",
            position: {
              totalAssets: "0.00",
              totalLiabilities: "0.00",
              netWorth: "0.00",
              debtToAssetRatio: null,
              assetBreakdown: [],
              liabilityBreakdown: [],
            },
            whereMoneyStands: {
              cash: "0.00",
              investments: "0.00",
              receivables: "0.00",
              loans: "0.00",
              creditCards: "0.00",
              payables: "0.00",
            },
            month: {
              month: "2026-11",
              income: "0.00",
              expenses: "0.00",
              invested: "0.00",
              cashFlow: "0.00",
            },
            history: [],
            upcoming: [],
            priceFreshness: [],
          },
        },
      });
    } else {
      await route.fulfill({ json: { data: {} } });
    }
  });

  await page.goto("/expenses");
  await expect(page.getByRole("heading", { name: "Expenses" }).first()).toBeVisible();
  await expect(page.getByText("Main bank", { exact: false })).toBeVisible();
  offline = true;
  await context.setOffline(true);
  await page.getByRole("button", { name: "+ Add expense" }).click();
  await page.getByLabel("Summary").fill("Offline train ticket");
  await page.getByLabel("Amount").fill("240.00");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Offline train ticket").first()).toBeVisible();
  await expect(
    page.locator('.sync-badge[aria-label="Offline, 1 pending"]:visible'),
  ).toBeVisible();

  offline = false;
  await context.setOffline(false);
  await expect.poll(() => queuedWrites.length).toBe(1);
  await expect(
    page.locator('.sync-badge[aria-label="Synced, zero pending"]:visible'),
  ).toBeVisible();
  await expect(page.getByText("Offline train ticket").first()).toBeVisible();
  expect(queuedWrites[0]?.clientId).toMatch(/^[0-9a-f-]{36}$/i);
});
