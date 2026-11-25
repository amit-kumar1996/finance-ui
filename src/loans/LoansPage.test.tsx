import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { LoansPage } from "./LoansPage.js";

const session = {
  data: {
    userId: "user-1",
    csrfToken: "csrf",
    expiresAt: "2026-11-25T00:00:00.000Z",
    recoveryOnly: false,
  },
};
const loan = {
  id: "loan-1",
  name: "Home loan",
  provider: "SBI",
  principal: "500000.00",
  annualRate: "8.5000",
  termMonths: 120,
  emiAmount: "6192.00",
  dueDay: 5,
  startDate: "2024-01-05",
  status: "ACTIVE" as const,
  outstanding: "400000.00",
  paymentCount: 12,
  nextDueDate: "2025-01-05",
  schedule: Array.from({ length: 13 }, (_, index) => ({
    dueDate: `2025-01-${String(index + 5).padStart(2, "0")}`,
    emiAmount: "6192.00",
    principalAmount: "3358.67",
    interestAmount: "2833.33",
    closingBalance: "396641.33",
  })),
};

const renderPage = () =>
  render(
    <AuthProvider>
      <MemoryRouter>
        <LoansPage />
      </MemoryRouter>
    </AuthProvider>,
  );

describe("Loans page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows real loan totals and offers partial or complete EMI recording", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/session"))
        return { ok: true, status: 200, json: async () => session } as Response;
      if (url.endsWith("/loans"))
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { loans: [loan] } }),
        } as Response;
      if (url.endsWith("/accounts"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              accounts: [
                {
                  id: "bank-1",
                  name: "Main bank",
                  accountType: "BANK",
                  balance: "100000.00",
                },
              ],
            },
          }),
        } as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Home loan · EMI schedule")).toBeTruthy();
    expect(screen.getAllByText("₹4,00,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2025-01-05").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Show full schedule (13 installments)" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Show next 12 installments" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(
      await screen.findByLabelText(/This payment completes the scheduled EMI/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Principal")).toBeTruthy();
    expect(screen.getByLabelText("Interest")).toBeTruthy();
  });
});
