import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5173",
    serviceWorkers: "block",
  },
  ...(process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1"
    ? {}
    : {
        webServer: {
          command:
            "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
});
