import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import App from "./App.js";

describe("app navigation shell", () => {
  it("renders the desktop navigation and sync status", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Main navigation" })).toBeTruthy();
    expect(screen.getAllByLabelText("Synced, zero pending").length).toBeGreaterThan(0);
  });

  it("opens the mobile More menu", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("navigation", { name: "More pages" })).toBeTruthy();
    expect(
      within(screen.getByRole("navigation", { name: "More pages" })).getByRole("link", {
        name: "Loans & EMI",
      }),
    ).toBeTruthy();
  });

  it("switches between light and dark themes", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
