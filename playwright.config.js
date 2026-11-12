const { defineConfig } = require("@playwright/test");

const ci = !!process.env.CI;

module.exports = defineConfig({
  testDir: "./Mckinsey JCI Suites",
  timeout: 120000,
  ...(ci ? { workers: 1 } : {}),
  reporter: ci ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    headless: ci,
    viewport: { width: 1280, height: 860 },
    launchOptions: ci ? {} : { slowMo: 200 },
    screenshot: ci ? "only-on-failure" : "off",
    trace: ci ? "retain-on-failure" : "off",
  },
});
