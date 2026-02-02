const { test, expect } = require("@playwright/test");
const {
  runA11yScan,
  splitByImpact,
  summarizeViolations,
  writeA11yArtifacts,
} = require("./helpers/a11y");

test("SIGNUP a11y (Phase 3 fail)", async ({ page }, testInfo) => {
  await page.goto("/signup", { waitUntil: "domcontentloaded" });
  await expect(page.locator("nav")).toBeVisible();
  await page.screenshot({
    path: `test-results/a11y/${testInfo.title}.png`,
    fullPage: true,
  });

  const results = await runA11yScan(page, {
    tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
    disableRules: [], // Phase 2: ništa ne gasimo (ni color-contrast)
  });

  const { blocking, backlog } = splitByImpact(results.violations, {
    blockingImpacts: ["critical", "serious", "moderate"],
    backlogImpacts: ["minor"],
  });

  const { summaryPath, prettyPath } = writeA11yArtifacts({
    testName: testInfo.title,
    results,
    writeRaw: false,
  });

  if (blocking.length) {
    console.log(`❌ SIGNUP blockers found. See: ${prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ No blockers on SIGNUP.");
  }

  if (backlog.length) {
    console.log(`ℹ️ SIGNUP minor (backlog). See: ${summaryPath}`);
    console.table(summarizeViolations(backlog));
  }

  expect(blocking).toEqual([]);
});
