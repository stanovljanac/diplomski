const { test, expect } = require("@playwright/test");

const {
  runA11yScan,
  splitByImpact,
  summarizeViolations,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
} = require("./helpers/a11y");

test("SHOP a11y (Phase 3 fail)", async ({ page }, testInfo) => {
  await page.goto("/shop", { waitUntil: "domcontentloaded" });
  const cards = page.locator(".product-card");
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `test-results/a11y/${testInfo.title}.png`,
    fullPage: true,
  });

  const results = await runA11yScan(page, {
    tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
    disableRules: [],
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

  // --- BLOCKERS (fail) ---
  if (blocking.length) {
    console.log(`❌ SHOP blockers found. See: ${prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ No blockers on SHOP.");
  }

  // --- MINOR BACKLOG (log only) ---
  if (backlog.length) {
    console.log("ℹ️ SHOP minor issues found → writing backlog.");

    const { backlogPath } = appendToMinorBacklog({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    const { mdPath } = appendToMinorBacklogMarkdown({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    console.log("Minor backlog JSON:", backlogPath);
    console.log("Minor backlog Markdown:", mdPath);

    console.table(summarizeViolations(backlog));
  } else {
    console.log(`ℹ️ No minor issues on SHOP. Summary: ${summaryPath}`);
  }

  expect(blocking).toEqual([]);
});
