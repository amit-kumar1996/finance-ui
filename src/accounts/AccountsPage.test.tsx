import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { AccountsPage } from "./AccountsPage.js";

const currentSession = {
  data: {
    userId: "local-user",
    csrfToken: "csrf-test",
    expiresAt: "2026-11-25T00:00:00.000Z",
    recoveryOnly: false,
  },
};

describe("Accounts page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a credit card with an opening liability and sends CSRF and idempotency headers", async () => {
    const account = {
      id: "card-1",
      name: "Travel card",
      accountType: "CREDIT_CARD",
      institutionName: "Example Bank",
      balance: "10000.00",
      createdAt: "2026-11-24T00:00:00.000Z",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/session")) {
        return { ok: true, status: 200, json: async () => currentSession } as Response;
      }
      if (url.endsWith("/accounts") && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ data: { account } }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { accounts: fetchMock.mock.calls.length > 2 ? [account] : [] },
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter>
          <AccountsPage />
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "+ Add account" }));
    fireEvent.change(screen.getByLabelText("Account name"), {
      target: { value: "Travel card" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "CREDIT_CARD" },
    });
    fireEvent.change(screen.getByLabelText(/Bank or provider name/), {
      target: { value: "Example Bank" },
    });
    fireEvent.change(screen.getByDisplayValue("0.00"), {
      target: { value: "10000.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));

    expect((await screen.findAllByText("Owed ₹10,000.00")).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/api/v1/accounts") && init?.method !== "POST",
        ),
      ).toBe(true);
      const request = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/api/v1/accounts") && init?.method === "POST",
      );
      expect(request).toBeDefined();
      const headers = new Headers(request?.[1]?.headers);
      expect(headers.get("X-CSRF-Token")).toBe("csrf-test");
      expect(headers.get("Idempotency-Key")).toMatch(/^[\w-]+$/);
    });
  });
});
