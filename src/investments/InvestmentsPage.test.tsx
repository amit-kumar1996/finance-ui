import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { InvestmentsPage } from "./InvestmentsPage.js";

const session = {
  data: {
    userId: "user-1",
    csrfToken: "csrf",
    expiresAt: "2026-11-25T00:00:00.000Z",
    recoveryOnly: false,
  },
};
const investment = {
  id: "fund-1",
  investmentType: "MUTUAL_FUND",
  name: "Index fund",
  provider: "Example AMC",
  symbol: "100001",
  annualRate: null,
  maturityDate: null,
  units: "100.00000000",
  invested: "10000.00",
  currentValue: "11000.00",
  realizedPl: "0.00",
  unrealizedPl: "1000.00",
  xirr: "10.00",
  price: "110.00000000",
  priceSource: "AMFI",
  priceDate: "2026-11-24",
  stale: false,
  activities: [],
};

describe("Investments page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows API holdings, XIRR and market data freshness in the overview", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/session"))
        return { ok: true, status: 200, json: async () => session } as Response;
      if (url.endsWith("/investments"))
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { investments: [investment] } }),
        } as Response;
      if (url.endsWith("/accounts"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              accounts: [{ id: "bank-1", name: "Main bank", accountType: "BANK" }],
            },
          }),
        } as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <MemoryRouter>
          <InvestmentsPage />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText("Market investments")).toBeTruthy();
    expect(screen.getAllByText("₹11,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText("10.00%")).toBeTruthy();
    expect(screen.getByText("AMFI closing NAV · 2026-11-24")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mutual funds" }));
    expect(screen.getByRole("heading", { name: "Mutual funds" })).toBeTruthy();
  });
});
