const { test, expect } = require("@playwright/test");

const {
  runA11yTwoPass,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
  summarizeViolations,
} = require("./helpers/a11y");

test("SHOP a11y (Phase 3)", async ({ page }, testInfo) => {
  // 1) Open page + wait until real content appears
  await page.goto("/shop", { waitUntil: "domcontentloaded" });

  // Wait for product cards (shop is async loaded)
  const cards = page.locator(".product-card");
  await expect(cards.first()).toBeVisible({ timeout: 15000 });

  // Fonts ready (avoids random contrast/layout differences)
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  await page.waitForTimeout(1500);

  // Screenshot evidence
  await page.screenshot({
    path: `test-results/a11y/${testInfo.title}.png`,
    fullPage: true,
  });

  // 2) Run 2-pass scan (Gate + Audit)
  const { resultsGate, resultsAudit, blocking, backlog, promoted } =
    await runA11yTwoPass(page);

  // 3) Save artifacts separately
  const gateArtifacts = writeA11yArtifacts({
    testName: `${testInfo.title}__gate`,
    results: resultsGate,
    mode: "gate",
    gateBlockers: blocking,
  });

  writeA11yArtifacts({
    testName: `${testInfo.title}__audit`,
    results: resultsAudit,
    mode: "audit",
    promoted,
  });

  // 4) Console output
  if (blocking.length) {
    console.log("❌ SHOP blockers found.");
    console.log(`Gate report: ${gateArtifacts.prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ SHOP: no gate blockers.");
  }

  // 5) Backlog export (audit-only)
  if (backlog.length) {
    const { backlogPath } = appendToMinorBacklog({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    const { mdPath } = appendToMinorBacklogMarkdown({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    console.log("ℹ️ SHOP: minor backlog saved:", backlogPath);
    console.log("ℹ️ SHOP: minor backlog md:", mdPath);
    console.table(summarizeViolations(backlog));
  }

  // 6) Gate condition
  expect(blocking).toEqual([]);
});
