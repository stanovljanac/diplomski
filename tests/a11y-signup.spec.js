const { test, expect } = require("@playwright/test");

const {
  runA11yTwoPass,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
  summarizeViolations,
} = require("./helpers/a11y");

test("SIGNUP a11y (Phase 3)", async ({ page }, testInfo) => {
  // 1) Open page + minimal ready check
  await page.goto("/signup", { waitUntil: "domcontentloaded" });

  await expect(page.locator("nav")).toBeVisible();
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(150);

  // Screenshot evidence
  await page.screenshot({
    path: `test-results/a11y/${testInfo.title}.png`,
    fullPage: true,
  });

  // 2) Run 2-pass scan
  const { resultsGate, resultsAudit, blocking, backlog } =
    await runA11yTwoPass(page);

  // 3) Save artifacts
  const gateArtifacts = writeA11yArtifacts({
    testName: `${testInfo.title}__gate`,
    results: resultsGate,
    mode: "gate",
  });

  writeA11yArtifacts({
    testName: `${testInfo.title}__audit`,
    results: resultsAudit,
    mode: "audit",
    // promotedRuleIds: [] // za kasnije
  });

  // 4) Output
  if (blocking.length) {
    console.log("❌ SIGNUP blockers found.");
    console.log(`Gate report: ${gateArtifacts.prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ SIGNUP: no gate blockers.");
  }

  // 5) Backlog export
  if (backlog.length) {
    const { backlogPath } = appendToMinorBacklog({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    const { mdPath } = appendToMinorBacklogMarkdown({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    console.log("ℹ️ SIGNUP: minor backlog saved:", backlogPath);
    console.log("ℹ️ SIGNUP: minor backlog md:", mdPath);
    console.table(summarizeViolations(backlog));
  }

  // 6) Gate condition
  expect(blocking).toEqual([]);
});
