import { afterEach, describe, expect, it, vi } from "vitest";
import { listLoanAccounts, listLoans } from "./api.js";

describe("loan API routes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the versioned loan and account endpoints", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(JSON.stringify({ data: { loans: [], accounts: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listLoans();
    await listLoanAccounts();

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:3000/api/v1/loans",
      "http://localhost:3000/api/v1/accounts",
    ]);
  });
});
