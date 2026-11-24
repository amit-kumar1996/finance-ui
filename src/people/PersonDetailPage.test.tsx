import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { PersonDetailPage } from "./PersonDetailPage.js";

const sessionPayload = {
  data: {
    userId: "local-user",
    csrfToken: "csrf-test",
    expiresAt: "2026-11-25T00:00:00.000Z",
    recoveryOnly: false,
  },
};

const statement = {
  person: {
    id: "person-1",
    name: "Alex",
    notes: "Friend",
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
  },
  transactions: [
    {
      id: "tx-1",
      effectiveDate: "2026-11-24",
      description: "GIVE: Alex — Short loan",
      movement: "GIVE",
      amount: "10000.00",
      netEffect: "INCREASED",
      runningNetBalance: "10000.00",
      reversalOfId: null,
    },
  ],
};

describe("Person detail page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the running statement and updates person details", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("/auth/session")) {
        return { ok: true, status: 200, json: async () => sessionPayload } as Response;
      }
      if (url.endsWith("/people/person-1") && init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { person: statement.person } }),
        } as Response;
      }
      if (url.endsWith("/people/person-1/statement")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: statement }),
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
        <MemoryRouter initialEntries={["/people/person-1"]}>
          <Routes>
            <Route path="/people/:personId" element={<PersonDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Alex" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Statement" })).toBeTruthy();
    expect(screen.getByText("GIVE: Alex — Short loan")).toBeTruthy();
    expect(screen.getAllByText("₹10,000.00")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Edit person" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alex Smith" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const request = calls.find(
        ({ url, init }) => url.endsWith("/people/person-1") && init?.method === "PATCH",
      );
      expect(request).toBeDefined();
      expect(JSON.parse(String(request?.init?.body))).toEqual({
        name: "Alex Smith",
        notes: "Friend",
      });
      expect(new Headers(request?.init?.headers).get("Idempotency-Key")).toMatch(
        /^[\w-]+$/,
      );
    });
  });
});
