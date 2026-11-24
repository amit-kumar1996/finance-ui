import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import App from "./App.js";

describe("app navigation shell", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            userId: "local-user",
            csrfToken: "csrf-test",
            expiresAt: "2026-11-25T00:00:00.000Z",
            recoveryOnly: false,
          },
        }),
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

    fireEvent.click(await screen.findByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
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
