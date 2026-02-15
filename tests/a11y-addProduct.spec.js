const { test, expect } = require("@playwright/test");

const {
  createA11yRun,
  scanCheckpoint,
  finalizeA11yRun,
} = require("./helpers/a11y");

test("ADMIN ADD a11y (Phase 3)", async ({ page }, testInfo) => {
  // ===============================
  // 1️⃣ INIT AGGREGATED RUN
  // ===============================
  const a11yRun = createA11yRun({
    testName: testInfo.title,
  });

  // ===============================
  // 2️⃣ LOGIN
  // ===============================
  await page.goto("/signin", { waitUntil: "domcontentloaded" });

  const email = process.env.PW_ADMIN_EMAIL;
  const pass = process.env.PW_ADMIN_PASSWORD;

  if (!email || !pass) {
    throw new Error(
      "Missing PW_ADMIN_EMAIL / PW_ADMIN_PASSWORD. Load .env or set env vars.",
    );
  }

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(pass);
  await page.getByRole("button", { name: /sign in/i }).click();

  // ===============================
  // 3️⃣ GO TO ADD PRODUCT PAGE
  // ===============================
  await page.goto("/admin/add", { waitUntil: "domcontentloaded" });

  await expect(page.locator("nav")).toBeVisible();

  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  await page.waitForTimeout(1000);

  // ===============================
  // 4️⃣ SCAN CHECKPOINT
  // ===============================
  await scanCheckpoint(page, a11yRun, "admin_add_page", {
    screenshot: true,
    testInfo,
  });

  // ===============================
  // 5️⃣ FINALIZE (writes artifacts + backlog)
  // ===============================
  const { blockingAll } = finalizeA11yRun(a11yRun);

  // ===============================
  // 6️⃣ GATE ASSERTION
  // ===============================
  expect(blockingAll).toEqual([]);
});
