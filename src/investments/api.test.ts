import { afterEach, describe, expect, it, vi } from "vitest";
import { listInvestmentAccounts, listInvestments } from "./api.js";

describe("investment API routes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the versioned investment and account endpoints", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(
          JSON.stringify({
            data: { investments: [], mutualFundXirr: null, accounts: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listInvestments();
    await listInvestmentAccounts();

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:3000/api/v1/investments",
      "http://localhost:3000/api/v1/accounts",
    ]);
  });
});
