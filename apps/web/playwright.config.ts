import { defineConfig } from "@playwright/test";

const webServers = process.env.PW_SKIP_WEBSERVER
  ? undefined
  : [
      {
        command: "pnpm dev",
        cwd: "apps/api",
        url: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          SMTP_DISABLE: "true",
        },
      },
      {
        command: "pnpm dev",
        cwd: "apps/web",
        url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
    ];

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: webServers,
});
