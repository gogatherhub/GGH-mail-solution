import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env.WELFOG_E2E_DB_URL ||= `file:./.next/ui-e2e-${randomUUID()}.db`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [{command:"node tests/fixtures/smtp-server.mjs",port:3101,reuseExistingServer:false,timeout:15000},{command:"node tests/fixtures/resend-server.mjs",url:"http://127.0.0.1:3102/health",reuseExistingServer:false,timeout:15000},{
    command: "node node_modules/next/dist/bin/next start -p 3100",
    url: "http://localhost:3100/login",
    timeout: 60_000,
    reuseExistingServer: false,
    env: {
      DEMO_MODE: "true",
      DEMO_DATABASE_URL: process.env.WELFOG_E2E_DB_URL,
      ADMIN_USERNAME: "ui_admin",
      ADMIN_PASSWORD: "ui-review-password-1234",
      SESSION_SECRET: "ui-review-isolated-session-secret-123456789",
      TRACKING_SECRET: "ui-review-isolated-tracking-secret-123456789",
      APP_URL: "https://welfog.vercel.app",
      RESEND_API_KEY: "re_isolated_ui_fixture",
      RESEND_BASE_URL: "http://127.0.0.1:3102",
      AWS_REGION: "",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "3101",
      SMTP_USER: "ui-fixture",
      SMTP_PASSWORD: "ui-fixture-password",
      CRON_SECRET: "ui-test-worker-secret-123456789",
      EVENT_WEBHOOK_SECRET: "ui-test-event-secret-123456789",
    },
  }],
});
