const { test, expect } = require("@playwright/test");

const {
  runA11yTwoPass,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
  summarizeViolations,
} = require("./helpers/a11y");

test("HOME a11y (Phase 3)", async ({ page }, testInfo) => {
  // 1) Open page + minimal “ready” checks
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("nav")).toBeVisible();
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(150);

  // Screenshot for thesis evidence
  await page.screenshot({
    path: `test-results/a11y/${testInfo.title}.png`,
    fullPage: true,
  });

  // 2) Run 2-pass scan
  const { resultsGate, resultsAudit, blocking, backlog } =
    await runA11yTwoPass(page);

  // 3) Save artifacts (gate + audit separately)
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

  // 4) Console output (helpful in CI logs)
  if (blocking.length) {
    console.log("❌ HOME blockers found.");
    console.log(`Gate report: ${gateArtifacts.prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ HOME: no gate blockers.");
  }

  if (backlog.length) {
    const { backlogPath } = appendToMinorBacklog({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    const { mdPath } = appendToMinorBacklogMarkdown({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    console.log("ℹ️ HOME: minor backlog saved:", backlogPath);
    console.log("ℹ️ HOME: minor backlog md:", mdPath);
    console.table(summarizeViolations(backlog));
  }

  // 5) Gate condition
  expect(blocking).toEqual([]);
});
