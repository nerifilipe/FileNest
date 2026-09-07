import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const dataDirectory = resolve("..", "tmp", `e2e-${Date.now()}`);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5174", channel: "msedge", headless: true },
  webServer: [
    {
      command: `"${process.platform === "win32" ? "..\\.venv\\Scripts\\python.exe" : "../.venv/bin/python"}" -m uvicorn backend.main:app --app-dir .. --host 127.0.0.1 --port 8001`,
      url: "http://127.0.0.1:8001/api/health",
      env: {
        FILENEST_DATA_DIR: dataDirectory,
        FILENEST_FRONTEND_ORIGIN: "http://127.0.0.1:5174",
      },
      reuseExistingServer: false,
    },
    {
      command: "npx vite --config vite.test.config.mjs",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
    },
  ],
});
