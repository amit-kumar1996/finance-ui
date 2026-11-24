import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider.js";
import { ExpensesPage } from "./ExpensesPage.js";

const sessionPayload = {
  data: {
    userId: "local-user",
    csrfToken: "csrf-test",
    expiresAt: "2026-11-25T00:00:00.000Z",
    recoveryOnly: false,
  },
};

const expense = {
  id: "expense-1",
  effectiveDate: "2024-02-29",
  description: "Market groceries",
  amount: "1000.00",
  accountId: "bank-1",
  accountName: "Main bank",
};

const summary = {
  date: "2024-02-29",
  daily: {
    period: "2024-02-29",
    total: "1000.00",
    previousTotal: "0.00",
    difference: "1000.00",
  },
  monthly: {
    period: "2024-02",
    total: "1000.00",
    previousPeriod: "2024-01",
    previousTotal: "0.00",
    difference: "1000.00",
  },
  yearly: {
    period: "2024",
    total: "1000.00",
    previousPeriod: "2023",
    previousTotal: "0.00",
    difference: "1000.00",
  },
};

const renderPage = () =>
  render(
    <AuthProvider>
      <MemoryRouter>
        <ExpensesPage />
      </MemoryRouter>
    </AuthProvider>,
  );

describe("Expenses page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the entry form to Date, Summary, Amount and posts no account field", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("/auth/session")) {
        return { ok: true, status: 200, json: async () => sessionPayload } as Response;
      }
      if (url.includes("/expenses/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { summary } }),
        } as Response;
      }
      if (url.endsWith("/preferences/default-expense-account")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { account: { id: "bank-1", name: "Main bank" } } }),
        } as Response;
      }
      if (url.endsWith("/expenses") && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ data: { transaction: { id: expense.id } } }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { expenses: [] } }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "+ Add expense" }));
    const form = container.querySelector(".expense-form");
    expect(form).not.toBeNull();
    expect(form?.querySelectorAll("input")).toHaveLength(3);
    expect(within(form as HTMLElement).getByLabelText("Date")).toBeTruthy();
    expect(within(form as HTMLElement).getByLabelText("Summary")).toBeTruthy();
    expect(within(form as HTMLElement).getByLabelText("Amount")).toBeTruthy();
    expect(within(form as HTMLElement).queryByLabelText(/Account/)).toBeNull();

    fireEvent.change(within(form as HTMLElement).getByLabelText("Date"), {
      target: { value: "2024-02-29" },
    });
    fireEvent.change(within(form as HTMLElement).getByLabelText("Summary"), {
      target: { value: "Market groceries" },
    });
    fireEvent.change(within(form as HTMLElement).getByLabelText("Amount"), {
      target: { value: "1000.00" },
    });
    fireEvent.click(
      within(form as HTMLElement).getByRole("button", { name: "Save expense" }),
    );

    await waitFor(() => {
      const request = calls.find(
        ({ url, init }) => url.endsWith("/expenses") && init?.method === "POST",
      );
      expect(request).toBeDefined();
      expect(JSON.parse(String(request?.init?.body))).toEqual({
        effectiveDate: "2024-02-29",
        description: "Market groceries",
        amount: "1000.00",
      });
      const headers = new Headers(request?.init?.headers);
      expect(headers.get("X-CSRF-Token")).toBe("csrf-test");
      expect(headers.get("Idempotency-Key")).toMatch(/^[\w-]+$/);
    });
  });

  it("asks for confirmation and sends a delete request for reversal", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("/auth/session")) {
        return { ok: true, status: 200, json: async () => sessionPayload } as Response;
      }
      if (url.includes("/expenses/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { summary } }),
        } as Response;
      }
      if (url.endsWith("/preferences/default-expense-account")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { account: { id: "bank-1", name: "Main bank" } } }),
        } as Response;
      }
      if (url.endsWith("/expenses/expense-1") && init?.method === "DELETE") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { transaction: { id: "reverse-1" } } }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { expenses: [expense] } }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("retained in the ledger"),
    );
    await waitFor(() => {
      const request = calls.find(
        ({ url, init }) =>
          url.endsWith("/expenses/expense-1") && init?.method === "DELETE",
      );
      expect(request).toBeDefined();
      expect(new Headers(request?.init?.headers).get("X-CSRF-Token")).toBe("csrf-test");
      expect(new Headers(request?.init?.headers).get("Idempotency-Key")).toMatch(
        /^[\w-]+$/,
      );
    });
  });

  it("edits a posted expense through a three-field replacement request", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("/auth/session")) {
        return { ok: true, status: 200, json: async () => sessionPayload } as Response;
      }
      if (url.includes("/expenses/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { summary } }),
        } as Response;
      }
      if (url.endsWith("/preferences/default-expense-account")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { account: { id: "bank-1", name: "Main bank" } } }),
        } as Response;
      }
      if (url.endsWith("/expenses/expense-1") && init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              transaction: { id: "replacement-1" },
              reversal: { id: "reversal-1" },
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { expenses: [expense] } }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "Updated groceries" },
    });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1250.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const request = calls.find(
        ({ url, init }) =>
          url.endsWith("/expenses/expense-1") && init?.method === "PATCH",
      );
      expect(request).toBeDefined();
      expect(JSON.parse(String(request?.init?.body))).toEqual({
        effectiveDate: "2024-02-29",
        description: "Updated groceries",
        amount: "1250.00",
      });
      expect(new Headers(request?.init?.headers).get("Idempotency-Key")).toMatch(
        /^[\w-]+$/,
      );
    });
  });
});
