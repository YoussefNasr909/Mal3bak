import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const frontendPort = Number(process.env.PLAYWRIGHT_FRONTEND_PORT || 3000);
const backendPort = Number(process.env.PLAYWRIGHT_BACKEND_PORT || 4000);
const frontendHost = process.env.PLAYWRIGHT_FRONTEND_HOST || "127.0.0.1";
const backendHost = process.env.PLAYWRIGHT_BACKEND_HOST || "127.0.0.1";
const frontendRoot = process.cwd();
const workspaceRoot = path.resolve(frontendRoot, "..");
const backendRoot = process.env.PLAYWRIGHT_BACKEND_DIR
  ? path.resolve(process.env.PLAYWRIGHT_BACKEND_DIR)
  : path.join(workspaceRoot, "mal3abi-backend");
const backendStartCommand = process.env.PLAYWRIGHT_BACKEND_START || "node scripts/start-e2e.mjs";
const frontendStartCommand =
  process.env.PLAYWRIGHT_FRONTEND_START || `npm run dev -- --hostname ${frontendHost} --port ${frontendPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING === "true";
const frontendBaseUrl = `http://${frontendHost}:${frontendPort}`;
const backendBaseUrl = `http://${backendHost}:${backendPort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 180_000,
  workers: 1,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/playwright-results.json" }]],
  use: {
    baseURL: frontendBaseUrl,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1080 },
      },
    },
  ],
  webServer: [
    {
      command: backendStartCommand,
      cwd: backendRoot,
      url: `${backendBaseUrl}/health`,
      reuseExistingServer,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      command: frontendStartCommand,
      cwd: frontendRoot,
      url: `${frontendBaseUrl}/auth/login`,
      reuseExistingServer,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
  ],
});
