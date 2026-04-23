import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    env: {
      BACKEND_API_URL: process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000",
      OPERATOR_API_KEY: process.env.OPERATOR_API_KEY ?? "dev-operator-api-key",
    },
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://127.0.0.1:3000/dashboard",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
