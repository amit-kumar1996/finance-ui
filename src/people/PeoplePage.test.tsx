import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { PeoplePage } from "./PeoplePage.js";

const sessionPayload = {
  data: {
    userId: "local-user",
    csrfToken: "csrf-test",
    expiresAt: "2026-11-25T00:00:00.000Z",
    recoveryOnly: false,
  },
};

const alex = {
  id: "person-1",
  name: "Alex",
  notes: null,
  createdAt: "2026-11-24T00:00:00.000Z",
  givenTotal: "10000.00",
  receivedTotal: "2000.00",
  borrowedTotal: "0.00",
  repaidTotal: "0.00",
  receivableBalance: "8000.00",
  payableBalance: "0.00",
  netBalance: "8000.00",
  type: "Given",
  givenOrBorrowed: "10000.00",
  receivedOrRepaid: "2000.00",
};

describe("People page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the five-column statement and posts the single Add transaction form", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("/auth/session")) {
        return { ok: true, status: 200, json: async () => sessionPayload } as Response;
      }
      if (url.endsWith("/people/transactions")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ data: { person: alex, transaction: { id: "tx-1" } } }),
        } as Response;
      }
      if (url.endsWith("/people")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { people: [alex] } }),
        } as Response;
      }
      if (url.endsWith("/accounts")) {
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
                  institutionName: null,
                  balance: "10000.00",
                  createdAt: "2026-11-24T00:00:00.000Z",
                },
              ],
            },
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "Not found" } }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter>
          <PeoplePage />
        </MemoryRouter>
      </AuthProvider>,
    );

    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual([
      "Name",
      "Type (Given/Borrowed)",
      "Given or Borrowed",
      "Received or Repaid",
      "Balance",
    ]);
    expect(screen.getAllByRole("button", { name: "+ Add transaction" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Alex" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+ Add transaction" }));
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "GIVE" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10000.00" } });
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "bank-1" } });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Short loan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() => {
      const request = calls.find(
        ({ url, init }) =>
          url.endsWith("/people/transactions") && init?.method === "POST",
      );
      expect(request).toBeDefined();
      expect(JSON.parse(String(request?.init?.body))).toMatchObject({
        movement: "GIVE",
        personId: "person-1",
        amount: "10000.00",
        accountId: "bank-1",
        note: "Short loan",
      });
      const headers = new Headers(request?.init?.headers);
      expect(headers.get("X-CSRF-Token")).toBe("csrf-test");
      expect(headers.get("Idempotency-Key")).toMatch(/^[\w-]+$/);
    });
  });
});
