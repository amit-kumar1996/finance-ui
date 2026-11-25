import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider.js";
import { BackupSettings } from "./BackupSettings.js";

describe("backup settings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows encrypted history and reports a successful integrity check", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith("/auth/session")
        ? {
            userId: "owner",
            csrfToken: "csrf-test",
            expiresAt: "2026-11-25T00:00:00.000Z",
            recoveryOnly: false,
          }
        : url.endsWith("/backups")
          ? {
              backups: [
                {
                  id: "20261125T120000Z-1234abcd",
                  createdAt: "2026-11-25T12:00:00.000Z",
                  fileName: "20261125T120000Z-1234abcd.sql.age",
                  sizeBytes: 1024,
                  sha256: "a".repeat(64),
                  encryption: "age",
                  offsite: "copied",
                },
              ],
            }
          : {
              id: "20261125T120000Z-1234abcd",
              valid: true,
              checkedAt: "2026-11-25T12:01:00.000Z",
            };
      return { ok: true, json: async () => ({ data }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <BackupSettings />
      </AuthProvider>,
    );
    expect(
      await screen.findByText(
        "20261125T120000Z-1234abcd.sql.age · 1 KB · Off-site copy complete",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check integrity" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "Integrity check passed",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/backups/20261125T120000Z-1234abcd/verify"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
