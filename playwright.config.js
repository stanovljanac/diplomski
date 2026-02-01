const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    headless: !!process.env.CI, // CI = true, lokalno = false
  },
  reporter: [["html", { open: "never" }]],
});
