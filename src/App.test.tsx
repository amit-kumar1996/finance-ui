import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import App from "./App.js";

describe("app navigation shell", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/auth/session")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                userId: "local-user",
                csrfToken: "csrf-test",
                expiresAt: "2026-11-25T00:00:00.000Z",
                recoveryOnly: false,
              },
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            data: {
              asOfDate: "2026-11-25",
              position: {
                asOfDate: "2026-11-25",
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
          }),
        } as Response;
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders the desktop navigation and sync status after restoring a session", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Main navigation" })).toBeTruthy();
    expect(screen.getAllByLabelText("Synced, zero pending").length).toBeGreaterThan(0);
  });

  it("opens the mobile More menu", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    expect(screen.getByRole("navigation", { name: "More pages" })).toBeTruthy();
    expect(
      within(screen.getByRole("navigation", { name: "More pages" })).getByRole("link", {
        name: "Loans & EMI",
      }),
    ).toBeTruthy();
  });

  it("switches between light and dark themes", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open user menu" }));
    fireEvent.click(screen.getByRole("button", { name: /Dark mode/ }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("shows the signed-in account and closes the user menu on outside click", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open user menu" }));
    expect(screen.getByRole("dialog", { name: "User menu" })).toBeTruthy();
    expect(screen.getByText("Account owner")).toBeTruthy();
    expect(screen.getByText("local-user")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "User menu" })).toBeNull();
  });

  it("closes the user menu with Escape", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open user menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "User menu" })).toBeNull();
  });

  it("logs out from the user menu", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open user menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(
      await screen.findByRole("button", { name: "Continue with passkey" }),
    ).toBeTruthy();
  });

  it("shows passkey sign-in and one-time setup when there is no session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Sign in with a passkey to continue." } }),
      }),
    );
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("button", { name: "Continue with passkey" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set up the first passkey" }));
    expect(screen.getByLabelText("One-time setup token")).toBeTruthy();
  });
});
