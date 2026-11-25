import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage.js";
import { NetWorthPage } from "./NetWorthPage.js";
import { ReportsPage } from "./ReportsPage.js";

const position = {
  asOfDate: "2026-11-25",
  totalAssets: "50000.00",
  totalLiabilities: "50000.00",
  netWorth: "0.00",
  debtToAssetRatio: "100.0",
  assetBreakdown: [
    { id: "cash", label: "Bank, cash and UPI", bucket: "cash", value: "50000.00" },
  ],
  liabilityBreakdown: [
    { id: "loan", label: "Personal loan", bucket: "loan", value: "50000.00" },
  ],
};
const month = {
  month: "2026-11",
  income: "120000.00",
  expenses: "12750.00",
  invested: "25000.00",
  cashFlow: "82250.00",
};
const dashboard = {
  asOfDate: "2026-11-25",
  position,
  whereMoneyStands: {
    cash: "50000.00",
    investments: "0.00",
    receivables: "0.00",
    loans: "50000.00",
    creditCards: "0.00",
    payables: "0.00",
  },
  month,
  history: [
    { date: "2026-11-25", assets: "50000.00", liabilities: "50000.00", netWorth: "0.00" },
  ],
  upcoming: [],
  priceFreshness: [],
};
const reports = {
  year: 2026,
  asOfDate: "2026-11-25",
  position,
  monthly: [month],
  history: [
    { date: "2026-11-25", assets: "50000.00", liabilities: "50000.00", netWorth: "0.00" },
  ],
};

const stubApi = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith("/dashboard")
        ? dashboard
        : url.endsWith("/net-worth")
          ? {
              position,
              changeThisMonth: null,
              history: reports.history,
              priceFreshness: [],
            }
          : reports;
      return { ok: true, status: 200, json: async () => ({ data }) } as Response;
    }),
  );

describe("dashboard, net worth and reports", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the read-only dashboard from ledger-derived API values", async () => {
    stubApi();
    render(<DashboardPage />);
    expect(await screen.findByText("Net worth, last 6 months (₹)")).toBeTruthy();
    expect(screen.getByText("Bank, cash and UPI")).toBeTruthy();
    expect(screen.getByText("+₹82,250.00")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows assets, liabilities and change without creating invented values", async () => {
    stubApi();
    render(<NetWorthPage />);
    expect(await screen.findByRole("heading", { name: "Assets" })).toBeTruthy();
    expect(screen.getAllByText("₹50,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Personal loan")).toBeTruthy();
  });

  it("exports the selected report as CSV and opens the browser PDF print flow", async () => {
    stubApi();
    const createObjectUrl = vi.fn((_blob: Blob) => "blob:test");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<ReportsPage />);
    expect(
      await screen.findByRole("heading", { name: /Monthly expenses · 2026/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toContain("text/csv");
    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(print).toHaveBeenCalledOnce();
  });
});
