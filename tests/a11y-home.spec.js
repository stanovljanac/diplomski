const { test, expect } = require("@playwright/test");

const {
  createA11yRun,
  scanCheckpoint,
  finalizeA11yRun,
} = require("./helpers/a11y");

test("HOME a11y (Phase 3)", async ({ page }, testInfo) => {
  // 1️⃣ Init aggregated run
  const a11yRun = createA11yRun({
    testName: testInfo.title,
  });

  // 2️⃣ Open page
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("nav")).toBeVisible();

  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  await page.waitForTimeout(1000);

  // 3️⃣ Scan checkpoint
  await scanCheckpoint(page, a11yRun, "home_initial", {
    screenshot: true,
    testInfo,
  });

  // 4️⃣ Finalize run (writes gate + audit + backlog)
  const { blockingAll } = finalizeA11yRun(a11yRun);

  // 5️⃣ Gate assertion
  expect(blockingAll).toEqual([]);
});
