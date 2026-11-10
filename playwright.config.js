const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./suites",
  timeout: 120000,
  reporter: [["list"]],
  use: {
    headless: false,
    viewport: { width: 1280, height: 860 },
    launchOptions: { slowMo: 200 },
  },
});
